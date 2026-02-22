# Titan AI Architecture (Current Runtime)

This doc describes the **current runtime wiring**. For an exhaustive UI/API walkthrough, read:

- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`

For quick “where is X implemented”, use:

- `docs/REPO_MAP.md`

---

## High-level architecture

Titan AI runs as an Electron desktop app that hosts a Next.js UI and exposes native capabilities (filesystem, terminal, git, run_command) via IPC.

```mermaid
flowchart LR
  UI[Next.js UI (apps/web)] -- IPC --> Main[Electron main (apps/desktop)]
  Main --> Tools[IPC tools: run_command/read/edit/create]
  Main --> FS[IPC filesystem]
  Main --> PTY[IPC terminal/PTY]
  Main --> Git[IPC git]
```

Key separation:

- **UI + API routes** live in `apps/web`
- **Native execution** lives in `apps/desktop`

---

## Key components

### Web (Next.js)

- **Editor route**: `apps/web/src/app/editor/page.tsx`
- **IDE shell**: `apps/web/src/components/titan-ide.tsx`
- **Chat orchestration loop**: `apps/web/src/hooks/useChat.ts`
- **Tool execution layer**: `apps/web/src/hooks/useAgentTools.ts`

API routes:

- `apps/web/src/app/api/chat/route.ts` (provider routing + security scan)
- `apps/web/src/app/api/chat/continue/route.ts` (tool-calling + system prompt)
- `apps/web/src/app/api/models/route.ts` (model list)
- `apps/web/src/app/api/titan/omega/route.ts` (Omega protocol SSE)

### Desktop (Electron)

- **Main process**: `apps/desktop/src/main.ts`
- **Preload bridge**: `apps/desktop/src/preload.ts`
- **IPC handlers**: `apps/desktop/src/ipc/*`
  - `tools.ts` (agent tools)
  - `terminal.ts` (PTY)
  - `filesystem.ts`
  - `git.ts`

---

## Protocol modules (Omega / Supreme / Lanes)

These modules live under `apps/web/src/lib/`:

- **Omega protocol**: `apps/web/src/lib/omega/`
- **Lanes runtime**: `apps/web/src/lib/lanes/`
- **Supreme protocol**: `apps/web/src/lib/supreme/`

These are orchestrated via API routes under:

- `apps/web/src/app/api/titan/*`

---

## Packages (library layer)

The repo contains many shared packages under `packages/` (ai/core/security/midnight/etc.). Some are currently used, some are foundations/roadmap.

When in doubt about what is wired into the running desktop app, treat the following as canonical:

- `apps/web/src/**`
- `apps/desktop/src/**`

---

## Path alias

The web app uses the `@/` alias for `apps/web/src/*`.

`apps/web/tsconfig.json` must include:

- `compilerOptions.baseUrl = "."`
- `compilerOptions.paths["@/*"] = ["./src/*"]`

This avoids container-build failures resolving `@/…`.

