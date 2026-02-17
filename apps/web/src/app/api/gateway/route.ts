// AI Gateway API Route
// apps/web/src/app/api/gateway/route.ts

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

interface ChatRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    // Validate request
    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    const model = body.model || 'claude-3.5-sonnet';
    const stream = body.stream ?? false;

    // In production, this would route to the appropriate AI provider
    // via LiteLLM Proxy or OpenRouter

    if (stream) {
      // Return streaming response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const response = `This is a streaming response from ${model}. In production, this would connect to actual AI providers.`;
          
          for (const char of response) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: char })}\n\n`));
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Non-streaming response
    const response = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: `Response from ${model}. Configure API keys to enable actual AI responses.`,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: body.messages.reduce((acc, m) => acc + m.content.length / 4, 0),
        completion_tokens: 50,
        total_tokens: 0,
      },
    };

    response.usage.total_tokens = response.usage.prompt_tokens + response.usage.completion_tokens;

    return NextResponse.json(response);
  } catch (error) {
    console.error('Gateway error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    models: [
      { id: 'claude-4.6-sonnet', provider: 'anthropic', tier: 'frontier' },
      { id: 'claude-3.5-sonnet', provider: 'anthropic', tier: 'frontier' },
      { id: 'gpt-5.3-turbo', provider: 'openai', tier: 'frontier' },
      { id: 'gpt-4o', provider: 'openai', tier: 'standard' },
      { id: 'deepseek-v3', provider: 'deepseek', tier: 'standard' },
      { id: 'llama-3.2-8b', provider: 'local', tier: 'local' },
      { id: 'qwen-2.5-coder-7b', provider: 'local', tier: 'local' },
    ],
  });
}
