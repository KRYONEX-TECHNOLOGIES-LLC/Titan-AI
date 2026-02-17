/**
 * Relevance scorer for context items
 */

import type { ContextItem, RelevanceConfig } from './types';

export class RelevanceScorer {
  private config: RelevanceConfig;

  constructor(config: Partial<RelevanceConfig> = {}) {
    this.config = {
      semanticWeight: config.semanticWeight ?? 0.5,
      syntacticWeight: config.syntacticWeight ?? 0.3,
      recencyDecay: config.recencyDecay ?? 0.1,
      accessBoost: config.accessBoost ?? 0.05,
    };
  }

  score(item: ContextItem, query: string, context?: ScoringContext): number {
    let score = 0;

    // Semantic relevance (keyword matching for now, would use embeddings in production)
    score += this.config.semanticWeight * this.calculateSemanticRelevance(item, query);

    // Syntactic relevance (structural matching)
    score += this.config.syntacticWeight * this.calculateSyntacticRelevance(item, query);

    // Recency factor
    score += this.calculateRecencyFactor(item);

    // Access pattern boost
    if (context?.accessCounts?.[item.id]) {
      score += this.config.accessBoost * Math.log(context.accessCounts[item.id] + 1);
    }

    // Context-specific boosts
    if (context?.currentFile && item.source === context.currentFile) {
      score += 0.15;
    }

    if (context?.recentFiles?.includes(item.source)) {
      score += 0.1;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  private calculateSemanticRelevance(item: ContextItem, query: string): number {
    if (!query) return 0.5;

    const queryTerms = this.tokenize(query);
    const contentTerms = this.tokenize(item.content);

    if (queryTerms.length === 0 || contentTerms.length === 0) return 0;

    // Calculate term overlap
    const matches = queryTerms.filter(term => contentTerms.includes(term));
    const overlap = matches.length / queryTerms.length;

    // Boost for exact phrase match
    const queryLower = query.toLowerCase();
    const contentLower = item.content.toLowerCase();
    const exactBoost = contentLower.includes(queryLower) ? 0.2 : 0;

    return Math.min(overlap + exactBoost, 1);
  }

  private calculateSyntacticRelevance(item: ContextItem, query: string): number {
    // Check for code patterns
    const codePatterns = [
      /function\s+\w+/,
      /class\s+\w+/,
      /interface\s+\w+/,
      /const\s+\w+/,
      /let\s+\w+/,
      /def\s+\w+/,
      /fn\s+\w+/,
    ];

    let patternScore = 0;
    for (const pattern of codePatterns) {
      if (pattern.test(item.content) && pattern.test(query)) {
        patternScore += 0.1;
      }
    }

    // Check for similar structure
    const queryLines = query.split('\n').length;
    const contentLines = item.content.split('\n').length;
    const lineRatio = Math.min(queryLines, contentLines) / Math.max(queryLines, contentLines);

    return Math.min(patternScore + lineRatio * 0.3, 1);
  }

  private calculateRecencyFactor(item: ContextItem): number {
    const age = (Date.now() - item.timestamp.getTime()) / 1000 / 60; // minutes
    return Math.exp(-this.config.recencyDecay * age / 60);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  scoreMultiple(items: ContextItem[], query: string, context?: ScoringContext): Map<string, number> {
    const scores = new Map<string, number>();
    for (const item of items) {
      scores.set(item.id, this.score(item, query, context));
    }
    return scores;
  }

  rank(items: ContextItem[], query: string, context?: ScoringContext): ContextItem[] {
    const scores = this.scoreMultiple(items, query, context);
    return [...items].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  }

  updateConfig(config: Partial<RelevanceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): RelevanceConfig {
    return { ...this.config };
  }
}

export interface ScoringContext {
  currentFile?: string;
  recentFiles?: string[];
  accessCounts?: Record<string, number>;
  userPreferences?: Record<string, number>;
}

/**
 * Creates a relevance scorer instance
 */
export function createRelevanceScorer(config?: Partial<RelevanceConfig>): RelevanceScorer {
  return new RelevanceScorer(config);
}
