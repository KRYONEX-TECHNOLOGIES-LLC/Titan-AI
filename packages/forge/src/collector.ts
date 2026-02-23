// ── Titan Forge — Collector ──
// Silently captures high-value model interactions from the chat pipeline.
// All operations are async and fire-and-forget — they NEVER block the response stream.

import { createHash } from 'crypto';
import { ForgeDB } from './db.js';
import type { CollectorInput, ModelTier, ChatMessage } from './types.js';

// Models that are "teachers" — only their outputs enter the training set.
// Economy/local models are students — we NEVER train on their outputs.
const TEACHER_MODEL_IDS = new Set([
  // Titan Protocol (multi-agent — uses frontier models internally)
  'titan-protocol',
  'titan-protocol-v2',
  'titan-supreme-protocol',
  'titan-omega-protocol',
  // Claude family
  'claude-sonnet-4.6',
  'claude-opus-4.6',
  'claude-4.6-sonnet',
  'claude-4.6-opus',
  'anthropic/claude-opus-4.6',
  'anthropic/claude-sonnet-4.6',
  // OpenAI
  'gpt-5.3',
  'o3',
  'o1',
  'openai/gpt-5.3',
  'openai/o3',
  'openai/o1',
  // Gemini
  'gemini-3.1-pro',
  'gemini-2.5-pro',
  'google/gemini-2.5-pro',
  // Qwen frontier
  'qwen3-max-thinking',
  'qwen3.5-plus-02-15',
  'qwen3.5-397b',
  'qwen/qwen3.5-plus-02-15',
  'qwen/qwen3-max-thinking',
  // Others
  'grok-4',
  'x-ai/grok-4',
  'meta-llama/llama-4-maverick',
  'llama-4-maverick',
]);

// Top-3 models get a +1 bonus in the quality gate
export const TOP_TIER_MODELS = new Set([
  'claude-opus-4.6',
  'anthropic/claude-opus-4.6',
  'gpt-5.3',
  'openai/gpt-5.3',
  'o3',
  'openai/o3',
]);

function computePromptHash(messages: ChatMessage[]): string {
  // Hash based on the last user message content
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const content = lastUser?.content || '';
  return createHash('sha256').update(content).digest('hex').slice(0, 32);
}

function inferModelTier(modelId: string): ModelTier {
  if (TEACHER_MODEL_IDS.has(modelId)) return 'frontier';
  // Ollama models are always local
  if (modelId.startsWith('ollama-') || modelId.includes('ollama')) return 'local';
  return 'economy';
}

function truncateSystemPrompt(prompt: string, maxChars = 4000): string {
  if (prompt.length <= maxChars) return prompt;
  return prompt.slice(0, maxChars) + '\n[...truncated for storage...]';
}

const db = new ForgeDB();

// In-memory queue for async writes — prevents DB pressure spikes
const writeQueue: Array<() => Promise<void>> = [];
let queueRunning = false;

async function drainQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  while (writeQueue.length > 0) {
    const task = writeQueue.shift();
    if (task) {
      try {
        await task();
      } catch {
        // Swallow all errors — distillation is best-effort, never blocks chat
      }
    }
  }
  queueRunning = false;
}

function enqueue(task: () => Promise<void>): void {
  writeQueue.push(task);
  // Drain asynchronously without awaiting
  drainQueue().catch(() => {});
}

export class ForgeCollector {
  // Map from session+turn to sample ID so signals can reference the right sample
  private pendingSamples = new Map<string, string>();

  capture(input: CollectorInput): void {
    // Determine tier first — reject non-teachers immediately, no DB write
    const tier = input.modelTier || inferModelTier(input.modelId);
    if (tier !== 'frontier') return;

    const promptHash = computePromptHash(input.messages);
    const captureKey = `${input.sessionId || 'unknown'}-${Date.now()}`;

    enqueue(async () => {
      // Dedup check: if we already have a high-scoring sample for this prompt, skip
      const existing = await db.dedupCheck(promptHash);
      if (existing.exists && (existing.score ?? 0) >= 8) {
        // Already have elite-tier data for this prompt — don't store duplicates
        return;
      }

      const id = await db.insertSample({
        session_id: input.sessionId,
        model_id: input.modelId,
        model_tier: tier,
        system_prompt: truncateSystemPrompt(input.systemPrompt || ''),
        messages: input.messages,
        response: input.response,
        tool_calls: input.toolCalls || [],
        tool_results: [],
        tokens_in: input.tokensIn ?? null,
        tokens_out: input.tokensOut ?? null,
        latency_ms: input.latencyMs ?? null,
        cost_usd: input.costUsd ?? null,
        quality_score: 0,
        quality_signals: null,
        outcome: 'unknown',
        prompt_hash: promptHash,
      });

      if (id) {
        this.pendingSamples.set(captureKey, id);
        // Expose for signal reporting (key returned to useChat.ts)
        console.log(`[forge] Captured sample ${id} from ${input.modelId}`);
      }
    });

    // Return the captureKey synchronously so signals can reference it
    // (stored in pendingSamples once DB write completes)
  }

  // Returns the sample ID for a capture key (used by signal reporters)
  getSampleId(captureKey: string): string | undefined {
    return this.pendingSamples.get(captureKey);
  }

  // Called when tool results come back from useChat.ts
  reportToolResults(
    sampleId: string,
    toolResults: Array<{
      tool_call_id: string;
      tool_name: string;
      success: boolean;
      output: string;
      metadata?: Record<string, unknown>;
    }>,
  ): void {
    enqueue(async () => {
      await db.appendToolResults(sampleId, toolResults);
    });
  }

  // Queue size for monitoring
  get queueDepth(): number {
    return writeQueue.length;
  }
}

// Singleton instance used by route.ts and useChat.ts
export const forgeCollector = new ForgeCollector();
