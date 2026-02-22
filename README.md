# Titan AI

Titan AI is an AI-native IDE with an Electron desktop app (`apps/desktop`) and a Next.js web app (`apps/web`) in a pnpm + Turborepo monorepo.

## Prerequisites

- Node.js **20+**
- pnpm **9+** (repo expects `pnpm@9.15.0`)

On Windows (PowerShell), the most reliable setup is:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
node -v
pnpm -v
```

## Install

From the repo root:

```powershell
pnpm install
```

## Start Titan AI (Desktop / Electron)

This is the primary app.

From the repo root:

```powershell
pnpm dev:desktop
```

What to expect:

- The desktop app starts an internal Next.js server (default **http://localhost:3100**)
- Electron launches and connects to that server

If you see `EADDRINUSE ... 3100`, you already have a dev instance running. Stop it and rerun `pnpm dev:desktop`.

## Start the Web App (Optional)

From the repo root:

```powershell
pnpm dev:web
```

## Common Issues

### Port 3100 already in use

- Symptom: `Error: listen EADDRINUSE: address already in use :::3100`
- Fix: close the existing Titan desktop dev process, then rerun:

```powershell
pnpm dev:desktop
```

### Lint script prompts interactively

`apps/web` uses `next lint`. Depending on local state, it may prompt to configure ESLint. If this happens, run the suggested codemod once, then rerun lint.

# Titan AI

**Next-Generation AI-Native Integrated Development Environment**

Built by KRYONEX TECHNOLOGIES LLC

---

## Overview

Titan AI is a revolutionary AI-native IDE that deeply integrates artificial intelligence into every aspect of the software development lifecycle. Built on a surgical fork of Code-OSS (VS Code), Titan AI provides an unparalleled development experience with multi-model orchestration, speculative editing, autonomous agents, and advanced semantic understanding.

## Key Features

### Multi-Model AI Orchestration
- **Frontier Model Cascade**: Intelligent routing between Claude 4.6 Opus, GPT-5.3 Codex, DeepSeek V3.2, and local models
- **Cost Optimization**: Automatic model selection based on task complexity and budget constraints
- **Local-First**: Full Ollama support for privacy-conscious development

### Speculative Editing (EfficientEdit)
- **Multi-Line Prediction**: Fast draft model (StarCoder2-3B) with frontier verification
- **Block-Level Generation**: Intelligent prediction of entire functions and classes
- **Redundancy Reuse**: Pattern caching for accelerated code completion

### Autonomous Agents
- **Multi-Agent Orchestration**: Coordinator + specialized sub-agents (Security, Refactor, Test, Doc, Review)
- **Pocket Flow Architecture**: Structured decision loops for reliable task execution
- **Git Worktree Parallel Execution**: Multiple agents working simultaneously

### Shadow Workspaces
- **Isolated Execution**: Kata QEMU containers and micro-VMs for safe AI experimentation
- **Self-Healing Loops**: Automatic error detection and correction
- **Bidirectional Sync**: Seamless integration with main workspace

### Advanced Semantic Indexing
- **High-Performance Rust Indexer**: Tree-sitter AST parsing with NAPI-RS bindings
- **Merkle Tree Sync**: O(log N) incremental index updates
- **LanceDB Vector Store**: Sub-millisecond semantic search

### Repository Mapping
- **Aider-Style Graph Ranking**: PageRank-based symbol importance
- **Dynamic Context Selection**: Optimal code snippets for LLM prompts
- **Cross-Reference Analysis**: Full understanding of codebase relationships

### Model Context Protocol (MCP)
- **Full 2025/2026 Spec Support**: Seamless external tool integration
- **Built-in Connectors**: Jira, Slack, Figma, and more
- **Multi-Agent Coordination**: MCP-based agent communication

### Security & Privacy
- **Zero Telemetry**: No data collection by default
- **Path Obfuscation**: Automatic PII removal before external calls
- **Prompt Injection Detection**: Multi-layer defense against attacks
- **Trusted Workspace Model**: Explicit permissions for AI operations

## Architecture

```
titan-ai/
├── vscode-core/              # Code-OSS fork (submodule)
├── packages/
│   ├── core/
│   │   ├── editor/           # Editor integration layer
│   │   ├── extension-api/    # Extension API
│   │   └── ai-integration/   # AI feature integration
│   ├── ai/
│   │   ├── gateway/          # Multi-model API gateway
│   │   ├── router/           # Intelligent model routing
│   │   ├── speculative/      # EfficientEdit engine
│   │   └── agents/           # Multi-agent orchestration
│   ├── indexer-native/       # Rust Tree-sitter indexer
│   ├── vectordb/             # LanceDB integration
│   ├── repo-map/             # Repository mapping
│   ├── mcp/                  # Model Context Protocol
│   ├── shadow/               # Shadow workspaces
│   ├── security/             # Security & privacy
│   ├── performance/          # Caching & optimization
│   └── ui/                   # React components (Shadcn)
├── apps/
│   ├── desktop/              # Electron desktop app
│   └── web/                  # Next.js web IDE
├── extensions/               # Built-in extensions
└── config/                   # Shared configuration
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Rust (stable)
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI.git
cd Titan-AI

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development
pnpm dev
```

### Environment Variables

Create a `.env.local` file:

```env
# AI API Keys
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
OPENROUTER_API_KEY=your_key

# Optional: LiteLLM Proxy
LITELLM_PROXY_URL=http://localhost:4000

# Optional: Ollama
OLLAMA_BASE_URL=http://localhost:11434
```

## Development

### Building Packages

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build --filter=@titan/ai-gateway

# Build native modules
pnpm build:native

# Watch mode
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run E2E tests
pnpm test:e2e
```

### Code Quality

```bash
# Lint
pnpm lint
pnpm lint:fix

# Format
pnpm format

# Type check
pnpm typecheck
```

## Package Documentation

### @titan/ai-gateway
Universal API adapter for LLM providers (LiteLLM, OpenRouter, Ollama). Supports streaming, embeddings, and tool calls.

### @titan/ai-router
Intelligent model routing with cascade logic, fallback management, context scaling, and cost optimization.

### @titan/ai-speculative
EfficientEdit implementation with draft/target verification, block generation, and pattern caching.

### @titan/ai-agents
Multi-agent orchestration with Pocket Flow nodes, specialized agents, and conflict resolution.

### @titan/vectordb
LanceDB integration for semantic code search with embedding caching and hybrid search.

### @titan/shadow
Shadow workspace management with Docker/Kata containers, file sync, and self-healing loops.

### @titan/mcp
Model Context Protocol client/server with Stdio/SSE transports and built-in tools.

### @titan/security
Security primitives including path obfuscation, injection detection, and tool authorization.

### @titan/repo-map
Repository mapping with graph ranking (PageRank) and context selection.

### @titan/performance
Performance optimization with token caching, embedding caching, and GPU acceleration hooks.

### @titan/ui
React component library based on Shadcn with Titan-specific components.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Microsoft VS Code team for the Code-OSS foundation
- Anthropic, OpenAI, and the open-source AI community
- All contributors and early adopters

---

**Built with precision by KRYONEX TECHNOLOGIES LLC**
