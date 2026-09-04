import { Redis } from '@upstash/redis';

export const maxDuration = 10; // Fast execution, just for queuing

export default async function handler(req, res) {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vercel-Auth');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 2. Authentication Gateway
  const dbUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const dbToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  let userSession = "anonymous";
  
  try {
    const redis = new Redis({ url: dbUrl, token: dbToken });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Unauthorized Session' });
    }
    userSession = match[1];
    await redis.expire(`session:${userSession}`, 1200);
  } catch (e) {
    return res.status(500).json({ error: 'Database Verification Fault' });
  }

  // 3. Publish to QStash (The Cordovan Ladder)
  const qstashToken = process.env.QSTASH_TOKEN;
  const qstashUrl = process.env.QSTASH_URL || "https://qstash.upstash.io/v2/publish";
  const workerEndpoint = `https://${req.headers.host}/api/worker`; // The route we will build next

  if (!qstashToken) return res.status(500).json({ error: "QSTASH_TOKEN missing." });

  // Generate a unique tracking ID for this background job
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const { prompt, requestedModel, messages, webSearch, currentVfs } = req.body;

    const payload = {
      jobId,
      userSession,
      prompt,
      requestedModel,
      messages,
      webSearch,
      currentVfs // Pass the current file state so the worker knows what to edit
    };

    // Push the job to the queue
    const qRes = await fetch(`${qstashUrl}/${workerEndpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
        'Upstash-Forward-User-Agent': 'LuminaVista-Dispatcher',
        'Upstash-Retries': '0' // Prevent duplicate executions if the AI takes too long
      },
      body: JSON.stringify(payload)
    });

    if (!qRes.ok) {
      const err = await qRes.text();
      return res.status(502).json({ error: "Queue Dispatch Failed", details: err });
    }

    // 4. Instantly release the browser
    return res.status(202).json({ 
      status: "queued", 
      jobId: jobId,
      message: "Task dispatched to background worker successfully." 
    });

  } catch (error) {
    return res.status(500).json({ error: "Dispatcher Fault", details: error.message });
  }
}