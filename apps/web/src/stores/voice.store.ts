import { create } from 'zustand';

interface VoiceState {
  isTTSEnabled: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  finalTranscript: string;
  interimTranscript: string;
  toggleTTSEnabled: () => void;
  setIsSpeaking: (isSpeaking: boolean) => void;
  setIsListening: (isListening: boolean) => void;
  setTranscript: (final: string, interim: string) => void;
  appendFinalTranscript: (transcript: string) => void;
  setInterimTranscript: (transcript: string) => void;
  clearTranscripts: () => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  isTTSEnabled: false,
  isSpeaking: false,
  isListening: false,
  finalTranscript: '',
  interimTranscript: '',
  toggleTTSEnabled: () => set((state) => ({ isTTSEnabled: !state.isTTSEnabled })),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  setIsListening: (isListening) => set({ isListening }),
  setTranscript: (final, interim) => set({ finalTranscript: final, interimTranscript: interim }),
  appendFinalTranscript: (transcript) => set({ finalTranscript: get().finalTranscript + transcript, interimTranscript: '' }),
  setInterimTranscript: (transcript) => set({ interimTranscript: transcript }),
  clearTranscripts: () => set({ finalTranscript: '', interimTranscript: '' }),
}));
