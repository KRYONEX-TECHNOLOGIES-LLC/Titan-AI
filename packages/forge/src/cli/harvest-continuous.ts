#!/usr/bin/env node
// ── Titan Forge — Continuous Harvest Engine ──
// Runs non-stop, cycling through all 15 sources with rotating topics.
// Targets a configurable sample count (default 10,000 for Phase 1).
// Tracks progress, handles errors gracefully, and resumes automatically.

import { runParallelHarvest } from '../harvest-workers.js';
import { ForgeDB } from '../db.js';

async function sendCompletionEmail(totalSamples: number, totalTime: string, rounds: number, avgPerRound: number) {
  const email = process.env.FORGE_NOTIFY_EMAIL;
  if (!email) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const subject = `Titan Forge: Phase 1 Harvest Complete — ${totalSamples} samples`;
  const body = [
    `TITAN FORGE — HARVEST PHASE 1 COMPLETE`,
    ``,
    `Total Samples: ${totalSamples}`,
    `Total Time: ${totalTime}`,
    `Rounds: ${rounds}`,
    `Avg Samples/Round: ${avgPerRound.toFixed(1)}`,
    ``,
    `NEXT STEPS:`,
    `1. Export training data: pnpm --filter @titan/forge run export -- --format jsonl --out data/phase1.jsonl`,
    `2. Review sample quality: pnpm --filter @titan/forge run harvest -- --review`,
    `3. Check stats: pnpm --filter @titan/forge run harvest -- --stats`,
    `4. Start Phase 1 training with the exported JSONL file`,
    `5. For Phase 2 (50K samples): FORGE_TARGET=50000 pnpm --filter @titan/forge run harvest:continuous`,
    ``,
    `— Titan Forge Harvester`,
  ].join('\n');

  try {
    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to: email, subject, text: body }),
    });
    console.log(`[forge] Completion email sent to ${email}`);
  } catch (err) {
    console.log(`[forge] Email notification failed (non-critical): ${(err as Error).message}`);
  }
}

const db = new ForgeDB();

const NOTIFY_EMAIL = process.env.FORGE_NOTIFY_EMAIL || 'shadowunitk9@gmail.com';
const TARGET_SAMPLES = parseInt(process.env.FORGE_TARGET || '10000', 10);
const WORKERS = parseInt(process.env.FORGE_WORKERS || '100', 10);
const PER_SOURCE_LIMIT = parseInt(process.env.FORGE_LIMIT || '30', 10);
const MIN_SCORE = parseInt(process.env.FORGE_MIN_SCORE || '6', 10);
const COOLDOWN_MS = parseInt(process.env.FORGE_COOLDOWN || '15000', 10);
const EVOL_INSTRUCT = process.env.FORGE_EVOL !== '0';

