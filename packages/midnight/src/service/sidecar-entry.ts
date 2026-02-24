/**
 * Project Midnight - Sidecar Entry
 * Standalone Node.js runtime for Midnight orchestration + IPC.
 */

import { mkdir } from 'fs/promises';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { IPCServer } from './ipc';
import { MidnightOrchestrator } from '../orchestration/midnight-orchestrator';
import { PocketFlowEngine } from '../orchestration/pocket-flow';
import { ProjectHandoff } from '../orchestration/handoff';
import { ProjectLoader } from '../queue/project-loader';
import { ProjectQueue } from '../queue/project-queue';
import { DurableStateEngine } from '../state/state-engine';
import { SnapshotManager } from '../state/snapshot-manager';
import { RecoverySystem } from '../state/recovery';
import { AgentLoop } from '../agents/agent-loop';
import { ActorAgent } from '../agents/actor';
import { SentinelAgent } from '../agents/sentinel';
import { WorktreeAdapter } from '../agents/worktree-adapter';
import { RepoMapProviderImpl } from '../agents/repo-map-provider';
import { createSandboxedExecutor } from '../agents/sandboxed-executor';
import { ProtocolAgentLoop } from '../protocol/protocol-agent-loop';
import type { MidnightConfig } from '../types';

type Provider = 'litellm' | 'openrouter';

type SidecarRuntime = {
  orchestrator: MidnightOrchestrator;
  projectQueue: ProjectQueue;
  snapshotManager: SnapshotManager;
  recoverySystem: RecoverySystem;
  sandboxExecutor: Awaited<ReturnType<typeof createSandboxedExecutor>> | null;
};

type RuntimeState = {
  running: boolean;
  trustLevel: 1 | 2 | 3;
  workerModel: string;
  actorLogs: string[];
  sentinelLogs: string[];
  lastVerdict: { qualityScore: number; passed: boolean; message: string } | null;
  startTime: number;
  sandboxStatus: 'kata' | 'docker' | 'native' | 'unknown';
};

const titanDir = process.env.TITAN_DIR || resolve(process.env.MIDNIGHT_WORKSPACE_ROOT || process.cwd(), '.titan');
const defaultSocketPath = process.env.MIDNIGHT_SOCKET_PATH || join(titanDir, 'midnight.sock');
const defaultDbPath = process.env.MIDNIGHT_DB_PATH || join(titanDir, 'midnight.db');
const defaultLogPath = process.env.MIDNIGHT_LOG_PATH || join(titanDir, 'midnight.log');
const defaultPidFile = process.env.MIDNIGHT_PID_FILE || join(titanDir, 'midnight.pid');
const LOG_MAX_BYTES = Number(process.env.MIDNIGHT_LOG_MAX_BYTES || 5 * 1024 * 1024);
const LOG_MAX_FILES = Number(process.env.MIDNIGHT_LOG_MAX_FILES || 5);

let runtime: SidecarRuntime | null = null;
let ipcServer: IPCServer | null = null;

const runtimeState: RuntimeState = {
  running: false,
  trustLevel: 1,
  workerModel: process.env.MIDNIGHT_MODEL || 'openai/gpt-5.3',
  actorLogs: [],
  sentinelLogs: [],
  lastVerdict: null,
  startTime: 0,
  sandboxStatus: 'unknown',
};

let sidecarBootTime = Date.now();
let lastHealthPingAt = Date.now();

function rotateLogsIfNeeded(logPath: string): void {
  if (!existsSync(logPath)) return;
  const size = statSync(logPath).size;
  if (size < LOG_MAX_BYTES) return;

  for (let i = LOG_MAX_FILES - 1; i >= 1; i -= 1) {
    const from = `${logPath}.${i}`;
    const to = `${logPath}.${i + 1}`;
    if (existsSync(from)) {
      if (i + 1 > LOG_MAX_FILES) {
        unlinkSync(from);
      } else {
        renameSync(from, to);
      }
    }
  }

  if (existsSync(logPath)) {
    renameSync(logPath, `${logPath}.1`);
  }
}

