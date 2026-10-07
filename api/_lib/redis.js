// api/_lib/redis.js - Shared Redis client utility with resilient fallback for LuminaVista Serverless Functions
import { Redis } from '@upstash/redis';

export function createRawRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  
  if (!url || !token || !url.startsWith('http')) {
    return null;
  }
  
  return new Redis({ url, token });
}

export function getRedisClient() {
  const raw = createRawRedisClient();
  if (!raw) return null;
  return getSafeStorage();
}

const fallbackStore = new Map();

export class ResilientFallbackStorage {
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
    if (opts.nx) {
      const existing = await this.get(key);
      if (existing !== null) return null;
    }
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
  async incr(key) {
    const item = fallbackStore.get(key);
    let val = 1;
    let expires = null;
    if (item) {
      if (item.expires && Date.now() > item.expires) {
        val = 1;
      } else {
        val = (parseInt(item.value, 10) || 0) + 1;
        expires = item.expires;
      }
    }
    fallbackStore.set(key, { value: val, expires });
    return val;
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
  pipeline() {
    const queue = [];
    const self = this;
    const p = {
      incr(key) { queue.push(() => self.incr(key)); return p; },
      expire(key, sec) { queue.push(() => self.expire(key, sec)); return p; },
      set(key, val, opts) { queue.push(() => self.set(key, val, opts)); return p; },
      get(key) { queue.push(() => self.get(key)); return p; },
      del(key) { queue.push(() => self.del(key)); return p; },
      async exec() {
        const results = [];
        for (const fn of queue) {
          try {
            results.push(await fn());
          } catch (_) {
            results.push(null);
          }
        }
        return results;
      }
    };
    return p;
  }
}

export class SafeStorageProxy {
  constructor(rawRedis, fallback) {
    this.rawRedis = rawRedis;
    this.fallback = fallback;
    this.disabledUntil = 0;
  }

  isAvailable() {
    return Boolean(this.rawRedis && Date.now() >= this.disabledUntil);
  }

  handleError(err, op = 'op') {
    const msg = String(err?.message || err);
    if (/limit exceeded|quota|rate limit|429/i.test(msg)) {
      this.disabledUntil = Date.now() + 60000;
      console.warn(`[SAFE_STORAGE] Redis quota exceeded during ${op} (${msg}). Degrading to fallback memory storage for 60s.`);
    } else {
      this.disabledUntil = Date.now() + 5000;
      console.warn(`[SAFE_STORAGE] Redis error during ${op} (${msg}). Falling back to memory storage.`);
    }
  }

  async get(key) {
    if (this.isAvailable()) {
      try {
        const res = await this.rawRedis.get(key);
        return res !== undefined ? res : null;
      } catch (err) {
        this.handleError(err, 'get');
      }
    }
    return this.fallback.get(key);
  }

  async set(key, value, opts) {
    let redisRes = null;
    let success = false;
    if (this.isAvailable()) {
      try {
        redisRes = await this.rawRedis.set(key, value, opts);
        success = true;
      } catch (err) {
        this.handleError(err, 'set');
      }
    }
    const fallbackRes = await this.fallback.set(key, value, opts);
    return success ? redisRes : fallbackRes;
  }

  async del(key) {
    let count = 0;
    if (this.isAvailable()) {
      try {
        count = await this.rawRedis.del(key);
      } catch (err) {
        this.handleError(err, 'del');
      }
    }
    await this.fallback.del(key);
    return count || 1;
  }

  async expire(key, seconds) {
    if (this.isAvailable()) {
      try {
        return await this.rawRedis.expire(key, seconds);
      } catch (err) {
        this.handleError(err, 'expire');
      }
    }
    return this.fallback.expire(key, seconds);
  }

  async incr(key) {
    if (this.isAvailable()) {
      try {
        return await this.rawRedis.incr(key);
      } catch (err) {
        this.handleError(err, 'incr');
      }
    }
    return this.fallback.incr(key);
  }

  async keys(pattern = '*') {
    if (this.isAvailable()) {
      try {
        return await this.rawRedis.keys(pattern);
      } catch (err) {
        this.handleError(err, 'keys');
      }
    }
    return this.fallback.keys(pattern);
  }

  pipeline() {
    if (this.isAvailable() && typeof this.rawRedis.pipeline === 'function') {
      try {
        const rawP = this.rawRedis.pipeline();
        const self = this;
        return {
          incr(k) { rawP.incr(k); return this; },
          expire(k, s, mode) {
            try { rawP.expire(k, s, mode); } catch (_) { rawP.expire(k, s); }
            return this;
          },
          set(k, v, o) { rawP.set(k, v, o); return this; },
          get(k) { rawP.get(k); return this; },
          del(k) { rawP.del(k); return this; },
          async exec() {
            try {
              return await rawP.exec();
            } catch (err) {
              self.handleError(err, 'pipeline.exec');
              return [1, 1];
            }
          }
        };
      } catch (err) {
        this.handleError(err, 'pipeline');
      }
    }
    return this.fallback.pipeline();
  }
}

export function getSafeStorage() {
  if (!globalThis.__lumina_resilient_fallback) {
    globalThis.__lumina_resilient_fallback = new ResilientFallbackStorage();
  }
  const fallback = globalThis.__lumina_resilient_fallback;
  const rawRedis = createRawRedisClient();
  if (rawRedis) {
    if (!globalThis.__lumina_safe_storage_proxy) {
      globalThis.__lumina_safe_storage_proxy = new SafeStorageProxy(rawRedis, fallback);
    }
    return globalThis.__lumina_safe_storage_proxy;
  }
  return fallback;
}
