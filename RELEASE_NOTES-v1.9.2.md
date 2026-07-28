# Data Sync Check v1.9.2

## Portable table templates

- Save a table selection as either Connection-specific or Portable.
- Reuse portable templates with a different SQL Server/PostgreSQL database pair.
- Review reconciliation results before any portable template changes the active selection.
- See tables that are available in both databases, SQL Server only, PostgreSQL only, missing, or ambiguous.
- Apply only tables that are available in both; unavailable tables are never silently selected.
- Restore applicable manual keys, comparison mode, and batch size.

## JSON transfer

- Export a saved table selection as a Data Sync Check JSON file.
- Import the same JSON into another Data Sync Check installation.
- Excludes usernames, passwords, and authentication secrets.

## Compatibility

- Existing v1.9.1 saved selections continue to behave as connection-specific selections.
- Existing comparison, pagination, profile, reporting, theme, and stop workflows remain unchanged.
