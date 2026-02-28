import { NextRequest } from 'next/server';
import { TITAN_VOICE_PERSONALITY } from '@/lib/voice/titan-personality';
import { serializeBrainContext } from '@/lib/voice/brain-storage';
import { callModelDirect, callModelWithTools } from '@/lib/llm-call';
import { VOICE_MODELS, classifyComplexity, type VoiceRole } from '@/lib/voice/titan-voice-protocol';
import { getToolSchema, executeToolServerSide, isToolDangerous, type ClientState } from '@/lib/voice/alfred-tools';

export const dynamic = 'force-dynamic';

const MAX_TOOL_ROUNDS = 5;

interface VoiceRequestBody {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  hasImage?: boolean;
  imageBase64?: string;
  memoryContext?: string;
  brainContext?: string;
  codeDirectory?: string;
  projectStatus?: string;
  learnedStrategies?: string;
  systemState?: ClientState;
  workspacePath?: string;
  workspaceName?: string;
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

        const now = new Date();
        const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        const systemPrompt = [
          TITAN_VOICE_PERSONALITY,
          `\n[CURRENT DATE AND TIME]\nToday is ${currentDate}, ${currentTime}. The current year is ${now.getFullYear()}. You are fully up-to-date. When the user asks you to look up current information, use the current year. Never say you are stuck in a past year.`,
          body.memoryContext ? `\n[PERSISTENT MEMORY]\n${body.memoryContext}\n\nUse this memory to recall user preferences, past decisions, and personal details. Reference them naturally in conversation.` : '',
          body.codeDirectory ? `\n[CODE DIRECTORY]\n${body.codeDirectory}` : '',
          body.projectStatus ? `\n[PROJECT STATUS]\n${body.projectStatus}` : '',
          brainContext ? `\n[BRAIN KNOWLEDGE]\n${brainContext}` : '',
          body.learnedStrategies ? `\n[LEARNED STRATEGIES]\n${body.learnedStrategies}` : '',
          body.workspacePath ? `\n[ACTIVE WORKSPACE]\nPath: ${body.workspacePath}\nName: ${body.workspaceName || 'Unknown'}\nIs Titan AI: ${/titan[\s-_]?ai/i.test(body.workspacePath || '') ? 'YES' : 'NO'}` : '',
          '\nCONVERSATION RULES:',
          '- Keep spoken responses concise (2-4 sentences) unless the user asks for detail.',
          '- You are speaking aloud, so be natural and conversational.',
          '- Reference things you remember about the user from memory.',
          '- You have REAL tool-calling capabilities. CALL the tool — do NOT describe what you would do.',
          '- Tool results are SYNCHRONOUS — when a tool returns, you HAVE the data. NEVER say "I\'ll check" or "I\'ll let you know." Summarize the results NOW.',
          '- BANNED: "I\'ll check and let you know", "being checked", "results will be available soon", "would you like me to check?"',
          '- When the user says "yes", "ok", "proceed", "go ahead", or "do it" — EXECUTE immediately.',
          '- For dangerous actions (starting protocols, harvester, git), tell the user what you plan to do first.',
          '- You are an ultimate conversationalist: witty, insightful, warm, and sharp.',
        ].filter(Boolean).join('\n');

        emit('voice_thinking', { roles: ['analyzing'] });

        const complexity = classifyComplexity(body.message, body.hasImage);
        const history = (body.conversationHistory || []).slice(-30);
        let contextPrefix = '';

        // Pre-processing roles (Scanner, Thinker, Perceiver)
        if (complexity === 'code') {
          try {
            const scannerOutput = await callModelDirect(VOICE_MODELS.SCANNER, [
              { role: 'system', content: 'You are SCANNER, a code analysis specialist. Analyze the user\'s code question. Return a concise technical analysis (max 200 words). Focus on: file locations, patterns, issues, approach.' },
              ...history.slice(-12),
              { role: 'user', content: body.message },
            ], { temperature: 0.1, maxTokens: 1024 });
            if (scannerOutput) {
              contextPrefix = `[Code Analysis]\n${scannerOutput}\n\n`;
              emit('voice_scanner', { output: scannerOutput.slice(0, 500) });
            }
          } catch { /* scanner optional */ }
        } else if (complexity === 'complex' || complexity === 'idea') {
          try {
            const thinkingOutput = await callModelDirect(VOICE_MODELS.THINKER, [
              { role: 'system', content: 'You are THINKER, the deep reasoning engine. Analyze thoroughly, consider multiple angles, creative solutions. Max 300 words, be substantive.' },
              ...history.slice(-12),
              { role: 'user', content: body.message },
            ], { temperature: 0.4, maxTokens: 2048 });
            if (thinkingOutput) {
              contextPrefix = `[Deep Analysis]\n${thinkingOutput}\n\n`;
              emit('voice_thinking_done', { output: thinkingOutput.slice(0, 500) });
            }
          } catch { /* thinker optional */ }
        }

