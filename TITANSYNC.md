# TitanSync — Release, Deployment & Data Pipeline Guide

## Release Pipeline (Desktop + Landing Page Auto-Update)

### How it works

1. Push to `main` touching `apps/web/**` or `packages/**` triggers the **Release Web** workflow (Vercel deploy)
2. Pushing a `v*` tag triggers the **Release Desktop** workflow:
   - Builds the Electron desktop app (Windows)
   - Publishes to GitHub Releases
   - Auto-updates `apps/web/src/app/api/releases/latest/manifest.json` with new version
   - Landing page download button automatically points to the latest version

### How to release

```powershell
# 0. Validate version consistency (all 3 files must match)
npx ts-node scripts/validate-versions.ts

# 1. Bump version in EXACTLY 3 files (must match):
#    - package.json (root)
#    - apps/desktop/package.json
#    - apps/web/package.json
#    NOTE: manifest.json is auto-updated by CI. Do NOT manually edit it.

# 2. Sync the lockfile (MANDATORY if any package.json changed)
pnpm install
#    This regenerates pnpm-lock.yaml. CI uses --frozen-lockfile and REJECTS stale lockfiles.

# 3. Commit your changes
git add -A
git commit -m "v0.X.XX: description of changes"

# 4. Push to main
git push origin main

# 5. Create and push a version tag (triggers desktop build + manifest update)
git tag -a v0.X.XX -m "v0.X.XX: description"
git push origin v0.X.XX

# 6. Monitor the pipeline
gh run list --workflow=release-desktop.yml --limit=3
gh run view <run-id> --log-failed   # if it fails
```

### Version Files (MUST stay in sync)

| File | Purpose |
|------|---------|
| `package.json` | Root monorepo version |
| `apps/desktop/package.json` | Desktop app version (drives installer filename) |
| `apps/web/package.json` | Web app version |
| `apps/web/src/app/api/releases/latest/manifest.json` | Auto-updated by CI — do NOT edit manually |

### Pre-commit Hook

A husky pre-commit hook runs automatically on every commit:
1. `npx ts-node scripts/validate-versions.ts` — blocks commit if versions mismatch
2. `npx lint-staged` — runs ESLint + Prettier on changed files

### Common Git Mistakes (and how they're now prevented)

| Mistake | What happened | Prevention |
|---------|---------------|------------|
| **TAG BEFORE COMMIT (FATAL)** | Bumped 3 package.json locally but pushed the tag WITHOUT committing first. Tag pointed to old commit where package.json was the old version. CI built the old version, manifest pointed to new version → 404 on download. This happened on v0.3.67 AND v0.3.68. | **IRON RULE: COMMIT and PUSH to main BEFORE creating any tag. The tag must point to a commit that already contains the version bump. If you skip the commit, the entire pipeline produces garbage.** |
| Version mismatch | Bumped only 2 of 3 package.json files | `validate-versions.ts` pre-commit hook blocks mismatched commits |
| Broken imports | Created files importing `../../config/ajv` which didn't exist | System prompt RULE 6 now requires verifying all imports resolve |
| Messy version bumps | Multiple commits each bumping to different versions | System prompt enforces single atomic version bump + tag |
| manifest.json manually edited | Overwrote CI-managed file, then CI overwrote it back | All prompts now say "manifest.json is auto-updated by CI" |
| Force-push to main | Destructive history rewrite | All protocol prompts include "NEVER force-push to main" |
| Out-of-scope variable reference | Edited child component but referenced parent variable (`chat`, `settings`, etc.) | System prompt RULE 8 enforces scope awareness; pre-commit `tsc --noEmit` catches type errors |
| Code pushed without type check | Build fails on Railway with type errors that were never checked locally | Pre-commit hook now runs `tsc --noEmit` on `apps/web` before every commit |
| **Stale pnpm-lock.yaml (FATAL)** | Removed deps from `apps/web/package.json` but never ran `pnpm install` to update `pnpm-lock.yaml`. CI uses `--frozen-lockfile` which fails if lockfile doesn't match package.json. This killed v0.3.68 CI on the first attempt. | **After ANY change to ANY `package.json` (adding, removing, or changing deps), run `pnpm install` locally and commit the updated `pnpm-lock.yaml`. CI uses `--frozen-lockfile` which rejects mismatched lockfiles.** |
| **NSIS buffer overflow (FATAL)** | Adding new npm dependencies increased the standalone output file count. NSIS logs every file to stdout. When file count got too high, Node.js `Array.join()` in `child_process.exithandler` hit V8's max string length (~512MB) → `RangeError: Invalid string length`. Desktop build ran 1+ hour then crashed. Killed v0.3.74-v0.3.77 desktop releases. | **`electron-builder.config.js` has aggressive file exclusion filters (`.map`, `.d.ts`, `README`, `CHANGELOG`, `LICENSE`, `*.md`, `__tests__/`, `test/`, `docs/`, config files) on both `files` and `extraResources`. NEVER remove these filters. If adding new deps causes the build to fail again, add MORE exclusion patterns.** |
| **Client importing Node.js modules (FATAL)** | `NexusStore.tsx` (client component) imported `nexus-registry.ts` which imported `tool-registry.ts` which imported `alfred-tools.ts` which used `child_process`. Webpack cannot bundle Node.js modules for the browser → `Module not found: Can't resolve 'child_process'`. Killed v0.3.74-v0.3.75 Railway builds. | **Client components CANNOT import Node.js-only modules. Use API routes as proxies. For desktop-only packages like `@titan/mcp-servers`, use `// @ts-ignore` + `/* webpackIgnore: true */` on dynamic imports — they gracefully fail at runtime on Railway (503 response).** |

