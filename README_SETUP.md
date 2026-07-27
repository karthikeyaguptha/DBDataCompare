# Data Sync Check v1.7.0 - Windows Setup

Data Sync Check now detects and uses the installed Python 3 runtime instead of requiring Python 3.12 specifically.

## Supported Python versions

- Python 3.12 or later
- 64-bit Python is recommended

The setup checks the following commands in order:

1. `py -3`
2. `python`
3. `python3`

## First-time setup

Open the extracted Data Sync Check project folder and run:

```bat
setup.bat
```

The setup will:

1. Detect Python 3.12 or later.
2. Create the `.venv` virtual environment.
3. Upgrade `pip`.
4. Install `requirements.txt`.
5. Validate the installed dependencies with `pip check`.

After setup completes, start the application with:

```bat
run.bat
```

## Install Python when it is missing

Install the current Python release with Windows Package Manager:

```bat
winget install --id Python.Python.3.14 -e
```

Alternatively, download the Windows installer from the official Python website:

```text
https://www.python.org/downloads/windows/
```

During manual installation, enable:

- Add `python.exe` to `PATH`
- Python Launcher for Windows
- `pip`

Close the current Command Prompt after installation and open a new one before running `setup.bat` again.

## Verify Python

```bat
python --version
py --list
where python
where py
```

A valid installation should report Python 3.12 or later.

## Troubleshooting

### Python is installed, but setup says it is missing

Open a new Command Prompt and run:

```bat
py -3 --version
python --version
```

If `python` opens Microsoft Store instead of showing a version, open:

```text
Settings > Apps > Advanced app settings > App execution aliases
```

Disable the Microsoft Store aliases for `python.exe` and `python3.exe`, then open a new Command Prompt.

### Python 3.14 is installed, but the old setup requests Python 3.12

Replace the previous `setup.bat` with the v1.7.0 file. The updated setup uses the installed Python 3 runtime and accepts Python 3.12 or later.

### Virtual environment creation fails

Run:

```bat
python -m ensurepip --upgrade
python -m pip install --upgrade pip
python -m venv .venv
```

Then rerun:

```bat
setup.bat
```

### Package installation fails

Retry directly:

```bat
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If a package reports that it does not support the installed Python version, install Python 3.12 or 3.13 alongside the current version and rerun setup with that interpreter, or update the affected dependency after compatibility is verified.

Corporate networks may require proxy or firewall access to Python package repositories.

### `run.bat` says the virtual environment is missing

Run:

```bat
setup.bat
```

Do not move `run.bat` or `setup.bat` outside the project root.

## Upgrade from v1.6.0

1. Stop Data Sync Check.
2. Back up locally saved profiles and report output if required.
3. Replace `setup.bat` and `run.bat` with the v1.7.0 versions.
4. Merge this setup section into the main `README.md`.
5. Run `setup.bat`.
6. Run `run.bat`.

Existing comparison functionality is unchanged by this setup update.
