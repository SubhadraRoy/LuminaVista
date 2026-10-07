import { Redis } from '@upstash/redis';

export const config = {
  matcher: [
    '/dashboard.html',
    '/modules/:path*',
    '/personas.js',
    '/tests/:path*',
    '/package.json',
    '/package-lock.json',
    '/README.md'
  ],
};

async function verifySovereignTokenEdge(token, secret) {
  if (!token || typeof token !== 'string' || !token.startsWith('lv_')) return false;
  const parts = token.split('_');
  if (parts.length !== 5) return false;
  const [, uuid, role, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const age = Date.now() - timestamp;
  if (age < -30000 || age > 1200 * 1000) return false; // 20-minute validity

  try {
    const payload = `${uuid}:${role}:${timestamp}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const expectedSig = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return signature === expectedSig;
  } catch (err) {
    console.error('[EDGE_AUTH] HMAC verification error:', err);
    return false;
  }
}

export default async function middleware(req) {
  const pathname = new URL(req.url).pathname;
  if (pathname.startsWith('/tests') || pathname === '/package.json' || pathname === '/package-lock.json' || pathname === '/README.md') {
    return new Response('Not Found', { status: 404 });
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/godx_session=([^;]+)/);
  
  if (!match) return Response.redirect(new URL('/index.html', req.url));

  const sessionToken = match[1].trim();

  // 1. Sovereign Cryptographic Verification Check (Fastest path, immune to Upstash limits)
  const masterSecret = process.env.ADMIN_PASSWORD;
  if (masterSecret && sessionToken.startsWith('lv_')) {
    const isValid = await verifySovereignTokenEdge(sessionToken, masterSecret);
    if (isValid) {
      return; // Pass through to the protected workspace
    }
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // SAFEGUARD: Redirect to index if DB link is totally missing to prevent crashes
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return Response.redirect(new URL('/index.html', req.url));
  }

  try {
    const redis = new Redis({ url, token });
    const session = await redis.get(`session:${sessionToken}`);
    
    if (!session) return Response.redirect(new URL('/index.html', req.url));
    
    // Refresh session timer (1200s = 20m)
    await redis.expire(`session:${sessionToken}`, 1200).catch(() => {});
    return; // Pass through to the protected workspace
  } catch (error) {
    console.error("MIDDLEWARE ERROR:", error?.message || error);
    // If Redis encounters quota limit or connection error, check sovereign token once more
    if (masterSecret && sessionToken.startsWith('lv_')) {
      const isValid = await verifySovereignTokenEdge(sessionToken, masterSecret);
      if (isValid) return;
    }
    return Response.redirect(new URL('/index.html', req.url));
  }
}