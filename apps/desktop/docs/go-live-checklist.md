# Titan Desktop Go-Live Checklist

## Build Validation

- [x] Web build succeeds with landing/download routes (`npm run build` in `apps/web`)
- [x] Desktop TypeScript build succeeds (`npm run build` in `apps/desktop`)
- [x] Windows installer packages successfully (`npm run pack:win`)
- [x] Checksums generated for release artifacts (`npm run release:checksums`)
- [x] Release metadata endpoint available at `/api/releases/latest`

## Product Routing Validation

- [x] Desktop app loads product runtime at `/editor`
- [x] Web root `/` serves landing page (not IDE)
- [x] Web access to `/editor` redirects to `/`
- [x] Desktop-only APIs are blocked in web deployment by middleware

## Download Funnel Validation

- [x] Landing page fetches release metadata
- [x] Primary CTA uses OS-aware download path
- [x] Windows card exposes installer + checksum + release notes links
- [x] Terms, Privacy, and Release Notes pages resolve

## Release Artifact Notes

- Generated artifact:
  - `apps/desktop/out/Titan-Desktop-0.1.0-win-x64.exe`
- Generated checksum file:
  - `apps/desktop/out/checksums.txt`

## Known Non-Blocking Warnings

- Electron runtime may log GPU cache access errors on some Windows profiles when cache folders are permission-restricted.
- This does not block app startup or desktop operation.
