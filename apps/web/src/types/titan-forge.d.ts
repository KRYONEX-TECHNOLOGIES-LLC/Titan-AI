/**
 * Type stubs for @titan/forge.
 * The real package is only available in the Electron desktop app (pnpm workspace).
 * On Railway (standalone npm deploy) the package is absent; all forge API routes
 * handle this gracefully via dynamic import() wrapped in try/catch.
 * These stubs let TypeScript type-check without the package installed.
 */
declare module '@titan/forge' {
  export interface ForgeCapture {
    id?: string;
    model?: string;
    modelId?: string;
    modelTier?: 'frontier' | 'economy' | 'local';
    tier?: 'frontier' | 'economy' | 'local';
    sessionId?: string | null;
    systemPrompt?: string;
    messages?: Array<{ role: string; content: string | null }>;
    response?: string;
    toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: unknown } }>;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs?: number;
    qualityScore?: number;
    [key: string]: unknown;
  }

  export interface ForgeStats {
    total: number;
    highValue: number;
    exported: number;
    byModel: Record<string, number>;
    byOutcome: Record<string, number>;
  }

  export interface ForgeHarvestStats {
    total: number;
    approved: number;
    migrated: number;
    rejected: number;
    pending: number;
    bySource: Record<string, number>;
    recentBatches: Array<Record<string, unknown>>;
  }

  export interface ForgeSample {
    id: string | number;
    messages: Array<{ role: string; content: string }>;
    response: string;
    quality_score?: number;
    [key: string]: unknown;
  }

  export interface ForgeRun {
    id?: string;
    base_model: string;
    method: 'qlora' | 'full' | 'dpo';
    samples_used: number;
    min_quality_score: number;
    config: Record<string, unknown>;
    metrics: Record<string, unknown> | null;
    model_path: string | null;
    status: 'running' | 'completed' | 'failed';
  }

  export interface ForgeEvalMetrics {
    accuracy?: number;
    bleu?: number;
    rouge?: number;
    [key: string]: unknown;
  }

  export interface ForgeExportStats {
    total_exported: number;
    [key: string]: unknown;
  }

  export class ForgeDB {
    getStats(): Promise<ForgeStats>;
    getHarvestStats(): Promise<ForgeHarvestStats>;
    getSamplesForExport(minScore: number, limit: number): Promise<ForgeSample[]>;
    insertRun(run: Omit<ForgeRun, 'id'>): Promise<string | null>;
    updateRunStatus(runId: string, status: string): Promise<void>;
    markExported(ids: Array<string | number>): Promise<void>;
  }

  export class ForgeHarvester {
    harvest(opts: { source?: string; topic?: string; limit?: number }): Promise<{
      scraped: unknown[];
      batchId: string;
    }>;
  }

  export class ForgeEvaluator {
    run(opts: {
      runId: string;
      teacherModel: string;
      studentEndpoint: string;
      studentModel: string;
      judgeModel: string;
      sampleCount: number;
      minScore: number;
    }): Promise<ForgeEvalMetrics | null>;
  }

  export class ForgeExporter {
    exportToJSONL(outputPath: string, opts: { minScore?: number; limit?: number; markExported?: boolean }): Promise<ForgeExportStats>;
    exportToShareGPT(outputPath: string, opts: { minScore?: number; limit?: number; markExported?: boolean }): Promise<ForgeExportStats>;
  }

  export function runFilterPipeline(
    scraped: unknown[],
    batchId: string,
    passes: number,
  ): Promise<{
    total_input: number;
    after_pass1: number;
    after_pass1_5: number;
    after_pass2: number;
    after_pass3: number;
    after_pass4: number;
    ai_rejected: number;
    saved: number;
  }>;

  export const forgeCollector: {
    capture(data: ForgeCapture): void;
  };
}
