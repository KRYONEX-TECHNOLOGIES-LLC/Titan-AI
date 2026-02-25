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

## Features

### Plan Mode
- Start/Pause/Stop execution lifecycle with visual task checklist
- Pseudo-code intake: paste rough ideas, AI converts to structured plans (30-200+ tasks)
- Code scanner indexes the entire codebase for precise subtask generation
- Smart subtasks: each checklist item gets project-specific verification tasks from the code directory
- Dynamic checklist auto-generated from scanning the actual project
- 15 design templates (Basic, Modern, Elite/Iron Man) with color customization
- Plan Brain Protocol: 4-role orchestrator (Scanner -> Planner -> Verifier -> Corrector)

### Midnight Mode (Autonomous Build)
- Fully autonomous project execution end-to-end
- In-process fallback (works without sidecar)
- Chat + image input for describing projects and design references
- Plan-store integration: tasks sync to Plan Mode's visual checklist
- 600px wide panel with "Back to IDE" button

### Voice Input
- Speech-to-text via Web Speech API (Chrome/Electron) with Whisper fallback
- Auto-send after 2s of silence
- Error display with dismissible messages
- Interim text preview while speaking

### Alfred (Titan Voice Protocol)
- 4-role multi-model orchestrator: PERCEIVER (vision), THINKER (reasoning), RESPONDER (conversation), SCANNER (code analysis)
- **Wake word activation**: Say "Alfred" to activate — responds "Yes sir" and listens for command
- **Ambient always-on listening**: Runs globally, not just in Alfred panel. Orb indicator in sidebar glows/pulses to show state
- **Full conversational memory**: Injects persistent memory (preferences, decisions, identity), brain knowledge, and conversation history into every response
- Text-to-speech via Web Speech API with auto-speak toggle
- Voice commands: "Alfred, start midnight mode", "Alfred, scan the project", "Alfred, status"
- Proactive thought engine: AI-generated suggestions with dedup, snooze, and cooldown
- Persistent brain: Supabase + localStorage for knowledge, skills, ideas, conversations
- Async parallel data ingestion pipeline for knowledge harvesting
- Evolution tracking: level system, milestones, growth stats
- Full system control: can operate Plan Mode, Midnight Mode, Forge, file system
- Knowledge ingestion: feeds from Forge harvester data into the brain
- Cost: ~$0.001-0.005 per interaction

### 7-Layer Persistent Memory
1. Core Facts (identity, preferences)
2. Decisions (architecture, tech stack)
3. Active Context (current tasks, expires in 7 days)
4. Conversation Summaries (compressed history)
5. Error Patterns (anti-patterns to avoid)
6. Mistake Ledger (exact mistakes + fixes, never repeated)
7. Learned Skills (auto-extracted how-to knowledge)

### AI Protocols
- **Alfred (Titan Voice)**: 4-role voice companion with wake word "Alfred", ambient always-on listening, persistent memory, and conversational AI
- **Titan Plan Sniper**: 7-role multi-model orchestra (Scanner, Architect, Coder, Executor, Sentinel, Judge) using cost-effective models
- **Phoenix Protocol**: Multi-agent orchestration with parallel workers
- **Supreme Protocol**: Specialized 3-worker pipeline with oversight
- **Omega Protocol**: Deep-research multi-specialist engine

### Forge Harvester
- 100 parallel workers scraping 15+ sources
- 5-pass quality pipeline with AI judge
- Continuous harvest targeting 10,000+ samples for model training
- Email notification on completion

### Auto-Workspace
- Desktop app automatically creates `C:\TitanWorkspace` if no folder is loaded
- Fully autonomous operation from first launch

---

## Where to change things (high-signal pointers)

- **IDE UI root**: `apps/web/src/components/titan-ide.tsx`
- **Chat orchestration loop**: `apps/web/src/hooks/useChat.ts`
- **Tool execution layer**: `apps/web/src/hooks/useAgentTools.ts`
- **Tool-calling system prompt + tool definitions**: `apps/web/src/app/api/chat/continue/route.ts`
- **Chat provider routing / OpenRouter + LiteLLM**: `apps/web/src/app/api/chat/route.ts`
- **Model registry**: `apps/web/src/lib/model-registry.ts`
- **Omega protocol modules**: `apps/web/src/lib/omega/` + `apps/web/src/app/api/titan/omega/route.ts`
- **Plan Sniper protocol**: `apps/web/src/lib/sniper/` + `apps/web/src/app/api/titan/sniper/route.ts`
- **Plan Mode store**: `apps/web/src/stores/plan-store.ts`
- **Persistent memory**: `apps/web/src/stores/titan-memory.ts`
- **Code directory**: `apps/web/src/stores/code-directory.ts`
- **Plan task generation API**: `apps/web/src/app/api/plan/generate/route.ts`
- **Plan Brain Protocol**: `apps/web/src/lib/plan/plan-brain.ts`
- **Code scanner**: `apps/web/src/lib/plan/code-scanner.ts`
- **Subtask generator**: `apps/web/src/lib/plan/subtask-generator.ts`
- **Design templates**: `apps/web/src/lib/plan/design-templates.ts`
- **Pseudo-code protocol**: `apps/web/src/lib/plan/pseudo-code-protocol.ts`
- **Titan Voice protocol**: `apps/web/src/lib/voice/` (TTS, personality, brain, thought engine, vision, commands)
- **Titan Voice API**: `apps/web/src/app/api/titan/voice/route.ts`
- **Titan Voice store**: `apps/web/src/stores/titan-voice.store.ts`
- **Alfred ambient hook**: `apps/web/src/hooks/useAlfredAmbient.ts` (wake word, global listener, memory integration)
- **Titan Voice chat hook**: `apps/web/src/hooks/useTitanVoiceChat.ts`
- **Voice input**: `apps/web/src/hooks/useVoiceInput.ts` (Web Speech API + Whisper fallback)
- **Speech transcription API**: `apps/web/src/app/api/speech/transcribe/route.ts`
- **Forge harvester**: `packages/forge/src/` (CLI: `harvest.ts`, continuous: `harvest-continuous.ts`)
- **Brain Observatory**: `apps/web/src/components/ide/BrainObservatoryPanel.tsx`
- **Desktop IPC tool implementations**: `apps/desktop/src/ipc/tools.ts`

Full map:

- `docs/REPO_MAP.md`

---

## Preventing protocol UI crashes (must-follow)

Titan has multiple protocol modes (Phoenix/Supreme/Omega/Parallel/Plan Sniper/Titan Chat + default Titan Protocol). These modes often use **early returns** in hooks/components. Two rules prevent the class of crashes we hit (including `Cannot read properties of undefined (reading 'length')`):

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

