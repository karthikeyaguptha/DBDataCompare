# Data Sync Check v1.7.2 — Release notes

## Installation reliability

This release replaces broad “Python 3.12 or newer” detection with a controlled CPython 3.13 application runtime. The change prevents newly released Python versions from breaking installation when database-driver wheels are not yet available.

### Included

- Python 3.13 detection and optional `winget` installation.
- Isolated project-local `.venv`.
- Exact dependency pins.
- Binary-only package installation.
- Automatic environment repair.
- `pip check` and required-import verification.
- Optional automated test execution.
- ODBC Driver 17/18 detection with a non-blocking warning.
- Updated setup and troubleshooting documentation.

### Manual prerequisite

Microsoft ODBC Driver 18 for SQL Server is not installed by Data Sync Check and must be installed separately.

## Compatibility

- Operating system: Windows 10/11 x64.
- Application runtime: CPython 3.13 x64.
- SQL Server connectivity: Microsoft ODBC Driver 18 preferred; Driver 17 supported.
- PostgreSQL connectivity: Psycopg 3 binary distribution.
