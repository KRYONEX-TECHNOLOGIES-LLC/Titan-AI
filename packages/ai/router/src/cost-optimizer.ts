/**
 * Titan AI Router - Cost Optimizer
 * Track and optimize LLM costs with budget enforcement
 */

import type { ModelDefinition } from '@titan/ai-gateway';
import type { TaskAnalysis, UsageMetrics } from './types.js';

export interface CostOptimizerConfig {
  budget?: {
    daily: number;
    perRequest: number;
  };
  trackingEnabled?: boolean;
}

export class CostOptimizer {
  private config: CostOptimizerConfig;
  private usage: UsageMetrics;
  private dailyReset: number;

  constructor(config: CostOptimizerConfig = {}) {
    this.config = {
      trackingEnabled: true,
      ...config,
    };

    this.usage = this.createEmptyMetrics();
    this.dailyReset = this.getNextMidnight();
  }

  /**
   * Check if a request is within budget
   */
  checkBudget(analysis: TaskAnalysis): { allowed: boolean; reason?: string } {
    // Check daily reset
    if (Date.now() > this.dailyReset) {
      this.resetDailyUsage();
    }

    const budget = this.config.budget;
    if (!budget) {
      return { allowed: true };
    }

    // Estimate cost for this request
    const estimatedCost = this.estimateRequestCost(analysis);

    // Check per-request limit
    if (estimatedCost > budget.perRequest) {
      return {
        allowed: false,
        reason: `Estimated cost ($${estimatedCost.toFixed(4)}) exceeds per-request limit ($${budget.perRequest.toFixed(4)})`,
      };
    }

    // Check daily limit
    if (this.usage.totalCost + estimatedCost > budget.daily) {
      return {
        allowed: false,
        reason: `Daily budget ($${budget.daily.toFixed(2)}) would be exceeded`,
      };
    }

    return { allowed: true };
  }

  /**
   * Estimate cost for a model and token counts
   */
  estimateCost(
    model: ModelDefinition,
    inputTokens: number,
    outputTokens: number
  ): number {
    const inputCost = (inputTokens / 1_000_000) * model.costPer1MInput;
    const outputCost = (outputTokens / 1_000_000) * model.costPer1MOutput;
    return inputCost + outputCost;
  }

  /**
   * Estimate cost for a task analysis
   */
  estimateRequestCost(analysis: TaskAnalysis): number {
    // Use economy model pricing for estimates (conservative)
    const inputCost = (analysis.estimatedInputTokens / 1_000_000) * 0.15;
    const outputCost = (analysis.estimatedOutputTokens / 1_000_000) * 0.6;
    return inputCost + outputCost;
  }

  /**
   * Record usage for a completed request
   */
  recordUsage(
    model: ModelDefinition,
    inputTokens: number,
    outputTokens: number,
    taskType: TaskAnalysis['type']
  ): void {
    if (!this.config.trackingEnabled) return;

    const cost = this.estimateCost(model, inputTokens, outputTokens);

    this.usage.totalRequests++;
    this.usage.totalTokens += inputTokens + outputTokens;
    this.usage.totalCost += cost;

    // Track by model
    if (!this.usage.byModel[model.id]) {
      this.usage.byModel[model.id] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }
    this.usage.byModel[model.id].requests++;
    this.usage.byModel[model.id].inputTokens += inputTokens;
    this.usage.byModel[model.id].outputTokens += outputTokens;
    this.usage.byModel[model.id].cost += cost;

    // Track by task type
    this.usage.byTaskType[taskType] = (this.usage.byTaskType[taskType] ?? 0) + 1;
  }

  /**
   * Get current usage metrics
   */
  getUsage(): UsageMetrics {
    return { ...this.usage };
  }

  /**
   * Get remaining daily budget
   */
  getRemainingBudget(): number | null {
    if (!this.config.budget) return null;
    return Math.max(0, this.config.budget.daily - this.usage.totalCost);
  }

  /**
   * Get cost breakdown by model
   */
  getCostBreakdown(): Array<{
    model: string;
    requests: number;
    tokens: number;
    cost: number;
    percentage: number;
  }> {
    const total = this.usage.totalCost || 1;

    return Object.entries(this.usage.byModel)
      .map(([model, data]) => ({
        model,
        requests: data.requests,
        tokens: data.inputTokens + data.outputTokens,
        cost: data.cost,
        percentage: (data.cost / total) * 100,
      }))
      .sort((a, b) => b.cost - a.cost);
  }

  /**
   * Get recommendations for cost reduction
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const breakdown = this.getCostBreakdown();

    // Check for expensive model overuse
    const frontierUsage = breakdown.find(
      b => b.model.includes('opus') || b.model.includes('o1')
    );
    if (frontierUsage && frontierUsage.percentage > 50) {
      recommendations.push(
        'Consider using standard tier models for non-complex tasks to reduce costs'
      );
    }

    // Check for high token usage
    if (this.usage.totalTokens > 1_000_000) {
      recommendations.push(
        'High token usage detected. Consider implementing better context truncation'
      );
    }

    // Check task type distribution
    const debugTasks = this.usage.byTaskType['debug'] ?? 0;
    const totalTasks = this.usage.totalRequests;
    if (debugTasks / totalTasks > 0.3) {
      recommendations.push(
        'High debug task frequency. Consider improving code quality to reduce debugging needs'
      );
    }

    return recommendations;
  }

  /**
   * Reset daily usage
   */
  private resetDailyUsage(): void {
    this.usage = this.createEmptyMetrics();
    this.dailyReset = this.getNextMidnight();
  }

  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): UsageMetrics {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      byTaskType: {} as Record<TaskAnalysis['type'], number>,
    };
  }

  /**
   * Get next midnight timestamp
   */
  private getNextMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Update budget configuration
   */
  setBudget(budget: { daily: number; perRequest: number }): void {
    this.config.budget = budget;
  }

  /**
   * Export usage data
   */
  exportUsage(): string {
    return JSON.stringify({
      period: {
        start: new Date(this.dailyReset - 86400000).toISOString(),
        end: new Date(this.dailyReset).toISOString(),
      },
      metrics: this.usage,
      budget: this.config.budget,
      remaining: this.getRemainingBudget(),
    }, null, 2);
  }
}
