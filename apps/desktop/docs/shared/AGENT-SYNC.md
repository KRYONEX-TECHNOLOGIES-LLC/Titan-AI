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
| **Titan Chat** | ~$0.001–$0.002 | Ultra-cheap conversational. Simple: Qwen3.5 397B only. Complex: Qwen3.5 397B → Gemini 2.5 Flash |
| Titan Protocol (basic) | ~$0.05–$0.15 | Single-thread planner + worker |
| Titan Protocol v2 (parallel lanes) | ~$0.10–$0.30 | 4 lanes, supervisor + worker + verifier |
| Titan Supreme Protocol | ~$0.10–$0.30 | 4-role debate council |
| Titan Omega Protocol | ~$0.15–$0.40 | Architect + specialist cadre |
| Phoenix Protocol | ~$0.02–$0.10 | 5-role: Architect + Coder + Verifier + Scout + Judge |

---

## TITAN CHAT PROTOCOL — REFERENCE

### What It Is
Titan Chat is the ultra-cheap everyday conversational protocol. It uses a 2-role adaptive pipeline to deliver Opus-level quality at ~$0.001–$0.002 per message.

### Architecture
```
User message → COMPLEXITY ROUTER (heuristic, free)
                    ↓
              score < 4: SIMPLE pipeline
              score ≥ 4: FULL pipeline

SIMPLE:  [User message] → THINKER (Qwen3.5 397B MoE) → Final answer
FULL:    [User message] → THINKER (Qwen3.5 397B MoE) → REFINER (Gemini 2.5 Flash) → Final answer
```

### Models
- **THINKER**: `qwen/qwen3.5-397b-a17b-20260216` — 397B MoE, SOTA reasoning, near-zero cost ($0.15/$1.00 per 1M)
- **REFINER**: `google/gemini-2.5-flash` — fast, catches errors, polishes tone ($0.15/$0.60 per 1M)

### Complexity Routing
- Word count < 20 → 0–1 points
- Word count 20–50 → 1 point
- Word count 50–100 → 2 points
- Word count > 100 → 3 points
- Multi-part questions, comparisons, analysis → +2 points
- Build/implement/design/architect patterns → +2 points
- Code-related keywords → +1 point
- Threshold: score ≥ 4 triggers FULL pipeline

### Code Location
- Orchestrator: `apps/web/src/lib/titan-chat/titan-chat-orchestrator.ts`
- Model config: `apps/web/src/lib/titan-chat/titan-chat-model.ts`
- API route: `apps/web/src/app/api/titan/chat/route.ts`
- Hook: `apps/web/src/hooks/useTitanChat.ts`
- Registry: `apps/web/src/lib/model-registry.ts` (id: `titan-chat`)
- Routing: `apps/web/src/hooks/useChat.ts` (isTitanChatMode branch)

### When To Use
Use Titan Chat for: general questions, explanations, conversations, analysis, writing. For heavy coding tasks use Phoenix Protocol or Titan Protocol.

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

### React Hooks rule (protocol crash prevention)
- Titan has multiple protocol modes in `apps/web/src/hooks/useChat.ts` that use **early returns** (Phoenix/Supreme/Omega/Parallel/Titan Chat).
- **RULE:** Never declare a React hook (e.g. `useCallback`, `useMemo`, `useEffect`) *after* those conditional returns. That breaks hook order across renders when the selected protocol changes and can cause production-only crashes like: `Cannot read properties of undefined (reading 'length')`.
- If you need a helper hook for the default Titan Protocol path (e.g. `setChatInputWithRef`), declare it **before** any protocol-mode `return`.
- Also guard `.length` for SSE/localStorage data (`(x || '').length`, `(arr || []).length`) because payloads can be partial or stale.

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

