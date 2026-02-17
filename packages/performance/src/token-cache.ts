/**
 * Token cache for LLM prompt caching
 */

import { LRUCache } from 'lru-cache';
import type { CacheConfig, CacheStats, TokenCacheKey, TokenCacheEntry } from './types';
import { createHash } from 'crypto';

export class TokenCache {
  private cache: LRUCache<string, TokenCacheEntry>;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    const { maxSize = 10000, ttlMs = 3600000 } = config;

    this.cache = new LRUCache<string, TokenCacheEntry>({
      max: maxSize,
      ttl: ttlMs,
      updateAgeOnGet: config.updateAgeOnGet ?? true,
      sizeCalculation: (entry) => entry.tokenCount,
      maxSize: maxSize * 100, // Approximate max tokens
    });
  }

  /**
   * Generate cache key
   */
  private makeKey(key: TokenCacheKey): string {
    return `${key.model}:${key.promptHash}`;
  }

  /**
   * Hash prompt content
   */
  static hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  }

  /**
   * Get cached tokens
   */
  get(model: string, promptHash: string): TokenCacheEntry | undefined {
    const key = this.makeKey({ model, promptHash });
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
    } else {
      this.misses++;
    }

    return entry;
  }

  /**
   * Cache tokens
   */
  set(model: string, promptHash: string, tokens: string[]): void {
    const key = this.makeKey({ model, promptHash });

    this.cache.set(key, {
      tokens,
      tokenCount: tokens.length,
      cachedAt: Date.now(),
    });
  }

  /**
   * Check if entry exists
   */
  has(model: string, promptHash: string): boolean {
    return this.cache.has(this.makeKey({ model, promptHash }));
  }

  /**
   * Delete entry
   */
  delete(model: string, promptHash: string): boolean {
    return this.cache.delete(this.makeKey({ model, promptHash }));
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache stats
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Prune expired entries
   */
  prune(): void {
    this.cache.purgeStale();
  }

  /**
   * Get approximate memory usage
   */
  getMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      // Estimate ~4 bytes per token character
      total += entry.tokens.reduce((sum, t) => sum + t.length * 4, 0);
    }
    return total;
  }
}
