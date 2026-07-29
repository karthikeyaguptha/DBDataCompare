# Data Sync Check v1.10.0

## Configurable datatype validation

- Adds a Settings page for managing approved SQL Server → PostgreSQL base
  datatype mappings.
- Supports adding, editing, and removing mappings without source-code changes.
- Validates duplicate, empty, malformed, and oversized configuration entries.
- Stores settings atomically in `data/config/app-settings.json`.
- Uses the existing mappings as backward-compatible defaults.
- Retains strict precision, scale, and length checks for parameterized types.

## Configurable notifications

- Adds a 1–30 second notification-duration setting.
- Applies the saved duration to workspace and report notifications.
- Keeps the manual close button and a five-second fallback.

## Data Mismatch Report filters

- Converts Value mismatch, Only in SQL Server, and Only in PostgreSQL count tags
  into accessible filter buttons.
- Shows the active state and resets mismatch pagination when a tag is selected.
- Allows the selected tag to be clicked again to clear the filter.
- Keeps dropdown, search, pagination, and PDF export filtering aligned.

## Compatibility and validation

- Preserves saved connection profiles, reusable table selections, and reports.
- Requires no database migration.
- Passes the complete automated regression suite: 82 tests.