const TOPIC_ROTATION: string[] = [
  // Programming languages
  'TypeScript', 'JavaScript', 'Python', 'Rust', 'Go', 'Java', 'C++',
  'Ruby', 'Swift', 'Kotlin', 'C#', 'PHP', 'Scala', 'Elixir', 'Haskell',
  // Frontend frameworks & libraries
  'React hooks', 'Next.js app router', 'Vue 3 composition API', 'Angular signals',
  'Svelte', 'Solid.js', 'Tailwind CSS', 'CSS Grid Flexbox',
  'React Server Components', 'Remix', 'Astro', 'Nuxt',
  // Backend & APIs
  'Node.js Express', 'FastAPI Python', 'Django REST', 'Spring Boot',
  'GraphQL API', 'REST API design', 'gRPC', 'WebSocket real-time',
  'tRPC', 'Hono', 'Fastify', 'NestJS',
  // Databases & data
  'PostgreSQL queries', 'MongoDB aggregation', 'Redis caching',
  'Prisma ORM', 'Drizzle ORM', 'SQL optimization', 'database indexing',
  'Supabase', 'Firebase', 'DynamoDB',
  // DevOps & infrastructure
  'Docker containerization', 'Kubernetes deployment', 'CI/CD pipelines',
  'GitHub Actions', 'Terraform infrastructure', 'AWS Lambda serverless',
  'Nginx configuration', 'Linux server administration',
  // Architecture & patterns
  'design patterns', 'microservices architecture', 'event-driven architecture',
  'SOLID principles', 'clean architecture', 'domain-driven design',
  'system design', 'distributed systems', 'message queues',
  // Testing & quality
  'unit testing', 'integration testing', 'end-to-end testing',
  'test-driven development', 'Jest testing', 'Playwright testing',
  'Vitest', 'code review best practices', 'refactoring techniques',
  // Performance & security
  'web performance optimization', 'memory management', 'async programming',
  'concurrency parallelism', 'caching strategies', 'load balancing',
  'authentication authorization', 'OAuth JWT', 'XSS CSRF prevention',
  'encryption hashing', 'rate limiting',
  // AI/ML & data science
  'machine learning', 'neural networks', 'transformer architecture',
  'LLM fine-tuning', 'RAG retrieval augmented', 'embeddings vector search',
  'PyTorch', 'TensorFlow', 'natural language processing',
  'computer vision', 'reinforcement learning',
  // Algorithms & CS fundamentals
  'sorting algorithms', 'graph algorithms', 'dynamic programming',
  'binary search trees', 'hash tables', 'linked lists',
  'recursion backtracking', 'greedy algorithms', 'big O complexity',
  'tries suffix trees', 'heap priority queue',
  // Tools & ecosystem
  'Git advanced', 'Webpack Vite bundling', 'ESLint Prettier',
  'monorepo turborepo', 'npm package publishing', 'TypeScript generics',
  'TypeScript type inference', 'Zod validation',
  'state management Zustand', 'React Query data fetching',
  // Debugging & operations
  'debugging techniques', 'error handling', 'logging monitoring',
  'observability tracing', 'memory leaks', 'race conditions',
  'deadlocks', 'production debugging', 'profiling optimization',
  // Modern topics
  'WebAssembly', 'Edge computing', 'Progressive Web Apps',
  'Web Components', 'Deno Bun runtime', 'Electron desktop apps',
  'React Native mobile', 'Flutter', 'compiler design',
  'parser AST', 'language server protocol', 'code generation',
];

