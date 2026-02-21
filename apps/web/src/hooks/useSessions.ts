'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Session } from '@/types/ide';

const STORAGE_VERSION = 3;
const MAX_PERSISTED_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 50000;

const DEFAULT_SESSION: Session = {
  id: '1',
  name: 'Titan AI Assistant',
  time: 'Now',
  messages: [{ role: 'assistant', content: "Welcome to Titan AI. I'm ready to help you build, debug, and refactor your code. What would you like to work on?" }],
  changedFiles: [],
};

export function useSessions(mounted: boolean) {
  const [sessions, setSessions] = useState<Session[]>([DEFAULT_SESSION]);
  const [activeSessionId, setActiveSessionId] = useState('1');

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  // Persist to localStorage
  useEffect(() => {
    if (!mounted) return;
    const state = {
      version: STORAGE_VERSION,
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        time: s.time,
        messages: s.messages.slice(-MAX_PERSISTED_MESSAGES).map(m => ({
          ...m,
          content: m.content.length > MAX_MESSAGE_LENGTH ? m.content.slice(0, MAX_MESSAGE_LENGTH) + '\n\n…(truncated)' : m.content,
          thinking: undefined,
          streaming: false,
        })),
        changedFiles: [],
      })),
      activeSessionId,
    };
    try {
      localStorage.setItem('titan-sessions', JSON.stringify(state));
    } catch {
      try {
        state.sessions = state.sessions.map(s => ({ ...s, messages: s.messages.slice(-10) }));
        localStorage.setItem('titan-sessions', JSON.stringify(state));
      } catch {
        localStorage.removeItem('titan-sessions');
      }
    }
  }, [mounted, sessions, activeSessionId]);

  // Restore from localStorage
  useEffect(() => {
    if (!mounted) return;
    try {
      const saved = localStorage.getItem('titan-sessions');
      if (saved) {
        const state = JSON.parse(saved);
        if (!state.version || state.version < STORAGE_VERSION) {
          localStorage.removeItem('titan-sessions');
          return;
        }
        if (state.sessions?.length > 0) setSessions(state.sessions);
        if (state.activeSessionId) setActiveSessionId(state.activeSessionId);
      }
    } catch (e) {
      console.error('Failed to restore sessions:', e);
    }
  }, [mounted]);

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
    setSessions(prev => {
      const remaining = prev.filter(s => s.id !== id);
      if (remaining.length === 0) return prev;
      return remaining;
    });
    setActiveSessionId(prev => {
      const remaining = sessions.filter(s => s.id !== id);
      if (prev === id && remaining.length > 0) return remaining[0].id;
      return prev;
    });
  }, [sessions]);

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
