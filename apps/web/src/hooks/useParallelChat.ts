'use client';

/**
 * Titan Protocol v2 — useParallelChat Hook
 *
 * Replaces useChat when Titan Protocol v2 (Parallel) mode is active.
 * Instead of a sequential tool-calling loop, this hook sends the user's
 * goal to /api/titan/orchestrate and consumes the SSE event stream,
 * updating both the lane store and the chat messages in real-time.
 */

import { useState, useRef, useCallback } from 'react';
import type { Session, ChatMessage } from '@/types/ide';
import { useLaneStore } from '@/stores/lane-store';
import { useFileStore } from '@/stores/file-store';
import { isElectron, electronAPI } from '@/lib/electron';

interface UseParallelChatOptions {
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  activeTab: string;
  fileContents: Record<string, string>;
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
    function walk(nodes: typeof fileTree, depth = 0) {
      for (const n of nodes) {
        const indent = '  '.repeat(depth);
        lines.push(`${indent}${n.type === 'folder' ? n.name + '/' : n.name}`);
        if (n.children && depth < 3) walk(n.children, depth + 1);
      }
    }
    walk(fileTree);
    return lines.slice(0, 200).join('\n');
  } catch { return ''; }
}

async function fetchGitBranch(workspacePath?: string): Promise<string> {
  try {
    const wsPath = workspacePath || useFileStore.getState().workspacePath || '';
    if (isElectron && electronAPI && wsPath) {
      const status = await electronAPI.git.status(wsPath);
      return status.current || 'main';
    }
    return 'main';
  } catch { return 'main'; }
}

