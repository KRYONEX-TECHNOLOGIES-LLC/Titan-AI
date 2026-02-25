/**
 * Titan Voice Protocol — 4-role multi-model orchestrator.
 *
 * PERCEIVER  (Qwen3 VL 235B Thinking)  — vision + multimodal context
 * THINKER    (Qwen3.5 397B MoE)        — deep reasoning, idea generation
 * RESPONDER  (Gemini 2.0 Flash)         — fast conversational replies
 * SCANNER    (Devstral 2)               — code scanning, project health
 *
 * Cost: ~$0.001-0.005 per interaction (virtually free).
 */

import { callModelDirect } from '@/lib/llm-call';

export const VOICE_MODELS = {
  PERCEIVER: 'qwen/qwen3-235b-a22b',
  THINKER: 'qwen/qwen3.5-397b-a17b-20260216',
  RESPONDER: 'google/gemini-2.0-flash-001',
  SCANNER: 'mistralai/devstral-2-2512',
} as const;

export type VoiceRole = keyof typeof VOICE_MODELS;

export type MessageComplexity = 'simple' | 'code' | 'vision' | 'complex' | 'idea';

export function classifyComplexity(message: string, hasImage?: boolean): MessageComplexity {
  if (hasImage) return 'vision';

  const lower = message.toLowerCase();

  const codePatterns = [
    /\b(code|bug|error|fix|implement|refactor|function|class|component|api|route|build|deploy|test)\b/,
    /\b(typescript|javascript|python|react|next\.?js|css|html|sql)\b/,
    /```/,
    /\b(scan|project|file|directory|codebase)\b/,
  ];
  for (const pat of codePatterns) {
    if (pat.test(lower)) return 'code';
  }

  const complexPatterns = [
    /\b(explain|analyze|compare|design|architect|strategy|plan|think|reason|why|how does)\b/,
    /\b(optimize|improve|best practice|trade-?off|pros and cons)\b/,
  ];
  for (const pat of complexPatterns) {
    if (pat.test(lower)) return 'complex';
  }

  const ideaPatterns = [
    /\b(idea|invent|create|innovate|concept|patent|research|discover|brainstorm)\b/,
    /\b(what if|imagine|could we|possible to)\b/,
  ];
  for (const pat of ideaPatterns) {
    if (pat.test(lower)) return 'idea';
  }

  return 'simple';
}

function selectRoles(complexity: MessageComplexity): VoiceRole[] {
  switch (complexity) {
    case 'simple':
      return ['RESPONDER'];
    case 'code':
      return ['SCANNER', 'RESPONDER'];
    case 'vision':
      return ['PERCEIVER', 'RESPONDER'];
    case 'complex':
      return ['THINKER', 'RESPONDER'];
    case 'idea':
      return ['THINKER', 'RESPONDER'];
  }
}

export interface VoiceProtocolResult {
  response: string;
  roles: VoiceRole[];
  complexity: MessageComplexity;
  thinkingOutput?: string;
  scannerOutput?: string;
}

/**
 * Orchestrate a Titan Voice interaction.
 * Routes through the appropriate model(s) based on message complexity.
 */
export async function orchestrateVoice(params: {
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  hasImage?: boolean;
  imageBase64?: string;
}): Promise<VoiceProtocolResult> {
  const { systemPrompt, userMessage, conversationHistory = [], hasImage, imageBase64 } = params;
  const complexity = classifyComplexity(userMessage, hasImage);
  const roles = selectRoles(complexity);

  const history = conversationHistory.slice(-20);
  let thinkingOutput: string | undefined;
  let scannerOutput: string | undefined;
  let contextPrefix = '';

  for (const role of roles) {
    if (role === 'SCANNER') {
      scannerOutput = await callModelDirect(VOICE_MODELS.SCANNER, [
        { role: 'system', content: `You are SCANNER, a code analysis specialist within the Titan Voice system. Analyze the user's code question. Return a concise technical analysis (max 300 words). Focus on: file locations, relevant code patterns, potential issues, and recommended approach. Be precise and actionable.` },
        ...history.slice(-6),
        { role: 'user', content: userMessage },
      ], { temperature: 0.1, maxTokens: 2048 });
      contextPrefix = `[Code Analysis]\n${scannerOutput}\n\n`;
    }

    if (role === 'PERCEIVER') {
      const perceiverMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: `You are PERCEIVER, the visual analysis specialist of Titan Voice. Analyze what you see and provide a concise description of visual elements, layout issues, or design observations. Max 200 words.` },
        { role: 'user', content: imageBase64 ? `[Image attached]\n\n${userMessage}` : userMessage },
      ];
      const perceiverOutput = await callModelDirect(VOICE_MODELS.PERCEIVER, perceiverMessages, { temperature: 0.2, maxTokens: 1024 });
      contextPrefix = `[Visual Analysis]\n${perceiverOutput}\n\n`;
    }

    if (role === 'THINKER') {
      thinkingOutput = await callModelDirect(VOICE_MODELS.THINKER, [
        { role: 'system', content: `You are THINKER, the deep reasoning engine of Titan Voice. Analyze the question thoroughly. Provide insightful, innovative reasoning. Consider multiple angles, potential issues, and creative solutions. Max 400 words, be substantive.` },
        ...history.slice(-6),
        { role: 'user', content: userMessage },
      ], { temperature: 0.4, maxTokens: 3000 });
      contextPrefix = `[Deep Analysis]\n${thinkingOutput}\n\n`;
    }

    if (role === 'RESPONDER') {
      const responderMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: contextPrefix ? `${contextPrefix}[User's Question]\n${userMessage}` : userMessage },
      ];

      const response = await callModelDirect(VOICE_MODELS.RESPONDER, responderMessages, {
        temperature: 0.3,
        maxTokens: 4096,
      });

      return { response, roles, complexity, thinkingOutput, scannerOutput };
    }
  }

  const fallback = await callModelDirect(VOICE_MODELS.RESPONDER, [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ], { temperature: 0.3, maxTokens: 4096 });

  return { response: fallback, roles, complexity };
}
