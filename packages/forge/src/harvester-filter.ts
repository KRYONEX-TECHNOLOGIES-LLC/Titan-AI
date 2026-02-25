// ── Titan Forge — Harvester Filter Pipeline ──
// 5-pass filtering: rule strip → AI detection (soft penalty) → quality judge → format → dedup
// AI-detected content gets a quality penalty instead of hard rejection.
// High-quality content passes regardless of origin; low-quality AI slop gets filtered by score.

import { createHash } from 'crypto';
import { ForgeDB } from './db.js';
import { detectAIContent, detectAIHeuristic } from './ai-content-detector.js';
import { minHashDedup } from './minhash-dedup.js';
import type { ScrapedItem } from './harvester.js';
import type { HarvestSample } from './types.js';

const db = new ForgeDB();

// ══════════════════════════════════════════════════════
// PASS 1: Rule-Based Filter (removes 70% of garbage)
// ══════════════════════════════════════════════════════

const JUNK_PATTERNS = [
  /cookie\s*(policy|consent|banner)/i,
  /accept\s*all\s*cookies/i,
  /subscribe\s*(to\s*our|now|today)/i,
  /sign\s*up\s*for\s*(our|free|the)/i,
  /follow\s*us\s*on\s*(twitter|x|linkedin|facebook)/i,
  /all\s*rights\s*reserved/i,
  /privacy\s*policy/i,
  /terms\s*(of\s*service|and\s*conditions)/i,
  /advertisement|sponsored\s*content/i,
  /click\s*here\s*to\s*(read|learn|subscribe)/i,
  /\bseo\b.*\boptimiz/i,
  /we\s*use\s*cookies/i,
];

const MIN_CONTENT_LENGTH = 150;
const MAX_CONTENT_LENGTH = 50000;
const MIN_CODE_RATIO = 0.05; // at least 5% of content should look like code for coding sources

