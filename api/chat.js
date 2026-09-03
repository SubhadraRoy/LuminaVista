import { Redis } from '@upstash/redis';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  // Safeguard
  if (!url || !url.startsWith('http')) return res.status(500).json({ error: 'Vercel Redis configuration missing.' });
  if (JSON.stringify(req.body || {}).length > 15000) return res.status(413).json({ error: 'Context too large. Clear memory.' });

  try {
    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Session Expired.' });
    }

    const { messages, requestedModel } = req.body;
    const aiEndpoint = process.env.OLLAMA_ENDPOINT;
    const aiKey = process.env.OLLAMA_API_KEY || '';

    if (!aiEndpoint || !aiEndpoint.startsWith('http')) {
      return res.status(500).json({ error: 'Missing Vercel AI Config: OLLAMA_ENDPOINT is empty.' });
    }

    const aiRes = await fetch(aiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(aiKey && { "Authorization": `Bearer ${aiKey}` }) },
      body: JSON.stringify({ model: requestedModel || "gpt-3.5-turbo", messages, temperature: 0.7 })
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      return res.status(aiRes.status).json({ error: 'Upstream Provider Failed', details: errTxt.substring(0, 100) });
    }

    return res.status(200).json(await aiRes.json());
  } catch (error) {
    return res.status(502).json({ error: 'Gateway timeout / server failure.' });
  }
}