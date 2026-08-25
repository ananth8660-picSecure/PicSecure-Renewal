# Push PicSecure Renew to GitHub

The GitHub-ready ZIP already contains a clean `main` commit and this repository as `origin`:

```text
https://github.com/ananth8660-picSecure/PicSecure-Renewal.git
```

Extract the ZIP, open the `PicSecure-Renew` folder, and either double-click `PUSH-TO-GITHUB.bat` or run:

```powershell
git push -u origin main
```

Git Credential Manager may open a browser the first time. Sign in to the GitHub account that owns the repository and approve it. Do not paste a Personal Access Token into chat.

Before pushing, confirm that `.env.local`, service-account JSON files, exported renewal backups, APK signing keys, `node_modules`, and build folders are not listed by `git status`.

For automatic EXE and APK builds, add the GitHub Actions values listed in the **Private GitHub releases** section of `README.md`, then create a release tag:

```powershell
git tag v0.4.0
git push origin v0.4.0
```
