# Data Sync Check v1.7.2

Data Sync Check compares Microsoft SQL Server and PostgreSQL databases across schema, row counts, and row-level data, then produces browser-based comparison results and exportable reports.

## Installation

Data Sync Check v1.7.2 uses a controlled Windows installation process to avoid Python-version and package-wheel incompatibilities.

### First-time setup

```bat
setup.bat
```

The setup automatically installs or selects **Python 3.13**, creates a local `.venv`, installs exact binary dependencies, validates the environment, and warns when a Microsoft SQL Server ODBC driver is missing.

### Start

```bat
run.bat
```

### Repair

```bat
repair.bat
```

See [`docs/INSTALLATION.md`](docs/INSTALLATION.md) for full instructions, corporate proxy guidance, offline preparation, and troubleshooting.

## External prerequisite

Install Microsoft ODBC Driver 18 for SQL Server manually before testing SQL Server connectivity. Driver 17 remains a supported fallback.

## v1.7.2 installation changes

- Standardized the application runtime on CPython 3.13 x64.
- Added optional Python 3.13 installation through Windows Package Manager.
- Removed dependency on the machine's default or newest Python version.
- Pinned validated runtime package versions.
- Forced binary-wheel installation to prevent unexpected C++ compilation.
- Added `.venv` repair and runtime verification.
- Added dependency consistency and import checks.
- Added non-blocking SQL Server ODBC driver detection.
- Added clearer setup, launch, and recovery messages.

## Security

- Credentials remain local to the running browser session and are not written to setup logs.
- Do not commit `.env`, connection profiles containing secrets, generated exports, or `.venv`.
- Review package updates deliberately and validate them before changing pinned versions.
