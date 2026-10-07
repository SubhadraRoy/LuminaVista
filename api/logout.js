import { serialize } from 'cookie';
import { getRedisClient } from './_lib/redis.js';
import { auditLog, sendSecureJson, setSecurityHeaders } from './_lib/auth-guard.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const match = (req.headers?.cookie || '').match(/godx_session=([a-zA-Z0-9_-]+)/);
    const sid = (match && match[1]) || req.headers?.['x-session-id'] || '';
    const redis = getRedisClient();

    if (sid && redis) {
      try {
        await redis.del(`session:${sid}`);
      } catch (_) {}
    }

    res.setHeader('Set-Cookie', serialize('godx_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: -1,
      path: '/'
    }));

    auditLog('AUTH_LOGOUT', req, 'Session terminated');
    return sendSecureJson(res, 200, { success: true });
  } catch (error) {
    return sendSecureJson(res, 500, { success: false, error: 'Logout interaction failed.' });
  }
}