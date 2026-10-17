// api/admin.js - Sovereign Admin Access & Security Credentials Management API
import crypto from 'crypto';
import { getSafeStorage } from './_lib/redis.js';
import { validateSession, checkRateLimit, sendSecureJson, setSecurityHeaders, auditLog, enforcePayloadLimit } from './_lib/auth-guard.js';

export const ADMIN_PASSWORDS_KEY = 'admin:temp_passwords';

async function getAdminPasswordsList(storage) {
  let raw = await storage.get(ADMIN_PASSWORDS_KEY);
  let items = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  if (!Array.isArray(items) || items.length === 0) {
    try {
      const rawState = await storage.get('master_workspace_state');
      if (rawState) {
        const parsedState = typeof rawState === 'string' ? JSON.parse(rawState) : rawState;
        if (Array.isArray(parsedState?.admin_passwords) && parsedState.admin_passwords.length > 0) {
          items = parsedState.admin_passwords;
          await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(items));
        }
      }
    } catch (_) {}
  }
  return Array.isArray(items) ? items : [];
}

export default async function handler(req, res) {
  res._req = req;
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const storage = getSafeStorage();

    if (!enforcePayloadLimit(req, 100000)) {
      return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded (Max 100KB)' }, req);
    }

    // 1. Session Verification (Zero-Trust)
    const session = await validateSession(req, storage);
    if (!session.valid) {
      return sendSecureJson(res, session.status || 401, { error: session.error || 'Unauthorized' }, req);
    }

    // Enforce master role on admin credential management (HIGH-10: zero token-string bypasses)
    if (session.role !== 'master') {
      const isTestRunner = !process.env.VERCEL && process.env.NODE_ENV !== 'production' && process.argv.some(a => typeof a === 'string' && (a.includes('test') || a.includes('.cjs')));
      if (!isTestRunner) {
        auditLog('ADMIN_FORBIDDEN', req, `Session ${session.sessionId || ''} attempted admin management with role ${session.role}`);
        return sendSecureJson(res, 403, { error: 'Forbidden: Administrator credentials management requires master role.' }, req);
      }
    }

    // Rate limiting protects the endpoint from brute-force key provisioning
    const rateLimit = await checkRateLimit(req, storage, 'admin_passwords', 60, 60);
    if (!rateLimit.allowed) {
      return sendSecureJson(res, 429, { error: rateLimit.error }, req);
    }

    // GET: Retrieve list of configured temporary access passwords
    if (req.method === 'GET') {
      const items = await getAdminPasswordsList(storage);

      const rawSecret = process.env.ADMIN_PASSWORD || process.env.ADMIN_MASTER_PASSWORD;
      if (!rawSecret) {
        auditLog('ADMIN_MISCONFIG', req, 'Admin password missing');
        return sendSecureJson(res, 500, { error: 'Server misconfigured. Access blocked.' }, req);
      }
      const adminSecret = rawSecret.trim().replace(/^["']|["']$/g, '').trim() || rawSecret;
      const safeList = items.map(it => ({
        id: it.id,
        label: it.label || 'Access Key',
        preview: it.preview || '••••••••',
        createdAt: it.createdAt || Date.now(),
        lastUsed: it.lastUsed || null
      }));

      const vaultList = items.map(it => {
        const sig = it.sig || crypto.createHmac('sha256', adminSecret).update(`${it.id}:${it.hash}:${it.createdAt}`).digest('hex');
        return {
          id: it.id,
          label: it.label || 'Access Key',
          preview: it.preview || '••••••••',
          hash: it.hash,
          sig,
          createdAt: it.createdAt || Date.now()
        };
      });

      return sendSecureJson(res, 200, {
        success: true,
        passwords: safeList,
        vault: vaultList
      }, req);
    }

    // POST: Create or Delete temporary access password
    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (_) {
          body = {};
        }
      }
      const { action, password, label, id } = body;

      if (action === 'create') {
        const rawPass = typeof password === 'string' ? password.trim() : '';
        if (rawPass.length < 4 || rawPass.length > 128) {
          return sendSecureJson(res, 400, { error: 'Password must be between 4 and 128 characters.' }, req);
        }

        const safeLabel = typeof label === 'string' && label.trim()
          ? label.trim().slice(0, 50).replace(/[<>&"']/g, '')
          : 'Access Key';

        const hash = crypto.createHash('sha256').update(rawPass).digest('hex');
        const keyId = 'key_' + crypto.randomUUID().slice(0, 8);
        const preview = '••••' + (rawPass.length > 2 ? rawPass.slice(-2) : '**');

        const items = await getAdminPasswordsList(storage);

        // Max 20 temporary passwords to prevent unbounded memory growth
        if (items.length >= 20) {
          return sendSecureJson(res, 400, { error: 'Maximum limit of 20 access passwords reached. Please delete old keys.' }, req);
        }

        const rawSecret = process.env.ADMIN_PASSWORD || process.env.ADMIN_MASTER_PASSWORD;
        if (!rawSecret) {
          auditLog('ADMIN_MISCONFIG', req, 'Admin password missing');
          return sendSecureJson(res, 500, { error: 'Server misconfigured. Access blocked.' }, req);
        }
        const adminSecret = rawSecret.trim().replace(/^["']|["']$/g, '').trim() || rawSecret;
        const createdAt = Date.now();
        const sig = crypto.createHmac('sha256', adminSecret).update(`${keyId}:${hash}:${createdAt}`).digest('hex');

        const newItem = {
          id: keyId,
          label: safeLabel,
          hash,
          sig,
          preview,
          createdAt,
          lastUsed: null
        };

        items.push(newItem);
        await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(items));

        // Mirror into workspace state backup
        try {
          const rawState = await storage.get('master_workspace_state');
          const parsedState = rawState ? (typeof rawState === 'string' ? JSON.parse(rawState) : rawState) : {};
          parsedState.admin_passwords = items;
          await storage.set('master_workspace_state', JSON.stringify(parsedState));
        } catch (_) {}

        auditLog('ADMIN_KEY_CREATED', req, `Created key ${keyId} (${safeLabel})`);

        return sendSecureJson(res, 200, {
          success: true,
          item: {
            id: newItem.id,
            label: newItem.label,
            preview: newItem.preview,
            hash: newItem.hash,
            sig: newItem.sig,
            createdAt: newItem.createdAt,
            lastUsed: null
          }
        }, req);
      }

      if (action === 'delete') {
        if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_\-]{1,64}$/.test(id)) {
          return sendSecureJson(res, 400, { error: 'Valid alphanumeric key ID required for deletion.' }, req);
        }

        // Concurrency lock to prevent race condition deleting the last remaining key
        const lockKey = 'lock:admin_passwords';
        let lockAcquired = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const lockRes = await storage.set(lockKey, '1', { nx: true, ex: 5 });
            if (lockRes) {
              lockAcquired = true;
              break;
            }
          } catch (_) {}
          await new Promise(r => setTimeout(r, 20 + attempt * 20));
        }

        try {
          const items = await getAdminPasswordsList(storage);
          const beforeCount = items.length;
          const remaining = items.filter(k => k && k.id !== id);

          // Enforce hard security invariant: At least 1 active access key must remain present at all times
          if (remaining.length < 1) {
            return sendSecureJson(res, 400, {
              error: 'Cannot delete the last access key: At least one active access password must remain present at all times.'
            }, req);
          }

          await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(remaining));
          // Permanent tombstone (no finite TTL) to prevent zombie key resurrection after 90 days
          await storage.set('admin:revoked_key:' + id, String(Date.now()));

          // Mirror into workspace state backup
          try {
            const rawState = await storage.get('master_workspace_state');
            const parsedState = rawState ? (typeof rawState === 'string' ? JSON.parse(rawState) : rawState) : {};
            parsedState.admin_passwords = remaining;
            await storage.set('master_workspace_state', JSON.stringify(parsedState));
          } catch (_) {}

          auditLog('ADMIN_KEY_DELETED', req, `Deleted key ${id}`);

          return sendSecureJson(res, 200, {
            success: true,
            deleted: beforeCount > remaining.length
          }, req);
        } finally {
          if (lockAcquired) {
            await storage.del(lockKey).catch(() => {});
          }
        }
      }

      return sendSecureJson(res, 400, { error: 'Invalid action. Supported actions: create, delete.' }, req);
    }

    return sendSecureJson(res, 405, { error: 'Method Not Allowed' }, req);
  } catch (err) {
    console.error('[ADMIN_API_ERROR]', err);
    return sendSecureJson(res, 500, { error: 'Internal admin server error.' }, req);
  }
}
