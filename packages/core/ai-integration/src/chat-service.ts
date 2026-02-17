/**
 * Chat Service
 *
 * AI chat integration for the editor
 */

import { EventEmitter } from 'events';
import type {
  ChatSession,
  ChatMessage,
  ChatContext,
  ChatMessageMetadata,
} from './types';

export interface ChatServiceConfig {
  maxSessions: number;
  maxMessagesPerSession: number;
  systemPrompt?: string;
}

export class ChatService extends EventEmitter {
  private sessions = new Map<string, ChatSession>();
  private activeSessionId: string | null = null;
  private config: ChatServiceConfig;

  constructor(config: Partial<ChatServiceConfig> = {}) {
    super();
    this.config = {
      maxSessions: config.maxSessions ?? 50,
      maxMessagesPerSession: config.maxMessagesPerSession ?? 200,
      systemPrompt: config.systemPrompt,
    };
  }

  /**
   * Create a new chat session
   */
  createSession(title?: string, context?: ChatContext): ChatSession {
    const id = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const session: ChatSession = {
      id,
      title: title || 'New Chat',
      messages: [],
      context: context || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add system prompt if configured
    if (this.config.systemPrompt) {
      session.messages.push({
        id: `msg-${Date.now()}`,
        role: 'system',
        content: this.config.systemPrompt,
        timestamp: new Date(),
      });
    }

    this.sessions.set(id, session);
    this.activeSessionId = id;
    this.emit('sessionCreated', session);

    // Trim old sessions if needed
    this.trimSessions();

    return session;
  }

  /**
   * Get a session
   */
  getSession(id: string): ChatSession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get active session
   */
  getActiveSession(): ChatSession | undefined {
    if (!this.activeSessionId) return undefined;
    return this.sessions.get(this.activeSessionId);
  }

  /**
   * Set active session
   */
  setActiveSession(id: string): boolean {
    if (!this.sessions.has(id)) return false;
    this.activeSessionId = id;
    this.emit('activeSessionChanged', id);
    return true;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  /**
   * Add a message to a session
   */
  addMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: ChatMessageMetadata
  ): ChatMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    session.messages.push(message);
    session.updatedAt = new Date();

    // Trim old messages if needed
    if (session.messages.length > this.config.maxMessagesPerSession) {
      // Keep system messages and trim oldest non-system
      const systemMessages = session.messages.filter((m) => m.role === 'system');
      const otherMessages = session.messages.filter((m) => m.role !== 'system');
      session.messages = [
        ...systemMessages,
        ...otherMessages.slice(-this.config.maxMessagesPerSession + systemMessages.length),
      ];
    }

    this.emit('messageAdded', sessionId, message);
    return message;
  }

  /**
   * Update session context
   */
  updateContext(sessionId: string, context: Partial<ChatContext>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.context = { ...session.context, ...context };
    session.updatedAt = new Date();
    this.emit('contextUpdated', sessionId, session.context);
    return true;
  }

  /**
   * Update session title
   */
  updateTitle(sessionId: string, title: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.title = title;
    session.updatedAt = new Date();
    this.emit('titleUpdated', sessionId, title);
    return true;
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    if (!this.sessions.has(id)) return false;

    this.sessions.delete(id);

    if (this.activeSessionId === id) {
      const remaining = this.getAllSessions();
      this.activeSessionId = remaining[0]?.id ?? null;
    }

    this.emit('sessionDeleted', id);
    return true;
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
    this.activeSessionId = null;
    this.emit('sessionsCleared');
  }

  /**
   * Get messages for AI request
   */
  getMessagesForRequest(sessionId: string): Array<{ role: string; content: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Trim old sessions
   */
  private trimSessions(): void {
    if (this.sessions.size <= this.config.maxSessions) return;

    const sessions = this.getAllSessions();
    const toRemove = sessions.slice(this.config.maxSessions);

    for (const session of toRemove) {
      this.sessions.delete(session.id);
    }
  }

  /**
   * Export session for persistence
   */
  exportSession(id: string): string | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    return JSON.stringify(session);
  }

  /**
   * Import session from persistence
   */
  importSession(data: string): ChatSession | undefined {
    try {
      const session = JSON.parse(data) as ChatSession;
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);

      for (const message of session.messages) {
        message.timestamp = new Date(message.timestamp);
      }

      this.sessions.set(session.id, session);
      return session;
    } catch {
      return undefined;
    }
  }
}
