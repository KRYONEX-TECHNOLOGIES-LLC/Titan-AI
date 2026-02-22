import { useVoiceStore } from '@/stores/voice.store';

class TTSService {
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    // Check if window is defined (for server-side rendering)
    if (typeof window === 'undefined') {
      this.synth = {} as SpeechSynthesis; // Mock synth
      return;
    }

    this.synth = window.speechSynthesis;
    this.loadVoices();
    // Some browsers load voices asynchronously.
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    this.voices = this.synth.getVoices();
    if (this.voices.length === 0) return;

    const preferredVoiceNames = [
      'Google US English',
      'Microsoft David - English (United States)',
      'Microsoft Zira - English (United States)',
      'Google UK English Female',
      'Google UK English Male',
      'en-US',
    ];

    this.preferredVoice =
      this.voices.find((voice) => preferredVoiceNames.includes(voice.name)) || 
      this.voices.find(voice => voice.lang.startsWith('en-')) || 
      this.voices[0];
  }

  speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !this.synth.speak) {
        return resolve(); // Don't do anything on the server
      }

      if (!text || !useVoiceStore.getState().isTTSEnabled) {
        return resolve();
      }

      // If speaking, cancel to start the new one immediately.
      if (this.synth.speaking) {
        this.synth.cancel();
      }

      useVoiceStore.getState().setIsSpeaking(true);

      const utterance = new SpeechSynthesisUtterance(text);
      
      // Ensure voices are loaded before trying to assign one
      if (!this.preferredVoice) {
        this.loadVoices();
      }
      utterance.voice = this.preferredVoice;
      utterance.rate = 1.1; // Slightly faster for a more natural feel
      utterance.pitch = 1;

      utterance.onend = () => {
        useVoiceStore.getState().setIsSpeaking(false);
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('SpeechSynthesisUtterance.onerror', event);
        useVoiceStore.getState().setIsSpeaking(false);
        reject(event);
      };

      this.synth.speak(utterance);
    });
  }

  cancel() {
    if (typeof window !== 'undefined' && this.synth.speaking) {
      this.synth.cancel();
      useVoiceStore.getState().setIsSpeaking(false);
    }
  }
}

// Export a singleton instance
export const ttsService = new TTSService();
