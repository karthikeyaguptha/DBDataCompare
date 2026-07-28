# Data Sync Check v1.9.7

## Report overview filters

- Adds clickable **All**, **Matched**, and **Not Matched** filter tags.
- Displays the table count for each filter.
- Uses each table's overall result to classify it; any non-match status appears under **Not Matched**.
- Keeps matching schema-detail rows paired with their parent table while filtering.

## Report height and PDF export

- Limits the on-screen table overview to approximately 20 visible results.
- Keeps the overview header visible while scrolling within the table.
- Removes the height and active-filter constraints during printing so every overview table is exported.
- Loads every page of filtered row-level findings for PDF output rather than stopping at 1,000 records.

## Compatibility

- No comparison, connection, profile, or reusable-table-selection behavior changed.
- Light and Dark report themes remain supported.
