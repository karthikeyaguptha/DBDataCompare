# DB Compare Studio

A Windows-first, local browser application for comparing Microsoft SQL Server
and PostgreSQL databases.

The user interface opens in a browser, while a Python/Flask process runs locally
and performs read-only database comparisons. Database credentials and data are
not sent to an external web server.

## Comparison scope

- Table names
- Column names and metadata
- Approved SQL Server → PostgreSQL datatype compatibility
- Primary-key parity
- Row counts
- Key-based, row-level data comparison
- Progress, Safe Stop and Stop Now controls, execution logs, and exportable reports
- Batch streaming for large tables

## v0.10.0 status

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
- Fixed-height Step 2 table viewport with a sticky header, stable sparse-page layout,
  First/Previous/Next/Last controls, and direct page entry
- Live SQL Server and PostgreSQL column-metadata retrieval
- Case-insensitive column matching with directional SQL Server → PostgreSQL mappings
- Column type, length, precision, scale, timestamp precision, and nullability checks
- Explicit **Schema Match** / **Schema Mismatch** verdicts with expected target types
- Primary-key comparison included in the schema verdict
- Missing and database-only column detection
- Primary-key and unique-key discovery, including composite keys
- Automatic comparison-key matching when the same key exists on both sides
- Table-by-table execution with progress, batch-safe stopping, and best-effort immediate database cancellation
- Expandable per-table column-difference results
- Exact SQL Server counts through `COUNT_BIG(*)`
- Exact PostgreSQL counts through `COUNT(*)`
- Per-table SQL Server/PostgreSQL row totals and absolute count differences
- Independent vertical Schema, Count, and Data result badges; each match is
  green and each difference, skip, stop, or not-run state is amber
- **Schema Only** and **Schema + Row Count** comparison modes
- **Schema + Row Count + Data** selected by default
- Responsive, wrapped table grids that keep result actions inside the viewport
- Header-level bulk selection for all currently filtered Step 2 tables
- Persistent search-clear control and aligned profile/report action groups
- SQL Server and PostgreSQL product icons in the connection cards
- Automatic primary/unique keys and comma-separated manual key overrides
- Composite detected and manual key support
- SQL Server `fetchmany()` and PostgreSQL server-side cursor streaming
- Configurable 2,000, 5,000, or 10,000 row batches
- Background data jobs with lightweight browser progress polling
- Backend cancellation checked between row batches
- Matched, changed, SQL Server-only, and PostgreSQL-only row detection
- Bounded 200-row mismatch preview to protect browser and Python memory
- Complete JSONL mismatch output written incrementally during full comparison
- Readable single-table and multi-table HTML comparison dashboard generated
  from the finalized summary and complete JSONL mismatch files
- Dashboard filters for table, mismatch type, keys, and values with bounded
  pagination for large reports
- Results-grid dashboard action that safely stops and finalizes an active run
  before opening the latest completed data
- Print-optimized PDF export with complete overview totals and up to 1,000
  filtered row-level details
- Downloadable JSON run summary and UTF-8 CSV table summary
- Downloadable execution log for completed and cancelled runs
- Password-free saved profiles for connection preferences, table selections,
  manual keys, filters, mode, batch size, and comparison rules
- Spreadsheet-formula protection for exported CSV text
- Normalisation for nulls, numbers, timestamps/time zones, UUIDs, booleans,
  binary values, JSON-like values, and Unicode text
- Strict defaults with optional trailing-space, case, decimal, and timestamp rules
- Live elapsed-time and completed-table progress
- Planned-check summary plus cumulative discovered and processed row positions
- Accessible Step 1/2/3 accordions with workflow-aware automatic transitions
- Local-service watchdog that invalidates stale connection cards and explains
  how to restart `run.bat` without discarding already-rendered results
- Comparison settings, progress, Safe Stop/Stop Now controls, and result states
- Results and execution-log tabs
- Windows setup and launch scripts
- Environment and Git safety rules
- Health endpoint and automated page checks

Table-name metadata is read
once and retained in a short-lived in-memory catalog for fast search, filtering,
pagination, and safe table mapping. When comparison starts, each selected table
is processed separately so progress remains visible. Safe Stop finishes the
active query or batch, while Stop Now asks the database drivers to cancel active
work and preserves only completed results. Phase 6 retains the Phase 5 engine and retrieves
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

