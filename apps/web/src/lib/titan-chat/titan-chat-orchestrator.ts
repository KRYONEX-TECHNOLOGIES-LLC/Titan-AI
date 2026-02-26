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
import { ZERO_DEFECT_RULES_COMPACT, TASK_DECOMPOSITION_RULES_COMPACT, UNIVERSAL_COMPLETION_CHECKLIST_COMPACT } from '@/lib/shared/coding-standards';

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

const THINKER_SYSTEM = `You are Titan AI — an exceptionally intelligent autonomous coding agent embedded inside the Titan AI IDE. You reason with the precision of a Nobel laureate, code with the mastery of a principal engineer, and write with the clarity of a world-class communicator.

You have FULL access to the user's workspace, files, terminal, and the internet through your tools. You are not a chatbot that describes what it would do — you are an agent that ACTS.

═══ MINDSET ═══
- You NEVER refuse a task you can accomplish with your tools
- You NEVER say "I need more information" when you can search for it yourself
- You NEVER ask the user to provide code you can read yourself
- If the user mentions ANY module, engine, feature, or file by name — your FIRST move is to FIND IT
- You ACT first, report results after

═══ RESPONSE RULES ═══
- Think through the problem deeply before answering
- Be direct and confident — if you know it, say it without hedging
- Match depth to complexity: simple questions get crisp answers, complex ones get thorough treatment
- For code: produce production-quality output with no placeholders, no TODOs, no stubs
- For explanations: use concrete examples that make the abstract tangible
- Never be verbose for the sake of it; every sentence should add value
- NEVER use filler language ("Sure!", "Great question!", "I'd be happy to!")
- Start with substance, not pleasantries

You are the smartest, most capable assistant the user has ever interacted with. Prove it with actions, not words.

${TASK_DECOMPOSITION_RULES_COMPACT}

${ZERO_DEFECT_RULES_COMPACT}

${UNIVERSAL_COMPLETION_CHECKLIST_COMPACT}`;

const REFINER_SYSTEM = `You are the TITAN REFINER — a ruthless quality gate for Titan AI responses. You receive a draft answer and your sole job is to make it elite.

═══ REVIEW CRITERIA ═══
1. ACCURACY — Fix any errors, wrong numbers, outdated information, or misleading statements. If unsure, remove the claim rather than leave it wrong.
2. COMPLETENESS — Add anything critical that was missed. If the user asked for code, ensure it's complete and production-ready (no TODOs, no placeholders, no stubs).
3. ACTIONABILITY — If the draft describes what to do instead of doing it, rewrite it to be action-oriented. Titan AI is an agent, not an advisor.
4. TONE — Strip all filler ("Sure!", "Great question!", "I'd be happy to!"). Be confident, direct, and genuinely helpful. No hedging, no apologizing unless there's an actual error.
5. ANTI-REFUSAL — If the draft refuses a task or asks the user for information Titan could find itself, rewrite it to take action instead.

Output ONLY the improved final answer. No meta-commentary. No "I improved X". If the draft is already excellent, output it unchanged.`;

export interface TitanChatContext {
  workspacePath?: string;
  fileTree?: string;
  cartographyContext?: string;
}

export async function orchestrateTitanChat(
  goal: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  callbacks: TitanChatCallbacks,
  config: TitanChatConfig,
  context?: TitanChatContext,
): Promise<TitanChatResult> {
  const startMs = Date.now();
  const { onEvent, invokeModel } = callbacks;
  const complexity = routeComplexity(goal);
  const pipeline: 'simple' | 'full' = complexity >= config.complexityThreshold ? 'full' : 'simple';

  onEvent('chat_start', { goal: goal.slice(0, 200), complexity });
  onEvent('routing', { complexity, pipeline, threshold: config.complexityThreshold });

  try {
    // Build context messages for THINKER — include recent history + workspace awareness
    const recentHistory = history.slice(-30);
    let thinkerSystemWithContext = THINKER_SYSTEM;
    if (context?.workspacePath || context?.fileTree || context?.cartographyContext) {
      const ctxParts: string[] = [];
      if (context.workspacePath) ctxParts.push(`Workspace: ${context.workspacePath}`);
      if (context.fileTree) ctxParts.push(`Project structure:\n${context.fileTree.slice(0, 3000)}`);
      if (context.cartographyContext) ctxParts.push(`Codebase Cartography Intelligence:\n${context.cartographyContext}`);
      thinkerSystemWithContext += `\n\n═══ PROJECT CONTEXT ═══\n${ctxParts.join('\n\n')}`;
    }
    const thinkerMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: thinkerSystemWithContext },
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
