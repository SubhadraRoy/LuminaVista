// api/chat.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // The backend now accepts requestedModel dynamically from the frontend dropdown
  const { messages, prompt, requestedModel } = req.body;

  const targetEndpoint = process.env.OLLAMA_ENDPOINT;
  const apiKey = process.env.OLLAMA_API_KEY;
  
  // 1. Prioritize frontend UI selection. 
  // 2. Fallback to Vercel OLLAMA_MODEL config. 
  // 3. Absolute default is gpt-oss:20.
  const activeModel = requestedModel || process.env.OLLAMA_MODEL || "gpt-oss:20";

  if (!targetEndpoint) {
    return res.status(500).json({ error: "OLLAMA_ENDPOINT is not set in Vercel environment variables." });
  }

  try {
    const isNativeOllama = targetEndpoint.endsWith("/api/chat") || targetEndpoint.endsWith("/api/generate");

    let payload;
    if (isNativeOllama) {
      payload = {
        model: activeModel,
        messages: messages || [{ role: "user", content: prompt }],
        stream: false
      };
    } else {
      payload = {
        model: activeModel,
        messages: messages || [{ role: "user", content: prompt }],
        temperature: 0.7
      };
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const upstreamResponse = await fetch(targetEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return res.status(upstreamResponse.status).json({
        error: `Provider API returned HTTP ${upstreamResponse.status}`,
        details: errorText
      });
    }

    const data = await upstreamResponse.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: "Bad Gateway / Backend Connection Error",
      message: error.message
    });
  }
}