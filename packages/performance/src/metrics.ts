/**
 * Performance metrics collection
 */

import type { MetricPoint, PerformanceReport, CacheStats, LatencyStats } from './types';

interface LatencyStats {
  p50: number;
  p90: number;
  p99: number;
  mean: number;
}

export class MetricsCollector {
  private metrics: MetricPoint[] = [];
  private latencies: number[] = [];
  private startTime = Date.now();
  private requestCount = 0;
  private tokenCount = 0;
  private errors = new Map<string, number>();
  private maxMetrics = 10000;

  /**
   * Record a metric
   */
  record(name: string, value: number, tags: Record<string, string> = {}): void {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags,
    });

    // Trim if too many
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics / 2);
    }
  }

  /**
   * Record latency
   */
  recordLatency(durationMs: number): void {
    this.latencies.push(durationMs);
    this.requestCount++;

    // Trim if too many
    if (this.latencies.length > this.maxMetrics) {
      this.latencies = this.latencies.slice(-this.maxMetrics / 2);
    }
  }

  /**
   * Record tokens processed
   */
  recordTokens(count: number): void {
    this.tokenCount += count;
  }

  /**
   * Record error
   */
  recordError(type: string): void {
    this.errors.set(type, (this.errors.get(type) || 0) + 1);
  }

  /**
   * Get latency statistics
   */
  getLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return { p50: 0, p90: 0, p99: 0, mean: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p90: sorted[Math.floor(len * 0.9)],
      p99: sorted[Math.floor(len * 0.99)],
      mean: this.latencies.reduce((a, b) => a + b, 0) / len,
    };
  }

  /**
   * Get throughput stats
   */
  getThroughput(): { requestsPerSecond: number; tokensPerSecond: number } {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;

    return {
      requestsPerSecond: this.requestCount / elapsedSeconds,
      tokensPerSecond: this.tokenCount / elapsedSeconds,
    };
  }

  /**
   * Get error stats
   */
  getErrorStats(): { total: number; byType: Record<string, number> } {
    let total = 0;
    const byType: Record<string, number> = {};

    for (const [type, count] of this.errors) {
      total += count;
      byType[type] = count;
    }

    return { total, byType };
  }

  /**
   * Generate performance report
   */
  generateReport(
    tokenCacheStats: CacheStats,
    embeddingCacheStats: CacheStats
  ): PerformanceReport {
    return {
      period: {
        start: this.startTime,
        end: Date.now(),
      },
      cacheStats: {
        tokenCache: tokenCacheStats,
        embeddingCache: embeddingCacheStats,
      },
      latencyStats: this.getLatencyStats(),
      throughput: this.getThroughput(),
      errors: this.getErrorStats(),
    };
  }

  /**
   * Get metrics by name
   */
  getMetrics(name: string, since?: number): MetricPoint[] {
    return this.metrics.filter(
      (m) => m.name === name && (!since || m.timestamp >= since)
    );
  }

  /**
   * Get all metrics since timestamp
   */
  getMetricsSince(since: number): MetricPoint[] {
    return this.metrics.filter((m) => m.timestamp >= since);
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = [];
    this.latencies = [];
    this.errors.clear();
    this.requestCount = 0;
    this.tokenCount = 0;
    this.startTime = Date.now();
  }

  /**
   * Export metrics for external systems
   */
  export(): {
    metrics: MetricPoint[];
    latencies: number[];
    errors: Record<string, number>;
  } {
    return {
      metrics: [...this.metrics],
      latencies: [...this.latencies],
      errors: Object.fromEntries(this.errors),
    };
  }
}

/**
 * Timer utility for measuring operations
 */
export class Timer {
  private startTime: number;
  private endTime?: number;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Stop the timer
   */
  stop(): number {
    this.endTime = performance.now();
    return this.elapsed();
  }

  /**
   * Get elapsed time in ms
   */
  elapsed(): number {
    const end = this.endTime ?? performance.now();
    return end - this.startTime;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = performance.now();
    this.endTime = undefined;
  }

  /**
   * Static helper for timing async operations
   */
  static async measure<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    return { result, durationMs };
  }
}