**Step 3: Bump version in EXACTLY 3 files (must match):**
- `package.json` (root) → update `"version"` to `"X.Y.Z"`
- `apps/desktop/package.json` → update `"version"` to `"X.Y.Z"`
- `apps/web/package.json` → update `"version"` to `"X.Y.Z"`
- **All 3 MUST be identical.** Mismatch = broken auto-update.
- Run `npx ts-node scripts/validate-versions.ts` to verify.
- NOTE: `manifest.json` is auto-updated by CI. Do NOT manually edit it.

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
- **IRON RULE: COMMIT AND PUSH TO MAIN BEFORE CREATING ANY TAG.** If you push a tag before committing the version bump, CI builds the OLD version, the manifest points to the NEW version, and the download link 404s. This happened on v0.3.67 and v0.3.68.
- **VERIFY before tagging:** `git show HEAD:package.json | grep version` must show the NEW version. If it shows the old one, you haven't committed yet. STOP and commit first.
- DO NOT run `pnpm run pack:win` locally — you will hit file locks because the app is running
- DO NOT manually create GitHub releases — the CI does it automatically
- DO NOT skip the tag push — without it, **nothing happens**
- DO NOT change `electron-builder.config.js` — see KNOWN ISSUES above
- DO NOT push a tag on code that doesn't compile — verify `tsc` first
- DO NOT forget Step 6 — **always confirm** the pipeline started
- DO NOT push tags in someone else's project — self-project rules ONLY apply here
- **LOCKFILE RULE:** After ANY change to ANY `package.json` (add, remove, or change deps), run `pnpm install` locally and commit the updated `pnpm-lock.yaml`. CI uses `--frozen-lockfile` which REJECTS stale lockfiles. This killed v0.3.68 CI (stale entries for removed deps `y-webrtc`, `yjs`). If CI fails with `ERR_PNPM_OUTDATED_LOCKFILE`: fix lockfile locally, commit, push, delete bad tag, re-tag.

### When to release:
- After fixing bugs that affect user experience
- After adding new features
- After updating model IDs or configs
- After performance optimizations
- After any change Mateo explicitly asks to be released
- **NEVER skip this** when Mateo says "update the download" or "make a new version"
- When in doubt: **ASK Mateo** if he wants a release, don't guess

---

## ════════════════════════════════════════════════════════════════════════
## TITAN RELEASE RUNBOOK — COPY-PASTE TEMPLATE (DO NOT DEVIATE)
## ════════════════════════════════════════════════════════════════════════
##
## THIS IS YOUR STEP-BY-STEP GUIDE. Run every command exactly as shown.
## Do NOT improvise. Do NOT skip steps. Do NOT reorder steps.
## Every command below has a VERIFY section — you must confirm it before moving on.
##
## ONLY USE THIS RUNBOOK WHEN INSIDE THE SELF-PROJECT:
##   git remote get-url origin → must contain "KRYONEX-TECHNOLOGIES-LLC/Titan-AI"
##   If it doesn't match → STOP. This runbook does not apply.
## ════════════════════════════════════════════════════════════════════════

---

### RELEASE RUNBOOK — START HERE EVERY TIME

---

#### PRE-FLIGHT CHECK (Run this before anything else)

```
run_command("git remote get-url origin")
```

EXPECTED OUTPUT contains: `KRYONEX-TECHNOLOGIES-LLC/Titan-AI`
IF NOT MATCHED → STOP IMMEDIATELY. You are not in the Titan project. Do not release.
IF MATCHED → Continue to Step 1.

---

#### STEP 1 — Read current version

```
read_file("package.json")   ← look for the "version" field, e.g. "0.3.2"
```

Decide the new version number using SemVer:
- Bug fix only:      e.g. 0.3.2 → 0.3.3  (patch)
- New feature added: e.g. 0.3.2 → 0.4.0  (minor)
- Breaking change:   e.g. 0.3.2 → 1.0.0  (major)

Write down: OLD_VERSION = `0.X.Y`  NEW_VERSION = `0.X.Z`

---

#### STEP 2 — Bump version in EXACTLY 3 files (must be identical)

File 1:
```
edit_file("package.json")              change "version": "OLD" → "version": "NEW"
```

File 2:
```
edit_file("apps/desktop/package.json") change "version": "OLD" → "version": "NEW"
```

File 3:
```
edit_file("apps/web/package.json")     change "version": "OLD" → "version": "NEW"
```

NOTE: manifest.json is auto-updated by CI. Do NOT manually edit it.

VERIFY — Read all 3 files back and confirm they match:
```
read_file("package.json")              ← confirm "version": "NEW_VERSION"
read_file("apps/desktop/package.json") ← confirm "version": "NEW_VERSION"
read_file("apps/web/package.json")     ← confirm "version": "NEW_VERSION"
```
Also run: `run_command("npx ts-node scripts/validate-versions.ts")`
IF THEY DON'T MATCH → Fix them now. Mismatch = broken auto-update.

---

#### STEP 3 — Stage and review changes

```
run_command("git add -A")
run_command("git status")
```

EXPECTED: You should see `modified: package.json` and `modified: apps/desktop/package.json`
plus any other files you changed. If you see unexpected files, review them before committing.

---

#### STEP 4 — Commit

```
run_command("git commit -m \"vNEW_VERSION: <one-line description of what changed>\"")
```

EXAMPLE: `git commit -m "v0.3.3: Add release runbook to AGENT-SYNC and system prompt"`

