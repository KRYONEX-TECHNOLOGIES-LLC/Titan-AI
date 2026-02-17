# API Reference

## AI Gateway

### `createGateway(config: GatewayConfig): AIGateway`

Creates an AI gateway instance for multi-provider LLM access.

```typescript
import { createGateway } from '@titan/ai-gateway';

const gateway = createGateway({
  defaultProvider: 'anthropic',
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
    openai: { apiKey: process.env.OPENAI_API_KEY },
  },
});
```

### `gateway.complete(request: CompletionRequest): Promise<CompletionResponse>`

Send a completion request.

```typescript
const response = await gateway.complete({
  model: 'claude-4-sonnet',
  messages: [
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  maxTokens: 1000,
});
```

## AI Router

### `createRouter(config: RouterConfig): AIRouter`

Creates a router for intelligent model selection.

```typescript
import { createRouter } from '@titan/ai-router';

const router = createRouter({
  strategy: 'cascade',
  models: ['claude-4-opus', 'claude-4-sonnet', 'gpt-4-turbo'],
});
```

## AI Agents

### `createOrchestrator(config: OrchestratorConfig): Orchestrator`

Creates the agent orchestrator.

```typescript
import { createOrchestrator } from '@titan/ai-agents';

const orchestrator = createOrchestrator({
  gateway,
  maxConcurrentAgents: 3,
});

await orchestrator.execute('Refactor the auth module');
```

## Context Manager

### `createContextManager(config?: ContextManagerConfig): ContextManager`

Creates a context manager for AI prompts.

```typescript
import { createContextManager } from '@titan/ai-context';

const contextManager = createContextManager({
  maxTokens: 100000,
});

const result = await contextManager.gatherContext({
  query: 'How does authentication work?',
  currentFile: '/src/auth/login.ts',
});
```

## Vector Database

### `createVectorDB(config: VectorDBConfig): VectorDB`

Creates a vector database instance.

```typescript
import { createVectorDB } from '@titan/vectordb';

const db = await createVectorDB({
  path: '.titan/vectors',
  dimensions: 1536,
});

// Add vectors
await db.upsert({
  id: 'chunk-1',
  vector: [0.1, 0.2, ...],
  metadata: { file: 'auth.ts' },
});

// Search
const results = await db.search(queryVector, { limit: 10 });
```

## Repository Map

### `createRepoMap(config?: RepoMapConfig): RepoMap`

Creates a repository map for code understanding.

```typescript
import { createRepoMap } from '@titan/repo-map';

const repoMap = createRepoMap({
  rootPath: process.cwd(),
});

await repoMap.initialize();
const topSymbols = repoMap.getTopSymbols(50);
```

## MCP Client

### `createMCPClient(config: MCPClientConfig): MCPClient`

Creates an MCP client for tool integration.

```typescript
import { createMCPClient } from '@titan/mcp-client';

const client = createMCPClient({
  servers: ['filesystem', 'git', 'terminal'],
});

await client.connect();
const result = await client.callTool('filesystem', 'read_file', {
  path: '/src/index.ts',
});
```

## Workspace Manager

### `WorkspaceManager`

Manages workspace state and file operations.

```typescript
import { WorkspaceManager } from '@titan/workspace';

const workspace = new WorkspaceManager();
await workspace.open('/path/to/project');

const files = workspace.getFiles('*.ts');
```

## Terminal Manager

### `PTYManager`

Manages pseudo-terminal sessions.

```typescript
import { PTYManager } from '@titan/terminal';

const pty = new PTYManager();
const terminal = await pty.create({
  shell: '/bin/bash',
  cwd: process.cwd(),
});

terminal.on('data', (data) => console.log(data));
pty.write(terminal.id, 'npm test\n');
```

## Prompt Builder

### `createPromptBuilder(): PromptBuilder`

Fluent API for building prompts.

```typescript
import { createPromptBuilder } from '@titan/ai-prompts';

const prompt = createPromptBuilder()
  .useDefaultSystem()
  .withCode(code, 'typescript')
  .withFile('/src/auth.ts')
  .user('Explain this code')
  .build();
```

## Security

### `SecretMasker`

Masks sensitive information.

```typescript
import { SecretMasker } from '@titan/security-obfuscation';

const masker = new SecretMasker();
const masked = masker.mask('API_KEY=sk-1234567890');
// Output: API_KEY=[MASKED]
```

### `InjectionDetector`

Detects prompt injection attempts.

```typescript
import { InjectionDetector } from '@titan/security-injection';

const detector = new InjectionDetector();
const result = await detector.scan(userInput);

if (result.isInjection) {
  console.warn('Injection detected:', result.patterns);
}
```

## Performance

### `TokenCache`

Caches LLM prompt tokens.

```typescript
import { TokenCache } from '@titan/performance';

const cache = new TokenCache({ maxSize: 1000 });

const cached = cache.get(promptHash);
if (!cached) {
  cache.set(promptHash, tokens);
}
```

### `GPUAccelerator`

Detects and configures GPU acceleration.

```typescript
import { GPUAccelerator } from '@titan/performance';

const gpu = new GPUAccelerator();
await gpu.detect();

if (gpu.isAvailable()) {
  const config = gpu.getConfig();
  // Use for model loading
}
```
