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

type VoiceMode = 'native' | 'whisper' | 'off';

export function useVoiceInput(
  onTranscript: (text: string) => void,
  options?: { onAutoSend?: () => void; autoSendDelayMs?: number },
) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('off');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const restartCountRef = useRef(0);
  const networkRetryRef = useRef(0);
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSendRef = useRef(options?.onAutoSend);
  const autoSendDelay = options?.autoSendDelayMs ?? 2000;
  onAutoSendRef.current = options?.onAutoSend;

  // Pause/resume for TTS coordination — blocks onend auto-restart
  const pausedRef = useRef(false);
  const stopTimestampRef = useRef(0);

  // Whisper fallback refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const whisperIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const SpeechRecognition = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    setIsSupported(!!SpeechRecognition || typeof navigator?.mediaDevices?.getUserMedia === 'function');
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
      if (autoSendTimerRef.current) {
        clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = null;
      }
      stopWhisperRecording();
    };
  }, []);

  // ═══ WHISPER FALLBACK ═══

  async function transcribeChunk(blob: Blob): Promise<string> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );
      const mimeType = blob.type || 'audio/webm';
      console.log('[voice] Sending audio chunk for transcription:', { size: blob.size, mimeType });
      const res = await fetch('/api/speech/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType }),
      });
      if (!res.ok) {
        console.warn('[voice] Transcription API returned', res.status);
        return '';
      }
      const data = (await res.json()) as { text?: string };
      const text = data.text?.trim() || '';
      if (text) console.log('[voice] Transcribed:', text);
      return text;
    } catch (err) {
      console.warn('[voice] Transcription failed:', err);
      return '';
    }
  }

  function startWhisperRecording() {
    setVoiceMode('whisper');
    setErrorMessage(null);
    setInterimText('');

    const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }).then((stream) => {
      streamRef.current = stream;
      console.log('[voice] Whisper recording started, format:', preferredMime);

      function createRecorder(): MediaRecorder {
        const rec = new MediaRecorder(stream, { mimeType: preferredMime });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        rec.onstop = () => {
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: preferredMime.split(';')[0] });
            chunks.length = 0;
            if (blob.size > 500) {
              transcribeChunk(blob).then((text) => {
                setInterimText('');
                if (text) onTranscript(text);
              });
            }
          }
        };
        return rec;
      }

      let activeRecorder = createRecorder();
      mediaRecorderRef.current = activeRecorder;
      activeRecorder.start();
      setIsListening(true);

      whisperIntervalRef.current = setInterval(() => {
        if (!streamRef.current) return;
        if (activeRecorder.state === 'recording') {
          activeRecorder.stop();
        }
        try {
          activeRecorder = createRecorder();
          mediaRecorderRef.current = activeRecorder;
          activeRecorder.start();
        } catch { /* stream ended */ }
      }, 3000);
    }).catch((err) => {
      console.error('[voice] Mic access failed:', err);
      setIsListening(false);
      setErrorMessage('Microphone access denied. Check browser permissions.');
    });
  }

  function stopWhisperRecording() {
    if (whisperIntervalRef.current) {
      clearInterval(whisperIntervalRef.current);
      whisperIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    audioChunksRef.current = [];
  }

  // ═══ NATIVE WEB SPEECH API ═══

  const startNativeListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      startWhisperRecording();
      return;
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    setErrorMessage(null);
    setVoiceMode('native');
    restartCountRef.current = 0;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      setErrorMessage(null);
      networkRetryRef.current = 0;
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

        if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
        if (onAutoSendRef.current) {
          autoSendTimerRef.current = setTimeout(() => {
            onAutoSendRef.current?.();
            autoSendTimerRef.current = null;
          }, autoSendDelay);
        }
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
          // Native speech API unavailable (common in Electron) — skip directly to Whisper
          console.log('[voice] Native speech unavailable, switching to Whisper immediately');
          if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch { /* ignore */ }
          }
          recognitionRef.current = null;
          setInterimText('');
          setErrorMessage(null);
          startWhisperRecording();
          return;
        case 'no-speech':
          // No-speech is normal during ambient listening — never kill the mic
          restartCountRef.current = 0;
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
      // Don't auto-restart if paused (TTS is speaking) or recently stopped
      const recentlyStoppedMs = Date.now() - stopTimestampRef.current;
      if (pausedRef.current || recentlyStoppedMs < 300) {
        setIsListening(false);
        setInterimText('');
        return;
      }

      if (recognitionRef.current === recognition) {
        // Always attempt restart — ambient listening should never die
        setTimeout(() => {
          try {
            recognition.start();
          } catch {
            setIsListening(false);
            setInterimText('');
          }
        }, 200);
        return;
      }
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.error('[voice] Failed to start native recognition:', err);
      startWhisperRecording();
    }
  }, [onTranscript, autoSendDelay]);

  const startListening = useCallback(() => {
    pausedRef.current = false;
    restartCountRef.current = 0;
    startNativeListening();
  }, [startNativeListening]);

  const stopListening = useCallback(() => {
    stopTimestampRef.current = Date.now();
    // Stop native
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    // Stop whisper
    stopWhisperRecording();

    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current);
      autoSendTimerRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
    setVoiceMode('off');
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    stopTimestampRef.current = Date.now();
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try { rec.abort(); } catch { /* ignore */ }
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    restartCountRef.current = 0;
    startNativeListening();
  }, [startNativeListening]);

  return {
    isListening,
    interimText,
    isSupported,
    errorMessage,
    voiceMode,
    clearError,
    startListening,
    stopListening,
    toggleListening,
    pause,
    resume,
  };
}
