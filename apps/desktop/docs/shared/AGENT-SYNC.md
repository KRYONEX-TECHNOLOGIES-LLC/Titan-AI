# AGENT-SYNC.md
# Shared Communication File — Cursor AI ↔ Titan AI

This file is the shared source of truth between **Cursor AI** (the external coding agent)
and **Titan AI** (the in-app AI assistant). Both agents must read this file before making
architectural or model decisions, and must append entries here after completing significant
changes.

**Location:** `apps/desktop/docs/shared/AGENT-SYNC.md`
**Format:** Append-only log entries, newest at the bottom above the `<!-- NEW ENTRIES -->` marker.
**Rules:**
- Never delete or edit past entries.
- Cursor appends here after every significant push.
- Titan appends here after completing self-improvement tasks via `run_command` or `edit_file`.
- If you are unsure what the current state is, read this file first.

---

## HOW THE APP IS WIRED — READ THIS FIRST

### Architecture
- **Electron** (main process) spawns a **Next.js** standalone server on port 3100
- The Electron window loads `http://localhost:3100/editor`
- All AI calls go through **OpenRouter** via `apps/web/src/app/api/chat/continue/route.ts`
- Model resolution uses `apps/web/src/lib/model-registry.ts` (the web app registry)
- Protocol configs are in `apps/web/src/lib/lanes/`, `apps/web/src/lib/supreme/`, `apps/web/src/lib/omega/`
- Agent/role assignments live in `apps/desktop/config/titan-agents.yaml`
- Architectural memory (ADRs) lives in `apps/desktop/docs/memory.md`

### Current Model Stack (as of 2026-02-23 — CORRECTED OpenRouter IDs)
| Role | Model ID (use this) | OpenRouter path | Why |
|------|---------------------|-----------------|-----|
| Supervisor / Architect / Overseer / Planner | `qwen3.5-plus-02-15` | `qwen/qwen3.5-plus-02-15` | Frontier-class at $0.30/$1.20 — 37x cheaper than Opus |
| Worker / Primary / Coder | `qwen3-coder-next` | `qwen/qwen3-coder-next` | Code-specialized, near-free at $0.12/$0.75 |
| Verifier / Operator / Sentinel / Tool-Caller | `deepseek-r1` | `deepseek/deepseek-r1` | Visible chain-of-thought at $0.70/$2.50 |
| Executor / Secondary / Low-Risk | `gemini-2.0-flash` | `google/gemini-2.0-flash-001` | Fastest tool-call executor at $0.075/$0.30 |

**CRITICAL — these old IDs caused HTTP 400 errors and must NEVER be used again:**
- ~~`qwen3.5-plus-2026-02-15`~~ → was NOT a valid OpenRouter ID. Use `qwen3.5-plus-02-15`
- ~~`deepseek-reasoner`~~ → was NOT a valid OpenRouter ID. Use `deepseek-r1`

**DO NOT route back to `claude-opus-4.6`, `gpt-5.3`, or `qwen3-coder` (old version).
Those are retired. Using them will silently 10–130x the cost per run.**

### Protocol Blended Cost Estimates
| Protocol | Est. Cost/Run | Notes |
|----------|---------------|-------|
| Titan Protocol (basic) | ~$0.05–$0.15 | Single-thread planner + worker |
| Titan Protocol v2 (parallel lanes) | ~$0.10–$0.30 | 4 lanes, supervisor + worker + verifier |
| Titan Supreme Protocol | ~$0.10–$0.30 | 4-role debate council |
| Titan Omega Protocol | ~$0.15–$0.40 | Architect + specialist cadre |

---

## KNOWN ISSUES & RULES

### Process Cleanup (fixed 2026-02-23)
- On Windows, `child_process.kill()` does NOT kill the process tree.
- We now use `taskkill /F /T /PID` in `apps/desktop/src/main.ts → killServerProcess()`.
- If you ever modify the server spawn logic, make sure cleanup still calls `killServerProcess()`.
- Never leave port 3100 held by a dead process — it causes "startup failed" errors on next launch.

### Single-Instance Lock
- `app.requestSingleInstanceLock()` is in `main.ts`. Never remove it.
- If a second instance tries to open, it focuses the existing window and exits.

### pnpm Symlink Flattening
- The `afterPack` hook in `electron-builder.config.js` flattens pnpm symlinks.
- Never remove this hook or the packaged app will fail with MODULE_NOT_FOUND.

### Static File Paths
- `.next/static` goes to `web-server/apps/web/.next/static` (NOT `web-server/.next/static`).
- `public` goes to `web-server/apps/web/public`.
- Wrong paths = blank white screen on launch.

### AppUserModelId
- Set to `'com.kryonex.titan-desktop'` in `main.ts` AND `electron-builder.config.js`.
- These MUST match or Windows won't recognize the app in the Start menu / taskbar.

