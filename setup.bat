@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Data Sync Check - First-time setup

rem ============================================================
rem Data Sync Check v1.7.1 - First-time setup
rem Supported Python versions: 3.12 or later
rem ============================================================

set "MIN_PYTHON_MAJOR=3"
set "MIN_PYTHON_MINOR=12"
set "PYTHON_EXE="
set "PYTHON_ARGS="
set "PYTHON_LABEL="
set "PYTHON_VERSION="
set "VENV_DIR=%CD%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "REQUIREMENTS_FILE=%CD%\requirements.txt"

echo.
echo ========================================
echo Data Sync Check - First-time setup
echo Version 1.7.1
echo ========================================
echo.

echo [1/6] Checking Python installation...

rem Prefer the Windows Python Launcher, then PATH commands.
py -3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3"
    set "PYTHON_LABEL=py -3"
    goto :python_detected
)

python --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_EXE=python"
    set "PYTHON_ARGS="
    set "PYTHON_LABEL=python"
    goto :python_detected
)

python3 --version >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_EXE=python3"
    set "PYTHON_ARGS="
    set "PYTHON_LABEL=python3"
    goto :python_detected
)

goto :python_missing

:python_detected
for /f "tokens=2" %%V in ('%PYTHON_EXE% %PYTHON_ARGS% --version 2^>^&1') do set "PYTHON_VERSION=%%V"

%PYTHON_EXE% %PYTHON_ARGS% -c "import sys; raise SystemExit(0 if sys.version_info >= (%MIN_PYTHON_MAJOR%, %MIN_PYTHON_MINOR%) else 1)" >nul 2>&1
if errorlevel 1 goto :python_too_old

echo       Python %PYTHON_VERSION% detected using "%PYTHON_LABEL%".
echo       Success.
echo.

echo [2/6] Preparing virtual environment...

rem Remove an incomplete virtual environment automatically.
if exist "%VENV_DIR%" if not exist "%VENV_PYTHON%" (
    echo       Incomplete .venv detected. Removing it...
    rmdir /s /q "%VENV_DIR%"
    if exist "%VENV_DIR%" goto :venv_cleanup_failed
)

rem Reuse a valid environment only if its Python is still supported.
if exist "%VENV_PYTHON%" (
    "%VENV_PYTHON%" -c "import sys; raise SystemExit(0 if sys.version_info >= (%MIN_PYTHON_MAJOR%, %MIN_PYTHON_MINOR%) else 1)" >nul 2>&1
    if errorlevel 1 (
        echo       Existing .venv uses an unsupported Python version.
        echo       Recreating .venv...
        rmdir /s /q "%VENV_DIR%"
        if exist "%VENV_DIR%" goto :venv_cleanup_failed
    ) else (
        for /f "tokens=2" %%V in ('"%VENV_PYTHON%" --version 2^>^&1') do set "VENV_PYTHON_VERSION=%%V"
        echo       Existing .venv found with Python !VENV_PYTHON_VERSION!.
        echo       Reusing it.
        goto :venv_ready
    )
)

%PYTHON_EXE% %PYTHON_ARGS% -m venv "%VENV_DIR%"
if errorlevel 1 goto :venv_failed
if not exist "%VENV_PYTHON%" goto :venv_failed

echo       Virtual environment created successfully.

:venv_ready
echo       Success.
echo.

echo [3/6] Preparing pip...
"%VENV_PYTHON%" -m ensurepip --upgrade >nul 2>&1
"%VENV_PYTHON%" -m pip install --upgrade pip setuptools wheel
if errorlevel 1 goto :pip_failed

echo       Success.
echo.

echo [4/6] Checking requirements file...
if not exist "%REQUIREMENTS_FILE%" goto :requirements_missing

echo       requirements.txt found.
echo       Success.
echo.

echo [5/6] Installing required packages...
"%VENV_PYTHON%" -m pip install -r "%REQUIREMENTS_FILE%"
if errorlevel 1 goto :dependency_failed

