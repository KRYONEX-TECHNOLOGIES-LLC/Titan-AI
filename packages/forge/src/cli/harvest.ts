#!/usr/bin/env node
// ── Titan Forge — Harvest CLI ──
// Usage:
//   pnpm --filter @titan/forge run harvest -- --source github --topic "React hooks" --limit 20
//   pnpm --filter @titan/forge run harvest -- --source all --limit 50
//   pnpm --filter @titan/forge run harvest -- --review
//   pnpm --filter @titan/forge run harvest -- --stats
//   pnpm --filter @titan/forge run harvest -- --source stackoverflow --topic typescript --dry-run

import { ForgeHarvester } from '../harvester.js';
import { runFilterPipeline } from '../harvester-filter.js';
import { ForgeDB } from '../db.js';
import type { HarvestSource } from '../types.js';

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  const db = new ForgeDB();
  const harvester = new ForgeHarvester();

  if (hasFlag('stats')) {
    const stats = await db.getHarvestStats();
    console.log('\n=== Forge Harvest Stats ===');
    console.log(`Total harvested: ${stats.total}`);
    console.log(`Pending review:  ${stats.pending}`);
    console.log(`Approved:        ${stats.approved}`);
    console.log(`Migrated:        ${stats.migrated}`);
    console.log(`Rejected:        ${stats.rejected}`);
    console.log('\nBy source:', JSON.stringify(stats.bySource, null, 2));
    console.log('By language:', JSON.stringify(stats.byLanguage, null, 2));
    console.log('\nRecent batches:');
    for (const batch of stats.recentBatches) {
      console.log(`  ${batch.id} | ${batch.source} | ${batch.status} | scraped=${batch.total_scraped} passed=${batch.passed_filter}`);
    }
    return;
  }

  if (hasFlag('review')) {
    const items = await db.getHarvestForReview(50);
    if (items.length === 0) {
      console.log('No pending harvest items to review.');
      return;
    }
    console.log(`\n=== ${items.length} Pending Harvest Items ===\n`);
    for (const item of items) {
      console.log(`ID: ${item.id}`);
      console.log(`Source: ${item.source} | Score: ${item.quality_score}/10 | Lang: ${item.language}`);
      console.log(`URL: ${item.source_url}`);
      console.log(`Instruction: ${item.instruction.slice(0, 100)}...`);
      console.log(`Response: ${item.response.slice(0, 100)}...`);
      console.log('---');
    }
    return;
  }

  const sourceArg = getArg('source') || 'all';
  const topic = getArg('topic') || 'all';
  const limit = parseInt(getArg('limit') || '20', 10);
  const minScore = parseInt(getArg('min-score') || '6', 10);
  const dryRun = hasFlag('dry-run');

  const validSources = ['all', 'github', 'stackoverflow', 'docs', 'blog', 'dataset', 'reddit', 'devto', 'mdn', 'wikipedia', 'hackernews'];
  if (!validSources.includes(sourceArg)) {
    console.error(`Invalid source: ${sourceArg}. Use: ${validSources.join(', ')}`);
    process.exit(1);
  }

  const source = sourceArg as HarvestSource | 'all';

  console.log(`\n=== Forge Harvester ===`);
  console.log(`Source: ${source} | Topic: ${topic} | Limit: ${limit} | Min Score: ${minScore}`);
  if (dryRun) console.log('DRY RUN — no data will be saved\n');

  const { scraped, batchId } = await harvester.harvest({ source, topic, limit, dryRun });

  if (scraped.length === 0) {
    console.log('No items scraped. Try a different source or topic.');
    return;
  }

  if (dryRun) {
    console.log(`\nDry run: ${scraped.length} items would be scraped:`);
    for (const item of scraped.slice(0, 10)) {
      console.log(`  [${item.source}] ${item.title} (${item.raw_content.length} chars)`);
    }
    return;
  }

  const result = await runFilterPipeline(scraped, batchId, minScore);

  console.log('\n=== Harvest Complete ===');
  console.log(`Scraped:          ${result.total_input}`);
  console.log(`After rules:      ${result.after_pass1}`);
  console.log(`AI content blocked: ${result.ai_rejected}`);
  console.log(`After AI judge:   ${result.after_pass2}`);
  console.log(`After format:     ${result.after_pass3}`);
  console.log(`After dedup:      ${result.after_pass4}`);
  console.log(`Saved to DB:      ${result.saved}`);
}

main().catch((err) => {
  console.error('Harvest failed:', err);
  process.exit(1);
});
