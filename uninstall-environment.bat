@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv" (
  echo No local virtual environment was found.
  exit /b 0
)
echo This removes only the local .venv folder. Application data and profiles are not removed.
choice /C YN /M "Continue"
if errorlevel 2 exit /b 0
rmdir /s /q ".venv"
if exist ".venv" (
  echo Unable to remove .venv. Close Data Sync Check and retry.
  exit /b 1
)
echo Local Python environment removed.
exit /b 0
