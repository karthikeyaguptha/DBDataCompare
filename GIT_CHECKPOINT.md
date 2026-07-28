# Data Sync Check v1.8.0 Git checkpoint

Use one checkpoint for the complete installation cleanup:

```bash
git add .
git commit -m "release: simplify Windows setup and launcher for v1.8.0"
git push origin main

git tag -a v1.8.0 -m "Clean Windows setup with a single requirements file"
git push origin v1.8.0
```
