import { getSafeStorage } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog,
  sendSecureJson,
  setSecurityHeaders,
  scrubSecrets,
  sanitizeDeep
} from './_lib/auth-guard.js';

export default async function handler(req, res) {
  res._req = req;
  setSecurityHeaders(res, req);

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const redis = getSafeStorage();
  if (!redis) {
    auditLog('SYNC_CONFIG_FAULT', req, 'Redis unconfigured');
    return sendSecureJson(res, 500, { error: 'Database service unavailable.' }, req);
  }

  // 1. Zero-Trust Session Verification (godx_session cookie, x-session-id header, or authorization token)
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/sync');
    return sendSecureJson(res.status(401), 401, { error: auth.error }, req);
  }

  // Enforce authenticated role requirement for workspace state synchronization
  if (auth.role !== 'master' && auth.role !== 'temporary') {
    auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/sync');
    return sendSecureJson(res, 403, { error: 'Forbidden: Workspace sync requires authenticated session' }, req);
  }

  // 2. Sliding IP Rate Limiting (180 requests / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'sync', 180, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/sync');
    return sendSecureJson(res, rate.status, { error: rate.error }, req);
  }

  const sessionKey = "master_workspace_state";

  function sanitizeWorkspaceState(st) {
    if (!st || typeof st !== 'object') return st;
    return sanitizeDeep(st);
  }

  try {
    // GET: Retrieve the complete master personal workspace state
    if (req.method === 'GET') {
      const rawState = await redis.get(sessionKey);
      let state = rawState;
      if (typeof rawState === 'string') {
        try { state = JSON.parse(rawState); } catch (e) { state = null; }
      }
      state = sanitizeWorkspaceState(state);

      // Administrative Credential Protection: Omit admin_passwords unless requesting session has role === 'master'
      const isMaster = auth.role === 'master';
      const safeState = state ? { ...state } : null;
      if (safeState && !isMaster) {
        delete safeState.admin_passwords;
      }

      return sendSecureJson(res, 200, {
        success: true,
        state: safeState || null,
        empty: !state,
        // Backwards compatibility fields for legacy callers
        vfs: state?.vfs || null,
        notes: state?.notes || null,
        whiteboard: state?.whiteboard || null,
        chat: state?.aiConversation || null,
        calendar: state?.calendar || null,
        admin_passwords: isMaster ? (state?.admin_passwords || []) : []
      }, req);
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
      const newState = sanitizeWorkspaceState({
        calendar: Array.isArray(b.calendar) ? b.calendar : currentState.calendar,
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
        vfs: (b.vfs && typeof b.vfs === 'object' && !Array.isArray(b.vfs)) ? b.vfs : currentState.vfs,
        notes: Array.isArray(b.notes) ? b.notes : currentState.notes,
        activeNoteId: b.activeNoteId !== undefined ? b.activeNoteId : currentState.activeNoteId,
        noteViewMode: b.noteViewMode !== undefined ? b.noteViewMode : currentState.noteViewMode,
        projects: b.projects !== undefined ? b.projects : currentState.projects,
        theme: b.theme !== undefined ? b.theme : currentState.theme,
        activeTabId: (typeof b.activeTabId === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(b.activeTabId))
          ? b.activeTabId
          : currentState.activeTabId,
        // Invariant: admin credentials in master_workspace_state cannot be overwritten by client sync payloads.
        // Admin credentials must be managed strictly and sovereignly via api/admin.js.
        admin_passwords: currentState.admin_passwords || [],
        updatedAt: Date.now()
      });

      await redis.set(sessionKey, JSON.stringify(newState));
      return sendSecureJson(res, 200, { success: true, updatedAt: newState.updatedAt }, req);
    }

    return sendSecureJson(res, 405, { error: 'Method Not Allowed' }, req);
  } catch (error) {
    auditLog('SYNC_FAULT', req, error.message);
    return sendSecureJson(res, 500, { error: sanitizeError(error, 'Database synchronization failure.') }, req);
  }
}