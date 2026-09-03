import { Redis } from '@upstash/redis';

export const maxDuration = 60;

export default async function handler(req, res) {
  // 1. Handle Preflight OPTIONS and Method Checks
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vercel-Auth');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Redis Configuration & Session Check
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !url.startsWith('http')) {
    return res.status(500).json({ error: 'Vercel Redis configuration missing.' });
  }

  if (JSON.stringify(req.body || {}).length > 25000) {
    return res.status(413).json({ error: 'Context too large. Clear chat memory.' });
  }

  try {
    const redis = new Redis({ url, token });
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/godx_session=([^;]+)/);
    const sessionToken = match ? match[1] : null;

    if (!sessionToken || !(await redis.get(`session:${sessionToken}`))) {
      return res.status(401).json({ error: 'Session Expired. Please log in again.' });
    }

    // Refresh active session TTL (20 minutes)
    await redis.expire(`session:${sessionToken}`, 1200);

    // 3. AI Endpoint & Payload Extraction
    const { messages, prompt, requestedModel } = req.body;
    const aiEndpoint = process.env.OLLAMA_ENDPOINT;
    const aiKey = process.env.OLLAMA_API_KEY || '';
    const activeModel = requestedModel || process.env.OLLAMA_MODEL || "gpt-oss:20b";

    if (!aiEndpoint || !aiEndpoint.startsWith('http')) {
      return res.status(500).json({ error: 'Missing Vercel AI Config: OLLAMA_ENDPOINT is empty or invalid.' });
    }

    // Normalize messages array
    const formattedMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt || 'Hello' }];

    // Check if targeting a native Ollama endpoint or OpenAI-compatible format
    const isNativeOllama = aiEndpoint.includes('/api/chat') || aiEndpoint.includes('/api/generate');

    const payload = isNativeOllama
      ? {
          model: activeModel,
          messages: formattedMessages,
          stream: false // CRITICAL: Prevents Ollama chunked streaming crash
        }
      : {
          model: activeModel,
          messages: formattedMessages,
          temperature: 0.7,
          stream: false
        };

    const headers = { 'Content-Type': 'application/json' };
    if (aiKey) {
      headers['Authorization'] = `Bearer ${aiKey}`;
    }

    // 4. Upstream Request with Timeout Safeguard
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout before Vercel 60s maxDuration

    const aiRes = await fetch(aiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      console.error(`UPSTREAM ERROR (${aiRes.status}):`, errTxt);
      return res.status(aiRes.status).json({
        error: `Upstream Provider Returned HTTP ${aiRes.status}`,
        details: errTxt
      });
    }

    const data = await aiRes.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error("CRITICAL AI ROUTE ERROR:", error);
    
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Gateway Timeout: Upstream AI took longer than 55 seconds to respond.' });
    }

    return res.status(502).json({
      error: 'Gateway / Connection Failure',
      details: error.message
    });
  }
}