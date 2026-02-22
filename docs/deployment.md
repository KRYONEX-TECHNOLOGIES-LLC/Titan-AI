# Deployment Guide (Current)

## Web (Railway / Nixpacks)

This repo includes Railway config that builds `apps/web` with Nixpacks.

Relevant files:

- `apps/web/railway.toml`
- `apps/web/nixpacks.toml`
- `railway.json`

Build expectations:

- Root directory: `apps/web`
- Install: `npm ci`
- Build: `npm run build`
- Start: `npm run start`

### Common Railway failure: `Module not found: Can't resolve '@/…'`

Fix: ensure `apps/web/tsconfig.json` has:

- `compilerOptions.baseUrl = "."`
- `compilerOptions.paths["@/*"] = ["./src/*"]`

Without `baseUrl`, container builds can fail to resolve the `@/` import alias.

## Desktop (Electron packaging)

Packaging scripts live in:

- `apps/desktop/package.json`

Common commands:

```powershell
pnpm --filter @titan/desktop build
pnpm --filter @titan/desktop pack
pnpm --filter @titan/desktop pack:win
pnpm --filter @titan/desktop pack:mac
pnpm --filter @titan/desktop pack:linux
```

## Environment variables

Never commit secrets. Use platform environment variables (Railway/Vercel/etc.) or local `.env.local`.

For chat provider routing, the web app commonly expects:

- `OPENROUTER_API_KEY` (recommended)
- `OPENROUTER_BASE_URL` (optional; defaults to OpenRouter public URL)
- `TITAN_LITELLM_BASE_URL` / `LITELLM_PROXY_URL` (optional)
- `TITAN_LITELLM_API_KEY` / `LITELLM_MASTER_KEY` (optional)

