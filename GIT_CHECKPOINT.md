# Git checkpoint - v1.7.0

Review the replacement files first, then run:

```bash
git status
git diff -- setup.bat run.bat README.md
```

Stage the setup update:

```bash
git add setup.bat run.bat README.md
git commit -m "fix: support installed Python 3.12 or later"
```

Push the commit:

```bash
git push origin main
```

Create and push the release tag:

```bash
git tag -a v1.7.0 -m "Improve Python detection and Windows setup"
git push origin v1.7.0
```

Suggested release title:

```text
Data Sync Check v1.7.0 - Python Setup Improvements
```
