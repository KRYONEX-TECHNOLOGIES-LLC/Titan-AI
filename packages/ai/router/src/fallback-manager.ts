/**
 * Titan AI Router - Fallback Manager
 * Handle rate limits and provider failures with intelligent fallback
 */

import type { ModelDefinition, Provider } from '@titan/ai-gateway';
import type { RateLimitState, FallbackResult } from './types.js';

export class FallbackManager {
  private rateLimits: Map<string, RateLimitState> = new Map();
  private failureCount: Map<string, number> = new Map();
  private lastSuccess: Map<string, number> = new Map();

  // Configuration
  private maxFailures = 3;
  private failureWindow = 60000; // 1 minute
  private rateLimitBackoff = 30000; // 30 seconds

  /**
   * Record a rate limit for a provider/model
   */
  recordRateLimit(provider: Provider, model: string, retryAfter?: number): void {
    const key = `${provider}:${model}`;
    this.rateLimits.set(key, {
      provider,
      model,
      retryAfter: retryAfter ?? this.rateLimitBackoff,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a failure for a provider/model
   */
  recordFailure(provider: Provider, model: string): void {
    const key = `${provider}:${model}`;
    const current = this.failureCount.get(key) ?? 0;
    this.failureCount.set(key, current + 1);

    // Clear old failures
    setTimeout(() => {
      const count = this.failureCount.get(key);
      if (count !== undefined && count > 0) {
        this.failureCount.set(key, count - 1);
      }
    }, this.failureWindow);
  }

  /**
   * Record a success for a provider/model
   */
  recordSuccess(provider: Provider, model: string): void {
    const key = `${provider}:${model}`;
    this.failureCount.delete(key);
    this.rateLimits.delete(key);
    this.lastSuccess.set(key, Date.now());
  }

  /**
   * Check if a model is available (not rate limited or failing)
   */
  isAvailable(provider: Provider, model: string): boolean {
    const key = `${provider}:${model}`;

    // Check rate limit
    const rateLimit = this.rateLimits.get(key);
    if (rateLimit) {
      const elapsed = Date.now() - rateLimit.timestamp;
      if (elapsed < rateLimit.retryAfter) {
        return false;
      }
      // Rate limit expired
      this.rateLimits.delete(key);
    }

    // Check failure threshold
    const failures = this.failureCount.get(key) ?? 0;
    if (failures >= this.maxFailures) {
      return false;
    }

    return true;
  }

  /**
   * Get the first available model from a list
   */
  getFirstAvailable(models: ModelDefinition[]): ModelDefinition | undefined {
    for (const model of models) {
      if (this.isAvailable(model.provider, model.id)) {
        return model;
      }
    }
    return undefined;
  }

  /**
   * Execute with fallback chain
   */
  async executeWithFallback<T>(
    models: ModelDefinition[],
    execute: (model: ModelDefinition) => Promise<T>
  ): Promise<FallbackResult & { result?: T }> {
    const startTime = Date.now();
    let attemptsCount = 0;

    for (const model of models) {
      if (!this.isAvailable(model.provider, model.id)) {
        continue;
      }

      attemptsCount++;

      try {
        const result = await execute(model);
        this.recordSuccess(model.provider, model.id);

        return {
          success: true,
          model,
          attemptsCount,
          totalLatency: Date.now() - startTime,
          result,
        };
      } catch (error) {
        this.handleError(model.provider, model.id, error as Error);
      }
    }

    // All models failed
    return {
      success: false,
      model: models[0],
      attemptsCount,
      totalLatency: Date.now() - startTime,
    };
  }

  /**
   * Handle error and update state
   */
  private handleError(provider: Provider, model: string, error: Error): void {
    const message = error.message.toLowerCase();

    // Check for rate limit
    if (message.includes('rate limit') || message.includes('429')) {
      const retryAfter = this.extractRetryAfter(error);
      this.recordRateLimit(provider, model, retryAfter);
    } else {
      this.recordFailure(provider, model);
    }
  }

  /**
   * Extract retry-after from error
   */
  private extractRetryAfter(error: Error): number | undefined {
    // Try to extract from error message or headers
    const match = error.message.match(/retry after (\d+)/i);
    if (match) {
      return parseInt(match[1], 10) * 1000;
    }
    return undefined;
  }

  /**
   * Get health status for all tracked providers
   */
  getHealthStatus(): Record<string, {
    available: boolean;
    failures: number;
    rateLimited: boolean;
    lastSuccess?: number;
  }> {
    const status: Record<string, {
      available: boolean;
      failures: number;
      rateLimited: boolean;
      lastSuccess?: number;
    }> = {};

    // Collect all tracked keys
    const keys = new Set([
      ...this.failureCount.keys(),
      ...this.rateLimits.keys(),
      ...this.lastSuccess.keys(),
    ]);

    for (const key of keys) {
      const [provider, model] = key.split(':');
      const failures = this.failureCount.get(key) ?? 0;
      const rateLimit = this.rateLimits.get(key);
      const rateLimited = rateLimit
        ? Date.now() - rateLimit.timestamp < rateLimit.retryAfter
        : false;

      status[key] = {
        available: this.isAvailable(provider as Provider, model),
        failures,
        rateLimited,
        lastSuccess: this.lastSuccess.get(key),
      };
    }

    return status;
  }

  /**
   * Clear all state (for testing or reset)
   */
  reset(): void {
    this.rateLimits.clear();
    this.failureCount.clear();
    this.lastSuccess.clear();
  }
}
