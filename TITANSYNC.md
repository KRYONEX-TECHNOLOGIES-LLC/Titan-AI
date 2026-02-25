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

The continuous harvester runs non-stop, cycling through 120+ topics across all 15 sources with 4 parallel workers.

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
$env:FORGE_WORKERS = "4"           # Parallel workers
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
