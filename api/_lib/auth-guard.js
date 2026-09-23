// api/_lib/auth-guard.js - Centralized Zero-Trust Auth, Rate Limiting & Secret Masking
import { Redis } from '@upstash/redis';
import { getRedisClient } from './redis.js';

/**
 * Extracts and sanitizes client IP address from request headers.
 */
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp.replace(/[^a-fA-F0-9.:]/g, '');
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Validates the godx_session cookie against Upstash Redis.
 * Enforces a sliding 20-minute session expiration window on success.
 */
export async function validateSession(req, redisClient = null) {
  const cookieHeader = req.headers?.cookie || '';
  const match = cookieHeader.match(/godx_session=([a-zA-Z0-9_-]+)/);

  if (!match || !match[1]) {
    return { valid: false, status: 401, error: 'Unauthorized Session' };
  }

  const sessionId = match[1];
  const redis = redisClient || getRedisClient();

  if (!redis) {
    return { valid: false, status: 500, error: 'Security database unavailable.' };
  }

  try {
    const sessionState = await redis.get(`session:${sessionId}`);
    if (!sessionState) {
      return { valid: false, status: 401, error: 'Session Expired / Unauthorized' };
    }

    // Refresh 20-minute sliding window (1200 seconds)
    await redis.expire(`session:${sessionId}`, 1200);

    return { valid: true, sessionId };
  } catch (error) {
    console.error("[AUTH_GUARD] Redis session verification failure:", error.message);
    return { valid: false, status: 500, error: 'Authentication engine error.' };
  }
}

/**
 * IP-based sliding rate-limiting in Redis.
 * Protects against DDoS, brute force, and compute credit exhaustion.
 */
export async function checkRateLimit(req, redisClient, routeKey, maxRequests = 30, windowSeconds = 300) {
  const redis = redisClient || getRedisClient();
  if (!redis) return { allowed: true }; // Graceful degradation if Redis is unconfigured in test mocks

  const clientIp = getClientIp(req);
  const key = `rate_limit:${routeKey}:${clientIp}`;

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > maxRequests) {
      return {
        allowed: false,
        status: 429,
        error: `Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.round(windowSeconds / 60)} minutes.`
      };
    }

    return { allowed: true, remaining: maxRequests - current };
  } catch (err) {
    console.error("[AUTH_GUARD] Rate-limiting error:", err.message);
    return { allowed: true };
  }
}

/**
 * Sanitizes errors before sending to clients.
 * Strips API keys, Bearer tokens, URLs, file paths, and environment variable values.
 */
export function sanitizeError(error, defaultMessage = 'An internal processing error occurred.') {
  if (!error) return defaultMessage;
  const raw = typeof error === 'string' ? error : (error.message || String(error));

  // Strip Bearer tokens and potential API key fragments
  let safe = raw
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:sk-[A-Za-z0-9_-]{12,}|key-[A-Za-z0-9_-]{12,}|e2b_[A-Za-z0-9_-]{12,})/gi, '[REDACTED_KEY]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/(?:password|token|secret|apiKey)=([^&\s]+)/gi, '$1=[REDACTED]');

  // If the raw error still contains sensitive stack or provider details, mask with default
  if (/at\s+.+\(.+:\d+:\d+\)/.test(safe) || safe.length > 250) {
    return defaultMessage;
  }

  return safe || defaultMessage;
}

/**
 * Enforces maximum request payload size in bytes.
 */
export function enforcePayloadLimit(req, maxBytes = 250000) {
  try {
    const len = JSON.stringify(req.body || {}).length;
    return len <= maxBytes;
  } catch {
    return false;
  }
}

/**
 * Standardized security audit logger that excludes sensitive credentials.
 */
export function auditLog(event, req, details = '') {
  const ip = getClientIp(req);
  const safeIp = ip.length > 4 ? `${ip.slice(0, 4)}***` : '***';
  console.log(`[SEC_AUDIT] ${new Date().toISOString()} | EVENT: ${event} | IP: ${safeIp} | ${details}`);
}
