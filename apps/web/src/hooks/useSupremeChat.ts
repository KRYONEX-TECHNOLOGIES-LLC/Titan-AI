'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Session } from '@/types/ide';
import { useLaneStore } from '@/stores/lane-store';
import { useFileStore } from '@/stores/file-store';

interface UseSupremeChatOptions {
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
    return lines.slice(0, 200).join('\n');
  } catch {
    return '';
  }
}

export function useSupremeChat({
  sessions,
  setSessions,
  activeSessionId,
  workspacePath,
  openTabs,
  isDesktop,
  osPlatform,
}: UseSupremeChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  const { setParallelMode, setOrchestrating, addEvent, clearLanes, updateLane, updateLaneStatus } = useLaneStore.getState();

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
    const messageId = `supreme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: ChatMessage = { role: 'user', content: goal, time: 'just now' };
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Titan Supreme Protocol -- initializing governance loop...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-supreme-protocol',
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
      const response = await fetch('/api/titan/supreme', {
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
      if (!response.ok || !response.body) throw new Error(`Supreme request failed (${response.status})`);

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
              lane_id: payload.nodeId ? `lane-${String(payload.nodeId)}` : undefined,
              data: payload,
            });

            if (eventType === 'worker_assigned' && payload.nodeId) {
              const laneId = `lane-${String(payload.nodeId)}`;
              updateLane({
                lane_id: laneId,
                task_manifest_id: String(payload.manifestId || sessionId),
                subtask_node_id: String(payload.nodeId),
                status: 'ASSIGNED',
                title: String(payload.nodeId),
                worker_model_id: String(payload.model || ''),
                verifier_model_id: 'claude-opus-4.6',
                files_touched: [],
                failure_count: 0,
                created_at: Date.now(),
                updated_at: Date.now(),
                elapsedMs: 0,
                totalCost: 0,
              });
            }
            if (eventType === 'worker_progress' && payload.nodeId) {
              updateLaneStatus(`lane-${String(payload.nodeId)}`, 'WORKING');
            }
            if (eventType === 'verification_result' && payload.nodeId) {
              updateLaneStatus(`lane-${String(payload.nodeId)}`, payload.success ? 'MERGED' : 'FAILED');
            }

            if (eventType === 'orchestration_result') {
              const summary = String(payload.summary || '');
              const success = payload.success !== false;
              const merged = payload.lanesMerged ?? payload.nodesMerged ?? '?';
              const total = payload.lanesTotal ?? payload.nodesTotal ?? '?';
              const header = `**Titan Supreme Protocol** — ${success ? 'Complete' : 'Finished with failures'} · ${merged}/${total} merged`;
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: summary ? `${header}\n\n${summary}` : `${header}\n\n${statusLines.join('\n')}`,
                streaming: false,
              }));
            } else if (eventType === 'orchestration_error') {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: `**Titan Supreme Protocol — Error**\n\n${String(payload.message || 'Unknown error')}`,
                streaming: false,
                isError: true,
              }));
            } else {
              const line = formatEventLine(eventType, payload);
              if (line) {
                statusLines.push(line);
                if (statusLines.length > 24) statusLines.shift();
                updateMessage(sessionId, messageId, (m) => ({
                  ...m,
                  content: `**Titan Supreme Protocol**\n\n${statusLines.join('\n')}`,
                  streaming: true,
                }));
              }
            }
          } catch {
            // ignore malformed event payloads
          }
        }
      }

      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        content: m.content || 'Titan Supreme Protocol completed.',
        streaming: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        content: `Titan Supreme Protocol error: ${message}`,
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
    updateLane,
    updateLaneStatus,
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

function formatEventLine(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'task_decomposed':
      return `- Decomposed goal into ${String(payload.nodeCount || 0)} tasks`;
    case 'worker_assigned':
      return `- Assigned ${String(payload.nodeId)} to ${String(payload.role)} (${String(payload.model)})`;
    case 'artifact_review':
      return `- Review ${String(payload.nodeId)}: ${payload.pass ? 'PASS' : 'FAIL'}`;
    case 'debate_started':
      return `- Debate started for ${String(payload.nodeId)}`;
    case 'debate_verdict':
      return `- Debate verdict for ${String(payload.nodeId)}: ${String(payload.winner)}`;
    case 'execution_authorized':
      return `- Execution authorized for ${String(payload.nodeId)}`;
    case 'verification_result':
      return `- Verification ${String(payload.nodeId)}: ${payload.success ? 'MERGED' : 'FAILED'}`;
    case 'budget_update':
      return `- Budget remaining: ${String(payload.perRequestRemaining || 0)} tokens`;
    case 'stall_warning':
      return `- Stall warning: ${String(payload.reason || 'threshold reached')}`;
    case 'orchestration_complete':
      return `- Complete: ${String(payload.lanesMerged || 0)}/${String(payload.lanesTotal || 0)} merged`;
    case 'orchestration_error':
      return `- Error: ${String(payload.message || 'unknown')}`;
    default:
      return '';
  }
}
