/**
 * Chat Sessions API
 * UUID-based session management with persistence
 */

import { NextRequest, NextResponse } from 'next/server';

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

// In-memory store (in production, use SQLite)
const sessions: Map<string, Session> = new Map();

// Initialize with a default session
const defaultSessionId = 'default-session';
sessions.set(defaultSessionId, {
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

/**
 * GET /api/sessions - List all sessions
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('id');

  if (sessionId) {
    // Get specific session
    const session = sessions.get(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ session });
  }

  // List all sessions
  const allSessions = Array.from(sessions.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(s => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      model: s.model,
    }));

  return NextResponse.json({
    sessions: allSessions,
    total: allSessions.length,
  });
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

  sessions.set(sessionId, session);

  return NextResponse.json({
    success: true,
    session,
  });
}

/**
 * PATCH /api/sessions - Update session (add message, change name, etc.)
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { sessionId, action, data } = body;

  const session = sessions.get(sessionId);
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

  return NextResponse.json({
    success: true,
    session,
  });
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

  sessions.delete(sessionId);

  return NextResponse.json({
    success: true,
    message: `Session ${sessionId} deleted`,
  });
}
