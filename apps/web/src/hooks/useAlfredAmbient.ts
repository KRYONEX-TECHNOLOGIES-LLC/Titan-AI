'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTitanVoice } from '@/stores/titan-voice.store';
import { useTitanMemory } from '@/stores/titan-memory';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { serializeBrainContext, saveConversation } from '@/lib/voice/brain-storage';
import { usePlanStore } from '@/stores/plan-store';
import { useFileStore } from '@/stores/file-store';
import { useAlfredCanvas, type CanvasMode, type Artifact } from '@/stores/alfred-canvas-store';

const YT_DETECT = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/;
const ARTIFACT_DETECT = /\[artifact:\s*(code|html|url|video|simulation)\s*(?:\|([^\]]*))?\]/g;

function resolveToolCanvasMode(toolName: string, args?: Record<string, unknown>): CanvasMode {
  switch (toolName) {
    case 'run_command':
    case 'execute_command':
      return 'terminal';
    case 'create_file':
    case 'edit_file':
    case 'write_file': {
      if (args?.path) {
        const p = String(args.path);
        if (p.endsWith('.html') || p.endsWith('.htm')) return 'simulation';
      }
      return 'code';
    }
    case 'web_search':
    case 'web_browse':
    case 'browser_navigate':
    case 'browse_url':
    case 'research_topic':
    case 'search_web':
      return 'screen';
    case 'list_files':
    case 'read_file':
    case 'list_directory':
      return 'files';
    default:
      return 'screen';
  }
}

const ALFRED_LOG_KEY_PREFIX = 'alfred-conversation-';
const ALFRED_TASKS_KEY = 'alfred-pending-tasks';
const MAX_PERSISTED_MESSAGES = 50;

function getAlfredStorageKey(): string {
  const ws = useFileStore.getState().workspacePath || 'global';
  return `${ALFRED_LOG_KEY_PREFIX}${ws.replace(/[\\/:]/g, '_')}`;
}

function deduplicateLog(log: AlfredMessage[]): AlfredMessage[] {
  if (log.length < 2) return log;
  const result: AlfredMessage[] = [log[0]];
  for (let i = 1; i < log.length; i++) {
    const prev = result[result.length - 1];
    if (prev.role === log[i].role && prev.text === log[i].text) continue;
    result.push(log[i]);
  }
  return result;
}