### FATAL RELEASE MISTAKE — TAG BEFORE COMMIT (v0.3.67/v0.3.68 incident)

**What happened:** The version was bumped in the 3 package.json files locally, but the changes were NEVER committed. Then a git tag was created and pushed. The tag pointed to an old commit where package.json still had the old version. CI checked out that commit, electron-builder read the OLD version from package.json, built the .exe with the WRONG filename, and created a GitHub Release under the WRONG version. Meanwhile, the manifest update step read the version from the tag and wrote a download URL pointing to a file that didn't exist. Result: 404 on the landing page download button.

**The IRON RULE (non-negotiable):**
```
1. Bump version in 3 package.json files
2. git add -A
3. git commit -m "vX.Y.Z: description"    ← THIS MUST HAPPEN BEFORE ANY TAG
4. git push origin main                     ← THIS MUST SUCCEED BEFORE ANY TAG
5. git tag -a vX.Y.Z -m "vX.Y.Z: desc"   ← ONLY after commit is on remote
6. git push origin vX.Y.Z                  ← NOW the tag triggers CI correctly
```

**How to verify you didn't make this mistake:**
```bash
git log --oneline -1   # The top commit message should contain your version number
git show HEAD:package.json | grep version  # Should show the NEW version, not the old one
```
If the top commit doesn't contain your version bump, DO NOT create a tag. Commit first.

### Troubleshooting

- If desktop build fails with TypeScript errors, check `apps/desktop/src/` for strict null issues
- **If CI fails with `ERR_PNPM_OUTDATED_LOCKFILE`**: the `pnpm-lock.yaml` doesn't match a `package.json`. Run `pnpm install` locally (NOT `--frozen-lockfile`), commit the updated lockfile, and push again. This is the #1 cause of CI failures after dependency changes.
- **If desktop build fails with `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` + `status code 404`**: The `customNsisBinary` URL in `electron-builder.config.js` is wrong. The ONLY valid URL is `https://github.com/SoundSafari/NSISBI-ElectronBuilder/releases/download/1.0.0/nsisbi-electronbuilder-3.10.3.7z`. NEVER change this URL unless the NSISBI repo publishes a verified new release. This killed v0.3.79 (wrong org `AstraliteHeart` + wrong tag `v1.0.1`).
- **If desktop build fails with `RangeError: Invalid string length`**: The tar-based approach (v0.3.79+) should prevent this. If it recurs, verify that `release-desktop.yml` has the "Prepare web standalone for packaging" step and that `electron-builder.config.js` extraResources points to `web-server-standalone.tar` (not the standalone directory).
- The CI pipeline uses `pnpm install --frozen-lockfile` — run `pnpm install` locally first if you added OR removed deps
- Railway auto-deploys on push to main (watches `apps/web/**`)
- If pre-commit hook blocks your commit: run `npx ts-node scripts/validate-versions.ts` to see which files mismatch
- **If desktop build fails with `RangeError: Invalid string length`**: The NSIS installer is processing too many files. The stdout exceeds Node.js V8 max string length (~512MB). Fix: add more exclusion patterns to `electron-builder.config.js` `files` and `extraResources` filters (`.map`, `.d.ts`, `*.md`, test dirs, docs, configs). These are safe to exclude — the standalone output is fully compiled JS; Node.js never reads `.d.ts` or `.map` files at runtime. See the v0.3.74-v0.3.77 incident.
- **If Railway build fails with `Module not found: Can't resolve 'child_process'` (or similar Node.js module)**: A client-side component is importing a server-only module. Fix: remove the import chain from client code. If the module is desktop-only (like `@titan/mcp-servers`), use `// @ts-ignore` + `/* webpackIgnore: true */` on the dynamic import so both TypeScript and webpack skip it. The route should return 503 on Railway.
- **If Railway build fails with `Cannot find module '@titan/mcp-servers'`**: This workspace package only exists in the desktop app. The API route importing it must use `// @ts-ignore` + `/* webpackIgnore: true */` on the dynamic import line. TypeScript and webpack both need to be told to skip it.

---

## Forge Harvester — Training Data Collection

### Architecture

The Forge harvester scrapes high-quality coding knowledge from 15+ public sources, processes it through a 5-pass quality pipeline, and stores it in Supabase.

**Sources**: GitHub, StackOverflow, Reddit, Dev.to, MDN, Wikipedia, HackerNews, ArXiv, GitLab, npm-docs, Codeforces, GitHub Issues, Docs, Blogs, HuggingFace Datasets

**Pipeline**: Rule filter → AI content detection → AI quality judge (6+/10) → Format conversion → Exact + MinHash dedup

### Quick Commands

```powershell
# Build forge package first
pnpm --filter @titan/forge run build

# Single harvest (one source, one topic)
pnpm --filter @titan/forge run harvest -- --source github --topic "React hooks" --limit 20

# All sources at once
pnpm --filter @titan/forge run harvest -- --source all --limit 50

# Check current stats
pnpm --filter @titan/forge run harvest -- --stats

# Review pending samples
pnpm --filter @titan/forge run harvest -- --review
```

### Continuous Harvest (Phase 1: 10,000 samples)

