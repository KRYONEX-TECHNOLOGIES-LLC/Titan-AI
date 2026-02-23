# TITAN AI — MISTAKES LEDGER
# Auto-loaded every session. Read this BEFORE touching any file.
# These are real mistakes that broke the app in production.

---

## MISTAKE-001: Stripped electron-builder.config.js
**Date:** 2026-02-23
**What happened:** Titan rewrote electron-builder.config.js from 208 lines down to 63 lines,
calling it a "simplification". Removed flattenPnpmNodeModules(), afterPack hook, NSIS config,
and node_modules/**/* from the files array.
**What broke:** Packaged app crashed with MODULE_NOT_FOUND on startup. All NSIS branding was lost.
**Root cause:** Did not read or understand the file before editing it.
**Rule added:** NEVER simplify config files. Every line is load-bearing.
**Recovery cost:** Full restore from git history, manual rebuild, re-upload.

---

## MISTAKE-002: Removed electron-builder from devDependencies
**Date:** 2026-02-23
**What happened:** Titan removed electron-builder from devDependencies, thinking it was unused.
**What broke:** All CI builds failed. pnpm install succeeded but electron-builder command not found.
**Root cause:** Did not grep for usages before removing.
**Rule added:** Never remove a dependency without grepping for usages first.
**Recovery cost:** Re-added dependency, updated lockfile, full CI re-run.

---

## MISTAKE-003: Removed --config flag from build scripts
**Date:** 2026-02-23
**What happened:** Titan removed "--config electron-builder.config.js" from pack/release scripts,
calling it redundant.
**What broke:** electron-builder silently used defaults instead of the custom config,
outputting to wrong directory (dist/win-unpacked instead of out/), missing dist/main.js in asar.
**Root cause:** Assumed the config would be auto-detected. It was not.
**Rule added:** All pack/release scripts MUST include --config flag. Never remove it.
**Recovery cost:** Re-added flags, rebuilt, re-uploaded installer.

---

## MISTAKE-004: Bumped version 5 times without a working build
**Date:** 2026-02-23
**What happened:** Titan bumped version from v0.2.0 through v0.2.5 creating 5 tags,
none of which produced a working release (all GitHub Actions runs failed).
**What broke:** Left orphaned tags and a broken draft release with zero assets.
Users could not download a working installer.
**Root cause:** No pre-commit verification. Did not confirm CI was green before tagging.
**Rule added:** NEVER tag a release unless the previous CI build was green.
**Recovery cost:** Deleted all bad tags, full pipeline fix, fresh v0.2.0 release.

---

## MISTAKE-005: Committed broken TypeScript (ipc/tools.js missing)
**Date:** 2026-02-23
**What happened:** Titan's changes left tsconfig.tsbuildinfo stale, causing tsc to skip emitting
ipc/tools.js and other compiled files. The packaged app then crashed: "Cannot find module './ipc/tools.js'"
**What broke:** Downloaded installer was non-functional, crashed immediately on launch.
**Root cause:** Did not run tsc --noEmit before committing. Did not test the packaged output.
**Rule added:** Always run tsc --noEmit before any commit touching TypeScript files.
Clean script must delete tsconfig.tsbuildinfo (rimraf dist out tsconfig.tsbuildinfo).
**Recovery cost:** Full rebuild, re-upload to GitHub release.

---

## MISTAKE-006: Called IPC handlers with wrong argument order
**Date:** 2026-02-23
**What happened:** registerIpcHandlers() was calling registerToolHandlers(browserWindow) but the
function signature was registerToolHandlers(ipcMain, win). Same issue in 7 other IPC handlers.
Also: saveWindowState(store, mainWindow) when signature was saveWindowState(win, store).
Also: createAppMenu(store) when signature was createAppMenu(win: BrowserWindow).
**What broke:** TypeScript build failed with multiple type errors. CI failed.
**Root cause:** Added code without reading the function signatures first.
**Rule added:** Always read function signatures before calling them.
**Recovery cost:** Manual fix of all 9 wrong call sites, CI re-run.

---

## MISTAKE-007: Railway/CI config used wrong build command for monorepo
**Date:** 2026-02-23
**What happened:** Railway was configured to run "npm ci && npm run build" from the apps/web
root directory. This ran "pnpm build" which built all 45 packages in the monorepo, failing on
unrelated packages with TypeScript errors (packages/core/terminal, packages/core/filesystem, etc.)
**What broke:** Every Railway deployment failed. Landing page showed old version.
**Root cause:** Did not understand Railway's root directory setting. Did not isolate the build.
**Rule added:** Railway rootDirectory = apps/web. Build command = "npm ci && npm run build"
from that directory (not pnpm, not turbo). Never touch Railway/Vercel configs without
understanding where they execute from.
**Recovery cost:** Multiple failed deploys, config research, manual manifest update.

---

## MISTAKE-008: Used invalid OpenRouter model IDs causing HTTP 400 errors
**Date:** 2026-02-23
**What happened:** Used "qwen3.5-plus-2026-02-15" and "deepseek-reasoner" as model IDs.
Neither is a valid OpenRouter model ID. Every protocol run failed with HTTP 400.
**What broke:** Titan Protocol v2, Supreme, and Omega all crashed at LLM call stage.
**Root cause:** Copy-pasted IDs without verifying against OpenRouter's model list.
**Rule added:** Always verify model IDs against the canonical table in AGENT-SYNC.md.
Correct IDs: qwen/qwen3.5-plus-02-15, deepseek/deepseek-r1, qwen/qwen3-coder-next, google/gemini-2.0-flash-001
**Recovery cost:** Updated 8 files, full audit of all protocol configs.

---

## MISTAKE-009: Removed vscode-core from .gitignore causing embedded repo warning
**Date:** 2026-02-23
**What happened:** vscode-core directory (an embedded git repo) was tracked by git without a
.gitmodules entry, causing CI checkout to fail with "No url found for submodule path 'vscode-core'".
**What broke:** GitHub Actions checkout step failed, blocking all CI builds.
**Root cause:** Stale submodule reference left in git index, never cleaned up.
**Rule added:** Embedded git repos MUST be in .gitignore. Run "git rm --cached <dir>"
before ignoring to clean the index.
**Recovery cost:** Multiple CI runs wasted debugging, manual index cleanup.

---

## HOW TO USE THIS FILE
- Read this file at the start of any session involving: build system, electron, IPC, package.json, config files, model IDs, CI/CD, deployment
- Before "simplifying" any file: search this ledger for similar past mistakes
- After making a mistake: append a new entry using the format above
- Append new entries at the bottom, never edit existing entries

<!-- NEW MISTAKES BELOW THIS LINE -->
