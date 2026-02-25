'use client';

type TTSBackend = 'kokoro' | 'native' | 'none';

interface TTSQueueItem {
  text: string;
  priority: number;
}

class TitanTTSEngine {
  private backend: TTSBackend = 'none';
  private nativeSynth: SpeechSynthesis | null = null;
  private preferredVoice: SpeechSynthesisVoice | null = null;
  private queue: TTSQueueItem[] = [];
  private speaking = false;
  private rate = 1.0;
  private pitch = 0.95;
  private volume = 0.9;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private onSpeakingChange?: (speaking: boolean) => void;
  private initialized = false;

  async init(onSpeakingChange?: (speaking: boolean) => void): Promise<TTSBackend> {
    if (this.initialized) return this.backend;
    this.onSpeakingChange = onSpeakingChange;

    if (typeof window === 'undefined') {
      this.backend = 'none';
      this.initialized = true;
      return this.backend;
    }

    if ('speechSynthesis' in window) {
      this.nativeSynth = window.speechSynthesis;
      this.backend = 'native';

      const loadVoices = () => {
        const voices = this.nativeSynth!.getVoices();
        if (voices.length === 0) return;

        const preferred = [
          'Google UK English Male',
          'Microsoft David',
          'Microsoft Mark',
          'Google US English',
          'Daniel',
          'Alex',
        ];

        for (const name of preferred) {
          const match = voices.find(v => v.name.includes(name));
          if (match) {
            this.preferredVoice = match;
            break;
          }
        }

        if (!this.preferredVoice) {
          const englishMale = voices.find(v =>
            v.lang.startsWith('en') && v.name.toLowerCase().includes('male'),
          );
          this.preferredVoice = englishMale || voices.find(v => v.lang.startsWith('en')) || voices[0];
        }
      };

      loadVoices();
      if (this.nativeSynth.onvoiceschanged !== undefined) {
        this.nativeSynth.onvoiceschanged = loadVoices;
      }
    }

    this.initialized = true;
    return this.backend;
  }

  setRate(rate: number) { this.rate = Math.max(0.5, Math.min(2.0, rate)); }
  setPitch(pitch: number) { this.pitch = Math.max(0.5, Math.min(1.5, pitch)); }
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1.0, volume)); }
  getBackend() { return this.backend; }
  isSpeaking() { return this.speaking; }

  async speak(text: string, priority = 5): Promise<void> {
    if (this.backend === 'none' || !text.trim()) return;

    if (this.speaking && priority >= 8) {
      this.stop();
    }

    if (this.speaking) {
      this.queue.push({ text, priority });
      this.queue.sort((a, b) => b.priority - a.priority);
      return;
    }

    await this.speakNow(text);
  }

  private async speakNow(text: string): Promise<void> {
    const cleanText = text
      .replace(/```[\s\S]*?```/g, ' code block ')
      .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();

    if (!cleanText) {
      this.processQueue();
      return;
    }

    this.setSpeaking(true);

    if (this.backend === 'native' && this.nativeSynth) {
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.volume = this.volume;
        if (this.preferredVoice) utterance.voice = this.preferredVoice;

        utterance.onend = () => {
          this.currentUtterance = null;
          this.setSpeaking(false);
          resolve();
          this.processQueue();
        };
        utterance.onerror = () => {
          this.currentUtterance = null;
          this.setSpeaking(false);
          resolve();
          this.processQueue();
        };

        this.currentUtterance = utterance;
        this.nativeSynth!.speak(utterance);
      });
    }

    this.setSpeaking(false);
    this.processQueue();
  }

  private processQueue() {
    if (this.queue.length === 0) return;
    const next = this.queue.shift();
    if (next) void this.speakNow(next.text);
  }

  stop() {
    this.queue = [];
    if (this.backend === 'native' && this.nativeSynth) {
      this.nativeSynth.cancel();
    }
    this.currentUtterance = null;
    this.setSpeaking(false);
  }

  private setSpeaking(val: boolean) {
    this.speaking = val;
    this.onSpeakingChange?.(val);
  }
}

let engineInstance: TitanTTSEngine | null = null;

export function getTTSEngine(): TitanTTSEngine {
  if (!engineInstance) {
    engineInstance = new TitanTTSEngine();
  }
  return engineInstance;
}

export type { TitanTTSEngine, TTSBackend };
