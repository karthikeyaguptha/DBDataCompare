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

## Phase 0 status

This checkpoint contains:

- Flask application foundation
- Browser-based starter screen
- Windows setup and launch scripts
- Environment and Git safety rules
- Health endpoint and a basic automated test
- Placeholder modules for database and comparison logic

Database connections and comparison actions are intentionally disabled until
their corresponding implementation phases.

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
| v0.4.0 | Schema comparison |
| v0.5.0 | Row-count comparison |
| v0.6.0 | Scalable data comparison |
| v0.7.0 | Reporting and profiles |
| v1.0.0 | Windows release |

## GitHub checkpoint

The suggested first tag is:

```text
v0.1.0-project-setup
```

Keep the repository private until credentials, logs, screenshots, documentation,
and licensing have been reviewed.

