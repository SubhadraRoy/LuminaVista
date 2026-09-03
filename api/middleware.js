import { Redis } from '@upstash/redis';

export const config = {
  matcher: '/dashboard.html',
};

export default async function middleware(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/godx_session=([^;]+)/);
  
  if (!match) {
    return Response.redirect(new URL('/index.html', req.url));
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    const session = await redis.get(`session:${match[1]}`);
    if (!session) {
      return Response.redirect(new URL('/index.html', req.url));
    }
    
    // Refresh 20-minute timeout sliding window
    await redis.expire(`session:${match[1]}`, 1200);
    return; // Pass through to dashboard.html
  } catch (error) {
    return Response.redirect(new URL('/index.html', req.url));
  }
}