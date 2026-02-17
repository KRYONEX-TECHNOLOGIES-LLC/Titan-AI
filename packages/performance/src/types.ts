/**
 * Performance types
 */

export interface CacheConfig {
  maxSize: number;
  ttlMs: number;
  updateAgeOnGet: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  accessCount: number;
  size: number;
}

export interface TokenCacheKey {
  model: string;
  promptHash: string;
}

export interface TokenCacheEntry {
  tokens: string[];
  tokenCount: number;
  cachedAt: number;
}

export interface EmbeddingCacheKey {
  provider: string;
  model: string;
  contentHash: string;
}

export interface EmbeddingCacheEntry {
  embedding: number[];
  dimensions: number;
  cachedAt: number;
}

export interface WarmUpConfig {
  priorityFiles: string[];
  maxConcurrent: number;
  batchSize: number;
  delayMs: number;
}

export interface WarmUpProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  estimatedTimeMs: number;
}

export interface GPUConfig {
  enabled: boolean;
  deviceId: number;
  memoryLimit: number;
  backend: 'cuda' | 'metal' | 'vulkan' | 'cpu';
}

export interface GPUStatus {
  available: boolean;
  backend: string;
  deviceName: string;
  memoryTotal: number;
  memoryUsed: number;
  computeCapability: string;
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
}

export interface PerformanceReport {
  period: {
    start: number;
    end: number;
  };
  cacheStats: {
    tokenCache: CacheStats;
    embeddingCache: CacheStats;
  };
  latencyStats: {
    p50: number;
    p90: number;
    p99: number;
    mean: number;
  };
  throughput: {
    requestsPerSecond: number;
    tokensPerSecond: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
}
