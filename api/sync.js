import { getRedisClient } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog
} from './_lib/auth-guard.js';

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const redis = getRedisClient();
  if (!redis) {
    auditLog('SYNC_CONFIG_FAULT', req, 'Redis unconfigured');
    return res.status(500).json({ error: 'Database service unavailable.' });
  }

  // 1. Zero-Trust Session Verification (godx_session cookie)
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/sync');
    return res.status(401).json({ error: auth.error });
  }

  // 2. Sliding IP Rate Limiting (60 requests / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'sync', 60, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/sync');
    return res.status(rate.status).json({ error: rate.error });
  }

  const sessionKey = "master_workspace_state";

  try {
    // GET: Retrieve the workspace state when the dashboard loads
    if (req.method === 'GET') {
      const state = await redis.get(sessionKey);
      return res.status(200).json(state || { vfs: null, notes: null, whiteboard: null, chat: null });
    }

    // POST: Update the workspace state when drawing, typing, or coding
    if (req.method === 'POST') {
      if (!enforcePayloadLimit(req, 1000000)) {
        return res.status(413).json({ error: 'Payload Limit Exceeded (Max 1MB)' });
      }

      const { vfs, notes, whiteboard, chat } = req.body;
      const currentState = (await redis.get(sessionKey)) || {};
      
      const newState = {
        vfs: vfs !== undefined ? vfs : currentState.vfs,
        notes: notes !== undefined ? notes : currentState.notes,
        whiteboard: whiteboard !== undefined ? whiteboard : currentState.whiteboard,
        chat: chat !== undefined ? chat : currentState.chat
      };

      await redis.set(sessionKey, JSON.stringify(newState));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    auditLog('SYNC_FAULT', req, error.message);
    return res.status(500).json({ error: sanitizeError(error, 'Database synchronization failure.') });
  }
}