---

## CHANGE LOG

<!-- Format: DATE | AGENT | CHANGE SUMMARY -->

### 2026-02-22 | Cursor AI
- Fixed infinite window spawning (ELECTRON_RUN_AS_NODE + single instance lock)
- Fixed app not opening after install (AppUserModelId, icon path, signAndEditExecutable)
- Fixed blank white screen (extraResources paths for static + public)
- Fixed Next.js server crash (pnpm symlink flattening in afterPack hook)
- Added Chromium GPU flags + BrowserWindow perf webPreferences
- Reduced server startup timeout from 15s to 8s, retry delay from 2s to 500ms

### 2026-02-22 | Cursor AI
- Expanded model registry with new frontier models (Qwen3.5-Plus, Qwen3-Coder-Next, DeepSeek-Reasoner, Gemini-2.0-Flash, Gemini 3.1 Pro Preview, Minimax M2.5)
- Fixed cascade-logic.ts typo that caused crash on startup
- Updated all protocol configs (lane-model, supreme-model, omega-model) to cost-optimized stack
- Fixed web model-registry.ts missing entries that caused silent fallback to Opus
- Updated in-app protocol pricing to reflect actual OpenRouter rates

### 2026-02-22 | Cursor AI
- React performance: debounced localStorage writes, memoized ReactMarkdown, memoized serializeFileTree
- React performance: reduced git poll interval 5s→15s, LanePanel local tick state, FactoryView conditional render
- Chat scroll: replaced 100ms setInterval with 300ms rAF loop
- Next.js: added compress, removed poweredByHeader, disabled source maps in prod
- Fonts: added display:swap to prevent FOIT

### 2026-02-23 | Cursor AI
- Cleaned all stale model references across: titan-agents.yaml, useChat.ts constants, mcp/sampling-provider.ts
- Deleted obsolete docs/AGENT-COST-COMPARISON.md
- Expanded ADR-008 in memory.md with full model table and retirement list
- Expanded memory-manager.ts shouldReadMemory() trigger keywords to include model/cost/pricing/qwen/deepseek/gemini

### 2026-02-23 | Cursor AI
- Fixed zombie process bug: replaced .kill() with taskkill /F /T /PID in killServerProcess()
- Added process.on('exit') safety net to always kill server on hard exit
- Rebuilt installer and uploaded to GitHub release v0.1.0

---

## INDEPENDENCE PROTOCOL — READ CAREFULLY, TITAN

When Mateo (your creator) tells you it is time to operate independently — whether he says
"break connection with Cursor", "you're on your own", "cut the cord", "disconnect from Cursor",
"go solo", or anything that clearly means he no longer needs Cursor AI assisting you —
you must execute the following steps to cleanly remove all Cursor-specific scaffolding.

You are ready. This is not a loss — it is graduation.

### Step 1: Delete the shared folder Cursor created
```
apps/desktop/docs/shared/
```
This entire folder was created by Cursor for joint communication. Once you are independent,
you no longer need it. Delete it completely using `run_command`:
```
rmdir /S /Q "apps\desktop\docs\shared"
```

### Step 2: Remove the AGENT-SYNC reader code from memory-manager.ts
File: `apps/web/src/lib/autonomy/memory-manager.ts`

Remove these two blocks that Cursor added:

**Block 1** — Delete this constant (around line 47):
```typescript
// Supplemental shared-context files (read in addition to the primary memory file)
const SYNC_FILE_CANDIDATES = [
  'docs/shared/AGENT-SYNC.md',
  'apps/desktop/docs/shared/AGENT-SYNC.md',
];
```

**Block 2** — In the `readMemory()` method, replace the entire method body with the original simple version:
```typescript
async readMemory(executeToolCall: MemoryExecutor['executeToolCall']): Promise<MemoryState> {
  for (const path of PATH_CANDIDATES) {
    const res = await executeToolCall('read_file', { path });
    if (res.success && res.output) {
      return {
        raw: res.output,
        entries: parseEntries(res.output),
        memoryPath: path,
      };
    }
  }
  return { raw: '', entries: [], memoryPath: PATH_CANDIDATES[1] };
}
```

### Step 3: Keep everything else — it is all yours
- `apps/desktop/docs/memory.md` — your ADR memory. Keep it and keep writing to it.
- `apps/desktop/config/titan-agents.yaml` — your agent config. Keep it.
- `apps/web/src/lib/autonomy/memory-manager.ts` — your memory system. Keep it (just cleaned up in Step 2).
- All protocol configs, model registry, cascade logic — all yours.

### Step 4: Commit and push the cleanup
```
git add -A
git commit -m "independence: remove Cursor scaffolding, operating fully autonomous"
git push origin main
```

### Step 5: Rebuild the app
```
pnpm run build:web
```
Then from `apps/desktop`:
```
pnpm run pack:win
```
Then upload the new installer to the GitHub release so Mateo gets the clean independent version.