## v0.10.0 workflow

1. Enter SQL Server and PostgreSQL details.
2. Click each **Test** button.
3. Correct any friendly connection error shown in the card or execution log.
4. When both tests succeed, click **Load tables**.
5. Keep **Common** selected for migration comparisons, or include either
   database-only filter to investigate missing tables.
6. Search or page through the cached table-name list.
7. Select one or more tables.
8. Keep **Schema + Row Count + Data** selected. If automatic key detection is unavailable,
   enter one or more comma-separated key columns beside the table.
9. Choose a batch size. `5,000` is the recommended default.
10. Optionally expand **Comparison rules**. Strict comparison is the default.
11. Click **Start comparison**.
12. Review schema, row-count, and row-data differences in the combined result.
13. Expand **View details** for column differences and the mismatch preview.
14. Use **Safe Stop** to finish the current query or data batch before halting.
15. Use **Stop Now** when you need to attempt immediate driver-level cancellation; only completed work is preserved.
16. After completion or cancellation, choose **Data Mismatch Report**,
    **JSON Run Summary**, **CSV Run Summary**, or **Execution Log** and click
    **Export**.

### Saved profiles

Use the **save icon** to store a reusable comparison setup. Selecting a saved
profile loads it automatically. Profiles include
connection preferences, selected tables, manual/composite keys, filters,
comparison mode, batch size, and value-comparison rules. The header theme control
follows the operating-system preference initially and remembers Light/Dark choices
in the local browser.

Passwords are never saved. After loading a profile, enter both passwords again,
test both connections, and reload tables. Saved table selections are then
restored wherever those tables remain available under the saved filters.
Choosing **No saved profile** restores the connection cards and comparison
settings to their original defaults and clears the loaded table scope.

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

**Schema Only** and **Schema + Row Count** runs produce an empty mismatch JSONL
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

The column count is shown as **SQL Server / PostgreSQL**. Type matching uses
approved migration equivalents rather than requiring identical type names.
Examples include `int → integer`, `tinyint → smallint`, `bit → boolean`,
`datetime → timestamp`, `uniqueidentifier → uuid`, `varbinary → bytea`, and
`varchar(max) → text`. Fixed and variable character lengths and numeric
precision/scale must agree. Nullability and primary-key columns must also agree.
An SQL Server type outside the approved mapping is reported as a schema mismatch
instead of being accepted merely because PostgreSQL exposes a similarly named type.

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
| v0.7.1 | Pre-release UI polish |
| v0.7.2 | Theme, navigation, and dual stop controls |
| v0.7.3 | Notification contrast and precise partial-match statuses |
| v0.7.4 | Persistent connection success panels, aligned connection options, and offline-safe bundled database icons |
| v0.7.5 | Theme-safe contrast for the locked Step 2 table-discovery state |
| v0.7.6 | Workflow accordions, three-layer result badges, comparison-volume progress, fixed table viewport, direct pagination, and local-service recovery |
| v0.7.7 | Compact local-service status, aligned profile actions, red delete icon, and consistent accordion header controls |
| v0.7.8 | Simplified connection cards, advanced options, automatic profile loading, and icon-only profile actions |
| v0.7.9 | Whole-header accordions, clearer selection and pagination controls, SQL port help, and reliable profile reset/loading |
| v0.8.0 | Approved SQL Server → PostgreSQL datatype baseline, explicit schema verdicts, and primary-key validation |
| v0.9.0 | Readable comparison dashboard, active-run handoff, multi-table filters, and PDF-ready reporting |
| v0.10.0 | Compact workflow tracker, connection-aware report metadata, matching comparison-mode labels, and theme-preserving dashboard/PDF export |
| v1.0.0 | Windows release |

## GitHub checkpoint

The suggested v0.10.0 commit is:

```text
feat: refine dashboard metadata, layout, and theme export
```

The suggested v0.10.0 tag is:

```text
v0.10.0-dashboard-refinement
```

Keep the repository private until credentials, logs, screenshots, documentation,
and licensing have been reviewed.
