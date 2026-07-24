# DB Compare Studio

A Windows-first, local browser application for comparing Microsoft SQL Server
and PostgreSQL databases.

The user interface opens in a browser, while a Python/Flask process runs locally
and performs read-only database comparisons. Database credentials and data are
not sent to an external web server.

## Comparison scope

- Table names
- Column names and metadata
- Row counts
- Key-based, row-level data comparison
- Progress, cancellation, execution logs, and exportable reports
- Batch streaming for large tables

## Phase 6 status

This checkpoint contains:

- Flask application foundation
- Modern, responsive browser workspace
- Live SQL Server connectivity through `pyodbc`
- Live PostgreSQL connectivity through Psycopg 3
- Connection validation, timeout handling, and safe user-facing errors
- Explicit ODBC driver detection and separate network, login, certificate,
  database-access, and timeout diagnostics
- SQL Server Authentication selected by default; Windows Authentication supported
- Optional SQL Server `Trust server certificate` setting
- Live schema-based table discovery for both databases
- Case-insensitive same-name table availability preview
- Common, SQL Server-only, and PostgreSQL-only table filters; Common is selected by default
- Cached backend table search and pagination; only the current page is sent to the browser
- Password visibility controls
- Paginated table selection with fast search, filtered select-all, and page size
- Live SQL Server and PostgreSQL column-metadata retrieval
- Case-insensitive column matching with compatible cross-database type families
- Column type, length, precision, scale, timestamp precision, and nullability checks
- Missing and database-only column detection
- Primary-key and unique-key discovery, including composite keys
- Automatic comparison-key matching when the same key exists on both sides
- Table-by-table schema execution with progress and safe Stop behaviour
- Expandable per-table column-difference results
- Exact SQL Server counts through `COUNT_BIG(*)`
- Exact PostgreSQL counts through `COUNT(*)`
- Per-table SQL Server/PostgreSQL row totals and absolute count differences
- Combined status covering both schema and row-count results
- Structure-only and Structure + row count comparison modes
- Full comparison mode selected by default
- Automatic primary/unique keys and comma-separated manual key overrides
- Composite detected and manual key support
- SQL Server `fetchmany()` and PostgreSQL server-side cursor streaming
- Configurable 2,000, 5,000, or 10,000 row batches
- Background data jobs with lightweight browser progress polling
- Backend cancellation checked between row batches
- Matched, changed, SQL Server-only, and PostgreSQL-only row detection
- Bounded 200-row mismatch preview to protect browser and Python memory
- Complete JSONL mismatch output written incrementally during full comparison
- Downloadable JSON run summary and UTF-8 CSV table summary
- Downloadable execution log for completed and cancelled runs
- Password-free saved profiles for connection preferences, table selections,
  manual keys, filters, mode, batch size, and comparison rules
- Spreadsheet-formula protection for exported CSV text
- Normalisation for nulls, numbers, timestamps/time zones, UUIDs, booleans,
  binary values, JSON-like values, and Unicode text
- Strict defaults with optional trailing-space, case, decimal, and timestamp rules
- Live elapsed-time and completed-table progress
- Comparison settings, progress, Start/Stop controls, and result states
- Results and execution-log tabs
- Windows setup and launch scripts
- Environment and Git safety rules
- Health endpoint and automated page checks

Table-name metadata is read
once and retained in a short-lived in-memory catalog for fast search, filtering,
pagination, and safe table mapping. When comparison starts, each selected table
is processed separately so progress remains visible and Stop can take effect
after the current table query. Phase 6 retains the Phase 5 engine and retrieves
exact counts directly in each
database, then streams ordered business rows using the selected comparison key.
Only the current driver batch and a bounded mismatch preview are retained in
memory. Every mismatch is written immediately to JSONL, so the complete export
does not depend on the browser preview limit.

## Windows prerequisites

1. Windows 10 or Windows 11, 64-bit
2. Python 3.12, 64-bit
3. Microsoft ODBC Driver 18 for SQL Server
4. GitHub Desktop
5. Network access and read-only credentials for both databases

During Python installation, select **Add Python to PATH**. You can verify the
installation in PowerShell:

```powershell
py -3.12 --version
```

## First-time setup

After cloning or downloading this repository:

1. Double-click `setup.bat`.
2. Wait for the dependency installation to finish.
3. Double-click `run.bat`.
4. The application opens at `http://127.0.0.1:5000`.

PowerShell alternative:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Stop the application by returning to its command window and pressing `Ctrl+C`.

## Phase 6 workflow

1. Enter SQL Server and PostgreSQL details.
2. Click each **Test** button.
3. Correct any friendly connection error shown in the card or execution log.
4. When both tests succeed, click **Load tables**.
5. Keep **Common** selected for migration comparisons, or include either
   database-only filter to investigate missing tables.
6. Search or page through the cached table-name list.
7. Select one or more tables.
8. Keep **Full comparison** selected. If automatic key detection is unavailable,
   enter one or more comma-separated key columns beside the table.