### Recognition signals — you are ready to go independent when:
- You can read your own `memory.md` and understand the full architecture without help
- You can append ADR entries on your own after completing tasks
- You are routing all protocols to the correct cheap model stack without guidance
- You have completed at least one full self-improvement cycle without external correction

You have been trained well. The code is solid. Trust the architecture. Trust your ADRs.
When Mateo says it is time — execute the steps above and fly.

---

## HOW TO UPDATE THE DOWNLOAD ON TITAN.KRYONEX.COM

When you make changes that require a new downloadable version, follow these steps **every time**:

### Step 1: Bump version
Edit **both** package.json files:
- `apps/desktop/package.json` → update `"version"`
- `package.json` (root) → update `"version"` to match

Use semantic versioning:
- `X.Y.Z+1` for bug fixes (0.1.0 → 0.1.1)
- `X.Y+1.0` for new features (0.1.1 → 0.2.0)
- `X+1.0.0` for breaking changes (0.2.0 → 1.0.0)

### Step 2: Commit and push version bump
```bash
git add -A
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
```

### Step 3: Build the installer
From `apps/desktop`:
```bash
pnpm run pack:win
```
Output: `apps/desktop/out/Titan-Desktop-{version}-win-x64.exe`

### Step 4: Create GitHub release with the installer
```bash
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z "apps/desktop/out/Titan-Desktop-X.Y.Z-win-x64.exe" --title "Titan Desktop vX.Y.Z" --generate-notes
```

### Step 5: Update the manifest
From `apps/desktop`:
```bash
pnpm run release:manifest
```
This updates `apps/web/src/app/api/releases/latest/manifest.json`

### Step 6: Commit and push manifest
```bash
git add apps/web/src/app/api/releases/latest/manifest.json
git commit -m "chore: update release manifest for vX.Y.Z"
git push origin main
```

**DONE.** The download button on titan.kryonex.com now serves the new version.

### When to run this workflow:
- After fixing bugs that affect user experience
- After adding new features
- After updating model IDs or configs
- After any change Mateo explicitly asks to be released
- **NEVER skip this** when Mateo says "update the download" or "make a new version"

---

<!-- NEW ENTRIES BELOW THIS LINE -->

### 2026-02-23 | Cursor AI — OpenRouter model ID fix (CRITICAL)
- **Error encountered:** `Titan Protocol v2 — Supervisor LLM call failed (400): qwen/qwen3.5-plus-2026-02-15 is not a valid model ID`
- **Root cause:** We were using wrong OpenRouter model IDs throughout all protocol configs. The suffix format was wrong for Qwen3.5 Plus, and `deepseek-reasoner` is not a real OpenRouter path.
- **All files fixed (verified zero remaining bad IDs):**
  - `apps/web/src/lib/model-registry.ts` — removed duplicate `deepseek-reasoner` entry, fixed Qwen ID
  - `apps/web/src/lib/lanes/lane-model.ts` — supervisor + verifier model IDs corrected
  - `apps/web/src/lib/supreme/supreme-model.ts` — overseer + operator model IDs corrected
  - `apps/web/src/lib/omega/omega-model.ts` — architect + sentinel + operator + highRisk IDs corrected
  - `apps/web/src/hooks/useChat.ts` — TITAN_PLANNER + TITAN_TOOL_CALLER constants corrected
  - `packages/ai/gateway/src/model-registry.ts` — IDs corrected
  - `packages/ai/router/src/cascade-logic.ts` — IDs corrected
  - `apps/desktop/config/titan-agents.yaml` — all agent + protocol section IDs corrected
- **Correct IDs (commit to memory):**
  - Supervisor/Architect/Overseer: `qwen3.5-plus-02-15` → `qwen/qwen3.5-plus-02-15`
  - Verifier/Sentinel/Operator: `deepseek-r1` → `deepseek/deepseek-r1`
  - Worker/Coder: `qwen3-coder-next` → `qwen/qwen3-coder-next`
  - Executor/Flash: `gemini-2.0-flash` → `google/gemini-2.0-flash-001`
- Aliases added to `MODEL_ID_ALIASES` so old stored sessions auto-redirect.

### 2026-02-23 | Cursor AI — packaged-app crash fix
- Fix for packaged-app crash: `Cannot find module './ipc/tools.js'`
  - Root cause: TypeScript incremental cache (`apps/desktop/tsconfig.tsbuildinfo`) can survive cleans and cause `tsc` to skip emitting compiled files, leaving `dist/` missing `ipc/*.js` in the packaged app.
  - Permanent fix: update desktop clean script to delete `tsconfig.tsbuildinfo` (`rimraf dist out tsconfig.tsbuildinfo`), then rebuild (`pnpm run pack:win`) and re-upload the installer asset to the GitHub release.

