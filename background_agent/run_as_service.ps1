# Run this script to start the background agent without an interactive terminal.
param(
    [string]$Action = 'start'
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$python = 'python'
$uvicornArgs = 'app:app --host 127.0.0.1 --port 8005 --log-level info'

function Start-Agent {
    $exe = Get-Command nssm -ErrorAction SilentlyContinue
    if ($exe) {
        nssm install BackgroundAgent "$python" "-m uvicorn $uvicornArgs"
        nssm start BackgroundAgent
        Write-Output "Service installed and started via nssm."
    } else {
        $log = Join-Path $scriptDir 'agent.log'
        Start-Process -FilePath $python -ArgumentList "-m uvicorn $uvicornArgs" -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $log
        Write-Output "Agent started as background process (not a Windows Service). Logs: $log"
    }
}

function Stop-Agent {
    $exe = Get-Command nssm -ErrorAction SilentlyContinue
    if ($exe) {
        nssm stop BackgroundAgent
        nssm remove BackgroundAgent confirm
        Write-Output "Service stopped and removed."
    } else {
        # Best-effort: try to find process
        $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*uvicorn*app:app*' }
        foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force }
        Write-Output "Stopped background uvicorn processes."
    }
}

switch ($Action.ToLower()) {
    'start' { Start-Agent }
    'stop'  { Stop-Agent }
    default { Write-Output "Unknown action: $Action. Use start|stop" }
}
