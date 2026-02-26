'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Session } from '@/types/ide';
import { useLaneStore } from '@/stores/lane-store';
import { useFileStore } from '@/stores/file-store';
import { useTitanMemory } from '@/stores/titan-memory';

interface UsePhoenixChatOptions {
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

export function usePhoenixChat({
  sessions,
  setSessions,
  activeSessionId,
  workspacePath,
  openTabs,
  isDesktop,
  osPlatform,
}: UsePhoenixChatOptions) {
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
    const messageId = `phoenix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: ChatMessage = { role: 'user', content: goal, time: 'just now' };
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Phoenix Protocol -- igniting multi-model orchestration...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-phoenix-protocol',
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
      const memoryContext = useTitanMemory.getState().serialize(2000);
      const enrichedGoal = memoryContext ? `${memoryContext}\n\n---\nUser Request: ${goal}` : goal;

      const response = await fetch('/api/titan/phoenix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          goal: enrichedGoal,
          sessionId,
          workspacePath: workspacePath || '',
          fileTree: serializeFileTree(),
          openTabs: openTabs || [],
          isDesktop: isDesktop || false,
          osPlatform: osPlatform || 'unknown',
        }),
      });
      if (!response.ok || !response.body) throw new Error(`Phoenix request failed (${response.status})`);

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
              manifest_id: String(payload.planId || payload.sessionId || sessionId),
              lane_id: payload.subtaskId ? `lane-${String(payload.subtaskId)}` : undefined,
              data: payload,
            });

            if (eventType === 'worker_dispatched' && payload.subtaskId) {
              const laneId = `lane-${String(payload.subtaskId)}`;
              updateLane({
                lane_id: laneId,
                task_manifest_id: String(payload.planId || sessionId),
                subtask_node_id: String(payload.subtaskId),
                status: 'ASSIGNED',
                title: String(payload.subtaskId),
                worker_model_id: String(payload.model || ''),
                verifier_model_id: 'deepseek/deepseek-v3.2',
                files_touched: [],
                failure_count: 0,
                created_at: Date.now(),
                updated_at: Date.now(),
                elapsedMs: 0,
                totalCost: 0,
              });
            }
            if (eventType === 'worker_complete' && payload.subtaskId) {
              updateLaneStatus(`lane-${String(payload.subtaskId)}`, 'WORKING');
            }
            if (eventType === 'verification_result' && payload.subtaskId) {
              updateLaneStatus(`lane-${String(payload.subtaskId)}`, payload.pass ? 'MERGED' : 'FAILED');
            }
            if (eventType === 'subtask_complete' && payload.subtaskId) {
              updateLaneStatus(`lane-${String(payload.subtaskId)}`, 'MERGED');
            }

            if (eventType === 'phoenix_result') {
              const output = String(payload.output || '');
              const cost = Number(payload.cost || 0);
              const elapsed = Number(payload.elapsedMs || 0);
              const pipeline = String(payload.pipeline || 'unknown');
              const success = payload.success !== false;
              const statusIcon = success ? '✅' : '⚠️';
              const header = `${statusIcon} **Phoenix Protocol** — ${success ? 'Complete' : 'Partial'} · \`${pipeline}\` pipeline · ⏱ ${(elapsed / 1000).toFixed(1)}s · 💰 $${cost.toFixed(5)}`;
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: output ? `${header}\n\n${output}` : `${header}\n\n${statusLines.join('\n')}`,
                streaming: false,
              }));
              try { useTitanMemory.getState().extractAndStore(goal, output); } catch { /* best-effort */ }
            } else {
              const line = formatPhoenixEvent(eventType, payload);
              if (line) {
                statusLines.push(line);
                if (statusLines.length > 30) statusLines.shift();
                updateMessage(sessionId, messageId, (m) => ({
                  ...m,
                  content: `**Phoenix Protocol**\n\n${statusLines.join('\n')}`,
                  streaming: true,
                }));
              }
            }
          } catch {
            // ignore malformed payloads
          }
        }
      }

      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        content: m.content || 'Phoenix Protocol completed.',
        streaming: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message !== 'The user aborted a request.') {
        updateMessage(sessionId, messageId, (m) => ({
          ...m,
          content: `Phoenix Protocol error: ${message}`,
          streaming: false,
          isError: true,
        }));
      }
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

function formatPhoenixEvent(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case 'phoenix_start':
      return '🔥 Protocol ignited — scanning complexity…';
    case 'complexity_routed':
      return `🔍 Complexity **${payload.complexity}/10** → \`${String(payload.pipeline).toUpperCase()}\` pipeline`;
    case 'plan_created':
      return payload.subtaskCount
        ? `📋 Architect decomposed into **${payload.subtaskCount}** subtasks`
        : `📋 Planning (\`${payload.pipeline}\` pipeline)…`;
    case 'subtask_started':
      return `\n### 🔄 Phase: ${String(payload.title || payload.subtaskId)}`;
    case 'worker_dispatched':
      return `- 🔄 **${String(payload.role)}** dispatched on \`${String(payload.model)}\``;
    case 'worker_complete':
      return `- ✅ **${String(payload.role)}** completed \`${String(payload.subtaskId)}\``;
    case 'verification_started':
      return `- 🔍 Verifier checking \`${String(payload.subtaskId)}\`…`;
    case 'verification_result': {
      const icon = payload.pass ? '✅' : '❌';
      const label = payload.pass ? '**PASS**' : '**FAIL**';
      const strikes = payload.strikes ? ` — ${payload.strikes} strike${Number(payload.strikes) > 1 ? 's' : ''}` : '';
      return `- ${icon} Verification ${label}${strikes}`;
    }
    case 'strike_triggered':
      return `- ⚠️ Strike ${payload.strike} — escalating to **${String(payload.role)}**`;
    case 'consensus_started':
      return '- 🔍 Consensus voting initiated (3 models)';
    case 'consensus_result':
      return payload.pass
        ? `- ✅ Consensus **RESOLVED** (${payload.votes} votes)`
        : `- ❌ Consensus **DEADLOCK** (${payload.votes} votes)`;
    case 'judge_started':
      return `- 🔍 Judge reviewing \`${String(payload.subtaskId)}\`…`;
    case 'judge_result':
      return payload.pass
        ? '- ✅ Judge: **APPROVED**'
        : '- ❌ Judge: **REJECTED**';
    case 'subtask_complete':
      return `- ✅ Subtask \`${String(payload.subtaskId)}\` **complete**`;
    case 'subtask_failed':
      return `- ❌ Subtask \`${String(payload.subtaskId)}\` **failed**`;
    case 'cost_update':
      return `💰 Cost so far: **$${Number(payload.totalCost || 0).toFixed(6)}**`;
    case 'phoenix_complete': {
      const status = payload.success ? '✅' : '⚠️';
      const pipeline = String(payload.pipeline);
      const elapsed = (Number(payload.elapsedMs || 0) / 1000).toFixed(1);
      const cost = Number(payload.cost || 0).toFixed(6);
      return `\n---\n${status} **Phoenix Complete** · \`${pipeline}\` pipeline · ⏱ ${elapsed}s · 💰 $${cost}`;
    }
    case 'phoenix_error':
      return `\n❌ **Error:** ${String(payload.message || 'unknown')}`;
    default:
      return '';
  }
}
