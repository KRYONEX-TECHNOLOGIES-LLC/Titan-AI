/**
 * Context manager for assembling AI context
 */

import { EventEmitter } from 'events';
import type { ContextItem, ContextRequest, ContextResult, ContextProvider, ContextType } from './types';

export interface ContextManagerConfig {
  maxTokens: number;
  reservedTokens: number;
  defaultMaxItems: number;
}

export class ContextManager extends EventEmitter {
  private config: ContextManagerConfig;
  private providers: Map<string, ContextProvider> = new Map();
  private cache: Map<string, ContextItem[]> = new Map();
  private idCounter: number = 0;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    super();
    this.config = {
      maxTokens: config.maxTokens ?? 100000,
      reservedTokens: config.reservedTokens ?? 4000,
      defaultMaxItems: config.defaultMaxItems ?? 50,
    };
  }

  registerProvider(provider: ContextProvider): void {
    this.providers.set(provider.id, provider);
    this.emit('provider:registered', provider);
  }

  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
    this.emit('provider:unregistered', { id: providerId });
  }

  async gatherContext(request: ContextRequest): Promise<ContextResult> {
    const maxItems = request.maxItems ?? this.config.defaultMaxItems;
    const targetTypes = request.types ?? ['file', 'selection', 'definition', 'reference', 'diagnostic'];
    
    // Get all items from providers
    const allItems: ContextItem[] = [];
    
    const relevantProviders = Array.from(this.providers.values())
      .filter(p => p.types.some(t => targetTypes.includes(t)))
      .sort((a, b) => b.priority - a.priority);

    for (const provider of relevantProviders) {
      try {
        const items = await provider.getContext(request);
        allItems.push(...items);
      } catch (error) {
        this.emit('provider:error', { provider: provider.id, error });
      }
    }

    // Score and sort items
    const scoredItems = allItems.map(item => ({
      item,
      score: this.calculateRelevance(item, request),
    }));

    scoredItems.sort((a, b) => b.score - a.score);

    // Select items within token budget
    const availableTokens = this.config.maxTokens - this.config.reservedTokens;
    const selectedItems: ContextItem[] = [];
    let totalTokens = 0;

    for (const { item, score } of scoredItems) {
      if (selectedItems.length >= maxItems) break;
      if (totalTokens + item.tokens > availableTokens) continue;

      selectedItems.push({
        ...item,
        relevance: score,
      });
      totalTokens += item.tokens;
    }

    const relevanceScores = new Map<string, number>();
    for (const { item, score } of scoredItems) {
      relevanceScores.set(item.id, score);
    }

    const result: ContextResult = {
      items: selectedItems,
      totalTokens,
      truncated: scoredItems.length > selectedItems.length,
      relevanceScores,
    };

    this.emit('context:gathered', result);
    return result;
  }

  private calculateRelevance(item: ContextItem, request: ContextRequest): number {
    let score = item.relevance;

    // Boost for matching query terms
    if (request.query) {
      const queryTerms = request.query.toLowerCase().split(/\s+/);
      const contentLower = item.content.toLowerCase();
      const matchCount = queryTerms.filter(term => contentLower.includes(term)).length;
      score += matchCount / queryTerms.length * 0.3;
    }

    // Boost for current file
    if (request.currentFile && item.source === request.currentFile) {
      score += 0.2;
    }

    // Recency boost
    const age = (Date.now() - item.timestamp.getTime()) / 1000 / 60; // minutes
    score += Math.exp(-age / 30) * 0.1;

    // Type-based boost
    const typeBoosts: Record<ContextType, number> = {
      selection: 0.3,
      diagnostic: 0.25,
      definition: 0.2,
      reference: 0.15,
      file: 0.1,
      conversation: 0.1,
      search: 0.1,
      memory: 0.05,
      tool_result: 0.15,
    };
    score += typeBoosts[item.type] ?? 0;

    return Math.min(score, 1);
  }

  createContextItem(
    type: ContextType,
    content: string,
    source: string,
    metadata: Record<string, unknown> = {}
  ): ContextItem {
    return {
      id: `ctx-${++this.idCounter}`,
      type,
      content,
      source,
      tokens: this.estimateTokens(content),
      relevance: 0.5,
      timestamp: new Date(),
      metadata,
    };
  }

  private estimateTokens(content: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(content.length / 4);
  }

  // Explicit context management
  addExplicitContext(item: ContextItem): void {
    const cached = this.cache.get('explicit') ?? [];
    cached.push(item);
    this.cache.set('explicit', cached);
    this.emit('context:added', item);
  }

  removeExplicitContext(itemId: string): void {
    const cached = this.cache.get('explicit') ?? [];
    const filtered = cached.filter(item => item.id !== itemId);
    this.cache.set('explicit', filtered);
    this.emit('context:removed', { id: itemId });
  }

  getExplicitContext(): ContextItem[] {
    return this.cache.get('explicit') ?? [];
  }

  clearCache(): void {
    this.cache.clear();
    this.emit('cache:cleared');
  }

  getProviders(): ContextProvider[] {
    return Array.from(this.providers.values());
  }

  getConfig(): ContextManagerConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }
}

/**
 * Creates a context manager instance
 */
export function createContextManager(config?: Partial<ContextManagerConfig>): ContextManager {
  return new ContextManager(config);
}
