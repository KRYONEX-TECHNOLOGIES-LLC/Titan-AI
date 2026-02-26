'use client';

/**
 * Titan Chat Protocol Hook
 *
 * Drives the Titan Chat conversational protocol — ultra-cheap, Opus-quality.
 * Simple questions go to THINKER only. Complex questions go THINKER → REFINER.
 */

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Session } from '@/types/ide';
import { useCartographyStore } from '@/stores/cartography-store';
import { useFileStore } from '@/stores/file-store';

function getTitanChatCartographyContext(): string | undefined {
  try {
    const ctx = useCartographyStore.getState().getContextForProtocol(3000);
    return ctx || undefined;
  } catch { return undefined; }
}

interface UseTitanChatOptions {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  workspacePath?: string;
}

export function useTitanChat({
  sessions,
  setSessions,
  activeSessionId,
}: UseTitanChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  const updateMessage = useCallback((
    sessionId: string,
    messageId: string,
    updater: (msg: ChatMessage) => ChatMessage,
  ) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      return { ...s, messages: (s.messages || []).map((m) => (m.id === messageId ? updater(m) : m)) };
    }));
  }, [setSessions]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const goal = chatInput.trim();
    setChatInput('');
    abortedRef.current = false;

    const sessionId = activeSessionId;
    const messageId = `titanchat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const userMessage: ChatMessage = { role: 'user', content: goal, time: 'just now' };
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Titan Chat — thinking...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-chat',
    };

    // Build conversation history from current session for context
    const currentSession = sessions.find(s => s.id === sessionId);
    const history = (currentSession?.messages || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => !m.streaming && m.content)
      .slice(-20)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    setSessions((prev) => prev.map((s) => (
      s.id === sessionId ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] } : s
    )));

    setIsRunning(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/titan/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          goal,
          sessionId,
          history,
          workspacePath: useFileStore.getState().workspacePath || undefined,
          fileTree: useFileStore.getState().fileTree?.map((f: { path: string }) => f.path).join('\n').slice(0, 3000) || undefined,
          cartographyContext: getTitanChatCartographyContext(),
        }),
      });

      if (!response.ok || !response.body) throw new Error(`Titan Chat request failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let pipeline = 'simple';
      let complexity = 0;

      while (true) {
        if (abortedRef.current || controller.signal.aborted) {
          try { reader.cancel(); } catch { /* ignore */ }
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const evt of events) {
          const lines = evt.split('\n');
          let eventType = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;

          try {
            const payload = JSON.parse(data) as Record<string, unknown>;

            if (eventType === 'routing') {
              pipeline = String(payload.pipeline || 'simple');
              complexity = Number(payload.complexity || 0);
              const label = pipeline === 'full'
                ? `Titan Chat — deep mode (complexity ${complexity}/10)...`
                : 'Titan Chat — thinking...';
              updateMessage(sessionId, messageId, (m) => ({ ...m, content: label }));
            }

            if (eventType === 'thinker_start') {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: pipeline === 'full'
                  ? 'Titan Chat — THINKER reasoning deeply...'
                  : 'Titan Chat — thinking...',
              }));
            }

            if (eventType === 'refiner_start') {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: 'Titan Chat — REFINER polishing response...',
              }));
            }

            if (eventType === 'chat_result') {
              const output = String(payload.output || '');
              const cost = Number(payload.cost || 0);
              const elapsed = Number(payload.elapsedMs || 0);
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: output,
                streaming: false,
                streamingModel: `titan-chat (${pipeline} · ${(elapsed / 1000).toFixed(1)}s · $${cost.toFixed(5)})`,
              }));
            }

            if (eventType === 'chat_error') {
              const message = String(payload.message || 'Unknown error');
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: `Titan Chat error: ${message}`,
                streaming: false,
                isError: true,
              }));
            }
          } catch {
            // skip malformed payloads
          }
        }
      }

      // Ensure streaming is off if we exited the loop without a result event
      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        streaming: false,
        content: m.streaming ? (m.content?.includes('thinking') ? 'Titan Chat completed.' : m.content) : m.content,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message !== 'The user aborted a request.') {
        updateMessage(sessionId, messageId, (m) => ({
          ...m,
          content: `Titan Chat error: ${message}`,
          streaming: false,
          isError: true,
        }));
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [chatInput, activeSessionId, sessions, setSessions, updateMessage]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return {
    chatInput,
    setChatInput,
    isThinking: false,
    isStreaming: isRunning,
    handleSend,
    handleStop,
    handleKeyDown,
  };
}
