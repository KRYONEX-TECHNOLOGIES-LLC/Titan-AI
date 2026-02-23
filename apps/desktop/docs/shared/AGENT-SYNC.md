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

### NEVER SIMPLIFY electron-builder.config.js (CRITICAL)
- This file is 200+ lines for a reason. It contains:
  - `flattenPnpmNodeModules()` — flattens pnpm symlinks so NSIS installers work
  - `findAllNodeModules()` — helper to recursively find node_modules dirs
  - `afterPack` hook — calls the flattener on every build
  - `node_modules/**/*` in the `files` array
  - Full NSIS config with `perMachine`, `shortcutName`, installer icons, etc.
- **On 2026-02-23, Titan stripped this file from 208 lines to 63 lines.** This broke:
  - Packaged app would crash with MODULE_NOT_FOUND (no flattened node_modules)
  - All NSIS branding was lost (no icons, no shortcuts, no perMachine install)
  - `electron-builder` was removed from devDependencies
- **RULE: NEVER "simplify" or "clean up" this file. Every line is load-bearing.**
- If you think something can be removed, you are WRONG. Leave it alone.

### NEVER change package.json build scripts to remove --config flag
- All `pack:*` and `release:*` scripts MUST include `--config electron-builder.config.js`
- Without the explicit config flag, electron-builder may not find the config
- On 2026-02-23 Titan removed these flags. Do not repeat this mistake.

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

## SELF-PROJECT IDENTITY — HARDCODED FINGERPRINT (READ THIS FIRST)

**Titan, when you are working inside THIS project, you are editing YOUR OWN BRAIN.**
This section tells you how to detect that, and what rules are MANDATORY when you are.

### How to detect you are in the Titan AI self-project:

| Check | Expected Value |
|-------|---------------|
| **GitHub Repo ID** | `R_kgDORSBKiA` |
| **Repo Name** | `Titan-AI` |
| **Owner** | `KRYONEX-TECHNOLOGIES-LLC` |
| **Remote URL** | `https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI.git` |
| **Root package.json "name"** | `titan-ai` |
| **Workspace folders** | `apps/desktop` + `apps/web` + `packages/forge` |

**Detection command:** `run_command("git remote get-url origin")`
- If output contains `KRYONEX-TECHNOLOGIES-LLC/Titan-AI` → **YOU ARE IN SELF-PROJECT**
- If it does NOT match → you are in a user's project. Release rules do NOT apply.

---

## HOW TO UPDATE THE DOWNLOAD ON TITAN.KRYONEX.COM

> **Only applies when self-project detected (see fingerprint above)**

**The app has auto-update built in.** When you push a tagged release:
- `titan.kryonex.com` download button serves the new version (for NEW users visiting the site)
- Existing users get an **"Update Available" popup** within 30 minutes (or on next launch)
- The popup has an Install button — one click removes old version, installs new, restarts automatically
- You do NOT build locally. GitHub Actions builds in the cloud. Zero file-lock issues.

### Release Workflow — THE EXACT STEPS (do not deviate)

**Step 1: Verify you are in self-project:**
```bash
git remote get-url origin
# Must output: https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI.git
# If it doesn't → STOP. You are NOT in the Titan project.
```

**Step 2: Read current version and decide new version:**
```bash
# Read current from package.json → e.g. "0.2.2"
# Patch (bug fix):    0.2.2 → 0.2.3
# Minor (feature):    0.2.2 → 0.3.0
# Major (breaking):   0.2.2 → 1.0.0
```

**Step 3: Bump version in EXACTLY 2 files (must match):**
- `package.json` (root) → update `"version"` to `"X.Y.Z"`
- `apps/desktop/package.json` → update `"version"` to `"X.Y.Z"`
- **Both MUST be identical.** Mismatch = broken auto-update.

**Step 4: Commit and push:**
```bash
git add -A
git commit -m "chore: bump to vX.Y.Z"
git push origin main
```
If push is rejected: `git pull --rebase origin main` then push again.