EXPECTED OUTPUT: `[main XXXXXXX] vNEW_VERSION: ...`
IF FAILED → Check what went wrong before proceeding. Do not skip.

---

#### STEP 5 — Push commit to main

```
run_command("git push origin main")
```

EXPECTED OUTPUT: `main -> main` with no errors.

IF REJECTED (remote has new commits):
```
run_command("git pull --rebase origin main")
run_command("git push origin main")
```

IF STILL REJECTED → STOP. Something is wrong. Do not force-push. Ask Mateo.

---

#### STEP 6 — Create and push the version tag (THE ACTUAL TRIGGER)

⚠️ **STOP. Before this step, verify the commit contains the version bump:**
```
run_command("git show HEAD:package.json")   ← Must show the NEW version, NOT the old one
```
If it shows the old version, you skipped the commit. Go back to Step 4.

```
run_command("git tag vNEW_VERSION")
run_command("git push origin vNEW_VERSION")
```

EXAMPLE: `git tag v0.3.3` then `git push origin v0.3.3`

EXPECTED OUTPUT: `* [new tag] vNEW_VERSION -> vNEW_VERSION`

⚠️ THIS STEP IS THE TRIGGER. Without this, NOTHING happens:
- No GitHub Actions build
- No new installer
- No download link update
- No update popup for existing users

IF PUSH FAILS (tag already exists):
```
run_command("git tag -d vNEW_VERSION")          ← delete local tag
run_command("git push origin :refs/tags/vNEW_VERSION")  ← delete remote tag (only if you haven't created a release yet)
```
Then re-create the tag at the correct commit.

---

#### STEP 7 — Verify the CI pipeline started (MANDATORY)

```
run_command("gh run list --limit 3")
```

EXPECTED OUTPUT: Three rows showing `in_progress` or `queued` for:
- `Release Desktop`
- `CI`
- `Security Scan`

IF `Release Desktop` shows `failed`:
```
run_command("gh run list --limit 1")              ← get the run ID
run_command("gh run view <RUN_ID> --log-failed")  ← read the failure logs
```
Fix the issue, then decide whether to re-run or push a patch commit with a new tag.

IF `Release Desktop` is NOT in the list → the tag push may not have triggered it.
Check with: `gh run list --workflow release-desktop.yml --limit 3`

---

#### WHAT HAPPENS AUTOMATICALLY AFTER YOU COMPLETE ALL 7 STEPS

1. GitHub Actions spins up a Windows cloud machine
2. Builds the .exe installer + latest.yml (the electron-updater manifest)
3. Creates a GitHub Release `vNEW_VERSION` with the installer attached
4. Updates `manifest.json` with new version + download URL and pushes it
5. Railway auto-deploys the web app → `titan.kryonex.com` shows new version
6. `electron-updater` in all existing Titan installs detects the new release
7. Users see "Update Available" popup → click Install → auto-removes old, installs new, restarts

WAIT TIME: ~10-15 minutes from tag push to installer available.

---

#### QUICK REFERENCE — ALL 7 COMMANDS IN ORDER

Replace `vX.Y.Z` with your actual version number everywhere:

```
run_command("git remote get-url origin")                  ← Pre-flight check
read_file("package.json")                                  ← Note current version
edit_file("package.json")                                  ← Bump "version"
edit_file("apps/desktop/package.json")                     ← Bump "version" (must match)
run_command("git add -A")
run_command("git status")                                  ← Verify staged files
run_command("git commit -m \"vX.Y.Z: description here\"")
run_command("git push origin main")                        ← If rejected: pull --rebase first
run_command("git tag vX.Y.Z")
run_command("git push origin vX.Y.Z")                     ← THE TRIGGER
run_command("gh run list --limit 3")                       ← Verify CI started
```

#### CHECKLIST — CHECK EACH BOX BEFORE CALLING THE RELEASE DONE

- [ ] Pre-flight: remote URL confirmed as KRYONEX-TECHNOLOGIES-LLC/Titan-AI
- [ ] Both package.json files show the same new version
- [ ] `git push origin main` exited with code 0
- [ ] `git push origin vX.Y.Z` showed `* [new tag]`
- [ ] `gh run list --limit 3` shows `Release Desktop` as `in_progress` or `completed`

If every box is checked → the release is live. You're done.
If any box is not checked → you have an incomplete release. Fix it before telling Mateo it's done.

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

---

## TITAN FORGE — COMPLETE SYSTEM REFERENCE

