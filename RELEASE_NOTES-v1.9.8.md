# Data Sync Check v1.9.8

## Fixed 10-row report overview

- Replaces the approximately 20-row scrolling overview with a fixed 10-row viewport.
- Adds Previous and Next pagination controls with visible range and page status.
- Keeps schema-detail rows paired with their parent table.
- Resets to the first page when All, Matched, or Not Matched is selected.

## Complete PDF export

- Screen pagination does not affect PDF output.
- PDF export restores every table overview record, regardless of the active filter or page.
- Every filtered row-level mismatch continues to be loaded before printing.

## Compatibility

- No comparison, connection, profile, or reusable-table-selection behavior changed.
- Light and Dark report themes remain supported.
