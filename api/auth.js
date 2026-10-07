import crypto from 'crypto';
import { serialize } from 'cookie';
import {
  getClientIp,
  auditLog,
  sendSecureJson,
  setSecurityHeaders,
  checkRateLimit,
  generateSovereignSessionToken
} from './_lib/auth-guard.js';
import { getSafeStorage } from './_lib/redis.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 2000) return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded' });

  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    auditLog('AUTH_MISCONFIG', req, 'Database credentials or admin password missing');
    return sendSecureJson(res, 500, { success: false, error: 'Server misconfigured. Access blocked.' });
  }

  const storage = getSafeStorage();

  try {
    // 1. Enforce IP-based rate limiting (Max 5 attempts / 15 minutes) - CRIT-05
    const rateCheck = await checkRateLimit(req, storage, 'auth', 5, 900);
    if (!rateCheck.allowed) {
      auditLog('AUTH_LOCKOUT', req, 'Blocked after max failed attempts');
      return sendSecureJson(res, 429, {
        success: false,
        error: rateCheck.error || 'Too many failed authentication attempts. Access locked for 15 minutes.'
      });
    }

    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    const { password } = body;
    
    // 2. Sovereign Credential Verification (Root Master Key + Temporary Access Passwords)
    const verification = await verifyCredentials(password, expectedPassword, storage);

    if (verification.authenticated) {
      // Clear failed attempts counter on success
      try {
        const clientIp = getClientIp(req);
        await storage.del(`rate_limit:auth:${clientIp}`);
      } catch (_) {}

      // Issue Sovereign Cryptographic Session Token (Immune to 3rd-party DB limits)
      const sessionId = generateSovereignSessionToken(verification.type, verification.keyId, expectedPassword);
      const sessionTtl = 1200; // 20-minute active session window (1,200s)
      const sessionData = {
        status: 'active',
        role: verification.type,
        keyId: verification.keyId || null,
        createdAt: Date.now()
      };

      // Best-effort write to storage cache; never fails login if storage quota exceeded
      try {
        await storage.set(`session:${sessionId}`, JSON.stringify(sessionData), { ex: sessionTtl });
      } catch (err) {
        console.warn('[AUTH] Could not cache session in storage:', err?.message || err);
      }

      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: sessionTtl,
        path: '/'
      }));

      auditLog('AUTH_SUCCESS', req, `Session granted (${verification.type})`);
      return sendSecureJson(res, 200, {
        success: true,
        sessionId,
        role: verification.type,
        message: 'Welcome to LuminaVista'
      });
    }

    auditLog('AUTH_FAILURE', req, 'Invalid credentials provided');
    return sendSecureJson(res, 401, { success: false, error: 'Access Denied.' });

  } catch (error) {
    auditLog('AUTH_CRASH', req, error.message);
    return sendSecureJson(res, 502, { success: false, error: 'Authentication engine failure: ' + (error.message || String(error)) });
  }
}

/**
 * Verifies credentials against:
 * 1. The immutable sovereign master key (expectedPassword) using constant-time comparison
 * 2. Active temporary passwords stored in Redis (admin:temp_passwords)
 */
export async function verifyCredentials(password, expectedPassword, storage = null) {
  if (!password || typeof password !== 'string') return { authenticated: false };

  const inputHash = crypto.createHash('sha256').update(password).digest();

  // Primary Check: Sovereign Master Key (Permanent Root Passcode - always supersedes all changes)
  if (expectedPassword && typeof expectedPassword === 'string') {
    const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest();
    if (crypto.timingSafeEqual(inputHash, expectedHash)) {
      return { authenticated: true, type: 'master' };
    }
  }

  // Secondary Check: Active Temporary Access Passwords in Redis
  if (storage) {
    try {
      const rawTemp = await storage.get('admin:temp_passwords');
      if (rawTemp) {
        const tempKeys = typeof rawTemp === 'string' ? JSON.parse(rawTemp) : rawTemp;
        if (Array.isArray(tempKeys)) {
          const inputHex = inputHash.toString('hex');
          const matchedKey = tempKeys.find(k => k && k.hash === inputHex);
          if (matchedKey) {
            matchedKey.lastUsed = Date.now();
            if (typeof storage.set === 'function') {
              try { await storage.set('admin:temp_passwords', JSON.stringify(tempKeys)); } catch (_) {}
            }
            return {
              authenticated: true,
              type: 'temporary',
              keyId: matchedKey.id,
              label: matchedKey.label
            };
          }
        }
      }
    } catch (e) {
      console.error('Error verifying temporary password in storage:', e);
    }
  }

  return { authenticated: false };
}