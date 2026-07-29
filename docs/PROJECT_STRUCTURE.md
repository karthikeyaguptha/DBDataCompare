# Data Sync Check project structure

The project is organized so the files used by normal users remain easy to find,
while source code, browser assets, runtime data, tests, and release history stay
in dedicated folders.

```text
data-sync-check/
├── app.py                  Application entry point
├── setup.bat               Windows first-time setup
├── run.bat                 Windows normal startup
├── setup.command           macOS first-time setup
├── run.command             macOS normal startup
├── requirements.txt        Single Python dependency reference
├── VERSION                 Current application version
├── README.md               Main user and developer guide
├── db_compare/             Python application source
│   ├── comparison/         Schema, count, and data comparison engines
│   └── db/                 SQL Server and PostgreSQL adapters
├── web/
│   ├── templates/          Flask HTML templates
│   └── static/             CSS, JavaScript, images, and branding
├── data/
│   ├── config/             Saved profiles and reusable table selections
│   ├── reports/            Generated comparison reports
│   └── logs/               Runtime logs
├── docs/
│   ├── INSTALLATION.md     Detailed setup guide
│   ├── releases/           Version history and release notes
│   └── checkpoints/        Git checkpoint instructions
└── tests/                  Automated regression tests
```

## Files to use

For a first-time installation, run only the setup file for the operating system.
For every later launch, run only the corresponding run file.

| Operating system | First time | Normal launch |
|---|---|---|
| Windows | `setup.bat` | `run.bat` |
| macOS | `setup.command` | `run.command` |

Do not manually move files out of these folders. The launchers resolve paths
from the project root, and the application creates runtime JSON and report files
inside `data/` when needed.