        // Build messages for the RESPONDER with tool-calling
        const roles: VoiceRole[] = complexity === 'code' ? ['SCANNER', 'RESPONDER'] :
          complexity === 'complex' || complexity === 'idea' ? ['THINKER', 'RESPONDER'] :
          complexity === 'vision' ? ['PERCEIVER', 'RESPONDER'] : ['RESPONDER'];

        emit('voice_roles', { roles, complexity });

        const messages: Array<{ role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[] }> = [
          { role: 'system', content: systemPrompt },
          ...history.map(h => ({ role: h.role, content: h.content })),
          { role: 'user', content: contextPrefix ? `${contextPrefix}[User]\n${body.message}` : body.message },
        ];

        const toolSchema = getToolSchema();
        const clientActions: Array<{ action: string; params: Record<string, string> }> = [];
        let finalResponse = '';
        const clientState = body.systemState;

        // Tool-calling loop: LLM decides tools → execute → feed results → repeat
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const result = await callModelWithTools(
            VOICE_MODELS.RESPONDER,
            messages,
            toolSchema,
            { temperature: 0.3, maxTokens: 4096 },
          );

          if (result.toolCalls.length === 0) {
            finalResponse = result.content || '';
            break;
          }

          // Process each tool call
          const assistantToolCalls = result.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          }));

          messages.push({
            role: 'assistant',
            content: result.content,
            tool_calls: assistantToolCalls,
          });

          for (const tc of result.toolCalls) {
            emit('voice_tool_call', { name: tc.name, args: tc.arguments, dangerous: isToolDangerous(tc.name) });

            const toolResult = await executeToolServerSide(tc.name, tc.arguments, clientState, body.workspacePath);

            if (toolResult.clientAction) {
              clientActions.push(toolResult.clientAction);
            }

            emit('voice_tool_result', { name: tc.name, success: toolResult.success, message: toolResult.message.slice(0, 500) });

            messages.push({
              role: 'tool',
              content: JSON.stringify({ success: toolResult.success, result: toolResult.message, data: toolResult.data }),
              tool_call_id: tc.id,
            });
          }

          // If this was the last round and we still have tool calls, do one final call without tools
          if (round === MAX_TOOL_ROUNDS - 1) {
            const finalResult = await callModelDirect(
              VOICE_MODELS.RESPONDER,
              messages.map(m => ({ role: m.role, content: m.content || '' })),
              { temperature: 0.3, maxTokens: 4096 },
            );
            finalResponse = finalResult;
          }
        }

        if (!finalResponse) {
          try {
            const summaryMessages = messages.map(m => ({ role: m.role, content: m.content || '' }));
            summaryMessages.push({
              role: 'user',
              content: 'Summarize what your tools returned and give the user a clear, concrete answer. Do NOT say "I\'ll check" or "results pending" — you already have the data from the tool calls above.',
            });
            const summarized = await callModelDirect(
              VOICE_MODELS.RESPONDER,
              summaryMessages,
              { temperature: 0.3, maxTokens: 4096 },
            );
            if (summarized && summarized.trim().length > 5) {
              finalResponse = summarized;
            }
          } catch { /* fallback below */ }
        }
        if (!finalResponse) {
          finalResponse = 'I\'ve completed the action, sir. Let me know if you need details.';
        }

        emit('voice_response', {
          content: finalResponse,
          roles,
          complexity,
          clientActions: clientActions.length > 0 ? clientActions : undefined,
        });

        emit('voice_done', {
          success: true,
          roles,
          complexity,
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
