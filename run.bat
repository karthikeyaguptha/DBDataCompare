@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Data Sync Check

set "VENV_PYTHON=%CD%\.venv\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
    echo.
    echo ========================================
    echo Data Sync Check cannot start
    echo ========================================
    echo.
    echo The Python virtual environment was not found.
    echo.
    echo Run setup.bat first, then start the application again.
    echo.
    pause
    exit /b 1
)

if exist "app.py" (
    "%VENV_PYTHON%" app.py
    goto :finished
)

if exist "main.py" (
    "%VENV_PYTHON%" main.py
    goto :finished
)

if exist "server.py" (
    "%VENV_PYTHON%" server.py
    goto :finished
)

echo.
echo ========================================
echo Data Sync Check cannot start
echo ========================================
echo.
echo No supported application entry file was found.
echo Expected one of:
echo   app.py
echo   main.py
echo   server.py
echo.
echo Keep run.bat in the project root. If the application uses a different
echo entry command, replace the launch section in run.bat with that command.
echo.
pause
exit /b 1

:finished
if errorlevel 1 (
    echo.
    echo Data Sync Check stopped with an error.
echo Review the messages above for details.
echo.
pause
    exit /b 1
)

endlocal
