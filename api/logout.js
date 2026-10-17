import { serialize } from 'cookie';
import { getRedisClient } from './_lib/redis.js';
import { auditLog, sendSecureJson, setSecurityHeaders } from './_lib/auth-guard.js';

export default async function handler(req, res) {
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed. Logout requires POST.' }, req);

  try {
    const match = (req.headers?.cookie || '').match(/godx_session=([a-zA-Z0-9_-]+)/);
    const sid = (match && match[1]) || req.headers?.['x-session-id'] || '';
    const redis = getRedisClient();

    if (sid && redis) {
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

    const requestOrigin = req?.headers?.origin || req?.headers?.Origin || '';
    const isCrossSite = Boolean(requestOrigin && !requestOrigin.includes('lumina-vista-sigma.vercel.app'));
    const isHttps = req?.headers?.['x-forwarded-proto'] === 'https' || req?.connection?.encrypted || Boolean(process.env.VERCEL);

    res.setHeader('Set-Cookie', [
      serialize('godx_session', '', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        partitioned: isCrossSite || isHttps,
        maxAge: -1,
        path: '/'
      }),
      serialize('gcal_token', '', {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'strict',
        partitioned: isHttps,
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