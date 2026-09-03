import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 10000) return res.status(413).json({ error: 'Payload Limit Reached.' });

  const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });
  if (!(await redis.get(`session:${match[1]}`))) return res.status(401).json({ error: 'Session Expired' });

  // Rate Limiter
  const rateKey = `rate:chat:${match[1]}`;
  const requests = await redis.incr(rateKey);
  if (requests === 1) await redis.expire(rateKey, 60);
  if (requests > 15) return res.status(429).json({ error: 'Too Many Requests (Max 15/min)' });

  try {
    const upstream = await fetch(process.env.OLLAMA_ENDPOINT, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        ...(process.env.OLLAMA_API_KEY && { "Authorization": `Bearer ${process.env.OLLAMA_API_KEY}` }) 
      },
      body: JSON.stringify({ model: req.body.requestedModel || "gpt-3.5-turbo", messages: req.body.messages })
    });

    if (!upstream.ok) return res.status(upstream.status).json({ error: "Provider Error", details: await upstream.text() });
    return res.status(200).json(await upstream.json());
  } catch (err) {
    return res.status(502).json({ error: "Gateway Timeout" });
  }
}