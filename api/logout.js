import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export default async function handler(req, res) {
  try {
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (match && url.startsWith('http')) {
      const redis = new Redis({ url, token });
      await redis.del(`session:${match[1]}`);
    }

    res.setHeader('Set-Cookie', serialize('godx_session', '', {
      httpOnly: true, secure: true, sameSite: 'lax', maxAge: -1, path: '/'
    }));
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Logout failed.' });
  }
}