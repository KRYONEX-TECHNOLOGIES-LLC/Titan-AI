'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Session } from '@/types/ide';
import { useFileStore } from '@/stores/file-store';
import { usePlanStore } from '@/stores/plan-store';

interface UseSniperChatOptions {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  workspacePath?: string;
  openTabs?: string[];
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

export function useSniperChat({
  sessions,
  setSessions,
  activeSessionId,
  workspacePath,
  openTabs,
}: UseSniperChatOptions) {
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

    const planStore = usePlanStore.getState();
    const { setChatMode } = planStore;
    setChatMode('plan');

    const sessionId = activeSessionId;
    const messageId = `sniper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: ChatMessage = { role: 'user', content: goal, time: 'just now' };
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Plan Sniper -- 7-role model orchestra activating...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-plan-sniper',
    };

    setSessions((prev) => prev.map((s) => (
      s.id === sessionId ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] } : s
    )));

    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const tasks = Object.values(planStore.tasks).filter(t => t.parentId === null);
    const taskList = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      phase: t.phase,
      priority: t.priority,
      tags: t.tags,
      blockedBy: t.blockedBy,
    }));

    try {
      const response = await fetch('/api/titan/sniper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          goal,
          tasks: taskList.length > 0 ? taskList : [{ id: 'auto-1', title: goal, description: goal, phase: 1, priority: 'high', tags: [], blockedBy: [] }],
          workspacePath: workspacePath || '',
          fileTree: serializeFileTree(),
          openFiles: openTabs || [],
        }),
      });

      if (!response.ok || !response.body) throw new Error(`Plan Sniper request failed (${response.status})`);

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

            if (eventType === 'scan_start') {
              statusLines.push('SCANNER: Reading codebase...');
            }
            if (eventType === 'scan_complete') {
              statusLines.push(`SCANNER: Found ${payload.keyFilesCount} key files, ${payload.conventionsCount} conventions`);
            }
            if (eventType === 'dag_created') {
              statusLines.push(`ARCHITECT: Created DAG with ${payload.nodeCount} tasks (${payload.parallelizable} parallelizable)`);
            }
            if (eventType === 'lane_start') {
              statusLines.push(`CODER: Starting "${payload.title}" (${payload.taskType}, ${payload.risk} risk)`);
            }
            if (eventType === 'lane_status') {
              const status = String(payload.status);
              if (status === 'VERIFYING') statusLines.push('SENTINEL: Verifying...');
              if (status === 'EXECUTING') statusLines.push('EXECUTOR: Applying changes...');
            }
            if (eventType === 'lane_verified') {
              statusLines.push(`SENTINEL: PASS (${payload.criteriaMetCount}/${payload.criteriaTotalCount} criteria met)`);
            }
            if (eventType === 'lane_failed') {
              const issues = Array.isArray(payload.issues) ? payload.issues : [];
              statusLines.push(`SENTINEL: FAIL -- ${issues.slice(0, 2).join('; ')}`);
            }
            if (eventType === 'lane_rework') {
              statusLines.push(`CODER: Reworking (attempt ${payload.attempt})...`);
            }
            if (eventType === 'task_status') {
              const { taskId, status } = payload as { taskId: string; status: string };
              if (status === 'completed') {
                planStore.updateTask(String(taskId), { status: 'completed' });
              } else if (status === 'failed') {
                planStore.updateTask(String(taskId), { status: 'failed' });
              } else if (status === 'in_progress') {
                planStore.updateTask(String(taskId), { status: 'in_progress' });
              }
            }
            if (eventType === 'judge_start') {
              statusLines.push('JUDGE: Reviewing complete project...');
            }
            if (eventType === 'judge_complete') {
              statusLines.push(`JUDGE: Score ${payload.score}/10 | ${payload.pass ? 'PASS' : 'NEEDS WORK'}`);
              if (Array.isArray(payload.checklistUpdates)) {
                for (const update of payload.checklistUpdates as Array<{ id: string; checked: boolean; notes: string }>) {
                  planStore.toggleChecklistItem(update.id);
                  if (update.notes) planStore.updateChecklistNotes(update.id, update.notes);
                }
              }
            }

            if (eventType === 'sniper_result') {
              const summary = String(payload.summary || '');
              const cost = Number(payload.totalCost || 0);
              const durationMs = Number(payload.durationMs || 0);
              const success = payload.success !== false;
              const header = `**Plan Sniper** -- ${success ? 'Complete' : 'Partial'} | ${payload.completedNodes}/${payload.totalNodes} tasks | ${(durationMs / 1000).toFixed(1)}s | $${cost.toFixed(4)}`;
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                streaming: false,
                content: `${header}\n\n${summary}`,
                streamingModel: 'titan-plan-sniper',
              }));
            }

            if (eventType === 'sniper_error') {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                streaming: false,
                isError: true,
                content: `Plan Sniper error: ${String(payload.message)}`,
              }));
            }

            const display = statusLines.slice(-15).join('\n');
            updateMessage(sessionId, messageId, (m) => ({
              ...m,
              content: `**Plan Sniper** -- executing...\n\n\`\`\`\n${display}\n\`\`\``,
            }));
          } catch { /* skip malformed SSE */ }
        }
      }

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        updateMessage(sessionId, messageId, (m) => ({
          ...m,
          streaming: false,
          isError: true,
          content: `Plan Sniper failed: ${(err as Error).message}`,
        }));
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [chatInput, activeSessionId, setSessions, updateMessage, workspacePath, openTabs]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    abortControllerRef.current?.abort();
    setIsRunning(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  return {
    chatInput,
    setChatInput,
    isThinking: isRunning,
    isStreaming: isRunning,
    handleSend,
    handleStop,
    handleKeyDown,
  };
}
