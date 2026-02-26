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

const WHISPER_CHUNK_MS = 2000;
const VAD_SILENCE_THRESHOLD = 0.01;
const VAD_SILENCE_FRAMES = 8;
const RESTART_DELAY_MS = 50;
const FORCE_RESTART_SILENCE_MS = 5000;

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

  const pausedRef = useRef(false);
  const stopTimestampRef = useRef(0);

  // Track last result time — force-restart if recognition silently dies
  const lastResultTimeRef = useRef(Date.now());
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whisper fallback refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const whisperIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // VAD refs for Whisper
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadSilenceCountRef = useRef(0);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      stopWhisperRecording();
    };
  }, []);

  // ═══ WHISPER FALLBACK WITH VAD ═══

  function getAudioEnergy(): number {
    if (!analyserRef.current) return 1;
    const data = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  async function transcribeChunk(blob: Blob): Promise<string> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      );
      const mimeType = blob.type || 'audio/webm';
      const res = await fetch('/api/speech/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType }),
      });
      if (!res.ok) return '';
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

      // Set up VAD via Web Audio API
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      } catch { /* VAD unavailable, still works without it */ }

      let sendingChunk = false;

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
              sendingChunk = true;
              transcribeChunk(blob).then((text) => {
                setInterimText('');
                sendingChunk = false;
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

      function cycleRecorder() {
        if (!streamRef.current) return;
        if (activeRecorder.state === 'recording') {
          activeRecorder.stop();
        }
        try {
          activeRecorder = createRecorder();
          mediaRecorderRef.current = activeRecorder;
          activeRecorder.start();
        } catch { /* stream ended */ }
      }

      // VAD-based early send: if we detect silence after speech, send chunk immediately
      vadSilenceCountRef.current = 0;
      vadIntervalRef.current = setInterval(() => {
        const energy = getAudioEnergy();
        if (energy < VAD_SILENCE_THRESHOLD) {
          vadSilenceCountRef.current++;
          // ~8 frames of silence at 50ms = 400ms of quiet after speech
          if (vadSilenceCountRef.current >= VAD_SILENCE_FRAMES && !sendingChunk) {
            vadSilenceCountRef.current = 0;
            cycleRecorder();
          }
        } else {
          vadSilenceCountRef.current = 0;
        }
      }, 50);

      // Fallback: max interval ensures chunks are never longer than WHISPER_CHUNK_MS
      whisperIntervalRef.current = setInterval(() => {
        vadSilenceCountRef.current = 0;
        cycleRecorder();
      }, WHISPER_CHUNK_MS);
    }).catch((err) => {
      console.error('[voice] Mic access failed:', err);
      setIsListening(false);
      setErrorMessage('Microphone access denied. Check browser permissions.');
    });
  }

  function stopWhisperRecording() {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
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
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
      analyserRef.current = null;
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
    lastResultTimeRef.current = Date.now();

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
      setErrorMessage(null);
      networkRetryRef.current = 0;
      lastResultTimeRef.current = Date.now();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      lastResultTimeRef.current = Date.now();
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
          console.log('[voice] Native speech unavailable, switching to Whisper immediately');
          if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch { /* ignore */ }
          }
          recognitionRef.current = null;
          if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null; }
          setInterimText('');
          setErrorMessage(null);
          startWhisperRecording();
          return;
        case 'no-speech':
          // Immediately restart on no-speech instead of waiting for onend cycle
          restartCountRef.current = 0;
          if (recognitionRef.current === recognition) {
            try { recognition.abort(); } catch { /* ignore */ }
            setTimeout(() => {
              if (recognitionRef.current === recognition && !pausedRef.current) {
                try { recognition.start(); } catch { /* ignore */ }
              }
            }, RESTART_DELAY_MS);
          }
          return;
        case 'aborted':
          break;
        default:
          setIsListening(false);
          setInterimText('');
          setErrorMessage(`Speech error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      const recentlyStoppedMs = Date.now() - stopTimestampRef.current;
      if (pausedRef.current || recentlyStoppedMs < 200) {
        setIsListening(false);
        setInterimText('');
        return;
      }

      if (recognitionRef.current === recognition) {
        // Minimal restart delay to eliminate dead zones
        setTimeout(() => {
          if (recognitionRef.current === recognition && !pausedRef.current) {
            try {
              recognition.start();
            } catch {
              setIsListening(false);
              setInterimText('');
            }
          }
        }, RESTART_DELAY_MS);
        return;
      }
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    // Watchdog: force-restart if recognition silently dies (no results for 5s while "listening")
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = setInterval(() => {
      if (!recognitionRef.current || pausedRef.current) return;
      const silent = Date.now() - lastResultTimeRef.current;
      if (silent > FORCE_RESTART_SILENCE_MS && recognitionRef.current === recognition) {
        console.log('[voice] Watchdog: force-restarting silent recognition');
        try { recognition.abort(); } catch { /* ignore */ }
        setTimeout(() => {
          if (recognitionRef.current === recognition && !pausedRef.current) {
            try { recognition.start(); } catch { /* ignore */ }
          }
        }, RESTART_DELAY_MS);
        lastResultTimeRef.current = Date.now();
      }
    }, 2000);

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
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
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
