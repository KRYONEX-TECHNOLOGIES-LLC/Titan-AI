'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Session } from '@/types/ide';

const STORAGE_VERSION = 4;
const MAX_PERSISTED_MESSAGES = 80;
const MAX_MESSAGE_LENGTH = 80000;

const DEFAULT_SESSION: Session = {
  id: '1',
  name: 'Titan AI Assistant',
  time: 'Now',
  messages: [{ role: 'assistant', content: "Welcome to Titan AI. I'm ready to help you build, debug, and refactor your code. What would you like to work on?" }],
  changedFiles: [],
};

function hashPath(path: string): string {
  if (!path) return 'global';
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function storageKey(workspacePath: string | undefined): string {
  if (!workspacePath) return 'titan-sessions';
  return `titan-sessions-${hashPath(workspacePath)}`;
}

const MEMORY_PREFIX_PATTERNS = [
  /^=== TITAN PERSISTENT MEMORY ===[\s\S]*?(?:=== END MEMORY ===\s*)/,
  /^=== PROJECT DIRECTORY \(auto-indexed\) ===[\s\S]*?\n\n/,
  /^\[Active Design Template\][\s\S]*?\n\n/,
  /^\[Architectural Memory\][\s\S]*?\n\n/,
  /^Recently modified:[\s\S]*?\n\n/,
  /^\[RECENT CONVERSATION SUMMARIES\][\s\S]*?\n\n/,
  /^\[CORE FACTS\][\s\S]*?\n\n/,
];

function stripMemoryPrefix(content: string): string {
  if (!content) return content;
  let cleaned = content;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of MEMORY_PREFIX_PATTERNS) {
      const before = cleaned;
      cleaned = cleaned.replace(pattern, '');
      if (cleaned !== before) changed = true;
    }
  }
  return cleaned.trimStart();
}

function sanitizeMessages(messages: any[]): any[] {
  return messages.map(m => {
    if (m.role === 'user' && m.content) {
      return { ...m, content: stripMemoryPrefix(m.content) };
    }
    return m;
  });
}

