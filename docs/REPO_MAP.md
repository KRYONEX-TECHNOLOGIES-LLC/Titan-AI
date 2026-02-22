# Titan AI Repo Map (No-Guess Navigation)

This document is for future AIs and contributors who need to locate code fast without wide searches.

If you only read one thing about runtime behavior, read: `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`.

---

## Top-level directory map

```
Titan AI/
  apps/
    desktop/         Electron main/preload + native tools (filesystem, terminal, git, run_command)
    web/             Next.js app (UI + API routes)
    cli/             Titan CLI (developer tooling / automation)
  packages/          Shared libraries and engines (ai/core/security/midnight/etc.)
  docs/              Canonical documentation (start at docs/INDEX.md)
  extensions/        Built-in extensions
  vscode-core/       Code-OSS fork/submodule
  config/            Shared config/tsconfig/eslint/etc.
```

---

## “Where do I change X?” (fast pointers)

### UI / IDE shell

- **Main IDE React component**: `apps/web/src/components/titan-ide.tsx`
- **Editor page route**: `apps/web/src/app/editor/page.tsx`
- **Chat message rendering**: `apps/web/src/components/ide/ChatMessage.tsx`
- **Chat input + send loop**: `apps/web/src/hooks/useChat.ts`
- **Tool execution in the UI (calls desktop tools via API/IPC)**: `apps/web/src/hooks/useAgentTools.ts`
- **Sessions persistence**: `apps/web/src/hooks/useSessions.ts`
- **Settings persistence**: `apps/web/src/hooks/useSettings.ts`
- **File tree / filesystem hooks**: `apps/web/src/hooks/useFileSystem.ts`

### Models / provider routing / cost control

- **Model registry (what models exist + metadata)**: `apps/web/src/lib/model-registry.ts`
- **Chat provider routing + circuit breaker**: `apps/web/src/app/api/chat/route.ts`
- **Tool-calling chat (system prompt + tools spec)**: `apps/web/src/app/api/chat/continue/route.ts`
- **Cost notes**: `docs/AGENT-COST-COMPARISON.md`

### Omega Protocol (planner/specialists)

- **Omega orchestration API route (SSE stream)**: `apps/web/src/app/api/titan/omega/route.ts`
- **Omega core modules**: `apps/web/src/lib/omega/`
  - `omega-model.ts`: types + `DEFAULT_OMEGA_CONFIG` (model assignments)
  - `risk-router.ts`: risk → specialist model selection
  - `architect.ts`: DAG/work-order planner
  - `specialist.ts`: executes work orders (picks model via `risk-router`)
  - `sentinel.ts`: verification pass/fail
  - `operator.ts`: assembles and executes steps via tools

### “Titan Supreme Protocol” (multi-lane governance)

- **Supreme orchestration modules**: `apps/web/src/lib/supreme/`
- **Lanes runtime (manifest/supervisor/worker/verifier)**: `apps/web/src/lib/lanes/`
- **UI panels**:
  - `apps/web/src/components/ide/LanePanel.tsx`
  - `apps/web/src/components/ide/SupremePanel.tsx`

### Project Midnight

- **Web “Midnight” UI**: `apps/web/src/components/midnight/FactoryView.tsx`
- **Web API simulation / state**: `apps/web/src/app/api/midnight/route.ts`
- **Midnight engine package (not necessarily wired into web API)**: `packages/midnight/`

### Auth / identity / creator mode

- **NextAuth**: `apps/web/src/app/api/auth/[...nextauth]/route.ts` (and `apps/web/src/lib/auth*.ts`)
- **Creator identity context**: `apps/web/src/lib/creator.ts`

### Desktop/Electron (native tooling)

- **Electron app entry**: `apps/desktop/src/main.ts`
- **IPC tool handlers** (agent tools like `run_command`, `read_file`, `edit_file`): `apps/desktop/src/ipc/tools.ts`
- **IPC terminal** (PTY) handler: `apps/desktop/src/ipc/terminal.ts`
- **IPC filesystem handler**: `apps/desktop/src/ipc/filesystem.ts`
- **IPC git handler**: `apps/desktop/src/ipc/git.ts`
- **Preload bridge**: `apps/desktop/src/preload.ts`

---

## Common workflows (what files you touch)

### Fix “tool calling agent is stalling / saying Done”

- `apps/web/src/hooks/useChat.ts` (orchestration loop + nudges)
- `apps/web/src/app/api/chat/continue/route.ts` (system prompt + tool definitions)

### Fix `run_command` failing on Windows

- `apps/desktop/src/ipc/tools.ts` (`child_process.spawn` config, env passthrough, absolute shell path)

### Make model switching/cost routing stricter

- `apps/web/src/app/api/chat/route.ts` (provider/model selection)
- `apps/web/src/lib/model-registry.ts` (tiers/cost metadata)
- `apps/web/src/lib/omega/omega-model.ts` (`DEFAULT_OMEGA_CONFIG`)

### Add a new agent tool

- Backend implementation: `apps/desktop/src/ipc/tools.ts` (add IPC handler)
- Frontend tool execution: `apps/web/src/hooks/useAgentTools.ts` (tool name mapping)
- Tool schema exposure: `apps/web/src/app/api/chat/continue/route.ts` (tool definition list)
- UI display: `apps/web/src/components/ide/ChatMessage.tsx` (tool blocks / diff blocks)
- Types: `apps/web/src/types/ide.ts`

---

## “If Railway build says module not found for @/…”

Ensure `apps/web/tsconfig.json` has:

- `compilerOptions.baseUrl = "."`
- `compilerOptions.paths["@/*"] = ["./src/*"]`

Without `baseUrl`, some container builds fail to resolve `@/` alias imports.

