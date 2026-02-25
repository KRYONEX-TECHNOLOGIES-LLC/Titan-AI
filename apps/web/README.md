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
- **Plan Sniper (SSE)**: `src/app/api/titan/sniper/route.ts`
- **Midnight API**: `src/app/api/midnight/route.ts`
- **Plan generate**: `src/app/api/plan/generate/route.ts`
- **Plan scan (codebase indexer)**: `src/app/api/plan/scan/route.ts`
- **Plan subtasks**: `src/app/api/plan/subtasks/route.ts`
- **Plan checklist**: `src/app/api/plan/checklist/route.ts`
- **Plan pseudo-code**: `src/app/api/plan/pseudo-code/route.ts`

### Stores

- **Plan Mode state**: `src/stores/plan-store.ts`
- **Code directory**: `src/stores/code-directory.ts`
- **Persistent memory (7-layer)**: `src/stores/titan-memory.ts`
- **File system state**: `src/stores/file-store.ts`
- **Voice state**: `src/stores/voice.store.ts`

### Lib modules

- **Plan Brain Protocol**: `src/lib/plan/plan-brain.ts`
- **Code scanner**: `src/lib/plan/code-scanner.ts`
- **Subtask generator**: `src/lib/plan/subtask-generator.ts`
- **Design templates (15)**: `src/lib/plan/design-templates.ts`
- **Pseudo-code protocol**: `src/lib/plan/pseudo-code-protocol.ts`
- **Phoenix orchestrator**: `src/lib/phoenix/phoenix-orchestrator.ts`
- **Plan Sniper engine**: `src/lib/sniper/`

### Hooks

- **Voice input (Web Speech API)**: `src/hooks/useVoiceInput.ts`
- **File system + auto-workspace**: `src/hooks/useFileSystem.ts`

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

