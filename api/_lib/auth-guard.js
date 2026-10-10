// api/_lib/auth-guard.js - Centralized Zero-Trust Auth, Rate Limiting & Secret Masking
import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { getRedisClient, getSafeStorage } from './redis.js';

/**
 * Extracts and irreversibly hashes client IP address from request headers
 * so raw IP addresses are never stored in Redis or logs.
 */
export function getClientIp(req) {
  let rawIp = '';
  const realIp = req?.headers?.['x-vercel-ip'] || req?.headers?.['x-vercel-forwarded-for'] || req?.headers?.['cf-connecting-ip'] || req?.headers?.['x-real-ip'];
  if (realIp) {
    rawIp = String(realIp).split(',')[0].trim().replace(/[^a-fA-F0-9.:]/g, '');
  }
  if (!rawIp) {
    const forwarded = req?.headers?.['x-forwarded-for'];
    if (forwarded) {
      const firstIp = forwarded.split(',')[0].trim();
      if (firstIp) rawIp = firstIp.replace(/[^a-fA-F0-9.:]/g, '');
    }
  }
  if (!rawIp) rawIp = req?.socket?.remoteAddress || 'unknown';
  if (rawIp === 'unknown') return 'anon_unknown';
  const salt = process.env.ADMIN_PASSWORD || 'lv_ip_salt';
  return 'anon_' + crypto.createHash('sha256').update(`${salt}:${rawIp}`).digest('hex').slice(0, 16);
}

/**
 * Generates an immutable, sovereign HMAC-SHA256 signed session token.
 * Enables zero-latency session validation immune to 3rd-party database limits.
 */
