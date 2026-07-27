# Data Sync Check v1.7.0

## Added

- Automatic detection of `py -3`, `python`, or `python3`.
- Support for installed Python versions 3.12 and later.
- Clear first-time setup progress and diagnostic messages.
- Validation for missing `requirements.txt` and inconsistent packages.
- Setup and troubleshooting documentation for Windows.

## Changed

- Removed the hardcoded `py -3.12` virtual-environment command.
- `run.bat` now checks for `.venv` before starting.
- `run.bat` reports a clear error when the application entry file is missing.

## Compatibility note

The setup accepts Python 3.12 or later. Individual third-party packages in `requirements.txt` must also support the installed Python version. If package installation fails on a newly released Python version, use Python 3.12 or 3.13 until the dependency is updated.
