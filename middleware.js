import { Redis } from '@upstash/redis';

export const config = {
  matcher: '/dashboard.html',
};

export default async function middleware(req) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // SAFEGUARD: Redirect to index if DB link is totally missing to prevent crashes
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return Response.redirect(new URL('/index.html', req.url));
  }

  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/godx_session=([^;]+)/);
  
  if (!match) return Response.redirect(new URL('/index.html', req.url));

  try {
    const redis = new Redis({ url, token });
    const session = await redis.get(`session:${match[1]}`);
    
    if (!session) return Response.redirect(new URL('/index.html', req.url));
    
    // Refresh session timer (1200s = 20m)
    await redis.expire(`session:${match[1]}`, 1200);
    return; // Pass through to the protected workspace
  } catch (error) {
    console.error("MIDDLEWARE ERROR:", error);
    return Response.redirect(new URL('/index.html', req.url));
  }
}