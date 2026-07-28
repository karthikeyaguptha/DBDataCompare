# Data Sync Check v1.9.2

Data Sync Check compares Microsoft SQL Server and PostgreSQL databases across schema, row counts, and table data. It provides connection profiles, reusable table selections, progress tracking, mismatch details, exports, and an HTML comparison report.

## Comparison workflow

1. Enter and test both database connections.
2. Load the table catalog.
3. In Step 2, choose the comparison mode and select tables.
4. Optionally save the selected tables as a connection-specific selection or portable template.
5. Start the comparison from Step 2 or Step 3.
6. Review results in the workspace or open the shareable HTML/PDF report.

Connection-specific selections restore tables across every pagination page and remain tied to the SQL Server/PostgreSQL context in which they were saved. Portable templates can be reused with another database pair. Before a portable template is applied, Data Sync Check shows a reconciliation preview for tables available in both databases, available on only one side, missing, or ambiguous. Only tables available in both are selected.

Saved selections can be exported as Data Sync Check JSON and imported on another installation. Exported selection files contain table references, manual keys, comparison mode, batch size, and origin context; they never contain passwords or credentials.

## Windows prerequisites

- Windows 10 or Windows 11, 64-bit
- Internet access during first-time setup
- Python 3.13 x64
  - `setup.bat` can install it through Windows Package Manager when it is missing
- Microsoft ODBC Driver 18 or 17 for SQL Server
  - Install this manually before testing SQL Server connections
- Network access to the SQL Server and PostgreSQL instances

## Installation and startup

### First time only

Double-click:

```text
setup.bat
```

The setup performs the complete Python installation workflow:

1. Detects Python 3.13 x64.
2. Offers to install Python 3.13 using `winget` when missing.
3. Creates the local `.venv` environment.
4. Installs packages from the single `requirements.txt` file.
5. Prevents native source builds by using binary packages only.
6. Checks dependency consistency and imports.
7. Reports whether a supported SQL Server ODBC driver is installed.

When setup finishes, it displays:

```text
Data Sync Check v1.9.2 setup completed successfully
```

### Every normal launch

Double-click:

```text
run.bat
```

The browser opens at:

```text
http://127.0.0.1:5000
```

Keep the command window open while Data Sync Check is running. Press `Ctrl+C` in that window to stop it.

## Files used for installation

Only these installation files are required:

```text
setup.bat
run.bat
requirements.txt
```

Do not create or maintain `requirements-runtime.txt`. All Python package versions are defined only in `requirements.txt`.

## SQL Server ODBC driver

The Python package `pyodbc` and the Microsoft SQL Server ODBC driver are separate components.

`setup.bat` detects the external Windows driver but does not install it. Install Microsoft ODBC Driver 18 for SQL Server manually, restart Data Sync Check, and then test the SQL connection.

To see the drivers visible to the application after setup:

```bat
.venv\Scripts\python.exe -c "import pyodbc; print(pyodbc.drivers())"
```

## Troubleshooting

### Python was installed during setup

When setup installs Python through `winget`, close the setup window and run `setup.bat` again. This allows Windows to refresh the Python launcher.

### Dependency installation failed

Check internet access, corporate proxy rules, and firewall restrictions. Then rerun:

```text
setup.bat
```

The script uses `--only-binary=:all:` and will not attempt to compile `pyodbc` or other native packages locally.

### The `.venv` environment is damaged

Delete the `.venv` folder and run:

```text
setup.bat
```

### `run.bat` says setup is incomplete

Run `setup.bat` again. `run.bat` starts the application only after setup has completed its dependency checks.

## Security

- Credentials remain in the active browser session and are not intentionally written to logs.
- Saved profiles must not store passwords.
- Reports should not contain passwords or authentication secrets.
- Generated reports and exported mismatch data can contain business-sensitive information and should be handled accordingly.

## Version 1.9.2 changes

- Adds connection-specific and portable saved-selection types.
- Reconciles portable templates against the currently loaded database pair before applying them.
- Shows available-in-both, SQL-only, PostgreSQL-only, missing, and ambiguous outcomes.
- Selects only valid tables after explicit user confirmation; skipped tables remain visible in the preview.
- Restores applicable manual keys, comparison mode, and batch size.
- Adds credential-free JSON export and import for saved table selections.

## Version 1.9.0 changes

- Moved Comparison Mode into Step 2 beside table-selection scope.
- Added named reusable table selections with automatic multi-page restoration.
- Restores saved manual comparison keys with a named table selection.
- Validates the database and schema context before applying a saved selection.
- Keeps saved table selections separate from password-free connection profiles.

## Version 1.8.0 installation changes

- Replaced the layered PowerShell launcher flow with two direct batch files.
- Standardized first-time setup on CPython 3.13 x64.
- Retained only one dependency file: `requirements.txt`.
- Added automatic recreation of incomplete or incompatible `.venv` environments.
- Enforced binary-only dependency installation.
- Added dependency, import, and ODBC-driver verification.
- Added clear first-time setup and normal-launch instructions.

## Launching on Windows and macOS

### Windows

First-time setup:

```bat
setup.bat
```

Normal startup:

```bat
run.bat
```

### macOS

First-time setup:

```bash
chmod +x setup.command run.command
./setup.command
```

Normal startup:

```bash
./run.command
```

The application opens `http://127.0.0.1:5000` in the default browser. Windows and macOS use separate launcher files because `.bat` files cannot run natively on macOS. SQL Server ODBC system drivers are installed separately on each operating system.
