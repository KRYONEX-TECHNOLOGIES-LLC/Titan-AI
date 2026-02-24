/**
 * Titan Chat Protocol — Model Configuration
 *
 * Ultra-cheap conversational protocol delivering Opus-level quality through
 * a 2-role adaptive pipeline. Routes simple questions to THINKER only,
 * complex questions through THINKER → REFINER.
 *
 * Cost: ~$0.001–$0.002 per message vs $0.015–$0.075 for Opus.
 */

export interface TitanChatConfig {
  models: {
    thinker: string;
    refiner: string;
  };
  complexityThreshold: number;
  maxOutputTokens: number;
  temperature: number;
}

export const DEFAULT_TITAN_CHAT_CONFIG: TitanChatConfig = {
  models: {
    // THINKER: Qwen3.5 397B MoE — SOTA reasoning, near-free pricing, thinks deeply
    thinker: 'qwen/qwen3.5-397b-a17b-20260216',
    // REFINER: Gemini 2.5 Flash — fast, catches errors, polishes tone
    refiner: 'google/gemini-2.5-flash',
  },
  // 0-10 complexity score — above this threshold adds REFINER pass
  complexityThreshold: 4,
  maxOutputTokens: 8192,
  temperature: 0.7,
};

export function routeComplexity(goal: string): number {
  const wordCount = goal.trim().split(/\s+/).length;
  let score = 0;

  // Length signal
  if (wordCount > 100) score += 3;
  else if (wordCount > 50) score += 2;
  else if (wordCount > 20) score += 1;

  // Multi-part question signals
  if (/\band\b.*\band\b/i.test(goal)) score += 1;
  if (/\?.*\?/.test(goal)) score += 1;
  if (/compare|contrast|analyze|evaluate|explain why|pros and cons|trade.?off/i.test(goal)) score += 2;
  if (/step.?by.?step|how do I build|implement|architect|design|create a/i.test(goal)) score += 2;
  if (/\b(code|function|class|algorithm|system|architecture|framework)\b/i.test(goal)) score += 1;

  return Math.min(10, score);
}
