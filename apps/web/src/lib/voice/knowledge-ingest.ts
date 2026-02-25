'use client';

import { saveBrainEntry, queryBrain, type BrainCategory } from './brain-storage';

const INGEST_INTERVAL_MS = 300_000; // 5 minutes
const INGEST_LS_KEY = 'titan-voice-last-ingest';

let ingestTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Extract key insights from raw harvested text and save to brain.
 */
async function extractAndSave(content: string, source: string, category: BrainCategory): Promise<void> {
  if (!content || content.length < 20) return;

  const existing = queryBrain(category, content.slice(0, 40));
  if (existing.length > 0) return;

  await saveBrainEntry({
    category,
    content: content.slice(0, 500),
    source,
    importance: 5,
    metadata: { ingestedAt: new Date().toISOString() },
  });
}

/**
 * Poll Supabase for recent harvest data and extract knowledge.
 */
async function pollAndIngest(): Promise<number> {
  let ingested = 0;

  try {
    const lastIngest = localStorage.getItem(INGEST_LS_KEY);
    const since = lastIngest || new Date(Date.now() - 86400000).toISOString();

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

    if (stats.recentSamples && Array.isArray(stats.recentSamples)) {
      for (const sample of stats.recentSamples) {
        if (!sample.content) continue;

        let brainCategory: BrainCategory = 'knowledge';
        if (sample.category === 'best-practices' || sample.category === 'patterns') {
          brainCategory = 'skill';
        } else if (sample.category === 'innovation' || sample.category === 'ideas') {
          brainCategory = 'idea';
        }

        if ((sample.quality_score ?? 5) >= 4) {
          await extractAndSave(sample.content, sample.source || 'forge-harvester', brainCategory);
          ingested++;
        }
      }
    }

    localStorage.setItem(INGEST_LS_KEY, new Date().toISOString());
  } catch {
    // Supabase/API unavailable
  }

  return ingested;
}

/**
 * Start the knowledge ingestion pipeline.
 * Runs periodically to pull new data from Forge harvester into the brain.
 */
export function startKnowledgeIngestion(): void {
  if (ingestTimer) return;

  // Initial ingest after 30s
  setTimeout(() => { void pollAndIngest(); }, 30_000);

  ingestTimer = setInterval(() => {
    void pollAndIngest();
  }, INGEST_INTERVAL_MS);
}

/**
 * Stop the ingestion pipeline.
 */
export function stopKnowledgeIngestion(): void {
  if (ingestTimer) {
    clearInterval(ingestTimer);
    ingestTimer = null;
  }
}

/**
 * Manually trigger an ingestion cycle.
 */
export async function manualIngest(): Promise<number> {
  return pollAndIngest();
}
