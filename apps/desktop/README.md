# @titan/desktop (Electron)

This package is the **native desktop runtime** for Titan AI. It boots Electron and hosts the Next.js UI, while providing native tools via IPC.

## Dev commands

From repo root (recommended):

```powershell
pnpm dev:desktop
```

Double-click launcher (repo root):

- `Start Titan AI.bat`

## What runs where

- **Electron main process**: `src/main.ts`
- **Preload bridge (renderer → IPC)**: `src/preload.ts`
- **Native tool surface (IPC handlers)**: `src/ipc/*`

The desktop app typically starts an internal Next.js server (default port **3100**) and then loads the UI inside Electron.

## IPC modules (high value)

- **Agent tools (run_command/read/edit/create/etc.)**: `src/ipc/tools.ts`
- **Terminal / PTY**: `src/ipc/terminal.ts`
- **Filesystem**: `src/ipc/filesystem.ts`
- **Git**: `src/ipc/git.ts`

## Windows notes

If you ever see `spawn powershell.exe ENOENT`, the fix is usually in:

- `src/ipc/tools.ts`

Specifically: ensure spawned processes inherit `process.env` and resolve an absolute shell path on Windows.

## “Where do I change X?”

- **App boot / loadURL retry / startup page**: `src/main.ts`
- **Tool implementation bugs**: `src/ipc/tools.ts`
- **Terminal behavior**: `src/ipc/terminal.ts`

For the canonical “how Titan works end-to-end” doc, read:

- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`

