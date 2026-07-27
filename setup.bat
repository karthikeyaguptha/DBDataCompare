@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Data Sync Check - First-time setup

set "MIN_PYTHON_MAJOR=3"
set "MIN_PYTHON_MINOR=12"
set "PYTHON_CMD="
set "PYTHON_LABEL="

echo.
echo ========================================
echo Data Sync Check - First-time setup
echo ========================================
echo.
echo [1/5] Checking Python installation...

rem Prefer the Windows Python Launcher, then regular PATH commands.
py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
    set "PYTHON_LABEL=py -3"
    goto :python_detected
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=python"
    set "PYTHON_LABEL=python"
    goto :python_detected
)

python3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_CMD=python3"
    set "PYTHON_LABEL=python3"
    goto :python_detected
)

goto :python_missing

:python_detected
for /f "tokens=2" %%V in ('%PYTHON_CMD% --version 2^>^&1') do set "PYTHON_VERSION=%%V"

%PYTHON_CMD% -c "import sys; raise SystemExit(0 if sys.version_info >= (%MIN_PYTHON_MAJOR%, %MIN_PYTHON_MINOR%) else 1)" >nul 2>&1
if errorlevel 1 goto :python_too_old

echo       Python %PYTHON_VERSION% detected using "%PYTHON_LABEL%".
echo       Success.
echo.

echo [2/5] Creating virtual environment...
if exist ".venv\Scripts\python.exe" (
    echo       Existing .venv found. Reusing it.
) else (
    %PYTHON_CMD% -m venv .venv
    if errorlevel 1 goto :venv_failed
    echo       Success.
)
echo.

set "VENV_PYTHON=%CD%\.venv\Scripts\python.exe"
if not exist "%VENV_PYTHON%" goto :venv_failed

echo [3/5] Upgrading pip...
"%VENV_PYTHON%" -m ensurepip --upgrade >nul 2>&1
"%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 goto :pip_failed
echo       Success.
echo.

echo [4/5] Installing required packages...
if not exist "requirements.txt" goto :requirements_missing
"%VENV_PYTHON%" -m pip install -r requirements.txt
if errorlevel 1 goto :dependency_failed
echo       Success.
echo.

echo [5/5] Verifying installation...
"%VENV_PYTHON%" -m pip check
if errorlevel 1 goto :verification_failed
echo       Success.
echo.

echo ========================================
echo Setup completed successfully
echo ========================================
echo.
echo Python runtime : %PYTHON_VERSION%
echo Environment    : %CD%\.venv
echo.
echo Run run.bat to start Data Sync Check.
echo.
pause
exit /b 0

:python_missing
echo       Python 3.12 or later was not found.
echo.
echo Install Python using one of these methods:
echo.
echo   winget install --id Python.Python.3.14 -e
echo.
echo Or download Python from:
echo   https://www.python.org/downloads/windows/
echo.
echo During manual installation, enable:
echo   - Add python.exe to PATH
echo   - Python Launcher for Windows
echo   - pip
echo.
echo After installation, close this window, open a new Command Prompt,
echo and run setup.bat again.
echo.
pause
exit /b 1

:python_too_old
echo       Python %PYTHON_VERSION% was detected, but Python 3.12 or later is required.
echo.
echo Upgrade Python using:
echo   winget install --id Python.Python.3.14 -e
echo.
echo Then open a new Command Prompt and rerun setup.bat.
echo.
pause
exit /b 1

:venv_failed
echo.
echo ERROR: Failed to create the Python virtual environment.
echo.
echo Possible causes:
echo   - Incomplete Python installation
echo   - Permission denied in this folder
echo   - Missing venv or ensurepip support
echo.
echo Try these commands with your installed Python:
echo   %PYTHON_CMD% -m ensurepip --upgrade
echo   %PYTHON_CMD% -m pip install --upgrade pip
echo   %PYTHON_CMD% -m venv .venv
echo.
pause
exit /b 1

:pip_failed
echo.
echo ERROR: pip could not be prepared or upgraded.
echo Check your internet connection, proxy, firewall, and Python installation.
echo Then rerun setup.bat.
echo.
pause
exit /b 1

:requirements_missing
echo.
echo ERROR: requirements.txt was not found in:
echo   %CD%
echo.
echo Keep setup.bat in the Data Sync Check project root and try again.
echo.
pause
exit /b 1

:dependency_failed
echo.
echo ERROR: One or more required packages could not be installed.
echo.
echo Review the package error above. Common causes include:
echo   - No internet access
echo   - Corporate proxy or firewall restrictions
echo   - A package that does not yet support the installed Python version
echo.
echo You can retry with:
echo   ".venv\Scripts\python.exe" -m pip install -r requirements.txt
echo.
pause
exit /b 1

:verification_failed
echo.
echo ERROR: Installed package dependencies are inconsistent.
echo Run the following command for details:
echo   ".venv\Scripts\python.exe" -m pip check
echo.
pause
exit /b 1
