import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHmac } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AppError } from './store.mjs';
import { analyzeText } from './analyzer.mjs';
import { parseImport, deadlineFor, digest } from './messages.mjs';

const active = p => !['fulfilled','cancelled','dismissed'].includes(p.status);
const normalize = s => String(s).trim().toLowerCase();
const stop = /^(?:stop|unsubscribe)[.!\s]*$|\b(?:stop (?:hiermee|met (?:deze|je|uw|herinneringen|berichten))|stop (?:sending|contacting)|laat me met rust|geen herinneringen|niet meer (?:berichten|mailen|appen)|do not contact|don['’]t contact)\b/iu;
const receipt = /^(?:bedankt|dank(?: je)?|thanks|thank you|ok(?:ay)?|oke|prima|ontvangen|received|noted)[.!\s]*$/iu;
const autoReply = /\b(?:out of office|automatisch antwoord|automatic reply|ben afwezig|op vakantie|currently away)\b/iu;
const done = /\b(?:ik heb|i have|i['’]ve|is klaar|het is gelukt|done|sent|verstuurd|gerepareerd|finished|afgerond|geprobeerd|gekeken|onderzocht)\b/iu;
const tried = /\b(?:geprobeerd|gekeken|onderzocht|uitgezocht|tried|attempted|looked|investigated)\b/iu;
const disagreement = /\b(?:niet beloofd|niet afgesproken|dat klopt niet|never promised|did not agree|didn['’]t agree)\b/iu;
const keywords = s => new Set(s.toLowerCase().match(/[\p{L}]{4,}/gu)?.filter(w=>!['morgen','today','tomorrow','will','have','with','your','that','this','voor','naar','niet','wordt','gaan','zullen','geprobeerd','hebben','stuur','verstuurd','antwoord'].includes(w))||[]);
export class Conversations {
  constructor(store) {
    this.store=store;this.db=store.db;
    this.db.exec(`PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS conversation_records(owner TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,kind,id));`);
    const keyPath=store.file && store.file!==':memory:' ? store.file+'.key' : null;
    if(keyPath && existsSync(keyPath))this.key=readFileSync(keyPath); else {this.key=randomBytes(32);if(keyPath)writeFileSync(keyPath,this.key,{mode:0o600,flag:'wx'});}
    if(this.key.length!==32)throw new Error('The local encryption key is invalid. Restore the matching .key file.');
  }
  seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv),bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64');}
  unseal(payload){const bytes=Buffer.from(payload,'base64'),cipher=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8'));}
  keyFor(...fields){return createHmac('sha256',this.key).update(JSON.stringify(fields)).digest('hex');}
  get(owner,kind,id){const row=this.db.prepare('SELECT payload FROM conversation_records WHERE owner=? AND kind=? AND id=?').get(owner,kind,id);return row?this.unseal(row.payload):null;}
  list(owner,kind){return this.db.prepare('SELECT payload FROM conversation_records WHERE owner=? AND kind=?').all(owner,kind).map(r=>this.unseal(r.payload));}
  put(owner,kind,value){this.db.prepare('INSERT INTO conversation_records VALUES(?,?,?,?) ON CONFLICT(owner,kind,id) DO UPDATE SET payload=excluded.payload').run(owner,kind,value.id,this.seal(value));return value;}
  config(owner){return this.get(owner,'config','settings')||{id:'settings',aliases:[this.store.user(owner).name,this.store.user(owner).email,'Me','Ik'],timezone:'Europe/Amsterdam'};}
  saveConfig(owner,input){if(!Array.isArray(input.aliases)||input.aliases.length>20||input.aliases.some(x=>typeof x!=='string'||x.length>250))throw new AppError('Enter at most 20 exact names or email addresses.');try{new Intl.DateTimeFormat('en',{timeZone:input.timezone});}catch{throw new AppError('Invalid time zone.');}this.put(owner,'config',{id:'settings',aliases:input.aliases.map(x=>x.trim()).filter(Boolean),timezone:input.timezone});this.rebuild(owner);return this.config(owner);}
  import(owner,input){if(input.format==='backup')return this.restore(owner,input.text);const messages=parseImport({...input,timezone:input.timezone||this.config(owner).timezone});return this.ingest(owner,messages,{route:'import',label:input.conversation,complete:false});}
  ingest(owner,messages,coverage={}) {
    return this.store.transaction(()=>{
      let added=0,updated=0;const changes=new Set();
      for(const m of messages){const conversationId=this.keyFor(m.channel,m.account,m.conversation),id=this.keyFor(m.channel,m.account,m.providerId),old=this.get(owner,'source',id);const group=this.get(owner,'coverage',conversationId);if(group?.excluded)continue;
        const item={...m,id,conversationId,observedAt:Date.now(),versions:old?.versions||[]};
        if(old && (old.text!==item.text||old.sender!==item.sender||old.at!==item.at))item.versions=[...item.versions,{text:old.text,sender:old.sender,at:old.at,observedAt:old.observedAt}].slice(-20);
        if(!old || old.text!==item.text || old.sender!==item.sender || old.at!==item.at){this.put(owner,'source',item);if(old)updated++;else added++;changes.add(conversationId);}
        this.put(owner,'coverage',{...group,id:conversationId,channel:m.channel,account:m.account,label:coverage.label||m.subject||m.conversation,route:coverage.route||'import',lastSync:Date.now(),state:'available',complete:coverage.complete===true,excluded:false});
      }
      this.rebuild(owner);return {added,updated,total:this.list(owner,'source').length,agreements:this.list(owner,'agreement').length};
    });
  }
  rebuild(owner) {
    const config=this.config(owner),sources=this.list(owner,'source').sort((a,b)=>(a.at??a.observedAt)-(b.at??b.observedAt)||a.providerId.localeCompare(b.providerId));
    const old=new Map(this.list(owner,'agreement').map(p=>[p.id,p])),built=[];
    const excluded=new Set(this.list(owner,'coverage').filter(x=>x.excluded).map(x=>x.id));
    for(const source of sources){if(excluded.has(source.conversationId))continue;
      const own=config.aliases.some(a=>normalize(a)===normalize(source.sender));const contactId=this.keyFor(source.channel,source.account,source.sender);const previousContact=this.get(owner,'contact',contactId)||{};
      // Stop words are effective in ordinary replies and do not require another account.
      if(!own && stop.test(source.text) && (!previousContact.stopAt || (source.at??source.observedAt)>previousContact.stopAt))this.put(owner,'contact',{...previousContact,id:contactId,name:source.senderName,paused:true,stopAt:source.at??source.observedAt,reason:'Stop request in a source message'});
      const clean=source.text.split(/\n(?:On .+wrote:|Op .+schreef|From:|Van:|[- ]*Original Message)/iu)[0].split('\n').filter(l=>!l.trimStart().startsWith('>')).join('\n');
      const candidates=autoReply.test(source.text)?[]:analyzeText(clean).commitments,newTask=candidates.some(c=>['effort','result'].includes(c.kind));
      const preceding=built.filter(p=>p.conversationId===source.conversationId && p.responsible===source.sender && p.sourceId!==source.id && active(p));
      const nearest=built.filter(p=>p.conversationId===source.conversationId&&active(p)).at(-1);
      for(const p of preceding){const words=keywords(p.summary),overlap=[...keywords(source.text)].filter(w=>words.has(w)).length;const relevant=overlap>=2 || (!newTask&&p.status==='open'&&preceding.length===1&&source.text.length<300&&nearest?.id===p.id&&(receipt.test(source.text)||tried.test(source.text)||done.test(source.text)||disagreement.test(source.text)||feedbackOrChange(source.text)));
        if(!relevant)continue;
        const reply=autoReply.test(source.text)?'away':receipt.test(source.text)?'receipt':'substantive';if(p.replyState!=='substantive'||reply==='substantive')p.replyState=reply;p.replySourceId=source.id;
        p.evidence.push({sourceId:source.id,type:p.replyState,at:source.at,attribution:'Gekoppeld binnen dit gesprek; controleer de context en de betekenis.'});
        if(disagreement.test(source.text))p.disputed=true;
        if(tried.test(source.text)){p.effortState='reported';if(p.kind==='effort')p.status='claim';}
        else if(done.test(source.text)&&!negativeOutcome(source.text)){p.resultState='reported';if(p.kind==='result')p.status='claim';}
        if(p.kind==='feedback'&&p.replyState==='substantive')p.status='claim';
        const term=analyzeText(source.text).commitments[0]?.suggestedDeadline;
        if(term)p.proposedDeadline=deadlineFor(term,source.at,config.timezone);
      }
      // Drop quoted mail history rather than rediscovering prior people's words.
      candidates.forEach((c,index)=>{const id=this.keyFor(source.id,index,c.summary);const previous=old.get(id);const p={id,sourceId:source.id,conversationId:source.conversationId,contactId,responsible:source.sender,person:source.senderName,direction:own?'given':'received',summary:c.summary,kind:c.kind,conditional:c.conditional,condition:c.condition,conditionMet:false,status:c.kind==='possibility'||c.reportedSpeech?'review':'open',reportedSpeech:c.reportedSpeech,deadlineTerm:c.suggestedDeadline,deadlineAt:deadlineFor(c.suggestedDeadline,source.at,config.timezone),deadlineEstimated:!!c.suggestedDeadline,originalAt:source.at,observedAt:source.observedAt,effortState:'unknown',resultState:'unknown',replyState:'none',evidence:[],history:previous?.history||[],manual:previous?.manual||{},createdAt:previous?.createdAt||Date.now()};built.push(p);});
    }
    const retained=new Set(built.map(p=>p.id));
    for(const p of built){Object.assign(p,p.manual);for(const sourceId of p.sourceLinks||[]){const linked=sources.find(s=>s.id===sourceId);if(linked)p.evidence.push({sourceId,type:'linked',at:linked.at,attribution:'Door jou gekoppeld; personen zijn niet automatisch samengevoegd.'});}p.paused=this.get(owner,'contact',p.contactId)?.paused||p.paused||false;this.put(owner,'agreement',p);}
    for(const p of old.values())if(!retained.has(p.id)){this.db.prepare('DELETE FROM conversation_records WHERE owner=? AND kind=? AND id=?').run(owner,'agreement',p.id);this.cancelDrafts(owner,p.id);}
    for(const draft of this.list(owner,'draft')){const p=built.find(x=>x.id===draft.agreementId);if(draft.state==='ready'&&(!p||p.replySourceId!==draft.replySourceId||p.paused||p.disputed||!active(p)))this.put(owner,'draft',{...draft,state:'cancelled',cancelReason:'The conversation or contact policy changed.'});}
  }
  cancelDrafts(owner,id){for(const d of this.list(owner,'draft'))if(d.agreementId===id&&d.state==='ready')this.put(owner,'draft',{...d,state:'cancelled'});}
  snapshot(owner){const sources=this.list(owner,'source'),agreements=this.list(owner,'agreement').sort((a,b)=>(b.originalAt??b.observedAt)-(a.originalAt??a.observedAt));return {agreements,sources,coverage:this.list(owner,'coverage'),contacts:this.list(owner,'contact'),drafts:this.list(owner,'draft'),config:this.config(owner),counts:{messages:sources.length,open:agreements.filter(p=>active(p)&&p.kind!=='possibility'&&p.status!=='review').length,effort:agreements.filter(p=>p.kind==='effort').length,review:agreements.filter(p=>['review','claim'].includes(p.status)).length}};}
  act(owner,input){return this.store.transaction(()=>{const p=this.get(owner,'agreement',input.id);if(!p)throw new AppError('Agreement not found.',404);const note=String(input.note||'').trim().slice(0,2000);let patch={};
    switch(input.action){
      case 'accept':patch={status:'open',reportedSpeech:false};break;
      case 'dismiss':patch={status:'dismissed'};break;
      case 'fulfil':if(p.disputed)throw new AppError('Resolve the disputed meaning first.');if(p.conditional&&!p.conditionMet)throw new AppError('Record that the condition has occurred first.');if(!note)throw new AppError('Record what was done or which evidence supports completion.');patch={status:'fulfilled',...(p.kind==='effort'?{effortState:'verified'}:p.kind==='feedback'?{replyState:'verified'}:{resultState:'verified'})};break;
      case 'effort':if(!note)throw new AppError('Describe the attempt.');patch={effortState:'reported'};break;
      case 'dispute':if(!note)throw new AppError('Describe the disagreement.');patch={disputed:true};break;
      case 'resolve':if(!note)throw new AppError('Describe the clarified meaning.');patch={disputed:false};break;
      case 'condition':patch={conditionMet:true};break;
      case 'pause':patch={paused:true};break;
      case 'resume':if(this.get(owner,'contact',p.contactId)?.paused)throw new AppError('This contact has stopped follow-up.');patch={paused:false};break;
      case 'reopen':if(!note)throw new AppError('Explain why it should reopen.');patch={status:'open',effortState:'unknown',resultState:'unknown',replyState:'none'};break;
      case 'deadline':{const at=Number(input.deadlineAt);if(!Number.isSafeInteger(at)||at<=0)throw new AppError('Choose a valid deadline.');if(!note)throw new AppError('Explain the agreed date; changing it does not remove the original date.');patch={deadlineAt:at,deadlineEstimated:false};break;}
      case 'note':if(!note)throw new AppError('Enter a note.');break;
      case 'kind':if(!['effort','result','feedback','possibility'].includes(input.kind)||!note)throw new AppError('Choose the commitment type and explain the original meaning.');patch={kind:input.kind,status:input.kind==='possibility'?'review':'open'};break;
      case 'linksource':{if(!note)throw new AppError('Explain why this source belongs to this agreement.');const source=this.get(owner,'source',input.sourceId);if(!source)throw new AppError('Source message not found.',404);patch={sourceLinks:[...new Set([...(p.sourceLinks||[]),source.id])].slice(0,20)};break;}
      default:throw new AppError('Unknown agreement action.');
    }
    p.manual={...p.manual,...patch};Object.assign(p,patch);p.history.push({id:randomUUID(),action:input.action,note,patch,at:Date.now(),recordedBy:'workspace owner'});this.put(owner,'agreement',p);this.cancelDrafts(owner,p.id);if(input.action==='linksource')this.rebuild(owner);return this.get(owner,'agreement',p.id);
  });}
  draft(owner,id,now=Date.now()) {return this.store.transaction(()=>{const p=this.get(owner,'agreement',id);if(!p)throw new AppError('Agreement not found.',404);if(!active(p)||p.status==='review'||p.kind==='possibility'||p.paused||p.disputed||(p.conditional&&!p.conditionMet))throw new AppError('Clarify, resolve or resume this agreement before follow-up.');
    if(p.replyState==='away'||p.replyState==='substantive'||p.status==='claim')throw new AppError('Review the existing substantive reply before another follow-up.');
    const drafts=this.list(owner,'draft').filter(d=>['ready','copied'].includes(d.state));const existing=drafts.find(d=>d.agreementId===id&&d.state==='ready');if(existing)return existing;
    if(drafts.filter(d=>d.agreementId===id).length>=2 || drafts.filter(d=>d.contactId===p.contactId&&d.at>now-7*86400000).length>=2)throw new AppError('The limit is two follow-ups per topic and two per contact in seven days.');
    const self=p.direction==='given';const text=self?`Over mijn toezegging: “${p.summary}”\nIk wil je een inhoudelijke update geven: [vul de uitgevoerde stap of een voorstel in].\nDit concept is voorbereid met Promise; ik verstuur het zelf.`:`Ik kom terug op je toezegging: “${p.summary}”\nKun je laten weten wat je hebt kunnen doen, of wanneer je inhoudelijk kunt terugkomen? Een poging en het resultaat zijn afzonderlijke zaken.\nDit concept is voorbereid met Promise; ik verstuur het zelf. Laat gerust weten als je deze opvolging wilt stoppen.`;
    return this.put(owner,'draft',{id:randomUUID(),agreementId:id,contactId:p.contactId,replySourceId:p.replySourceId,state:'ready',text,at:now,coverageNote:'Controleer het gewone gesprek vóór verzending. Imports en zichtbare berichten geven geen volledige actuele dekking.'});
  });}
  copied(owner,id){const d=this.get(owner,'draft',id);if(!d||d.state!=='ready')throw new AppError('This follow-up was cancelled or is unavailable.');this.rebuild(owner);const current=this.get(owner,'draft',id);if(current.state!=='ready')throw new AppError('A new reply or policy change cancelled this follow-up.');return this.put(owner,'draft',{...current,state:'copied',copiedAt:Date.now()});}
  exclude(owner,id){const result=this.store.transaction(()=>{const c=this.get(owner,'coverage',id);if(!c)throw new AppError('Conversation not found.',404);this.put(owner,'coverage',{...c,excluded:true,label:'Excluded conversation',account:'',lastSync:null});const contacts=new Set();for(const s of this.list(owner,'source'))if(s.conversationId===id){contacts.add(this.keyFor(s.channel,s.account,s.sender));this.db.prepare('DELETE FROM conversation_records WHERE owner=? AND kind=? AND id=?').run(owner,'source',s.id);}for(const p of this.list(owner,'agreement'))if(p.conversationId===id){this.db.prepare('DELETE FROM conversation_records WHERE owner=? AND kind=? AND id=?').run(owner,'agreement',p.id);this.db.prepare('DELETE FROM notifications WHERE userId=? AND promiseId=?').run(owner,p.id);for(const d of this.list(owner,'draft'))if(d.agreementId===p.id)this.db.prepare('DELETE FROM conversation_records WHERE owner=? AND kind=? AND id=?').run(owner,'draft',d.id);}for(const contact of contacts)if(!this.list(owner,'source').some(s=>this.keyFor(s.channel,s.account,s.sender)===contact))this.db.prepare('DELETE FROM conversation_records WHERE owner=? AND kind=? AND id=?').run(owner,'contact',contact);return {ok:true};});this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');return result;}
  pairing(owner){const token=randomBytes(32).toString('hex');this.put(owner,'bridge',{id:'pairing',tokenDigest:digest(token),at:Date.now()});return {token};}
  bridgeOwner(token){if(typeof token!=='string'||token.length!==64)return null;for(const u of this.db.prepare('SELECT id FROM users').all()){const b=this.get(u.id,'bridge','pairing');if(b?.tokenDigest===digest(token))return u.id;}return null;}
  revokePair(owner){this.db.prepare('DELETE FROM conversation_records WHERE owner=? AND kind=?').run(owner,'bridge');return {ok:true};}
  validateDraft(owner,id){this.rebuild(owner);const d=this.get(owner,'draft',id);if(!d||d.state!=='ready')throw new AppError('A new reply or policy change cancelled this follow-up.');return d;}
  restore(owner,text){let backup;try{backup=JSON.parse(text);}catch{throw new AppError('Invalid conversation backup.');}if(backup.format!=='promise-conversations'||backup.version!==1||!Array.isArray(backup.sources)||!Array.isArray(backup.agreements)||backup.sources.length>10000||backup.agreements.length>5000)throw new AppError('Choose an exported Promise conversation backup.');if(this.list(owner,'source').length||this.list(owner,'agreement').length)throw new AppError('Restore into an empty communication workspace to prevent conflicting histories.',409);
    const messages=backup.sources.map(s=>{const parsed=parseImport({format:'json',conversation:String(s.conversation||''),account:String(s.account||''),channel:String(s.channel||''),timezone:s.timezone||'Europe/Amsterdam',text:JSON.stringify({messages:[{id:s.providerId,sender:s.sender,senderName:s.senderName,text:s.text,at:s.at,subject:s.subject}]})})[0];return {...parsed,oldId:s.id};});
    const patches=new Map();for(const p of backup.agreements){if(typeof p.summary!=='string'||typeof p.sourceId!=='string')throw new AppError('Invalid agreement in backup.');const m=p.manual||{},safe={};for(const field of ['paused','disputed','conditionMet'])if(typeof m[field]==='boolean')safe[field]=m[field];if(['open','review','claim','fulfilled','dismissed','cancelled'].includes(m.status))safe.status=m.status;if(['effort','result','feedback','possibility'].includes(m.kind))safe.kind=m.kind;for(const field of ['effortState','resultState'])if(['unknown','reported','verified'].includes(m[field]))safe[field]=m[field];if(['none','receipt','substantive','away','verified'].includes(m.replyState))safe.replyState=m.replyState;if(Number.isSafeInteger(m.deadlineAt)&&m.deadlineAt>0&&m.deadlineAt<253402300799999){safe.deadlineAt=m.deadlineAt;safe.deadlineEstimated=false;}patches.set(p.id,{old:p,safe});}
    return this.store.transaction(()=>{if(backup.config?.aliases)this.saveConfig(owner,{aliases:backup.config.aliases,timezone:backup.config.timezone});const idMap=new Map();for(const m of messages){const id=this.keyFor(m.channel,m.account,m.providerId),conversationId=this.keyFor(m.channel,m.account,m.conversation);idMap.set(m.oldId,id);delete m.oldId;this.put(owner,'source',{...m,id,conversationId,observedAt:Date.now(),versions:[]});this.put(owner,'coverage',{id:conversationId,channel:m.channel,account:m.account,label:m.subject||m.conversation,route:'restored',state:'snapshot',lastSync:Date.now(),complete:false,excluded:false});}this.rebuild(owner);const current=this.list(owner,'agreement');for(const {old,safe}of patches.values()){const p=current.find(x=>x.sourceId===idMap.get(old.sourceId)&&x.summary===old.summary);if(!p)continue;safe.sourceLinks=(old.manual?.sourceLinks||[]).filter(x=>idMap.has(x)).map(x=>idMap.get(x));p.manual=safe;p.history=(Array.isArray(old.history)?old.history:[]).slice(-500).map(h=>({id:randomUUID(),action:String(h.action||'restored').slice(0,50),note:String(h.note||'').slice(0,2000),at:Number.isSafeInteger(h.at)?h.at:Date.now(),recordedBy:'owner record restored from export'}));this.put(owner,'agreement',p);const contact=(backup.contacts||[]).find(x=>x.id===old.contactId);if(contact?.paused)this.put(owner,'contact',{id:p.contactId,name:p.person,paused:true,stopAt:Number.isSafeInteger(contact.stopAt)?contact.stopAt:Date.now(),reason:'Stop policy restored from owner backup'});}this.rebuild(owner);return {added:messages.length,updated:0,total:messages.length,agreements:this.list(owner,'agreement').length};});}
  tick(now=Date.now()){for(const {id:owner} of this.db.prepare('SELECT id FROM users').all()){const prefs=this.store.preferences(owner);for(const p of this.list(owner,'agreement')){if(!active(p)||p.status==='review'||p.kind==='possibility'||p.paused||p.disputed||!p.deadlineAt||(p.conditional&&!p.conditionMet))continue;const overdue=p.deadlineAt<now;if(overdue&&!prefs.overdueAlerts||!overdue&&!prefs.dueSoonAlerts)continue;if(!overdue&&p.deadlineAt>now+prefs.dueSoonHours*3600000)continue;const prefix=p.deadlineEstimated?'Voorgestelde datum controleren':overdue?'Afgesproken datum verstreken':'Afgesproken datum nadert';this.store.notify(owner,p.id,'agreement_due',`${prefix} bij een ${p.kind === 'effort' ? 'inspanningsafspraak' : p.kind === 'feedback' ? 'terugkoppeling' : 'resultaatafspraak'}. Open het dossier voor de inhoud.`,`agreement:${owner}:${p.id}:${p.deadlineAt}:${overdue}`,now);}}}
}
function feedbackOrChange(text){return /\b(?:morgen|tomorrow|later|deadline|vrijdag|friday|antwoord|reply|update)\b/iu.test(text);}
function negativeOutcome(text){return /\b(?:niet gelukt|mislukt|not (?:done|finished|sent)|failed|could not|niet (?:klaar|verstuurd|gerepareerd))\b/iu.test(text);}