export function useSessions(mounted: boolean, workspacePath?: string) {
  const [sessions, setSessions] = useState<Session[]>([DEFAULT_SESSION]);
  const [activeSessionId, setActiveSessionId] = useState('1');
  const prevWorkspaceRef = useRef<string | undefined>(workspacePath);

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  const saveToStorage = useCallback((key: string, sessionsData: Session[], activeId: string) => {
    const state = {
      version: STORAGE_VERSION,
      sessions: sessionsData.map(s => ({
        id: s.id,
        name: s.name,
        time: s.time,
        messages: (s.messages || []).slice(-MAX_PERSISTED_MESSAGES).map(m => ({
          ...m,
          content: (m.content || '').length > MAX_MESSAGE_LENGTH ? (m.content || '').slice(0, MAX_MESSAGE_LENGTH) + '\n\n…(truncated)' : (m.content || ''),
          thinking: undefined,
          streaming: false,
        })),
        changedFiles: [],
      })),
      activeSessionId: activeId,
    };
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      try {
        state.sessions = state.sessions.map(s => ({ ...s, messages: s.messages.slice(-10) }));
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        localStorage.removeItem(key);
      }
    }
  }, []);

  const loadFromStorage = useCallback((key: string): { sessions: Session[]; activeId: string } | null => {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return null;

      const state = JSON.parse(saved);

      if (state.version === 3) {
        if (state.sessions?.length > 0) {
          const cleaned = state.sessions.map((s: any) => ({
            ...s,
            messages: sanitizeMessages(Array.isArray(s.messages) ? s.messages : []),
            changedFiles: Array.isArray(s.changedFiles) ? s.changedFiles : [],
          }));
          return { sessions: cleaned, activeId: state.activeSessionId };
        }
        return null;
      }

      if (!state.version || state.version < STORAGE_VERSION) {
        localStorage.removeItem(key);
        return null;
      }

      if (state.sessions?.length > 0) {
        const sanitized = state.sessions.map((s: any) => ({
          ...s,
          messages: Array.isArray(s.messages) ? s.messages : [],
          changedFiles: Array.isArray(s.changedFiles) ? s.changedFiles : [],
        }));
        return { sessions: sanitized, activeId: state.activeSessionId };
      }
    } catch (e) {
      console.error('Failed to restore sessions:', e);
    }
    return null;
  }, []);

  // Also try migrating old global `titan-sessions` when loading a workspace-scoped key
  const migrateOldGlobalKey = useCallback(() => {
    try {
      const oldSaved = localStorage.getItem('titan-sessions');
      if (!oldSaved) return;
      const oldState = JSON.parse(oldSaved);
      if (oldState.version === 3 && oldState.sessions?.length > 0) {
        const cleaned = oldState.sessions.map((s: any) => ({
          ...s,
          messages: sanitizeMessages(Array.isArray(s.messages) ? s.messages : []),
          changedFiles: Array.isArray(s.changedFiles) ? s.changedFiles : [],
        }));
        oldState.sessions = cleaned;
        oldState.version = STORAGE_VERSION;
        localStorage.setItem('titan-sessions', JSON.stringify(oldState));
      }
    } catch { /* best-effort */ }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!mounted) return;
    saveToStorage(storageKey(workspacePath), sessions, activeSessionId);
  }, [mounted, sessions, activeSessionId, workspacePath, saveToStorage]);

  // Restore from localStorage on mount
  useEffect(() => {
    if (!mounted) return;
    migrateOldGlobalKey();
    const key = storageKey(workspacePath);
    const loaded = loadFromStorage(key);
    if (loaded) {
      setSessions(loaded.sessions);
      const sessionExists = loaded.sessions.some((s: Session) => s.id === loaded.activeId);
      setActiveSessionId(sessionExists ? loaded.activeId : loaded.sessions[0].id);
    }
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // When workspace changes, save current sessions under old key, load new workspace sessions
  useEffect(() => {
    if (!mounted) return;
    const prev = prevWorkspaceRef.current;
    if (prev === workspacePath) return;

    if (prev !== undefined) {
      saveToStorage(storageKey(prev), sessions, activeSessionId);
    }

    prevWorkspaceRef.current = workspacePath;
    const key = storageKey(workspacePath);
    const loaded = loadFromStorage(key);
    if (loaded) {
      setSessions(loaded.sessions);
      const sessionExists = loaded.sessions.some((s: Session) => s.id === loaded.activeId);
      setActiveSessionId(sessionExists ? loaded.activeId : loaded.sessions[0].id);
    } else {
      setSessions([{ ...DEFAULT_SESSION }]);
      setActiveSessionId('1');
    }
  }, [workspacePath, mounted, saveToStorage, loadFromStorage, sessions, activeSessionId]);

  const handleNewAgent = useCallback(async (activeModel: string) => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Session', model: activeModel }),
      });
      const data = await response.json();
      if (data.success && data.session) {
        const newSession: Session = {
          id: data.session.id,
          name: data.session.name,
          time: 'Now',
          messages: data.session.messages.map((m: { role: string; content: string }) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          changedFiles: [],
        };
        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(data.session.id);
      }
    } catch {
      const newId = `agent-${Date.now()}-${crypto.randomUUID?.()?.slice(0, 8) || Math.random().toString(36).slice(2, 10)}`;
      const newSession: Session = {
        id: newId,
        name: 'New Session',
        time: 'Now',
        messages: [{ role: 'assistant', content: 'New session started. Your changes will be isolated until you click Apply. How can I help you?' }],
        changedFiles: [],
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
    }
  }, []);

  const handleRenameSession = useCallback((id: string, name: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  const handleDeleteSession = useCallback((id: string) => {
    const remainingSessions = sessions.filter(s => s.id !== id);
    if (remainingSessions.length === 0) {
      return;
    }

    setSessions(remainingSessions);

    if (activeSessionId === id) {
      setActiveSessionId(remainingSessions[0].id);
    }
  }, [sessions, activeSessionId]);

  return {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    currentSession,
    handleNewAgent,
    handleRenameSession,
    handleDeleteSession,
  };
}