9. Choose a batch size. `5,000` is the recommended default.
10. Optionally expand **Comparison rules**. Strict comparison is the default.
11. Click **Start comparison**.
12. Review schema, row-count, and row-data differences in the combined result.
13. Expand **View details** for column differences and the mismatch preview.
14. Use **Stop** to cancel safely after the current query or data batch.
15. After completion or cancellation, choose JSON summary, JSONL mismatch
    details, CSV summary, or execution log and click **Export**.

### Saved profiles

Use **Save profile** to store a reusable comparison setup. Profiles include
connection preferences, selected tables, manual/composite keys, filters,
comparison mode, batch size, and value-comparison rules.

Passwords are never saved. After loading a profile, enter both passwords again,
test both connections, and reload tables. Saved table selections are then
restored wherever those tables remain available under the saved filters.

Profiles are stored only on the local computer in `config/profiles.json`.

### Report files

Every run creates a separate local folder:

```text
reports/
  <run-id>/
    run-summary.json
    mismatches.jsonl
    comparison-summary.csv
    execution.log
    manifest.json
```

- `run-summary.json` contains run settings, totals, and per-table summaries.
- `mismatches.jsonl` contains one complete mismatch record per line.
- `comparison-summary.csv` is a spreadsheet-friendly table summary.
- `execution.log` contains the visible session log captured at finalization.
- `manifest.json` records the run identity and complete/cancelled state.

Structure-only and Structure + row-count runs produce an empty mismatch JSONL
because they do not compare row values. Reports, logs, and saved profiles are
local runtime files and are excluded from Git.

For SQL Server ODBC Driver 18, encryption is enabled. Leave **Trust server
certificate** off when the server has a certificate trusted by Windows. Enable
it only for an approved internal server that uses a self-signed certificate.

### SQL Server connection troubleshooting

Confirm that the same Python environment used by the app can see the driver:

```powershell
.\.venv\Scripts\python.exe -c "import pyodbc; print(pyodbc.drivers())"
```

If Driver 18 is listed but the connection still fails, follow the specific
message shown by the app:

- **Could not be reached**: verify the server/instance name, port, SQL Server
  service, TCP/IP, firewall, and network/VPN.
- **Rejected the login**: verify SQL Server Authentication is enabled and check
  the username and password.
- **Database could not be opened**: verify the database name and that the login
  has access.
- **Certificate validation failed**: verify the server certificate; use Trust
  server certificate only for an approved internal server.
- **Timed out**: verify the server address, network path, and firewall.

The table status values mean:

- **Available in both**: the same table name exists in both schemas, ignoring case.
- **SQL Server only**: the name exists only in the selected SQL Server schema.
- **PostgreSQL only**: the name exists only in the selected PostgreSQL schema.

The column count is shown as **SQL Server / PostgreSQL**. Type matching recognises
common equivalents such as SQL Server `int` and PostgreSQL `integer`,
`nvarchar` and `character varying`, and `bit` and `boolean`. Length, numeric
precision/scale, timestamp precision, and nullability must also agree.

The comparison key is selected automatically when matching primary or unique
keys exist on both databases. **Keys differ** means keys were discovered but do
not map to the same columns. **Key required** means neither database exposes a
matching key. Enter a manual key as `CustomerId` or a composite key such as
`CustomerId, AddressType`. Every manual key column must exist on both sides.

Row counts are exact rather than estimates. `COUNT(*)`/`COUNT_BIG(*)` can take
time on very large tables, and the source and target should remain stable while
the comparison runs. A count difference proves that the table contents differ;
matching counts do not prove that every row value matches.

Row comparison reads each table ordered by its key. For best performance and
stable results, the key should be unique and indexed, and both databases should
remain unchanged during the run. Text-key collations should use compatible
ordering rules across the two databases.

The Results view intentionally keeps only the first 200 differences so very
large migrations do not overload the browser. Export JSONL to review the
complete mismatch set.

## Development commands

Run the tests:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Run the development server:

```powershell
.\.venv\Scripts\python.exe app.py
```

## Security rules

- Use read-only database accounts.
- Never commit passwords, connection strings, `.env`, logs, or reports.
- Password values must never be written to application logs.
- Credentials are posted only to the local Flask process and retained in the
  browser form for the current page session; they are not saved by the app.
- The server binds to `127.0.0.1`, so it is accessible only from the local
  computer by default.
- Do not expose port 5000 through a firewall or router.

## Project structure

```text
app.py
db_compare/
  web.py
  db/
  comparison/
  reporting.py
  profiles.py
templates/
static/
config/
logs/
reports/
tests/
setup.bat
run.bat
```

## Planned milestones

| Version | Milestone |
|---|---|
| v0.1.0 | Project setup |
| v0.2.0 | Modern UI shell |
| v0.3.0 | Database connectivity |
| v0.3.1 | Connectivity diagnostics fix |
| v0.3.2 | Fast table search and availability filters |
| v0.4.0 | Schema comparison |
| v0.5.0 | Row-count comparison |
| v0.6.0 | Scalable data comparison |
| v0.7.0 | Reporting and profiles |
| v1.0.0 | Windows release |

## GitHub checkpoint

The suggested Phase 6 commit is:

```text
feat: add reports and saved comparison profiles
```

The suggested Phase 6 tag is:

```text
v0.7.0-reporting
```

Keep the repository private until credentials, logs, screenshots, documentation,
and licensing have been reviewed.
