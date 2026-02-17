/**
 * Titan AI Speculative - EfficientEdit Core
 * Main orchestrator for speculative code editing
 */

import type {
  EfficientEditConfig,
  SpeculationRequest,
  SpeculationResponse,
  VerificationResult,
  DraftPrediction,
  SpeculativeStats,
} from './types.js';
import { DraftModel } from './draft-model.js';
import { TargetVerifier } from './target-verifier.js';
import { BlockGenerator } from './block-generator.js';
import { RedundancyAnalyzer } from './redundancy-reuse.js';
import { AcceptanceTuner } from './acceptance-tuner.js';
import { SpeculativeCache } from './speculative-cache.js';

export class EfficientEdit {
  private config: EfficientEditConfig;
  private draftModel: DraftModel;
  private verifier: TargetVerifier;
  private blockGenerator: BlockGenerator;
  private redundancyAnalyzer: RedundancyAnalyzer;
  private tuner: AcceptanceTuner;
  private cache: SpeculativeCache;
  private stats: SpeculativeStats;

  constructor(config: EfficientEditConfig) {
    this.config = {
      speculativeCount: 8,
      redundancyThreshold: 0.7,
      maxIterations: 5,
      acceptanceTarget: 0.75,
      enableCaching: true,
      ...config,
    };

    this.draftModel = new DraftModel({
      model: config.draftModel,
      speculativeCount: this.config.speculativeCount,
    });

    this.verifier = new TargetVerifier({
      model: config.targetModel,
    });

    this.blockGenerator = new BlockGenerator();
    this.redundancyAnalyzer = new RedundancyAnalyzer({
      threshold: this.config.redundancyThreshold,
    });
    this.tuner = new AcceptanceTuner({
      targetRate: this.config.acceptanceTarget,
    });
    this.cache = new SpeculativeCache();

    this.stats = this.createEmptyStats();
  }

  /**
   * Generate speculative completion
   */
  async complete(request: SpeculationRequest): Promise<SpeculationResponse> {
    const startTime = Date.now();

    // Check cache first
    if (this.config.enableCaching) {
      const cached = this.cache.get(request.prefix, request.language);
      if (cached) {
        this.updateStats(cached, true);
        return {
          ...cached,
          cacheHit: true,
          totalLatencyMs: Date.now() - startTime,
        };
      }
    }

    let completion = '';
    let totalReused = 0;
    let totalGenerated = 0;
    let totalDraftLatency = 0;
    let totalVerifyLatency = 0;
    let iterations = 0;
    let acceptanceRates: number[] = [];

    // Analyze prefix for redundancy opportunities
    const redundancy = this.redundancyAnalyzer.analyze(request.prefix);

    while (iterations < this.config.maxIterations) {
      iterations++;

      // Generate draft prediction
      const draftStart = Date.now();
      const draft = await this.generateDraft(request, completion);
      totalDraftLatency += Date.now() - draftStart;

      if (!draft.tokens.length) break;

      // Verify with target model
      const verifyStart = Date.now();
      const verification = await this.verifier.verify(
        request.prefix + completion,
        draft.tokens,
        request.suffix
      );
      totalVerifyLatency += Date.now() - verifyStart;

      // Apply verification results
      completion += verification.finalOutput;
      totalReused += verification.reusedTokens;
      totalGenerated += verification.generatedTokens;
      acceptanceRates.push(verification.acceptanceRate);

      // Tune parameters based on acceptance
      this.tuner.recordResult(verification.acceptanceRate, draft.speculativeCount);

      // Check stopping conditions
      if (this.shouldStop(completion, request, verification)) {
        break;
      }
    }

    const avgAcceptance = acceptanceRates.length > 0
      ? acceptanceRates.reduce((a, b) => a + b, 0) / acceptanceRates.length
      : 0;

    const response: SpeculationResponse = {
      completion,
      acceptanceRate: avgAcceptance,
      totalTokens: totalReused + totalGenerated,
      reusedTokens: totalReused,
      generatedTokens: totalGenerated,
      iterations,
      totalLatencyMs: Date.now() - startTime,
      draftLatencyMs: totalDraftLatency,
      verifyLatencyMs: totalVerifyLatency,
      cacheHit: false,
    };

    // Cache successful completions
    if (this.config.enableCaching && avgAcceptance >= this.config.acceptanceTarget) {
      this.cache.set(request.prefix, request.language, response);
    }

    this.updateStats(response, false);
    return response;
  }

