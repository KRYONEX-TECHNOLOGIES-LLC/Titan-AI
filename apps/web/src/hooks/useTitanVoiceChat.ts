'use client';

import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, Session } from '@/types/ide';
import { useFileStore } from '@/stores/file-store';
import { usePlanStore } from '@/stores/plan-store';
import { useTitanVoice } from '@/stores/titan-voice.store';
import { useTitanMemory } from '@/stores/titan-memory';
import { useCodeDirectory } from '@/stores/code-directory';
import { parseVoiceCommand } from '@/lib/voice/voice-commands';
import { executeVoiceAction } from '@/lib/voice/system-control';
import { recordConversation } from '@/lib/voice/evolution-tracker';
import { saveBrainEntry, saveConversation } from '@/lib/voice/brain-storage';

interface UseTitanVoiceChatOptions {
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

export function useTitanVoiceChat({
  sessions,
  setSessions,
  activeSessionId,
  workspacePath,
  openTabs,
}: UseTitanVoiceChatOptions) {
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
    const userText = chatInput.trim();
    setChatInput('');
    abortedRef.current = false;

    // Check for voice commands first
    const cmdResult = parseVoiceCommand(userText);
    if (cmdResult.matched) {
      const controlResult = await executeVoiceAction(cmdResult.action, cmdResult.params);

      const userMessage: ChatMessage = { role: 'user', content: userText, time: 'just now' };
      const assistantMessage: ChatMessage = {
        id: `voice-cmd-${Date.now()}`,
        role: 'assistant',
        content: controlResult.message,
        time: 'just now',
        streamingModel: 'titan-voice',
      };

      setSessions((prev) => prev.map((s) => (
        s.id === activeSessionId ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] } : s
      )));

      const voiceStore = useTitanVoice.getState();
      if (voiceStore.autoSpeak) {
        voiceStore.speak(controlResult.message);
      }

      return;
    }

    // Normal voice conversation
    const sessionId = activeSessionId;
    const messageId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: ChatMessage = { role: 'user', content: userText, time: 'just now' };
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: 'Titan Voice processing...',
      time: 'just now',
      streaming: true,
      streamingModel: 'titan-voice',
    };

    setSessions((prev) => prev.map((s) => (
      s.id === sessionId ? { ...s, messages: [...(s.messages || []), userMessage, assistantMessage] } : s
    )));

    setIsRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const memoryContext = useTitanMemory.getState().serialize(2000);
      const codeDirectory = useCodeDirectory.getState().serialize(1500);

      const plan = usePlanStore.getState();
      const tasks = Object.values(plan.tasks);
      const projectStatus = tasks.length > 0
        ? `Plan: "${plan.planName || 'Active'}" — ${tasks.filter(t => t.status === 'completed').length}/${tasks.length} done`
        : '';

      const session = sessions.find(s => s.id === sessionId);
      const recentMessages = (session?.messages || [])
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: (m.content || '').slice(0, 1000) }));

      const response = await fetch('/api/titan/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: userText,
          conversationHistory: recentMessages,
          memoryContext,
          codeDirectory,
          projectStatus,
        }),
      });

      if (!response.ok || !response.body) throw new Error(`Voice request failed (${response.status})`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const statusParts: string[] = [];
      let finalContent = '';

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
          let eventType = '';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data) continue;

          try {
            const payload = JSON.parse(data) as Record<string, unknown>;

            if (eventType === 'voice_thinking') {
              statusParts.push('Analyzing...');
            }
            if (eventType === 'voice_roles') {
              const roles = payload.roles as string[];
              statusParts.push(`Roles: ${roles.join(' → ')}`);
            }
            if (eventType === 'voice_scanner') {
              statusParts.push('Code analysis complete');
            }
            if (eventType === 'voice_thinking_done') {
              statusParts.push('Deep reasoning complete');
            }
            if (eventType === 'voice_response') {
              finalContent = String(payload.content || '');
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                streaming: false,
                content: finalContent,
              }));
            }
            if (eventType === 'voice_error') {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                streaming: false,
                isError: true,
                content: `Voice error: ${String(payload.message)}`,
              }));
            }

            if (!finalContent && statusParts.length > 0) {
              updateMessage(sessionId, messageId, (m) => ({
                ...m,
                content: `**Titan Voice** — ${statusParts.join(' | ')}`,
              }));
            }
          } catch { /* skip malformed SSE */ }
        }
      }

      // Auto-speak response
      if (finalContent) {
        const voiceStore = useTitanVoice.getState();
        if (voiceStore.autoSpeak) {
          voiceStore.speak(finalContent);
        }

        // Learning loop: record conversation and extract knowledge
        recordConversation();
        try {
          await saveConversation(
            [...recentMessages, { role: 'user', content: userText }, { role: 'assistant', content: finalContent }],
            `User asked about: ${userText.slice(0, 100)}`,
          );

          const memory = useTitanMemory.getState();
          memory.extractAndStore(userText, finalContent);
        } catch { /* learning is best-effort */ }
      }

    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        updateMessage(sessionId, messageId, (m) => ({
          ...m,
          streaming: false,
          isError: true,
          content: `Voice failed: ${(err as Error).message}`,
        }));
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, [chatInput, activeSessionId, setSessions, updateMessage, sessions]);

  const handleStop = useCallback(() => {
    abortedRef.current = true;
    abortControllerRef.current?.abort();
    setIsRunning(false);
    useTitanVoice.getState().stopSpeaking();
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
    handleKeyDown,
    handleStop,
  };
}
