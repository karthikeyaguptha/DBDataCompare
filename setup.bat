@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title Data Sync Check v1.9.9 - First-time Setup

set "APP_VERSION=1.9.9"
set "PYTHON_EXE="
set "PYTHON_ARGS="
set "VENV_DIR=%CD%\.venv"
set "VENV_PYTHON=%CD%\.venv\Scripts\python.exe"
set "READY_MARKER=%CD%\.venv\.data-sync-check-ready"
set "REQUIREMENTS=%CD%\requirements.txt"

call :header

if not exist "%REQUIREMENTS%" goto :missing_requirements

call :step "1/7" "Checking Python 3.13 64-bit"
call :find_python
if not defined PYTHON_EXE goto :python_missing

goto :python_ready

:python_missing
echo.
echo Python 3.13 64-bit is required but was not found.
where winget.exe >nul 2>&1
if errorlevel 1 goto :winget_missing

choice /C YN /N /M "Install Python 3.13 for the current user using winget? [Y/N]: "
if errorlevel 2 goto :failed

echo.
echo Installing Python 3.13. Approve any Windows prompts that appear...
winget install --exact --id Python.Python.3.13 --scope user --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :python_install_failed

echo.
echo Python installation completed.
echo Close this window and run setup.bat again so Windows can refresh the Python launcher.
echo.
pause
exit /b 0

:winget_missing
echo Install Python 3.13 64-bit manually from python.org.
echo During installation, enable Add python.exe to PATH and Python Launcher.
goto :failed

:python_install_failed
call :error "Python 3.13 installation failed."
goto :failed

:python_ready
set "VERSION_FILE=%TEMP%\dsc_python_version_%RANDOM%.txt"
"%PYTHON_EXE%" %PYTHON_ARGS% -c "import platform,sys; print(str(sys.version_info.major)+'.'+str(sys.version_info.minor)+'.'+str(sys.version_info.micro)+' '+platform.architecture()[0])" > "%VERSION_FILE%" 2>nul
if errorlevel 1 goto :python_version_failed
set /p PYTHON_VERSION=<"%VERSION_FILE%"
del /q "%VERSION_FILE%" >nul 2>&1
echo [OK] Python %PYTHON_VERSION% detected.

call :step "2/7" "Preparing the local virtual environment"
call :prepare_venv
if errorlevel 1 goto :failed
echo [OK] Local .venv is ready.

call :step "3/7" "Updating pip"
"%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 goto :pip_failed
echo [OK] pip is ready.

call :step "4/7" "Installing application dependencies"
echo Source compilation is disabled. Only compatible binary packages will be installed.
"%VENV_PYTHON%" -m pip install --only-binary=:all: --requirement "%REQUIREMENTS%"
if errorlevel 1 goto :dependency_failed
echo [OK] Application dependencies installed.

call :step "5/7" "Checking dependency consistency"
"%VENV_PYTHON%" -m pip check
if errorlevel 1 goto :pip_check_failed
echo [OK] No dependency conflicts found.

call :step "6/7" "Verifying application modules"
"%VENV_PYTHON%" -c "import flask,waitress,pyodbc,psycopg,dotenv; from db_compare import create_app; print('Required modules verified.')"
if errorlevel 1 goto :module_failed
echo [OK] Required application modules load correctly.

call :step "7/7" "Checking the SQL Server ODBC system driver"
call :check_odbc

> "%READY_MARKER%" echo Data Sync Check v%APP_VERSION%

echo.
echo ============================================================
echo  Data Sync Check v%APP_VERSION% setup completed successfully
echo ============================================================
echo.
echo Start the application with run.bat
echo.
pause
exit /b 0

:prepare_venv
if exist "%VENV_PYTHON%" goto :validate_existing_venv
if exist "%VENV_DIR%" (
    echo Incomplete .venv detected. Removing it...
    rmdir /s /q "%VENV_DIR%"
)
goto :create_venv

:validate_existing_venv
"%VENV_PYTHON%" -c "import platform,sys; raise SystemExit(0 if sys.version_info[:2]==(3,13) and platform.architecture()[0]=='64bit' else 1)" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Existing compatible .venv found.
    exit /b 0
)
echo Existing .venv uses an unsupported Python runtime. Recreating it...
rmdir /s /q "%VENV_DIR%"

:create_venv
"%PYTHON_EXE%" %PYTHON_ARGS% -m venv "%VENV_DIR%"
if errorlevel 1 (
    call :error "Unable to create the .venv environment."
    exit /b 1
)
exit /b 0

:check_odbc
set "ODBC_FILE=%TEMP%\dsc_odbc_drivers_%RANDOM%.txt"
"%VENV_PYTHON%" -c "import pyodbc; d=pyodbc.drivers(); print('Installed ODBC drivers: ' + (', '.join(d) if d else 'None')); raise SystemExit(0 if any(x in d for x in ('ODBC Driver 18 for SQL Server','ODBC Driver 17 for SQL Server')) else 1)" > "%ODBC_FILE%" 2>nul
set "ODBC_STATUS=%ERRORLEVEL%"
type "%ODBC_FILE%"
del /q "%ODBC_FILE%" >nul 2>&1
if "%ODBC_STATUS%"=="0" goto :odbc_found

echo [WARNING] Microsoft ODBC Driver 17 or 18 for SQL Server was not detected.
echo           Python setup is complete. Install the SQL Server ODBC driver manually before testing SQL Server connections.
exit /b 0

:odbc_found
echo [OK] A supported SQL Server ODBC driver is installed.
exit /b 0

:find_python
py -3.13 -c "import platform,sys; raise SystemExit(0 if sys.version_info[:2]==(3,13) and platform.architecture()[0]=='64bit' else 1)" >nul 2>&1
if not errorlevel 1 (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3.13"
    exit /b 0
)

for %%P in ("%LocalAppData%\Programs\Python\Python313\python.exe" "%ProgramFiles%\Python313\python.exe") do (
    if exist "%%~P" (
        "%%~P" -c "import platform,sys; raise SystemExit(0 if sys.version_info[:2]==(3,13) and platform.architecture()[0]=='64bit' else 1)" >nul 2>&1
        if not errorlevel 1 (
            set "PYTHON_EXE=%%~P"
            set "PYTHON_ARGS="
            exit /b 0
        )
    )
)
exit /b 0

:missing_requirements
call :error "requirements.txt was not found in the application folder."
goto :failed

:python_version_failed
call :error "Python was detected but its version could not be read."
goto :failed

:pip_failed
call :error "Unable to update pip. Check internet, proxy, or firewall access."
goto :failed

:dependency_failed
call :error "Dependency installation failed. Review the package error shown above."
echo Confirm that requirements.txt contains the v1.9.9 package versions.
goto :failed

:pip_check_failed
call :error "Dependency consistency check failed."
goto :failed

:module_failed
call :error "One or more application modules could not be imported."
goto :failed

:header
echo ============================================================
echo  Data Sync Check v%APP_VERSION% - First-time Setup
echo ============================================================
echo.
echo Run this file once on a new machine or after deleting .venv.
exit /b 0

:step
echo.
echo [%~1] %~2...
exit /b 0

:error
echo.
echo [ERROR] %~1
exit /b 0

:failed
echo.
echo Setup did not complete.
echo Fix the issue shown above and run setup.bat again.
echo.
pause
exit /b 1
