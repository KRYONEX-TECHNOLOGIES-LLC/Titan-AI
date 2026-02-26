import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/speech/transcribe
 * Accepts { audio: base64, mimeType?: string } and returns { text: string }
 * Uses Gemini Flash multimodal to transcribe audio via data-URI in image_url content part.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { audio?: string; mimeType?: string };
    if (!body.audio) {
      return NextResponse.json({ error: 'No audio data' }, { status: 400 });
    }

    const mimeType = body.mimeType || 'audio/webm';

    const openRouterKey = process.env.OPENROUTER_API_KEY || '';
    const litellmBase = process.env.TITAN_LITELLM_BASE_URL || process.env.LITELLM_PROXY_URL || '';
    const litellmKey = process.env.TITAN_LITELLM_API_KEY || process.env.LITELLM_MASTER_KEY || '';

    let apiUrl: string;
    let headers: Record<string, string>;
    const model = 'google/gemini-2.0-flash-001';

    if (litellmBase) {
      apiUrl = `${litellmBase.replace(/\/$/, '')}/v1/chat/completions`;
      headers = {
        'Content-Type': 'application/json',
        ...(litellmKey ? { Authorization: `Bearer ${litellmKey}` } : {}),
      };
    } else if (openRouterKey) {
      apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterKey}`,
        'X-Title': 'Titan AI Speech',
        'HTTP-Referer': 'https://titan-ai.dev',
      };
    } else {
      return NextResponse.json({ error: 'No LLM API configured' }, { status: 500 });
    }

    const dataUri = `data:${mimeType};base64,${body.audio}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a speech-to-text transcription service. Output ONLY the exact transcribed text from the audio. No commentary, no formatting, no quotes. If the audio is unclear or silent, output an empty string.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUri },
              },
              {
                type: 'text',
                text: 'Transcribe this audio exactly. Output only the spoken words.',
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Speech] Transcription API error:', response.status, errText);
      return NextResponse.json({ error: 'Transcription failed', text: '' }, { status: 502 });
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const rawText = data.choices?.[0]?.message?.content?.trim() || '';
    const text = rawText === '""' || rawText === "''" ? '' : rawText;

    console.log('[Speech] Transcribed:', text.slice(0, 80) || '(empty)');
    return NextResponse.json({ text });
  } catch (err) {
    console.error('[Speech] Transcribe error:', err);
    return NextResponse.json({ error: 'Internal error', text: '' }, { status: 500 });
  }
}
