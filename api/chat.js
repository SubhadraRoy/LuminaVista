import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  try {
    if (!url.startsWith('http')) return res.status(500).json({ error: 'Server Redis configuration error.' });
    if (JSON.stringify(req.body || {}).length > 15000) return res.status(413).json({ error: 'Context too large. Clear chat memory.' });

    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Session Expired.' });
    }

    const { messages, requestedModel } = req.body;
    const aiEndpoint = process.env.OLLAMA_ENDPOINT;
    const aiKey = process.env.OLLAMA_API_KEY || '';

    if (!aiEndpoint || !aiEndpoint.startsWith('http')) {
      return res.status(500).json({ error: 'Server is missing AI Endpoint.' });
    }

    const aiRes = await fetch(aiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(aiKey && { "Authorization": `Bearer ${aiKey}` }) },
      body: JSON.stringify({ model: requestedModel || "gpt-3.5-turbo", messages, temperature: 0.7 })
    });

    // Prevent bad JSON crashing the Vercel Function
    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      return res.status(aiRes.status).json({ error: 'Upstream Provider Failed', details: errTxt.substring(0, 100) });
    }

    const data = await aiRes.json();
    return res.status(200).json(data);
    
  } catch (error) {
    console.error("AI Proxy Error:", error);
    return res.status(502).json({ error: 'Gateway timeout / Unknown server crash.' });
  }
}