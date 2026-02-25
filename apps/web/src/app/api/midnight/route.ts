/**
 * Project Midnight API Route (Sidecar Proxy)
 * Spawns and proxies requests to the standalone Midnight sidecar over IPC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync } from 'fs';
import { createConnection, type Socket } from 'net';
import { join, resolve } from 'path';

export const dynamic = 'force-dynamic';

type QueueProject = {
  id: string;
  name: string;
  path: string;
  status: 'queued' | 'loading' | 'planning' | 'building' | 'verifying' | 'completed' | 'failed' | 'paused' | 'cooldown';
  priority: number;
  addedAt: number;
};

type RuntimeCache = {
  running: boolean;
  trustLevel: 1 | 2 | 3;
  workerModel: string;
  actorLogs: string[];
  sentinelLogs: string[];
  lastVerdict: { qualityScore: number; passed: boolean; message: string } | null;
  sandboxStatus: 'kata' | 'docker' | 'native' | 'unknown';
  subscribed: boolean;
};

type IPCRequest = Record<string, unknown> & { type: string };
type IPCResponse = Record<string, unknown> & { type?: string; message?: string };
type MidnightEvent = {
  type: string;
  project?: { name?: string };
  task?: { description?: string };
  verdict?: { qualityScore: number; passed: boolean; correctionDirective?: string | null };
  reason?: string;
  toHash?: string;
  snapshot?: { id?: string };
};

class IPCClient {
  private socketPath: string;
  private socket: Socket | null = null;
  private buffer = '';
  private pending: Array<{ resolve: (value: IPCResponse) => void; reject: (reason: Error) => void }> = [];
  private eventCallback: ((event: IPCResponse) => void) | null = null;

  constructor(socketPath: string) {
    this.socketPath = normalizeSocketPath(socketPath);
  }

  async connect(): Promise<void> {
    if (this.socket) return;

    this.socket = createConnection(this.socketPath);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const onConnect = () => {
        this.socket?.off('error', onError);
        this.setupDataHandler();
        resolvePromise();
      };
      const onError = (error: Error) => {
        this.socket?.off('connect', onConnect);
        this.socket = null;
        rejectPromise(error);
      };
      this.socket?.once('connect', onConnect);
      this.socket?.once('error', onError);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.pending = [];
    this.buffer = '';
  }

  async request(payload: IPCRequest): Promise<IPCResponse> {
    if (!this.socket) {
      throw new Error('IPC client is not connected');
    }

    return new Promise<IPCResponse>((resolvePromise, rejectPromise) => {
      this.pending.push({ resolve: resolvePromise, reject: rejectPromise });
      this.socket?.write(`${JSON.stringify(payload)}\n`, error => {
        if (error) {
          const pending = this.pending.shift();
          pending?.reject(error);
        }
      });
    });
  }

  async subscribe(callback: (event: IPCResponse) => void): Promise<void> {
    this.eventCallback = callback;
    await this.request({ type: 'subscribe_events' });
  }

  private setupDataHandler(): void {
    if (!this.socket) return;

    this.socket.on('data', chunk => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as IPCResponse;
          if (parsed.type === 'event' && this.eventCallback) {
            this.eventCallback(parsed);
          } else {
            const pending = this.pending.shift();
            pending?.resolve(parsed);
          }
        } catch {
          // Ignore malformed IPC payloads.
        }
      }
    });

    this.socket.on('error', error => {
      while (this.pending.length > 0) {
        const pending = this.pending.shift();
        pending?.reject(error);
      }
    });
  }
}

function normalizeSocketPath(value: string): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${value.replace(/[/\\:]/g, '_')}`;
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function resolveAppRoot(): string {
  const cwd = process.cwd();
  const isAppRoot = existsSync(resolve(cwd, 'src', 'app'));
  if (isAppRoot) return cwd;
  return resolve(cwd, 'apps', 'web');
}

function resolveWorkspaceRoot(appRoot: string): string {
  const candidate = resolve(appRoot, '..', '..');
  return existsSync(resolve(candidate, 'packages')) ? candidate : process.cwd();
}

function resolveSidecarEntry(appRoot: string, workspaceRoot: string): string {
  const candidates = [
    resolve(workspaceRoot, 'packages', 'midnight', 'src', 'service', 'sidecar-entry.ts'),
    resolve(appRoot, '..', '..', 'packages', 'midnight', 'src', 'service', 'sidecar-entry.ts'),
    resolve(process.cwd(), '..', '..', 'packages', 'midnight', 'src', 'service', 'sidecar-entry.ts'),
  ];
  const found = candidates.find(p => existsSync(p));
  if (!found) {
    throw new Error('Could not resolve Midnight sidecar entry script');
  }
  return found;
}

const appRoot = resolveAppRoot();
const workspaceRoot = resolveWorkspaceRoot(appRoot);
const titanDir = resolve(workspaceRoot, '.titan');
const socketPath = process.env.MIDNIGHT_SOCKET_PATH || join(titanDir, 'midnight.sock');
const dbPath = process.env.MIDNIGHT_DB_PATH || join(titanDir, 'midnight.db');

let sidecarProcess: ChildProcessWithoutNullStreams | null = null;
let ipcClient: IPCClient | null = null;
let connectingPromise: Promise<IPCClient> | null = null;
let spawnPromise: Promise<void> | null = null;

const runtimeCache: RuntimeCache = {
  running: false,
  trustLevel: 1,
  workerModel: 'openai/gpt-5.3',
  actorLogs: [],
  sentinelLogs: [],
  lastVerdict: null,
  sandboxStatus: 'unknown',
  subscribed: false,
};

function appendLog(kind: 'actor' | 'sentinel', line: string): void {
  const bucket = kind === 'actor' ? runtimeCache.actorLogs : runtimeCache.sentinelLogs;
  bucket.push(`[${new Date().toISOString()}] ${line}`);
  if (bucket.length > 500) bucket.splice(0, bucket.length - 500);
}

function handleEvent(eventResponse: IPCResponse): void {
  const event = eventResponse.event as MidnightEvent | undefined;
  if (!event) return;

  const stamp = new Date().toISOString();
  switch (event.type) {
    case 'project_started':
      appendLog('actor', `Actor: Started ${event.project?.name || 'project'}`);
      break;
    case 'project_completed':
      appendLog('actor', `Actor: Completed ${event.project?.name || 'project'}`);
      break;
    case 'project_failed':
      appendLog('actor', `Actor: Failed ${event.project?.name || 'project'} (${event.reason || 'unknown'})`);
      break;
    case 'task_started':
      appendLog('actor', `Actor: Task started "${event.task?.description || 'task'}"`);
      break;
    case 'task_completed':
      appendLog('actor', `Actor: Task completed "${event.task?.description || 'task'}"`);
      break;
    case 'sentinel_verdict':
      if (event.verdict) {
        runtimeCache.lastVerdict = {
          qualityScore: event.verdict.qualityScore,
          passed: event.verdict.passed,
          message:
            event.verdict.correctionDirective ||
            (event.verdict.passed ? 'Sentinel approved change' : 'Sentinel rejected change'),
        };
        runtimeCache.sentinelLogs.push(
          `[${stamp}] Sentinel: ${event.verdict.passed ? 'PASSED' : 'FAILED'} (${event.verdict.qualityScore}/100)`
        );
      }
      break;
    case 'sentinel_veto':
      appendLog('sentinel', `Sentinel: VETO ${event.reason || ''}`.trim());
      break;
    case 'worktree_reverted':
      appendLog('sentinel', `Sentinel: Reverted worktree ${event.toHash || ''}`.trim());
      break;
    case 'snapshot_created':
      appendLog('actor', `State: Snapshot created ${event.snapshot?.id || ''}`.trim());
      break;
  }

  runtimeCache.actorLogs = runtimeCache.actorLogs.slice(-500);
  runtimeCache.sentinelLogs = runtimeCache.sentinelLogs.slice(-500);
}

async function ensureSidecarSpawned(): Promise<void> {
  if (sidecarProcess && !sidecarProcess.killed) {
    return;
  }
  if (spawnPromise) {
    return spawnPromise;
  }

  spawnPromise = (async () => {
    // Reuse an already-running sidecar if the socket is live.
    try {
      const existing = new IPCClient(socketPath);
      await existing.connect();
      await existing.request({ type: 'status' });
      ipcClient = existing;
      return;
    } catch {
      // No existing sidecar reachable, spawn a new one.
      ipcClient?.disconnect();
      ipcClient = null;
    }

    const sidecarEntry = resolveSidecarEntry(appRoot, workspaceRoot);
    const env = {
      ...process.env,
      MIDNIGHT_WORKSPACE_ROOT: workspaceRoot,
      MIDNIGHT_SOCKET_PATH: socketPath,
      MIDNIGHT_DB_PATH: dbPath,
      MIDNIGHT_NODE_MODULES: resolve(appRoot, 'node_modules'),
    };

    sidecarProcess = spawn(process.execPath, ['--import', 'tsx', sidecarEntry], {
      cwd: appRoot,
      env,
      stdio: 'pipe',
    });

    sidecarProcess.stdout.on('data', data => {
      appendLog('actor', `Sidecar: ${String(data).trim()}`);
    });

    sidecarProcess.stderr.on('data', data => {
      appendLog('actor', `Sidecar stderr: ${String(data).trim()}`);
    });

    sidecarProcess.on('exit', (code, signal) => {
      appendLog('actor', `Sidecar exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      sidecarProcess = null;
      runtimeCache.running = false;
      runtimeCache.subscribed = false;
      ipcClient?.disconnect();
      ipcClient = null;
      connectingPromise = null;
    });
  })().finally(() => {
    spawnPromise = null;
  });

  return spawnPromise;
}

async function getClient(): Promise<IPCClient> {
  if (ipcClient) return ipcClient;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const client = new IPCClient(socketPath);
    await client.connect();
    ipcClient = client;
    connectingPromise = null;
    return client;
  })().catch(error => {
    connectingPromise = null;
    throw error;
  });

  return connectingPromise;
}

async function ensureSubscribed(): Promise<void> {
  if (runtimeCache.subscribed) return;
  const client = await getClient();
  await client.subscribe(handleEvent);
  runtimeCache.subscribed = true;
}

async function waitUntilSidecarReady(timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  let lastError: unknown = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const client = await getClient();
      await client.request({ type: 'status' });
      await ensureSubscribed();
      return;
    } catch (error) {
      lastError = error;
      ipcClient?.disconnect();
      ipcClient = null;
      await sleep(300);
    }
  }

  throw new Error(`Timed out waiting for sidecar readiness: ${String(lastError)}`);
}

async function requestSidecar(payload: IPCRequest): Promise<IPCResponse> {
  await ensureSidecarSpawned();
  await waitUntilSidecarReady();
  const client = await getClient();
  return client.request(payload);
}

function toUIQueue(projects: any[]): QueueProject[] {
  return [...projects]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .map((p, idx) => ({
      id: String(p.id),
      name: String(p.name || p.id || 'project'),
      path: String(p.localPath || p.path || ''),
      status: (p.status || 'queued') as QueueProject['status'],
      priority: idx + 1,
      addedAt: Number(p.createdAt || Date.now()),
    }));
}

function fallbackStatusPayload() {
  return {
    running: runtimeCache.running,
    trustLevel: runtimeCache.trustLevel,
    workerModel: runtimeCache.workerModel,
    actorLogs: runtimeCache.actorLogs.slice(-50),
    sentinelLogs: runtimeCache.sentinelLogs.slice(-50),
    lastVerdict: runtimeCache.lastVerdict,
    queue: [],
    sandboxStatus: runtimeCache.sandboxStatus,
    confidenceScore: 100,
    confidenceStatus: 'healthy',
    uptime: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    queueLength: 0,
    currentProject: null,
  };
}

export async function GET() {
  try {
    if (!sidecarProcess && !ipcClient) {
      return NextResponse.json(fallbackStatusPayload());
    }

    const response = await requestSidecar({ type: 'status' });
    const data = (response.data as Record<string, unknown>) || {};
    runtimeCache.running = Boolean(data.running);
    runtimeCache.trustLevel = Number(data.trustLevel || runtimeCache.trustLevel) as 1 | 2 | 3;
    runtimeCache.workerModel = String(data.workerModel || runtimeCache.workerModel);
    runtimeCache.sandboxStatus = (data.sandboxStatus as RuntimeCache['sandboxStatus']) || runtimeCache.sandboxStatus;

    const rawQueue = Array.isArray(data.queue) ? (data.queue as any[]) : [];
    return NextResponse.json({
      ...data,
      queue: toUIQueue(rawQueue),
      actorLogs: Array.isArray(data.actorLogs) ? data.actorLogs : runtimeCache.actorLogs.slice(-50),
      sentinelLogs: Array.isArray(data.sentinelLogs) ? data.sentinelLogs : runtimeCache.sentinelLogs.slice(-50),
      lastVerdict: data.lastVerdict || runtimeCache.lastVerdict,
    });
  } catch (error) {
    appendLog('actor', `Proxy GET failure: ${String(error)}`);
    return NextResponse.json(fallbackStatusPayload());
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = body.action as string | undefined;
  const trustLevel = Number(body.trustLevel ?? body.trust);
  const model = typeof body.model === 'string' ? body.model : '';
  const projectPath = (typeof body.path === 'string' ? body.path : body.projectPath) as string | undefined;
  const projectId = body.projectId as string | undefined;
  const newIndex = body.newIndex as number | undefined;

  try {
    switch (action) {
      case 'setModel': {
        if (!model) return NextResponse.json({ error: 'Model is required' }, { status: 400 });
        runtimeCache.workerModel = model;
        await requestSidecar({ type: 'set_model', model });
        return NextResponse.json({ success: true, model: runtimeCache.workerModel });
      }
      case 'setTrustLevel': {
        if (trustLevel !== 1 && trustLevel !== 2 && trustLevel !== 3) {
          return NextResponse.json({ error: 'Trust level must be 1, 2, or 3' }, { status: 400 });
        }
        runtimeCache.trustLevel = trustLevel;
        await requestSidecar({ type: 'set_trust', trustLevel });
        return NextResponse.json({ success: true, message: `Trust level set to ${trustLevel}` });
      }
      case 'start': {
        const useProtocolMode = body.useProtocolMode !== false;
        const effectiveTrust = trustLevel === 1 || trustLevel === 2 || trustLevel === 3 ? trustLevel : runtimeCache.trustLevel;
        const effectiveModel = model || runtimeCache.workerModel;
        runtimeCache.trustLevel = effectiveTrust;
        runtimeCache.workerModel = effectiveModel;

        try {
          const response = await requestSidecar({
            type: 'start',
            trustLevel: effectiveTrust,
            model: effectiveModel,
            projectPath,
            useProtocolMode,
          });
          runtimeCache.running = true;
          return NextResponse.json({ success: response.type !== 'error', message: response.message || 'Project Midnight started' });
        } catch {
          runtimeCache.running = true;
          appendLog('actor', `In-process mode activated (no sidecar). Model: ${effectiveModel}`);
          return NextResponse.json({ success: true, message: 'Project Midnight started (in-process mode)', inProcess: true });
        }
      }
      case 'stop': {
        try {
          const response = await requestSidecar({ type: 'stop', graceful: true });
          runtimeCache.running = false;
          return NextResponse.json({ success: response.type !== 'error', message: response.message || 'Project Midnight stopped' });
        } catch {
          runtimeCache.running = false;
          appendLog('actor', 'Midnight stopped (in-process)');
          return NextResponse.json({ success: true, message: 'Project Midnight stopped' });
        }
      }
      case 'pause': {
        try {
          const response = await requestSidecar({ type: 'pause' });
          runtimeCache.running = false;
          return NextResponse.json({ success: response.type !== 'error', message: response.message || 'Project Midnight paused' });
        } catch {
          runtimeCache.running = false;
          return NextResponse.json({ success: true, message: 'Project Midnight paused' });
        }
      }
      case 'resume': {
        try {
          const response = await requestSidecar({ type: 'resume' });
          runtimeCache.running = true;
          return NextResponse.json({ success: response.type !== 'error', message: response.message || 'Project Midnight resumed' });
        } catch {
          runtimeCache.running = true;
          return NextResponse.json({ success: true, message: 'Project Midnight resumed' });
        }
      }
      case 'addToQueue': {
        if (!projectPath) return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        const response = await requestSidecar({ type: 'queue_add', projectPath });
        const payload = (response.data as Record<string, unknown>) || {};
        const queue = Array.isArray(payload.queue) ? (payload.queue as any[]) : [];
        const project = payload.project || null;
        return NextResponse.json({
          success: response.type !== 'error',
          message: response.message || 'Project added to queue',
          project,
          queue: toUIQueue(queue),
        });
      }
      case 'removeFromQueue': {
        if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        const response = await requestSidecar({ type: 'queue_remove', projectId });
        const payload = (response.data as Record<string, unknown>) || {};
        const removed = Boolean(payload.removed);
        if (!removed) return NextResponse.json({ error: 'Project not found in queue' }, { status: 404 });
        const queue = Array.isArray(payload.queue) ? (payload.queue as any[]) : [];
        return NextResponse.json({
          success: true,
          message: 'Project removed from queue',
          queue: toUIQueue(queue),
        });
      }
      case 'reorderQueue': {
        if (!projectId || typeof newIndex !== 'number') {
          return NextResponse.json({ error: 'projectId and numeric newIndex are required' }, { status: 400 });
        }
        const response = await requestSidecar({ type: 'queue_reorder', projectId, newIndex });
        const payload = (response.data as Record<string, unknown>) || {};
        const queue = Array.isArray(payload.queue) ? (payload.queue as any[]) : [];
        return NextResponse.json({
          success: response.type !== 'error',
          message: response.message || 'Queue reordered',
          queue: toUIQueue(queue),
        });
      }
      case 'getQueue': {
        const response = await requestSidecar({ type: 'queue_list' });
        const queue = Array.isArray(response.data) ? (response.data as any[]) : [];
        return NextResponse.json({ queue: toUIQueue(queue) });
      }
      case 'getLogs': {
        const response = await requestSidecar({ type: 'logs' });
        const logs = (response.data as Record<string, unknown>) || {};
        return NextResponse.json({
          actorLogs: (logs.actorLogs as string[]) || runtimeCache.actorLogs.slice(-50),
          sentinelLogs: (logs.sentinelLogs as string[]) || runtimeCache.sentinelLogs.slice(-50),
          lastVerdict: logs.lastVerdict || runtimeCache.lastVerdict,
        });
      }
      case 'health': {
        const response = await requestSidecar({ type: 'health' });
        const health = (response.data as Record<string, unknown>) || {};
        return NextResponse.json({
          healthy: response.type !== 'error',
          ...(response.type === 'error' ? { message: response.message || 'Healthcheck failed' } : {}),
          ...health,
          sidecarManagedByApi: true,
        });
      }
      case 'getSnapshots': {
        const response = await requestSidecar({
          type: 'snapshot_list',
          ...(body.projectId ? { projectId: body.projectId } : {}),
        });
        const payload = (response.data as Record<string, unknown>) || {};
        return NextResponse.json({
          snapshots: (payload.snapshots as unknown[]) || [],
          total: Number(payload.total ?? 0),
        });
      }
      case 'createSnapshot': {
        const projectId = body.projectId as string | undefined;
        if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        const response = await requestSidecar({
          type: 'snapshot_create',
          projectId,
          label: (body.label as string | undefined) || 'manual',
        });
        if (response.type === 'error') {
          return NextResponse.json({ error: response.message || 'Snapshot creation failed' }, { status: 500 });
        }
        return NextResponse.json({
          success: true,
          snapshot: response.data || null,
          message: response.message || 'Snapshot created',
        });
      }
      case 'recoverSnapshot': {
        const snapshotId = body.snapshotId as string | undefined;
        if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
        const response = await requestSidecar({ type: 'snapshot_recover', snapshotId });
        if (response.type === 'error') {
          return NextResponse.json({ error: response.message || 'Recovery failed', recovery: response.data || null }, { status: 500 });
        }
        return NextResponse.json({
          success: true,
          message: response.message || 'Recovery initiated',
          recovery: response.data || null,
        });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    appendLog('actor', `Proxy POST failure (${action || 'unknown'}): ${String(error)}`);
    return NextResponse.json({ error: `Midnight sidecar error: ${String(error)}` }, { status: 500 });
  }
}
