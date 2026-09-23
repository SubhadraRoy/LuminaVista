import { serialize } from 'cookie';
import { getRedisClient } from './_lib/redis.js';
import { auditLog } from './_lib/auth-guard.js';

export default async function handler(req, res) {
  try {
    const match = (req.headers.cookie || '').match(/godx_session=([a-zA-Z0-9_-]+)/);
    const redis = getRedisClient();

    if (match && match[1] && redis) {
      await redis.del(`session:${match[1]}`);
    }

    res.setHeader('Set-Cookie', serialize('godx_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: -1,
      path: '/'
    }));

    auditLog('AUTH_LOGOUT', req, 'Session terminated');
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Logout interaction failed.' });
  }
}