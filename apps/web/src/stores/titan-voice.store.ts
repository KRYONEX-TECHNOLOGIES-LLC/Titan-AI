'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TitanVoiceState {
  voiceEnabled: boolean;
  autoSpeak: boolean;
  isSpeaking: boolean;
  rate: number;
  pitch: number;
  volume: number;
  initialized: boolean;
  greeting: string;

  toggleVoice: () => void;
  toggleAutoSpeak: () => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  speak: (text: string, priority?: number) => void;
  stopSpeaking: () => void;
  markInitialized: () => void;
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
      isSpeaking: false,
      rate: 1.0,
      pitch: 0.95,
      volume: 0.9,
      initialized: false,
      greeting: '',

      toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
      toggleAutoSpeak: () => set((s) => ({ autoSpeak: !s.autoSpeak })),

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
    }),
    {
      name: 'titan-voice-settings',
      partialize: (s) => ({
        voiceEnabled: s.voiceEnabled,
        autoSpeak: s.autoSpeak,
        rate: s.rate,
        pitch: s.pitch,
        volume: s.volume,
      }),
    },
  ),
);
