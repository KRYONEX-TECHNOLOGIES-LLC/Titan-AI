/**
 * AI Gateway API - Proxies to /api/chat
 * Provides an OpenAI-compatible endpoint for external integrations and MCP clients.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    const lastMessage = body.messages[body.messages.length - 1];
    const userMessage = typeof lastMessage?.content === 'string' ? lastMessage.content : '';

    const internalUrl = new URL('/api/chat', request.url);
    const res = await fetch(internalUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' },
      body: JSON.stringify({
        message: userMessage,
        model: body.model || 'claude-sonnet-4.6',
        stream: body.stream ?? false,
        sessionId: `gateway-${Date.now()}`,
      }),
    });

    if (body.stream) {
      return new Response(res.body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await res.json();
    return NextResponse.json({
      id: data.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model || body.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: data.content || data.error || '' },
        finish_reason: 'stop',
      }],
      usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (error) {
    console.error('Gateway error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { MODEL_REGISTRY } = await import('@/lib/model-registry');
    return NextResponse.json({
      status: 'ok',
      models: MODEL_REGISTRY.map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        providerModelId: m.providerModelId,
      })),
    });
  } catch {
    return NextResponse.json({ status: 'ok', models: [] });
  }
}
