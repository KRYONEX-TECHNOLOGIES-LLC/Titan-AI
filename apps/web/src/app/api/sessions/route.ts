/**
 * Chat Sessions API
 * UUID-based session management with Supabase persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, getAllSessions, saveSession, deleteSession } from '@/lib/db/client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  codeContext?: {
    file: string;
    selection?: string;
    language: string;
  };
}

export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  model: string;
  changedFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  contextWindow: string[];
}

function rowToSession(row: {
  id: string;
  name: string;
  model: string;
  messages: unknown;
  changed_files: unknown;
  context_window: unknown;
  created_at: string;
  updated_at: string;
}): Session {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: (row.messages ?? []) as ChatMessage[],
    changedFiles: (row.changed_files ?? []) as Session['changedFiles'],
    contextWindow: (row.context_window ?? []) as string[],
  };
}

const defaultSessionId = 'default-session';

async function ensureDefaultSession() {
  const existing = await getSession(defaultSessionId);
  if (!existing) {
    await saveSession({
      id: defaultSessionId,
      name: 'Titan AI Assistant',
      model: 'claude-sonnet-4.6',
      messages: [{
        id: 'welcome-1',
        role: 'assistant',
        content: "Welcome to Titan AI. I'm ready to help you build, debug, and refactor your code. What would you like to work on?",
        timestamp: Date.now(),
      }],
      changed_files: [],
      context_window: [],
    });
  }
}

/**
 * GET /api/sessions - List all sessions or get one by id
 */
export async function GET(request: NextRequest) {
  await ensureDefaultSession();

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('id');

  if (sessionId) {
    const row = await getSession(sessionId);
    if (!row) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({ session: rowToSession(row) });
  }

  const rows = await getAllSessions();
  const allSessions = rows.map(row => {
    const s = rowToSession(row);
    return {
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      model: s.model,
    };
  });

  return NextResponse.json({ sessions: allSessions, total: allSessions.length });
}

/**
 * POST /api/sessions - Create new session
 */
export async function POST(request: NextRequest) {
  let body: { name?: string; model?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, model } = body;
  const sessionId = `session-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const session: Session = {
    id: sessionId,
    name: name || 'New Session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [{
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'New session started. Your changes will be isolated until you click Apply. How can I help you?',
      timestamp: Date.now(),
    }],
    model: model || 'claude-sonnet-4.6',
    changedFiles: [],
    contextWindow: [],
  };

  await saveSession({
    id: session.id,
    name: session.name,
    model: session.model,
    messages: session.messages,
    changed_files: session.changedFiles,
    context_window: session.contextWindow,
    created_at: session.createdAt,
  });

  return NextResponse.json({ success: true, session });
}

/**
 * PATCH /api/sessions - Update session (add message, change name, etc.)
 */
export async function PATCH(request: NextRequest) {
  let body: { sessionId: string; action: string; data: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { sessionId, action, data } = body;

  const row = await getSession(sessionId);
  if (!row) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const session = rowToSession(row);

  switch (action) {
    case 'addMessage': {
      const message: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: data.role as ChatMessage['role'],
        content: data.content as string,
        timestamp: Date.now(),
        codeContext: data.codeContext as ChatMessage['codeContext'],
      };
      session.messages.push(message);
      break;
    }
    case 'rename':
      session.name = data.name as string;
      break;
    case 'setModel':
      session.model = data.model as string;
      break;
    case 'addChangedFile':
      session.changedFiles.push(data.file as Session['changedFiles'][number]);
      break;
    case 'clearChangedFiles':
      session.changedFiles = [];
      break;
    case 'addToContext':
      if (!session.contextWindow.includes(data.path as string)) {
        session.contextWindow.push(data.path as string);
      }
      break;
    case 'removeFromContext':
      session.contextWindow = session.contextWindow.filter(p => p !== data.path);
      break;
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  session.updatedAt = new Date().toISOString();

  await saveSession({
    id: session.id,
    name: session.name,
    model: session.model,
    messages: session.messages.slice(-100),
    changed_files: session.changedFiles,
    context_window: session.contextWindow,
    created_at: session.createdAt,
  });

  return NextResponse.json({ success: true, session });
}

/**
 * DELETE /api/sessions - Delete a session
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('id');

  if (!sessionId) {
    return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
  }

  if (sessionId === defaultSessionId) {
    return NextResponse.json({ error: 'Cannot delete default session' }, { status: 400 });
  }

  await deleteSession(sessionId);
  return NextResponse.json({ success: true, message: `Session ${sessionId} deleted` });
}
