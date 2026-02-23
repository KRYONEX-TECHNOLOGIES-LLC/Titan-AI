// ── Titan Forge — Training Data Exporter ──
// Exports high-quality samples to fine-tuning formats.
// Supports ShareGPT (Axolotl/Unsloth) and OpenAI JSONL formats.
// Only exports samples with quality_score >= minScore (default: 7).

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { ForgeDB } from './db.js';
import type {
  ForgeSample,
  ShareGPTConversation,
  OpenAIFineTuneEntry,
  ExportStats,
  ChatMessage,
  ToolCall,
} from './types.js';

const db = new ForgeDB();

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

function formatToolCallsAsText(toolCalls: ToolCall[]): string {
  if (toolCalls.length === 0) return '';
  return toolCalls
    .map((tc) => {
      let args: unknown;
      try { args = JSON.parse(tc.function.arguments); } catch { args = tc.function.arguments; }
      return `<tool_call>\n{"name": "${tc.function.name}", "arguments": ${JSON.stringify(args, null, 2)}}\n</tool_call>`;
    })
    .join('\n');
}

function sampleToShareGPT(sample: ForgeSample): ShareGPTConversation {
  const conversations: ShareGPTConversation['conversations'] = [];

  // System prompt
  if (sample.system_prompt) {
    conversations.push({ from: 'system', value: sample.system_prompt });
  }

  // Conversation turns
  for (const msg of sample.messages) {
    if (msg.role === 'system') continue; // already added
    if (msg.role === 'user') {
      conversations.push({ from: 'human', value: msg.content || '' });
    } else if (msg.role === 'assistant') {
      const toolText = formatToolCallsAsText(msg.tool_calls || []);
      const content = [msg.content, toolText].filter(Boolean).join('\n\n');
      conversations.push({ from: 'gpt', value: content });
    }
    // Skip tool results — they are part of the assistant's context, not training targets
  }

  // Add the final model response as the last gpt turn
  const toolText = formatToolCallsAsText(sample.tool_calls);
  const finalResponse = [sample.response, toolText].filter(Boolean).join('\n\n');
  if (finalResponse) {
    // Avoid duplicating if it's already the last message
    const lastMsg = conversations[conversations.length - 1];
    if (!lastMsg || lastMsg.from !== 'gpt' || lastMsg.value !== finalResponse) {
      conversations.push({ from: 'gpt', value: finalResponse });
    }
  }

  return { conversations };
}

function sampleToOpenAIJSONL(sample: ForgeSample): OpenAIFineTuneEntry {
  const messages: OpenAIFineTuneEntry['messages'] = [];

  if (sample.system_prompt) {
    messages.push({ role: 'system', content: sample.system_prompt });
  }

  for (const msg of sample.messages as ChatMessage[]) {
    if (msg.role === 'system') continue;
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      const entry: OpenAIFineTuneEntry['messages'][number] = {
        role: 'assistant',
        content: msg.content || '',
      };
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        entry.tool_calls = msg.tool_calls;
      }
      messages.push(entry);
    }
  }

  // Final assistant turn with the captured response
  const finalEntry: OpenAIFineTuneEntry['messages'][number] = {
    role: 'assistant',
    content: sample.response,
  };
  if (sample.tool_calls.length > 0) {
    finalEntry.tool_calls = sample.tool_calls;
  }

  // Avoid duplicating if already present
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content !== sample.response) {
    messages.push(finalEntry);
  }

  return { messages };
}

function deduplicateByHash(samples: ForgeSample[]): ForgeSample[] {
  const seen = new Map<string, ForgeSample>();
  for (const sample of samples) {
    const existing = seen.get(sample.prompt_hash);
    if (!existing || sample.quality_score > existing.quality_score) {
      seen.set(sample.prompt_hash, sample);
    }
  }
  return Array.from(seen.values());
}

function computeStats(samples: ForgeSample[]): ExportStats {
  const byModel: Record<string, number> = {};
  const byQuality: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  let earliest = '';
  let latest = '';

  for (const s of samples) {
    byModel[s.model_id] = (byModel[s.model_id] || 0) + 1;

    const tier = s.quality_score >= 9 ? 'elite (9-10)'
      : s.quality_score >= 7 ? 'high (7-8)'
      : s.quality_score >= 5 ? 'medium (5-6)'
      : 'low (<5)';
    byQuality[tier] = (byQuality[tier] || 0) + 1;
    byOutcome[s.outcome] = (byOutcome[s.outcome] || 0) + 1;

    if (!earliest || s.created_at < earliest) earliest = s.created_at;
    if (!latest || s.created_at > latest) latest = s.created_at;
  }

  return {
    total_exported: samples.length,
    by_model: byModel,
    by_quality_tier: byQuality,
    by_outcome: byOutcome,
    date_range: { earliest, latest },
  };
}

