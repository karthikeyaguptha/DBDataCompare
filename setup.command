#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1

PYTHON_CMD=""
for candidate in python3.13 python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 13) else 1)' >/dev/null 2>&1; then
      PYTHON_CMD="$candidate"
      break
    fi
  fi
done

fail() {
  printf '\n[ERROR] %s\n\n' "$1"
  read -r -p "Press Enter to close..." _
  exit 1
}

[ -n "$PYTHON_CMD" ] || fail "Python 3.13 was not found. Install Python 3.13, then run setup.command again."
[ -f "requirements.txt" ] || fail "requirements.txt was not found."
[ -f "app.py" ] || fail "app.py was not found."

printf '%s\n' "============================================================"
printf '%s\n' " Data Sync Check v1.9.6 - First-time Setup for macOS"
printf '%s\n' "============================================================"

if [ -d ".venv" ]; then
  if ! .venv/bin/python -c 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 13) else 1)' >/dev/null 2>&1; then
    printf '%s\n' "Removing an incompatible .venv..."
    rm -rf .venv || fail "Unable to remove the existing .venv folder."
  fi
fi

[ -d ".venv" ] || "$PYTHON_CMD" -m venv .venv || fail "Unable to create the virtual environment."

VENV_PYTHON="$PWD/.venv/bin/python"
"$VENV_PYTHON" -m pip install --upgrade pip setuptools wheel || fail "Unable to upgrade pip tooling."
"$VENV_PYTHON" -m pip install -r requirements.txt || fail "Unable to install Python dependencies."
"$VENV_PYTHON" -m pip check || fail "Dependency conflicts were detected."
"$VENV_PYTHON" -c "import flask, waitress, pyodbc, psycopg, dotenv; from db_compare import create_app; create_app()" \
  || fail "Application verification failed."

touch .venv/.data-sync-check-ready

printf '\n%s\n' "[OK] Data Sync Check v1.9.6 setup completed successfully."
printf '%s\n' "Run run.command to start the application."
printf '%s\n' "SQL Server ODBC system drivers must be installed separately on macOS."
read -r -p "Press Enter to close..." _
