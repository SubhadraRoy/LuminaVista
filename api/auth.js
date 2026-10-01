import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';
import { getClientIp, auditLog, sendSecureJson } from './_lib/auth-guard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 2000) return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded' });

  const expectedPassword = process.env.ADMIN_PASSWORD;
  const dbUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const dbToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!expectedPassword || !dbUrl || !dbUrl.startsWith('http')) {
    auditLog('AUTH_MISCONFIG', req, 'Database credentials or admin password missing');
    return sendSecureJson(res, 500, { success: false, error: 'Server misconfigured. Access blocked.' });
  }

  const clientIp = getClientIp(req);
  const rateLimitKey = `rate_limit:auth:${clientIp}`;

  try {
    const redis = new Redis({ url: dbUrl, token: dbToken });

    // 1. Enforce IP-based rate limiting (Max 5 attempts / 15 minutes)
    const attempts = await redis.get(rateLimitKey);
    if (attempts && parseInt(attempts, 10) >= 5) {
      auditLog('AUTH_LOCKOUT', req, `Blocked after ${attempts} failed attempts`);
      return sendSecureJson(res, 429, {
        success: false,
        error: 'Too many failed authentication attempts. Access locked for 15 minutes.'
      });
    }

    const { password } = req.body || {};
    
    // 2. Constant-Time Hash Comparison
    const inputHash = crypto.createHash('sha256').update(password || '').digest();
    const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest();

    if (crypto.timingSafeEqual(inputHash, expectedHash)) {
      // Clear failed attempts counter on success
      await redis.del(rateLimitKey);

      const sessionId = crypto.randomUUID();
      const sessionTtl = 1200; // 20-minute active session window (1,200s)
      await redis.set(`session:${sessionId}`, 'active', { ex: sessionTtl });

      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: sessionTtl,
        path: '/'
      }));

      auditLog('AUTH_SUCCESS', req, 'Session granted');
      return sendSecureJson(res, 200, {
        success: true,
        sessionId,
        message: 'Welcome to LuminaVista'
      });
    }

    // 3. Register failed attempt with 15-minute TTL
    await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 900);

    auditLog('AUTH_FAILURE', req, 'Invalid credentials provided');
    return sendSecureJson(res, 401, { success: false, error: 'Access Denied.' });

  } catch (error) {
    auditLog('AUTH_CRASH', req, error.message);
    return sendSecureJson(res, 502, { success: false, error: 'Authentication engine failure.' });
  }
}