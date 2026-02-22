# API Reference (apps/web)

This doc covers the **Next.js API routes** under `apps/web/src/app/api`.

For UI + flows, read:

- `docs/TITAN_AI_FULL_PROJECT_OVERVIEW.md`

---

## Models

### `GET /api/models`

- **File**: `apps/web/src/app/api/models/route.ts`
- **Purpose**: Return the static model registry and provider grouping.

---

## Chat (single-shot, provider routed)

### `POST /api/chat`

- **File**: `apps/web/src/app/api/chat/route.ts`
- **Purpose**: Provider routing (OpenRouter/LiteLLM), security scanning, streaming/non-streaming chat.
- **Related**:
  - Model registry: `apps/web/src/lib/model-registry.ts`

---

## Chat Continue (tool calling)

### `POST /api/chat/continue`

- **File**: `apps/web/src/app/api/chat/continue/route.ts`
- **Purpose**: Tool-calling stream + system prompt injection + tool definitions.

This is one of the most important files in the repo because it defines:

- Tool schemas for the LLM
- The system prompt (`BASE_SYSTEM_PROMPT`)
- The streaming protocol used by the UI

---

## Omega Protocol

### `POST /api/titan/omega`

- **File**: `apps/web/src/app/api/titan/omega/route.ts`
- **Purpose**: SSE stream for Omega orchestration (planner/specialists/sentinel/operator).
- **Core implementation**: `apps/web/src/lib/omega/*`

---

## Midnight

### `GET /api/midnight` / `POST /api/midnight`

- **File**: `apps/web/src/app/api/midnight/route.ts`
- **Purpose**: In-process Midnight state + queue + logs (simulation in the web API).
- **UI**: `apps/web/src/components/midnight/FactoryView.tsx`

---

## Workspace / indexing

### `GET /api/workspace` / `POST /api/workspace`

- **File**: `apps/web/src/app/api/workspace/route.ts`
- **Purpose**: Workspace import/index status (currently includes simulated pieces).

---

## Desktop-native APIs

The real filesystem/terminal/git/tool execution happens in the desktop app:

- `apps/desktop/src/ipc/*`

Those are not HTTP routes; they are Electron IPC handlers used by the renderer.

