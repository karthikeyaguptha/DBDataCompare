# Data Sync Check

Data Sync Check is a local Windows application for validating data migrations
from Microsoft SQL Server to PostgreSQL. It compares table structures, exact row
counts, and row-level values, then produces readable reports for review and
sharing.

Dark theme is the first-launch default. Light theme is available and the
selected preference is remembered.

## Features

### Database connections

- Connects to Microsoft SQL Server and PostgreSQL.
- Tests each connection independently with clear error messages.
- Supports SQL Server Authentication and Windows Authentication.
- Provides optional ODBC, certificate, and PostgreSQL SSL settings.
- Keeps passwords out of saved profiles, logs, and reports.

### Table discovery and selection

- Loads table names once and supports fast local search and pagination.
- Shows tables available in both databases.
- Offers SQL Server-only and PostgreSQL-only filters under **More options**.
- Supports single-table and multi-table comparison runs.

### Comparison modes

- **Schema Only**
- **Schema + Row Count**
- **Schema + Row Count + Data**

Schema validation covers approved SQL Server-to-PostgreSQL datatype mappings,
length, precision, scale, nullability, and primary keys. Row counts are exact.
Full data comparison reads both tables in key order and reports changed or
missing rows.

Primary or unique keys are detected automatically when compatible keys exist on
both databases. A manual single or composite key can be supplied when needed.

### Comparison controls

- Recommended default batch size of 5,000 rows.
- Strict or normalized value-comparison rules.
- **Safe Stop** finishes the active query or batch before stopping.
- **Stop Now** attempts immediate driver-level cancellation.
- Completed work is retained for partial reports.
- Comparison can be started or restarted from Step 2 or Step 3.

### Profiles

- Save and automatically load reusable comparison settings.
- Stores connection preferences, filters, tables, keys, mode, batch size, and
  comparison rules.
- Never stores database passwords.
- Selecting **No saved profile** restores the original defaults.

### Results and reporting

- Combined result grid with schema, count, and data verdicts.
- Expandable schema differences and a bounded mismatch preview.
- Readable HTML Comparison Report for single or multiple tables.
- Report filters for table, issue type, key, and value.
- Theme-aware PDF export with `Page X / Y` pagination.
- Natural duration labels such as `4 min 4 sec`.
- Complete JSON, JSONL, CSV, and execution-log exports.

Each run is written to a separate local folder:

```text
reports/
  <run-id>/
    data-sync-check-run-summary.json
    data-sync-check-mismatches.jsonl
    data-sync-check-comparison-summary.csv
    data-sync-check-execution.log
    manifest.json
```

The browser preview is intentionally limited to the first 200 differences.
Use the JSONL export for the complete mismatch set.

## Requirements

- Windows 10 or Windows 11
- Python 3.11 or newer
- Microsoft ODBC Driver 18 for SQL Server
- Network access to the SQL Server and PostgreSQL instances
- Read-only database accounts are strongly recommended

## Setup

Open Command Prompt or PowerShell in the project folder and run:

```powershell
setup.bat
```

Start the application:

```powershell
run.bat
```

Data Sync Check opens locally at:

```text
http://127.0.0.1:5000
```

To set up manually:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Stop the application with `Ctrl+C` in its command window.

## Typical workflow

1. Enter and test both database connections.
2. Load the available tables.
3. Select one or more tables.
4. Choose the comparison mode, batch size, and optional rules.
5. Confirm or enter comparison keys when full data comparison is selected.
6. Start the comparison from Step 2 or Step 3.
7. Review results or stop the run when necessary.
8. Open the Comparison Report or export JSON, JSONL, CSV, or the execution log.
9. Export the HTML report to PDF when a shareable copy is required.

## Important comparison notes

- Keep source and target data stable while a comparison is running.
- Use unique, indexed keys for reliable and efficient row comparison.
- Text-key collations should have compatible ordering across both databases.
- Matching row counts do not prove that row values match.
- An unmapped SQL Server datatype is reported as a schema mismatch.
- For ODBC Driver 18, enable **Trust server certificate** only for an approved
  internal server using a self-signed certificate.

## Security

- The service binds to `127.0.0.1` and is local to the computer by default.
- Do not expose port 5000 through a firewall or router.
- Never commit passwords, connection strings, `.env`, saved profiles, logs, or
  generated reports.
- Credentials are sent only to the local Flask process and remain in the current
  browser form session.
- Reports include only limited connection identity such as server/host,
  database, port, and schema—never credentials.

## Development

Run the test suite:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Run the development server:

```powershell
.\.venv\Scripts\python.exe app.py
```

Project layout:

```text
app.py
db_compare/
  comparison/
  db/
  profiles.py
  reporting.py
  web.py
templates/
static/
tests/
config/
reports/
```

## v1.6.0

- Enlarged the Data Sync Check branding on the Comparison Report.
- Long report metadata now wraps cleanly instead of being shortened with `...`.
- Reorganized this README around the current product features and usage.
- Home-page branding and all established workflows remain unchanged.

## Git checkpoint

```text
docs: refine report branding and product documentation
```

```bash
git tag -a v1.6.0 -m "Refine report branding and documentation"
git push origin v1.6.0
```
