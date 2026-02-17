/**
 * Embedding cache for vector embeddings
 */

import { LRUCache } from 'lru-cache';
import type { CacheConfig, CacheStats, EmbeddingCacheKey, EmbeddingCacheEntry } from './types';
import { createHash } from 'crypto';

export class PerformanceEmbeddingCache {
  private cache: LRUCache<string, EmbeddingCacheEntry>;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    const { maxSize = 50000, ttlMs = 86400000 } = config; // 24h default TTL

    this.cache = new LRUCache<string, EmbeddingCacheEntry>({
      max: maxSize,
      ttl: ttlMs,
      updateAgeOnGet: config.updateAgeOnGet ?? true,
      sizeCalculation: (entry) => entry.dimensions,
      maxSize: maxSize * 1536, // Approximate max dimensions
    });
  }

  /**
   * Generate cache key
   */
  private makeKey(key: EmbeddingCacheKey): string {
    return `${key.provider}:${key.model}:${key.contentHash}`;
  }

  /**
   * Hash content for caching
   */
  static hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get cached embedding
   */
  get(provider: string, model: string, contentHash: string): number[] | undefined {
    const key = this.makeKey({ provider, model, contentHash });
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
      return entry.embedding;
    }

    this.misses++;
    return undefined;
  }

  /**
   * Cache embedding
   */
  set(provider: string, model: string, contentHash: string, embedding: number[]): void {
    const key = this.makeKey({ provider, model, contentHash });

    this.cache.set(key, {
      embedding,
      dimensions: embedding.length,
      cachedAt: Date.now(),
    });
  }

  /**
   * Batch get embeddings
   */
  batchGet(
    provider: string,
    model: string,
    contentHashes: string[]
  ): Map<string, number[]> {
    const results = new Map<string, number[]>();

    for (const hash of contentHashes) {
      const embedding = this.get(provider, model, hash);
      if (embedding) {
        results.set(hash, embedding);
      }
    }

    return results;
  }

  /**
   * Batch set embeddings
   */
  batchSet(
    provider: string,
    model: string,
    embeddings: Map<string, number[]>
  ): void {
    for (const [hash, embedding] of embeddings) {
      this.set(provider, model, hash, embedding);
    }
  }

  /**
   * Check if entry exists
   */
  has(provider: string, model: string, contentHash: string): boolean {
    return this.cache.has(this.makeKey({ provider, model, contentHash }));
  }

  /**
   * Delete entry
   */
  delete(provider: string, model: string, contentHash: string): boolean {
    return this.cache.delete(this.makeKey({ provider, model, contentHash }));
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
   * Get approximate memory usage in bytes
   */
  getMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      // 8 bytes per float64
      total += entry.embedding.length * 8;
    }
    return total;
  }

  /**
   * Export cache for persistence
   */
  export(): Array<{ key: string; entry: EmbeddingCacheEntry }> {
    const entries: Array<{ key: string; entry: EmbeddingCacheEntry }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({ key, entry });
    }

    return entries;
  }

  /**
   * Import cache from persistence
   */
  import(entries: Array<{ key: string; entry: EmbeddingCacheEntry }>): void {
    for (const { key, entry } of entries) {
      // Check if entry is still valid
      if (Date.now() - entry.cachedAt < (this.cache.ttl || 86400000)) {
        this.cache.set(key, entry);
      }
    }
  }
}