echo       Success.
echo.

echo [6/6] Verifying installation...
"%VENV_PYTHON%" -m pip check
if errorlevel 1 goto :verification_failed

rem Basic import verification for the core application stack.
"%VENV_PYTHON%" -c "import flask, pyodbc, psycopg" >nul 2>&1
if errorlevel 1 goto :import_verification_failed

echo       Success.
echo.
echo ========================================
echo Setup completed successfully
echo ========================================
echo.
echo Python runtime : %PYTHON_VERSION%
echo Environment    : %VENV_DIR%
echo.
echo Run run.bat to start Data Sync Check.
echo.
pause
exit /b 0

:python_missing
echo       Python 3.12 or later was not found.
echo.
echo Install Python using Windows Package Manager:
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
echo After installation:
echo   1. Close this window.
echo   2. Open a new Command Prompt.
echo   3. Run setup.bat again.
echo.
pause
exit /b 1

:python_too_old
echo       Python %PYTHON_VERSION% was detected.
echo       Data Sync Check requires Python 3.12 or later.
echo.
echo Upgrade Python using:
echo.
echo   winget install --id Python.Python.3.14 -e
echo.
echo Then open a new Command Prompt and rerun setup.bat.
echo.
pause
exit /b 1

:venv_cleanup_failed
echo.
echo ERROR: The existing .venv folder could not be removed.
echo.
echo Close any Command Prompt, editor, or running application that may be
echo using the virtual environment, then delete this folder manually:
echo.
echo   %VENV_DIR%
echo.
echo After deleting it, run setup.bat again.
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
echo   - Security software blocking file creation
echo.
echo Try these commands:
echo.
echo   %PYTHON_EXE% %PYTHON_ARGS% -m ensurepip --upgrade
echo   %PYTHON_EXE% %PYTHON_ARGS% -m pip install --upgrade pip
echo   %PYTHON_EXE% %PYTHON_ARGS% -m venv .venv
echo.
echo Then rerun setup.bat.
echo.
pause
exit /b 1

:pip_failed
echo.
echo ERROR: pip could not be prepared or upgraded.
echo.
echo Check:
echo   - Internet connection
echo   - Corporate proxy or firewall restrictions
echo   - Python installation completeness
echo.
echo Retry with:
echo.
echo   "%VENV_PYTHON%" -m pip install --upgrade pip setuptools wheel
echo.
pause
exit /b 1

:requirements_missing
echo.
echo ERROR: requirements.txt was not found in:
echo.
echo   %CD%
echo.
echo Keep setup.bat in the Data Sync Check project root beside
echo requirements.txt, then run setup.bat again.
echo.
pause
exit /b 1

:dependency_failed
echo.
echo ERROR: One or more required packages could not be installed.
echo.
echo Review the package error shown above. Common causes include:
echo   - No internet access
echo   - Corporate proxy or firewall restrictions
echo   - An invalid or unavailable package version
echo   - A package that does not support the installed Python version
echo.
echo Important for Python 3.14:
echo   requirements.txt should use a compatible Psycopg package, for example:
echo.
echo   psycopg[binary]^>=3.3.4,^<4
echo.
echo After correcting requirements.txt, retry with:
echo.
echo   "%VENV_PYTHON%" -m pip install -r requirements.txt
echo.
echo If needed, delete the .venv folder and run setup.bat again.
echo.
pause
exit /b 1

:verification_failed
echo.
echo ERROR: Installed package dependencies are inconsistent.
echo.
echo Run the following command for details:
echo.
echo   "%VENV_PYTHON%" -m pip check
echo.
pause
exit /b 1

:import_verification_failed
echo.
echo ERROR: Core application packages could not be imported.
echo.
echo Expected imports:
echo   - flask
echo   - pyodbc
echo   - psycopg
echo.
echo Reinstall the requirements with:
echo.
echo   "%VENV_PYTHON%" -m pip install --force-reinstall -r requirements.txt
echo.
pause
exit /b 1
