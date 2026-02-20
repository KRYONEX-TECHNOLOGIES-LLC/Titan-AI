# Titan Desktop Windows Release Runbook

## 1) Build web assets

```powershell
cd ..\web
npm run build
```

## 2) Build desktop runtime

```powershell
cd ..\desktop
npm run build
```

## 3) Package stable Windows installer

```powershell
npm run release:win:stable
```

Expected artifact pattern:

- `out/Titan-Desktop-<version>-win-x64.exe`

## 4) Generate checksums

```powershell
npm run release:checksums
```

Output:

- `out/checksums.txt`

## 5) Write/refresh web release manifest

```powershell
npm run release:manifest
```

Writes:

- `apps/web/src/app/api/releases/latest/manifest.json`

## 6) Publish

- Upload installer to release storage path:
  - `https://download.titan.kryonextech.com/windows/`
- Upload `checksums.txt` to same path.
- Deploy web app so `/api/releases/latest` returns latest metadata.

## 7) Validate

- Landing page primary CTA downloads installer on Windows.
- `Checksums` link resolves and includes SHA256 for the installer.
- `Release notes` link resolves to `/release-notes`.
