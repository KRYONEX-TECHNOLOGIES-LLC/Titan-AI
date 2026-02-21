import { MODEL_REGISTRY } from '@/lib/model-registry';
import type { SupremeBudgetConfig } from './supreme-model';

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface BudgetStatus {
  perRequestLimit: number;
  perRequestUsed: number;
  perRequestRemaining: number;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
  byModel: Record<string, UsageRecord>;
}

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

interface BudgetTrackerOptions {
  requestId: string;
  config: SupremeBudgetConfig;
}

function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const model = MODEL_REGISTRY.find((m) => m.id === modelId || m.providerModelId === modelId);
  if (!model) return 0;
  const inputCost = (inputTokens / 1_000_000) * model.costPer1MInput;
  const outputCost = (outputTokens / 1_000_000) * model.costPer1MOutput;
  return inputCost + outputCost;
}

const dailyUsageByDay = new Map<string, number>();

export function createBudgetTracker(options: BudgetTrackerOptions) {
  const byModel = new Map<string, UsageRecord>();
  let perRequestUsed = 0;
  const today = new Date().toISOString().slice(0, 10);
  const currentDailyUsed = dailyUsageByDay.get(today) || 0;

  function recordUsage(model: string, inputTokens: number, outputTokens: number) {
    const total = Math.max(0, inputTokens) + Math.max(0, outputTokens);
    const projectedRequest = perRequestUsed + total;
    const projectedDaily = (dailyUsageByDay.get(today) || 0) + total;
    if (projectedRequest > options.config.perRequest) {
      throw new BudgetExhaustedError(
        `Per-request token budget exceeded (${projectedRequest}/${options.config.perRequest}).`,
      );
    }
    if (projectedDaily > options.config.daily) {
      throw new BudgetExhaustedError(
        `Daily token budget exceeded (${projectedDaily}/${options.config.daily}).`,
      );
    }

    const prev = byModel.get(model) || { inputTokens: 0, outputTokens: 0, estimatedCost: 0 };
    const next: UsageRecord = {
      inputTokens: prev.inputTokens + Math.max(0, inputTokens),
      outputTokens: prev.outputTokens + Math.max(0, outputTokens),
      estimatedCost: prev.estimatedCost + estimateCost(model, inputTokens, outputTokens),
    };
    byModel.set(model, next);
    perRequestUsed = projectedRequest;
    dailyUsageByDay.set(today, projectedDaily);
  }

  function canAfford(model: string, estimatedTokens: number) {
    if (estimatedTokens <= 0) return true;
    const projectedRequest = perRequestUsed + estimatedTokens;
    const projectedDaily = (dailyUsageByDay.get(today) || 0) + estimatedTokens;
    return (
      projectedRequest <= options.config.perRequest &&
      projectedDaily <= options.config.daily &&
      !!MODEL_REGISTRY.find((m) => m.id === model || m.providerModelId === model)
    );
  }

  function getRemainingBudget(): BudgetStatus {
    const dailyUsed = dailyUsageByDay.get(today) || currentDailyUsed;
    return {
      perRequestLimit: options.config.perRequest,
      perRequestUsed,
      perRequestRemaining: Math.max(0, options.config.perRequest - perRequestUsed),
      dailyLimit: options.config.daily,
      dailyUsed,
      dailyRemaining: Math.max(0, options.config.daily - dailyUsed),
    };
  }

  function getUsageSummary(): UsageSummary {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalEstimatedCost = 0;
    const modelSummary: Record<string, UsageRecord> = {};
    for (const [model, usage] of byModel.entries()) {
      modelSummary[model] = usage;
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalEstimatedCost += usage.estimatedCost;
    }
    return {
      totalInputTokens,
      totalOutputTokens,
      totalEstimatedCost,
      byModel: modelSummary,
    };
  }

  function allocateByRole() {
    return {
      overseer: Math.floor(options.config.perRequest * 0.15),
      workers: Math.floor(options.config.perRequest * 0.7),
      operator: Math.floor(options.config.perRequest * 0.15),
    };
  }

  return {
    requestId: options.requestId,
    recordUsage,
    canAfford,
    getRemainingBudget,
    getUsageSummary,
    allocateByRole,
  };
}
