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
# 1. Commit your changes
git add -A
git commit -m "v0.X.XX: description of changes"

# 2. Push to main
git push origin main

# 3. Create and push a version tag (triggers desktop build + manifest update)
git tag -a v0.X.XX -m "v0.X.XX: description"
git push origin v0.X.XX

# 4. Monitor the pipeline
gh run list --workflow=release-desktop.yml --limit=3
gh run view <run-id> --log-failed   # if it fails
```

### Troubleshooting

- If desktop build fails with TypeScript errors, check `apps/desktop/src/` for strict null issues
- The CI pipeline uses `pnpm install --frozen-lockfile` — run `pnpm install` locally first if you added deps
- Railway auto-deploys on push to main (watches `apps/web/**`)

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

## Titan Plan Sniper Protocol

The Plan Sniper is a 7-role multi-model orchestra that executes Plan Mode tasks using specialized cheap models. When the user selects "Titan Plan Sniper" from the model dropdown, all conversation goes through the sniper pipeline.

### Roles & Models

| Role | Model | Cost | Purpose |
|------|-------|------|---------|
| SCANNER | Devstral 2 | FREE | Reads codebase, maps dependencies |
| ARCHITECT | MiMo-V2-Flash | FREE | Creates task DAG, assigns risk |
| CODER (low/med) | MiniMax M2.1 | $0.28/M in | Generates code |
| CODER (high) | DeepSeek V3.2 | $0.25/M in | High-risk code |
| EXECUTOR | Qwen3 Coder Next | $0.12/M in | Applies edits, runs commands |
| SENTINEL | Seed 1.6 | $0.25/M in | Verifies each task |
| JUDGE | Qwen3.5 Plus | $0.40/M in | Final quality gate |

### Flow

1. User describes what to build in Plan Mode
2. Sniper generates full task list via `bulkAddTasks()`
3. 8 parallel worker lanes execute tasks
4. Real-time status updates in Plan Mode panel
5. Cost: ~$5-15 for a complete 50-task app (vs $500-1000 with Opus/GPT-5)

### API Route

`POST /api/titan/sniper` — SSE streaming endpoint for sniper execution.

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
| Plan Sniper | 7 specialized models | Plan Mode execution |
| Supreme Protocol | Multi-pass verification | High-stakes changes |
| Omega Protocol | Long-horizon governance | Complex refactors |

---

## Railway Deployment

- Auto-deploys from `main` branch
- Config: `apps/web/railway.toml` and `apps/web/nixpacks.toml`
- Start command: `npm run start` (uses `next start`)
- Health check: `GET /`

---

## Environment Variables

Required for local development: copy `apps/web/.env.example` to `apps/web/.env` and fill in values.

Key variables:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — Database
- `OPENROUTER_API_KEY` — AI quality judge in harvester
- `GITHUB_TOKEN` — Higher API rate limits for GitHub scraping
- `HF_API_TOKEN` — HuggingFace gated datasets
