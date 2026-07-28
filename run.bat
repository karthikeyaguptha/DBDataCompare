@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Data Sync Check v1.9.8

set "VENV_PYTHON=%CD%\.venv\Scripts\python.exe"
set "READY_MARKER=%CD%\.venv\.data-sync-check-ready"
set "ENTRY_POINT=%CD%\app.py"

if not exist "%VENV_PYTHON%" goto :not_setup
if not exist "%READY_MARKER%" goto :not_ready
if not exist "%ENTRY_POINT%" goto :missing_app

"%VENV_PYTHON%" -c "import flask, waitress, pyodbc, psycopg, dotenv" >nul 2>&1
if errorlevel 1 goto :broken_env

echo ============================================================
echo  Starting Data Sync Check v1.9.8
echo ============================================================
echo Application URL: http://127.0.0.1:5000
echo The browser will open automatically.
echo Press Ctrl+C in this window to stop the application.
echo.

set "DSC_OPEN_BROWSER=1"
"%VENV_PYTHON%" "%ENTRY_POINT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] Data Sync Check stopped with exit code %EXIT_CODE%.
    echo Review the message above. If dependencies are missing, run setup.bat again.
    echo.
    pause
)
exit /b %EXIT_CODE%

:not_setup
echo.
echo [ERROR] Data Sync Check has not been set up on this machine.
echo Run setup.bat once, wait for setup to complete, and then run run.bat again.
echo.
pause
exit /b 1

:not_ready
echo.
echo [ERROR] The local environment is incomplete or belongs to an older setup.
echo Run setup.bat again to validate and repair the environment.
echo.
pause
exit /b 1

:missing_app
echo.
echo [ERROR] app.py was not found in the application folder.
echo.
pause
exit /b 1

:broken_env
echo.
echo [ERROR] The local Python environment is damaged or incomplete.
echo Run setup.bat again to repair the installation.
echo.
pause
exit /b 1