function pass1_ruleFilter(items: ScrapedItem[]): ScrapedItem[] {
  return items.filter(item => {
    const content = item.raw_content;

    if (content.length < MIN_CONTENT_LENGTH) return false;
    if (content.length > MAX_CONTENT_LENGTH) return false;

    const junkScore = JUNK_PATTERNS.reduce((score, pattern) => {
      return score + (pattern.test(content) ? 1 : 0);
    }, 0);
    if (junkScore >= 3) return false;

    if (item.source === 'stackoverflow' || item.source === 'github') {
      const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).join('').length;
      const backtickCode = (content.match(/`[^`]+`/g) || []).join('').length;
      const codeChars = codeBlocks + backtickCode;
      if (codeChars / content.length < MIN_CODE_RATIO && item.source === 'stackoverflow') return false;
    }

    const nonAscii = (content.match(/[^\x00-\x7F]/g) || []).length;
    if (nonAscii / content.length > 0.3) return false;

    return true;
  });
}

// ══════════════════════════════════════════════════════
// PASS 1.5: AI Content Detection (soft penalty, not hard reject)
// Uses Binoculars-style two-layer detection:
//   Layer 1: Free heuristic check (catches ~60%)
//   Layer 2: AI judge for uncertain cases (catches ~30% more)
// AI-detected content gets a -3 quality penalty instead of
// being rejected outright. High-quality AI content still passes
// if the quality judge scores it high enough to overcome the penalty.
// ══════════════════════════════════════════════════════

const AI_QUALITY_PENALTY = 3;

interface AITaggedItem extends ScrapedItem {
  aiDetected: boolean;
  aiConfidence: number;
  aiPenalty: number;
}

async function pass1_5_aiContentFilter(items: ScrapedItem[]): Promise<AITaggedItem[]> {
  const tagged: AITaggedItem[] = [];
  let aiDetectedCount = 0;

  for (const item of items) {
    const isCode = item.source === 'dataset' && (
      item.tags.includes('code') ||
      item.tags.includes('codesearchnet') ||
      item.tags.includes('the-stack') ||
      item.tags.includes('starcoder')
    );

    if (isCode) {
      tagged.push({ ...item, aiDetected: false, aiConfidence: 0, aiPenalty: 0 });
      continue;
    }

    const result = await detectAIContent(item.raw_content);

    if (result.isAI) {
      aiDetectedCount++;
      console.log(`[harvester/filter] AI detected (${result.confidence.toFixed(2)}, penalty -${AI_QUALITY_PENALTY}): ${item.title.slice(0, 50)}`);
      tagged.push({ ...item, aiDetected: true, aiConfidence: result.confidence, aiPenalty: AI_QUALITY_PENALTY });
    } else {
      tagged.push({ ...item, aiDetected: false, aiConfidence: result.confidence, aiPenalty: 0 });
    }
  }

  if (aiDetectedCount > 0) {
    console.log(`[harvester/filter] Pass 1.5: ${aiDetectedCount} AI-detected items (penalty applied, not rejected)`);
  }

  return tagged;
}

// ══════════════════════════════════════════════════════
// PASS 2: AI Quality Judge (scores 0-10)
// ══════════════════════════════════════════════════════

const JUDGE_PROMPT = `You are a training data quality judge for an AI coding assistant called Titan AI.

Score the following content from 0-10 on its value as training data for a coding AI:

SCORING CRITERIA:
- 9-10: Contains working code with clear explanations, solves a real problem, demonstrates best practices
- 7-8: Good technical content with useful information, some code examples
- 5-6: Decent content but lacks depth or code examples
- 3-4: Mostly text, little practical coding value
- 0-2: Irrelevant, spam, outdated, or incorrect information

Respond with ONLY a JSON object: {"score": <number>, "reason": "<one sentence>"}

CONTENT:
`;

interface JudgeResult {
  score: number;
  reason: string;
}

const BATCH_JUDGE_PROMPT = `You are a training data quality judge for an AI coding assistant called Titan AI.

Score EACH of the following content items from 0-10 on its value as training data for a coding AI.

SCORING CRITERIA:
- 9-10: Contains working code with clear explanations, solves a real problem, demonstrates best practices
- 7-8: Good technical content with useful information, some code examples
- 5-6: Decent content but lacks depth or code examples
- 3-4: Mostly text, little practical coding value
- 0-2: Irrelevant, spam, outdated, or incorrect information

Respond with ONLY a JSON array of objects in order: [{"score": <number>, "reason": "<one sentence>"}, ...]

`;

const BATCH_SIZE = 8;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function judgeBatch(
  batch: AITaggedItem[],
  apiKey: string,
): Promise<Array<{ score: number; reason: string }>> {
  const numbered = batch
    .map((item, i) => `--- ITEM ${i + 1} ---\n${item.raw_content.slice(0, 2000)}`)
    .join('\n\n');

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://titan.kryonex.com',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: BATCH_JUDGE_PROMPT + numbered }],
        max_tokens: 300 + batch.length * 50,
        temperature: 0,
      }),
    });

    if (!res.ok) {
      return batch.map(() => ({ score: 5, reason: `API error ${res.status}` }));
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || '';

    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (!arrMatch) {
      return batch.map(() => ({ score: 5, reason: 'Could not parse batch response' }));
    }

    const parsed = JSON.parse(arrMatch[0]) as Array<{ score: number; reason: string }>;
    while (parsed.length < batch.length) {
      parsed.push({ score: 5, reason: 'Missing from batch response' });
    }
    return parsed.slice(0, batch.length);
  } catch {
    return batch.map(() => ({ score: 5, reason: 'Batch judge call failed' }));
  }
}

async function pass2_aiJudge(items: AITaggedItem[]): Promise<Array<AITaggedItem & { aiScore: number; aiReason: string }>> {
  const results: Array<AITaggedItem & { aiScore: number; aiReason: string }> = [];
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    for (const item of items) {
      const finalScore = Math.max(0, 6 - item.aiPenalty);
      results.push({
        ...item,
        aiScore: finalScore,
        aiReason: 'No API key — default pass' + (item.aiPenalty ? ` (AI penalty -${item.aiPenalty})` : ''),
      });
    }
    return results;
  }

  const batches = chunkArray(items, BATCH_SIZE);
  console.log(`[harvester/filter] AI judge: processing ${items.length} items in ${batches.length} batches of ≤${BATCH_SIZE}`);

  for (const batch of batches) {
    const batchResults = await judgeBatch(batch, apiKey);

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const raw = batchResults[i];
      const rawScore = Math.min(10, Math.max(0, raw.score));
      const finalScore = Math.max(0, rawScore - item.aiPenalty);
      const reason = raw.reason + (item.aiPenalty ? ` [AI-detected, penalty -${item.aiPenalty}: ${rawScore}→${finalScore}]` : '');
      results.push({ ...item, aiScore: finalScore, aiReason: reason });
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}

// ══════════════════════════════════════════════════════
// PASS 3: Format Converter (raw → instruction/response)
// ══════════════════════════════════════════════════════

interface FormattedItem {
  instruction: string;
  response: string;
  source: ScrapedItem;
  aiScore: number;
  aiReason: string;
}

function pass3_formatConverter(
  items: Array<AITaggedItem & { aiScore: number; aiReason: string }>
): FormattedItem[] {
  return items.map(item => {
    let instruction: string;
    let response: string;

    switch (item.source) {
      case 'stackoverflow': {
        const parts = item.raw_content.split(/\nACCEPTED ANSWER:\n/);
        instruction = (parts[0] || '').replace(/^QUESTION:\n/, '').trim();
        response = (parts[1] || item.raw_content).trim();
        break;
      }
      case 'github': {
        instruction = `Explain the key patterns and architecture used in ${item.title}`;
        response = item.raw_content;
        break;
      }
      case 'docs': {
        instruction = `Explain the following from official documentation: ${item.title}`;
        response = item.raw_content;
        break;
      }
      case 'blog': {
        instruction = `Summarize the key technical insights from: ${item.title}`;
        response = item.raw_content;
        break;
      }
      case 'dataset': {
        // Smart formatting based on dataset tags
        if (item.tags.includes('codesearchnet')) {
          const parts = item.raw_content.split(/\nCODE:\n/);
          instruction = (parts[0] || '').replace(/^DOCSTRING:\n/, '').trim();
          response = (parts[1] || item.raw_content).trim();
        } else if (item.tags.includes('starcoder') || item.tags.includes('the-stack')) {
          instruction = `Explain what this ${item.language} code does and how it works:`;
          response = item.raw_content;
        } else if (item.tags.includes('fineweb-edu')) {
          instruction = `Teach me about: ${item.title.replace(/^FineWeb-Edu:\s*/, '').slice(0, 100)}`;
          response = item.raw_content;
        } else if (item.tags.includes('the-pile')) {
          instruction = `Explain the following ${item.tags.includes('stackexchange') ? 'Q&A' : 'content'}:`;
          response = item.raw_content;
        } else {
          instruction = item.title || 'Explain the following content:';
          response = item.raw_content;
        }
        break;
      }
      case 'reddit': {
        instruction = item.title.replace(/^r\/\w+:\s*/, '') || 'Explain the following:';
        response = item.raw_content;
        break;
      }
      case 'devto': {
        instruction = `Explain the key technical insights from: ${item.title}`;
        response = item.raw_content;
        break;
      }
      case 'mdn': {
        instruction = `Explain the following from MDN Web Docs: ${item.title.replace(/^MDN:\s*/, '')}`;
        response = item.raw_content;
        break;
      }
      case 'wikipedia': {
        instruction = `Explain the computer science concept: ${item.title.replace(/^Wikipedia:\s*/, '')}`;
        response = item.raw_content;
        break;
      }
      case 'hackernews': {
        instruction = `Summarize this technical discussion: ${item.title.replace(/^HN:\s*/, '')}`;
        response = item.raw_content;
        break;
      }
      case 'github-issues': {
        const parts = item.raw_content.split(/\nFIX \(PR\):\n/);
        instruction = (parts[0] || '').replace(/^BUG REPORT:\n/, '').trim();
        response = parts[1] ? `Here's how this was fixed:\n${parts[1].trim()}` : item.raw_content;
        break;
      }
      case 'arxiv': {
        const parts = item.raw_content.split(/\nABSTRACT:\n/);
        instruction = `Explain this research paper: ${item.title.replace(/^ArXiv:\s*/, '')}`;
        response = (parts[1] || parts[0] || item.raw_content).trim();
        break;
      }
      case 'gitlab': {
        instruction = `Explain the key patterns and purpose of the GitLab project: ${item.title.replace(/^GitLab:\s*/, '')}`;
        response = item.raw_content;
        break;
      }
      case 'npm-docs': {
        instruction = `How do I use the npm package ${item.title.replace(/^npm:\s*/, '')}? Explain its purpose and key APIs.`;
        response = item.raw_content;
        break;
      }
      case 'competitive': {
        instruction = item.raw_content;
        response = `To solve this problem, analyze the constraints and think about the optimal approach. Consider edge cases and time/space complexity.`;
        break;
      }
      case 'evol-instruct': {
        instruction = item.title || 'Solve this advanced coding challenge:';
        response = item.raw_content;
        break;
      }
      default: {
        instruction = item.title || 'Explain the following content:';
        response = item.raw_content;
      }
    }

    return { instruction, response, source: item, aiScore: item.aiScore, aiReason: item.aiReason };
  });
}