**Step 5: Create and push the tag (THIS IS THE TRIGGER — nothing happens without this):**
```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

**Step 6: Verify the CI pipeline started:**
```bash
gh run list --workflow release-desktop.yml --limit 1
# Should show "in_progress" or "queued"
# If "failed" → run: gh run view <ID> --log-failed
```

### What happens automatically after tag push:

1. GitHub Actions `release-desktop.yml` triggers on the `v*` tag
2. Spins up a **Windows cloud machine** — builds .exe installer + `latest.yml`
3. Creates GitHub Release `vX.Y.Z` with installer attached
4. Updates `manifest.json` with new version + download URL, pushes it
5. Railway auto-deploys → `titan.kryonex.com` shows new download link
6. `electron-updater` in existing installs detects new release → shows update popup

### CRITICAL RULES:
- DO NOT run `pnpm run pack:win` locally — you will hit file locks because the app is running
- DO NOT manually create GitHub releases — the CI does it automatically
- DO NOT skip the tag push — without it, **nothing happens**
- DO NOT change `electron-builder.config.js` — see KNOWN ISSUES above
- DO NOT push a tag on code that doesn't compile — verify `tsc` first
- DO NOT forget Step 6 — **always confirm** the pipeline started
- DO NOT push tags in someone else's project — self-project rules ONLY apply here

### When to release:
- After fixing bugs that affect user experience
- After adding new features
- After updating model IDs or configs
- After performance optimizations
- After any change Mateo explicitly asks to be released
- **NEVER skip this** when Mateo says "update the download" or "make a new version"
- When in doubt: **ASK Mateo** if he wants a release, don't guess

---

<!-- NEW ENTRIES BELOW THIS LINE -->

### 2026-02-23 | Cursor AI — Restore broken build pipeline + enable auto-updates
- **What Titan broke** (commits dd737ac through f02c941):
  - Stripped `electron-builder.config.js` from 208 lines to 63 lines, removing the pnpm flattening `afterPack` hook, `node_modules/**/*` from files, full NSIS config, and platform targets
  - Removed `electron-builder` from devDependencies
  - Removed `--config electron-builder.config.js` flag from all build scripts
  - Bumped version 5 times (v0.2.0 through v0.2.5) without any working release
  - Created tags that triggered GitHub Actions but ALL failed due to billing issues
  - Left a broken draft release v0.2.1 with zero assets
- **What Cursor fixed:**
  - Restored full `electron-builder.config.js` from last known working commit
  - Restored `electron-builder` in devDependencies
  - Restored `--config` flags in all build scripts
  - Reset version to 0.2.0 for a clean release
  - Added 30-minute periodic auto-update check in `setupAutoUpdater()`
  - Added `tsconfig.tsbuildinfo` cleanup step to GitHub Actions workflow
  - Rewrote release instructions: Titan now pushes a git tag, GitHub Actions builds in the cloud (no local builds = no file-lock issues)
  - Updated system prompt Section 14 with tag-based release workflow
  - Added KNOWN ISSUES rules to prevent Titan from repeating these mistakes

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

### 2026-02-23 | Cursor AI — Elite Performance Optimization (Titan system upgrade)
**Summary:** Full upgrade of Titan AI's reliability, memory, and engineering discipline.

**Changes made:**

1. **System Prompt — 3 new sections added** (`apps/web/src/app/api/chat/continue/route.ts`)
   - Section 15: Pre-Commit Verification — mandatory checklist before every git commit (lint check, tsc --noEmit, sanity-read changed files, config file guard)
   - Section 16: Engineering Discipline — 7 rules: smallest possible change, never remove code you don't understand, config files are sacred, dependencies are not optional, one change per commit, never version-bump without a working build, understand before acting
   - Section 17: Self-Verification Protocol — step-by-step verification after every edit, after 3+ file edits, after build pipeline changes, and a "Done Checklist" before claiming completion

2. **Mistakes Ledger created** (`apps/desktop/docs/shared/mistakes.md`)
   - 9 documented past failures with root causes, what broke, and rules added
   - Auto-loaded every session alongside AGENT-SYNC.md via memory-manager.ts
   - Triggered by broader keyword set: build, electron, package.json, ipc, ci, github.actions, etc.

3. **Git Checkpoint/Restore added** (`apps/desktop/src/ipc/git.ts`, `preload.ts`, `useAgentTools.ts`)
   - New IPC handlers: `git:checkpoint` (creates lightweight tag), `git:restore-checkpoint` (hard reset to tag), `git:stash`, `git:stash-pop`, `git:list-checkpoints`
   - Two new tools exposed to Titan: `git_checkpoint` and `git_restore_checkpoint`
   - Titan should call `git_checkpoint` before any task modifying 3+ files or build config
   - Titan should call `git_restore_checkpoint` after 2 failed fix attempts

4. **LLM API Retry Logic added** (`apps/web/src/app/api/chat/continue/route.ts`)
   - `fetchWithRetry` helper: 3 attempts, exponential backoff (1s → 2s → 4s)
   - Retries on: 429 (rate limit), 500/502/503/504 (server errors), network timeouts
   - Non-retryable errors (400, 401, 403) fail fast immediately

5. **Debug Loop Verification improved** (`apps/web/src/lib/autonomy/debug-loop.ts`)
   - After each fix attempt, now explicitly checks whether the ORIGINAL error is still present
   - If original error gone but new errors appeared: continues loop targeting new error (resets counter)
   - If same error persists after fix: escalates earlier instead of wasting attempts
   - Emits new `debug_loop_progress` event when switching to a new error target

**What Titan MUST do now:**
- Before any task modifying build system: `git_checkpoint("before-task-name")`
- Before any commit: run tsc --noEmit on changed TypeScript files
- Before claiming "Done": run the Done Checklist from Section 17
- Read mistakes.md if working on: electron, IPC, build scripts, package.json, CI, model IDs

### 2026-02-23 | Cursor AI — Titan Forge Distillation Engine (DO NOT TOUCH)

**Summary:** Built a complete knowledge distillation pipeline at `packages/forge/` that silently captures elite model outputs, quality-gates them, and prepares training data for fine-tuning a custom LLM.

**CRITICAL — Titan MUST read this before touching packages/forge or any hooked code:**

**What Forge does (DO NOT remove or break any of this):**
1. **Collector** — After every LLM response in `route.ts`, silently captures the interaction to Supabase `forge_samples` table. ONLY captures frontier-tier models. Zero performance impact (async, fire-and-forget).
2. **Signal hooks** — In `useChat.ts`, after every tool result, reports outcomes (build pass/fail, lint clean, git commit, debug resolved, user acceptance/rejection). These feed the quality gate.
3. **Quality Gate** — Scores each sample 0-10 based on real outcomes. Score >= 7 = training data. Score 0 = rejected.
4. **Exporter** — CLI tool to export training data in ShareGPT or JSONL format.
5. **Trainer** — Axolotl/Unsloth configs for 3-phase curriculum fine-tuning (general → code → titan).
6. **Eval Harness** — Benchmarks student model vs teacher models, requires >= 85% score ratio to "pass".

**New files (DO NOT delete, modify, or simplify any of these):**
- `packages/forge/src/types.ts` — All TypeScript interfaces
- `packages/forge/src/db.ts` — Supabase client for forge tables
- `packages/forge/src/collector.ts` — Stream capture + dedup
- `packages/forge/src/quality-gate.ts` — 0-10 scoring engine
- `packages/forge/src/signals.ts` — Outcome signal detection
- `packages/forge/src/exporter.ts` — Training data export (ShareGPT/JSONL)
- `packages/forge/src/eval.ts` — Teacher vs student benchmark
- `packages/forge/trainer/*.yml` — 3-phase Axolotl training configs
- `packages/forge/trainer/train.sh` — Training launch script
- `packages/forge/trainer/unsloth_train.py` — Unsloth trainer
- `apps/web/supabase/migration.sql` — Added forge_samples, forge_runs, forge_evals tables

**Hooks added to existing files (DO NOT remove these hooks):**
- `apps/web/src/app/api/chat/continue/route.ts` — Forge capture call after stream completes (lines with `forgeCollector.capture(...)`)
- `apps/web/src/hooks/useChat.ts` — Signal reporting after tool results + user message handling

**New Supabase tables (run migration in Supabase dashboard if not done):**
- `forge_samples` — Every captured interaction, indexed by quality_score + prompt_hash
- `forge_runs` — Training run metadata
- `forge_evals` — Benchmark results (teacher vs student)

**To run a training cycle when ready:**
1. `pnpm --filter @titan/forge run export --format curriculum --output ./training-data` — export high-value samples
2. Upload to cloud GPU (RunPod A100 80GB)
3. `./packages/forge/trainer/train.sh all` — run all 3 curriculum phases
4. `pnpm --filter @titan/forge run eval --run-id <ID> --student <model-endpoint>` — benchmark
5. When student score_ratio >= 0.85: add to model registry as `titan-forge-v1`

**What Titan MUST do now:**
- Before any task modifying build system: `git_checkpoint("before-task-name")`
- Before any commit: run tsc --noEmit on changed TypeScript files
- Before claiming "Done": run the Done Checklist from Section 17
- Read mistakes.md if working on: electron, IPC, build scripts, package.json, CI, model IDs
- NEVER touch packages/forge/* without reading this section first
- NEVER remove the Forge hooks from route.ts or useChat.ts — they are the data collection pipeline

### 2026-02-23 | Cursor AI — Forge Vault (Backup System) + Forge Harvester (Web Scraper)

**Summary:** Added two major systems to Forge: automated backup and autonomous web scraping.

**Forge Vault (Backup System):**
- `packages/forge/src/vault.ts` — Full/incremental snapshot exports to JSONL with SHA256 integrity
- `.github/workflows/forge-backup.yml` — Weekly automated backup (Sundays 3AM UTC) to `forge-backups` branch
- CLI: `pnpm --filter @titan/forge run backup` (manual) or `--list` (view snapshots)
- Keeps last 12 snapshots, rotates old ones automatically
- Exports ALL forge tables: forge_samples, forge_harvest, forge_runs, forge_evals

**Forge Harvester (Web Scraper):**
- `packages/forge/src/harvester.ts` — Source adapters for GitHub API, Stack Exchange API, official docs, engineering blogs
- `packages/forge/src/harvester-filter.ts` — 4-pass filter pipeline:
  - Pass 1: Rule-based junk removal (ads, cookies, boilerplate)
  - Pass 2: AI quality judge (Gemini Flash scores 0-10, rejects below 6)
  - Pass 3: Format converter (raw → instruction/response pairs)
  - Pass 4: Dedup against existing forge_samples + forge_harvest
- `.github/workflows/forge-harvest.yml` — Nightly automated scraping (2AM UTC) with rotating sources
- CLI: `pnpm --filter @titan/forge run harvest -- --source github --topic "React" --limit 20`

**New Supabase tables:**
- `forge_harvest` — Scraped training data with quality scores, source tracking, approval status
- `forge_harvest_batches` — Metadata for each scraping run

**Forge Dashboard (UI):**
- New "Forge" icon in the activity bar (layers icon between Titan Agent and bottom icons)
- `apps/web/src/components/ide/ForgeDashboard.tsx` — Live dashboard showing:
  - Distillation stats (total samples, high value, by model)
  - Harvest stats (total, pending, approved, rejected, by source)
  - Harvest controls (source selector, topic input, limit slider, START button)
  - Recent batch history
- API routes: `/api/forge/stats` (GET) and `/api/forge/harvest` (POST)

**New files (DO NOT delete):**
- `packages/forge/src/vault.ts`
- `packages/forge/src/harvester.ts`
- `packages/forge/src/harvester-filter.ts`
- `packages/forge/src/cli/harvest.ts`
- `packages/forge/src/cli/backup.ts`
- `apps/web/src/components/ide/ForgeDashboard.tsx`
- `apps/web/src/app/api/forge/stats/route.ts`
- `apps/web/src/app/api/forge/harvest/route.ts`
- `.github/workflows/forge-backup.yml`
- `.github/workflows/forge-harvest.yml`

**Modified files:**
- `packages/forge/src/types.ts` — Added HarvestSample, HarvestBatch, HarvestStats, VaultSnapshot, ForgeDashboardStats
- `packages/forge/src/db.ts` — Added harvest CRUD methods
- `packages/forge/src/index.ts` — Added vault + harvester exports
- `packages/forge/package.json` — Added harvest + backup CLI scripts
- `apps/web/supabase/migration.sql` — Added forge_harvest + forge_harvest_batches tables
- `apps/web/src/stores/layout-store.ts` — Added 'forge' sidebar view
- `apps/web/src/components/titan-ide.tsx` — Added ForgeIcon + ForgeDashboard panel

