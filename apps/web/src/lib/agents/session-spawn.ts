/**
 * Titan Session Spawn — lightweight subagent spawning.
 *
 * Alfred or chat can spawn a subagent with a specific task.
 * The subagent runs in the background (one-shot) and announces
 * its result back. Uses the existing LLM call infra.
 */

import { getHiveContext } from '@/lib/hive-memory';

export type SpawnMode = 'oneshot' | 'session';
export type SpawnStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SpawnRequest {
  task: string;
  label?: string;
  model?: string;
  agentId?: string;
  mode?: SpawnMode;
  timeout?: number;
}

export interface SpawnSession {
  id: string;
  task: string;
  label: string;
  model: string;
  mode: SpawnMode;
  status: SpawnStatus;
  result?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
  parentId?: string;
}

const SESSIONS_KEY = 'titan-spawn-sessions';
let sessionCounter = 0;

function genSessionId(): string {
  return `spawn-${Date.now().toString(36)}-${(++sessionCounter).toString(36)}`;
}

function loadSessions(): SpawnSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSessions(sessions: SpawnSession[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(-100)));
  } catch { /* quota */ }
}

/**
 * Spawn a subagent that runs a task and returns the result.
 * Uses /api/chat/continue (or equivalent) to get a one-shot response.
 */
export async function spawnAgent(request: SpawnRequest): Promise<SpawnSession> {
  const session: SpawnSession = {
    id: genSessionId(),
    task: request.task,
    label: request.label || request.task.slice(0, 60),
    model: request.model || 'google/gemini-2.0-flash-001',
    mode: request.mode || 'oneshot',
    status: 'pending',
    createdAt: Date.now(),
  };

  const sessions = loadSessions();
  sessions.push(session);
  saveSessions(sessions);

  session.status = 'running';
  updateSession(session);

  try {
    const hiveContext = getHiveContext(1000);
    const systemPrompt = `You are a Titan subagent. Complete the task below concisely and accurately. Return ONLY the result, no preamble.\n${hiveContext ? `\n[CONTEXT]\n${hiveContext}` : ''}`;

    const timeoutMs = (request.timeout || 60) * 1000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: session.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: session.task },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      session.status = 'failed';
      session.error = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      session.completedAt = Date.now();
      updateSession(session);
      return session;
    }

    const data = await res.json().catch(() => null);
    if (data && data.content) {
      session.result = data.content;
      session.status = 'completed';
    } else if (data && data.choices?.[0]?.message?.content) {
      session.result = data.choices[0].message.content;
      session.status = 'completed';
    } else {
      // Streaming response — read text
      session.result = typeof data === 'string' ? data : JSON.stringify(data).slice(0, 2000);
      session.status = 'completed';
    }
    session.completedAt = Date.now();
    updateSession(session);
    return session;
  } catch (err) {
    session.status = 'failed';
    session.error = err instanceof Error ? err.message : String(err);
    session.completedAt = Date.now();
    updateSession(session);
    return session;
  }
}

function updateSession(session: SpawnSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.push(session);
  saveSessions(sessions);
}

export function listSessions(limit = 20): SpawnSession[] {
  return loadSessions()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function getSession(sessionId: string): SpawnSession | undefined {
  return loadSessions().find(s => s.id === sessionId);
}

export function cancelSession(sessionId: string): boolean {
  const sessions = loadSessions();
  const session = sessions.find(s => s.id === sessionId);
  if (!session || session.status === 'completed' || session.status === 'failed') return false;
  session.status = 'cancelled';
  session.completedAt = Date.now();
  saveSessions(sessions);
  return true;
}

export async function sendToSession(sessionId: string, message: string): Promise<string | null> {
  const session = getSession(sessionId);
  if (!session || session.status !== 'completed') return null;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: session.model,
        messages: [
          { role: 'system', content: `You are a Titan subagent continuing a task. Previous task: ${session.task}. Previous result: ${session.result?.slice(0, 500)}` },
          { role: 'user', content: message },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.content || data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}
