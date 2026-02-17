/**
 * Titan AI Speculative - Acceptance Tuner
 * Dynamically tune speculative parameters for optimal acceptance rate
 */

import type { TuningParameters, TuningHistoryEntry } from './types.js';

export interface AcceptanceTunerConfig {
  targetRate: number;
  learningRate: number;
  historySize: number;
  minSpeculativeCount: number;
  maxSpeculativeCount: number;
}

export class AcceptanceTuner {
  private config: AcceptanceTunerConfig;
  private parameters: TuningParameters;
  private history: TuningHistoryEntry[];

  constructor(config: Partial<AcceptanceTunerConfig> = {}) {
    this.config = {
      targetRate: 0.75,
      learningRate: 0.1,
      historySize: 100,
      minSpeculativeCount: 3,
      maxSpeculativeCount: 15,
      ...config,
    };

    this.parameters = {
      speculativeCount: 8,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
    };

    this.history = [];
  }

  /**
   * Get current tuned parameters
   */
  getParameters(): TuningParameters {
    return { ...this.parameters };
  }

  /**
   * Record a result and update parameters
   */
  recordResult(acceptanceRate: number, speculativeCount: number): void {
    // Add to history
    this.history.push({
      timestamp: Date.now(),
      parameters: { ...this.parameters },
      acceptanceRate,
      latencyMs: 0, // Will be updated if available
    });

    // Trim history
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }

    // Update parameters based on result
    this.updateParameters(acceptanceRate, speculativeCount);
  }

  /**
   * Update parameters based on acceptance rate
   */
  private updateParameters(acceptanceRate: number, speculativeCount: number): void {
    const error = this.config.targetRate - acceptanceRate;
    const lr = this.config.learningRate;

    // Adjust speculative count
    if (error > 0.1) {
      // Acceptance too low, reduce speculation
      this.parameters.speculativeCount = Math.max(
        this.config.minSpeculativeCount,
        speculativeCount - Math.ceil(error * 5)
      );
    } else if (error < -0.1) {
      // Acceptance high, can increase speculation
      this.parameters.speculativeCount = Math.min(
        this.config.maxSpeculativeCount,
        speculativeCount + Math.ceil(-error * 3)
      );
    }

    // Adjust temperature
    if (acceptanceRate < 0.5) {
      // Very low acceptance, lower temperature
      this.parameters.temperature = Math.max(0.1, this.parameters.temperature - lr * 0.05);
    } else if (acceptanceRate > 0.9) {
      // Very high acceptance, can increase temperature slightly
      this.parameters.temperature = Math.min(0.5, this.parameters.temperature + lr * 0.02);
    }

    // Adjust topP
    if (acceptanceRate < 0.6) {
      this.parameters.topP = Math.max(0.7, this.parameters.topP - lr * 0.05);
    } else if (acceptanceRate > 0.85) {
      this.parameters.topP = Math.min(0.95, this.parameters.topP + lr * 0.02);
    }
  }

  /**
   * Get average acceptance rate from history
   */
  getAverageAcceptanceRate(): number {
    if (this.history.length === 0) return 0;

    const sum = this.history.reduce((acc, entry) => acc + entry.acceptanceRate, 0);
    return sum / this.history.length;
  }

  /**
   * Get recent performance trend
   */
  getTrend(): 'improving' | 'stable' | 'declining' {
    if (this.history.length < 10) return 'stable';

    const recentHalf = this.history.slice(-Math.floor(this.history.length / 2));
    const olderHalf = this.history.slice(0, Math.floor(this.history.length / 2));

    const recentAvg = recentHalf.reduce((acc, e) => acc + e.acceptanceRate, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((acc, e) => acc + e.acceptanceRate, 0) / olderHalf.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }

  /**
   * Get optimal parameters from history
   */
  getOptimalParameters(): TuningParameters | null {
    if (this.history.length === 0) return null;

    // Find entry with best acceptance rate near target
    const nearTarget = this.history
      .filter(e => Math.abs(e.acceptanceRate - this.config.targetRate) < 0.1)
      .sort((a, b) => b.acceptanceRate - a.acceptanceRate);

    return nearTarget[0]?.parameters ?? null;
  }

  /**
   * Reset tuner to defaults
   */
  reset(): void {
    this.parameters = {
      speculativeCount: 8,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
    };
    this.history = [];
  }

  /**
   * Export tuning history
   */
  exportHistory(): string {
    return JSON.stringify({
      config: this.config,
      currentParameters: this.parameters,
      history: this.history,
      stats: {
        averageAcceptanceRate: this.getAverageAcceptanceRate(),
        trend: this.getTrend(),
        totalSamples: this.history.length,
      },
    }, null, 2);
  }

  /**
   * Import tuning history
   */
  importHistory(data: string): void {
    try {
      const parsed = JSON.parse(data) as {
        config?: Partial<AcceptanceTunerConfig>;
        currentParameters?: TuningParameters;
        history?: TuningHistoryEntry[];
      };

      if (parsed.config) {
        this.config = { ...this.config, ...parsed.config };
      }
      if (parsed.currentParameters) {
        this.parameters = parsed.currentParameters;
      }
      if (parsed.history) {
        this.history = parsed.history;
      }
    } catch {
      // Ignore invalid import
    }
  }

  /**
   * Get recommendations for improvement
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const avg = this.getAverageAcceptanceRate();

    if (avg < 0.5) {
      recommendations.push('Consider using a smaller draft model or reducing speculative count');
      recommendations.push('The draft model may not be well-aligned with the target model');
    }

    if (avg > 0.9) {
      recommendations.push('Acceptance rate is high - consider increasing speculative count for better throughput');
    }

    if (this.getTrend() === 'declining') {
      recommendations.push('Performance is declining - consider resetting parameters');
    }

    if (this.parameters.temperature > 0.3) {
      recommendations.push('Temperature is relatively high - lower values may improve acceptance');
    }

    return recommendations;
  }
}
