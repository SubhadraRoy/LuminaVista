import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 2000) return res.status(413).json({ error: 'Payload Limit Exceeded' });

  const expectedPassword = process.env.ADMIN_PASSWORD;
  const dbUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const dbToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!expectedPassword || !dbUrl || !dbUrl.startsWith('http')) {
    return res.status(500).json({ success: false, error: 'Server misconfigured. Access blocked.' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const rateLimitKey = `rate_limit:auth:${clientIp}`;

  try {
    const redis = new Redis({ url: dbUrl, token: dbToken });

    // 1. Enforce IP-based rate limiting (Max 5 attempts / 15 minutes)
    const attempts = await redis.get(rateLimitKey);
    if (attempts && parseInt(attempts, 10) >= 5) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed authentication attempts. Access locked for 15 minutes.'
      });
    }

    const { password } = req.body;
    
    // 2. Timing-Safe Hash Comparison
    const inputHash = crypto.createHash('sha256').update(password || '').digest();
    const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest();

    if (crypto.timingSafeEqual(inputHash, expectedHash)) {
      // Clear failed attempts on success
      await redis.del(rateLimitKey);

      const sessionId = crypto.randomUUID();
      await redis.set(`session:${sessionId}`, 'active', { ex: 1200 }); // 20-minute sliding window

      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict', // Hardened from 'lax' to 'strict' to eliminate CSRF
        maxAge: 1200,
        path: '/'
      }));

      return res.status(200).json({ success: true, message: 'Welcome to LuminaVista' });
    }

    // 3. Register failed attempt with 15-minute TTL
    await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 900);

    return res.status(401).json({ success: false, error: 'Access Denied.' });

  } catch (error) {
    console.error("AUTH ERROR:", error);
    return res.status(502).json({ success: false, error: 'Authentication engine failure.' });
  }
}