### What It Is
Titan Forge is a knowledge distillation engine inside the Titan AI monorepo. It has TWO data pipelines:
1. **Distillation Collector** — passively captures high-value outputs from frontier models (Claude Opus, GPT-5, etc.) when users chat in Titan. Scores them 0-10 via the Quality Gate. Only score >= 7 gets exported for training.
2. **Harvester (Scraper Army)** — actively scrapes 10 public sources for training data. Filters through a 5-pass pipeline. Stores in Supabase.

### Architecture
```
packages/forge/             ← The distillation engine package
├── src/
│   ├── index.ts            ← Barrel exports
│   ├── types.ts            ← All TypeScript interfaces (ForgeSample, HarvestSample, etc.)
│   ├── db.ts               ← Supabase client (insertSample, insertHarvest, getStats, etc.)
│   ├── collector.ts        ← Intercepts chat responses from route.ts (passive distillation)
│   ├── quality-gate.ts     ← Scores samples 0-10 based on build/lint/user signals
│   ├── signals.ts          ← Detects user acceptance/rejection signals
│   ├── exporter.ts         ← Exports to ShareGPT JSON / OpenAI JSONL for training
│   ├── eval.ts             ← Benchmark harness (student vs teacher models)
│   ├── vault.ts            ← Automated backup system
│   ├── harvester.ts        ← 10 web scraper adapters (GitHub, SO, Reddit, etc.)
│   ├── harvester-filter.ts ← 5-pass filter pipeline (rules → AI detect → quality → format → dedup)
│   ├── harvester-datasets.ts ← HuggingFace public dataset sampler (FineWeb, StarCoder, Pile, CodeSearchNet)
│   ├── ai-content-detector.ts ← Two-layer AI content detection (heuristic + LLM judge)
│   └── cli/
│       ├── harvest.ts      ← CLI: pnpm --filter @titan/forge run harvest
│       └── backup.ts       ← CLI: pnpm --filter @titan/forge run backup
├── trainer/
│   ├── axolotl-config.yml  ← QLoRA training configuration
│   └── train.sh            ← Training launch script
├── package.json            ← @titan/forge package (build script uses tsup)
└── tsconfig.json
```

### The 10 Scraper Sources (Harvester Army)
| # | Source | API Used | What It Gets |
|---|--------|----------|-------------|
| 1 | GitHub | GitHub REST API | README files from top-starred repos |
| 2 | StackOverflow | StackExchange API | High-vote Q&A pairs with accepted answers |
| 3 | Official Docs | GitHub raw files | React, Next.js, TypeScript handbook pages |
| 4 | Blogs | RSS feeds | Engineering blogs (Vercel, Netflix, Uber) — often blocked |
| 5 | HF Datasets | HuggingFace Datasets API | FineWeb-Edu, StarCoder, The Pile, CodeSearchNet |
| 6 | Reddit | Reddit JSON API | Top posts from programming subreddits |
| 7 | Dev.to | Dev.to API | Popular tech articles with full markdown |
| 8 | MDN Web Docs | GitHub raw (mdn/content) | Gold-standard JS/CSS/Web API documentation |
| 9 | Wikipedia | Wikipedia REST API | CS/programming theory articles |
| 10 | Hacker News | Firebase API | Top stories + technical comment threads |

### 5-Pass Filter Pipeline (harvester-filter.ts)
1. **Rule filter** — removes junk (cookie banners, SEO spam, too short/long)
2. **AI content detector** — SOFT PENALTY (not hard reject). AI-detected content gets -3 quality penalty. High-quality AI content can still pass if overall score is high enough.
3. **AI quality judge** — Gemini Flash scores content 0-10. AI penalty applied here. Only score >= 6 passes.
4. **Format converter** — Converts raw content to instruction/response pairs
5. **Dedup** — SHA256 hash check against existing DB entries

### Database (Supabase PostgreSQL)
Tables:
- `forge_samples` — Distillation data (captured from Titan chat sessions)
- `forge_runs` — Training run metadata
- `forge_evals` — Benchmark results (student vs teacher)
- `forge_harvest` — Scraped web data (from harvester)
- `forge_harvest_batches` — Batch metadata per harvest run

### How to Run Harvests

**From CLI (manual):**
```bash
cd packages/forge
# Build first (only needed after code changes):
pnpm build
# Dry run (no DB writes):
node dist/cli/harvest.js --source github --topic "typescript" --limit 5 --dry-run
# Real harvest:
node dist/cli/harvest.js --source stackoverflow --topic "javascript" --limit 30
# Check stats:
node dist/cli/harvest.js --stats
# Valid sources: all, github, stackoverflow, docs, blog, dataset, reddit, devto, mdn, wikipedia, hackernews
```

**From Titan UI (manual):**
- Click the Forge icon (anvil/layers) in the sidebar
- Pick source from dropdown (10 options)
- Set topic and limit
- Click "Start Harvest"

