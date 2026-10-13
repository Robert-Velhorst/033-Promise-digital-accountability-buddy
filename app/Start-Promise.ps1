$ErrorActionPreference = 'Stop'
$promiseRoot = $PSScriptRoot
$promiseNode = (Get-Command node -ErrorAction Stop).Source
$promiseVersion = & $promiseNode -p "process.versions.node"
if ([version]$promiseVersion -lt [version]'22.13.0') { throw 'Promise needs Node.js 22.13 or newer.' }
$promiseUrl = 'http://localhost:4310'
$promiseProbe = "fetch('http://127.0.0.1:4310/api/version',{signal:AbortSignal.timeout(1000)}).then(async r=>{const d=await r.json();process.exitCode = r.ok && d.app === 'promise' && d.version === '3.0.0' ? 0 : 1}).catch(()=>process.exitCode=1)"
& $promiseNode -e $promiseProbe
$promiseRunning = $LASTEXITCODE -eq 0
if (-not $promiseRunning) {
    $promiseListener = Get-NetTCPConnection -LocalPort 4310 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($promiseListener) {
        $promiseProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $promiseListener.OwningProcess)
        $promiseServerPath = [IO.Path]::GetFullPath((Join-Path $promiseRoot 'server.mjs'))
        if ($promiseProcess.CommandLine -and $promiseProcess.CommandLine.Replace('/','\').Contains($promiseServerPath)) {
            Stop-Process -Id $promiseListener.OwningProcess -ErrorAction Stop
        } else {
            throw 'Port 4310 is occupied by another installation or application. Close that local service and start Promise again. Your data has not been changed.'
        }
    }
    $promiseDataPath = Join-Path $promiseRoot 'data'
    New-Item -ItemType Directory -Path $promiseDataPath -Force | Out-Null
    Start-Process -FilePath $promiseNode -ArgumentList ('"' + (Join-Path $promiseRoot 'server.mjs') + '"') -WorkingDirectory $promiseRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $promiseDataPath 'server.log') -RedirectStandardError (Join-Path $promiseDataPath 'server-error.log') | Out-Null
    for ($promiseAttempt = 0; $promiseAttempt -lt 20; $promiseAttempt++) {
        & $promiseNode -e $promiseProbe
        $promiseRunning = $LASTEXITCODE -eq 0
        if ($promiseRunning) { break }
        Start-Sleep -Milliseconds 200
    }
    if (-not $promiseRunning) { throw ('Promise could not start. Check ' + (Join-Path $promiseDataPath 'server-error.log')) }
}
try { Start-Process -FilePath $promiseUrl }
catch { Write-Host "Promise is ready. Open $promiseUrl in your browser." }

