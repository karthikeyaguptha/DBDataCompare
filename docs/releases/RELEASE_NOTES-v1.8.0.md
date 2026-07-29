# Data Sync Check v1.8.0

## Installation reliability release

- Added a clean, self-contained `setup.bat`.
- Added a clean, self-contained `run.bat`.
- Removed dependency on installation PowerShell scripts.
- Standardized the application runtime on Python 3.13 x64.
- Retained one package source of truth: `requirements.txt`.
- Enforced binary-only package installation to prevent unexpected C/C++ builds.
- Added automatic cleanup of incomplete or incompatible `.venv` environments.
- Added `pip check` and required-module verification.
- Added non-blocking detection of Microsoft SQL Server ODBC Driver 17/18.
- Added automatic browser opening during application startup.

The Microsoft SQL Server ODBC driver remains a manual Windows prerequisite.
