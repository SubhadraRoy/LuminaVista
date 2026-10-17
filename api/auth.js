import crypto from 'crypto';
import { serialize } from 'cookie';
import {
  getClientIp,
  auditLog,
  sendSecureJson,
  setSecurityHeaders,
  checkRateLimit,
  generateSovereignSessionToken,
  sanitizeError
} from './_lib/auth-guard.js';
import { getSafeStorage } from './_lib/redis.js';

export default async function handler(req, res) {
  res._req = req;
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' }, req);
  if (JSON.stringify(req.body || {}).length > 2000) return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded' }, req);

  const rawExpectedPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_MASTER_PASSWORD;

  if (!rawExpectedPassword) {
    auditLog('AUTH_MISCONFIG', req, 'Database credentials or admin password missing');
    return sendSecureJson(res, 500, { success: false, error: 'Server misconfigured. Access blocked.' }, req);
  }

  const cleanExpected = rawExpectedPassword.trim().replace(/^["']|["']$/g, '').trim();
  const expectedPassword = cleanExpected || rawExpectedPassword;
  const storage = getSafeStorage();

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_) {
        body = {};
      }
    }
    const { password } = body;
    let clientKeys = body.clientKeys || body.tempPasswords || body.vault || [];
    if (typeof clientKeys === 'string') {
      try { clientKeys = JSON.parse(clientKeys); } catch (_) { clientKeys = []; }
    }

    // 1. Enforce IP-based rate limiting (Max 20 attempts / 15 minutes)
    const rateCheck = await checkRateLimit(req, storage, 'auth', 20, 900);
    if (!rateCheck.allowed) {
      // Emergency administrator override: authentic root password bypasses lockout
      let isMasterAttempt = false;
      if (typeof password === 'string' && password.length > 0) {
        const passBuf = crypto.createHash('sha256').update(password).digest();
        const trimmedPassBuf = crypto.createHash('sha256').update(password.trim()).digest();
        const candidateSecrets = Array.from(new Set([cleanExpected, rawExpectedPassword.trim(), rawExpectedPassword])).filter(Boolean);
        for (const cand of candidateSecrets) {
          const candBuf = crypto.createHash('sha256').update(cand).digest();
          const match1 = crypto.timingSafeEqual(passBuf, candBuf);
          const match2 = crypto.timingSafeEqual(trimmedPassBuf, candBuf);
          if (match1 || match2) {
            isMasterAttempt = true;
          }
        }
      }

      if (!isMasterAttempt) {
        auditLog('AUTH_LOCKOUT', req, 'Blocked after max failed attempts');
        return sendSecureJson(res, 429, {
          success: false,
          error: rateCheck.error || 'Too many failed authentication attempts. Access locked for 15 minutes.'
        }, req);
      }
    }
    
    // 2. Sovereign Credential Verification (Root Master Key + Temporary Access Passwords)
    const verification = await verifyCredentials(password, rawExpectedPassword, storage, clientKeys);

    if (verification.authenticated) {
      // Clear failed attempts counter on success ONLY for authentic master logins
      if (verification.type === 'master') {
        try {
          const clientIp = getClientIp(req);
          await storage.del(`rate_limit:auth:${clientIp}`);
        } catch (_) {}
      }

      // Issue Sovereign Cryptographic Session Token (Immune to 3rd-party DB limits)
      const sessionId = generateSovereignSessionToken(verification.type, verification.keyId, cleanExpected);
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

      const requestOrigin = req?.headers?.origin || req?.headers?.Origin || '';
      const isCrossSite = Boolean(requestOrigin && !requestOrigin.includes('lumina-vista-sigma.vercel.app'));
      const isHttps = req?.headers?.['x-forwarded-proto'] === 'https' || req?.connection?.encrypted || Boolean(process.env.VERCEL);

      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true,
        secure: isCrossSite ? true : isHttps,
        sameSite: isCrossSite ? 'none' : 'lax',
        partitioned: isCrossSite || isHttps,
        maxAge: sessionTtl,
        path: '/'
      }));

      auditLog('AUTH_SUCCESS', req, `Session granted (${verification.type})`);
      return sendSecureJson(res, 200, {
        success: true,
        sessionId,
        role: verification.type,
        message: 'Welcome to LuminaVista'
      }, req);
    }

    auditLog('AUTH_FAILURE', req, 'Invalid credentials provided');
    return sendSecureJson(res, 401, { success: false, error: 'Access Denied.' }, req);

  } catch (error) {
    auditLog('AUTH_CRASH', req, error.message);
    return sendSecureJson(res, 502, { success: false, error: sanitizeError(error, 'Authentication engine failure.') }, req);
  }
}

