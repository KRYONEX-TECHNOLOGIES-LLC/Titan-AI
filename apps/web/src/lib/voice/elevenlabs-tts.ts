'use client';

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // "George" — deep British male
const MODEL_ID = 'eleven_turbo_v2_5';
const STORAGE_KEY = 'elevenlabs-usage';

interface UsageRecord {
  month: string;
  characters: number;
}

const FREE_TIER_CHAR_LIMIT = 18000; // conservative buffer under 20k

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getUsage(): UsageRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { month: currentMonth(), characters: 0 };
    const rec = JSON.parse(raw) as UsageRecord;
    if (rec.month !== currentMonth()) return { month: currentMonth(), characters: 0 };
    return rec;
  } catch {
    return { month: currentMonth(), characters: 0 };
  }
}

function recordUsage(chars: number): void {
  const rec = getUsage();
  rec.characters += chars;
  rec.month = currentMonth();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rec)); } catch { /* quota */ }
}

export function getElevenLabsUsage(): { used: number; limit: number; remaining: number } {
  const rec = getUsage();
  return {
    used: rec.characters,
    limit: FREE_TIER_CHAR_LIMIT,
    remaining: Math.max(0, FREE_TIER_CHAR_LIMIT - rec.characters),
  };
}

export function isElevenLabsAvailable(): boolean {
  const key = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__ELEVENLABS_KEY as string | undefined
    : undefined;
  const envKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
  return !!(key || envKey);
}

function getApiKey(): string {
  const winKey = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__ELEVENLABS_KEY as string | undefined
    : undefined;
  return winKey || process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '';
}

export async function speakWithElevenLabs(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<boolean> {
  const apiKey = getApiKey();
  if (!apiKey) return false;

  const usage = getElevenLabsUsage();
  if (usage.remaining < text.length) {
    console.warn('[elevenlabs] Monthly character limit reached, falling back to native TTS');
    return false;
  }

  const cleanText = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();

  if (!cleanText) {
    onEnd?.();
    return true;
  }

  try {
    onStart?.();
    recordUsage(cleanText.length);

    const response = await fetch(`${ELEVENLABS_API}/text-to-speech/${VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.80,
          style: 0.15,
          use_speaker_boost: true,
        },
        optimize_streaming_latency: 3,
      }),
    });

    if (!response.ok || !response.body) {
      console.error('[elevenlabs] TTS request failed:', response.status);
      onEnd?.();
      return false;
    }

    const audioContext = new AudioContext();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const audioData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      audioData.set(chunk, offset);
      offset += chunk.length;
    }

    const audioBuffer = await audioContext.decodeAudioData(audioData.buffer);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    return new Promise<boolean>((resolve) => {
      source.onended = () => {
        onEnd?.();
        audioContext.close().catch(() => {});
        resolve(true);
      };
      source.start(0);
    });
  } catch (err) {
    console.error('[elevenlabs] TTS error:', err);
    onEnd?.();
    return false;
  }
}
