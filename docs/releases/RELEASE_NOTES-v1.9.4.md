# Data Sync Check v1.9.4

## Reconciliation selection

- Removes the visible **Select All** label and retains the master checkbox.
- Allows SQL Server-only and PostgreSQL-only rows to be selected.
- Keeps common tables selected by default.
- Applies every checked, resolvable row to the main Step 2 table selection.
- Treats selected one-sided rows as non-comparable during a run and reports the missing counterpart.
- Keeps missing-in-both and ambiguous rows visible but disabled.

## Scope

- Preserves saved selections, pagination, comparison modes, reports, themes, profiles, and stop behavior.
