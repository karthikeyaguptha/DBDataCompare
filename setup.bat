@echo off
setlocal
cd /d "%~dp0"

echo.
echo Data Sync Check - First-time setup
echo ====================================

where py >nul 2>nul
if errorlevel 1 (
    echo Python Launcher was not found.
    echo Install 64-bit Python 3.12 and select "Add Python to PATH".
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Creating Python virtual environment...
    py -3.12 -m venv .venv
    if errorlevel 1 (
        echo Unable to create the Python 3.12 environment.
        pause
        exit /b 1
    )
)

echo Installing dependencies...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :failed

".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo Setup completed successfully.
echo You can now double-click run.bat.
pause
exit /b 0

:failed
echo.
echo Setup failed. Review the message above and try again.
pause
exit /b 1
