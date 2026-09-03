// api/chat.js
import { Redis } from '@upstash/redis';

export const maxDuration = 60;

// Lightweight zero-dependency Web Search scraper
async function performWebSearch(query) {
  try {
    const cleanQuery = query.replace(/[^\w\s-]/gi, ' ').trim().slice(0, 100);
    if (!cleanQuery) return null;

    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!res.ok) return null;
    const html = await res.text();

    const snippets = [];
    const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text) snippets.push(`- ${text}`);
    }

    return snippets.length > 0 ? snippets.join('\n\n') : null;
  } catch (err) {
    console.error("Web Search Resolver Error:", err.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vercel-Auth');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !url.startsWith('http')) {
    return res.status(500).json({ error: 'Vercel Redis configuration missing.' });
  }

  if (JSON.stringify(req.body || {}).length > 40000) {
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

    const { messages, prompt, requestedModel, webSearch } = req.body;
    const aiEndpoint = process.env.OLLAMA_ENDPOINT;
    const aiKey = process.env.OLLAMA_API_KEY || '';
    const activeModel = requestedModel || process.env.OLLAMA_MODEL || "gpt-oss:20b";

    if (!aiEndpoint || !aiEndpoint.startsWith('http')) {
      return res.status(500).json({ error: 'Missing Vercel AI Config: OLLAMA_ENDPOINT is empty or invalid.' });
    }

    let formattedMessages = Array.isArray(messages) && messages.length > 0
      ? [...messages]
      : [{ role: 'user', content: prompt || 'Hello' }];

    // Internet Search Protocol
    if (webSearch) {
      const lastUserMsg = [...formattedMessages].reverse().find(m => m.role === 'user');
      const searchQuery = lastUserMsg ? lastUserMsg.content : prompt;
      
      if (searchQuery) {
        const searchResults = await performWebSearch(searchQuery);
        if (searchResults) {
          const webContextPrompt = `\n\n[REAL-TIME LIVE INTERNET SEARCH RESULTS]:\n${searchResults}\n\nInstructions: Use the real-time search data above to provide factual, up-to-date answers to the user's query. Incorporate this context naturally without announcing that you performed a search.`;
          
          if (formattedMessages[0]?.role === 'system') {
            formattedMessages[0].content += webContextPrompt;
          } else {
            formattedMessages.unshift({ role: 'system', content: webContextPrompt });
          }
        }
      }
    }

    const isNativeOllama = aiEndpoint.includes('/api/chat') || aiEndpoint.includes('/api/generate');

    const payload = isNativeOllama
      ? {
          model: activeModel,
          messages: formattedMessages,
          stream: false
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

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
      return res.status(504).json({ error: 'Gateway Timeout: Upstream AI exceeded 55s limit.' });
    }

    return res.status(502).json({
      error: 'Gateway / Connection Failure',
      details: error.message
    });
  }
}