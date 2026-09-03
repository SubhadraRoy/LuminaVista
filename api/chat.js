import { Redis } from '@upstash/redis';

export const maxDuration = 60;

// Multi-Source Web Search Engine (Resilient to Vercel IP blocks)
async function performWebSearch(query) {
  const cleanQuery = query.replace(/[^\w\s-]/gi, ' ').trim().slice(0, 100);
  if (!cleanQuery) return null;

  const results = [];

  // 1. Check for premium search API keys if configured in Vercel
  if (process.env.TAVILY_API_KEY) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query: cleanQuery, max_results: 4 })
      });
      if (res.ok) {
        const data = await res.json();
        data.results?.forEach(r => results.push(`- **${r.title}**: ${r.content} (${r.url})`));
        if (results.length > 0) return results.join("\n\n");
      }
    } catch (e) {
      console.warn("Tavily search failed, falling back to public providers.");
    }
  }

  // 2. Free Public Engine A: DuckDuckGo Instant Answer API
  try {
    const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`);
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText) {
        results.push(`- **Overview**: ${ddgData.AbstractText} (Source:${ddgData.AbstractURL || 'DuckDuckGo'})`);
      }
      ddgData.RelatedTopics?.slice(0, 3).forEach(topic => {
        if (topic.Text) results.push(`- ${topic.Text} (${topic.FirstURL || ''})`);
      });
    }
  } catch (e) {
    console.warn("DuckDuckGo API call failed:", e.message);
  }

  // 3. Free Public Engine B: Wikipedia Search & Summary API
  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&origin=*`);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const hits = wikiData.query?.search?.slice(0, 3) || [];
      hits.forEach(hit => {
        const cleanSnippet = hit.snippet.replace(/<[^>]+>/g, '').trim();
        results.push(`- **${hit.title}**: ${cleanSnippet} (https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title)})`);
      });
    }
  } catch (e) {
    console.warn("Wikipedia API call failed:", e.message);
  }

  return results.length > 0 ? results.join("\n\n") : null;
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

    // Inject Codespace format directive into system prompt
    const codespaceDirective = `\n\n[CODESPACE WORKSPACE RULES]:\nYou have full access to an integrated interactive codespace/sandbox. When you write code for this workspace, specify the target filename in your markdown code fence using the format:\n\`\`\`html:index.html\n\`\`\`css:style.css\n\`\`\`javascript:script.js\nor start the code block with a comment like // filename: app.js. The client will automatically compile and render your files.`;

    if (formattedMessages[0]?.role === 'system') {
      formattedMessages[0].content += codespaceDirective;
    } else {
      formattedMessages.unshift({ role: 'system', content: codespaceDirective });
    }

    // Real-Time Internet Search
    let searchResultsSummary = null;
    if (webSearch) {
      const lastUserMsg = [...formattedMessages].reverse().find(m => m.role === 'user');
      const searchQuery = lastUserMsg ? lastUserMsg.content : prompt;
      
      if (searchQuery) {
        searchResultsSummary = await performWebSearch(searchQuery);
        if (searchResultsSummary) {
          const webContext = `\n\n[REAL-TIME LIVE INTERNET DATA]:\n${searchResultsSummary}\n\nInstructions: Use this verified internet search context to provide an accurate, current response.`;
          formattedMessages[0].content += webContext;
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
    if (searchResultsSummary) {
      data._webSearchAttached = true;
    }
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