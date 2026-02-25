// ── Titan Forge — Parallel Harvest Workers ──
// Runs up to 4 concurrent scraper workers pulling from a shared source queue.
// Each worker scrapes independently; results merge into a single filter pipeline.

import { createHash } from 'crypto';
import { ForgeDB } from './db.js';
import { ForgeHarvester } from './harvester.js';
import { scrapeNewSources } from './harvester-new-sources.js';
import { runFilterPipeline } from './harvester-filter.js';
import { runEvolInstruct } from './evol-instruct.js';
import type { HarvestSource } from './types.js';
import type { ScrapedItem } from './harvester.js';

const db = new ForgeDB();

const WORKER_COUNT = 4;

const ALL_SOURCES: HarvestSource[] = [
  'github', 'stackoverflow', 'docs', 'blog', 'dataset',
  'reddit', 'devto', 'mdn', 'wikipedia', 'hackernews',
  'github-issues', 'arxiv', 'gitlab', 'npm-docs', 'competitive',
];

const LEGACY_SOURCES: HarvestSource[] = [
  'github', 'stackoverflow', 'docs', 'blog', 'dataset',
  'reddit', 'devto', 'mdn', 'wikipedia', 'hackernews',
];

const NEW_SOURCES: HarvestSource[] = [
  'github-issues', 'arxiv', 'gitlab', 'npm-docs', 'competitive',
];

export interface ParallelHarvestOptions {
  source: HarvestSource | 'all';
  topic?: string;
  limit?: number;
  parallel?: boolean;
  workerCount?: number;
  dryRun?: boolean;
  minScore?: number;
  evolInstruct?: boolean;
}

export interface WorkerStatus {
  id: number;
  status: 'idle' | 'scraping' | 'done';
  source: string;
  itemsScraped: number;
  startedAt?: number;
}

type SourceTask = {
  source: HarvestSource;
  topic: string;
  limit: number;
};

async function scrapeSource(task: SourceTask): Promise<ScrapedItem[]> {
  const { source, topic, limit } = task;

  if (NEW_SOURCES.includes(source)) {
    return scrapeNewSources(source, topic, limit);
  }

  const harvester = new ForgeHarvester();
  const result = await harvester.harvest({
    source,
    topic,
    limit,
    dryRun: true,
  });
  return result.scraped;
}

async function workerLoop(
  workerId: number,
  queue: SourceTask[],
  results: ScrapedItem[],
  statusTracker: WorkerStatus[],
): Promise<void> {
  while (true) {
    const task = queue.shift();
    if (!task) break;

    statusTracker[workerId] = {
      id: workerId,
      status: 'scraping',
      source: task.source,
      itemsScraped: 0,
      startedAt: Date.now(),
    };

    console.log(`[worker-${workerId}] Scraping ${task.source} (topic=${task.topic}, limit=${task.limit})`);

    try {
      const items = await scrapeSource(task);
      results.push(...items);
      statusTracker[workerId].itemsScraped = items.length;
      console.log(`[worker-${workerId}] ${task.source}: ${items.length} items`);
    } catch (err) {
      console.error(`[worker-${workerId}] ${task.source} failed:`, (err as Error).message);
    }

    statusTracker[workerId].status = 'done';
  }

  statusTracker[workerId] = { id: workerId, status: 'idle', source: '', itemsScraped: 0 };
}

export async function runParallelHarvest(opts: ParallelHarvestOptions) {
  const {
    source = 'all',
    topic = 'all',
    limit = 50,
    workerCount = WORKER_COUNT,
    dryRun = false,
    minScore = 6,
  } = opts;

  const batchId = createHash('sha256')
    .update(`${Date.now()}-parallel-${source}-${topic}`)
    .digest('hex')
    .slice(0, 16);

  const sources: HarvestSource[] = source === 'all'
    ? ALL_SOURCES
    : [source];

  const queue: SourceTask[] = sources.map(s => ({
    source: s,
    topic,
    limit,
  }));

  const allScraped: ScrapedItem[] = [];
  const workerStatuses: WorkerStatus[] = Array.from({ length: workerCount }, (_, i) => ({
    id: i,
    status: 'idle' as const,
    source: '',
    itemsScraped: 0,
  }));

  console.log(`[harvest-parallel] Starting ${workerCount} workers | ${queue.length} sources | topic=${topic} limit=${limit}/source`);
  const startTime = Date.now();

  if (!dryRun) {
    await db.insertHarvestBatch({
      id: batchId,
      source: source === 'all' ? 'github' : source,
      topic,
      total_scraped: 0,
      passed_filter: 0,
      rejected: 0,
      status: 'running',
    });
  }

  const workers = Array.from({ length: Math.min(workerCount, queue.length) }, (_, i) =>
    workerLoop(i, queue, allScraped, workerStatuses),
  );

  await Promise.all(workers);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[harvest-parallel] All workers done: ${allScraped.length} items in ${elapsed}s`);

  if (dryRun) {
    return {
      batchId,
      total_input: allScraped.length,
      saved: 0,
      elapsed: Number(elapsed),
      workers: workerStatuses,
    };
  }

  await db.updateHarvestBatch(batchId, {
    passed_filter: 0,
    rejected: 0,
    status: 'running',
  });

  const filterResult = await runFilterPipeline(allScraped, batchId, minScore);

  let evolvedCount = 0;
  if (opts.evolInstruct && filterResult.items.length > 0) {
    console.log(`[harvest-parallel] Running Evol-Instruct upgrade pass...`);
    const evolInputs = filterResult.items.map(i => ({
      instruction: i.instruction,
      response: i.response,
      score: i.quality_score ?? 5,
    }));
    const evolved = await runEvolInstruct(evolInputs, 20);

    for (const e of evolved) {
      const evolScraped: ScrapedItem = {
        source: 'evol-instruct',
        source_url: `evol-instruct://${e.strategy}`,
        title: e.instruction.slice(0, 100),
        raw_content: e.response,
        language: 'typescript',
        tags: ['evol-instruct', e.strategy.toLowerCase()],
      };
      allScraped.push(evolScraped);
    }

    if (evolved.length > 0) {
      const evolBatchId = batchId + '-evol';
      await db.insertHarvestBatch({
        id: evolBatchId,
        source: 'evol-instruct' as HarvestSource,
        topic: 'evolved',
        total_scraped: evolved.length,
        passed_filter: evolved.length,
        rejected: 0,
        status: 'completed',
      });

      for (const e of evolved) {
        const hash = createHash('sha256').update(e.instruction).digest('hex').slice(0, 32);
        await db.insertHarvest({
          source: 'evol-instruct' as HarvestSource,
          source_url: `evol-instruct://${e.strategy}`,
          batch_id: evolBatchId,
          instruction: e.instruction,
          response: e.response,
          quality_score: 8,
          quality_reason: `Evol-Instruct (${e.strategy}) from score-${e.originalScore} sample`,
          tags: ['evol-instruct', e.strategy.toLowerCase()],
          language: 'typescript',
          char_count: e.instruction.length + e.response.length,
          status: 'pending',
          prompt_hash: hash,
        });
        evolvedCount++;
      }
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[harvest-parallel] Pipeline complete: ${filterResult.saved} saved + ${evolvedCount} evolved from ${allScraped.length} scraped in ${totalElapsed}s`);

  return {
    batchId,
    ...filterResult,
    evolved: evolvedCount,
    elapsed: Number(totalElapsed),
    workers: workerStatuses,
  };
}
