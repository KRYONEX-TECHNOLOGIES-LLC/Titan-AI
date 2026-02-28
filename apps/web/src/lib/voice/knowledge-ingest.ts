'use client';

const INGEST_INTERVAL_MS = 300_000; // 5 minutes

let ingestTimer: ReturnType<typeof setInterval> | null = null;
let ingesting = false;

/**
 * Poll for knowledge ingestion. (Harvest/forge data ingestion removed.)
 */
async function pollAndIngest(): Promise<number> {
  if (ingesting) return 0;
  ingesting = true;

  try {
    // Forge harvester stats/samples ingestion has been removed.
    return 0;
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
