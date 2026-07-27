[CmdletBinding()]
param(
    [switch]$Repair,
    [switch]$NoPythonInstall,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$VenvPath = Join-Path $ProjectRoot '.venv'
$VenvPython = Join-Path $VenvPath 'Scripts\python.exe'
$Requirements = Join-Path $ProjectRoot 'requirements-runtime.txt'
$DevRequirements = Join-Path $ProjectRoot 'requirements-dev.txt'
$Marker = Join-Path $VenvPath '.data-sync-check-runtime'
$RequiredPython = [version]'3.13'
$VersionLabel = '1.7.2'

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Success([string]$Text) { Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-WarningLine([string]$Text) { Write-Host "[WARNING] $Text" -ForegroundColor Yellow }
function Fail([string]$Text) { Write-Host "`n[ERROR] $Text" -ForegroundColor Red; exit 1 }

function Invoke-Checked {
    param([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { Fail "$FailureMessage (exit code $LASTEXITCODE)." }
}

function Get-Python313 {
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) {
        & $py.Source -3.13 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            return (& $py.Source -3.13 -c "import sys; print(sys.executable)").Trim()
        }
    }

    foreach ($name in @('python.exe', 'python3.exe')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            $ver = & $cmd.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
            if ($LASTEXITCODE -eq 0 -and $ver.Trim() -eq '3.13') { return $cmd.Source }
        }
    }

    $knownRoots = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
        "$env:ProgramFiles\Python313\python.exe"
    )
    foreach ($candidate in $knownRoots) {
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

function Install-Python313 {
    if ($NoPythonInstall) { Fail 'Python 3.13 was not found and automatic installation was disabled.' }
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if (-not $winget) {
        Fail 'Python 3.13 is required. Install it from python.org, reopen this folder, and run setup.bat again. Windows Package Manager (winget) was not found.'
    }

    Write-WarningLine 'Python 3.13 was not detected.'
    $answer = Read-Host 'Install Python 3.13 for the current user using winget? [Y/N]'
    if ($answer -notmatch '^(y|yes)$') { Fail 'Setup cancelled. Python 3.13 is required for this release.' }

    Invoke-Checked $winget.Source @(
        'install', '--exact', '--id', 'Python.Python.3.13',
        '--scope', 'user', '--accept-package-agreements', '--accept-source-agreements',
        '--disable-interactivity'
    ) 'Python 3.13 installation failed'

    Start-Sleep -Seconds 2
}

Set-Location $ProjectRoot
Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host " Data Sync Check v$VersionLabel - Reliable Windows Setup" -ForegroundColor White
Write-Host '============================================================' -ForegroundColor DarkCyan

if (-not (Test-Path $Requirements)) { Fail "Missing $Requirements." }

Write-Step '1/8 Checking the supported Python runtime'
$Python = Get-Python313
if (-not $Python) {
    Install-Python313
    $Python = Get-Python313
}
if (-not $Python) {
    Fail 'Python 3.13 was installed but could not be found in this process. Close this window and run setup.bat again.'
}
$PythonVersion = (& $Python --version 2>&1).ToString().Trim()
Write-Success "$PythonVersion detected at $Python"

Write-Step '2/8 Preparing the isolated application environment'
$Recreate = $Repair
if (Test-Path $VenvPython) {
    $ExistingVersion = (& $VenvPython -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null)
    if ($LASTEXITCODE -ne 0 -or $ExistingVersion.Trim() -ne '3.13') { $Recreate = $true }
}
if ($Recreate -and (Test-Path $VenvPath)) {
    Write-WarningLine 'Removing the previous local environment because repair was requested or the Python version changed.'
    Remove-Item $VenvPath -Recurse -Force
}
if (-not (Test-Path $VenvPython)) {
    Invoke-Checked $Python @('-m', 'venv', $VenvPath) 'Unable to create the local Python environment'
}
Set-Content -Path $Marker -Value "Data Sync Check $VersionLabel`nPython 3.13" -Encoding ASCII
Write-Success 'Local .venv environment is ready.'

Write-Step '3/8 Updating package-management tools'
Invoke-Checked $VenvPython @('-m', 'pip', 'install', '--upgrade', 'pip==26.1.1', 'setuptools==82.0.1', 'wheel==0.46.3') 'Unable to update pip, setuptools, and wheel'
Write-Success 'Package-management tools are ready.'

Write-Step '4/8 Installing locked runtime dependencies (binary packages only)'
Invoke-Checked $VenvPython @(
    '-m', 'pip', 'install',
    '--only-binary=:all:',
    '--requirement', $Requirements
) 'Runtime dependency installation failed. No source compilation was attempted'
Write-Success 'Runtime dependencies installed.'

Write-Step '5/8 Checking dependency consistency'
Invoke-Checked $VenvPython @('-m', 'pip', 'check') 'Installed dependency consistency check failed'
Write-Success 'No dependency conflicts were found.'

Write-Step '6/8 Verifying required Python imports'
$VerifyScript = @'
import importlib
required = ['flask', 'waitress', 'pyodbc', 'psycopg']
missing = []
for name in required:
    try:
        importlib.import_module(name)
    except Exception as exc:
        missing.append(f'{name}: {exc}')
if missing:
    raise SystemExit('Import verification failed: ' + '; '.join(missing))
print('Required imports verified.')
'@
& $VenvPython -c $VerifyScript
if ($LASTEXITCODE -ne 0) { Fail 'One or more required Python modules could not be imported.' }
Write-Success 'Required Python modules load correctly.'

Write-Step '7/8 Checking the external SQL Server ODBC driver'
$DriverOutput = & $VenvPython -c "import pyodbc; print('|'.join(pyodbc.drivers()))"
if ($LASTEXITCODE -ne 0) {
    Write-WarningLine 'pyodbc is installed, but installed Windows ODBC drivers could not be enumerated.'
} elseif ($DriverOutput -match 'ODBC Driver (17|18) for SQL Server') {
    Write-Success "Supported SQL Server driver detected: $DriverOutput"
} else {
    Write-WarningLine 'Microsoft ODBC Driver 17/18 for SQL Server was not detected.'
    Write-Host '          Python setup is complete. Install the ODBC driver manually before testing SQL Server connections.'
    if ($DriverOutput) { Write-Host "          Installed ODBC drivers: $DriverOutput" }
}

Write-Step '8/8 Running smoke tests'
if (-not $SkipTests -and (Test-Path $DevRequirements) -and (Test-Path (Join-Path $ProjectRoot 'tests'))) {
    Invoke-Checked $VenvPython @('-m', 'pip', 'install', '--only-binary=:all:', '--requirement', $DevRequirements) 'Development dependency installation failed'
    & $VenvPython -m pytest -q
    if ($LASTEXITCODE -ne 0) { Fail 'Automated tests failed. The application was not marked ready.' }
    Write-Success 'Automated tests passed.'
} else {
    Write-Success 'Smoke-test stage skipped because tests are unavailable or -SkipTests was supplied.'
}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host ' Data Sync Check setup completed successfully' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host 'Start the application with: run.bat'
Write-Host 'Repair the local environment with: repair.bat'
Write-Host 'The Microsoft SQL Server ODBC driver remains a manual prerequisite.'
exit 0
