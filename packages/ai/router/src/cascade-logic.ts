/**
 * Titan AI Router - Cascade Logic
 * Model cascade selection based on task requirements
 */

import type { ModelDefinition } from '@titan/ai-gateway';
import { MODEL_REGISTRY } from '@titan/ai-gateway';
import type { CascadeConfig, TaskAnalysis, TaskComplexity } from './types.js';

export class CascadeLogic {
  private config: CascadeConfig;

  constructor(config: CascadeConfig) {
    this.config = config;
  }

  /**
   * Select the optimal model from the cascade
   */
  selectModel(analysis: TaskAnalysis): ModelDefinition {
    // Check for frontier requirements
    if (this.requiresFrontier(analysis)) {
      return this.config.frontier;
    }

    // Check for standard requirements
    if (this.requiresStandard(analysis)) {
      return this.config.standard;
    }

    // Check for local capability
    if (this.canUseLocal(analysis)) {
      return this.config.local;
    }

    // Default to economy
    return this.config.economy;
  }

  /**
   * Get fallback models for a given model
   */
  getFallbacks(model: ModelDefinition, analysis: TaskAnalysis): ModelDefinition[] {
    const fallbacks: ModelDefinition[] = [];

    // Build fallback chain based on current model tier
    switch (model.tier) {
      case 'frontier':
        fallbacks.push(this.config.standard);
        if (!analysis.requiresThinking) {
          fallbacks.push(this.config.economy);
        }
        break;
      case 'standard':
        fallbacks.push(this.config.frontier); // Upgrade as fallback
        if (!analysis.requiresThinking) {
          fallbacks.push(this.config.economy);
        }
        break;
      case 'economy':
        fallbacks.push(this.config.standard);
        break;
      case 'local':
        fallbacks.push(this.config.economy);
        fallbacks.push(this.config.standard);
        break;
    }

    // Add alternative providers
    const alternatives = this.getAlternativeProviders(model, analysis);
    fallbacks.push(...alternatives);

    return fallbacks;
  }

  /**
   * Check if task requires frontier model
   */
  private requiresFrontier(analysis: TaskAnalysis): boolean {
    // Complexity check
    if (analysis.complexity === 'frontier') return true;

    // Task type check
    const frontierTasks = ['architecture', 'long-horizon', 'security-review'];
    if (frontierTasks.includes(analysis.type)) return true;

    // Token threshold check
    if (analysis.estimatedInputTokens >= this.config.thresholds.frontierMinTokens) {
      return true;
    }

    // Extended thinking required
    if (analysis.requiresThinking) return true;

    return false;
  }

  /**
   * Check if task requires standard model
   */
  private requiresStandard(analysis: TaskAnalysis): boolean {
    // Complexity check
    if (analysis.complexity === 'complex') return true;

    // Task type check
    const standardTasks = ['refactor', 'debug', 'test'];
    if (standardTasks.includes(analysis.type)) return true;

    // Token threshold check
    if (analysis.estimatedInputTokens >= this.config.thresholds.complexMinTokens) {
      return true;
    }

    // Vision required (not all economy models support it)
    if (analysis.requiresVision) return true;

    return false;
  }

  /**
   * Check if local model can handle the task
   */
  private canUseLocal(analysis: TaskAnalysis): boolean {
    // Never use local for complex tasks
    if (['complex', 'frontier'].includes(analysis.complexity)) return false;

    // Check capabilities
    if (analysis.requiresVision) return false;
    if (analysis.requiresThinking) return false;

    // Check context window (local models typically smaller)
    if (analysis.contextTokens > this.config.local.contextWindow * 0.8) {
      return false;
    }

    // Only trivial or simple tasks
    const localTasks = ['completion', 'chat', 'explain', 'documentation'];
    return localTasks.includes(analysis.type);
  }

  /**
   * Get alternative providers for the same tier
   */
  private getAlternativeProviders(
    model: ModelDefinition,
    analysis: TaskAnalysis
  ): ModelDefinition[] {
    return MODEL_REGISTRY.filter(m => {
      // Same tier, different provider
      if (m.tier !== model.tier) return false;
      if (m.provider === model.provider) return false;
      if (m.id === model.id) return false;

      // Check capabilities
      if (analysis.requiresVision && !m.supportsVision) return false;
      if (analysis.requiresTools && !m.supportsTools) return false;
      if (analysis.requiresThinking && !m.supportsThinking) return false;

      // Check context window
      if (analysis.contextTokens > m.contextWindow) return false;

      // Prefer models with similar capabilities
      return true;
    })
    // Sort by cost efficiency
    .sort((a, b) => {
      const aCost = a.costPer1MInput + a.costPer1MOutput;
      const bCost = b.costPer1MInput + b.costPer1MOutput;
      return aCost - bCost;
    });
  }

  /**
   * Get the cascade tier for a complexity level
   */
  getTierForComplexity(complexity: TaskComplexity): ModelDefinition {
    switch (complexity) {
      case 'trivial':
        return this.config.local;
      case 'simple':
        return this.config.economy;
      case 'moderate':
        return this.config.economy;
      case 'complex':
        return this.config.standard;
      case 'frontier':
        return this.config.frontier;
      default:
        return this.config.standard;
    }
  }

  /**
   * Update cascade configuration
   */
  updateConfig(updates: Partial<CascadeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current cascade configuration
   */
  getConfig(): CascadeConfig {
    return { ...this.config };
  }
}

/**
 * Create default cascade configuration.
 *
 * TITAN COST ARCHITECTURE — cascade tiers:
 *   frontier  → Qwen3.5-Plus ($0.40/$2.40 per 1M) — 1M context, frontier reasoning, 37x cheaper than Opus.
 *   standard  → DeepSeek-Reasoner ($0.55/$2.19 per 1M) — chain-of-thought, replaces GPT-5.3 ($10/$40).
 *   economy   → Qwen3-Coder-Next ($0.12/$0.75 per 1M) — purpose-built code generation at near-zero cost.
 *   local     → llama3.3:70b (free, Ollama) — trivial completions, no API cost.
 *
 * This means even "frontier" tasks cost ~$0.40 input vs $15 for Opus — a 37x reduction with no quality loss
 * because Qwen3.5-Plus matches Opus on coding and reasoning benchmarks.
 */
export function createDefaultCascade(): CascadeConfig {
  // Frontier: Qwen3.5-Plus — frontier reasoning at economy price
  const frontier = MODEL_REGISTRY.find(m => m.id === 'qwen3.5-plus-02-15');
  // Standard: DeepSeek-Reasoner — chain-of-thought verification and planning
  const standard = MODEL_REGISTRY.find(m => m.id === 'deepseek-r1');
  // Economy: Qwen3-Coder-Next — purpose-built code generation
  const economy = MODEL_REGISTRY.find(m => m.id === 'qwen3-coder-next');
  // Local: free Ollama model for trivial tasks
  const local = MODEL_REGISTRY.find(m => m.id === 'llama3.3:70b');

  if (!frontier || !standard || !economy || !local) {
    throw new Error('Required models not found in registry — check model-registry.ts');
  }

  return {
    frontier,
    standard,
    economy,
    local,
    thresholds: {
      trivialMaxTokens: 500,
      simpleMaxTokens: 2000,
      moderateMaxTokens: 8000,
      complexMinTokens: 8000,
      frontierMinTokens: 50000,
    },
  };
}
