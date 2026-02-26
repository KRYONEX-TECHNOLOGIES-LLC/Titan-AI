/**
 * Alfred Self-Improvement Loop
 *
 * Inspired by EvolveR closed-loop + ACE cognitive architecture:
 * 1. Experience Capture  — log every interaction outcome
 * 2. Strategy Distillation — every N conversations, extract strategic principles
 * 3. Principle Retrieval   — before each conversation, inject relevant learned strategies
 *
 * This creates a genuine learning loop where Alfred gets measurably smarter over time.
 */

import type { BrainEntry, BrainCategory } from './brain-storage';

const EXPERIENCE_KEY = 'alfred-experiences';
const STRATEGY_KEY = 'alfred-strategies';
const DISTILL_INTERVAL = 10;

// ═══ EXPERIENCE CAPTURE ═══

export interface Experience {
  id: string;
  query: string;
  response: string;
  success: boolean;
  timestamp: string;
  tags: string[];
}

function loadExperiences(): Experience[] {
  try {
    const raw = localStorage.getItem(EXPERIENCE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveExperiences(exps: Experience[]) {
  try {
    localStorage.setItem(EXPERIENCE_KEY, JSON.stringify(exps.slice(-200)));
  } catch { /* quota */ }
}

function autoTag(query: string, response: string): string[] {
  const text = `${query} ${response}`.toLowerCase();
  const tags: string[] = [];
  const patterns: [RegExp, string][] = [
    [/\b(code|bug|error|fix|implement|refactor)\b/, 'coding'],
    [/\b(git|push|commit|version|deploy)\b/, 'devops'],
    [/\b(market|finance|stock|crypto|invest)\b/, 'finance'],
    [/\b(plan|strategy|architect|design)\b/, 'planning'],
    [/\b(learn|research|study|knowledge)\b/, 'research'],
    [/\b(protocol|phoenix|supreme|midnight|sniper)\b/, 'protocols'],
    [/\b(harvest|scrape|forge)\b/, 'harvesting'],
    [/\b(memory|brain|remember)\b/, 'memory'],
    [/\b(security|auth|encrypt|token)\b/, 'security'],
    [/\b(performance|speed|optimize|latency)\b/, 'performance'],
  ];
  for (const [pat, tag] of patterns) {
    if (pat.test(text)) tags.push(tag);
  }
  return tags.length > 0 ? tags : ['general'];
}

export function captureExperience(query: string, response: string, success: boolean): void {
  const exp: Experience = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    query: query.slice(0, 500),
    response: response.slice(0, 500),
    success,
    timestamp: new Date().toISOString(),
    tags: autoTag(query, response),
  };

  const exps = loadExperiences();
  exps.push(exp);
  saveExperiences(exps);
}

// ═══ STRATEGY DISTILLATION ═══

export interface Strategy {
  id: string;
  principle: string;
  evidence: string;
  tags: string[];
  confidence: number; // 0-1
  createdAt: string;
  usageCount: number;
}

function loadStrategies(): Strategy[] {
  try {
    const raw = localStorage.getItem(STRATEGY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveStrategies(strategies: Strategy[]) {
  try {
    localStorage.setItem(STRATEGY_KEY, JSON.stringify(strategies.slice(-100)));
  } catch { /* quota */ }
}

export function shouldDistill(conversationCount: number): boolean {
  return conversationCount > 0 && conversationCount % DISTILL_INTERVAL === 0;
}

export function distillStrategies(): Strategy[] {
  const exps = loadExperiences();
  if (exps.length < 5) return [];

  const recent = exps.slice(-DISTILL_INTERVAL * 2);
  const existing = loadStrategies();
  const newStrategies: Strategy[] = [];

  // Group by tags and find patterns
  const tagGroups = new Map<string, Experience[]>();
  for (const exp of recent) {
    for (const tag of exp.tags) {
      const group = tagGroups.get(tag) || [];
      group.push(exp);
      tagGroups.set(tag, group);
    }
  }

  for (const [tag, group] of tagGroups) {
    if (group.length < 2) continue;

    const successRate = group.filter(e => e.success).length / group.length;
    const successes = group.filter(e => e.success);
    const failures = group.filter(e => !e.success);

    // Extract patterns from successful interactions
    if (successes.length >= 2) {
      const commonWords = findCommonPatterns(successes.map(e => e.query));
      if (commonWords.length > 0) {
        const principle = `For ${tag} queries involving "${commonWords.join(', ')}", the approach that worked had ${Math.round(successRate * 100)}% success rate in ${group.length} interactions.`;
        const evidence = successes.slice(0, 2).map(e => `Q: "${e.query.slice(0, 80)}" → succeeded`).join('; ');

        if (!existing.some(s => s.tags.includes(tag) && s.principle.includes(commonWords[0]))) {
          newStrategies.push({
            id: `strat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            principle,
            evidence,
            tags: [tag],
            confidence: successRate,
            createdAt: new Date().toISOString(),
            usageCount: 0,
          });
        }
      }
    }

    // Learn from failures
    if (failures.length >= 1) {
      const failPattern = failures.map(f => f.query.slice(0, 60)).join('; ');
      const avoidPrinciple = `Caution with ${tag} queries: ${failures.length} recent failures. Patterns: "${failPattern}". Consider using tools (search, research) before responding.`;

      if (!existing.some(s => s.tags.includes(tag) && s.principle.includes('Caution'))) {
        newStrategies.push({
          id: `strat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          principle: avoidPrinciple,
          evidence: `${failures.length} failures in last ${recent.length} interactions`,
          tags: [tag],
          confidence: 0.6,
          createdAt: new Date().toISOString(),
          usageCount: 0,
        });
      }
    }
  }

  if (newStrategies.length > 0) {
    const all = [...existing, ...newStrategies];
    saveStrategies(all);

    // Also save to brain storage for persistence
    try {
      const { saveBrainEntryBatch } = require('./brain-storage') as typeof import('./brain-storage');
      saveBrainEntryBatch(
        newStrategies.map(s => ({
          content: `[STRATEGY] ${s.principle}\nEvidence: ${s.evidence}`,
          category: 'strategy' as BrainCategory,
          source: 'self-improvement-distillation',
          importance: Math.round(s.confidence * 10),
          metadata: { strategyId: s.id, tags: s.tags },
        })),
      );
    } catch { /* brain storage is best-effort */ }
  }

  return newStrategies;
}

// ═══ PRINCIPLE RETRIEVAL ═══

export function getRelevantStrategies(query: string, maxResults = 3): string {
  const strategies = loadStrategies();
  if (strategies.length === 0) return '';

  const queryTags = autoTag(query, '');

  // Score strategies by tag overlap and confidence
  const scored = strategies.map(s => {
    const tagOverlap = s.tags.filter(t => queryTags.includes(t)).length;
    const recency = Math.max(0, 1 - (Date.now() - new Date(s.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000));
    const score = (tagOverlap * 2) + s.confidence + (recency * 0.5) - (s.usageCount * 0.1);
    return { strategy: s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxResults).filter(s => s.score > 0);

  if (top.length === 0) return '';

  // Mark as used
  const allStrategies = loadStrategies();
  for (const t of top) {
    const found = allStrategies.find(s => s.id === t.strategy.id);
    if (found) found.usageCount++;
  }
  saveStrategies(allStrategies);

  return top.map(t => `- ${t.strategy.principle}`).join('\n');
}

// ═══ PERFORMANCE EVALUATION ═══

export function evaluatePerformance(): {
  totalInteractions: number;
  successRate: number;
  topTags: string[];
  weakAreas: string[];
  recentStrategies: number;
} {
  const exps = loadExperiences();
  const strategies = loadStrategies();

  const totalInteractions = exps.length;
  const successRate = exps.length > 0 ? exps.filter(e => e.success).length / exps.length : 0;

  // Find most common tags
  const tagCounts = new Map<string, number>();
  for (const exp of exps) {
    for (const tag of exp.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag);

  // Find weak areas (tags with low success rate)
  const tagSuccess = new Map<string, { success: number; total: number }>();
  for (const exp of exps) {
    for (const tag of exp.tags) {
      const curr = tagSuccess.get(tag) || { success: 0, total: 0 };
      curr.total++;
      if (exp.success) curr.success++;
      tagSuccess.set(tag, curr);
    }
  }
  const weakAreas = [...tagSuccess.entries()]
    .filter(([, v]) => v.total >= 3 && v.success / v.total < 0.7)
    .map(([tag, v]) => `${tag} (${Math.round(v.success / v.total * 100)}% success)`);

  return {
    totalInteractions,
    successRate: Math.round(successRate * 100) / 100,
    topTags,
    weakAreas,
    recentStrategies: strategies.length,
  };
}

// ═══ HELPERS ═══

function findCommonPatterns(texts: string[]): string[] {
  const wordCounts = new Map<string, number>();
  const stopWords = new Set(['the', 'a', 'an', 'is', 'it', 'to', 'in', 'for', 'of', 'and', 'or', 'my', 'me', 'i', 'you', 'we', 'do', 'can', 'how', 'what', 'this', 'that']);

  for (const text of texts) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const unique = new Set(words);
    for (const word of unique) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  return [...wordCounts.entries()]
    .filter(([, count]) => count >= Math.ceil(texts.length * 0.5))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
}
