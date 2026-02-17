/**
 * Context shaper for intelligent context window management
 */

import { EventEmitter } from 'events';
import type { ContextWindow, ContextSegment, ShapingStrategy } from './types';

export interface ContextShaperConfig {
  maxTokens: number;
  reservedTokens: number;
  defaultStrategy: ShapingStrategy;
}

export class ContextShaper extends EventEmitter {
  private config: ContextShaperConfig;
  private window: ContextWindow;
  private strategies: Map<string, ShapingStrategy> = new Map();

  constructor(config: Partial<ContextShaperConfig> = {}) {
    super();
    this.config = {
      maxTokens: config.maxTokens ?? 128000,
      reservedTokens: config.reservedTokens ?? 4000,
      defaultStrategy: config.defaultStrategy ?? this.createDefaultStrategy(),
    };

    this.window = {
      maxTokens: this.config.maxTokens,
      usedTokens: 0,
      availableTokens: this.config.maxTokens - this.config.reservedTokens,
      segments: [],
    };

    this.registerStrategy(this.config.defaultStrategy);
  }

  private createDefaultStrategy(): ShapingStrategy {
    return {
      name: 'balanced',
      priorityWeights: {
        recency: 0.3,
        relevance: 0.4,
        importance: 0.2,
        userProvided: 0.1,
      },
      compressionRatio: 0.5,
      preserveLastN: 10,
    };
  }

  registerStrategy(strategy: ShapingStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  addSegment(segment: Omit<ContextSegment, 'id'>): ContextSegment {
    const newSegment: ContextSegment = {
      ...segment,
      id: `seg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };

    this.window.segments.push(newSegment);
    this.window.usedTokens += segment.tokens;

    // Auto-shape if over limit
    if (this.window.usedTokens > this.window.availableTokens) {
      this.shape(this.config.defaultStrategy.name);
    }

    this.emit('segment:added', newSegment);
    return newSegment;
  }

  removeSegment(segmentId: string): boolean {
    const index = this.window.segments.findIndex(s => s.id === segmentId);
    if (index === -1) return false;

    const removed = this.window.segments.splice(index, 1)[0];
    this.window.usedTokens -= removed.tokens;

    this.emit('segment:removed', removed);
    return true;
  }

  shape(strategyName?: string): ContextSegment[] {
    const strategy = this.strategies.get(strategyName ?? 'balanced') ?? this.config.defaultStrategy;
    
    // Score each segment
    const scored = this.window.segments.map(segment => ({
      segment,
      score: this.calculateScore(segment, strategy),
    }));

    // Sort by score (higher is better, should be kept)
    scored.sort((a, b) => b.score - a.score);

    // Preserve the last N segments regardless of score
    const preserved = new Set(
      this.window.segments
        .slice(-strategy.preserveLastN)
        .map(s => s.id)
    );

    // Keep segments until we're under the limit
    const kept: ContextSegment[] = [];
    const removed: ContextSegment[] = [];
    let usedTokens = 0;

    for (const { segment } of scored) {
      const mustKeep = preserved.has(segment.id);
      
      if (mustKeep || usedTokens + segment.tokens <= this.window.availableTokens) {
        kept.push(segment);
        usedTokens += segment.tokens;
      } else {
        // Try compression before removal
        const compressed = this.compressSegment(segment, strategy.compressionRatio);
        
        if (usedTokens + compressed.tokens <= this.window.availableTokens) {
          kept.push(compressed);
          usedTokens += compressed.tokens;
        } else {
          removed.push(segment);
        }
      }
    }

    // Restore chronological order
    kept.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    this.window.segments = kept;
    this.window.usedTokens = usedTokens;

    this.emit('shaped', { kept: kept.length, removed: removed.length });
    return removed;
  }

  private calculateScore(segment: ContextSegment, strategy: ShapingStrategy): number {
    const now = Date.now();
    const age = (now - segment.timestamp.getTime()) / 1000 / 60; // minutes

    // Recency score (decays over time)
    const recencyScore = Math.exp(-age / 60); // Half-life of ~60 minutes

    // Relevance score (from segment metadata or default)
    const relevanceScore = (segment.metadata?.relevance as number) ?? 0.5;

    // Importance based on type
    const importanceMap: Record<string, number> = {
      system: 1.0,
      user: 0.9,
      assistant: 0.7,
      code: 0.8,
      file: 0.6,
      search: 0.5,
      memory: 0.4,
    };
    const importanceScore = importanceMap[segment.type] ?? 0.5;

    // User-provided priority
    const userScore = segment.priority / 10;

    // Weighted sum
    return (
      strategy.priorityWeights.recency * recencyScore +
      strategy.priorityWeights.relevance * relevanceScore +
      strategy.priorityWeights.importance * importanceScore +
      strategy.priorityWeights.userProvided * userScore
    );
  }

  private compressSegment(segment: ContextSegment, ratio: number): ContextSegment {
    // Simple compression: truncate content
    const targetLength = Math.floor(segment.content.length * ratio);
    const compressed = segment.content.substring(0, targetLength) + '...';
    const compressedTokens = Math.floor(segment.tokens * ratio);

    return {
      ...segment,
      content: compressed,
      tokens: compressedTokens,
      metadata: {
        ...segment.metadata,
        compressed: true,
        originalTokens: segment.tokens,
      },
    };
  }

  getWindow(): ContextWindow {
    return { ...this.window };
  }

  getSegments(): ContextSegment[] {
    return [...this.window.segments];
  }

  getUsage(): { used: number; available: number; percentage: number } {
    return {
      used: this.window.usedTokens,
      available: this.window.availableTokens,
      percentage: (this.window.usedTokens / this.window.availableTokens) * 100,
    };
  }

  clear(): void {
    this.window.segments = [];
    this.window.usedTokens = 0;
    this.emit('cleared');
  }

  setMaxTokens(maxTokens: number): void {
    this.config.maxTokens = maxTokens;
    this.window.maxTokens = maxTokens;
    this.window.availableTokens = maxTokens - this.config.reservedTokens;
    
    if (this.window.usedTokens > this.window.availableTokens) {
      this.shape();
    }
  }

  buildPrompt(): string {
    return this.window.segments
      .map(s => s.content)
      .join('\n\n');
  }
}

/**
 * Creates a context shaper instance
 */
export function createContextShaper(config?: Partial<ContextShaperConfig>): ContextShaper {
  return new ContextShaper(config);
}
