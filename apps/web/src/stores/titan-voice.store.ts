'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getTTSEngine } from '@/lib/voice/tts-engine';

interface TitanVoiceState {
  voiceEnabled: boolean;
  autoSpeak: boolean;
  isSpeaking: boolean;
  isInitialized: boolean;
  rate: number;
  pitch: number;
  volume: number;
  snoozedUntil: number | null;

  initEngine: () => Promise<void>;
  speak: (text: string, priority?: number) => void;
  stopSpeaking: () => void;
  toggleVoice: () => void;
  toggleAutoSpeak: () => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  snoozeThoughts: (durationMs: number) => void;
  isThoughtsSnoozed: () => boolean;
}

export const useTitanVoice = create<TitanVoiceState>()(
  persist(
    (set, get) => ({
      voiceEnabled: false,
      autoSpeak: false,
      isSpeaking: false,
      isInitialized: false,
      rate: 1.0,
      pitch: 0.95,
      volume: 0.9,
      snoozedUntil: null,

      initEngine: async () => {
        if (get().isInitialized) return;
        const engine = getTTSEngine();
        await engine.init((speaking) => set({ isSpeaking: speaking }));
        const s = get();
        engine.setRate(s.rate);
        engine.setPitch(s.pitch);
        engine.setVolume(s.volume);
        set({ isInitialized: true });
      },

      speak: (text: string, priority = 5) => {
        const s = get();
        if (!s.voiceEnabled) return;
        if (!s.isInitialized) {
          void get().initEngine().then(() => {
            getTTSEngine().speak(text, priority);
          });
          return;
        }
        void getTTSEngine().speak(text, priority);
      },

      stopSpeaking: () => {
        getTTSEngine().stop();
        set({ isSpeaking: false });
      },

      toggleVoice: () => {
        const next = !get().voiceEnabled;
        set({ voiceEnabled: next });
        if (next && !get().isInitialized) {
          void get().initEngine();
        }
        if (!next) getTTSEngine().stop();
      },

      toggleAutoSpeak: () => set({ autoSpeak: !get().autoSpeak }),

      setRate: (rate: number) => {
        set({ rate });
        getTTSEngine().setRate(rate);
      },
      setPitch: (pitch: number) => {
        set({ pitch });
        getTTSEngine().setPitch(pitch);
      },
      setVolume: (volume: number) => {
        set({ volume });
        getTTSEngine().setVolume(volume);
      },

      snoozeThoughts: (durationMs: number) => {
        set({ snoozedUntil: Date.now() + durationMs });
      },

      isThoughtsSnoozed: () => {
        const until = get().snoozedUntil;
        if (!until) return false;
        if (Date.now() > until) {
          set({ snoozedUntil: null });
          return false;
        }
        return true;
      },
    }),
    {
      name: 'titan-voice-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        voiceEnabled: s.voiceEnabled,
        autoSpeak: s.autoSpeak,
        rate: s.rate,
        pitch: s.pitch,
        volume: s.volume,
        snoozedUntil: s.snoozedUntil,
      }),
    },
  ),
);