The continuous harvester runs non-stop, cycling through 120+ topics across all 15 sources with 100 parallel workers.

```powershell
# Load env and run continuous harvester
Get-Content "apps\web\.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)=(.+)$' -and $_ -notmatch '^\s*#') {
    [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
  }
}

# Start continuous harvest (runs until 10,000 samples)
node packages/forge/dist/cli/harvest-continuous.js

# Or with custom settings
$env:FORGE_TARGET = "50000"        # Phase 2 target
$env:FORGE_WORKERS = "100"          # Parallel workers
$env:FORGE_LIMIT = "30"            # Items per source per round
$env:FORGE_MIN_SCORE = "6"         # Quality threshold (0-10)
$env:FORGE_COOLDOWN = "30000"      # ms between rounds
$env:FORGE_EVOL = "1"              # Enable Evol-Instruct upgrade
$env:FORGE_NOTIFY_EMAIL = "shadowunitk9@gmail.com"  # Email on completion
node packages/forge/dist/cli/harvest-continuous.js
```

### Data Volume Targets

| Phase | Target | Quality Level | Use |
|-------|--------|---------------|-----|
| 1 | 10,000 | High (score 6+) | Initial QLoRA fine-tune |
| 2 | 50,000 | High | WizardCoder-competitive |
| 3 | 150,000+ | High | DeepSeek-Coder quality |

### After Harvesting

```powershell
# Export to JSONL for training
pnpm --filter @titan/forge run export -- --format jsonl --out data/phase1.jsonl

# Export approved samples only
pnpm --filter @titan/forge run export -- --format jsonl --status approved --out data/phase1-approved.jsonl

# Run evaluation
pnpm --filter @titan/forge run eval
```

### GitHub Actions Automation

- **forge-harvest.yml**: Daily at 2:00 AM UTC, rotates sources on 10-day cycle
- **forge-backup.yml**: Weekly backup to `forge-backups` branch

---

## Titan Plan Sniper V2 Protocol

Plan Sniper V2 is a 5-role multi-model orchestra that executes Plan Mode tasks. It is the **default execution engine for Plan Mode** -- when you hit "Start Plan", all tasks are sent to Sniper V2 for parallel execution with full verification.

### V2 Architecture (eliminates EXECUTOR bottleneck)

In V1, the CODER generated text and the EXECUTOR translated it into tool calls. This two-step process lost information and was error-prone. **V2 eliminates the EXECUTOR entirely** -- the CODER now uses native OpenAI function-calling API to execute tools directly (create_file, edit_file, run_command, etc.).

### Roles & Models

| Role | Model | Cost ($/1M tokens in/out) | Purpose |
|------|-------|---------------------------|---------|
| SCANNER | Devstral 2 | $0.05 / $0.22 | Reads codebase, maps dependencies and conventions |
| ARCHITECT | DeepSeek V3.2 | $0.25 / $0.38 | Creates task DAG, assigns risk levels, routes to models |
| CODER (low/med risk) | Qwen3 Coder | FREE | Direct tool-calling code generation |
| CODER (high/critical risk) | DeepSeek V3.2 | $0.25 / $0.38 | High-risk code with direct tool calling |
| SENTINEL | DeepSeek V3.2 | $0.25 / $0.38 | Rigorous per-task verification against acceptance criteria |
| JUDGE | Qwen3.5 Plus | $0.40 / $2.00 | Final holistic quality gate + checklist |

### Flow

