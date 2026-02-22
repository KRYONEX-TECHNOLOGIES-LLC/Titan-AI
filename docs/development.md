# Development Guide (Current Repo Reality)

If you are new to the repo, start with `docs/INDEX.md` and `docs/REPO_MAP.md`.

## Prerequisites

- Node.js **20+**
- pnpm **9+** (repo expects `pnpm@9.15.0`)
- Git
- Rust (only required when building native packages under `packages/indexer-native`)

Windows (PowerShell) recommended setup:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
node -v
pnpm -v
```

## Install

From repo root:

```powershell
pnpm install
```

## Run (development)

### Desktop (primary)

From repo root:

```powershell
pnpm dev:desktop
```

What happens:

- `turbo` runs `apps/desktop` dev script
- Electron starts and hosts the Next.js UI (default port **3100**)

### Web only (optional)

From repo root:

```powershell
pnpm dev:web
```

## Common scripts (repo root)

- **build everything**: `pnpm build`
- **build web**: `pnpm build:web`
- **build desktop**: `pnpm build:desktop`
- **typecheck**: `pnpm typecheck`
- **lint**: `pnpm lint`
- **format**: `pnpm format`

## Repo structure

```
apps/
  desktop/   Electron runtime + IPC tools
  web/       Next.js UI + API routes
  cli/       Titan CLI
packages/    Shared libs/engines (ai/core/security/midnight/etc.)
docs/        Canonical docs
```

## “I need to find where something is”

Don’t guess. Use:

- `docs/REPO_MAP.md` (fast pointers)
- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md` (end-to-end behavior)
- `PUSH-FOR-TITAN.md` (ops: push/restart)