export class ForgeExporter {
  async exportToShareGPT(
    outputPath: string,
    opts: { minScore?: number; limit?: number; markExported?: boolean } = {},
  ): Promise<ExportStats> {
    const { minScore = 7, limit = 10000, markExported = true } = opts;

    const raw = await db.getSamplesForExport(minScore, limit);
    const samples = deduplicateByHash(raw);

    const conversations = samples.map(sampleToShareGPT);
    ensureDir(outputPath);
    writeFileSync(outputPath, JSON.stringify(conversations, null, 2), 'utf-8');

    if (markExported && samples.length > 0) {
      await db.markExported(samples.map((s) => s.id));
    }

    const stats = computeStats(samples);
    const statsPath = outputPath.replace('.json', '-stats.json');
    writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');

    console.log(`[forge/exporter] Exported ${samples.length} samples (ShareGPT) → ${outputPath}`);
    console.log(`[forge/exporter] Quality distribution:`, stats.by_quality_tier);
    return stats;
  }

  async exportToJSONL(
    outputPath: string,
    opts: { minScore?: number; limit?: number; markExported?: boolean } = {},
  ): Promise<ExportStats> {
    const { minScore = 7, limit = 10000, markExported = true } = opts;

    const raw = await db.getSamplesForExport(minScore, limit);
    const samples = deduplicateByHash(raw);

    const lines = samples.map((s) => JSON.stringify(sampleToOpenAIJSONL(s)));
    ensureDir(outputPath);
    writeFileSync(outputPath, lines.join('\n'), 'utf-8');

    if (markExported && samples.length > 0) {
      await db.markExported(samples.map((s) => s.id));
    }

    const stats = computeStats(samples);
    const statsPath = outputPath.replace('.jsonl', '-stats.json');
    writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');

    console.log(`[forge/exporter] Exported ${samples.length} samples (JSONL) → ${outputPath}`);
    return stats;
  }

  // Export curriculum phase subsets
  async exportCurriculum(
    outputDir: string,
    opts: { minScore?: number } = {},
  ): Promise<void> {
    const { minScore = 7 } = opts;
    const raw = await db.getSamplesForExport(minScore, 50000);
    const samples = deduplicateByHash(raw);

    // Phase 1: All high-value samples (general capability)
    const generalPath = join(outputDir, 'phase1-general.json');
    writeFileSync(generalPath, JSON.stringify(samples.map(sampleToShareGPT), null, 2));
    console.log(`[forge/exporter] Phase 1 (general): ${samples.length} samples → ${generalPath}`);

    // Phase 2: Only samples with code tool calls (code specialization)
    const codingTools = new Set(['edit_file', 'create_file', 'delete_file', 'run_command']);
    const codeSamples = samples.filter((s) =>
      s.tool_calls.some((tc) => codingTools.has(tc.function?.name)),
    );
    const codePath = join(outputDir, 'phase2-code.json');
    writeFileSync(codePath, JSON.stringify(codeSamples.map(sampleToShareGPT), null, 2));
    console.log(`[forge/exporter] Phase 2 (code): ${codeSamples.length} samples → ${codePath}`);

    // Phase 3: Only Titan Protocol samples (multi-agent patterns)
    const titanSamples = samples.filter((s) => s.model_id.startsWith('titan-'));
    const titanPath = join(outputDir, 'phase3-titan.json');
    writeFileSync(titanPath, JSON.stringify(titanSamples.map(sampleToShareGPT), null, 2));
    console.log(`[forge/exporter] Phase 3 (titan): ${titanSamples.length} samples → ${titanPath}`);

    // Summary
    const summary = {
      phase1_general: samples.length,
      phase2_code: codeSamples.length,
      phase3_titan: titanSamples.length,
      generated_at: new Date().toISOString(),
    };
    writeFileSync(join(outputDir, 'curriculum-summary.json'), JSON.stringify(summary, null, 2));
  }
}
