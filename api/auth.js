import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // SAFEGUARD: Blocks the pipeline crash! Returns a graceful JSON error message to UI
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(500).json({ 
      success: false, 
      error: 'DATABASE_MISSING: Environment variables are empty! Check your Vercel Project Settings > Storage.' 
    });
  }
  
  try {
    const redis = new Redis({ url, token });
    const { password } = req.body || {};
    
    if (JSON.stringify(req.body || {}).length > 2000) return res.status(413).json({ error: 'Payload Limit Exceeded' });

    const expectedPassword = process.env.ADMIN_PASSWORD || 'xps@admin';

    const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
    const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest('hex');

    if (inputHash === expectedHash) {
      const sessionId = crypto.randomUUID();
      await redis.set(`session:${sessionId}`, 'active', { ex: 1200 }); // 20 min limit
      
      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true, secure: true, sameSite: 'lax', maxAge: 1200, path: '/'
      }));

      return res.status(200).json({ success: true });
    }

    return res.status(401).json({ success: false, error: 'Access Denied.' });
  } catch (error) {
    console.error("REDIS EXECUTION ERROR:", error);
    return res.status(500).json({ success: false, error: 'Database processing failed.' });
  }
}