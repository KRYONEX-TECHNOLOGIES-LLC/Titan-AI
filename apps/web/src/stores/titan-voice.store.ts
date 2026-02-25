'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TitanVoiceState {
  voiceEnabled: boolean;
  autoSpeak: boolean;
  autoListenMode: boolean;
  isSpeaking: boolean;
  rate: number;
  pitch: number;
  volume: number;
  initialized: boolean;
  greeting: string;
  snoozedUntil: number;
  shownThoughtIds: string[];

  toggleVoice: () => void;
  toggleAutoSpeak: () => void;
  toggleAutoListen: () => void;
  setAutoListen: (on: boolean) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  speak: (text: string, priority?: number) => void;
  stopSpeaking: () => void;
  markInitialized: () => void;
  snoozeThoughts: (durationMs: number) => void;
  isThoughtsSnoozed: () => boolean;
  markThoughtShown: (id: string) => void;
  wasThoughtShown: (id: string) => boolean;
}

let ttsEngine: ReturnType<typeof import('@/lib/voice/tts-engine').getTTSEngine> | null = null;

async function getEngine() {
  if (ttsEngine) return ttsEngine;
  try {
    const mod = await import('@/lib/voice/tts-engine');
    ttsEngine = mod.getTTSEngine();
    return ttsEngine;
  } catch {
    return null;
  }
}

export const useTitanVoice = create<TitanVoiceState>()(
  persist(
    (set, get) => ({
      voiceEnabled: true,
      autoSpeak: true,
      autoListenMode: true,
      isSpeaking: false,
      rate: 1.0,
      pitch: 0.95,
      volume: 0.9,
      initialized: false,
      greeting: '',
      snoozedUntil: 0,
      shownThoughtIds: [],

      toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
      toggleAutoSpeak: () => set((s) => ({ autoSpeak: !s.autoSpeak })),
      toggleAutoListen: () => set((s) => ({ autoListenMode: !s.autoListenMode })),
      setAutoListen: (on) => set({ autoListenMode: on }),

      setRate: (rate) => {
        set({ rate });
        getEngine().then((e) => e?.setRate(rate));
      },
      setPitch: (pitch) => {
        set({ pitch });
        getEngine().then((e) => e?.setPitch(pitch));
      },
      setVolume: (volume) => {
        set({ volume });
        getEngine().then((e) => e?.setVolume(volume));
      },

      speak: (text: string, priority = 5) => {
        const state = get();
        if (!state.voiceEnabled) return;

        getEngine().then(async (engine) => {
          if (!engine) return;
          await engine.init((speaking) => set({ isSpeaking: speaking }));
          engine.setRate(state.rate);
          engine.setPitch(state.pitch);
          engine.setVolume(state.volume);
          void engine.speak(text, priority);
        });
      },

      stopSpeaking: () => {
        getEngine().then((engine) => {
          engine?.stop();
          set({ isSpeaking: false });
        });
      },

      markInitialized: () => set({ initialized: true }),

      snoozeThoughts: (durationMs: number) => {
        set({ snoozedUntil: Date.now() + durationMs });
      },

      isThoughtsSnoozed: () => {
        const { snoozedUntil } = get();
        return snoozedUntil > Date.now();
      },

      markThoughtShown: (id: string) => {
        const { shownThoughtIds } = get();
        // Keep last 50 to avoid memory bloat
        const updated = [...shownThoughtIds, id].slice(-50);
        set({ shownThoughtIds: updated });
      },

      wasThoughtShown: (id: string) => {
        return get().shownThoughtIds.includes(id);
      },
    }),
    {
      name: 'titan-voice-settings',
      partialize: (s) => ({
        voiceEnabled: s.voiceEnabled,
        autoSpeak: s.autoSpeak,
        autoListenMode: s.autoListenMode,
        rate: s.rate,
        pitch: s.pitch,
        volume: s.volume,
        snoozedUntil: s.snoozedUntil,
        shownThoughtIds: s.shownThoughtIds,
      }),
    },
  ),
);
