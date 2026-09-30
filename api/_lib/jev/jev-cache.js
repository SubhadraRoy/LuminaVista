/**
 * api/_lib/jev/jev-cache.js - Sub-Millisecond L0 LRU Decision Cache
 * Provides high-throughput (< 0.05ms) intent caching for repetitive or common prompt structures.
 */

class JevLruCache {
  constructor(maxSize = 512) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  _hashKey(prompt = '', vfsFiles = []) {
    const pTrim = String(prompt).trim().toLowerCase();
    const sortedFiles = Array.isArray(vfsFiles) ? vfsFiles.slice().sort().join('|') : '';
    // Fast 32-bit FNV-1a hash
    let hash = 2166136261;
    const str = `${pTrim}::${sortedFiles}`;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36) + `_${pTrim.slice(0, 32).replace(/[^a-z0-9]/g, '_')}`;
  }

  get(prompt, vfsFiles) {
    const key = this._hashKey(prompt, vfsFiles);
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }
    this.hits++;
    const value = this.cache.get(key);
    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, value);
    // Return clone with updated cacheHit flag
    return {
      ...value,
      cached: true,
      latencyMs: 0
    };
  }

  set(prompt, vfsFiles, result) {
    if (!result || typeof result !== 'object') return;
    const key = this._hashKey(prompt, vfsFiles);
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first inserted key in Map)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    // Store clone
    this.cache.set(key, { ...result });
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Number((this.hits / total).toFixed(3)) : 0
    };
  }
}

export const jevCache = new JevLruCache(512);

export function getCachedIntent(prompt, vfsFiles) {
  return jevCache.get(prompt, vfsFiles);
}

export function setCachedIntent(prompt, vfsFiles, result) {
  jevCache.set(prompt, vfsFiles, result);
}

export function jevClearCache() {
  jevCache.clear();
}

export function jevGetCacheStats() {
  return jevCache.getStats();
}
