interface CacheEntry {
  value: string;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
}

export interface CacheStats {
  entries: number;
  totalBytes: number;
  hits: number;
  misses: number;
}

interface CacheManagerOptions {
  ttlMs: number;
  maxBytes?: number;
}

function estimateBytes(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

export function createCacheManager(options: CacheManagerOptions) {
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  const store = new Map<string, CacheEntry>();
  let totalBytes = 0;
  let hits = 0;
  let misses = 0;

  function evictExpired() {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        totalBytes -= entry.sizeBytes;
        store.delete(key);
      }
    }
  }

  function ensureCapacity(required: number) {
    if (required > maxBytes) return false;
    while (totalBytes + required > maxBytes && store.size > 0) {
      const oldestKey = store.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = store.get(oldestKey);
      if (!oldest) break;
      totalBytes -= oldest.sizeBytes;
      store.delete(oldestKey);
    }
    return totalBytes + required <= maxBytes;
  }

  function get(key: string): string | null {
    evictExpired();
    const entry = store.get(key);
    if (!entry) {
      misses += 1;
      return null;
    }
    hits += 1;
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function set(key: string, value: string) {
    evictExpired();
    const size = estimateBytes(value);
    const existing = store.get(key);
    if (existing) {
      totalBytes -= existing.sizeBytes;
      store.delete(key);
    }
    if (!ensureCapacity(size)) return false;
    const now = Date.now();
    store.set(key, {
      value,
      sizeBytes: size,
      createdAt: now,
      expiresAt: now + options.ttlMs,
    });
    totalBytes += size;
    return true;
  }

  function invalidate(filePath: string) {
    for (const [key, value] of store.entries()) {
      if (key.includes(filePath) || value.value.includes(filePath)) {
        totalBytes -= value.sizeBytes;
        store.delete(key);
      }
    }
  }

  function getStats(): CacheStats {
    evictExpired();
    return {
      entries: store.size,
      totalBytes,
      hits,
      misses,
    };
  }

  function clear() {
    store.clear();
    totalBytes = 0;
  }

  return {
    get,
    set,
    invalidate,
    getStats,
    clear,
  };
}
