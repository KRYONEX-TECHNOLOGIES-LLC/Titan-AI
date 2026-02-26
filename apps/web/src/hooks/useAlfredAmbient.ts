'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTitanVoice } from '@/stores/titan-voice.store';
import { useTitanMemory } from '@/stores/titan-memory';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { serializeBrainContext, saveConversation } from '@/lib/voice/brain-storage';
import { usePlanStore } from '@/stores/plan-store';

export interface AlfredMessage {
  role: 'user' | 'alfred';
  text: string;
  time: string;
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
  const [conversationLog, setConversationLog] = useState<AlfredMessage[]>([]);
  const [hasGreeted, setHasGreeted] = useState(false);

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
    try { memoryContext = useTitanMemory.getState().serialize(5000); } catch { /* */ }

    let brainContext = '';
    try { brainContext = serializeBrainContext(4000); } catch { /* */ }

    let learnedStrategies = '';
    try {
      const { getRelevantStrategies } = await import('@/lib/voice/self-improvement');
      learnedStrategies = getRelevantStrategies(text);
    } catch { /* self-improvement module not available yet */ }

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
          memoryContext,
          brainContext,
          learnedStrategies,
          systemState,
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
              const payload = JSON.parse(data) as { name: string; dangerous?: boolean };
              if (payload.dangerous) {
                pendingActionRef.current = {
                  action: payload.name,
                  params: {},
                  description: `execute ${payload.name}`,
                };
              }
            }
          } catch { /* skip malformed events */ }
        }
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

        // Auto-learn from conversation
        try {
          const memory = useTitanMemory.getState();
          memory.extractAndStore(text, responseText);
          await saveConversation(
            [{ role: 'user', content: text }, { role: 'assistant', content: responseText }],
            `Alfred conversation: ${text.slice(0, 80)}`,
          );
        } catch { /* learning is best-effort */ }

        // Post-conversation self-improvement evaluation
        try {
          const { captureExperience, shouldDistill, distillStrategies } = await import('@/lib/voice/self-improvement');
          const conversationCount = conversationLog.length;
          captureExperience(text, responseText, true);
          if (shouldDistill(conversationCount)) {
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

  // Greeting on first mount
  useEffect(() => {
    if (hasGreeted) return;
    setHasGreeted(true);

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
  }, [hasGreeted, titanVoice, addToLog]);

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
