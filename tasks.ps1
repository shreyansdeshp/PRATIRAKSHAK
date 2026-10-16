<#
  Pratirakshak — Windows task runner (same target names as the Makefile).
  Usage:  ./tasks.ps1 setup | fetch | data | world | synth | train [-Fast] | intelligence | sim | export | dev | shots | record | test | lint
  If scripts are blocked:  powershell -ExecutionPolicy Bypass -File tasks.ps1 <target>
#>
param(
  [Parameter(Position = 0, Mandatory = $true)][string]$Target,
  [switch]$Fast
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$Py = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

function Invoke-Step([string]$Exe, [string[]]$ArgList) {
  & $Exe @ArgList
  if ($LASTEXITCODE -ne 0) { throw "failed ($LASTEXITCODE): $Exe $($ArgList -join ' ')" }
}

function Invoke-Frontend([string[]]$ArgList) {
  Push-Location frontend
  try { Invoke-Step 'npm' $ArgList } finally { Pop-Location }
}

switch ($Target) {
  'setup' {
    Invoke-Step 'py' @('-3.11', '-m', 'venv', '.venv')
    Invoke-Step $Py @('-m', 'pip', 'install', '--upgrade', 'pip==24.3.1')
    Invoke-Step $Py @('-m', 'pip', 'install', '-r', 'requirements.txt')
    Invoke-Step $Py @('-m', 'pip', 'install', '-e', '.', '--no-deps')
    Invoke-Frontend @('ci')
    Push-Location frontend; try { Invoke-Step 'npx' @('playwright', 'install', 'chromium') } finally { Pop-Location }
  }
  'fetch'        { Invoke-Step $Py @('scripts/fetch_cmapss.py') }
  'data'         { Invoke-Step $Py @('-m', 'pratirakshak.ingest') }
  'world'        { Invoke-Step $Py @('-m', 'pratirakshak.world') }
  'synth'        { Invoke-Step $Py @('-m', 'pratirakshak.synth') }
  'train'        { $a = @('-m', 'pratirakshak.models'); if ($Fast) { $a += '--fast' }; Invoke-Step $Py $a }
  'intelligence' { Invoke-Step $Py @('-m', 'pratirakshak.intelligence') }
  'sim'          { Invoke-Step $Py @('-m', 'pratirakshak.sim') }
  'export'       { Invoke-Step $Py @('-m', 'pratirakshak.export') }
  'dev' {
    Start-Process -NoNewWindow $Py -ArgumentList @('-m', 'uvicorn', 'pratirakshak.api.app:app', '--port', '8000')
    Invoke-Frontend @('run', 'dev')
  }
  'shots'  { Invoke-Frontend @('run', 'shots') }
  'record' { Invoke-Frontend @('run', 'record') }
  'test' {
    Invoke-Step $Py @('-m', 'pytest')
    Invoke-Frontend @('test')
  }
  'lint' {
    Invoke-Step $Py @('-m', 'ruff', 'check', 'backend', 'scripts')
    Invoke-Frontend @('run', 'typecheck')
  }
  default { throw "unknown target '$Target'" }
}