function loadPersistedLog(): AlfredMessage[] {
  try {
    const raw = localStorage.getItem(getAlfredStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return deduplicateLog(parsed.slice(-MAX_PERSISTED_MESSAGES));
  } catch { return []; }
}

function persistLog(log: AlfredMessage[]) {
  try {
    localStorage.setItem(getAlfredStorageKey(), JSON.stringify(log.slice(-MAX_PERSISTED_MESSAGES)));
  } catch { /* storage full or unavailable */ }
}

export interface AlfredPendingTask {
  id: string;
  description: string;
  createdAt: number;
  status: 'pending' | 'done';
}

function loadAlfredTasks(): AlfredPendingTask[] {
  try {
    const raw = localStorage.getItem(ALFRED_TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAlfredTask(description: string) {
  const tasks = loadAlfredTasks();
  tasks.push({ id: Date.now().toString(36), description, createdAt: Date.now(), status: 'pending' });
  if (tasks.length > 20) tasks.splice(0, tasks.length - 20);
  try { localStorage.setItem(ALFRED_TASKS_KEY, JSON.stringify(tasks)); } catch { /* */ }
}

function getPendingTasksContext(): string {
  const tasks = loadAlfredTasks().filter(t => t.status === 'pending');
  if (tasks.length === 0) return '';
  return `\n[PENDING ALFRED TASKS - you committed to these, follow up]\n${tasks.map(t => `- ${t.description}`).join('\n')}\n`;
}

export interface AlfredBuildStep {
  id: string;
  tool: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AlfredMessage {
  role: 'user' | 'alfred';
  text: string;
  time: string;
  buildSteps?: AlfredBuildStep[];
}

type AlfredState = 'idle' | 'listening' | 'activated' | 'processing' | 'speaking';

const WAKE_WORD = /\balfred\b/i;
const ACTIVATION_PHRASES = [
  'Yes sir, I\'m here. What do you need?',
  'At your service, sir. Go ahead.',
  'Yes sir. I\'m listening.',
  'Right here, sir. What can I do?',
  'Yes sir, Alfred is ready.',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function useAlfredAmbient() {
  const titanVoice = useTitanVoice();
  const autoListenMode = titanVoice.autoListenMode;

  const [alfredState, setAlfredState] = useState<AlfredState>('idle');
  const [conversationLog, setConversationLog] = useState<AlfredMessage[]>(() => loadPersistedLog());
  const greetedRef = useRef(false);

  // Persist conversation log to localStorage whenever it changes
  useEffect(() => {
    if (conversationLog.length > 0) persistLog(conversationLog);
  }, [conversationLog]);

  // Wake word state
  const wakeDetectedRef = useRef(false);
  const wakeActivatedAtRef = useRef(0);
  const pendingTranscript = useRef('');
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Buffer speech received while TTS is playing (so nothing is lost)
  const ttsBufferRef = useRef<string[]>([]);

  // Pending action for "proceed" flow
  const pendingActionRef = useRef<{ action: string; params: Record<string, string>; description: string } | null>(null);

  const addToLog = useCallback((role: 'user' | 'alfred', text: string) => {
    const msg: AlfredMessage = { role, text, time: timestamp() };
    setConversationLog(prev => [...prev.slice(-80), msg]);
    return msg;
  }, []);

  // ─── SEND TO ALFRED AI ───
  const sendToAlfred = useCallback(async (text: string) => {
    if (!text.trim() || text.trim().length < 2 || processingRef.current) return;

    processingRef.current = true;
    addToLog('user', text);
    setAlfredState('processing');
    titanVoice.stopSpeaking();

    // Voice commands first
    try {
      const { parseVoiceCommand } = await import('@/lib/voice/voice-commands');
      const { executeVoiceAction } = await import('@/lib/voice/system-control');
      const result = parseVoiceCommand(text);
      if (result.matched) {
        // "proceed" confirms and executes the pending action
        if (result.action === 'proceed') {
          const pending = pendingActionRef.current;
          if (pending) {
            pendingActionRef.current = null;
            const controlResult = await executeVoiceAction(pending.action, pending.params);
            addToLog('alfred', controlResult.message);
            titanVoice.speak(controlResult.message, 8);
          } else {
            addToLog('alfred', 'Nothing pending to execute, sir.');
            titanVoice.speak('Nothing pending to execute, sir.', 6);
          }
          setAlfredState('speaking');
          processingRef.current = false;
          return;
        }

        // Actions that modify state get held for confirmation
        const confirmActions = new Set(['start_midnight', 'stop_midnight', 'start_harvest', 'stop_harvest', 'start_auto_learn', 'stop_auto_learn']);
        if (confirmActions.has(result.action)) {
          pendingActionRef.current = { action: result.action, params: result.params, description: result.description };
          const msg = `Ready to ${result.description.toLowerCase()}. Say "proceed" or "go ahead" to confirm.`;
          addToLog('alfred', msg);
          titanVoice.speak(msg, 8);
          setAlfredState('speaking');
          processingRef.current = false;
          return;
        }

        const controlResult = await executeVoiceAction(result.action, result.params);
        addToLog('alfred', controlResult.message);
        titanVoice.speak(controlResult.message, 8);
        setAlfredState('speaking');
        processingRef.current = false;
        return;
      }
    } catch { /* voice commands not available */ }

    let memoryContext = '';
    try { memoryContext = useTitanMemory.getState().serialize(2000); } catch { /* */ }

    let brainContext = '';
    try { brainContext = serializeBrainContext(1500); } catch { /* */ }

    let learnedStrategies = '';
    try {
      const { getRelevantStrategies } = await import('@/lib/voice/self-improvement');
      learnedStrategies = getRelevantStrategies(text);
    } catch { /* self-improvement module not available yet */ }

    let nexusSkills = '';
    try {
      const { nexusRegistry } = await import('@/lib/nexus/nexus-registry');
      nexusSkills = nexusRegistry.getSkillInstructions();
    } catch { /* nexus not available */ }

    // Pre-load system state so tools return real data instead of placeholders
    let systemState: Record<string, unknown> = {};
    try {
      const planStore = usePlanStore.getState();
      const tasks = Object.values(planStore.tasks);
      const recentTasks = tasks.slice(-5).map(t => `${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : '○'} ${(t as { title?: string }).title || 'task'}`).join(', ');
      systemState = {
        protocolStatus: {
          mode: planStore.chatMode || 'agent',
          planName: planStore.planName || 'None',
          total: tasks.length,
          completed: tasks.filter(t => t.status === 'completed').length,
          inProgress: tasks.filter(t => t.status === 'in_progress').length,
          failed: tasks.filter(t => t.status === 'failed').length,
          pending: tasks.filter(t => t.status === 'pending').length,
          taskSummary: recentTasks || undefined,
        },
      };
    } catch { /* plan store not available */ }

    try {
      const response = await fetch('/api/titan/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: conversationLog.slice(-30).map(c => ({
            role: c.role === 'user' ? 'user' : 'assistant',
            content: c.text,
          })),
          memoryContext: memoryContext + getPendingTasksContext(),
          brainContext,
          learnedStrategies,
          nexusSkills,
          systemState,
          workspacePath: useFileStore.getState().workspacePath || '',
          workspaceName: useFileStore.getState().workspaceName || '',
        }),
      });

      if (!response.ok || !response.body) {
        addToLog('alfred', 'I had trouble processing that, sir. Could you try again?');
        titanVoice.speak('I had trouble processing that, sir.', 5);
        setAlfredState('idle');
        processingRef.current = false;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let responseText = '';
      const pendingClientActions: Array<{ action: string; params: Record<string, string> }> = [];
      const buildSteps: AlfredBuildStep[] = [];
      let buildMsgId: string | null = null;
      const toolCallArgs = new Map<string, Record<string, unknown>>();

      while (true) {
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
            if (eventType === 'voice_response') {
              const payload = JSON.parse(data) as { content?: string; clientActions?: Array<{ action: string; params: Record<string, string> }> };
              responseText = payload.content || '';
              if (payload.clientActions) pendingClientActions.push(...payload.clientActions);
            } else if (eventType === 'voice_tool_call') {
              const payload = JSON.parse(data) as { name: string; dangerous?: boolean; args?: Record<string, unknown> };
              const stepId = `step-${Date.now()}-${buildSteps.length}`;
              const toolDesc = payload.args?.path ? `${payload.name}: ${String(payload.args.path)}` :
                payload.args?.query ? `${payload.name}: ${String(payload.args.query)}` :
                payload.args?.command ? `${payload.name}: ${String(payload.args.command).slice(0, 60)}` : payload.name;
              buildSteps.push({ id: stepId, tool: payload.name, description: toolDesc, status: 'running', startedAt: Date.now() });

              if (payload.args) toolCallArgs.set(payload.name, payload.args);

              const canvasStore = useAlfredCanvas.getState();
              const toolCanvasMode: CanvasMode = resolveToolCanvasMode(payload.name, payload.args);
              canvasStore.pushContent({
                type: toolCanvasMode,
                title: toolDesc,
                data: payload.args ? JSON.stringify(payload.args, null, 2) : payload.name,
                timestamp: Date.now(),
                meta: {
                  tool: payload.name,
                  status: 'running',
                  query: payload.args?.query ? String(payload.args.query) : undefined,
                  url: payload.args?.url ? String(payload.args.url) : undefined,
                  path: payload.args?.path ? String(payload.args.path) : undefined,
                },
              });

              // Show live build progress in chat
              if (!buildMsgId) {
                buildMsgId = `build-${Date.now()}`;
                const buildMsg: AlfredMessage = { role: 'alfred', text: '[build]', time: timestamp(), buildSteps: [...buildSteps] };
                setConversationLog(prev => [...prev.slice(-80), buildMsg]);
              } else {
                setConversationLog(prev => prev.map(m =>
                  m.buildSteps && m.text === '[build]' ? { ...m, buildSteps: [...buildSteps] } : m
                ));
              }

              if (payload.dangerous) {
                pendingActionRef.current = { action: payload.name, params: {}, description: `execute ${payload.name}` };
              }
            } else if (eventType === 'voice_tool_result') {
              const payload = JSON.parse(data) as { name: string; success?: boolean; message?: string };
              const step = buildSteps.find(s => s.tool === payload.name && s.status === 'running');
              if (step) {
                step.status = payload.success !== false ? 'done' : 'error';
                step.completedAt = Date.now();
                step.result = payload.message ? String(payload.message).slice(0, 200) : undefined;
                setConversationLog(prev => prev.map(m =>
                  m.buildSteps && m.text === '[build]' ? { ...m, buildSteps: [...buildSteps] } : m
                ));
              }

              const canvasStoreResult = useAlfredCanvas.getState();
              const resultMode: CanvasMode = resolveToolCanvasMode(payload.name);
              const origArgs = toolCallArgs.get(payload.name) || {};
              if (payload.message) {
                canvasStoreResult.pushContent({
                  type: resultMode,
                  title: `${payload.name} ${payload.success !== false ? 'completed' : 'failed'}`,
                  data: payload.message,
                  timestamp: Date.now(),
                  meta: {
                    tool: payload.name,
                    status: payload.success !== false ? 'done' : 'error',
                    query: origArgs.query ? String(origArgs.query) : undefined,
                    url: origArgs.url ? String(origArgs.url) : undefined,
                    path: origArgs.path ? String(origArgs.path) : undefined,
                  },
                });
              }
              canvasStoreResult.incrementTask(payload.success !== false);
            }
          } catch { /* skip malformed events */ }
        }
      }

      // Mark any remaining running steps as done
      for (const step of buildSteps) {
        if (step.status === 'running') { step.status = 'done'; step.completedAt = Date.now(); }
      }
      if (buildSteps.length > 0) {
        setConversationLog(prev => prev.map(m =>
          m.buildSteps && m.text === '[build]' ? { ...m, buildSteps: [...buildSteps] } : m
        ));
      }

      // Execute any client-side actions returned by tool calls
      if (pendingClientActions.length > 0) {
        try {
          const { executeVoiceAction } = await import('@/lib/voice/system-control');
          for (const ca of pendingClientActions) {
            await executeVoiceAction(ca.action, ca.params);
          }
        } catch { /* client actions are best-effort */ }
      }

      if (responseText) {
        addToLog('alfred', responseText);
        setAlfredState('speaking');
        if (titanVoice.autoSpeak) {
          titanVoice.speak(responseText, 6);
        }

        // Auto-switch canvas for YouTube URLs in response
        const ytDetect = responseText.match(YT_DETECT);
        if (ytDetect?.[1]) {
          const canvasForYt = useAlfredCanvas.getState();
          canvasForYt.pushContent({
            type: 'video',
            title: 'Video from Alfred',
            data: responseText,
            timestamp: Date.now(),
            meta: { url: `https://www.youtube.com/watch?v=${ytDetect[1]}` },
          });
        }

        // Auto-detect artifact markers and push to store
        ARTIFACT_DETECT.lastIndex = 0;
        let artMatch;
        while ((artMatch = ARTIFACT_DETECT.exec(responseText)) !== null) {
          const artType = artMatch[1] as Artifact['type'];
          const artTitle = artMatch[2]?.trim() || `${artType} artifact`;
          const canvasForArt = useAlfredCanvas.getState();
          const artifact: Artifact = {
            id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: artType,
            title: artTitle,
            timestamp: Date.now(),
          };
          canvasForArt.addArtifact(artifact);
          if (artType === 'simulation' || artType === 'html') {
            canvasForArt.pushContent({ type: 'simulation', title: artTitle, data: responseText, timestamp: Date.now() });
          }
        }
        ARTIFACT_DETECT.lastIndex = 0;

        // Detect task commitments from Alfred ("I'll", "I will", "Let me", "I'm going to")
        const taskPattern = /(?:I'll|I will|Let me|I'm going to|I shall)\s+(.{10,80}?)(?:\.|,|$)/i;
        const taskMatch = responseText.match(taskPattern);
        if (taskMatch?.[1]) {
          saveAlfredTask(taskMatch[1].trim());
        }

        try {
          const memory = useTitanMemory.getState();
          memory.extractAndStore(text, '');
          await saveConversation(
            [{ role: 'user', content: text }, { role: 'assistant', content: responseText }],
            `Alfred conversation: ${text.slice(0, 80)}`,
          );
        } catch { /* learning is best-effort */ }

        try {
          const { captureExperience, distillStrategies } = await import('@/lib/voice/self-improvement');
          captureExperience(text, responseText, true);
          if (conversationLog.length > 0 && conversationLog.length % 5 === 0) {
            distillStrategies();
          }
        } catch { /* self-improvement is best-effort */ }
      } else {
        addToLog('alfred', 'I didn\'t catch a clear response. Try again, sir.');
      }
    } catch {
      addToLog('alfred', 'Connection issue, sir. I\'ll be ready when you try again.');
    }
    setAlfredState('idle');
    processingRef.current = false;
  }, [addToLog, titanVoice, conversationLog]);

  // ─── TRANSCRIPT HANDLER WITH WAKE WORD ───
  const handleTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Check for wake word
    if (WAKE_WORD.test(trimmed)) {
      console.log('[alfred] Wake word detected:', trimmed);
      const afterWake = trimmed.replace(WAKE_WORD, '').trim();

      // Reset inactivity timer on every wake word
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

      if (!wakeDetectedRef.current) {
        wakeDetectedRef.current = true;
        wakeActivatedAtRef.current = Date.now();
        const activation = pickRandom(ACTIVATION_PHRASES);
        addToLog('alfred', activation);
        titanVoice.speak(activation, 9);
        setAlfredState('activated');

        if (afterWake.length > 3) {
          pendingTranscript.current = afterWake;
        }

        // Extended timeout: 12s for user to follow up after "Alfred"
        if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
        wakeTimeoutRef.current = setTimeout(() => {
          if (pendingTranscript.current.trim().length > 3) {
            const full = pendingTranscript.current.trim();
            pendingTranscript.current = '';
            wakeDetectedRef.current = false;
            void sendToAlfred(full);
          } else {
            wakeDetectedRef.current = false;
            setAlfredState('listening');
          }
        }, 12000);
      } else if (afterWake.length > 3) {
        pendingTranscript.current += ' ' + afterWake;
      }
      return;
    }

    // Secondary detection: if we're within 5s of activation and get a transcript
    // (covers mic-restart edge cases and speech during activation phrase)
    if (!wakeDetectedRef.current && wakeActivatedAtRef.current > 0 && (Date.now() - wakeActivatedAtRef.current) < 5000) {
      console.log('[alfred] Secondary wake window — treating as command:', trimmed);
      wakeDetectedRef.current = true;
      pendingTranscript.current = trimmed;
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(() => {
        const full = pendingTranscript.current.trim();
        pendingTranscript.current = '';
        wakeDetectedRef.current = false;
        wakeActivatedAtRef.current = 0;
        if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
        if (full.length > 2) {
          void sendToAlfred(full);
        } else {
          setAlfredState('listening');
        }
      }, 1500);
      return;
    }

    // If wake word was detected, accumulate transcript
    if (wakeDetectedRef.current) {
      pendingTranscript.current += (pendingTranscript.current ? ' ' : '') + trimmed;

      // Reset the send timer — send after 1.5s of silence
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      sendTimerRef.current = setTimeout(() => {
        const full = pendingTranscript.current.trim();
        pendingTranscript.current = '';
        wakeDetectedRef.current = false;
        if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
        if (full.length > 2) {
          void sendToAlfred(full);
        } else {
          setAlfredState('listening');
        }
      }, 1500);
    }
    // If no wake word detected yet, ignore (ambient listening)
  }, [addToLog, titanVoice, sendToAlfred]);

  // ─── VOICE INPUT ───
  const voice = useVoiceInput(handleTranscript, {
    onAutoSend: undefined,
    autoSendDelayMs: 4000,
  });

  // Alfred ALWAYS listens — force auto mode on, start mic immediately
  useEffect(() => {
    if (!autoListenMode) {
      titanVoice.toggleAutoListen();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (voice.isSupported && !voice.isListening) {
      voice.startListening();
      setAlfredState('listening');
    }
  }, [voice.isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  // If mic somehow stops, restart it fast
  useEffect(() => {
    if (!voice.isListening && voice.isSupported && !titanVoice.isSpeaking && alfredState !== 'processing') {
      const restart = setTimeout(() => {
        if (!voice.isListening && voice.isSupported) {
          voice.startListening();
          setAlfredState('listening');
        }
      }, 500);
      return () => clearTimeout(restart);
    }
  }, [voice.isListening, voice.isSupported, titanVoice.isSpeaking, alfredState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep mic running during TTS — echo cancellation handles feedback.
  // Any speech detected while Alfred is talking gets buffered and processed after.
  useEffect(() => {
    if (titanVoice.isSpeaking) {
      ttsBufferRef.current = [];
    }
  }, [titanVoice.isSpeaking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume state after Alfred finishes speaking — process any buffered speech
  useEffect(() => {
    if (!titanVoice.isSpeaking && alfredState === 'speaking') {
      const timer = setTimeout(() => {
        setAlfredState(wakeDetectedRef.current ? 'activated' : 'listening');
        if (!voice.isListening && voice.isSupported) {
          voice.resume();
        }

        // Process any speech that was buffered during TTS playback
        if (ttsBufferRef.current.length > 0) {
          const buffered = ttsBufferRef.current.join(' ').trim();
          ttsBufferRef.current = [];
          if (buffered.length > 2 && wakeDetectedRef.current) {
            pendingTranscript.current += (pendingTranscript.current ? ' ' : '') + buffered;
          }
        }

        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
          if (!wakeDetectedRef.current && !processingRef.current) {
            setAlfredState('listening');
          }
        }, 60000);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [titanVoice.isSpeaking, alfredState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update state from voice
  useEffect(() => {
    if (voice.isListening && alfredState === 'idle') {
      setAlfredState('listening');
    }
  }, [voice.isListening, alfredState]);

  // Greeting: once per browser session, NOT per component mount
  useEffect(() => {
    if (greetedRef.current) return;
    const sessionKey = 'alfred-greeted-session';
    if (sessionStorage.getItem(sessionKey)) { greetedRef.current = true; return; }
    greetedRef.current = true;
    sessionStorage.setItem(sessionKey, '1');

    const isReturning = localStorage.getItem('alfred-last-visit');
    localStorage.setItem('alfred-last-visit', new Date().toISOString());

    const greeting = isReturning
      ? getTimeGreeting()
      : "Sir, I'm Alfred — your AI companion. I'll be watching over everything: code quality, project health, new ideas. Just say my name and I'm on it. Welcome to Titan.";

    addToLog('alfred', greeting);

    const timer = setTimeout(() => {
      titanVoice.speak(greeting, 9);
    }, 1200);

    return () => clearTimeout(timer);
  }, [titanVoice, addToLog]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  // Manual send (from text input)
  const sendManual = useCallback((text: string) => {
    if (!text.trim()) return;
    // Manual input doesn't need wake word
    void sendToAlfred(text.trim());
  }, [sendToAlfred]);

  return {
    alfredState,
    conversationLog,
    voice,
    sendManual,
    addToLog,
    pendingTasks: loadAlfredTasks().filter(t => t.status === 'pending'),
  };
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  const greetings = {
    night: [
      "Burning the midnight oil, sir? I'm right here with you. Let's make it count.",
      "Late night session, sir. I never sleep — let's keep pushing.",
    ],
    morning: [
      "Good morning, sir. Fresh start, fresh opportunities. What's on the agenda?",
      "Morning, sir. Systems are online. What shall we tackle today?",
    ],
    afternoon: [
      "Good afternoon, sir. We're making solid progress. What's next?",
      "Afternoon, sir. Everything's running smooth. Ready for your orders.",
    ],
    evening: [
      "Good evening, sir. Still going strong. I'm here whenever you need me.",
      "Evening, sir. Productive day. What else can I help with?",
    ],
  };
  if (hour < 6) return pickRandom(greetings.night);
  if (hour < 12) return pickRandom(greetings.morning);
  if (hour < 17) return pickRandom(greetings.afternoon);
  if (hour < 21) return pickRandom(greetings.evening);
  return pickRandom(greetings.night);
}
