import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export async function POST(req: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const {
      prompt,
      size = '1024x1024',
      quality = 'standard',
      style = 'vivid',
    } = body as {
      prompt: string;
      size?: '1024x1024' | '1792x1024' | '1024x1792';
      quality?: 'standard' | 'hd';
      style?: 'vivid' | 'natural';
    };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality,
        style,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = (errorData as Record<string, Record<string, string>>)?.error?.message || `OpenAI API error: ${response.status}`;
      return NextResponse.json({ error: msg }, { status: response.status });
    }

    const data = await response.json();
    const image = (data as { data: Array<{ b64_json: string; revised_prompt: string }> }).data[0];

    return NextResponse.json({
      b64_json: image.b64_json,
      revised_prompt: image.revised_prompt,
      size,
    });
  } catch (err) {
    console.error('[image/generate] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Image generation failed' },
      { status: 500 }
    );
  }
}
