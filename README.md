# DB Compare Studio

A Windows-first, local browser application for comparing Microsoft SQL Server
and PostgreSQL databases.

The user interface opens in a browser, while a Python/Flask process runs locally
and performs read-only database comparisons. Database credentials and data are
not sent to an external web server.

## Planned comparison scope

- Table names
- Column names and metadata
- Row counts
- Key-based, row-level data comparison
- Progress, cancellation, execution logs, and exportable reports
- Batch streaming for large tables

## Phase 2 status

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
- Comparison settings, progress, Start/Stop controls, and result states
- Results and execution-log tabs
- Windows setup and launch scripts
- Environment and Git safety rules
- Health endpoint and automated page checks

Phase 2 retrieves table names only. Column metadata, primary/unique keys, and
the actual schema comparison intentionally begin in Phase 3. Table-name
metadata is small compared with table data: the local backend reads and merges
the names once, then keeps a short-lived in-memory catalog for search, status
filtering, and pagination. Repeated searches do not reconnect to both databases.
Only the requested page is sent to the browser. No table rows are loaded in
Phase 2.

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

## Phase 2 workflow

1. Enter SQL Server and PostgreSQL details.
2. Click each **Test** button.
3. Correct any friendly connection error shown in the card or execution log.
4. When both tests succeed, click **Load tables**.
5. Keep **Common** selected for migration comparisons, or include either
   database-only filter to investigate missing tables.
6. Search or page through the cached table-name list.

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

Phase 3 will add column counts, column metadata, key discovery, and detailed
schema results.

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

The suggested Phase 2 commit is:

```text
feat: add live database connectivity and table discovery
```

The suggested Phase 2 tag is:

```text
v0.3.0-database-connectivity
```

Keep the repository private until credentials, logs, screenshots, documentation,
and licensing have been reviewed.
