'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Session } from '@/types/ide';
import { useLaneStore } from '@/stores/lane-store';
import { useFileStore } from '@/stores/file-store';

interface UseOmegaChatOptions {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  workspacePath?: string;
  openTabs?: string[];
  isDesktop?: boolean;
  osPlatform?: string;
}

function serializeFileTree(): string {
  try {
    const { fileTree } = useFileStore.getState();
    if (!fileTree || fileTree.length === 0) return '';
    const lines: string[] = [];
    const walk = (nodes: typeof fileTree, depth = 0) => {
      for (const node of nodes) {
        lines.push(`${'  '.repeat(depth)}${node.type === 'folder' ? `${node.name}/` : node.name}`);
        if (node.children && depth < 3) walk(node.children, depth + 1);
      }
    };
    walk(fileTree);
    return lines.slice(0, 250).join('\n');
  } catch {
    return '';
  }
}

export function useOmegaChat({
  sessions,
  setSessions,
  activeSessionId,
  workspacePath,
  openTabs,
  isDesktop,
  osPlatform,
}: UseOmegaChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);
  const { setParallelMode, setOrchestrating, addEvent, clearLanes } = useLaneStore.getState();

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
    const messageId = `omega-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: ChatMessage = { role: 'user', content: goal, time: 'just now' };
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Titan Omega Protocol -- bootstrapping architect and project autopsy...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-omega-protocol',
    };

    setSessions((prev) => prev.map((s) => (
      s.id === sessionId ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] } : s
    )));

    setIsRunning(true);
    setParallelMode(true);
    setOrchestrating(true);
    clearLanes();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/titan/omega', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          goal,
          sessionId,
          workspacePath: workspacePath || '',
          fileTree: serializeFileTree(),
          openTabs: openTabs || [],
          isDesktop: isDesktop || false,
          osPlatform: osPlatform || 'unknown',
        }),
      });
      if (!response.ok || !response.body) throw new Error(`Omega request failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const statusLines: string[] = [];

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
            addEvent({
              type: eventType,
              timestamp: Date.now(),
              manifest_id: String(payload.manifestId || payload.manifest_id || sessionId),
              lane_id: undefined,
              data: payload,
            });

            if (eventType === 'orchestration_result') {
              const summary = String(payload.summary || '');
              const success = payload.success !== false;
              const verified = payload.workOrdersVerified ?? '?';
              const total = payload.workOrdersTotal ?? '?';
              const header = `**Titan Omega Protocol** — ${success ? 'Complete' : 'Finished with failures'} · ${verified}/${total} work orders verified`;
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: summary ? `${header}\n\n${summary}` : `${header}\n\n${statusLines.join('\n')}`,
                streaming: false,
              }));
            } else if (eventType === 'orchestration_error') {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: `**Titan Omega Protocol — Error**\n\n${String(payload.message || 'Unknown error')}`,
                streaming: false,
                isError: true,
              }));
            } else {
              const line = formatOmegaEventLine(eventType, payload);
              if (line) {
                statusLines.push(line);
                if (statusLines.length > 28) statusLines.shift();
                updateMessage(sessionId, messageId, (m) => ({
                  ...m,
                  content: `**Titan Omega Protocol**\n\n${statusLines.join('\n')}`,
                  streaming: true,
                }));
              }
            }
          } catch {
            // Ignore malformed chunks.
          }
        }
      }

      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        content: m.content || 'Titan Omega Protocol completed.',
        streaming: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        content: `Titan Omega Protocol error: ${message}`,
        streaming: false,
        isError: true,
      }));
    } finally {
      setIsRunning(false);
      setOrchestrating(false);
      abortControllerRef.current = null;
    }
  }, [
    chatInput,
    activeSessionId,
    workspacePath,
    openTabs,
    isDesktop,
    osPlatform,
    setSessions,
    setParallelMode,
    setOrchestrating,
    clearLanes,
    addEvent,
    updateMessage,
  ]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setOrchestrating(false);
  }, [setOrchestrating]);

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

function formatOmegaEventLine(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'autopsy_complete':
      return `- Autopsy complete (${String(payload.projectType || 'unknown')} project)`;
    case 'blueprint_complete':
      return `- Blueprint complete: ${String(payload.workOrderCount || 0)} work orders`;
    case 'scaffolding_complete':
      return `- Scaffolding complete for ${String(payload.scaffolded || 0)} nodes`;
    case 'specialist_dispatched':
      return `- Specialist dispatched: ${String(payload.workOrderId)} (${String(payload.risk)})`;
    case 'verification_pass':
      return `- Verification PASS: ${String(payload.workOrderId)}`;
    case 'verification_fail':
      return `- Verification FAIL: ${String(payload.workOrderId)}`;
    case 'rework_dispatched':
      return `- Rework dispatched: ${String(payload.workOrderId)} (#${String(payload.reworkCount)})`;
    case 'plan_assembled':
      return `- Plan assembled: ${String(payload.steps || 0)} steps`;
    case 'plan_step_executed':
      return `- Step ${String(payload.stepId)}: ${payload.success ? 'OK' : 'FAIL'}`;
    case 'orchestration_complete':
      return `- Complete: ${String(payload.summary || 'done')}`;
    case 'orchestration_error':
      return `- Error: ${String(payload.message || 'unknown')}`;
    default:
      return '';
  }
}
