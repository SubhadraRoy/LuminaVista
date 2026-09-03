import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 1000) return res.status(413).json({ error: 'Payload Too Large' });

  const { password } = req.body;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'xps@admin';

  const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
  const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest('hex');

  if (inputHash === expectedHash) {
    const sessionId = crypto.randomUUID();
    
    await redis.set(`session:${sessionId}`, 'active', { ex: 1200 });
    
    res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 1200, path: '/'
    }));

    return res.status(200).json({ success: true });
  }

  return res.status(401).json({ success: false, error: 'Access Denied.' });
}