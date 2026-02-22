# @titan/web (Next.js)

This package is the **web UI + server API** for Titan AI.

## What this app is

- Next.js App Router project under `apps/web/src/app`
- Primary UI entry: `apps/web/src/app/editor/page.tsx` → `apps/web/src/components/titan-ide.tsx`
- Ships both:
  - **UI** (React components/hooks)
  - **API routes** under `apps/web/src/app/api/**`

## Dev commands

From repo root:

```powershell
pnpm dev:web
```

Or from this folder:

```powershell
pnpm dev
```

Build (production):

```powershell
pnpm build
```

## Critical paths (where to change what)

### IDE UI

- **Main IDE shell**: `src/components/titan-ide.tsx`
- **Editor surface**: `src/components/ide/EditorArea.tsx`
- **Chat rendering**: `src/components/ide/ChatMessage.tsx`
- **Agent loop (frontend orchestration)**: `src/hooks/useChat.ts`
- **Tool execution layer**: `src/hooks/useAgentTools.ts`
- **Sessions persistence**: `src/hooks/useSessions.ts`
- **Settings persistence**: `src/hooks/useSettings.ts`

### API routes

- **Chat (provider routing + security scanning)**: `src/app/api/chat/route.ts`
- **Chat continue (tool-calling + system prompt + tool definitions)**: `src/app/api/chat/continue/route.ts`
- **Models list**: `src/app/api/models/route.ts`
- **Omega orchestrator (SSE)**: `src/app/api/titan/omega/route.ts`
- **Midnight API**: `src/app/api/midnight/route.ts`

### Models

- **Registry**: `src/lib/model-registry.ts`

## Import alias (`@/`)

This repo uses the `@/` alias for `apps/web/src/*`.

Required config:

- `apps/web/tsconfig.json`:
  - `compilerOptions.baseUrl = "."`
  - `compilerOptions.paths["@/*"] = ["./src/*"]`

If a container build says it cannot resolve `@/…`, this is the first thing to check.

## Desktop vs Web

When running inside the Electron desktop app, the UI can call native capabilities via IPC (through the desktop preload bridge). The web package still contains API routes, but the “real tools” live in `apps/desktop/src/ipc/*`.

For the end-to-end wiring overview, read:

- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`

