// api/_lib/redis.js - Shared Redis client utility with resilient fallback for LuminaVista Serverless Functions
import { Redis } from '@upstash/redis';

export function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  
  if (!url || !token || !url.startsWith('http')) {
    return null;
  }
  
  return new Redis({ url, token });
}

const fallbackStore = new Map();

class ResilientFallbackStorage {
  async get(key) {
    const item = fallbackStore.get(key);
    if (!item) return null;
    if (item.expires && Date.now() > item.expires) {
      fallbackStore.delete(key);
      return null;
    }
    return item.value;
  }
  async set(key, value, opts = {}) {
    const expires = opts.ex ? Date.now() + (opts.ex * 1000) : null;
    fallbackStore.set(key, { value, expires });
    return 'OK';
  }
  async del(key) {
    fallbackStore.delete(key);
    return 1;
  }
  async expire(key, seconds) {
    const item = fallbackStore.get(key);
    if (item) {
      item.expires = Date.now() + (seconds * 1000);
      return 1;
    }
    return 0;
  }
  async keys(pattern = '*') {
    const now = Date.now();
    const result = [];
    for (const [k, v] of fallbackStore.entries()) {
      if (v.expires && now > v.expires) {
        fallbackStore.delete(k);
        continue;
      }
      result.push(k);
    }
    return result;
  }
}

export function getSafeStorage() {
  const redis = getRedisClient();
  if (redis) return redis;
  if (!globalThis.__lumina_safe_storage) {
    globalThis.__lumina_safe_storage = new ResilientFallbackStorage();
  }
  return globalThis.__lumina_safe_storage;
}