1. User generates a plan in Plan Mode (tasks + subtasks)
2. User clicks "Start Plan" -- all tasks sent to `/api/titan/sniper`
3. SCANNER reads the codebase and maps conventions
4. ARCHITECT converts plan tasks into a parallel execution DAG
5. Up to 8 parallel worker lanes: CODER (direct tool calling) -> SENTINEL verification
6. Failed tasks get up to 2 rework attempts with sentinel feedback
7. Circuit breaker: 3 consecutive lane failures pauses remaining tasks
8. JUDGE does final holistic review and fills common-sense checklist
9. Real-time SSE events update task statuses in Plan Mode panel
10. Cost: ~$2-10 for a complete 50-task app (cheaper than V1 due to eliminating EXECUTOR)

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/sniper/sniper-model.ts` | Config, roles, types, cost tracker, DAG types |
| `apps/web/src/lib/sniper/sniper-scanner.ts` | SCANNER: Codebase analysis |
| `apps/web/src/lib/sniper/sniper-architect.ts` | ARCHITECT: Plan tasks -> parallel DAG |
| `apps/web/src/lib/sniper/sniper-worker.ts` | CODER: Direct tool-calling implementation |
| `apps/web/src/lib/sniper/sniper-sentinel.ts` | SENTINEL: Per-task verification |
| `apps/web/src/lib/sniper/sniper-judge.ts` | JUDGE: Final quality gate |
| `apps/web/src/lib/sniper/sniper-orchestrator.ts` | Main loop: SCANNER -> ARCHITECT -> parallel lanes -> JUDGE |
| `apps/web/src/lib/sniper/sniper-executor.ts` | DEPRECATED (V1 only, not imported) |
| `apps/web/src/app/api/titan/sniper/route.ts` | SSE API route for sniper execution |
| `apps/web/src/hooks/useSniperChat.ts` | Chat hook for sniper model dropdown |
| `apps/web/src/components/ide/PlanModePanel.tsx` | Plan Mode UI -- wired to Sniper V2 |

### API Route

`POST /api/titan/sniper` -- SSE streaming endpoint. Accepts `goal`, `tasks[]`, `workspacePath`, `fileTree`, `openFiles`, `cartographyContext`. Streams events: `scan_start`, `scan_complete`, `dag_created`, `lane_start`, `lane_status`, `lane_verified`, `lane_failed`, `lane_rework`, `task_status`, `judge_start`, `judge_complete`, `pipeline_complete`, `sniper_error`.

---

## Titan Persistent Memory (7-Layer God-Tier System)

Titan has a 7-layer persistent memory system that survives across conversations:

1. **Core Facts** — User identity, preferences, project context (importance 8-10)
2. **Decisions** — Architectural choices, tech stack, conventions (importance 8-9)
3. **Active Context** — Current tasks, recent changes, WIP (expires in 7 days)
4. **Conversation Summaries** — Compressed history of past sessions (last 50)
5. **Error Patterns** — Anti-patterns, things to avoid (importance 7-8)
6. **Mistake Ledger** — Exact mistakes + their fixes, never repeated (importance 9-10)
7. **Learned Skills** — How-to knowledge auto-extracted from successful solutions (usage-tracked)

Memory is stored in localStorage (instant) and auto-injected into every message. It auto-extracts important context from each conversation turn.

### How it works

- `useTitanMemory` Zustand store persisted to localStorage
- `serialize()` generates a memory prefix injected into every user message
- `extractAndStore()` runs after each assistant response to capture new facts
- `addSkill()` / `recordMistake()` for explicit skill/mistake tracking
- Skills track usage count — most-used skills are prioritized in injection
- Mistakes include the exact fix — AI reads these and never repeats them
- Deduplication prevents storing the same fact twice
- Expiring facts (context layer) auto-clean after 7 days

---

## Code Directory System

Titan maintains a persistent code directory that indexes the entire project structure:

### What it tracks

- **Routes/Pages** — Every page and route with file paths
- **API Endpoints** — All API routes with methods (GET/POST/etc)
- **Components** — React/Vue/etc components with descriptions
- **Stores** — State management stores (Zustand, Redux, etc)
- **Hooks** — Custom hooks with descriptions
- **Types** — Type definition files
- **Configs** — Configuration files (tsconfig, package.json, etc)

### How it works

- `useCodeDirectory` Zustand store persisted to localStorage
- Populated by scanning via `/api/plan/scan` using Gemini Flash
- Serialized and injected into every AI message alongside memory
- Auto-updated when Plan Mode scans the codebase
- Used by subtask generator to create project-specific verification tasks

---

## Plan Mode (Subzero Protocol)

Plan Mode is a task management and execution system integrated into the Titan IDE chat.

### Features

- **Start/Pause/Stop execution** — Control plan execution flow
- **Pseudo-code intake** — Paste rough ideas, AI converts to structured plans
- **Code scanning** — Scans project to understand structure before planning
- **Smart subtasks** — Each checklist item gets project-specific subtasks from the code scanner
- **Dynamic checklist** — Auto-generated verification checklist specific to the actual project (not generic)
- **15 design templates** — Visual presets (Basic, Modern, Elite/Iron Man) with color customization
- **Plan Brain Protocol** — 4-role orchestrator: Scanner → Planner → Verifier → Corrector

### API Routes

- `POST /api/plan/generate` — Generate tasks from user prompt
- `POST /api/plan/scan` — Scan codebase for code directory
- `POST /api/plan/subtasks` — Generate subtasks for a checklist item
- `POST /api/plan/checklist` — Generate project-specific checklist
- `POST /api/plan/pseudo-code` — Parse pseudo-code into structured plan

---

## Midnight Mode (Autonomous Factory)

Midnight Mode is the autonomous build system that executes projects end-to-end.

### New Features

- **In-process fallback** — Start button works without sidecar (uses API-based execution)
- **Chat input** — Describe new projects via chat, drag & drop images for design references
- **Image support** — Drop images for design mockups or error screenshots
- **Plan-store integration** — Tasks automatically sync to Plan Mode checklist
- **Wider panel** — 600px when active (vs 420px for other views)
- **Back to IDE** — Quick button to return to editor while Midnight runs

---

## Model Protocols

| Protocol | Models | Best For |
|----------|--------|----------|
| Phoenix Protocol | Gemini Flash (Scout), DeepSeek (Coder), Claude (Architect) | General tasks |
| Plan Sniper V2 | 5 specialized models (SCANNER/ARCHITECT/CODER/SENTINEL/JUDGE) | Plan Mode execution (default engine) |
| Supreme Protocol | Multi-pass verification | High-stakes changes |
| Omega Protocol | Long-horizon governance | Complex refactors |

---

## Railway Deployment

- Auto-deploys from `main` branch
- Config: `apps/web/railway.toml` and `apps/web/nixpacks.toml`
- Start command: `npm run start` (uses `next start`)
- Health check: `GET /`

---

## Auto-Workspace (Desktop)

On launch, if no folder is loaded, the desktop app automatically creates `C:\TitanWorkspace` and opens it as the default workspace. New projects created by Midnight Mode or Plan Mode are placed as subfolders (e.g., `C:\TitanWorkspace\my-app`).

Implementation: `useFileSystem.ensureDefaultWorkspace()` in `apps/web/src/hooks/useFileSystem.ts`, triggered on mount from `titan-ide.tsx`.

---

## Localhost & Dev Server Rules

When running dev servers, the AI must:

1. **Announce URL immediately** — "Server running at http://localhost:3000"
2. **Kill old servers first** — Before starting a new server, kill any existing one on the same port
3. **Handle port conflicts** — If port is in use, either kill the process or use an alternative port
4. **Remind on cleanup** — After finishing, remind user the server is still running
5. **Never leave servers running silently** — Always reference running servers in the summary

These rules are enforced in the system prompt (Section 21).

---

## Voice Input

Voice input uses the Web Speech API (built into Chromium/Electron):

- Mic button in chat input toggles speech-to-text
- Auto-sends message after 2.5s of silence following speech
- Error messages displayed inline (permission denied, no network, etc.)
- Interim transcript shown while speaking

Implementation: `useVoiceInput` hook in `apps/web/src/hooks/useVoiceInput.ts`.

---

## Alfred (Superintelligent Overseer)

Alfred is the Titan AI superintelligent overseer — an autonomous learning framework with LLM-driven tool calling, hybrid RAG, self-improvement loops, and fail-safe protocol orchestration.

### Architecture

**4-role multi-model protocol + LLM tool calling:**
- **PERCEIVER** (Qwen3 VL 235B): Vision, multimodal understanding
- **THINKER** (Qwen3.5 397B MoE): Deep reasoning, idea generation
- **RESPONDER** (Gemini 2.0 Flash): Conversation + 26-tool function calling
- **SCANNER** (Devstral 2): Codebase scanning, project health

**Tool-calling loop:** RESPONDER receives 26 tools via OpenAI function-calling API → decides which tools to call based on conversation → executes server-side (web research, brain queries) or emits client-side actions (protocol starts, mode switches) → feeds results back → generates final response.

**Hybrid RAG (RRF):** Brain queries use BM25 sparse keyword + dense embedding retrieval, fused with Reciprocal Rank Fusion (k=60).

**Self-improvement:** Experience capture → Strategy distillation (every 10 conversations) → Principle retrieval injected as [LEARNED STRATEGIES].

**Three-tier safety:**
| Tier | Examples | Behavior |
|------|----------|----------|
| Instant | read, search, browse, query, check status | Execute immediately |
| Confirm | start/stop protocols, harvester, git ops | Requires "proceed" |
| Forbidden | force-push, delete workspace, modify build configs | Refused outright |

### Key files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/voice/alfred-tools.ts` | **26 tool definitions + safety tiers + server-side execution** |
| `apps/web/src/lib/voice/hybrid-search.ts` | **BM25 + RRF hybrid search engine** |
| `apps/web/src/lib/voice/self-improvement.ts` | **Experience capture, strategy distillation, principle retrieval** |
| `apps/web/src/lib/voice/titan-personality.ts` | Superintelligent personality prompt (tool awareness, protocol mastery, 3-tier safety) |
| `apps/web/src/lib/voice/titan-voice-protocol.ts` | 4-role model orchestrator |
| `apps/web/src/lib/voice/brain-storage.ts` | Supabase brain service + hybrid queryBrain (9 categories) |
| `apps/web/src/lib/voice/system-control.ts` | System control (all protocols, Forge, web, markets, auto-learn, knowledge) |
| `apps/web/src/lib/voice/voice-commands.ts` | Voice command parser (regex fast-path for simple commands) |
| `apps/web/src/lib/voice/thought-engine.ts` | Proactive thought system |
| `apps/web/src/lib/voice/vision.ts` | Screenshot/viewport capture |
| `apps/web/src/lib/voice/knowledge-ingest.ts` | Harvest data → brain pipeline |
| `apps/web/src/lib/voice/evolution-tracker.ts` | Growth & evolution tracking |
| `apps/web/src/lib/voice/web-browser.ts` | URL fetch + content extraction |
| `apps/web/src/lib/voice/auto-learner.ts` | Autonomous background learning engine |
| `apps/web/src/stores/titan-voice.store.ts` | TTS state (Zustand) |
| `apps/web/src/hooks/useAlfredAmbient.ts` | Wake word, tool-call handling, self-improvement hooks, canvas event emission |
| `apps/web/src/stores/alfred-canvas-store.ts` | **Canvas state (Zustand): modes, sessions, workflows, stats** |
| `apps/web/src/components/alfred/AlfredFullPage.tsx` | **Full-page split-pane layout (canvas + chat)** |
| `apps/web/src/components/alfred/AlfredHeader.tsx` | **Session tabs, mode tabs, status indicator** |
| `apps/web/src/components/alfred/AlfredChat.tsx` | **Extracted chat UI with quick actions** |
| `apps/web/src/components/alfred/AlfredCanvas.tsx` | **Mode router for 6 canvas views** |
| `apps/web/src/components/alfred/AlfredQuickActions.tsx` | **Context-aware action chips** |
| `apps/web/src/components/alfred/canvas/ScreenView.tsx` | **Idle dashboard + live web content** |
| `apps/web/src/components/alfred/canvas/CodePreview.tsx` | **Syntax-highlighted code diffs** |
| `apps/web/src/components/alfred/canvas/TerminalView.tsx` | **Live terminal output** |
| `apps/web/src/components/alfred/canvas/FileTreeView.tsx` | **File change tree** |
| `apps/web/src/components/alfred/canvas/VibeCode.tsx` | **Interactive code sandbox + preview** |
| `apps/web/src/components/alfred/canvas/DashboardView.tsx` | **Stats, sessions, workflows dashboard** |
| `apps/web/src/app/api/titan/voice/route.ts` | SSE API with tool-calling loop |
| `apps/web/src/lib/llm-call.ts` | callModelWithTools (function-calling support) |

