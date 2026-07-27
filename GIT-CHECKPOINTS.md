# Git checkpoints for Data Sync Check v1.7.2

Use small, reviewable commits in this order.

## 1. Add controlled Python bootstrap

```bash
git add setup.bat repair.bat uninstall-environment.bat scripts/setup.ps1
git commit -m "build: add controlled Python 3.13 bootstrap and repair flow"
```

## 2. Lock compatible dependencies

```bash
git add requirements-runtime.txt requirements-dev.txt
git commit -m "build: pin binary-compatible runtime dependencies"
```

## 3. Harden application launch

```bash
git add run.bat scripts/run.ps1 config/launcher.env
git commit -m "fix: validate local runtime before application launch"
```

## 4. Add installation documentation

```bash
git add README.md docs/INSTALLATION.md RELEASE_NOTES-v1.7.2.md VERSION .gitignore
git commit -m "docs: add reliable Windows installation guide for v1.7.2"
```

If retaining the existing README, merge `README-v1.7.2.md` into `README.md` before this commit.

## 5. Validate before tagging

```bat
repair.bat
run.bat
```

Run the repository test suite and verify both PostgreSQL and SQL Server connection screens. SQL Server testing requires the manually installed Microsoft ODBC driver.

## 6. Push and tag

```bash
git push origin main
git tag -a v1.7.2 -m "Reliable Windows installation and controlled Python runtime"
git push origin v1.7.2
```

Recommended pull-request title:

```text
Data Sync Check v1.7.2 — reliable Windows setup and dependency compatibility
```