export function useParallelChat({
  sessions,
  setSessions,
  activeSessionId,
  activeTab,
  fileContents,
  workspacePath,
  openTabs,
  isDesktop,
  osPlatform,
}: UseParallelChatOptions) {
  const [chatInput, setChatInput] = useState('');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);

  const {
    setParallelMode,
    setOrchestrating: setStoreOrchestrating,
    setActiveManifest,
    updateLane,
    updateLaneStatus,
    addEvent,
    subscribeToManifest,
    unsubscribeFromManifest,
    clearLanes,
  } = useLaneStore.getState();

  const updateMessage = useCallback((
    sessionId: string,
    messageId: string,
    updater: (msg: ChatMessage) => ChatMessage
  ) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, messages: (s.messages || []).map(m => m.id === messageId ? updater(m) : m) };
    }));
  }, [setSessions]);

  const handleSend = useCallback(async () => {
    if (!chatInput.trim()) return;
    const goal = chatInput.trim();
    setChatInput('');
    abortedRef.current = false;

    const sessionId = activeSessionId;
    const messageId = `parallel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const userMessage: ChatMessage = {
      role: 'user',
      content: goal,
      time: 'just now',
    };

    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Titan Protocol v2 (Parallel) -- Decomposing goal into parallel lanes...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-protocol-v2',
      toolCalls: [],
      codeDiffs: [],
    };

    setSessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] }
        : s
    ));

    setIsOrchestrating(true);
    setStoreOrchestrating(true);
    setParallelMode(true);
    clearLanes();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const gitBranch = await fetchGitBranch(workspacePath);
      const fileTree = serializeFileTree();
      const wsPath = workspacePath || useFileStore.getState().workspacePath || '';

      const response = await fetch('/api/titan/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          goal,
          sessionId,
          workspacePath: wsPath,
          fileTree,
          openTabs: openTabs || [],
          gitBranch,
          isDesktop: isDesktop || false,
          osPlatform: osPlatform || 'unknown',
        }),
      });

      if (!response.ok) {
        throw new Error(`Orchestration request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let manifestId = '';
      let laneCount = 0;
      let mergedCount = 0;
      let statusMessages: string[] = [];

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
            const payload = JSON.parse(data);

            switch (eventType) {
              case 'orchestration_start': {
                updateMessage(sessionId, messageId, (m) => ({
                  ...m,
                  content: `**Titan Protocol v2** -- Supervisor is decomposing the goal into parallel lanes...\n\nGoal: ${goal}`,
                  streaming: true,
                }));
                break;
              }

              case 'lane_event': {
                addEvent(payload);

                if (payload.type === 'manifest_created') {
                  manifestId = payload.manifest_id;
                  const nodeCount = payload.data?.nodeCount || 0;
                  subscribeToManifest(manifestId);
                  statusMessages.push(`Manifest created with ${nodeCount} subtasks`);
                  updateMessage(sessionId, messageId, (m) => ({
                    ...m,
                    content: `**Titan Protocol v2** -- Task Manifest created with **${nodeCount}** parallel subtasks.\n\n${statusMessages.join('\n')}`,
                  }));
                }

                if (payload.type === 'lane_created' && payload.lane_id) {
                  laneCount++;
                  const title = payload.data?.title || 'Lane';
                  statusMessages.push(`Lane ${laneCount}: ${title} -- created`);
                  updateLane({
                    lane_id: payload.lane_id,
                    task_manifest_id: payload.manifest_id,
                    subtask_node_id: payload.data?.subtaskNodeId || '',
                    status: 'QUEUED',
                    title,
                    worker_model_id: payload.data?.workerModelId || '',
                    verifier_model_id: payload.data?.verifierModelId || '',
                    files_touched: [],
                    failure_count: 0,
                    created_at: payload.timestamp,
                    updated_at: payload.timestamp,
                    elapsedMs: 0,
                    totalCost: 0,
                  });
                }

                if (payload.type === 'lane_status_changed' && payload.lane_id) {
                  const to = payload.data?.to;
                  const from = payload.data?.from;
                  if (to) {
                    updateLaneStatus(payload.lane_id, to);
                    const shortId = payload.lane_id.slice(-8);

                    if (to === 'WORKING') {
                      statusMessages.push(`Lane ...${shortId}: Worker executing`);
                    } else if (to === 'PENDING_VERIFY') {
                      statusMessages.push(`Lane ...${shortId}: Worker complete, sent to Verifier`);
                    } else if (to === 'VERIFIED') {
                      statusMessages.push(`Lane ...${shortId}: **VERIFIED** by Ruthless Verifier`);
                    } else if (to === 'REJECTED') {
                      statusMessages.push(`Lane ...${shortId}: **REJECTED** -- ${payload.data?.reason || 'see findings'}`);
                    } else if (to === 'MERGED') {
                      mergedCount++;
                      statusMessages.push(`Lane ...${shortId}: **MERGED** (${mergedCount}/${laneCount})`);
                    } else if (to === 'FAILED') {
                      statusMessages.push(`Lane ...${shortId}: **FAILED** -- ${payload.data?.reason || 'unknown'}`);
                    } else if (to === 'MERGE_CONFLICT') {
                      statusMessages.push(`Lane ...${shortId}: **CONFLICT** detected`);
                    }

                    // Keep last 30 status messages
                    if (statusMessages.length > 30) {
                      statusMessages = statusMessages.slice(-30);
                    }

                    updateMessage(sessionId, messageId, (m) => ({
                      ...m,
                      content: `**Titan Protocol v2** -- ${mergedCount}/${laneCount} lanes merged\n\n${statusMessages.slice(-15).join('\n')}`,
                      streaming: true,
                    }));
                  }
                }

                if (payload.type === 'escalation') {
                  statusMessages.push(`**ESCALATION**: Lane ${payload.lane_id?.slice(-8)} reached max failures. ${payload.data?.reason || ''}`);
                }

                break;
              }

              case 'orchestration_complete': {
                const { success, lanesTotal, lanesMerged, lanesFailed, totalDurationMs, totalCost, output } = payload;
                const durationSec = Math.round((totalDurationMs as number || 0) / 1000);
                const cost = Number(totalCost || 0);
                const codeOutput = String(output || '');

                updateMessage(sessionId, messageId, (m) => ({
                  ...m,
                  content: [
                    `**Titan Protocol v2 — ${success ? 'Complete' : 'Finished with Failures'}**`,
                    '',
                    `**Result:** ${success ? 'All lanes merged successfully' : `${lanesFailed} lane(s) failed`}`,
                    `**Lanes:** ${lanesMerged}/${lanesTotal} merged · ${durationSec}s · $${cost.toFixed(5)}`,
                    '',
                    ...(codeOutput
                      ? [codeOutput]
                      : [
                          success
                            ? 'All changes have been written to your workspace. Check the file explorer to see the new/modified files.'
                            : 'Some lanes failed verification. Check the lane panel on the right for details.',
                        ]),
                  ].join('\n'),
                  streaming: false,
                }));
                break;
              }

              case 'orchestration_error': {
                updateMessage(sessionId, messageId, (m) => ({
                  ...m,
                  content: `**Titan Protocol v2 -- Error**\n\n${payload.message}`,
                  streaming: false,
                  isError: true,
                }));
                break;
              }
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateMessage(sessionId, messageId, (m) => ({
          ...m,
          content: (m.content || '') + '\n\n**Orchestration stopped by user.**',
          streaming: false,
        }));
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateMessage(sessionId, messageId, (m) => ({
        ...m,
        content: `**Titan Protocol v2 -- Error:** ${errorMessage}`,
        streaming: false,
        isError: true,
      }));
    } finally {
      setIsOrchestrating(false);
      setStoreOrchestrating(false);
      abortControllerRef.current = null;
    }
  }, [
    chatInput, activeSessionId, setSessions, updateMessage, workspacePath,
    openTabs, isDesktop, osPlatform, setParallelMode, setStoreOrchestrating,
    setActiveManifest, updateLane, updateLaneStatus, addEvent,
    subscribeToManifest, unsubscribeFromManifest, clearLanes,
  ]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsOrchestrating(false);
    setStoreOrchestrating(false);
    unsubscribeFromManifest();

    setSessions(prev => prev.map(s => ({
      ...s,
      messages: (s.messages || []).map(m =>
        m.streaming ? { ...m, streaming: false, content: (m.content || '') + '\n\n**Stopped.**' } : m
      ),
    })));
  }, [setSessions, setStoreOrchestrating, unsubscribeFromManifest]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    chatInput,
    setChatInput,
    isThinking: false,
    isStreaming: isOrchestrating,
    handleSend,
    handleStop,
    handleKeyDown,
  };
}