### Tools (26 total via LLM function calling)

Alfred's LLM decides when to call tools — no regex matching needed for complex actions:
- **Protocol control**: start_protocol, stop_protocol, check_protocol_status (Phoenix, Supreme, Midnight, Sniper)
- **IDE operations**: read_file, search_code, run_command, scan_project
- **Web research**: browse_url, web_search, research_topic
- **Brain/knowledge**: store_knowledge, query_knowledge
- **Harvester**: start_harvester, stop_harvester, check_harvest_status
- **Self-improvement**: evaluate_performance, start_auto_learn, stop_auto_learn
- **Mode control**: switch_mode, start_plan, mute_voice, snooze_thoughts
- **Finance**: check_markets
- **Git**: git_commit, git_push

### Voice commands (regex fast-path)

Simple commands still work via wake word + regex:
- "Alfred, start midnight mode" — Confirm → Start Midnight
- "Alfred, scan the project" — Code scan
- "Alfred, what's the status?" — Plan progress
- "Alfred, proceed / go ahead / do it" — Confirm pending action
- "Alfred, be quiet" — Mute voice
- "Alfred, snooze thoughts" — Snooze proactive thoughts

Complex actions now go through LLM tool calling — just ask naturally:
- "Alfred, start Phoenix to refactor the auth module"
- "Alfred, research the latest Next.js best practices"
- "Alfred, how is our harvester doing?"

