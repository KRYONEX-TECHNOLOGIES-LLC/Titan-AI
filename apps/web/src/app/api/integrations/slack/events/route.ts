import { NextRequest, NextResponse } from 'next/server';

interface SlackEvent {
  type: string;
  challenge?: string;
  token?: string;
  event?: {
    type: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    bot_id?: string;
    subtype?: string;
  };
  team_id?: string;
  event_id?: string;
}

export async function POST(req: NextRequest) {
  let body: SlackEvent;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === 'event_callback' && body.event) {
    const event = body.event;

    if (event.bot_id || event.subtype === 'bot_message') {
      return NextResponse.json({ ok: true });
    }

    if (event.type === 'message' && event.text) {
      forwardToAlfred(event.text, event.user, event.channel, body.team_id).catch(() => {});
      return NextResponse.json({ ok: true });
    }

    if (event.type === 'app_mention' && event.text) {
      const cleaned = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
      forwardToAlfred(cleaned, event.user, event.channel, body.team_id).catch(() => {});
      return NextResponse.json({ ok: true });
    }
  }

  return NextResponse.json({ ok: true });
}

async function forwardToAlfred(
  text: string,
  userId?: string,
  channel?: string,
  teamId?: string,
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    await fetch(`${baseUrl}/api/voice/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source: 'slack',
        meta: { userId, channel, teamId },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
