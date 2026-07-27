[CmdletBinding()]
param([string]$EntryPoint)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Python = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
$SettingsFile = Join-Path $ProjectRoot 'config\launcher.env'

if (-not (Test-Path $Python)) {
    Write-Host '[ERROR] Local application environment not found.' -ForegroundColor Red
    Write-Host 'Run setup.bat once before starting Data Sync Check.'
    exit 1
}

Set-Location $ProjectRoot

if (-not $EntryPoint -and (Test-Path $SettingsFile)) {
    foreach ($line in Get-Content $SettingsFile) {
        if ($line -match '^\s*APP_ENTRYPOINT\s*=\s*(.+?)\s*$') { $EntryPoint = $Matches[1].Trim('"').Trim("'") }
    }
}
if (-not $EntryPoint) {
    foreach ($candidate in @('app.py', 'main.py', 'server.py', 'run.py')) {
        if (Test-Path (Join-Path $ProjectRoot $candidate)) { $EntryPoint = $candidate; break }
    }
}
if (-not $EntryPoint -or -not (Test-Path (Join-Path $ProjectRoot $EntryPoint))) {
    Write-Host '[ERROR] Application entry point was not found.' -ForegroundColor Red
    Write-Host 'Set APP_ENTRYPOINT in config\launcher.env, for example APP_ENTRYPOINT=app.py.'
    exit 1
}

& $Python -c "import flask, waitress, pyodbc, psycopg" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] The local environment is incomplete or damaged.' -ForegroundColor Red
    Write-Host 'Run repair.bat, then retry.'
    exit 1
}

Write-Host "Starting Data Sync Check using $EntryPoint ..." -ForegroundColor Cyan
& $Python $EntryPoint
exit $LASTEXITCODE