### Supabase tables

Run the SQL in `brain-storage.ts` (exported as `SUPABASE_MIGRATION_SQL`) to create:
- `titan_voice_brain` — Knowledge, skills, ideas, observations, mistakes
- `titan_voice_conversations` — Conversation summaries
- `titan_voice_ideas` — Project ideas and inventions

### Proactive Thought Engine

Timer-based with human cognition timing:
- Idle: 45s–2min intervals
- Active: 2–5min intervals
- Coding: 3–8min intervals

6 categories (weighted): project improvement (30%), new idea (20%), check-in (15%), knowledge share (15%), warning (10%), motivation (10%).

### Knowledge Ingestion

Polls Forge harvester data every 5 minutes, extracts insights, stores in brain with expanded category routing:
- `knowledge` — general facts, documentation
- `skill` — best practices, patterns, techniques
- `idea` — innovations, new concepts, tech news
- `finance` — stocks, crypto, real estate, investing
- `strategy` — business, military, chess strategy
- `culture` — books, movies, entertainment
- `research` — AI research, arXiv papers, academic

### Three-Tier Safety (v0.3.47)

All actions are classified into 3 safety tiers:
1. **Instant**: Reads, searches, queries, status checks — execute immediately
2. **Confirm**: Protocol starts/stops, harvester, git operations — require "proceed" / "go ahead"
3. **Forbidden**: Force-push, delete workspace, modify build configs — refused outright

---

## Changelog

### v0.3.80 — Fix NSISBI Download URL (2026-02-28)

**Root cause:** v0.3.79 desktop build failed instantly (8s) at "Publish desktop app (Windows)" because the NSISBI custom binary URL pointed to a nonexistent GitHub release (`AstraliteHeart/NSISBI-ElectronBuilder/v1.0.1` — 404). The correct repo is `SoundSafari/NSISBI-ElectronBuilder` at tag `1.0.0`.

**Fix:** Corrected `customNsisBinary.url` in `electron-builder.config.js` to `https://github.com/SoundSafari/NSISBI-ElectronBuilder/releases/download/1.0.0/nsisbi-electronbuilder-3.10.3.7z`. Checksum was already correct.

### v0.3.79 — God-Tier Desktop Build Fix (2026-02-28)

**Root cause:** NSIS processes every file individually and logs each one to stdout. The web standalone output (with `outputFileTracingRoot` spanning the entire monorepo) contained potentially hundreds of thousands of files. After pnpm flattening (symlinks replaced with copies), NSIS's stdout exceeded Node.js V8 max string length (~512MB), crashing with `RangeError: Invalid string length`. File exclusion filters (v0.3.78) were not enough — the file count was still too high.

**The fix (three-layer approach):**
1. **Pre-compress standalone into a single tar** — CI now flattens pnpm symlinks with `prepare-standalone.js`, then tars the entire standalone directory into ONE file (`web-server-standalone.tar`). NSIS only sees 1 file instead of 100,000+. This eliminates the stdout overflow entirely.
2. **NSISBI custom binary** — Replaces standard NSIS with NSISBI (NSIS Build Improved) which handles installers >2GB. Community-recommended fix from electron-builder #8399.
3. **First-launch extraction** — Electron main.ts detects the tar on first launch, extracts it to `resources/web-server/`, then deletes the tar. ~5 second one-time cost. After that, the app runs exactly as before.

**Changes:**
- `electron-builder.config.js`: Removed afterPack flattening, changed extraResources to use single tar, added NSISBI customNsisBinary, kept file exclusion filters on desktop node_modules
- `release-desktop.yml`: Added "Prepare web standalone for packaging" step (flatten + tar)
- `apps/desktop/scripts/prepare-standalone.js`: New script — flattens pnpm symlinks in standalone output
- `apps/desktop/src/main.ts`: Added `extractWebServerIfNeeded()` for first-launch tar extraction

