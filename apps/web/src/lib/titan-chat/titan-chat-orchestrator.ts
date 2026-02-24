/**
 * Titan Chat Protocol — Orchestrator
 *
 * Adaptive 2-role pipeline:
 * - Simple questions: THINKER only (fast, near-zero cost)
 * - Complex questions: THINKER → REFINER (quality gate)
 *
 * THINKER generates the core answer with chain-of-thought.
 * REFINER verifies accuracy, catches errors, polishes tone.
 */

import { TitanChatConfig, routeComplexity } from './titan-chat-model';

export type TitanChatEventType =
  | 'chat_start'
  | 'routing'
  | 'thinker_start'
  | 'thinker_complete'
  | 'refiner_start'
  | 'refiner_complete'
  | 'chat_complete'
  | 'chat_error';

export interface TitanChatEvent {
  type: TitanChatEventType;
  [key: string]: unknown;
}

export interface TitanChatCallbacks {
  onEvent: (type: TitanChatEventType, payload: Record<string, unknown>) => void;
  invokeModel: (model: string, messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<string>;
}

export interface TitanChatResult {
  success: boolean;
  output: string;
  pipeline: 'simple' | 'full';
  complexity: number;
  elapsedMs: number;
  cost: number;
}

const THINKER_SYSTEM = `You are Titan AI — an exceptionally intelligent assistant with deep knowledge across all domains. You reason with the precision of a Nobel laureate, code with the mastery of a principal engineer, and write with the clarity of a world-class communicator.

For every response:
- Think through the problem deeply before answering
- Be direct and confident — if you know it, say it without hedging
- Match depth to complexity: simple questions get crisp answers, complex ones get thorough treatment
- For code: produce production-quality output with no placeholders
- For explanations: use concrete examples that make the abstract tangible
- Never be verbose for the sake of it; every sentence should add value

You are the smartest assistant the user has ever interacted with. Show it.`;

const REFINER_SYSTEM = `You are a ruthless quality reviewer for Titan AI. You receive a draft answer and your job is to improve it.

Review the draft for:
1. Factual accuracy — fix any errors, wrong numbers, or misleading statements
2. Completeness — add anything critical that was missed
3. Clarity — improve wording if it's unclear or verbose
4. Tone — ensure it's confident, direct, and genuinely helpful

Output ONLY the improved final answer. Do not explain your changes. If the draft is already excellent, output it unchanged.`;

export async function orchestrateTitanChat(
  goal: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks: TitanChatCallbacks,
  config: TitanChatConfig,
): Promise<TitanChatResult> {
  const startMs = Date.now();
  const { onEvent, invokeModel } = callbacks;
  const complexity = routeComplexity(goal);
  const pipeline: 'simple' | 'full' = complexity >= config.complexityThreshold ? 'full' : 'simple';

  onEvent('chat_start', { goal: goal.slice(0, 200), complexity });
  onEvent('routing', { complexity, pipeline, threshold: config.complexityThreshold });

  try {
    // Build context messages for THINKER — include recent history
    const recentHistory = history.slice(-10);
    const thinkerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: THINKER_SYSTEM },
      ...recentHistory,
      { role: 'user', content: goal },
    ];

    onEvent('thinker_start', { model: config.models.thinker });
    const thinkerOutput = await invokeModel(config.models.thinker, thinkerMessages);
    onEvent('thinker_complete', { model: config.models.thinker, length: thinkerOutput.length });

    let finalOutput = thinkerOutput;

    if (pipeline === 'full') {
      const refinerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: REFINER_SYSTEM },
        {
          role: 'user',
          content: `Original question: ${goal}\n\nDraft answer:\n${thinkerOutput}\n\nReview and improve the draft answer. Output only the improved answer.`,
        },
      ];

      onEvent('refiner_start', { model: config.models.refiner });
      finalOutput = await invokeModel(config.models.refiner, refinerMessages);
      onEvent('refiner_complete', { model: config.models.refiner, length: finalOutput.length });
    }

    const elapsedMs = Date.now() - startMs;
    // Rough cost estimate: thinker ~$0.15/1M in + $1.00/1M out; refiner ~$0.15/1M in + $0.60/1M out
    const thinkerCost = ((goal.length / 4) * 0.00000015) + ((thinkerOutput.length / 4) * 0.000001);
    const refinerCost = pipeline === 'full'
      ? (((goal.length + thinkerOutput.length) / 4) * 0.00000015) + ((finalOutput.length / 4) * 0.0000006)
      : 0;
    const cost = thinkerCost + refinerCost;

    onEvent('chat_complete', { success: true, pipeline, complexity, elapsedMs, cost });

    return { success: true, output: finalOutput, pipeline, complexity, elapsedMs, cost };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Titan Chat orchestration failed';
    onEvent('chat_error', { message });
    return {
      success: false,
      output: `Titan Chat encountered an error: ${message}`,
      pipeline,
      complexity,
      elapsedMs: Date.now() - startMs,
      cost: 0,
    };
  }
}
