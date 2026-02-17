/**
 * Session state persistence
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { SessionData } from './types';

export interface SessionConfig {
  storagePath: string;
  autoSave: boolean;
  autoSaveInterval: number;
  maxSessions: number;
}

export class SessionStateManager extends EventEmitter {
  private config: SessionConfig;
  private currentSession: SessionData | null = null;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionConfig> = {}) {
    super();
    this.config = {
      storagePath: config.storagePath ?? '.titan/sessions',
      autoSave: config.autoSave ?? true,
      autoSaveInterval: config.autoSaveInterval ?? 30000, // 30 seconds
      maxSessions: config.maxSessions ?? 10,
    };
  }

  async initialize(workspacePath: string): Promise<void> {
    const absoluteStoragePath = path.join(workspacePath, this.config.storagePath);
    await fs.mkdir(absoluteStoragePath, { recursive: true });

    // Try to restore last session
    const lastSession = await this.getLastSession(workspacePath);
    if (lastSession) {
      this.currentSession = lastSession;
      this.emit('session:restored', lastSession);
    } else {
      // Create new session
      this.currentSession = this.createNewSession(workspacePath);
      this.emit('session:created', this.currentSession);
    }

    // Start auto-save
    if (this.config.autoSave) {
      this.startAutoSave();
    }
  }

  private createNewSession(workspacePath: string): SessionData {
    return {
      id: this.generateSessionId(),
      workspacePath,
      openFiles: [],
      activeFile: undefined,
      cursorPositions: new Map(),
      scrollPositions: new Map(),
      customState: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  async save(): Promise<void> {
    if (!this.currentSession) return;

    this.currentSession.updatedAt = new Date();
    
    const sessionPath = this.getSessionPath(this.currentSession.workspacePath, this.currentSession.id);
    const serialized = this.serializeSession(this.currentSession);
    
    await fs.mkdir(path.dirname(sessionPath), { recursive: true });
    await fs.writeFile(sessionPath, JSON.stringify(serialized, null, 2), 'utf-8');

    this.emit('session:saved', this.currentSession);
  }

  async load(workspacePath: string, sessionId: string): Promise<SessionData | null> {
    const sessionPath = this.getSessionPath(workspacePath, sessionId);
    
    try {
      const content = await fs.readFile(sessionPath, 'utf-8');
      const data = JSON.parse(content);
      return this.deserializeSession(data);
    } catch {
      return null;
    }
  }

  async getLastSession(workspacePath: string): Promise<SessionData | null> {
    const storageDir = path.join(workspacePath, this.config.storagePath);
    
    try {
      const files = await fs.readdir(storageDir);
      const sessionFiles = files
        .filter(f => f.startsWith('session-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (sessionFiles.length === 0) return null;

      const lastSessionPath = path.join(storageDir, sessionFiles[0]);
      const content = await fs.readFile(lastSessionPath, 'utf-8');
      const data = JSON.parse(content);
      return this.deserializeSession(data);
    } catch {
      return null;
    }
  }

  async listSessions(workspacePath: string): Promise<{ id: string; createdAt: Date; updatedAt: Date }[]> {
    const storageDir = path.join(workspacePath, this.config.storagePath);
    
    try {
      const files = await fs.readdir(storageDir);
      const sessions: { id: string; createdAt: Date; updatedAt: Date }[] = [];

      for (const file of files) {
        if (file.startsWith('session-') && file.endsWith('.json')) {
          const sessionPath = path.join(storageDir, file);
          const content = await fs.readFile(sessionPath, 'utf-8');
          const data = JSON.parse(content);
          sessions.push({
            id: data.id,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
          });
        }
      }

      return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch {
      return [];
    }
  }

  async deleteSession(workspacePath: string, sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(workspacePath, sessionId);
    
    try {
      await fs.unlink(sessionPath);
      this.emit('session:deleted', { sessionId });
    } catch {
      // Ignore delete errors
    }
  }

  async cleanupOldSessions(workspacePath: string): Promise<number> {
    const sessions = await this.listSessions(workspacePath);
    const toDelete = sessions.slice(this.config.maxSessions);
    
    for (const session of toDelete) {
      await this.deleteSession(workspacePath, session.id);
    }

    return toDelete.length;
  }

  // State update methods
  setOpenFiles(files: string[]): void {
    if (!this.currentSession) return;
    this.currentSession.openFiles = files;
    this.emit('state:changed', { key: 'openFiles', value: files });
  }

  setActiveFile(file: string | undefined): void {
    if (!this.currentSession) return;
    this.currentSession.activeFile = file;
    this.emit('state:changed', { key: 'activeFile', value: file });
  }

  setCursorPosition(file: string, line: number, column: number): void {
    if (!this.currentSession) return;
    this.currentSession.cursorPositions.set(file, { line, column });
    this.emit('state:changed', { key: 'cursorPosition', file, line, column });
  }

  setScrollPosition(file: string, position: number): void {
    if (!this.currentSession) return;
    this.currentSession.scrollPositions.set(file, position);
    this.emit('state:changed', { key: 'scrollPosition', file, position });
  }

  setCustomState(key: string, value: unknown): void {
    if (!this.currentSession) return;
    this.currentSession.customState[key] = value;
    this.emit('state:changed', { key: `custom:${key}`, value });
  }

  getCustomState<T>(key: string): T | undefined {
    return this.currentSession?.customState[key] as T | undefined;
  }

  getCurrentSession(): SessionData | null {
    return this.currentSession;
  }

  private getSessionPath(workspacePath: string, sessionId: string): string {
    return path.join(workspacePath, this.config.storagePath, `${sessionId}.json`);
  }

  private serializeSession(session: SessionData): Record<string, unknown> {
    return {
      id: session.id,
      workspacePath: session.workspacePath,
      openFiles: session.openFiles,
      activeFile: session.activeFile,
      cursorPositions: Object.fromEntries(session.cursorPositions),
      scrollPositions: Object.fromEntries(session.scrollPositions),
      customState: session.customState,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private deserializeSession(data: Record<string, unknown>): SessionData {
    return {
      id: data.id as string,
      workspacePath: data.workspacePath as string,
      openFiles: data.openFiles as string[],
      activeFile: data.activeFile as string | undefined,
      cursorPositions: new Map(Object.entries(data.cursorPositions as Record<string, { line: number; column: number }>)),
      scrollPositions: new Map(Object.entries(data.scrollPositions as Record<string, number>)),
      customState: data.customState as Record<string, unknown>,
      createdAt: new Date(data.createdAt as string),
      updatedAt: new Date(data.updatedAt as string),
    };
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.save().catch(err => {
        this.emit('error', { message: 'Auto-save failed', error: err });
      });
    }, this.config.autoSaveInterval);
  }

  async dispose(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Final save
    await this.save();
    this.currentSession = null;
    this.emit('disposed');
  }
}

/**
 * Creates a session state manager
 */
export function createSessionStateManager(config?: Partial<SessionConfig>): SessionStateManager {
  return new SessionStateManager(config);
}
