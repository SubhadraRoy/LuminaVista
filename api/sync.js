import { getSafeStorage } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog,
  sendSecureJson,
  scrubSecrets
} from './_lib/auth-guard.js';

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id, authorization');
    return res.status(200).end();
  }

  const redis = getSafeStorage();
  if (!redis) {
    auditLog('SYNC_CONFIG_FAULT', req, 'Redis unconfigured');
    return sendSecureJson(res, 500, { error: 'Database service unavailable.' });
  }

  // 1. Zero-Trust Session Verification (godx_session cookie, x-session-id header, or authorization token)
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/sync');
    return sendSecureJson(res.status(401), 401, { error: auth.error });
  }

  // 2. Sliding IP Rate Limiting (180 requests / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'sync', 180, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/sync');
    return sendSecureJson(res, rate.status, { error: rate.error });
  }

  const sessionKey = "master_workspace_state";

  try {
    // GET: Retrieve the complete master personal workspace state
    if (req.method === 'GET') {
      const rawState = await redis.get(sessionKey);
      let state = rawState;
      if (typeof rawState === 'string') {
        try { state = JSON.parse(rawState); } catch (e) { state = null; }
      }
      return sendSecureJson(res, 200, {
        success: true,
        state: state || null,
        empty: !state,
        // Backwards compatibility fields for legacy callers
        vfs: state?.vfs || null,
        notes: state?.notes || null,
        whiteboard: state?.whiteboard || null,
        chat: state?.aiConversation || null,
        calendar: state?.calendar || null
      });
    }

    // POST: Atomically update master personal workspace state across all devices
    if (req.method === 'POST') {
      if (!enforcePayloadLimit(req, 5000000)) {
        return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded (Max 5MB)' });
      }

      const rawCurrent = await redis.get(sessionKey);
      let currentState = rawCurrent || {};
      if (typeof rawCurrent === 'string') {
        try { currentState = JSON.parse(rawCurrent); } catch (e) { currentState = {}; }
      }

      const rawBody = req.body || {};
      const b = rawBody.data ? rawBody.data : rawBody;
      const newState = {
        calendar: b.calendar !== undefined ? b.calendar : currentState.calendar,
        calendarSettings: b.calendarSettings !== undefined ? b.calendarSettings : currentState.calendarSettings,
        chatSessions: b.chatSessions !== undefined ? b.chatSessions : currentState.chatSessions,
        activeSessionId: b.activeSessionId !== undefined ? b.activeSessionId : currentState.activeSessionId,
        aiConversation: b.aiConversation !== undefined ? b.aiConversation : currentState.aiConversation,
        aiConfig: b.aiConfig !== undefined ? b.aiConfig : currentState.aiConfig,
        whiteboard: b.whiteboard !== undefined ? b.whiteboard : currentState.whiteboard,
        whiteboardBoards: b.whiteboardBoards !== undefined ? b.whiteboardBoards : currentState.whiteboardBoards,
        whiteboardActiveBoardId: b.whiteboardActiveBoardId !== undefined ? b.whiteboardActiveBoardId : currentState.whiteboardActiveBoardId,
        whiteboardStickies: b.whiteboardStickies !== undefined ? b.whiteboardStickies : currentState.whiteboardStickies,
        whiteboardTheme: b.whiteboardTheme !== undefined ? b.whiteboardTheme : currentState.whiteboardTheme,
        whiteboardBg: b.whiteboardBg !== undefined ? b.whiteboardBg : currentState.whiteboardBg,
        vfs: b.vfs !== undefined ? b.vfs : currentState.vfs,
        notes: b.notes !== undefined ? b.notes : currentState.notes,
        activeNoteId: b.activeNoteId !== undefined ? b.activeNoteId : currentState.activeNoteId,
        noteViewMode: b.noteViewMode !== undefined ? b.noteViewMode : currentState.noteViewMode,
        projects: b.projects !== undefined ? b.projects : currentState.projects,
        theme: b.theme !== undefined ? b.theme : currentState.theme,
        activeTabId: b.activeTabId !== undefined ? b.activeTabId : currentState.activeTabId,
        updatedAt: Date.now()
      };

      await redis.set(sessionKey, JSON.stringify(newState));
      return sendSecureJson(res, 200, { success: true, updatedAt: newState.updatedAt });
    }

    return sendSecureJson(res, 405, { error: 'Method Not Allowed' });
  } catch (error) {
    auditLog('SYNC_FAULT', req, error.message);
    return sendSecureJson(res, 500, { error: sanitizeError(error, 'Database synchronization failure.') });
  }
}