function writeServiceLog(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  try {
    mkdirSync(dirname(defaultLogPath), { recursive: true });
    rotateLogsIfNeeded(defaultLogPath);
    appendFileSync(defaultLogPath, `[${new Date().toISOString()}] ${level} ${message}\n`, 'utf8');
  } catch {
    // Avoid crashing on logging failure.
  }
}

function pushActorLog(message: string): void {
  runtimeState.actorLogs.push(message);
  runtimeState.actorLogs = runtimeState.actorLogs.slice(-500);
  writeServiceLog('INFO', message.replace(/^\[[^\]]+\]\s*/, ''));
}

function pushSentinelLog(message: string): void {
  runtimeState.sentinelLogs.push(message);
  runtimeState.sentinelLogs = runtimeState.sentinelLogs.slice(-500);
  writeServiceLog('INFO', message.replace(/^\[[^\]]+\]\s*/, ''));
}

function resolveProvider(model: string): Provider {
  if (process.env.TITAN_LITELLM_BASE_URL) return 'litellm';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (model.startsWith('anthropic/') || model.startsWith('openai/')) return 'openrouter';
  return 'litellm';
}

function normalizeRequestedModel(model: string): string {
  if (!model?.trim()) return 'openai/gpt-5.3';
  const lower = model.toLowerCase();
  if (lower.includes('claude') && !model.includes('/')) return `anthropic/${model}`;
  if ((lower.includes('gpt') || lower.includes('o1') || lower.includes('o3')) && !model.includes('/')) {
    return `openai/${model}`;
  }
  return model;
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

class GatewayLLMClient {
  async chat(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      effort?: 'low' | 'medium' | 'high' | 'max';
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    }
  ): Promise<{
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    usage: { promptTokens: number; completionTokens: number };
  }> {
    const model = normalizeRequestedModel(options?.model || runtimeState.workerModel);
    const provider = resolveProvider(model);

    if (provider === 'openrouter') {
      return this.callOpenRouter(messages, model, options);
    }
    return this.callLiteLLM(messages, model, options);
  }

  private async callOpenRouter(
    messages: Array<{ role: string; content: string }>,
    model: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      effort?: 'low' | 'medium' | 'high' | 'max';
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    }
  ) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
        'X-Title': 'Titan AI Midnight Sidecar',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 32000,
        temperature: options?.temperature ?? 0.2,
        reasoning: options?.effort ? { effort: options.effort } : undefined,
        tools: options?.tools
          ? options.tools.map(t => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            }))
          : undefined,
        tool_choice: options?.tools?.length ? 'auto' : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const toolCalls =
      json.choices?.[0]?.message?.tool_calls?.map(tc => ({
        id: tc.id || `tool-${Date.now()}`,
        name: tc.function?.name || 'unknown_tool',
        arguments: safeJsonParse(tc.function?.arguments || '{}'),
      })) || [];

    return {
      content: json.choices?.[0]?.message?.content || '',
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async callLiteLLM(
    messages: Array<{ role: string; content: string }>,
    model: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      effort?: 'low' | 'medium' | 'high' | 'max';
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    }
  ) {
    const baseUrl = process.env.TITAN_LITELLM_BASE_URL;
    const apiKey = process.env.TITAN_LITELLM_API_KEY;
    if (!baseUrl) {
      throw new Error('TITAN_LITELLM_BASE_URL is not configured');
    }

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 32000,
        temperature: options?.temperature ?? 0.2,
        reasoning: options?.effort ? { effort: options.effort } : undefined,
        tools: options?.tools
          ? options.tools.map(t => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            }))
          : undefined,
        tool_choice: options?.tools?.length ? 'auto' : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LiteLLM request failed (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const toolCalls =
      json.choices?.[0]?.message?.tool_calls?.map(tc => ({
        id: tc.id || `tool-${Date.now()}`,
        name: tc.function?.name || 'unknown_tool',
        arguments: safeJsonParse(tc.function?.arguments || '{}'),
      })) || [];

    return {
      content: json.choices?.[0]?.message?.content || '',
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}

async function createRuntime(configOverride?: Partial<MidnightConfig>): Promise<SidecarRuntime> {
  const workspaceRoot = resolve(process.env.MIDNIGHT_WORKSPACE_ROOT || process.cwd());
  const dbPath = resolve(configOverride?.queuePath || defaultDbPath);
  await mkdir(dirname(dbPath), { recursive: true });

  const projectQueue = new ProjectQueue(dbPath);
  await projectQueue.initialize();
  const db = (projectQueue as unknown as { db: unknown }).db;
  const stateEngine = new DurableStateEngine(db as never);
  const snapshotManager = new SnapshotManager(stateEngine);
  const recoverySystem = new RecoverySystem(stateEngine, snapshotManager, projectQueue);

  const llmClient = new GatewayLLMClient();
  const sandboxExecutor = createSandboxedExecutor(workspaceRoot, {
    workspacePath: workspaceRoot,
    sandboxType: 'auto',
    timeout: 30000,
  });
  await sandboxExecutor.initialize();
  runtimeState.sandboxStatus = sandboxExecutor.getSandboxType() as RuntimeState['sandboxStatus'];

  const worktree = new WorktreeAdapter(workspaceRoot);
  const repoMap = new RepoMapProviderImpl();
  const toolsEnabled = ['read_file', 'write_file', 'run_command', 'run_tests', 'git_diff', 'git_commit', 'task_complete'];

  // Midnight Protocol Team: 4-squad, 8-model system (default)
  // Falls back to legacy single-agent mode if MIDNIGHT_LEGACY=1
  const useLegacy = process.env.MIDNIGHT_LEGACY === '1';

  let agentLoop: AgentLoop | ProtocolAgentLoop;

  if (useLegacy) {
    const actor = new ActorAgent(
      { model: runtimeState.workerModel, maxTokens: 128000, temperature: 0.2, workspacePath: workspaceRoot, toolsEnabled },
      llmClient,
      sandboxExecutor
    );
    const sentinel = new SentinelAgent(
      { model: runtimeState.workerModel, maxTokens: 32000, effort: 'max', qualityThreshold: 85 },
      llmClient
    );
    agentLoop = new AgentLoop(
      { maxRetries: configOverride?.maxRetries ?? 3, qualityThreshold: configOverride?.qualityThreshold ?? 85, enableVeto: true, enableRevert: true },
      actor, sentinel, worktree, repoMap
    );
    writeServiceLog('INFO', 'Using LEGACY single-agent mode (Actor + Sentinel)');
  } else {
    agentLoop = new ProtocolAgentLoop(
      llmClient,
      sandboxExecutor,
      worktree,
      repoMap,
      { maxIterationsPerNerd: 15, toolsEnabled, workspacePath: workspaceRoot },
      { maxNerdEscalations: 3, qualityThreshold: configOverride?.qualityThreshold ?? 85 }
    );
    writeServiceLog('INFO', 'Using MIDNIGHT PROTOCOL TEAM (4 squads, 8 models)');
  }

  const gitOps = {
    async push(_projectPath: string, _remote: string, _branch: string): Promise<void> {},
    async getCurrentBranch(_projectPath: string): Promise<string> {
      return 'main';
    },
    async createTag(_projectPath: string, _tag: string, _message: string): Promise<void> {},
    async cleanWorktrees(_projectPath: string): Promise<void> {},
  };

  const handoff = new ProjectHandoff(
    {
      pushToRemote: false,
      triggerDeployment: false,
      cleanupWorktrees: true,
    },
    projectQueue,
    stateEngine,
    gitOps
  );

  const pocketFlow = new PocketFlowEngine();
  const projectLoader = new ProjectLoader();
  const midnightConfig: MidnightConfig = {
    trustLevel: runtimeState.trustLevel,
    queuePath: dbPath,
    snapshotIntervalMs: configOverride?.snapshotIntervalMs ?? 5 * 60 * 1000,
    qualityThreshold: configOverride?.qualityThreshold ?? 85,
    maxRetries: configOverride?.maxRetries ?? 3,
    actorModel: runtimeState.workerModel,
    sentinelModel: runtimeState.workerModel,
    sentinelEffort: 'max',
    enableWorktrees: true,
    enableKataContainers: true,
    logPath: resolve(defaultLogPath),
    pidFile: resolve(defaultPidFile),
    verbose: process.env.MIDNIGHT_VERBOSE === '1',
  };

  const orchestrator = new MidnightOrchestrator(midnightConfig, {
    projectQueue,
    projectLoader,
    stateEngine,
    agentLoop,
    pocketFlow,
    handoff,
  });

  orchestrator.on(event => {
    const stamp = new Date().toISOString();
    switch (event.type) {
      case 'project_started':
        pushActorLog(`[${stamp}] Actor: Started ${event.project.name}`);
        break;
      case 'project_completed':
        pushActorLog(`[${stamp}] Actor: Completed ${event.project.name}`);
        break;
      case 'project_failed':
        pushActorLog(`[${stamp}] Actor: Failed ${event.project.name} (${event.error})`);
        break;
      case 'task_started':
        pushActorLog(`[${stamp}] Actor: Task started "${event.task.description}"`);
        break;
      case 'task_completed':
        pushActorLog(`[${stamp}] Actor: Task completed "${event.task.description}"`);
        break;
      case 'sentinel_verdict':
        runtimeState.lastVerdict = {
          qualityScore: event.verdict.qualityScore,
          passed: event.verdict.passed,
          message: event.verdict.correctionDirective || (event.verdict.passed ? 'Sentinel approved change' : 'Sentinel rejected change'),
        };
        pushSentinelLog(`[${stamp}] Sentinel: ${event.verdict.passed ? 'PASSED' : 'FAILED'} (${event.verdict.qualityScore}/100)`);
        break;
      case 'sentinel_veto':
        pushSentinelLog(`[${stamp}] Sentinel: VETO ${event.reason || ''}`.trim());
        break;
      case 'worktree_reverted':
        pushSentinelLog(`[${stamp}] Sentinel: Reverted worktree ${event.toHash || ''}`.trim());
        break;
      case 'snapshot_created':
        pushActorLog(`[${stamp}] State: Snapshot created ${event.snapshot.id}`);
        break;
      // Protocol Team events
      case 'protocol_squad_active':
        pushActorLog(`[${stamp}] Protocol: ${(event as any).name} (${(event as any).squad}) activated`);
        break;
      case 'protocol_escalation':
        pushActorLog(`[${stamp}] Protocol: Escalating from ${(event as any).from} → ${(event as any).to}`);
        break;
      case 'protocol_consensus':
        pushSentinelLog(`[${stamp}] Council: Chief=${(event as any).consensus.chiefScore} Shadow=${(event as any).consensus.shadowScore} ${(event as any).consensus.finalPassed ? 'APPROVED' : 'REJECTED'}`);
        break;
      case 'protocol_cost_update':
        pushActorLog(`[${stamp}] Protocol: Cost $${(event as any).totalCostUsd.toFixed(4)}`);
        break;
      case 'protocol_task_complete':
        pushActorLog(`[${stamp}] Protocol: Task complete ($${(event as any).result.totalCostUsd.toFixed(4)})`);
        break;
    }

    ipcServer?.broadcast({ type: 'event', event });
  });

  return {
    orchestrator,
    projectQueue,
    snapshotManager,
    recoverySystem,
    sandboxExecutor,
  };
}

async function ensureRuntime(configOverride?: Partial<MidnightConfig>): Promise<SidecarRuntime> {
  if (runtime) return runtime;
  runtime = await createRuntime(configOverride);
  return runtime;
}

async function getStatusPayload() {
  if (!runtime) {
    return {
      running: false,
      trustLevel: runtimeState.trustLevel,
      workerModel: runtimeState.workerModel,
      actorLogs: runtimeState.actorLogs.slice(-50),
      sentinelLogs: runtimeState.sentinelLogs.slice(-50),
      lastVerdict: runtimeState.lastVerdict,
      queue: [],
      sandboxStatus: runtimeState.sandboxStatus,
      confidenceScore: 100,
      confidenceStatus: 'healthy',
      uptime: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      queueLength: 0,
      currentProject: null,
    };
  }

  const [status, queue] = await Promise.all([
    runtime.orchestrator.getStatusAsync(),
    runtime.projectQueue.listProjects(),
  ]);

  return {
    ...status,
    running: runtimeState.running || status.running,
    trustLevel: runtimeState.trustLevel,
    workerModel: runtimeState.workerModel,
    actorLogs: runtimeState.actorLogs.slice(-50),
    sentinelLogs: runtimeState.sentinelLogs.slice(-50),
    lastVerdict: runtimeState.lastVerdict,
    queue,
    sandboxStatus: runtimeState.sandboxStatus,
  };
}

async function shutdown(code = 0): Promise<void> {
  try {
    if (runtime) {
      await runtime.orchestrator.stop(true);
      await runtime.sandboxExecutor?.cleanup().catch(() => {});
    }
  } catch {
    // Keep shutdown best-effort
  }

  try {
    await ipcServer?.stop();
  } catch {
    // Keep shutdown best-effort
  }

  process.exit(code);
}

async function main(): Promise<void> {
  await mkdir(dirname(defaultDbPath), { recursive: true });
  pushActorLog(`[${new Date().toISOString()}] Sidecar: booting (pid=${process.pid}, home=${homedir()})`);

  ipcServer = new IPCServer(defaultSocketPath);

  ipcServer.handle('status', async () => {
    return { type: 'status', data: await getStatusPayload() } as never;
  });

  ipcServer.handle('set_model', async (req: Record<string, unknown>) => {
    const model = typeof req.model === 'string' ? req.model : '';
    if (!model) {
      return { type: 'error', message: 'model is required' };
    }

    runtimeState.workerModel = normalizeRequestedModel(model);
    pushActorLog(`[${new Date().toISOString()}] Actor: Worker model set to ${runtimeState.workerModel}`);
    return { type: 'success', message: 'Model updated' };
  });

  ipcServer.handle('set_trust', async (req: Record<string, unknown>) => {
    const trust = Number(req.trustLevel ?? req.trust ?? 1);
    if (trust !== 1 && trust !== 2 && trust !== 3) {
      return { type: 'error', message: 'Trust level must be 1, 2, or 3' };
    }

    runtimeState.trustLevel = trust as 1 | 2 | 3;
    pushActorLog(`[${new Date().toISOString()}] Actor: Trust level set to ${runtimeState.trustLevel}`);
    return { type: 'success', message: 'Trust level updated' };
  });

  ipcServer.handle('start', async (req: Record<string, unknown>) => {
    const trust = Number(req.trustLevel ?? req.trust ?? runtimeState.trustLevel);
    if (trust === 1 || trust === 2 || trust === 3) {
      runtimeState.trustLevel = trust;
    }
    if (typeof req.model === 'string' && req.model.trim()) {
      runtimeState.workerModel = normalizeRequestedModel(req.model);
    }

    const activeRuntime = await ensureRuntime();
    if (runtimeState.running) {
      return { type: 'success', message: 'Project Midnight already running' };
    }

    const projectPath = typeof req.projectPath === 'string' ? req.projectPath : '';
    if (projectPath) {
      await activeRuntime.projectQueue.addProject(projectPath);
    }

    const needsRecovery = await activeRuntime.recoverySystem.checkNeedsRecovery();
    if (needsRecovery) {
      const recovered = await activeRuntime.recoverySystem.recover();
      pushActorLog(`[${new Date().toISOString()}] Recovery: ${recovered.length} project(s) recovered`);
    }

    runtimeState.running = true;
    runtimeState.startTime = Date.now();
    pushActorLog(`[${new Date().toISOString()}] Actor: Project Midnight ACTIVATED`);
    pushSentinelLog(`[${new Date().toISOString()}] Sentinel: Surveillance mode ENGAGED`);

    void activeRuntime.orchestrator.start().catch((error: unknown) => {
      runtimeState.running = false;
      pushActorLog(`[${new Date().toISOString()}] Actor: Runtime error ${String(error)}`);
    });

    return { type: 'success', message: 'Project Midnight started' };
  });

  ipcServer.handle('stop', async () => {
    if (!runtime) {
      runtimeState.running = false;
      return { type: 'success', message: 'Project Midnight already stopped' };
    }

    await runtime.orchestrator.stop(true);
    runtimeState.running = false;
    pushActorLog(`[${new Date().toISOString()}] Actor: SHUTDOWN complete`);
    pushSentinelLog(`[${new Date().toISOString()}] Sentinel: Surveillance TERMINATED`);
    return { type: 'success', message: 'Project Midnight stopped' };
  });

  ipcServer.handle('pause', async () => {
    if (!runtime) return { type: 'error', message: 'Project Midnight runtime is not initialized' };
    await runtime.orchestrator.pause();
    runtimeState.running = false;
    return { type: 'success', message: 'Project Midnight paused' };
  });

  ipcServer.handle('resume', async () => {
    if (!runtime) return { type: 'error', message: 'Project Midnight runtime is not initialized' };
    runtimeState.running = true;
    void runtime.orchestrator.resume().catch((error: unknown) => {
      runtimeState.running = false;
      pushActorLog(`[${new Date().toISOString()}] Actor: Resume error ${String(error)}`);
    });
    return { type: 'success', message: 'Project Midnight resumed' };
  });

  ipcServer.handle('queue_add', async (req: Record<string, unknown>) => {
    const path = typeof req.projectPath === 'string' ? req.projectPath : '';
    if (!path) return { type: 'error', message: 'projectPath is required' };

    const activeRuntime = await ensureRuntime();
    const project = await activeRuntime.projectQueue.addProject(path);
    const queue = await activeRuntime.projectQueue.listProjects();
    return { type: 'queue', data: { project, queue } as never };
  });

  ipcServer.handle('queue_remove', async (req: Record<string, unknown>) => {
    const projectId = typeof req.projectId === 'string' ? req.projectId : '';
    if (!projectId) return { type: 'error', message: 'projectId is required' };

    const activeRuntime = await ensureRuntime();
    const removed = await activeRuntime.projectQueue.removeProject(projectId);
    const queue = await activeRuntime.projectQueue.listProjects();
    return { type: 'queue', data: { removed, queue } as never };
  });

  ipcServer.handle('queue_reorder', async (req: Record<string, unknown>) => {
    const projectId = typeof req.projectId === 'string' ? req.projectId : '';
    const newIndex = Number(req.newIndex);
    if (!projectId || Number.isNaN(newIndex)) {
      return { type: 'error', message: 'projectId and newIndex are required' };
    }

    const activeRuntime = await ensureRuntime();
    const projects = await activeRuntime.projectQueue.listProjects();
    const sorted = [...projects].sort((a, b) => b.priority - a.priority);
    const oldIndex = sorted.findIndex(p => p.id === projectId);
    if (oldIndex === -1) return { type: 'error', message: 'Project not found' };

    const [item] = sorted.splice(oldIndex, 1);
    sorted.splice(Math.max(0, Math.min(newIndex, sorted.length)), 0, item);
    const max = sorted.length;
    await Promise.all(sorted.map((p, idx) => activeRuntime.projectQueue.reorderProject(p.id, max - idx)));
    const queue = await activeRuntime.projectQueue.listProjects();
    return { type: 'queue', data: { queue } as never };
  });

  ipcServer.handle('queue_list', async () => {
    const activeRuntime = await ensureRuntime();
    const queue = await activeRuntime.projectQueue.listProjects();
    return { type: 'queue', data: queue as never };
  });

  ipcServer.handle('snapshot_list', async (req: Record<string, unknown>) => {
    const activeRuntime = await ensureRuntime();
    const projectId = typeof req.projectId === 'string' ? req.projectId : '';
    if (projectId) {
      const snapshots = await activeRuntime.snapshotManager.listSnapshots(projectId, 200, 0);
      return { type: 'snapshots', data: snapshots as never };
    }

    const projects = await activeRuntime.projectQueue.listProjects();
    const chunks = await Promise.all(
      projects.map(project => activeRuntime.snapshotManager.listSnapshots(project.id, 200, 0))
    );
    const snapshots = chunks.flatMap(chunk => chunk.snapshots);
    return {
      type: 'snapshots',
      data: {
        snapshots: snapshots.sort((a, b) => b.createdAt - a.createdAt),
        total: snapshots.length,
      } as never,
    };
  });

  ipcServer.handle('snapshot_create', async (req: Record<string, unknown>) => {
    const activeRuntime = await ensureRuntime();
    const projectId = typeof req.projectId === 'string' ? req.projectId : '';
    if (!projectId) return { type: 'error', message: 'projectId is required' };

    const label = typeof req.label === 'string' ? req.label : 'manual';
    const snapshot = await activeRuntime.snapshotManager.createLabeledSnapshot(projectId, label);
    return { type: 'success', message: 'Snapshot created', data: snapshot as never };
  });

  ipcServer.handle('snapshot_recover', async (req: Record<string, unknown>) => {
    const activeRuntime = await ensureRuntime();
    const snapshotId = typeof req.snapshotId === 'string' ? req.snapshotId : '';
    if (!snapshotId) return { type: 'error', message: 'snapshotId is required' };

    const result = await activeRuntime.recoverySystem.recoverFromSnapshot(snapshotId);
    if (!result.success) {
      return { type: 'error', message: result.message, data: result as never };
    }
    return { type: 'success', message: result.message, data: result as never };
  });

  ipcServer.handle('logs', async () => {
    return {
      type: 'success',
      message: 'logs',
      data: {
        actorLogs: runtimeState.actorLogs.slice(-50),
        sentinelLogs: runtimeState.sentinelLogs.slice(-50),
        lastVerdict: runtimeState.lastVerdict,
      },
    } as never;
  });

  ipcServer.handle('health', async () => {
    const status = await getStatusPayload();
    lastHealthPingAt = Date.now();
    return {
      type: 'success',
      message: 'healthy',
      data: {
        healthy: true,
        pid: process.pid,
        uptimeMs: Date.now() - sidecarBootTime,
        lastHealthPingAt,
        memory: process.memoryUsage(),
        running: status.running,
        queueLength: status.queueLength,
      },
    } as never;
  });

  await ipcServer.start();
  pushActorLog(`[${new Date().toISOString()}] Sidecar: IPC server listening at ${defaultSocketPath}`);
  console.log(`[midnight-sidecar] ready on ${defaultSocketPath}`);

  process.on('SIGINT', () => {
    void shutdown(0);
  });
  process.on('SIGTERM', () => {
    void shutdown(0);
  });
  process.on('uncaughtException', (error: Error) => {
    writeServiceLog('ERROR', `uncaught exception: ${error.stack || error.message}`);
    pushActorLog(`[${new Date().toISOString()}] Sidecar: uncaught exception ${error.message}`);
    void shutdown(1);
  });
  process.on('unhandledRejection', reason => {
    writeServiceLog('ERROR', `unhandled rejection: ${String(reason)}`);
    pushActorLog(`[${new Date().toISOString()}] Sidecar: unhandled rejection ${String(reason)}`);
  });

  setInterval(() => {
    writeServiceLog('INFO', `heartbeat pid=${process.pid} uptimeMs=${Date.now() - sidecarBootTime}`);
  }, 60_000).unref();
}

void main().catch((error: unknown) => {
  writeServiceLog('ERROR', `fatal startup error: ${String(error)}`);
  console.error('[midnight-sidecar] fatal startup error:', error);
    void shutdown(1);
  });

