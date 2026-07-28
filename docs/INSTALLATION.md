# Data Sync Check v1.9.1 — Windows installation

## First-time setup

Extract the complete application folder, then double-click:

```text
setup.bat
```

Run `setup.bat` once on a new Windows machine. It detects or installs Python 3.13 x64, creates `.venv`, and installs every Python dependency from the single `requirements.txt` file.

If setup installs Python through `winget`, close the window and run `setup.bat` again so the Windows Python launcher is refreshed.

Successful setup ends with:

```text
Data Sync Check v1.9.1 setup completed successfully
```

## Starting the application

After setup completes, double-click:

```text
run.bat
```

The application opens at:

```text
http://127.0.0.1:5000
```

Use `run.bat` for every normal launch. Do not run `setup.bat` every day.

## Dependency source of truth

The project uses only:

```text
requirements.txt
```

Do not add `requirements-runtime.txt` or another duplicate requirements file.

## SQL Server ODBC driver

Install Microsoft ODBC Driver 18 or 17 for SQL Server manually. `setup.bat` detects the driver and reports a warning when it is unavailable, but it does not install the Windows ODBC component.

## Resetting a damaged installation

Delete the `.venv` directory and run:

```text
setup.bat
```

The application source, saved profiles, reports, and configuration are not removed when `.venv` is deleted.
