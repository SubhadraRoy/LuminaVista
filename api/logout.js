import { serialize } from 'cookie';
import { getSafeStorage } from './_lib/redis.js';
import { auditLog, sendSecureJson, setSecurityHeaders, checkRateLimit } from './_lib/auth-guard.js';

export default async function handler(req, res) {
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed. Logout requires POST.' }, req);

  try {
    const redis = getSafeStorage();

    // Rate limiting (MED-10)
    const rate = await checkRateLimit(req, redis, 'logout', 30, 60);
    if (rate && !rate.allowed) {
      auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/logout');
      return sendSecureJson(res, rate.status, { error: rate.error }, req);
    }

    // Comprehensive session extraction from cookies, headers, bearer token, and body (MED-01)
    const sids = new Set();
    const cookieMatch = (req.headers?.cookie || '').match(/godx_session=([a-zA-Z0-9_\-]+)/);
    if (cookieMatch) sids.add(cookieMatch[1]);
    if (req.headers?.['x-session-id']) sids.add(req.headers['x-session-id']);
    const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
    const bearerMatch = authHeader.match(/^Bearer\s+([a-zA-Z0-9_\-]+)$/i);
    if (bearerMatch) sids.add(bearerMatch[1]);
    if (req.body && typeof req.body === 'object') {
      if (req.body.userSession && typeof req.body.userSession === 'string') sids.add(req.body.userSession);
      if (req.body.sessionId && typeof req.body.sessionId === 'string') sids.add(req.body.sessionId);
      if (req.body.token && typeof req.body.token === 'string') sids.add(req.body.token);
    }

    // Validate parameter format (MED-15)
    const validSidPattern = /^[a-zA-Z0-9_\-]{1,128}$/;
    if (redis) {
      for (const sid of sids) {
        if (!validSidPattern.test(sid)) continue;
        try {
          await redis.del(`session:${sid}`);
        } catch (_) {}
        try {
          if (typeof redis.set === 'function') {
            await redis.set(`session:revoked:${sid}`, '1', { ex: 86400 });
          }
        } catch (_) {
          try {
            await redis.set(`session:revoked:${sid}`, '1', 'EX', 86400);
          } catch (_) {}
        }
      }
    }

    const requestOrigin = req?.headers?.origin || req?.headers?.Origin || '';
    const isCrossSite = Boolean(requestOrigin && !requestOrigin.includes('lumina-vista-sigma.vercel.app'));
    const isHttps = req?.headers?.['x-forwarded-proto'] === 'https' || req?.connection?.encrypted || Boolean(process.env.VERCEL);

    res.setHeader('Set-Cookie', [
      serialize('godx_session', '', {
        httpOnly: true,
        secure: isHttps || isCrossSite,
        sameSite: isCrossSite ? 'none' : 'strict',
        // Hardened cookie policy: sameSite: 'strict'
        partitioned: isCrossSite || isHttps,
        maxAge: -1,
        path: '/'
      }),
      serialize('gcal_token', '', {
        httpOnly: true,
        secure: isHttps || isCrossSite,
        sameSite: isCrossSite ? 'none' : (isHttps ? 'none' : 'strict'),
        partitioned: isCrossSite || isHttps,
        maxAge: 0,
        path: '/'
      })
    ]);

    auditLog('AUTH_LOGOUT', req, 'Session terminated');
    return sendSecureJson(res, 200, { success: true }, req);
  } catch (error) {
    return sendSecureJson(res, 500, { success: false, error: 'Logout interaction failed.' }, req);
  }
}