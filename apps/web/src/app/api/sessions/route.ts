/**
 * Chat Sessions API
 * UUID-based session management with persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';

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
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  model: string;
  changedFiles: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  contextWindow: string[];
}

// SQLite-backed session storage with in-memory fallback
const memoryFallback: Map<string, Session> = new Map();

function initSessionsTable() {
  try {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT 'claude-4.6-sonnet',
        messages TEXT NOT NULL DEFAULT '[]',
        changed_files TEXT NOT NULL DEFAULT '[]',
        context_window TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    return true;
  } catch {
    return false;
  }
}

function getSessionFromDb(id: string): Session | null {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id, name: row.name, model: row.model,
      createdAt: row.created_at, updatedAt: row.updated_at,
      messages: JSON.parse(row.messages),
      changedFiles: JSON.parse(row.changed_files),
      contextWindow: JSON.parse(row.context_window),
    };
  } catch {
    return memoryFallback.get(id) || null;
  }
}

function saveSessionToDb(session: Session) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO chat_sessions (id, name, model, messages, changed_files, context_window, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id, session.name, session.model,
      JSON.stringify(session.messages.slice(-100)),
      JSON.stringify(session.changedFiles),
      JSON.stringify(session.contextWindow),
      session.createdAt, session.updatedAt
    );
  } catch {
    memoryFallback.set(session.id, session);
  }
}

function getAllSessionsFromDb(): Session[] {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id, name: row.name, model: row.model,
      createdAt: row.created_at, updatedAt: row.updated_at,
      messages: JSON.parse(row.messages),
      changedFiles: JSON.parse(row.changed_files),
      contextWindow: JSON.parse(row.context_window),
    }));
  } catch {
    return Array.from(memoryFallback.values());
  }
}

function deleteSessionFromDb(id: string) {
  try {
    const db = getDb();
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(id);
  } catch {
    memoryFallback.delete(id);
  }
}

// Initialize table on module load
const dbReady = initSessionsTable();

const defaultSessionId = 'default-session';
if (dbReady && !getSessionFromDb(defaultSessionId)) {
  saveSessionToDb({
    id: defaultSessionId,
    name: 'Titan AI Assistant',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [{
      id: 'welcome-1',
      role: 'assistant',
      content: "Welcome to Titan AI. I'm ready to help you build, debug, and refactor your code. What would you like to work on?",
      timestamp: Date.now(),
    }],
    model: 'claude-4.6-sonnet',
    changedFiles: [],
    contextWindow: [],
  });
}

/**
 * GET /api/sessions - List all sessions
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('id');

  if (sessionId) {
    const session = getSessionFromDb(sessionId);
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json({ session });
  }

  const allSessions = getAllSessionsFromDb().map(s => ({
    id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt,
    messageCount: s.messages.length, model: s.model,
  }));

  return NextResponse.json({ sessions: allSessions, total: allSessions.length });
}

/**
 * POST /api/sessions - Create new session
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, model } = body;

  const sessionId = `session-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  
  const session: Session = {
    id: sessionId,
    name: name || 'New Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [{
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'New session started. Your changes will be isolated until you click Apply. How can I help you?',
      timestamp: Date.now(),
    }],
    model: model || 'claude-4.6-sonnet',
    changedFiles: [],
    contextWindow: [],
  };

  saveSessionToDb(session);

  return NextResponse.json({ success: true, session });
}

/**
 * PATCH /api/sessions - Update session (add message, change name, etc.)
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { sessionId, action, data } = body;

  const session = getSessionFromDb(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  switch (action) {
    case 'addMessage': {
      const message: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        role: data.role,
        content: data.content,
        timestamp: Date.now(),
        codeContext: data.codeContext,
      };
      session.messages.push(message);
      session.updatedAt = Date.now();
      break;
    }

    case 'rename': {
      session.name = data.name;
      session.updatedAt = Date.now();
      break;
    }

    case 'setModel': {
      session.model = data.model;
      session.updatedAt = Date.now();
      break;
    }

    case 'addChangedFile': {
      session.changedFiles.push(data.file);
      session.updatedAt = Date.now();
      break;
    }

    case 'clearChangedFiles': {
      session.changedFiles = [];
      session.updatedAt = Date.now();
      break;
    }

    case 'addToContext': {
      if (!session.contextWindow.includes(data.path)) {
        session.contextWindow.push(data.path);
      }
      session.updatedAt = Date.now();
      break;
    }

    case 'removeFromContext': {
      session.contextWindow = session.contextWindow.filter(p => p !== data.path);
      session.updatedAt = Date.now();
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  saveSessionToDb(session);
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

  deleteSessionFromDb(sessionId);
  return NextResponse.json({ success: true, message: `Session ${sessionId} deleted` });
}
