# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 9+
- Rust (for native indexer)
- Git

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI.git
cd Titan-AI
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build All Packages

```bash
pnpm build
```

### 4. Start Development

```bash
pnpm dev
```

## Project Structure

```
titan-ai/
├── apps/
│   ├── cli/              # Command-line interface
│   ├── web/              # Next.js web application
│   └── docs/             # Documentation site
├── packages/
│   ├── ai/               # AI packages
│   ├── core/             # Core editor packages
│   ├── indexer-native/   # Rust native indexer
│   ├── mcp/              # MCP packages
│   ├── performance/      # Performance optimization
│   ├── repo-map/         # Repository mapping
│   ├── security/         # Security packages
│   ├── shadow/           # Shadow workspace
│   ├── ui/               # UI components
│   └── vectordb/         # Vector database
├── config/               # Shared configs
├── scripts/              # Build scripts
└── vscode-core/          # VS Code fork (submodule)
```

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @titan/ai-gateway test

# Run tests in watch mode
pnpm test:watch
```

### Type Checking

```bash
pnpm typecheck
```

### Linting

```bash
pnpm lint
pnpm lint:fix
```

### Formatting

```bash
pnpm format
pnpm format:check
```

## Building Packages

### TypeScript Packages

```bash
pnpm --filter @titan/ai-gateway build
```

### Rust Native Module

```bash
cd packages/indexer-native
cargo build --release
pnpm build
```

## Working with the VS Code Fork

### Initial Setup

```bash
pnpm run setup:fork
```

### Syncing Upstream Changes

```bash
pnpm run sync:upstream
```

### Building the Desktop App

```bash
pnpm run build:desktop
```

## Creating a New Package

1. Create directory structure:
```bash
mkdir -p packages/category/package-name/src
```

2. Create `package.json`:
```json
{
  "name": "@titan/package-name",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

3. Create `tsconfig.json`:
```json
{
  "extends": "../../../config/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

4. Add to `pnpm-workspace.yaml` if not already matching pattern

## Contributing

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation

### Commit Messages

Follow Conventional Commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Pull Requests

1. Create a feature branch
2. Make changes
3. Run tests and linting
4. Create PR with description
5. Request review

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# AI API Keys
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=

# Local AI
OLLAMA_HOST=http://localhost:11434

# Feature Flags
TITAN_ENABLE_TELEMETRY=false
TITAN_ENABLE_SPECULATIVE=true
```

## Debugging

### VS Code Launch Configurations

`.vscode/launch.json` includes configurations for:

- Debug CLI
- Debug Tests
- Debug Extension Host

### Logging

```typescript
import { logger } from '@titan/common';

logger.info('Message', { data });
logger.error('Error', error);
```

## Performance Profiling

```bash
# CPU profiling
node --prof dist/index.js

# Memory profiling
node --inspect dist/index.js
```

## Release Process

1. Create changeset: `pnpm changeset`
2. Version packages: `pnpm version-packages`
3. Build and test: `pnpm build && pnpm test`
4. Publish: `pnpm release`
