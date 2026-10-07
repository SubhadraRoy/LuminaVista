// api/admin.js - Sovereign Admin Access & Security Credentials Management API
import crypto from 'crypto';
import { getSafeStorage } from './_lib/redis.js';
import { validateSession, checkRateLimit, sendSecureJson, setSecurityHeaders, auditLog } from './_lib/auth-guard.js';

export const ADMIN_PASSWORDS_KEY = 'admin:temp_passwords';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const storage = getSafeStorage();

  // 1. Session Verification (Zero-Trust)
  const session = await validateSession(req, storage);
  if (!session.valid) {
    return sendSecureJson(res, session.status || 401, { error: session.error || 'Unauthorized' });
  }

  // Only Master Administrator Key may inspect, create, or delete credentials
  if (session.role !== 'master') {
    auditLog('ADMIN_FORBIDDEN', req, `Temporary session attempted admin credential access (role=${session.role})`);
    return sendSecureJson(res, 403, { error: 'Forbidden: Master Administrator access required.' });
  }

  // 2. Sliding Rate Limit
  const rateLimit = await checkRateLimit(req, storage, 'admin_passwords', 60, 60);
  if (!rateLimit.allowed) {
    return sendSecureJson(res, 429, { error: rateLimit.error });
  }

  try {
    // GET: Retrieve list of configured temporary access passwords
    if (req.method === 'GET') {
      const raw = await storage.get(ADMIN_PASSWORDS_KEY);
      const items = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      // Return public view (id, label, preview, createdAt, lastUsed) - NEVER return hash or plain password!
      const safeList = (Array.isArray(items) ? items : []).map(it => ({
        id: it.id,
        label: it.label || 'Access Key',
        preview: it.preview || '••••••••',
        createdAt: it.createdAt || Date.now(),
        lastUsed: it.lastUsed || null
      }));

      return sendSecureJson(res, 200, {
        success: true,
        passwords: safeList
      });
    }

    // POST: Create or Delete temporary access password
    if (req.method === 'POST') {
      const { action, password, label, id } = req.body || {};

      if (action === 'create') {
        const rawPass = typeof password === 'string' ? password.trim() : '';
        if (rawPass.length < 4 || rawPass.length > 128) {
          return sendSecureJson(res, 400, { error: 'Password must be between 4 and 128 characters.' });
        }

        const safeLabel = typeof label === 'string' && label.trim()
          ? label.trim().slice(0, 50).replace(/[<>&"']/g, '')
          : 'Access Key';

        const hash = crypto.createHash('sha256').update(rawPass).digest('hex');
        const keyId = 'key_' + crypto.randomUUID().slice(0, 8);
        const preview = '••••' + (rawPass.length > 2 ? rawPass.slice(-2) : '**');

        const raw = await storage.get(ADMIN_PASSWORDS_KEY);
        let items = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
        if (!Array.isArray(items)) items = [];

        // Max 20 temporary passwords to prevent unbounded memory growth
        if (items.length >= 20) {
          return sendSecureJson(res, 400, { error: 'Maximum limit of 20 access passwords reached. Please delete old keys.' });
        }

        const newItem = {
          id: keyId,
          label: safeLabel,
          hash,
          preview,
          createdAt: Date.now(),
          lastUsed: null
        };

        items.push(newItem);
        await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(items));
        auditLog('ADMIN_KEY_CREATED', req, `Created key ${keyId} (${safeLabel})`);

        return sendSecureJson(res, 200, {
          success: true,
          item: {
            id: newItem.id,
            label: newItem.label,
            preview: newItem.preview,
            createdAt: newItem.createdAt,
            lastUsed: null
          }
        });
      }

      if (action === 'delete') {
        if (!id || typeof id !== 'string') {
          return sendSecureJson(res, 400, { error: 'Valid key ID required for deletion.' });
        }

        const raw = await storage.get(ADMIN_PASSWORDS_KEY);
        let items = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
        if (!Array.isArray(items)) items = [];

        const beforeCount = items.length;
        items = items.filter(k => k && k.id !== id);

        await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(items));
        auditLog('ADMIN_KEY_DELETED', req, `Deleted key ${id}`);

        return sendSecureJson(res, 200, {
          success: true,
          deleted: beforeCount > items.length
        });
      }

      return sendSecureJson(res, 400, { error: 'Invalid action. Supported actions: create, delete.' });
    }

    return sendSecureJson(res, 405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[ADMIN_API_ERROR]', err);
    return sendSecureJson(res, 500, { error: 'Internal admin server error.' });
  }
}
