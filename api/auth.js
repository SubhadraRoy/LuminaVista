import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  // 1. Basic security checks
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 2000) return res.status(413).json({ error: 'Payload Limit Exceeded' });

  // 2. CRITICAL FIX: Ensure the Admin Password is ONLY read from private environment variables
  const expectedPassword = process.env.ADMIN_PASSWORD;
  
  if (!expectedPassword) {
    console.error("SECURITY ALERT: ADMIN_PASSWORD environment variable is missing.");
    return res.status(500).json({ 
      success: false, 
      error: 'SERVER MISCONFIGURED: ADMIN_PASSWORD environment variable is completely missing. Access strictly blocked.' 
    });
  }

  // 3. Fetch Database URLs safely
  const dbUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const dbToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // 4. DB Missing Safeguard
  if (!dbUrl || typeof dbUrl !== 'string' || !dbUrl.startsWith('http')) {
    return res.status(500).json({ 
      success: false, 
      error: 'DATABASE MISSING IN PRODUCTION. Ensure KV_REST_API_URL is checked for Production in Vercel settings.' 
    });
  }

  try {
    const redis = new Redis({ url: dbUrl, token: dbToken });
    const { password } = req.body;
    
    // 5. Compare cryptographic hashes instead of raw passwords
    const inputHash = crypto.createHash('sha256').update(password || '').digest('hex');
    const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest('hex');

    if (inputHash === expectedHash) {
      // 6. Create session key & persist in DB for 1200 seconds (20 mins)
      const sessionId = crypto.randomUUID();
      await redis.set(`session:${sessionId}`, 'active', { ex: 1200 }); 
      
      // 7. Inject HttpOnly cookie securely into the client browser
      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true, secure: true, sameSite: 'lax', maxAge: 1200, path: '/'
      }));

      return res.status(200).json({ success: true, message: 'Welcome to LuminaVista' });
    }

    // Passwords do not match
    return res.status(401).json({ success: false, error: 'Access Denied.' });

  } catch (error) {
    console.error("REDIS EXECUTION ERROR:", error);
    return res.status(502).json({ success: false, error: 'Database API interaction failed.' });
  }
}