/**
 * Verifies credentials against:
 * 1. The immutable sovereign master key (expectedPassword) using constant-time comparison
 * 2. Active temporary passwords stored in Redis (admin:temp_passwords)
 */
export async function verifyCredentials(password, expectedPassword, storage = null, clientKeys = []) {
  if (password === null || password === undefined) return { authenticated: false };

  const rawPassword = typeof password === 'string' ? password : String(password);
  if (!rawPassword) return { authenticated: false };

  const trimmedPassword = rawPassword.trim();
  const inputHash = crypto.createHash('sha256').update(rawPassword).digest();
  const trimmedHash = crypto.createHash('sha256').update(trimmedPassword).digest();
  const inputHex = inputHash.toString('hex').toLowerCase();
  const trimmedHex = trimmedHash.toString('hex').toLowerCase();

  // Primary Check: Sovereign Master Key (Permanent Root Passcode - always supersedes all changes)
  if (expectedPassword && typeof expectedPassword === 'string') {
    const cleanExpected = expectedPassword.trim().replace(/^["']|["']$/g, '').trim();
    const candidateSecrets = Array.from(new Set([cleanExpected, expectedPassword.trim(), expectedPassword])).filter(Boolean);

    for (const secret of candidateSecrets) {
      const expectedHash = crypto.createHash('sha256').update(secret).digest();
      if (
        crypto.timingSafeEqual(inputHash, expectedHash) ||
        crypto.timingSafeEqual(trimmedHash, expectedHash)
      ) {
        return { authenticated: true, type: 'master' };
      }
    }
  }

  // Secondary Check: Active Temporary Access Passwords in Redis / Storage
  if (storage) {
    try {
      let rawTemp = await storage.get('admin:temp_passwords');
      let tempKeys = rawTemp;
      if (typeof tempKeys === 'string') {
        try { tempKeys = JSON.parse(tempKeys); } catch (_) {}
      }
      if (typeof tempKeys === 'string') {
        try { tempKeys = JSON.parse(tempKeys); } catch (_) {}
      }

      // If not found in primary key, check backup mirror in workspace state
      if (!Array.isArray(tempKeys) || tempKeys.length === 0) {
        try {
          const rawState = await storage.get('master_workspace_state');
          if (rawState) {
            let parsedState = typeof rawState === 'string' ? JSON.parse(rawState) : rawState;
            if (typeof parsedState === 'string') {
              try { parsedState = JSON.parse(parsedState); } catch (_) {}
            }
            if (Array.isArray(parsedState?.admin_passwords)) {
              tempKeys = parsedState.admin_passwords;
            }
          }
        } catch (_) {}
      }

      if (Array.isArray(tempKeys)) {
        const matchedKey = tempKeys.find(k => {
          if (!k || typeof k.hash !== 'string') return false;
          const targetHash = k.hash.toLowerCase().trim();
          try {
            const keyBuf = Buffer.alloc(32);
            const parsedKey = Buffer.from(targetHash, 'hex');
            const validLen = parsedKey.length === 32;
            if (validLen) parsedKey.copy(keyBuf);
            const match1 = crypto.timingSafeEqual(inputHash, keyBuf);
            const match2 = crypto.timingSafeEqual(trimmedHash, keyBuf);
            if (validLen && (match1 || match2)) return true;
          } catch (_) {}
          return false;
        });

        if (matchedKey) {
          if (storage && typeof storage.get === 'function') {
            try {
              const isRevoked = await storage.get(`admin:revoked_key:${matchedKey.id}`);
              if (isRevoked) {
                auditLog('REVOKED_KEY_REJECTED', null, `Rejected revoked temp key ${matchedKey.id}`);
                return { authenticated: false };
              }
            } catch (_) {}
          }
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
    } catch (e) {
      console.error('Error verifying temporary password in storage:', e);
    }
  }

  // Tertiary Check: Sovereign Cryptographically Signed Credentials (Immune to Redis cold-start/quota limits)
  if (expectedPassword && Array.isArray(clientKeys) && clientKeys.length > 0) {
    const cleanExpected = typeof expectedPassword === 'string' ? expectedPassword.trim().replace(/^["']|["']$/g, '').trim() : expectedPassword;
    const signingSecrets = Array.from(new Set([cleanExpected, expectedPassword])).filter(Boolean);

    const matchedClientKey = clientKeys.find(k => {
      if (!k || typeof k.hash !== 'string' || typeof k.sig !== 'string') return false;
      const targetHash = k.hash.toLowerCase().trim();
      let hashMatches = false;
      try {
        const keyBuf = Buffer.alloc(32);
        const parsedKey = Buffer.from(targetHash, 'hex');
        const validLen = parsedKey.length === 32;
        if (validLen) parsedKey.copy(keyBuf);
        const match1 = crypto.timingSafeEqual(inputHash, keyBuf);
        const match2 = crypto.timingSafeEqual(trimmedHash, keyBuf);
        if (validLen && (match1 || match2)) hashMatches = true;
      } catch (_) {}
      if (!hashMatches) return false;

      // Verify HMAC-SHA256 signature against candidate admin secrets using constant-time comparison
      for (const secret of signingSecrets) {
        try {
          const expectedSigBuf = crypto.createHmac('sha256', secret).update(`${k.id}:${k.hash}:${k.createdAt}`).digest();
          const sigBuf = Buffer.alloc(32);
          const parsedSig = Buffer.from(k.sig.toLowerCase().trim(), 'hex');
          const validLen = parsedSig.length === 32;
          if (validLen) parsedSig.copy(sigBuf);
          const isMatch = crypto.timingSafeEqual(sigBuf, expectedSigBuf);
          if (validLen && isMatch) return true;
        } catch (_) {}
      }
      return false;
    });

    if (matchedClientKey) {
      // Check if key has been explicitly revoked
      if (storage && typeof storage.get === 'function') {
        try {
          const isRevoked = await storage.get(`admin:revoked_key:${matchedClientKey.id}`);
          if (isRevoked) {
            auditLog('REVOKED_KEY_REJECTED', null, `Rejected revoked clientKey ${matchedClientKey.id}`);
            return { authenticated: false };
          }
        } catch (_) {}
      }

      // Re-hydrate this authenticated key back into storage for fast-path retrieval
      if (storage && typeof storage.get === 'function') {
        try {
          let currentKeys = await storage.get('admin:temp_passwords');
          let parsedCurrent = currentKeys ? (typeof currentKeys === 'string' ? JSON.parse(currentKeys) : currentKeys) : [];
          if (!Array.isArray(parsedCurrent)) parsedCurrent = [];
          if (!parsedCurrent.some(x => x.id === matchedClientKey.id)) {
            parsedCurrent.push({
              id: matchedClientKey.id,
              label: matchedClientKey.label || 'Access Key',
              hash: matchedClientKey.hash,
              sig: matchedClientKey.sig,
              preview: matchedClientKey.preview || '••••••••',
              createdAt: matchedClientKey.createdAt || Date.now(),
              lastUsed: Date.now()
            });
            await storage.set('admin:temp_passwords', JSON.stringify(parsedCurrent));
          }
        } catch (_) {}
      }

      return {
        authenticated: true,
        type: 'temporary',
        keyId: matchedClientKey.id,
        label: matchedClientKey.label
      };
    }
  }

  return { authenticated: false };
}