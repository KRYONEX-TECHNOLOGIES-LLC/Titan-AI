# Titan AI Architecture

## Overview

Titan AI is an AI-native Integrated Development Environment (IDE) built on a forked VS Code base. It deeply integrates AI capabilities throughout the development workflow, providing intelligent code assistance, autonomous agents, and advanced context management.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Titan AI IDE                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Editor    │  │    Chat     │  │   Agents    │              │
│  │   (Monaco)  │  │   Panel     │  │   Panel     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │              AI Integration Layer              │              │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │              │
│  │  │ Context  │ │ Prompts  │ │  Speculative │   │              │
│  │  │ Manager  │ │ Engine   │ │  Edit Engine │   │              │
│  │  └──────────┘ └──────────┘ └──────────────┘   │              │
│  └───────────────────────┬───────────────────────┘              │
│                          │                                       │
│  ┌───────────────────────┴───────────────────────┐              │
│  │                AI Gateway                      │              │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │              │
│  │  │ LiteLLM  │ │OpenRouter│ │    Ollama    │   │              │
│  │  │ Adapter  │ │ Adapter  │ │   Adapter    │   │              │
│  │  └──────────┘ └──────────┘ └──────────────┘   │              │
│  └───────────────────────────────────────────────┘              │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Core Services                             ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   ││
│  │  │Workspace │ │ Terminal │ │Filesystem│ │   Security   │   ││
│  │  │ Manager  │ │ Manager  │ │  Manager │ │   Manager    │   ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Indexing Layer                            ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   ││
│  │  │ Native   │ │ Vector   │ │  Repo    │ │   Merkle     │   ││
│  │  │ Indexer  │ │   DB     │ │   Map    │ │   Sync       │   ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Package Structure

### Core Packages (`packages/core/`)

- **@titan/editor-core**: Monaco editor integration with AI hooks
- **@titan/composer**: Diff engine and code change visualization
- **@titan/workspace**: Workspace management and file operations
- **@titan/terminal**: PTY management and terminal integration
- **@titan/filesystem**: Virtual, native, and browser filesystem abstractions

### AI Packages (`packages/ai/`)

- **@titan/ai-gateway**: Multi-provider LLM gateway (LiteLLM, OpenRouter, Ollama)
- **@titan/ai-router**: Model routing, fallback, and cost optimization
- **@titan/ai-speculative**: Speculative editing engine (EfficientEdit paradigm)
- **@titan/ai-agents**: Multi-agent orchestration system
- **@titan/ai-adaptive**: Context shaping and long-horizon reasoning
- **@titan/ai-prompts**: System prompts and template engine
- **@titan/ai-context**: Context management and relevance scoring

### Infrastructure Packages

- **@titan/indexer-native**: Rust-based Tree-sitter indexer with Merkle sync
- **@titan/vectordb**: LanceDB vector database integration
- **@titan/repo-map**: PageRank-based repository mapping
- **@titan/mcp-client**: Model Context Protocol client
- **@titan/mcp-host**: MCP host implementation
- **@titan/mcp-servers**: MCP server implementations (filesystem, git, terminal, browser)

### Security & Performance

- **@titan/security-***: Obfuscation, injection detection, authorization
- **@titan/performance**: Caching, GPU acceleration, quantization

## Key Subsystems

### 1. AI Gateway

The AI Gateway provides a unified interface to multiple LLM providers:

- **LiteLLM Adapter**: OpenAI-compatible API for multiple providers
- **OpenRouter Adapter**: Access to frontier models
- **Ollama Adapter**: Local model execution

### 2. Speculative Editing Engine

Based on the EfficientEdit paradigm:

1. Draft model (StarCoder2-3B) generates initial predictions
2. Target model (Claude 4) verifies and accepts/rejects
3. Redundancy reuse for efficient token handling

### 3. Multi-Agent Orchestration

Coordinated agent system:

- **Orchestrator**: Task decomposition and delegation
- **Security Reviewer**: Vulnerability detection
- **Refactor Specialist**: Code improvement
- **Test Writer**: Test generation
- **Doc Writer**: Documentation generation

### 4. Shadow Workspaces

Isolated execution environments for AI agents:

- Workspace forking via Git worktrees
- Sandboxed execution (Docker, WASM)
- Result merging with conflict resolution

### 5. Semantic Indexing

High-performance code understanding:

- Tree-sitter AST parsing (Rust native)
- Merkle tree incremental sync (O(log N))
- Vector embeddings with LanceDB
- PageRank symbol ranking

## Data Flow

```
User Input
    │
    ▼
┌─────────────────┐
│ Context Manager │ ◄── Index, Files, History
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Prompt Builder  │ ◄── Templates, System Prompts
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   AI Gateway    │ ◄── Model Router, Cost Optimizer
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LLM Provider    │ (Claude, GPT, Ollama, etc.)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Response Parser │ ◄── Tool calls, Code extraction
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Action Executor │ ◄── File edits, Terminal commands
└────────┬────────┘
         │
         ▼
User Output
```

## Security Model

1. **Zero Telemetry**: Enforced at source level
2. **Secret Masking**: Automatic detection and obfuscation
3. **Prompt Injection Detection**: Pattern-based and ML detection
4. **Tool Authorization**: Explicit permission model
5. **Trusted Workspaces**: Granular capability control

## Deployment Options

1. **Desktop**: Electron-based native application
2. **Web**: Next.js with WebContainers
3. **CLI**: Node.js command-line tool
4. **Server**: Self-hosted API server
