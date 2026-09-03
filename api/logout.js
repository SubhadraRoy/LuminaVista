import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
  if (match) await redis.del(`session:${match[1]}`);

  res.setHeader('Set-Cookie', serialize('godx_session', '', {
    httpOnly: true, secure: true, sameSite: 'strict', maxAge: -1, path: '/'
  }));
  return res.status(200).json({ success: true });
}