**Automated (GitHub Actions):**
- `.github/workflows/forge-harvest.yml` runs daily at 2 AM UTC
- Rotates through all 10 sources on a 10-day cycle
- Free on public repos (uses GitHub-hosted runners)
- Needs these GitHub repo secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `HF_API_TOKEN`

### How to Add a New Scraper Source
1. Add the source name to `HarvestSource` type in `packages/forge/src/types.ts`
2. Add a rate limit entry in `RATE_LIMIT_MS` in `packages/forge/src/harvester.ts`
3. Write the `async function scrapeNewSource(topic, limit): Promise<ScrapedItem[]>` function
4. Wire it into the `harvest()` method with `if (source === 'all' || source === 'newsource')`
5. Add a format case in `pass3_formatConverter` in `harvester-filter.ts`
6. Add it to the CLI valid sources in `packages/forge/src/cli/harvest.ts`
7. Add it to the dashboard dropdown in `apps/web/src/components/ide/ForgeDashboard.tsx`
8. Add it to the GitHub Actions schedule in `.github/workflows/forge-harvest.yml`
9. Rebuild: `pnpm --filter @titan/forge build`

### How to Stop/Start
- **Harvester**: It's a one-shot CLI command. It runs, scrapes, filters, saves, exits. No daemon to stop.
- **Automated harvests**: Disable by removing the schedule in `.github/workflows/forge-harvest.yml`
- **Distillation collector**: Always-on in `route.ts`. It's a fire-and-forget async call. To disable, comment out the `forgeCollector.capture(...)` call in `apps/web/src/app/api/chat/continue/route.ts`.

### Environment Variables Needed
- `OPENROUTER_API_KEY` — For the AI quality judge (Gemini Flash, ~$0.001/item)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-side only)
- `GITHUB_TOKEN` — For GitHub API (higher rate limits)
- `HF_API_TOKEN` — For gated HuggingFace datasets (StarCoder, The Pile, etc.)

### Current Data Stats (as of v0.3.10)
- 149+ items in `forge_harvest` table
- Sources: GitHub (23), StackOverflow (104), Docs (3), Reddit (4), Dev.to (9), MDN (6)
- AI content detector uses soft penalty (-3 score), not hard reject
- HuggingFace token configured for gated dataset access

### 2026-02-24 | Cursor AI — v0.3.21: Chat overflow fix, GitHub OAuth fix, auth button clarity

**Chat message horizontal overflow (ChatMessage.tsx, titan-ide.tsx, globals.css):**
- Added `min-w-0` to flex-1 message container so flexbox items shrink properly
- Added `overflow-x-hidden` and `titan-chat-scroll` class to messages scroll container
- Replaced non-functional `prose` Tailwind classes (Typography plugin not installed) with explicit `break-words overflow-hidden` styles
- Added custom ReactMarkdown `components` for `pre`, `code`, and `table` with proper overflow handling (`overflow-x-auto`, `max-w-full`, `whitespace-pre-wrap`)
- Added global CSS rules in `globals.css` targeting `.titan-chat-scroll` for code blocks, paragraphs, tables, and images
- **RULE:** Chat message containers MUST have `min-w-0` on any `flex-1` child, and `overflow-x-hidden` on the scroll container. Without `min-w-0`, flexbox items will not shrink below their content width.

**GitHub OAuth popup stuck after Google SSO (github.ts):**
- Fixed `isCallbackUrl` function (line 163) to require `hostname === 'localhost'` before treating a URL as the OAuth callback
- Previously, intermediate SSO redirects (e.g., Google → GitHub with `code`+`state` params) were incorrectly matched as callback URLs, causing `event.preventDefault()` to block the redirect and kill the entire OAuth flow
- **RULE:** The `isCallbackUrl` check MUST verify `hostname === 'localhost'` first. GitHub's OAuth always redirects to `localhost` callback as the final step. Intermediate SSO URLs (google.com, github.com/login/saml/consume) carry their own `code`+`state` params and must NOT be intercepted.

**Auth button confusion (TitleBar.tsx, UserMenu.tsx):**
- Changed "Connect GitHub" button label to "Connect Git (push/pull)" to clarify it's for Git operations, not app sign-in
- Added green "Git" badge next to the connected avatar on GitHubConnectButton
- Added green "Signed in" indicator before username in UserMenu to distinguish it from the Git connect button
- **Context:** There are TWO separate GitHub auth systems: (1) Electron IPC GitHub OAuth for Git push/pull operations, (2) Supabase GitHub OAuth for app sign-in. They serve different purposes and must remain visually distinct.

