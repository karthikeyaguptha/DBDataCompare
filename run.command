#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1

VENV_PYTHON="$PWD/.venv/bin/python"
READY_MARKER="$PWD/.venv/.data-sync-check-ready"
ENTRY_POINT="$PWD/app.py"

fail() {
  printf '\n[ERROR] %s\n\n' "$1"
  read -r -p "Press Enter to close..." _
  exit 1
}

[ -x "$VENV_PYTHON" ] || fail "Data Sync Check is not set up. Run setup.command first."
[ -f "$READY_MARKER" ] || fail "The local environment is incomplete. Run setup.command again."
[ -f "$ENTRY_POINT" ] || fail "app.py was not found in the application folder."

"$VENV_PYTHON" -c "import flask, waitress, pyodbc, psycopg, dotenv" >/dev/null 2>&1 \
  || fail "The Python environment is damaged or incomplete. Run setup.command again."

printf '%s\n' "============================================================"
printf '%s\n' " Starting Data Sync Check v1.9.4"
printf '%s\n' "============================================================"
printf '%s\n' "Application URL: http://127.0.0.1:5000"
printf '%s\n' "The browser will open automatically."
printf '%s\n\n' "Press Control+C in this window to stop the application."

export DSC_OPEN_BROWSER=1
exec "$VENV_PYTHON" "$ENTRY_POINT"
