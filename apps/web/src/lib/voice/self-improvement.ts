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
const DISTILL_INTERVAL = 5;

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

// ═══ AUTO-EVALUATION (2026 — track user follow-ups to grade success) ═══

export interface EvaluationEntry {
  experienceId: string;
  autoGrade: 'success' | 'failure' | 'neutral';
  reason: string;
  evaluatedAt: string;
}

const EVALUATIONS_KEY = 'alfred-evaluations';

function loadEvaluations(): EvaluationEntry[] {
  try {
    const raw = localStorage.getItem(EVALUATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEvaluations(evals: EvaluationEntry[]) {
  try {
    localStorage.setItem(EVALUATIONS_KEY, JSON.stringify(evals.slice(-200)));
  } catch { /* quota */ }
}

/**
 * Auto-evaluate recent experiences by checking if the user's next message
 * indicates success or failure (e.g. "that worked", "no that's wrong").
 */
export function autoEvaluateExperience(
  experienceId: string,
  followUpMessage: string,
): EvaluationEntry | null {
  const lower = followUpMessage.toLowerCase();
  let grade: 'success' | 'failure' | 'neutral' = 'neutral';
  let reason = 'Ambiguous follow-up';

  const successPatterns = /\b(thanks|perfect|works|worked|great|awesome|exactly|correct|good job|nice|love it|that's right|yes)\b/i;
  const failurePatterns = /\b(wrong|no|incorrect|doesn't work|broken|fail|error|bug|not what|that's not|undo|revert|fix this)\b/i;

  if (successPatterns.test(lower)) {
    grade = 'success';
    reason = 'User indicated satisfaction';
  } else if (failurePatterns.test(lower)) {
    grade = 'failure';
    reason = 'User indicated problem';
  }

  if (grade === 'neutral') return null;

  const entry: EvaluationEntry = {
    experienceId,
    autoGrade: grade,
    reason,
    evaluatedAt: new Date().toISOString(),
  };

  // Update the original experience
  const exps = loadExperiences();
  const exp = exps.find(e => e.id === experienceId);
  if (exp) {
    exp.success = grade === 'success';
    saveExperiences(exps);
  }

  const evals = loadEvaluations();
  evals.push(entry);
  saveEvaluations(evals);

  return entry;
}

// ═══ VALIDATED WRITE-BACK (Bidirectional RAG integration) ═══

/**
 * Write strategies and learned knowledge back to Brain via validation gate.
 * Only validated content is persisted — no hallucination pollution.
 */
export async function validatedStrategyWriteBack(): Promise<{ written: number; rejected: number }> {
  let written = 0;
  let rejected = 0;

  try {
    const { validateKnowledge } = await import('@/lib/knowledge/validation-gate');
    const { saveBrainEntry } = await import('./brain-storage');

    const strategies = loadStrategies();
    const existingBrain = (await import('./brain-storage')).queryBrain('strategy');
    const existingContent = existingBrain.map(b => b.content);

    for (const strategy of strategies.filter(s => s.confidence >= 0.7 && s.usageCount >= 1)) {
      const candidate = {
        content: `[STRATEGY] ${strategy.principle}\nEvidence: ${strategy.evidence}`,
        source: 'auto' as const,
        category: 'strategy',
        importance: Math.round(strategy.confidence * 10),
      };

      const result = validateKnowledge(candidate, existingContent);
      if (result.passed) {
        await saveBrainEntry({
          category: 'strategy',
          content: result.sanitized || candidate.content,
          source: 'self-improvement-validated',
          importance: candidate.importance,
        });
        written++;
      } else {
        rejected++;
      }
    }
  } catch { /* validation gate or brain storage unavailable */ }

  return { written, rejected };
}

// ═══ BRAIN EXPORT — scheduled knowledge snapshot ═══

export interface BrainSnapshot {
  id: string;
  timestamp: string;
  experiences: number;
  strategies: number;
  evaluations: number;
  topStrategies: Strategy[];
  performanceMetrics: ReturnType<typeof evaluatePerformance>;
  exportedKnowledge: Array<{ category: string; content: string; importance: number }>;
}

/**
 * Export a "brain snapshot" — a curated package of the best learned knowledge.
 * Can be used for fine-tuning, prompt caching, or transferring to another instance.
 */
export function exportBrainSnapshot(): BrainSnapshot {
  const strategies = loadStrategies();
  const experiences = loadExperiences();
  const evaluations = loadEvaluations();
  const metrics = evaluatePerformance();

  const topStrategies = strategies
    .filter(s => s.confidence >= 0.6)
    .sort((a, b) => (b.confidence * b.usageCount) - (a.confidence * a.usageCount))
    .slice(0, 20);

  let exportedKnowledge: Array<{ category: string; content: string; importance: number }> = [];
  try {
    const { queryBrain } = require('./brain-storage');
    const categories = ['knowledge', 'skill', 'strategy', 'mistake'] as const;
    for (const cat of categories) {
      const entries = queryBrain(cat);
      exportedKnowledge.push(
        ...entries.slice(0, 20).map((e: { content: string; importance: number }) => ({
          category: cat,
          content: e.content,
          importance: e.importance,
        }))
      );
    }
  } catch { /* brain storage unavailable */ }

  return {
    id: `snapshot-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    experiences: experiences.length,
    strategies: strategies.length,
    evaluations: evaluations.length,
    topStrategies,
    performanceMetrics: metrics,
    exportedKnowledge,
  };
}

/**
 * Import a brain snapshot — restores strategies and knowledge from an export.
 */
export function importBrainSnapshot(snapshot: BrainSnapshot): { imported: number } {
  let imported = 0;
  const existing = loadStrategies();
  const existingIds = new Set(existing.map(s => s.id));

  for (const strategy of snapshot.topStrategies) {
    if (!existingIds.has(strategy.id)) {
      existing.push(strategy);
      imported++;
    }
  }
  saveStrategies(existing);

  // Import knowledge entries to brain
  try {
    const { saveBrainEntryBatch } = require('./brain-storage') as typeof import('./brain-storage');
    saveBrainEntryBatch(
      snapshot.exportedKnowledge.slice(0, 50).map(k => ({
        content: k.content,
        category: k.category as BrainCategory,
        source: 'snapshot-import',
        importance: k.importance,
      }))
    );
    imported += snapshot.exportedKnowledge.length;
  } catch { /* best-effort */ }

  return { imported };
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