// ══════════════════════════════════════════════════════
// PASS 4: Dedup Check (skip what we already have)
// ══════════════════════════════════════════════════════

async function pass4_dedup(items: FormattedItem[]): Promise<FormattedItem[]> {
  const unique: FormattedItem[] = [];
  const seenHashes = new Set<string>();

  for (const item of items) {
    const hash = createHash('sha256').update(item.instruction).digest('hex').slice(0, 32);

    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const existingSample = await db.dedupCheck(hash);
    if (existingSample.exists) continue;

    const existingHarvest = await db.harvestDedupCheck(hash);
    if (existingHarvest) continue;

    unique.push(item);
  }

  return unique;
}

// ══════════════════════════════════════════════════════
// MAIN PIPELINE
// ══════════════════════════════════════════════════════

export interface FilterResult {
  total_input: number;
  after_pass1: number;
  after_pass1_5: number;
  after_pass2: number;
  after_pass3: number;
  after_pass4: number;
  after_pass4_5: number;
  ai_rejected: number;
  near_duplicates: number;
  saved: number;
  items: HarvestSample[];
}

export async function runFilterPipeline(
  scraped: ScrapedItem[],
  batchId: string,
  minScore: number = 6,
): Promise<FilterResult> {
  console.log(`[harvester/filter] Starting pipeline | ${scraped.length} raw items | minScore=${minScore}`);

  // Pass 1: Rule-based junk filter
  const afterP1 = pass1_ruleFilter(scraped);
  console.log(`[harvester/filter] Pass 1 (rules): ${scraped.length} → ${afterP1.length}`);

  // Pass 1.5: AI content detection — soft penalty, not hard reject
  const afterP1_5 = await pass1_5_aiContentFilter(afterP1);
  const aiDetectedCount = afterP1_5.filter(i => i.aiDetected).length;
  console.log(`[harvester/filter] Pass 1.5 (AI detector): ${afterP1.length} tagged (${aiDetectedCount} AI-detected, penalty -${AI_QUALITY_PENALTY})`);

  // Pass 2: AI quality judge (AI penalty already applied to scores)
  const afterP2 = await pass2_aiJudge(afterP1_5);
  const scoredAbove = afterP2.filter(i => i.aiScore >= minScore);
  const aiPenalizedOut = afterP2.filter(i => i.aiDetected && i.aiScore < minScore).length;
  console.log(`[harvester/filter] Pass 2 (AI judge): ${afterP1_5.length} → ${scoredAbove.length} (score >= ${minScore}, ${aiPenalizedOut} dropped by AI penalty)`);

  // Pass 3
  const afterP3 = pass3_formatConverter(scoredAbove);
  console.log(`[harvester/filter] Pass 3 (format): ${scoredAbove.length} → ${afterP3.length}`);

  // Pass 4: exact hash dedup
  const afterP4 = await pass4_dedup(afterP3);
  console.log(`[harvester/filter] Pass 4 (exact dedup): ${afterP3.length} → ${afterP4.length}`);

  // Pass 4.5: MinHash near-dedup
  const minHashResult = minHashDedup(afterP4);
  const afterP4_5 = minHashResult.unique;
  console.log(`[harvester/filter] Pass 4.5 (near-dedup): ${afterP4.length} → ${afterP4_5.length} (${minHashResult.duplicates} near-dups)`);

  // Save to DB
  const saved: HarvestSample[] = [];
  for (const item of afterP4_5) {
    const hash = createHash('sha256').update(item.instruction).digest('hex').slice(0, 32);
    const sample: Omit<HarvestSample, 'id' | 'created_at'> = {
      source: item.source.source,
      source_url: item.source.source_url,
      batch_id: batchId,
      instruction: item.instruction,
      response: item.response,
      quality_score: item.aiScore,
      quality_reason: item.aiReason,
      tags: item.source.tags,
      language: item.source.language,
      char_count: item.instruction.length + item.response.length,
      status: 'pending',
      prompt_hash: hash,
    };

    const id = await db.insertHarvest(sample);
    if (id) {
      saved.push({ ...sample, id, created_at: new Date().toISOString() });
    }
  }

  console.log(`[harvester/filter] Saved ${saved.length} items to forge_harvest`);

  // Update batch stats
  await db.updateHarvestBatch(batchId, {
    passed_filter: saved.length,
    rejected: scraped.length - saved.length,
    status: 'completed',
  });

  return {
    total_input: scraped.length,
    after_pass1: afterP1.length,
    after_pass1_5: afterP1_5.length,
    after_pass2: scoredAbove.length,
    after_pass3: afterP3.length,
    after_pass4: afterP4.length,
    after_pass4_5: afterP4_5.length,
    ai_rejected: aiPenalizedOut,
    near_duplicates: minHashResult.duplicates,
    saved: saved.length,
    items: saved,
  };
}
