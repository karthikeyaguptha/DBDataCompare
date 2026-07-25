@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo The application has not been set up yet.
    echo Run setup.bat first.
    pause
    exit /b 1
)

echo Starting Data Sync Check...
start "" "http://127.0.0.1:5000"
".venv\Scripts\python.exe" app.py

if errorlevel 1 (
    echo.
    echo The application stopped because of an error.
    pause
)
