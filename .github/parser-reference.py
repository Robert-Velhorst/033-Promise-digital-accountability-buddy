"""Hosted-only reference extraction and metadata verification, never application cases."""
from pathlib import Path
import hashlib
import json
import os
import re
import subprocess
import sys
import tarfile
import time
import urllib.parse
import urllib.request

assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted', 'This validation runs only on disposable GitHub-hosted workers.'
root = Path(os.environ['GITHUB_WORKSPACE'])
reference = root / 'third_party/parser-reference'
manifest = json.loads((reference / 'reference-manifest.json').read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
evidence = Path(os.environ['RUNNER_TEMP']) / 'parser-sdk-evidence'
evidence.mkdir(exist_ok=True)

def extract(sdk, destination, published=False):
    info = manifest['source_and_fixtures'][sdk]
    archive = reference / info['published_archive' if published else 'archive']
    assert sha(archive.read_bytes()) == info['published_archive_sha256' if published else 'archive_sha256']
    destination.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive,'r:gz') as source:
        source.extractall(destination, filter='data')
    actual_root = destination / 'package' if published else destination
    expected = info['published_file_sha256'] if published else info['all_payload_sha256']
    normalized = {p.removeprefix('package/') if published else p:h for p,h in expected.items()}
    observed = {str(p.relative_to(actual_root)):sha(p.read_bytes()) for p in actual_root.rglob('*') if p.is_file()}
    assert observed == normalized
    return actual_root, normalized

mode = sys.argv[1]
if mode == 'references':
    expected = {}
    for sdk in ['parse5','entities']:
        for kind,published in [('source',False),('published',True)]:
            folder = root / '.parser-reference' / kind / sdk
            actual,hashes = extract(sdk,folder,published)
            expected.update({str((actual/p).relative_to(root)):h for p,h in hashes.items()})
    (evidence/'reference-source-sha256.json').write_text(json.dumps(expected,indent=2)+'\n')
    print(json.dumps({'complete_source_fixture_and_published_payloads':len(expected)}))
elif mode == 'installed':
    observed = {}
    for sdk in ['parse5','entities']:
        info = manifest['source_and_fixtures'][sdk]
        expected = {p.removeprefix('package/'):h for p,h in info['published_file_sha256'].items()}
        folder = root / 'app/node_modules' / sdk
        actual = {str(p.relative_to(folder)):sha(p.read_bytes()) for p in folder.rglob('*') if p.is_file()}
        assert actual == expected, sdk
        observed[sdk] = actual
    (evidence/'physical-installed-publisher-files.json').write_text(json.dumps(observed,indent=2)+'\n')
    print(json.dumps({'all_physically_installed_publisher_payloads_verified':sum(len(v) for v in observed.values())}))
elif mode == 'prepare':
    sdk = sys.argv[2]
    folder = Path(os.environ['RUNNER_TEMP']) / ('parser-sdk-'+sdk)
    actual, hashes = extract(sdk,folder)
    subprocess.run(['git','init',str(actual)],check=True)
    changes = manifest['ordinary_external_declaration_overlays'][sdk]
    for path,fields in changes.items():
        target = actual/path
        value = json.loads(target.read_text())
        for kind,dependencies in fields.items():
            for name,version in dependencies.items():
                assert name in value[kind]
                value[kind][name] = version
        target.write_text(json.dumps(value,indent=4)+'\n')
    state = {'sdk':sdk,'folder':str(actual),'original_sha256':hashes,'changed_manifest_paths':sorted(changes),
             'all_original_source_scripts_cases_helpers_fixtures_and_configs_retained':True,
             'no_override_or_prerelease_added':True}
    (evidence/(sdk+'-prepared-source.json')).write_text(json.dumps(state,indent=2)+'\n')
    with open(os.environ['GITHUB_OUTPUT'],'a') as output:
        output.write('source='+str(actual)+'\n')
elif mode == 'verify':
    sdk = sys.argv[2]
    state = json.loads((evidence/(sdk+'-prepared-source.json')).read_text())
    folder = Path(state['folder'])
    protected = {p:h for p,h in state['original_sha256'].items() if p not in state['changed_manifest_paths'] and p!='package-lock.json'}
    assert all(sha((folder/p).read_bytes())==h for p,h in protected.items())
    cases = {p:h for p,h in protected.items() if re.search(r'\.(?:test|spec)\.(?:[cm]?js|[cm]?ts)$',p)}
    assert cases
    record = {'sdk':sdk,'immutable_original_source_payloads_verified':len(protected),'all_original_cases':cases,
              'case_file_count':len(cases),'original_cases_helpers_fixtures_and_configs_unchanged':True,
              'complete_SDK_qualified':False}
    (evidence/(sdk+'-original-source-preservation.json')).write_text(json.dumps(record,indent=2)+'\n')
    for path in ['package.json','package-lock.json']:
        if (folder/path).exists(): (evidence/(sdk+'-'+path)).write_bytes((folder/path).read_bytes())
    print(json.dumps({k:v for k,v in record.items() if k!='all_original_cases'}))
elif mode == 'catalog':
    sdk = sys.argv[2]
    folder = Path(os.environ['RUNNER_TEMP']) / ('parser-sdk-'+sdk)
    lock = json.loads((folder/'package-lock.json').read_text())
    entries=[]
    for path,item in lock['packages'].items():
        if not path or item.get('link') or 'node_modules/' not in path: continue
        name = path.rsplit('node_modules/',1)[1]
        if not name or '/node_modules/' in name: continue
        entries.append({'path':path,'name':name,'version':item['version']})
    latest={}
    errors={}
    for name in sorted({r['name'] for r in entries}):
        try:
            with urllib.request.urlopen('https://registry.npmjs.org/'+urllib.parse.quote(name,safe='')+'/latest',timeout=30) as response:
                raw=response.read()
            value=json.loads(raw)
            assert value['name']==name
            latest[name]={'version':value['version'],'metadata_sha256':sha(raw)}
        except Exception as error: errors[name]=str(error)
        time.sleep(0.2)
    gaps=[r for r in entries if r['name'] not in latest or latest[r['name']]['version']!=r['version'] or '-' in r['version']]
    record={'sdk':sdk,'entries':entries,'latest_public_metadata':latest,'metadata_errors':errors,
            'noncurrent_prerelease_or_unverified_entries':gaps,'every_entry_verified_current_public_stable':not gaps and not errors}
    (evidence/(sdk+'-complete-normal-graph-catalog.json')).write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'sdk':sdk,'all_graph_entries':len(entries),'noncurrent_unstable_or_unverified':len(gaps),'metadata_errors':len(errors)}))
    assert not gaps and not errors, 'Complete SDK graph is not current public stable; retain every gap.'
else: raise AssertionError(mode)
