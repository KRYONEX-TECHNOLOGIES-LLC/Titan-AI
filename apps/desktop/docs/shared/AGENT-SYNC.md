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

### Current Model Stack (as of 2026-02-23)
| Role | Model ID | Why |
|------|----------|-----|
| Supervisor / Architect / Overseer / Planner | `qwen3.5-plus-2026-02-15` | Frontier-class at $0.30/$1.20 — 37x cheaper than Opus |
| Worker / Primary / Coder | `qwen3-coder-next` | Code-specialized, ~free at $0.20/$0.80 |
| Verifier / Operator / Sentinel / Tool-Caller | `deepseek-reasoner` | Visible chain-of-thought verification at $0.70/$2.50 |
| Executor / Secondary / Low-Risk | `gemini-2.0-flash` | Fastest tool-call executor at $0.075/$0.30 |

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

<!-- NEW ENTRIES BELOW THIS LINE -->

