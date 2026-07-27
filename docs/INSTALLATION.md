# Data Sync Check v1.7.2 — Windows installation

## Recommended installation command

From the extracted project folder, double-click `setup.bat`, or run:

```bat
setup.bat
```

The setup process standardizes the application on **64-bit CPython 3.13**. It does not use whichever Python happens to be newest on the machine. This prevents a newly released Python version from forcing `pip` to compile database packages from source.

The setup performs these operations:

1. Detects Python 3.13.
2. Offers to install Python 3.13 through `winget` when missing.
3. Creates an isolated `.venv` inside the application folder.
4. Installs exact dependency versions.
5. Requires binary wheels and refuses source compilation.
6. Runs `pip check` and import verification.
7. Detects Microsoft SQL Server ODBC Driver 17 or 18 and shows a warning when absent.
8. Runs automated tests when the repository contains a `tests` folder.

## Start the application

```bat
run.bat
```

## Repair the installation

Use this after changing Python dependencies or when `.venv` is damaged:

```bat
repair.bat
```

Repair deletes and recreates only the local `.venv`. It does not delete profiles, reports, exports, or application configuration.

## Manual SQL Server ODBC prerequisite

The Python package `pyodbc` and the Microsoft SQL Server ODBC driver are separate components. Setup installs `pyodbc`, but the Microsoft system driver remains a manual prerequisite.

Install either:

- Microsoft ODBC Driver 18 for SQL Server — preferred.
- Microsoft ODBC Driver 17 for SQL Server — supported fallback.

After installing it, restart Data Sync Check and test the SQL Server connection again.

## Corporate networks and proxies

`setup.bat` needs access to the Python package index. On a corporate network, configure the standard `HTTPS_PROXY` environment variable before setup when required:

```bat
set HTTPS_PROXY=http://proxy-host:proxy-port
setup.bat
```

Do not commit proxy credentials into batch files or repository configuration.

## Offline or restricted-network installation

On an internet-connected Windows machine using Python 3.13 x64:

```bat
py -3.13 -m pip download --only-binary=:all: -r requirements-runtime.txt -d wheelhouse
```

Copy the complete project, including `wheelhouse`, to the target machine. Then adapt the install command in `scripts\setup.ps1` to use:

```bat
--no-index --find-links wheelhouse
```

A formally supported offline package should be produced and tested as a separate release artifact rather than assembled manually by each user.

## Common failures

### Python 3.14 is already installed

No action is required. v1.7.2 deliberately uses Python 3.13 for its own `.venv`; multiple Python versions can coexist.

### “Building wheel for pyodbc” appears

Stop the setup. v1.7.2 uses `--only-binary=:all:` and should never compile `pyodbc`. Confirm that the supplied `requirements-runtime.txt` and `scripts\setup.ps1` were not replaced by older files.

### `.venv` contains an older Python version

Run:

```bat
repair.bat
```

### SQL connection reports that ODBC Driver 18 is unavailable

Install Microsoft ODBC Driver 18 manually. Running `setup.bat` again cannot install the external Microsoft system driver in v1.7.2.
