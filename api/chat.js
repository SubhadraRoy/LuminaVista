export default async function handler(req, res) {
  // 1. STRICT CORS DOMAIN VERIFICATION
  const allowedOrigins = [
    'https://subhadraroy.github.io/LuminaVista/', // <-- Change this to your exact GitHub Pages URL
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://lumina-vista-sigma.vercel.app'
  ];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin) {
    // If the request comes from an unknown website, block it instantly
    return res.status(403).json({ error: "Forbidden", details: "CORS Origin not allowed." });
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Vercel-Auth");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed. Use POST." });

  // 2. VERCEL SECURITY KEY CHECK
  const requiredToken = process.env.VERCEL_SECURE_TOKEN;
  const providedToken = req.headers["x-vercel-auth"];

  if (requiredToken && providedToken !== requiredToken) {
    return res.status(401).json({ error: "Unauthorized", details: "Invalid Vercel Security Key." });
  }

  // 3. PAYLOAD BOMB & MEMORY EXHAUSTION PROTECTION
  const bodyString = JSON.stringify(req.body);
  if (bodyString.length > 50000) { // Max 50KB payload
    return res.status(413).json({ error: "Payload Too Large", details: "Request exceeds maximum allowed size." });
  }

  const { messages, prompt, requestedModel } = req.body;
  
  if (!messages || !Array.isArray(messages) || messages.length > 30) {
    return res.status(400).json({ error: "Bad Request", details: "Invalid or oversized messages array." });
  }

  const targetEndpoint = process.env.OLLAMA_ENDPOINT;
  const apiKey = process.env.OLLAMA_API_KEY;
  const activeModel = requestedModel || process.env.OLLAMA_MODEL || "gpt-oss:20b";

  if (!targetEndpoint) {
    return res.status(500).json({ error: "Server Misconfiguration", details: "OLLAMA_ENDPOINT not set." });
  }

  try {
    const isNativeOllama = targetEndpoint.endsWith("/api/chat") || targetEndpoint.endsWith("/api/generate");

    let payload = isNativeOllama ? {
      model: activeModel,
      messages: messages,
      stream: false
    } : {
      model: activeModel,
      messages: messages,
      temperature: 0.7,
      max_tokens: 4000
    };

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

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