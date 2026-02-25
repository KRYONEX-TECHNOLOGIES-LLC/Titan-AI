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

## Desktop-specific features

### Voice Input

Voice input uses the Web Speech API (available in Chromium/Electron). The mic button in the chat input toggles speech-to-text. Transcribed text is appended to the chat input and auto-sends after 2.5s of silence. Error messages (permission denied, no network) display inline below the input.

### Auto-Workspace

On launch, if no workspace folder is loaded, the desktop app automatically creates `C:\TitanWorkspace` and opens it. This enables fully autonomous operation from first launch without requiring the user to manually select a folder.

### IPC capabilities used by voice/workspace

- `electronAPI.fs.mkdir` — Creates the default workspace directory
- `electronAPI.fs.readDir` — Reads directory contents for workspace loading
- `electronAPI.dialog.openFolder` — Native folder picker

## "Where do I change X?"

- **App boot / loadURL retry / startup page**: `src/main.ts`
- **Tool implementation bugs**: `src/ipc/tools.ts`
- **Terminal behavior**: `src/ipc/terminal.ts`

For the canonical "how Titan works end-to-end" doc, read:

- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`
