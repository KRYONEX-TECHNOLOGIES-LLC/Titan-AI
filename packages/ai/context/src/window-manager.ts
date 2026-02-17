/**
 * Window manager for context window optimization
 */

import { EventEmitter } from 'events';
import type { ContextItem, ContextWindow, WindowConfig, PriorityWeights } from './types';

export class WindowManager extends EventEmitter {
  private config: WindowConfig;
  private window: ContextWindow;

  constructor(config: Partial<WindowConfig> = {}) {
    super();
    this.config = {
      maxTokens: config.maxTokens ?? 128000,
      reservedForResponse: config.reservedForResponse ?? 4096,
      priorityWeights: config.priorityWeights ?? {
        recency: 0.25,
        relevance: 0.4,
        importance: 0.25,
        userExplicit: 0.1,
      },
      compressionEnabled: config.compressionEnabled ?? true,
    };

    this.window = {
      maxTokens: this.config.maxTokens,
      usedTokens: 0,
      items: [],
    };
  }

  getAvailableTokens(): number {
    return this.config.maxTokens - this.config.reservedForResponse - this.window.usedTokens;
  }

  canFit(item: ContextItem): boolean {
    return item.tokens <= this.getAvailableTokens();
  }

  add(item: ContextItem): boolean {
    if (!this.canFit(item)) {
      if (this.config.compressionEnabled) {
        this.makeRoom(item.tokens);
      } else {
        return false;
      }
    }

    if (!this.canFit(item)) {
      return false;
    }

    this.window.items.push(item);
    this.window.usedTokens += item.tokens;
    this.emit('item:added', item);
    return true;
  }

  remove(itemId: string): boolean {
    const index = this.window.items.findIndex(i => i.id === itemId);
    if (index === -1) return false;

    const removed = this.window.items.splice(index, 1)[0];
    this.window.usedTokens -= removed.tokens;
    this.emit('item:removed', removed);
    return true;
  }

  private makeRoom(requiredTokens: number): void {
    // Score items for eviction (lower score = evict first)
    const scored = this.window.items.map(item => ({
      item,
      score: this.calculateRetentionScore(item),
    }));

    // Sort by score (ascending, so lowest score first)
    scored.sort((a, b) => a.score - b.score);

    // Remove items until we have enough room
    let freed = 0;
    const toRemove: string[] = [];

    for (const { item } of scored) {
      if (this.getAvailableTokens() + freed >= requiredTokens) break;
      
      // Never remove user-explicit items
      if (item.metadata.userExplicit) continue;

      toRemove.push(item.id);
      freed += item.tokens;
    }

    for (const id of toRemove) {
      this.remove(id);
    }

    this.emit('window:compressed', { freedTokens: freed, removedCount: toRemove.length });
  }

  private calculateRetentionScore(item: ContextItem): number {
    const weights = this.config.priorityWeights;

    // Recency (higher for recent items)
    const age = (Date.now() - item.timestamp.getTime()) / 1000 / 60;
    const recencyScore = Math.exp(-age / 60);

    // Relevance (from item)
    const relevanceScore = item.relevance;

    // Importance based on type
    const importanceMap: Record<string, number> = {
      selection: 0.9,
      diagnostic: 0.8,
      definition: 0.7,
      reference: 0.6,
      file: 0.5,
      conversation: 0.5,
      tool_result: 0.6,
      search: 0.4,
      memory: 0.3,
    };
    const importanceScore = importanceMap[item.type] ?? 0.5;

    // User explicit (highest if set)
    const userExplicitScore = item.metadata.userExplicit ? 1 : 0;

    return (
      weights.recency * recencyScore +
      weights.relevance * relevanceScore +
      weights.importance * importanceScore +
      weights.userExplicit * userExplicitScore
    );
  }

  optimize(): void {
    // Re-score and potentially evict low-value items
    const threshold = 0.3;
    
    const toRemove = this.window.items
      .filter(item => {
        if (item.metadata.userExplicit) return false;
        return this.calculateRetentionScore(item) < threshold;
      })
      .map(item => item.id);

    for (const id of toRemove) {
      this.remove(id);
    }

    this.emit('window:optimized', { removedCount: toRemove.length });
  }

  getWindow(): ContextWindow {
    return { ...this.window, items: [...this.window.items] };
  }

  getItems(): ContextItem[] {
    return [...this.window.items];
  }

  getUsage(): { used: number; available: number; max: number; percentage: number } {
    const available = this.getAvailableTokens();
    return {
      used: this.window.usedTokens,
      available,
      max: this.config.maxTokens - this.config.reservedForResponse,
      percentage: (this.window.usedTokens / (this.config.maxTokens - this.config.reservedForResponse)) * 100,
    };
  }

  clear(): void {
    this.window.items = [];
    this.window.usedTokens = 0;
    this.emit('window:cleared');
  }

  setMaxTokens(maxTokens: number): void {
    this.config.maxTokens = maxTokens;
    this.window.maxTokens = maxTokens;
    
    // Compress if now over limit
    if (this.window.usedTokens > this.getAvailableTokens()) {
      this.optimize();
    }
  }

  updateWeights(weights: Partial<PriorityWeights>): void {
    this.config.priorityWeights = { ...this.config.priorityWeights, ...weights };
  }
}

/**
 * Creates a window manager instance
 */
export function createWindowManager(config?: Partial<WindowConfig>): WindowManager {
  return new WindowManager(config);
}