export function generateSovereignSessionToken(role = 'master', keyId = null, secret = null) {
  const adminSecret = secret || process.env.ADMIN_PASSWORD || 'lumina_root_secret';
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  const cleanRole = role === 'temporary' ? 'temp' : 'master';
  const payload = `${uuid}:${cleanRole}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', adminSecret).update(payload).digest('hex');
  return `lv_${uuid}_${cleanRole}_${timestamp}_${hmac}`;
}

/**
 * Verifies sovereign HMAC-SHA256 signed session token against sovereign master secret.
 */
export function verifySovereignSessionToken(token, secret = null) {
  if (!token || typeof token !== 'string' || !token.startsWith('lv_')) return null;
  const adminSecret = secret || process.env.ADMIN_PASSWORD;
  if (!adminSecret) return null;

  const parts = token.split('_');
  if (parts.length !== 5) return null;
  const [, uuid, role, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return null;

  // Max age: 20 minutes (1200 seconds = 1,200,000 ms) + 30s clock skew
  const age = Date.now() - timestamp;
  if (age < -30000 || age > 1200 * 1000) {
    return null; // Expired
  }

  const payload = `${uuid}:${role}:${timestamp}`;
  const expectedSig = crypto.createHmac('sha256', adminSecret).update(payload).digest('hex');

  if (signature.length !== expectedSig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
      return null;
    }
  } catch (_) {
    return null;
  }

  return {
    valid: true,
    sessionId: token,
    role: role === 'temp' ? 'temporary' : 'master',
    uuid,
    createdAt: timestamp
  };
}

/**
 * Validates the godx_session cookie against Upstash Redis or Sovereign Cryptographic Signature.
 * Enforces a sliding 20-minute session expiration window on success.
 */
export async function validateSession(req, redisClient = null) {
  const cookieHeader = req?.headers?.cookie || '';
  const match = cookieHeader.match(/godx_session=([a-zA-Z0-9_-]+)/);
  const headerSessionId = req?.headers?.['x-session-id'] || req?.headers?.authorization?.replace(/^Bearer\s+/i, '') || req?.body?.userSession || '';
  const sessionId = match ? match[1] : headerSessionId;

  const isProduction = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  const allowMock = !isProduction && process.env.ALLOW_MOCK_AUTH !== 'false';
  const redis = redisClient || getSafeStorage();

  // In local offline unit tests / non-production, permit mock sovereign sessions
  if (allowMock && (!redis || !sessionId || sessionId === 'sovereign_session' || sessionId.startsWith('mock_'))) {
    return { valid: true, sessionId: sessionId || 'sovereign_session', role: 'master' };
  }

  if (!sessionId || sessionId === 'sovereign_session') {
    return { valid: false, status: 401, error: 'Unauthorized Session' };
  }

  // 1. Sovereign Cryptographic Verification Check (Zero-Latency, Immune to Redis Limits)
  const masterSecret = process.env.ADMIN_PASSWORD;
  if (masterSecret && sessionId.startsWith('lv_')) {
    const verified = verifySovereignSessionToken(sessionId, masterSecret);
    if (verified && verified.valid) {
      if (redis && typeof redis.expire === 'function') {
        try { redis.expire(`session:${sessionId}`, 1200).catch(() => {}); } catch (_) {}
      }
      return { valid: true, sessionId, role: verified.role, keyId: null };
    }
  }

  if (!redis) {
    return { valid: false, status: 401, error: 'Unauthorized Session' };
  }

  try {
    const [sessionState] = await Promise.all([
      redis.get(`session:${sessionId}`),
      redis.expire(`session:${sessionId}`, 1200).catch(() => {})
    ]);
    if (!sessionState) {
      return { valid: false, status: 401, error: 'Session Expired / Unauthorized' };
    }

    let role = 'master';
    let keyId = null;
    try {
      const parsed = typeof sessionState === 'string' ? JSON.parse(sessionState) : sessionState;
      if (parsed && typeof parsed === 'object') {
        if (parsed.role) role = parsed.role;
        if (parsed.keyId) keyId = parsed.keyId;
      }
    } catch {
      if (sessionState === 'active') role = 'master';
    }

    return { valid: true, sessionId, role, keyId };
  } catch (error) {
    console.error("[AUTH_GUARD] Redis session verification failure:", error.message);
    if (!allowMock) {
      return { valid: false, status: 503, error: 'Session verification unavailable' };
    }
    return { valid: true, sessionId: sessionId || 'sovereign_fallback_session', role: 'master' };
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
    let current;
    if (typeof redis.pipeline === 'function') {
      const p = redis.pipeline();
      p.incr(key);
      p.expire(key, windowSeconds);
      const res = await p.exec();
      current = Number(Array.isArray(res) ? res[0] : res);
    } else {
      current = await redis.incr(key);
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
    if (routeKey === 'auth') {
      return {
        allowed: false,
        status: 429,
        error: 'Authentication rate limiter temporarily unavailable. Please retry shortly.'
      };
    }
    return { allowed: true };
  }
}

/**
 * Extracts and dynamically aggregates all active secrets from process.env
 * to ensure they can be scrubbed from any output.
 */
export function getKnownSecrets() {
  const secrets = new Set();
  const SENSITIVE_KEY_PATTERN = /KEY|SECRET|PASSWORD|PASS|TOKEN|CREDENTIAL|AUTH|SIGNING|PRIVATE|NVAPI|NEMATRON|NEMOTRON|OLLAMA|GROQ|OPENROUTER|GEMINI|DEEPSEEK|E2B|GITHUB|GOOGLE|UPSTASH|REDIS|QSTASH|ADMIN/i;
  const SENSITIVE_VAL_PATTERN = /^(?:sk-[a-zA-Z0-9_\-]{8,}|gsk_[a-zA-Z0-9_\-]{8,}|ollama_[a-zA-Z0-9_\-]{8,}|nvapi-[a-zA-Z0-9_\-]{8,}|gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|e2b_[a-zA-Z0-9_\-]{8,}|ya29\.[a-zA-Z0-9_\-]{15,}|GOCSPX-[a-zA-Z0-9_\-]{8,})/i;
  const NON_SECRET_VALS = new Set(['true', 'false', 'production', 'development', 'test', 'main', 'master', 'localhost', '127.0.0.1', '0.0.0.0', 'http', 'https', 'undefined', 'null']);

  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim().replace(/^["']|["']$/g, '').trim();
    if (trimmed.length < 4 || NON_SECRET_VALS.has(trimmed.toLowerCase())) continue;

    if (SENSITIVE_KEY_PATTERN.test(k) || SENSITIVE_VAL_PATTERN.test(trimmed)) {
      secrets.add(trimmed);
      // If comma-separated or compound key
      if (trimmed.includes(',')) {
        trimmed.split(',').map(s => s.trim()).filter(s => s.length >= 4).forEach(s => secrets.add(s));
      }
    }
  }

  // Sort descending by length so longer tokens are scrubbed before substrings
  return Array.from(secrets).sort((a, b) => b.length - a.length);
}

/**
 * Universal Secret Scrubber: Removes all secrets, tokens, passwords, and private credentials
 * from arbitrary text, error messages, and execution logs.
 * @param {string} text 
 * @returns {string}
 */
export function scrubSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let safe = text;

  // 1. Scrub exact matches of known environment secrets
  const known = getKnownSecrets();
  for (const secret of known) {
    if (safe.includes(secret)) {
      safe = safe.split(secret).join('[REDACTED_SECRET]');
    }
  }

  // 2. Scrub standard credential formats and prefixes
  safe = safe
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9_\-\.\~\+\/=]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/nvapi-[A-Za-z0-9_\-]{8,}/gi, '[REDACTED_KEY]')
    .replace(/(?:sk-[A-Za-z0-9_-]{10,}|gsk_[A-Za-z0-9_-]{10,}|ollama_[A-Za-z0-9_-]{10,}|key-[A-Za-z0-9_-]{10,})/gi, '[REDACTED_KEY]')
    .replace(/(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})/gi, '[REDACTED_GITHUB_TOKEN]')
    .replace(/(?:ya29\.[a-zA-Z0-9_\-]{15,}|GOCSPX-[a-zA-Z0-9_\-]{8,})/gi, '[REDACTED_GOOGLE_TOKEN]')
    .replace(/e2b_[a-zA-Z0-9_\-]{8,}/gi, '[REDACTED_E2B_KEY]')
    .replace(/(redis|postgres|postgresql|mongodb|mysql)(s)?:\/\/([^:]+):([^@]+)@/gi, '$1$2://$3:[REDACTED]@')
    .replace(/https?:\/\/([^:]+):([^@]+)@/gi, 'https://$1:[REDACTED]@')
    .replace(/(password|passwd|token|secret|apiKey|api_key|access_token|refresh_token|client_secret|signing_key)=([^&\s"'<>]+)/gi, '$1=[REDACTED]')
    .replace(/"(password|token|secret|apiKey|api_key|access_token|refresh_token|client_secret|signing_key)"\s*:\s*"[^"]+"/gi, '"$1":"[REDACTED]"')
    .replace(/eyJ[a-zA-Z0-9_\-]{8,}\.eyJ[a-zA-Z0-9_\-]{8,}\.[a-zA-Z0-9_\-]{8,}/g, '[REDACTED_JWT]')
    .replace(/(?:godx_session|gcal_token)=[^;\s]+/gi, '$1=[REDACTED_COOKIE]')
    .replace(/[a-zA-Z0-9._%+-]+@(?:gmail|yahoo|outlook|hotmail|icloud)\.com/gi, '[REDACTED_EMAIL]');

  return safe;
}

/**
 * Masks a secret completely, showing zero raw characters over the wire.
 * @param {string} [secret='']
 * @returns {string}
 */
export function maskSecret(secret = '') {
  return '••••••••••••';
}

/**
 * Deep recursive object sanitizer: scrubs any string values and redacts any
 * sensitive object keys before sending to clients or writing to storage.
 * @param {any} data 
 * @returns {any}
 */
export function sanitizeDeep(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') return scrubSecrets(data);
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeDeep(item));
  }

  const SENSITIVE_KEY_NAMES = /^(key|secret|password|token|apiKey|api_key|access_token|refresh_token|client_secret|signing_key|private_key)$/i;

  const result = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEY_NAMES.test(k) && typeof v === 'string') {
      result[k] = '[REDACTED]';
    } else {
      result[k] = sanitizeDeep(v);
    }
  }
  return result;
}

/**
 * Applies defense-in-depth zero-trust security headers to API HTTP responses.
 * @param {Object} res 
 */
export function setSecurityHeaders(res, req = null) {
  if (!res || typeof res.setHeader !== 'function') return;
  const request = req || res.req;
  const origin = request?.headers?.origin;
  const ALLOWED_ORIGINS = new Set([
    'https://subhadraroy.github.io',
    'https://lumina-vista-sigma.vercel.app'
  ]);
  const isAllowed = origin && (
    ALLOWED_ORIGINS.has(origin) ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  );

  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Lumina-Device-Id, X-Lumina-Timestamp, X-Lumina-Nonce, X-Lumina-Seq, X-Lumina-Signature');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

/**
 * Sends a sanitized JSON response with security headers guaranteed.
 * @param {Object} res 
 * @param {number} statusCode 
 * @param {any} data 
 */
export function sendSecureJson(res, statusCode, data) {
  setSecurityHeaders(res);
  const safeData = sanitizeDeep(data);
  return res.status(statusCode).json(safeData);
}

/**
 * Sanitizes errors before sending to clients.
 * Strips API keys, Bearer tokens, URLs, file paths, and environment variable values.
 */
export function sanitizeError(error, defaultMessage = 'An internal processing error occurred.') {
  if (!error) return defaultMessage;
  const raw = typeof error === 'string' ? error : (error.message || String(error));

  let safe = scrubSecrets(raw);

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
 * Standardized security audit logger that excludes sensitive credentials and IPs.
 */
export function auditLog(event, req, details = '') {
  const safeDetails = scrubSecrets(details);
  console.log(`[SEC_AUDIT] ${new Date().toISOString()} | EVENT: ${event} | IP: [REDACTED] | ${safeDetails}`);
}
