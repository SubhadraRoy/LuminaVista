// api/_lib/redis.js - Shared Redis client utility for LuminaVista Serverless Functions
import { Redis } from '@upstash/redis';

export function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  
  if (!url || !token || !url.startsWith('http')) {
    return null;
  }
  
  return new Redis({ url, token });
}
