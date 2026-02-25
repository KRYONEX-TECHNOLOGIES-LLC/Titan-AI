// ── Titan Forge — Public API ──
// Import from '@titan/forge' to use the distillation pipeline.

export * from './types.js';
export { ForgeDB } from './db.js';
export { ForgeCollector, forgeCollector } from './collector.js';
export { QualityGate } from './quality-gate.js';
export { ForgeSignals, forgeSignals } from './signals.js';
export { ForgeExporter } from './exporter.js';
export { ForgeEvaluator } from './eval.js';
export { ForgeVault } from './vault.js';
export { ForgeHarvester, forgeHarvester } from './harvester.js';
export { runFilterPipeline } from './harvester-filter.js';
export { runParallelHarvest } from './harvest-workers.js';
export { scrapeNewSources } from './harvester-new-sources.js';
export { MinHashIndex, minHashDedup } from './minhash-dedup.js';
export { runEvolInstruct } from './evol-instruct.js';
export { detectAIContent, detectAIHeuristic } from './ai-content-detector.js';
export { samplePublicDatasets, sampleFineWebEdu, sampleTheStack, sampleThePile, sampleCodeSearchNet } from './harvester-datasets.js';
