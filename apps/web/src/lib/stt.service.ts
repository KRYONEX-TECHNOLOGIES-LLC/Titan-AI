
import { useVoiceStore } from '@/stores/voice.store';

const SpeechRecognition =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

class STTService {
  private recognition: SpeechRecognition | null = null;
  private isStopping = false;
  private finalTranscript = '';

  public onResult: ((final: string, interim: string) => void) | null = null;
  public onError: ((error: any) => void) | null = null;

  constructor() {
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      useVoiceStore.getState().setIsListening(true);
      this.isStopping = false;
      this.finalTranscript = '';
    };

    this.recognition.onend = () => {
      useVoiceStore.getState().setIsListening(false);
    };

    this.recognition.onerror = (event) => {
      console.error('SpeechRecognition error', event.error);
      if (this.onError) {
        this.onError(event.error);
      }
      useVoiceStore.getState().setIsListening(false);
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          this.finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (this.onResult) {
          this.onResult(this.finalTranscript, interimTranscript);
      }
    };
  }

  isSupported(): boolean {
    return !!SpeechRecognition;
  }

  start() {
    if (!this.recognition || useVoiceStore.getState().isListening) {
      return;
    }
    try {
      this.isStopping = false;
      this.recognition.start();
    } catch (e) {
      console.error("Error starting speech recognition:", e);
    }
  }

  stop() {
    if (!this.recognition || !useVoiceStore.getState().isListening) {
      return;
    }
    this.isStopping = true;
    this.recognition.stop();
  }

  toggleListening() {
      if (useVoiceStore.getState().isListening) {
          this.stop();
      } else {
          this.start();
      }
  }
}

export const sttService = new STTService();
