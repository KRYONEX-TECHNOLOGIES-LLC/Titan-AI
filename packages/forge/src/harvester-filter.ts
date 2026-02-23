// ── Titan Forge — Harvester Filter Pipeline ──
// 5-pass filtering: rule strip → AI content detection → quality judge → format → dedup
// Only elite-quality HUMAN-WRITTEN data survives to enter the training set.

import { createHash } from 'crypto';
import { ForgeDB } from './db.js';
import { detectAIContent, detectAIHeuristic } from './ai-content-detector.js';
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
// PASS 1.5: AI Content Detection (reject AI-generated text)
// Uses Binoculars-style two-layer detection:
//   Layer 1: Free heuristic check (catches ~60%)
//   Layer 2: AI judge for uncertain cases (catches ~30% more)
// Combined: rejects 90%+ of AI slop at <1% false positive rate
// ══════════════════════════════════════════════════════

async function pass1_5_aiContentFilter(items: ScrapedItem[]): Promise<ScrapedItem[]> {
  const passed: ScrapedItem[] = [];
  let rejected = 0;

  for (const item of items) {
    // Pure code files skip AI detection — code is code regardless of who typed it
    const isCode = item.source === 'dataset' && (
      item.tags.includes('code') ||
      item.tags.includes('codesearchnet') ||
      item.tags.includes('the-stack') ||
      item.tags.includes('starcoder')
    );

    if (isCode) {
      passed.push(item);
      continue;
    }

    // For text content, run the full detector
    const result = await detectAIContent(item.raw_content);

    if (result.isAI) {
      rejected++;
      console.log(`[harvester/filter] REJECTED AI content (${result.confidence.toFixed(2)}): ${item.title.slice(0, 50)}`);
      continue;
    }

    passed.push(item);
  }

  if (rejected > 0) {
    console.log(`[harvester/filter] Pass 1.5: Rejected ${rejected} AI-generated items`);
  }

  return passed;
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

async function pass2_aiJudge(items: ScrapedItem[]): Promise<Array<ScrapedItem & { aiScore: number; aiReason: string }>> {
  const results: Array<ScrapedItem & { aiScore: number; aiReason: string }> = [];

  for (const item of items) {
    const truncated = item.raw_content.slice(0, 3000);
    try {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        results.push({ ...item, aiScore: 6, aiReason: 'No API key — default pass' });
        continue;
      }

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://titan.kryonex.com',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-001',
          messages: [{ role: 'user', content: JUDGE_PROMPT + truncated }],
          max_tokens: 100,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        results.push({ ...item, aiScore: 5, aiReason: `API error ${res.status}` });
        continue;
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content || '';

      const match = text.match(/\{[\s\S]*?"score"\s*:\s*(\d+)[\s\S]*?"reason"\s*:\s*"([^"]*)"[\s\S]*?\}/);
      if (match) {
        const score = Math.min(10, Math.max(0, parseInt(match[1], 10)));
        results.push({ ...item, aiScore: score, aiReason: match[2] });
      } else {
        results.push({ ...item, aiScore: 5, aiReason: 'Could not parse judge response' });
      }

      await new Promise(r => setTimeout(r, 500));
    } catch {
      results.push({ ...item, aiScore: 5, aiReason: 'Judge call failed' });
    }
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
  items: Array<ScrapedItem & { aiScore: number; aiReason: string }>
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
  ai_rejected: number;
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

  // Pass 1.5: AI content detection — reject AI-generated text
  const afterP1_5 = await pass1_5_aiContentFilter(afterP1);
  const aiRejected = afterP1.length - afterP1_5.length;
  console.log(`[harvester/filter] Pass 1.5 (AI detector): ${afterP1.length} → ${afterP1_5.length} (${aiRejected} AI-generated rejected)`);

  // Pass 2: AI quality judge
  const afterP2 = await pass2_aiJudge(afterP1_5);
  const scoredAbove = afterP2.filter(i => i.aiScore >= minScore);
  console.log(`[harvester/filter] Pass 2 (AI judge): ${afterP1_5.length} → ${scoredAbove.length} (score >= ${minScore})`);

  // Pass 3
  const afterP3 = pass3_formatConverter(scoredAbove);
  console.log(`[harvester/filter] Pass 3 (format): ${scoredAbove.length} → ${afterP3.length}`);

  // Pass 4
  const afterP4 = await pass4_dedup(afterP3);
  console.log(`[harvester/filter] Pass 4 (dedup): ${afterP3.length} → ${afterP4.length}`);

  // Save to DB
  const saved: HarvestSample[] = [];
  for (const item of afterP4) {
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
    ai_rejected: aiRejected,
    saved: saved.length,
    items: saved,
  };
}