### v0.3.78 — Fix Desktop Release Pipeline (2026-02-28)

**Desktop Build Fix:**
- **NSIS buffer overflow fix**: Desktop builds from v0.3.74-v0.3.77 all failed because the NSIS installer compiler produced >512MB of stdout when processing the web standalone output + flattened node_modules. Node.js `Array.join()` in `child_process.exithandler` hit V8's max string length limit (`RangeError: Invalid string length`). Fixed by adding aggressive file exclusion filters to `electron-builder.config.js`:
  - Excludes source maps (`.map`), TypeScript declarations (`.d.ts`), README/CHANGELOG/LICENSE, test directories, docs, config files from both `files` and `extraResources`
  - Also strips `.map` files from static assets
  - Reduces file count by ~40-60%, bringing NSIS output well under the buffer limit
- **Root cause**: New dependencies added since v0.3.73 (react-markdown, remark-gfm, zod v4, etc.) increased the standalone output size past the NSIS/Node.js limit

### v0.3.77 — Railway Build Fixes (2026-02-28)

**Build Fixes:**
- **Browser route fix**: `/api/browser/route.ts` was importing `@titan/mcp-servers` which only exists in the desktop app workspace. Railway builds only `apps/web`, so the module was missing. Fixed with `@ts-ignore` + `webpackIgnore` so webpack skips it at bundle time and TypeScript skips it at type-check time. On Railway, the route gracefully returns 503 "not available in web deployment"
- **Nexus registry fix (v0.3.75)**: Completely removed `tool-registry.ts` imports from `nexus-registry.ts` to eliminate `child_process` module resolution in client bundle
- **Nexus wiring (v0.3.76)**: Synced built-in add-on lists between `NexusStore.tsx` and `nexus-registry.ts`, wired Nexus skill injection into voice conversations

### v0.3.74 — Alfred God-Tier Complete Upgrade (2026-02-28)

**Critical Bug Fixes:**
- **Greeting loop fix**: Alfred was repeating "I'm ready when you are, sir" 20+ times. Root cause: `hasGreeted` was in-memory state that reset on every component remount (view switch). Fixed: now uses `sessionStorage` flag — one greeting per browser session, plus `deduplicateLog()` strips consecutive duplicate messages from persisted log
- **"I cannot" refusal eliminated**: Alfred was saying "I cannot directly display..." for any request. Added CAN-DO PROTOCOL + WING-IT PROTOCOL to personality — Alfred now NEVER refuses. Instead he searches, offers clickable choices, or builds it. Banned phrases list enforced
- **Memory hallucination fix**: Brain storage had zero deduplication — duplicate entries accumulated and polluted context, causing repetition/hallucination. Added `isDuplicate()` fuzzy matching (substring + exact match). Brain context truncation now cuts at entry boundaries, not mid-sentence
- **Store obsession fix**: Personality said "Store important findings with store_knowledge" which made Alfred mention storing in every response. Softened instruction + added explicit "do NOT mention storing unless user asks"
- **Double brain context fix**: Voice API route was injecting both client-sent brainContext AND computing its own server-side. Removed server-side `serializeBrainContext()` — only uses client context
- **Context overflow fix**: Reduced memoryContext from 5000 to 2000 tokens, brainContext from 4000 to 1500 chars to prevent model truncation/hallucination
- **extractAndStore pollution fix**: Was extracting from BOTH user messages AND Alfred's responses (circular pollution). Now only extracts from user messages

**Browser Automation:**
- **BrowserServer enhanced**: Added `browser_scroll`, `browser_back`, `browser_forward`, `browser_select` to Playwright BrowserServer
- **Browser API route**: New `/api/browser/route.ts` proxy manages singleton BrowserServer, accepts any browser command
- **Browser tools wired**: All 12 browser tools (navigate, click, type, scroll, screenshot, back, forward, select, get_text, evaluate, wait, close) added to system-control.ts
- **BROWSER MASTERY personality**: Alfred knows he controls a real browser — can click buttons, fill forms, close popups, sign up for services, scroll, navigate

**Smart Canvas + Intelligence:**
- **Smart ScreenView**: YouTube iframe embeds, clickable URLs, markdown rendering, search result cards, code blocks
- **Disambiguation choice chips**: New `AlfredChoiceChips.tsx` — when Alfred offers options using `[choices: A | B | C]` format, they render as clickable pill buttons in chat
- **CAN-DO + WING-IT protocols**: Alfred improvises for ANY request by chaining tools creatively. Example scenarios embedded in personality
- **10+ new voice patterns**: YouTube lookups, natural language search, canvas mode switching, URL browsing, research queries

**Agent Dashboard & Scaling:**
- **Agent tracking store**: `AgentInfo` interface + `agents` array + `addAgent/updateAgent/removeAgent` actions in alfred-canvas-store
- **Enhanced DashboardView**: Agent grid with status badges, progress bars, kill/dismiss buttons, filter tabs (All/Running/Completed/Failed), stats summary with cost tracking
- **Session spawn upgrade**: MAX_SESSIONS raised to 50, progress callbacks, auto-reports to canvas store

**Slack Integration:**
- **Slack Events API**: New `/api/integrations/slack/events/route.ts` — handles URL verification, message events, app mentions, forwards to Alfred
- **Bi-directional Slack**: Added `listen()`, `createChannel()`, `postThread()` to channel-adapter.ts

