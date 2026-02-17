/**
 * Titan AI Speculative - Pattern Cache
 * Cache successful speculative patterns for reuse
 */

import type { PatternCacheEntry, SpeculationResponse } from './types.js';

export interface CacheConfig {
  maxEntries: number;
  maxAge: number;
  minAcceptanceRate: number;
  minUseCount: number;
}

export class SpeculativeCache {
  private config: CacheConfig;
  private cache: Map<string, PatternCacheEntry>;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxEntries: 1000,
      maxAge: 3600000, // 1 hour
      minAcceptanceRate: 0.7,
      minUseCount: 2,
      ...config,
    };

    this.cache = new Map();
  }

  /**
   * Get cached completion for a pattern
   */
  get(prefix: string, language: string): SpeculationResponse | null {
    const key = this.createKey(prefix, language);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.lastUsed > this.config.maxAge) {
      this.cache.delete(key);
      return null;
    }

    // Update use count
    entry.useCount++;
    entry.lastUsed = Date.now();

    return {
      completion: entry.completion,
      acceptanceRate: entry.acceptanceRate,
      totalTokens: 0,
      reusedTokens: entry.completion.length,
      generatedTokens: 0,
      iterations: 0,
      totalLatencyMs: 0,
      draftLatencyMs: 0,
      verifyLatencyMs: 0,
      cacheHit: true,
    };
  }

  /**
   * Store a successful completion
   */
  set(prefix: string, language: string, response: SpeculationResponse): void {
    // Only cache high-quality results
    if (response.acceptanceRate < this.config.minAcceptanceRate) {
      return;
    }

    const key = this.createKey(prefix, language);

    // Check existing entry
    const existing = this.cache.get(key);
    if (existing && existing.acceptanceRate >= response.acceptanceRate) {
      // Keep existing if better
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      pattern: this.extractPattern(prefix),
      completion: response.completion,
      language,
      acceptanceRate: response.acceptanceRate,
      useCount: 1,
      lastUsed: Date.now(),
    });
  }

  /**
   * Create cache key from prefix and language
   */
  private createKey(prefix: string, language: string): string {
    // Use last N characters of prefix as key
    const pattern = this.extractPattern(prefix);
    return `${language}:${pattern}`;
  }

  /**
   * Extract pattern from prefix
   */
  private extractPattern(prefix: string): string {
    // Take last 100 characters, normalized
    const suffix = prefix.slice(-100);
    return suffix.trim().replace(/\s+/g, ' ');
  }

  /**
   * Evict oldest/least used entries
   */
  private evictOldest(): void {
    // Sort by last used + use count
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        score: entry.lastUsed + entry.useCount * 60000,
      }))
      .sort((a, b) => a.score - b.score);

    // Remove bottom 10%
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i].key);
    }
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    totalHits: number;
    averageAcceptanceRate: number;
    topPatterns: Array<{ pattern: string; useCount: number }>;
  } {
    const entries = Array.from(this.cache.values());

    const totalHits = entries.reduce((sum, e) => sum + e.useCount, 0);
    const avgAcceptance = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.acceptanceRate, 0) / entries.length
      : 0;

    const topPatterns = entries
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 10)
      .map(e => ({ pattern: e.pattern.slice(0, 50), useCount: e.useCount }));

    return {
      entries: this.cache.size,
      totalHits,
      averageAcceptanceRate: avgAcceptance,
      topPatterns,
    };
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastUsed > this.config.maxAge) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Export cache to JSON
   */
  export(): string {
    const entries = Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.useCount >= this.config.minUseCount);

    return JSON.stringify({
      config: this.config,
      entries,
      exportedAt: Date.now(),
    }, null, 2);
  }

  /**
   * Import cache from JSON
   */
  import(data: string): void {
    try {
      const parsed = JSON.parse(data) as {
        entries?: Array<[string, PatternCacheEntry]>;
      };

      if (parsed.entries) {
        for (const [key, entry] of parsed.entries) {
          this.cache.set(key, entry);
        }
      }
    } catch {
      // Ignore invalid import
    }
  }
}
