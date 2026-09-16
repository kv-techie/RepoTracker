<#
  Starts RepoTracker for everyday use: the local agent and a production Next.js server.

  Unlike the old hidden launch, this script writes logs and watches the agent, so a crash
  or a hang is visible instead of showing up as an unresponsive page.

    logs/agent.log      agent output
    logs/web.log        Next.js output
    logs/supervisor.log what this script did, and when it restarted something

  Run it directly to see the output, or through run-silent.vbs to start it at login.
#>

param(
  [int]$AgentPort = 8001,
  [int]$WebPort = 3000,
  [int]$HealthIntervalSeconds = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Write-Log([string]$message) {
  $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Add-Content -Path (Join-Path $logs 'supervisor.log') -Value $line
  Write-Host $line
}

function Test-Port([int]$port) {
  $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Agent {
  $python = Join-Path $root 'agent\venv\Scripts\python.exe'
  if (-not (Test-Path $python)) { $python = 'python' }
  Write-Log "starting agent on port $AgentPort"
  Start-Process -FilePath $python -ArgumentList 'agent\main.py' -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $logs 'agent.log') `
    -RedirectStandardError (Join-Path $logs 'agent.err.log') `
    -WindowStyle Hidden -PassThru
}

function Start-Web {
  Write-Log "starting web server on port $WebPort"
  # Production build, not `next dev`: no hot reload, lower memory, faster pages
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run build && npm run start' -WorkingDirectory $root `
    -RedirectStandardOutput (Join-Path $logs 'web.log') `
    -RedirectStandardError (Join-Path $logs 'web.err.log') `
    -WindowStyle Hidden -PassThru
}

function Test-AgentHealthy {
  # The agent requires its token, so 401 also proves it is answering
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$AgentPort/status" -TimeoutSec 5 `
      -SkipHttpErrorCheck -ErrorAction Stop
    return $response.StatusCode -in 200, 401
  } catch {
    return $false
  }
}

Write-Log '--- RepoTracker supervisor starting ---'

$agent = if (Test-Port $AgentPort) { Write-Log "agent already listening on $AgentPort"; $null } else { Start-Agent }
$web = if (Test-Port $WebPort) { Write-Log "web already listening on $WebPort"; $null } else { Start-Web }

while ($true) {
  Start-Sleep -Seconds $HealthIntervalSeconds

  if (-not (Test-AgentHealthy)) {
    Write-Log 'agent is not answering /status — restarting it'
    if ($agent -and -not $agent.HasExited) {
      try { Stop-Process -Id $agent.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    # An orphaned worker can keep the port; clear it before restarting
    $holder = (Get-NetTCPConnection -LocalPort $AgentPort -State Listen -ErrorAction SilentlyContinue).OwningProcess
    foreach ($procId in ($holder | Select-Object -Unique)) {
      try { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } catch {}
    }
    Start-Sleep -Seconds 2
    $agent = Start-Agent
  }

  if (-not (Test-Port $WebPort)) {
    Write-Log 'web server is not listening — restarting it'
    $web = Start-Web
  }
}
