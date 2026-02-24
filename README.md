# Titan AI

Titan AI is an AI-native IDE in a **pnpm + Turborepo monorepo**.

- **Desktop app (primary)**: `apps/desktop` (Electron + native tools)
- **Web app**: `apps/web` (Next.js UI + API routes)

If you are a future AI working in this repo, start here:

- `docs/INDEX.md`
- `docs/REPO_MAP.md`
- `PUSH-FOR-TITAN.md`
- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`

---

## Quick start (Windows / PowerShell)

### Prereqs

- Node.js **20+**
- pnpm **9+** (repo expects `pnpm@9.15.0`)

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v
```

### Install

From repo root:

```powershell
pnpm install
```

### Run the desktop app (recommended)

From repo root:

```powershell
pnpm dev:desktop
```

Alternative: double-click `Start Titan AI.bat` in the repo root.

What to expect:

- Desktop starts an internal Next.js server (default `http://localhost:3100`)
- Electron launches and loads the `/editor` UI

### Run the web app only (optional)

From repo root:

```powershell
pnpm dev:web
```

---

## Repo structure (real directories)

```
Titan AI/
  apps/
    desktop/     Electron main/preload + IPC tools (filesystem, terminal, git, run_command)
    web/         Next.js UI + API routes
    cli/         CLI tooling
  packages/      Shared engines/libs (ai/core/security/midnight/etc.)
  docs/          Canonical docs (start at docs/INDEX.md)
  extensions/    Built-in extensions
  vscode-core/   Code-OSS fork/submodule
  config/        Shared configs
```

---

## Where to change things (high-signal pointers)

- **IDE UI root**: `apps/web/src/components/titan-ide.tsx`
- **Chat orchestration loop**: `apps/web/src/hooks/useChat.ts`
- **Tool execution layer**: `apps/web/src/hooks/useAgentTools.ts`
- **Tool-calling system prompt + tool definitions**: `apps/web/src/app/api/chat/continue/route.ts`
- **Chat provider routing / OpenRouter + LiteLLM**: `apps/web/src/app/api/chat/route.ts`
- **Model registry**: `apps/web/src/lib/model-registry.ts`
- **Omega protocol modules**: `apps/web/src/lib/omega/` + `apps/web/src/app/api/titan/omega/route.ts`
- **Desktop IPC tool implementations**: `apps/desktop/src/ipc/tools.ts`

Full map:

- `docs/REPO_MAP.md`

---

## Preventing protocol UI crashes (must-follow)

Titan has multiple protocol modes (Phoenix/Supreme/Omega/Parallel/Titan Chat + default Titan Protocol). These modes often use **early returns** in hooks/components. Two rules prevent the class of crashes we hit (including `Cannot read properties of undefined (reading 'length')`):

- **Never place React hooks after a conditional early return**: if a hook (e.g. `useCallback`, `useMemo`, `useEffect`) is declared after `if (isPhoenixMode) return ...`, React will see a different hook order depending on selected protocol and can corrupt state in production builds.
  - If you need a helper hook for the “default” path, declare it **before** any protocol-mode returns.
- **Never assume arrays/strings exist on streamed or persisted data**: SSE payloads and localStorage restores can be partial or stale.
  - Guard `.length` and `.slice` with safe defaults (e.g. `(x || '').length`, `(arr || []).length`) in UI panels and persistence code.

---

## Deployment notes (Railway / Nixpacks)

The Railway config for the web build uses `apps/web` as the root directory and runs:

- `npm ci`
- `npm run build`
- `npm run start`

Important: `apps/web/tsconfig.json` must include `compilerOptions.baseUrl="."` for the `@/` alias to resolve in container builds.

---

## Operations manual (git push + restart)

Use:

- `PUSH-FOR-TITAN.md`