**Marketplace:**
- **NexusStore UI**: Full marketplace component with add-on cards, search, category filters, install/uninstall/enable/disable, 8 built-in add-ons
- **Wired into Extensions**: NexusStore replaces "Coming Soon" placeholder in titan-ide.tsx Extensions panel

**New files**: AlfredChoiceChips.tsx, NexusStore.tsx, /api/browser/route.ts, /api/integrations/slack/events/route.ts
**Modified (19 files)**: useAlfredAmbient.ts, titan-personality.ts, brain-storage.ts, voice-commands.ts, system-control.ts, ScreenView.tsx, AlfredChat.tsx, DashboardView.tsx, alfred-canvas-store.ts, session-spawn.ts, channel-adapter.ts, titan-ide.tsx, voice/route.ts, self-improvement.ts, browser-server.ts, TITANSYNC.md, 3x package.json

### v0.3.73 — Alfred Full-Page Workspace (2026-02-28)

- **Full-page Alfred UI**: Replaced 600px sidebar with full-page immersive workspace (orgo.ai-killer)
- **Resizable split-pane**: Canvas (62%) + Chat (38%) with draggable divider, min 280px per pane
- **Live canvas**: 6 auto-switching views — Screen, Code, Terminal, Files, Vibe Code, Dashboard
- **Canvas auto-switch**: Automatically shows what Alfred is doing (web browsing, code editing, terminal output, file changes); pin button to lock view
- **Multi-agent session tabs**: Create multiple agent sessions from the header (like orgo.ai's multiple computers)
- **Dashboard view**: Real-time stats (tasks completed, success rate, cost), session progress bars, active workflow tracker
- **Vibe Code sandbox**: Interactive code editor with live HTML preview and push-to-workspace button
- **Quick action chips**: Context-aware suggested actions (Build, Search, Plan Mode, Scan, Deploy)
- **Tool-to-canvas wiring**: useAlfredAmbient SSE tool_call/tool_result events push live content to canvas store
- **ElevenLabs TTS**: Fixed missing .env.local — Alfred now speaks with ElevenLabs voice
- **Dead code cleanup**: Removed legacy AlfredPanel (220 lines) from titan-ide.tsx
- **New files**: alfred-canvas-store.ts (Zustand), AlfredFullPage.tsx, AlfredHeader.tsx, AlfredChat.tsx, AlfredCanvas.tsx, AlfredQuickActions.tsx, ScreenView.tsx, CodePreview.tsx, TerminalView.tsx, FileTreeView.tsx, VibeCode.tsx, DashboardView.tsx

### v0.3.47 — Alfred Superintelligence Upgrade (2026-02-24)

- **LLM tool calling**: 26 tools via OpenAI function-calling API — RESPONDER model decides which tools to call based on conversation context, replacing regex for complex actions
- **Tool-calling loop**: Server-side multi-round tool execution (up to 3 rounds) with SSE streaming of tool calls and results
- **Hybrid RAG (RRF)**: BM25 sparse keyword scoring + dense embedding retrieval fused with Reciprocal Rank Fusion (k=60) — replaces simple keyword matching in queryBrain
- **Self-improvement loop**: Experience capture on every conversation → strategy distillation every 10 conversations → principle retrieval injected as [LEARNED STRATEGIES] before each response
- **Superintelligent personality**: Complete rewrite with tool-calling awareness, protocol mastery guide, 3-tier safety system, anti-hallucination protocol, scope awareness (overseer vs IDE agent), self-improvement directives
- **Protocol control completion**: Added startPhoenix, startSupreme, startSniper, getProtocolStatus to system-control.ts — Alfred can now start/stop ALL protocols
- **callModelWithTools**: New function in llm-call.ts supporting OpenRouter/LiteLLM function-calling API with tool_calls parsing
- **New files**: alfred-tools.ts (tool schema + execution), hybrid-search.ts (BM25 + RRF), self-improvement.ts (experience + strategies)

### v0.3.45 — Alfred AGI Upgrade (2026-02-24)

- **Personality overhaul**: Full system map, mission, financial awareness, honesty rules, proceed protocol, git awareness
- **Proceed protocol**: Destructive actions require "proceed" / "go ahead" confirmation
- **Web browser**: `web-browser.ts` — URL fetch with 5min cache + quick research
- **Auto-learner**: `auto-learner.ts` — background engine cycling 15+ topics every 10min
- **New voice commands**: proceed, check markets, browse URL, search brain, start/stop auto-learning, request analysis
- **New system controls**: browseWeb, searchKnowledge, startAutoLearn, stopAutoLearn, checkMarkets
- **Brain categories**: Added finance, strategy, culture, research — with full routing
- **7 new scrapers**: finance, real-estate, business-strategy, military-strategy, chess-strategy, books, movies
- **28 total harvest sources**: Up from 21, all wired into parallel workers
- **Git pipeline hardening**: Pre-commit hook, version validation script, 3-file version rule, GIT RULES in all protocol prompts
- **Cleanup**: Removed broken safe-json files, fixed titan-ide indentation

---

## Environment Variables

Required for local development: copy `apps/web/.env.example` to `apps/web/.env` and fill in values.

Key variables:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Database
- `OPENROUTER_API_KEY` — AI quality judge in harvester
- `GITHUB_TOKEN` — Higher API rate limits for GitHub scraping
- `HF_API_TOKEN` — HuggingFace gated datasets
