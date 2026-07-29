# Data Sync Check v1.9.9

## Project organization

- Keeps setup, run, dependency, version, and entry-point files at the root.
- Groups all browser templates and static assets under `web/`.
- Groups generated configuration, reports, and logs under `data/`.
- Moves historical release notes and Git checkpoint files under `docs/`.
- Adds a project-structure guide and runtime-safe `.gitignore`.
- Migrates existing root-level profiles, table selections, and reports without
  overwriting content already stored in the new locations.
- Preserves existing Windows and macOS setup and startup commands.
