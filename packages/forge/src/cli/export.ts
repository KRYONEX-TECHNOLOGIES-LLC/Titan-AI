#!/usr/bin/env node
// ── Titan Forge CLI — Export Training Data ──
// Usage: pnpm --filter @titan/forge run export [options]
//
// Options:
//   --format   sharegpt | jsonl | curriculum  (default: sharegpt)
//   --min-score  minimum quality score (default: 7)
//   --output   output path (default: ./training-data/)
//   --limit    max samples (default: 10000)
//   --dry-run  print stats without writing files

import { ForgeExporter } from '../exporter.js';
import { ForgeDB } from '../db.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const getArg = (flag: string, defaultVal: string): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1]! : defaultVal;
  };

  const format = getArg('--format', 'sharegpt');
  const minScore = parseInt(getArg('--min-score', '7'), 10);
  const outputDir = getArg('--output', './training-data');
  const limit = parseInt(getArg('--limit', '10000'), 10);
  const dryRun = args.includes('--dry-run');

  const exporter = new ForgeExporter();
  const db = new ForgeDB();

  // Always show stats first
  const stats = await db.getStats();
  console.log('\n── Titan Forge Export ──');
  console.log(`Total samples in DB: ${stats.total}`);
  console.log(`High-value (score >= 7): ${stats.highValue}`);
  console.log(`Already exported: ${stats.exported}`);
  console.log(`Ready to export: ${stats.highValue - stats.exported}`);
  console.log(`By outcome:`, stats.byOutcome);
  console.log('');

  if (dryRun) {
    console.log('[dry-run] No files written.');
    return;
  }

  if (format === 'sharegpt') {
    const path = `${outputDir}/sharegpt-export.json`;
    await exporter.exportToShareGPT(path, { minScore, limit });
  } else if (format === 'jsonl') {
    const path = `${outputDir}/openai-export.jsonl`;
    await exporter.exportToJSONL(path, { minScore, limit });
  } else if (format === 'curriculum') {
    await exporter.exportCurriculum(outputDir, { minScore });
  } else {
    console.error(`Unknown format: ${format}. Use sharegpt, jsonl, or curriculum.`);
    process.exit(1);
  }

  console.log('\nExport complete.');
}

main().catch((err) => {
  console.error('[forge/export] Fatal:', err);
  process.exit(1);
});