  /**
   * Generate draft prediction for current position
   */
  private async generateDraft(
    request: SpeculationRequest,
    currentCompletion: string
  ): Promise<DraftPrediction> {
    const fullPrefix = request.prefix + currentCompletion;

    // Get tuned parameters
    const params = this.tuner.getParameters();

    // Determine block type
    const blockType = this.blockGenerator.detectBlockType(
      fullPrefix,
      request.language
    );

    return this.draftModel.predict({
      prefix: fullPrefix,
      suffix: request.suffix,
      language: request.language,
      blockType: request.context ? 'multi-line' : blockType,
      speculativeCount: params.speculativeCount,
    });
  }

  /**
   * Check if generation should stop
   */
  private shouldStop(
    completion: string,
    request: SpeculationRequest,
    verification: VerificationResult
  ): boolean {
    // Max tokens reached
    if (request.maxTokens && completion.length >= request.maxTokens) {
      return true;
    }

    // Stop sequence found
    if (request.stopSequences) {
      for (const stop of request.stopSequences) {
        if (completion.includes(stop)) {
          return true;
        }
      }
    }

    // Very low acceptance rate (draft model not aligned)
    if (verification.acceptanceRate < 0.2) {
      return true;
    }

    // Natural code boundary
    if (this.blockGenerator.isNaturalBoundary(completion, request.language)) {
      return true;
    }

    return false;
  }

  /**
   * Update statistics
   */
  private updateStats(response: SpeculationResponse, cacheHit: boolean): void {
    this.stats.totalRequests++;
    this.stats.totalTokensGenerated += response.generatedTokens;
    this.stats.totalTokensReused += response.reusedTokens;

    // Update running average
    const n = this.stats.totalRequests;
    this.stats.averageAcceptanceRate =
      ((n - 1) * this.stats.averageAcceptanceRate + response.acceptanceRate) / n;
    this.stats.averageLatencyMs =
      ((n - 1) * this.stats.averageLatencyMs + response.totalLatencyMs) / n;

    if (cacheHit) {
      this.stats.cacheHitRate =
        ((n - 1) * this.stats.cacheHitRate + 1) / n;
    }
  }

  /**
   * Create empty stats object
   */
  private createEmptyStats(): SpeculativeStats {
    return {
      totalRequests: 0,
      totalTokensGenerated: 0,
      totalTokensReused: 0,
      averageAcceptanceRate: 0,
      averageLatencyMs: 0,
      cacheHitRate: 0,
      byLanguage: {},
    };
  }

  /**
   * Get current statistics
   */
  getStats(): SpeculativeStats {
    return { ...this.stats };
  }

  /**
   * Get efficiency metrics
   */
  getEfficiencyMetrics(): {
    tokenReuseRatio: number;
    speedupFactor: number;
    costSavings: number;
  } {
    const totalTokens = this.stats.totalTokensGenerated + this.stats.totalTokensReused;
    const reuseRatio = totalTokens > 0
      ? this.stats.totalTokensReused / totalTokens
      : 0;

    // Estimate speedup from reuse
    const speedupFactor = 1 / (1 - reuseRatio * 0.7);

    // Estimate cost savings (reused tokens don't cost output pricing)
    const costSavings = reuseRatio * 0.8; // ~80% savings on reused tokens

    return {
      tokenReuseRatio: reuseRatio,
      speedupFactor,
      costSavings,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<EfficientEditConfig>): void {
    this.config = { ...this.config, ...updates };

    if (updates.draftModel) {
      this.draftModel = new DraftModel({
        model: updates.draftModel,
        speculativeCount: this.config.speculativeCount,
      });
    }

    if (updates.targetModel) {
      this.verifier = new TargetVerifier({
        model: updates.targetModel,
      });
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.createEmptyStats();
  }
}

/**
 * Create EfficientEdit instance with default configuration
 */
export function createEfficientEdit(
  config?: Partial<EfficientEditConfig>
): EfficientEdit {
  return new EfficientEdit({
    draftModel: 'starcoder2:3b',
    targetModel: 'claude-sonnet-4-20250514',
    speculativeCount: 8,
    redundancyThreshold: 0.7,
    maxIterations: 5,
    acceptanceTarget: 0.75,
    enableCaching: true,
    ...config,
  });
}