interface RoundStats {
  round: number;
  topic: string;
  scraped: number;
  saved: number;
  elapsed: number;
  totalSamples: number;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

async function getSampleCount(): Promise<number> {
  try {
    const stats = await db.getHarvestStats();
    return stats.total;
  } catch {
    return 0;
  }
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           TITAN FORGE — CONTINUOUS HARVEST ENGINE           ║
║                                                              ║
║  Target: ${String(TARGET_SAMPLES).padStart(6)} samples (Phase 1)                      ║
║  Workers: ${String(WORKERS).padStart(5)} parallel | Limit: ${String(PER_SOURCE_LIMIT).padStart(3)}/source              ║
║  Min Score: ${MIN_SCORE}/10 | Evol-Instruct: ${EVOL_INSTRUCT ? 'ON ' : 'OFF'}                  ║
║  Cooldown: ${formatDuration(COOLDOWN_MS).padEnd(8)} between rounds                    ║
╚══════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();
  let round = 0;
  let topicIndex = 0;
  let consecutiveErrors = 0;
  const history: RoundStats[] = [];

  const currentCount = await getSampleCount();
  console.log(`[forge] Current sample count: ${currentCount}/${TARGET_SAMPLES}`);

  if (currentCount >= TARGET_SAMPLES) {
    console.log(`[forge] Target already reached! ${currentCount} samples collected.`);
    console.log(`[forge] Set FORGE_TARGET higher to continue harvesting.`);
    return;
  }

  console.log(`[forge] Need ${TARGET_SAMPLES - currentCount} more samples. Starting continuous harvest...\n`);

  while (true) {
    round++;
    const topic = TOPIC_ROTATION[topicIndex % TOPIC_ROTATION.length];
    topicIndex++;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[forge] Round ${round} | Topic: "${topic}"`);
    console.log(`[forge] Elapsed: ${formatDuration(Date.now() - startTime)}`);
    console.log(`${'═'.repeat(60)}`);

    try {
      const result = await runParallelHarvest({
        source: 'all',
        topic,
        limit: PER_SOURCE_LIMIT,
        parallel: true,
        workerCount: WORKERS,
        dryRun: false,
        minScore: MIN_SCORE,
        evolInstruct: EVOL_INSTRUCT,
      });

      consecutiveErrors = 0;

      const saved = result.saved ?? 0;
      const evolved = result.evolved ?? 0;
      const totalSaved = saved + evolved;
      const newTotal = await getSampleCount();

      const roundStats: RoundStats = {
        round,
        topic,
        scraped: result.total_input ?? 0,
        saved: totalSaved,
        elapsed: result.elapsed ?? 0,
        totalSamples: newTotal,
      };
      history.push(roundStats);

      const avgPerRound = history.reduce((sum, h) => sum + h.saved, 0) / history.length;
      const remaining = TARGET_SAMPLES - newTotal;
      const etaRounds = avgPerRound > 0 ? Math.ceil(remaining / avgPerRound) : Infinity;
      const avgRoundTime = history.reduce((sum, h) => sum + h.elapsed, 0) / history.length;
      const etaSeconds = etaRounds * (avgRoundTime + COOLDOWN_MS / 1000);

      console.log(`\n[forge] Round ${round} complete:`);
      console.log(`  Scraped: ${roundStats.scraped} | Saved: ${saved} | Evolved: ${evolved}`);
      console.log(`  Total samples: ${newTotal}/${TARGET_SAMPLES} (${((newTotal / TARGET_SAMPLES) * 100).toFixed(1)}%)`);
      console.log(`  Avg/round: ${avgPerRound.toFixed(1)} | ETA: ~${formatDuration(etaSeconds * 1000)}`);
      console.log(`  Progress: [${'█'.repeat(Math.floor((newTotal / TARGET_SAMPLES) * 40))}${'░'.repeat(40 - Math.floor((newTotal / TARGET_SAMPLES) * 40))}]`);

      if (newTotal >= TARGET_SAMPLES) {
        const totalElapsed = formatDuration(Date.now() - startTime);
        console.log(`\n${'★'.repeat(60)}`);
        console.log(`[forge] PHASE 1 TARGET REACHED: ${newTotal} samples!`);
        console.log(`[forge] Total time: ${totalElapsed} | Rounds: ${round}`);
        console.log(`[forge] Avg quality: ${MIN_SCORE}+ / 10`);
        console.log(`${'★'.repeat(60)}`);
        console.log(`\n[forge] Harvest paused. Samples ready for training.`);
        console.log(`[forge] To continue for Phase 2 (50K), set FORGE_TARGET=50000 and restart.`);

        const avgPerRound = history.reduce((sum, h) => sum + h.saved, 0) / Math.max(history.length, 1);
        await sendCompletionEmail(newTotal, totalElapsed, round, avgPerRound);
        break;
      }
    } catch (err) {
      consecutiveErrors++;
      console.error(`[forge] Round ${round} FAILED:`, (err as Error).message);

      if (consecutiveErrors >= 5) {
        const backoff = Math.min(consecutiveErrors * 60000, 600000);
        console.log(`[forge] ${consecutiveErrors} consecutive errors. Backing off ${formatDuration(backoff)}...`);
        await new Promise(r => setTimeout(r, backoff));
      }

      if (consecutiveErrors >= 20) {
        console.error(`[forge] Too many consecutive errors (${consecutiveErrors}). Stopping.`);
        break;
      }
    }

    // Cooldown between rounds
    console.log(`[forge] Cooling down ${formatDuration(COOLDOWN_MS)}...`);
    await new Promise(r => setTimeout(r, COOLDOWN_MS));
  }

  // Final report
  const totalElapsed = formatDuration(Date.now() - startTime);
  const totalSaved = history.reduce((sum, h) => sum + h.saved, 0);
  console.log(`\n[forge] Session summary:`);
  console.log(`  Rounds: ${history.length}`);
  console.log(`  Total saved this session: ${totalSaved}`);
  console.log(`  Total time: ${totalElapsed}`);
  console.log(`  Avg samples/round: ${(totalSaved / Math.max(history.length, 1)).toFixed(1)}`);
}

main().catch((err) => {
  console.error('[forge] Fatal error:', err);
  process.exit(1);
});
