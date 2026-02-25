import { NextRequest } from 'next/server';
import { orchestrateVoice } from '@/lib/voice/titan-voice-protocol';
import { TITAN_VOICE_PERSONALITY } from '@/lib/voice/titan-personality';
import { serializeBrainContext } from '@/lib/voice/brain-storage';

export const dynamic = 'force-dynamic';

interface VoiceRequestBody {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  hasImage?: boolean;
  imageBase64?: string;
  memoryContext?: string;
  brainContext?: string;
  codeDirectory?: string;
  projectStatus?: string;
}

export async function POST(request: NextRequest) {
  let body: VoiceRequestBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.message || typeof body.message !== 'string') {
    return new Response(JSON.stringify({ error: 'message string required' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch { /* stream closed */ }
      };

      try {
        emit('voice_start', { message: body.message });

        let brainContext = '';
        try {
          brainContext = body.brainContext || serializeBrainContext(1500);
        } catch { /* client-only function, skip on server */ }

        const systemPrompt = [
          TITAN_VOICE_PERSONALITY,
          body.memoryContext ? `\n[PERSISTENT MEMORY]\n${body.memoryContext}\n\nUse this memory to recall user preferences, past decisions, and personal details. Reference them naturally in conversation.` : '',
          body.codeDirectory ? `\n[CODE DIRECTORY]\n${body.codeDirectory}` : '',
          body.projectStatus ? `\n[PROJECT STATUS]\n${body.projectStatus}` : '',
          brainContext ? `\n[BRAIN KNOWLEDGE]\n${brainContext}` : '',
          '\nCONVERSATION RULES:',
          '- Keep spoken responses concise (2-4 sentences) unless the user asks for detail.',
          '- You are speaking aloud, so be natural and conversational.',
          '- Reference things you remember about the user from memory — their name, preferences, past conversations.',
          '- When the user tells you something personal (name, preference, opinion), acknowledge it warmly and remember it.',
          '- You are an ultimate conversationalist: witty, insightful, warm, and sharp. Like a brilliant friend who also happens to be a genius.',
        ].filter(Boolean).join('\n');

        emit('voice_thinking', { roles: ['analyzing'] });

        const result = await orchestrateVoice({
          systemPrompt,
          userMessage: body.message,
          conversationHistory: body.conversationHistory,
          hasImage: body.hasImage,
          imageBase64: body.imageBase64,
        });

        emit('voice_roles', {
          roles: result.roles,
          complexity: result.complexity,
        });

        if (result.scannerOutput) {
          emit('voice_scanner', { output: result.scannerOutput.slice(0, 500) });
        }
        if (result.thinkingOutput) {
          emit('voice_thinking_done', { output: result.thinkingOutput.slice(0, 500) });
        }

        emit('voice_response', {
          content: result.response,
          roles: result.roles,
          complexity: result.complexity,
        });

        emit('voice_done', {
          success: true,
          roles: result.roles,
          complexity: result.complexity,
        });

      } catch (error) {
        emit('voice_error', {
          message: error instanceof Error ? error.message : 'Voice protocol failed',
        });
      } finally {
        controller.close();
      }
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
