import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/speech/transcribe
 * Accepts { audio: base64 } and returns { text: string }
 * Uses Gemini Flash to transcribe audio — no extra API keys needed.
 */
export async function POST(req: NextRequest) {
  try {
    const { audio } = (await req.json()) as { audio?: string };
    if (!audio) {
      return NextResponse.json({ error: 'No audio data' }, { status: 400 });
    }

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
                type: 'input_audio',
                input_audio: {
                  data: audio,
                  format: 'wav',
                },
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
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    return NextResponse.json({ text });
  } catch (err) {
    console.error('[Speech] Transcribe error:', err);
    return NextResponse.json({ error: 'Internal error', text: '' }, { status: 500 });
  }
}
