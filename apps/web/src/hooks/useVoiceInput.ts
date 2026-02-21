'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartCountRef = useRef(0);

  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    setIsSupported(!!SpeechRecognition);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    setErrorMessage(null);
    restartCountRef.current = 0;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      setErrorMessage(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        onTranscript(final);
        restartCountRef.current = 0;
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('[voice] Speech recognition error:', event.error);

      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          setIsListening(false);
          setInterimText('');
          setErrorMessage('Microphone access denied. Check your system permissions.');
          break;
        case 'network':
          setIsListening(false);
          setInterimText('');
          setErrorMessage('Network error. Speech recognition requires an internet connection.');
          break;
        case 'no-speech':
          // Auto-restart if user just hasn't spoken yet
          if (restartCountRef.current < 3) {
            restartCountRef.current++;
          } else {
            setIsListening(false);
            setInterimText('');
          }
          break;
        case 'aborted':
          break;
        default:
          setIsListening(false);
          setInterimText('');
          setErrorMessage(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart for continuous listening (unless manually stopped)
      if (recognitionRef.current === recognition && restartCountRef.current < 3) {
        try {
          recognition.start();
          return;
        } catch {
          // Fall through to stop
        }
      }
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error('[voice] Failed to start recognition:', err);
      setIsListening(false);
      setErrorMessage('Failed to start speech recognition.');
    }
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    interimText,
    isSupported,
    errorMessage,
    startListening,
    stopListening,
    toggleListening,
  };
}
