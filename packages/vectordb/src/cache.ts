/**
 * Titan AI VectorDB - Embedding Cache
 * Cache embeddings to reduce API calls
 */

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize?: number;
}

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

export class EmbeddingCache {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry>;

  constructor(config: CacheConfig) {
    this.config = {
      maxSize: 10000,
      ...config,
    };
    this.cache = new Map();
  }

  /**
   * Get cached embedding
   */
  get(text: string): number[] | null {
    if (!this.config.enabled) return null;

    const key = this.hash(text);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.embedding;
  }

  /**
   * Set cached embedding
   */
  set(text: string, embedding: number[]): void {
    if (!this.config.enabled) return;

    // Evict if at capacity
    if (this.cache.size >= (this.config.maxSize ?? 10000)) {
      this.evictOldest();
    }

    const key = this.hash(text);
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  /**
   * Get multiple embeddings (returns found and missing)
   */
  getMany(texts: string[]): {
    found: Map<number, number[]>;
    missing: number[];
  } {
    const found = new Map<number, number[]>();
    const missing: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = this.get(texts[i]);
      if (cached) {
        found.set(i, cached);
      } else {
        missing.push(i);
      }
    }

    return { found, missing };
  }

  /**
   * Set multiple embeddings
   */
  setMany(texts: string[], embeddings: number[][]): void {
    for (let i = 0; i < texts.length; i++) {
      this.set(texts[i], embeddings[i]);
    }
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize ?? 10000,
      hitRate: 0, // Would need tracking
    };
  }

  /**
   * Hash text for cache key
   */
  private hash(text: string): string {
    // Simple hash - in production use a proper hash function
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Evict oldest entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}
