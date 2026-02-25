'use client';

import { saveBrainEntry, saveBrainEntryBatch, queryBrain, type BrainCategory } from './brain-storage';
import { recordKnowledge } from './evolution-tracker';

const INGEST_INTERVAL_MS = 300_000; // 5 minutes
const INGEST_LS_KEY = 'titan-voice-last-ingest';
const CONCURRENCY = 6;

let ingestTimer: ReturnType<typeof setInterval> | null = null;
let ingesting = false;

interface IngestTask {
  content: string;
  source: string;
  category: BrainCategory;
}

/**
 * Process tasks in parallel with concurrency limit.
 */
async function runParallel<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.allSettled(workers);
  return results;
}

/**
 * Check for duplicates in batch — much faster than checking one at a time.
 */
function filterDuplicates(tasks: IngestTask[]): IngestTask[] {
  const seen = new Set<string>();
  return tasks.filter(task => {
    const key = `${task.category}:${task.content.slice(0, 40).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const existing = queryBrain(task.category, task.content.slice(0, 40));
    return existing.length === 0;
  });
}

/**
 * Poll for recent harvest data and extract knowledge using async parallel processing.
 */
async function pollAndIngest(): Promise<number> {
  if (ingesting) return 0;
  ingesting = true;

  try {
    const lastIngest = localStorage.getItem(INGEST_LS_KEY);
    const _since = lastIngest || new Date(Date.now() - 86400000).toISOString();

    const res = await fetch('/api/forge/stats');
    if (!res.ok) return 0;

    const stats = await res.json() as {
      totalSamples?: number;
      recentSamples?: Array<{
        id: string;
        source?: string;
        content?: string;
        category?: string;
        quality_score?: number;
      }>;
    };

    if (!stats.recentSamples || !Array.isArray(stats.recentSamples)) return 0;

    // Phase 1: Build task list from quality samples
    const tasks: IngestTask[] = [];
    for (const sample of stats.recentSamples) {
      if (!sample.content || sample.content.length < 20) continue;
      if ((sample.quality_score ?? 5) < 4) continue;

      let brainCategory: BrainCategory = 'knowledge';
      const cat = sample.category || '';
      if (cat === 'best-practices' || cat === 'patterns') {
        brainCategory = 'skill';
      } else if (cat === 'innovations' || cat === 'ideas' || cat === 'tech-news') {
        brainCategory = 'idea';
      }

      tasks.push({
        content: sample.content.slice(0, 500),
        source: sample.source || 'forge-harvester',
        category: brainCategory,
      });
    }

    if (tasks.length === 0) return 0;

    // Phase 2: Batch dedup check (single pass through localStorage)
    const unique = filterDuplicates(tasks);
    if (unique.length === 0) return 0;

    // Phase 3: Batch localStorage write (one write instead of N)
    const entries = saveBrainEntryBatch(
      unique.map(t => ({
        category: t.category,
        content: t.content,
        source: t.source,
        importance: 5,
        metadata: { ingestedAt: new Date().toISOString() },
      })),
    );

    // Phase 4: Async parallel Supabase writes (fire-and-forget, don't block)
    void runParallel(entries, CONCURRENCY, async (entry) => {
      try {
        await saveBrainEntry({
          category: entry.category,
          content: entry.content,
          source: entry.source,
          importance: entry.importance,
          metadata: entry.metadata,
        }, true);
      } catch { /* Supabase write failed, localStorage is primary */ }
    });

    // Phase 5: Update evolution stats in one shot
    if (entries.length > 0) {
      recordKnowledge(entries.length);
    }

    localStorage.setItem(INGEST_LS_KEY, new Date().toISOString());
    return entries.length;
  } catch {
    return 0;
  } finally {
    ingesting = false;
  }
}

/**
 * Start the knowledge ingestion pipeline.
 * Uses async parallel processing to reduce bottlenecks.
 */
export function startKnowledgeIngestion(): void {
  if (ingestTimer) return;

  setTimeout(() => { void pollAndIngest(); }, 30_000);

  ingestTimer = setInterval(() => {
    void pollAndIngest();
  }, INGEST_INTERVAL_MS);
}

export function stopKnowledgeIngestion(): void {
  if (ingestTimer) {
    clearInterval(ingestTimer);
    ingestTimer = null;
  }
}

export async function manualIngest(): Promise<number> {
  return pollAndIngest();
}
