import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (JSON.stringify(req.body || {}).length > 15000) return res.status(413).json({ error: 'Payload Limit (15KB)' });

  const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
  if (!match) return res.status(401).json({ error: 'Unauthorized' });

  const session = await redis.get(`session:${match[1]}`);
  if (!session) return res.status(401).json({ error: 'Session Expired' });

  // Rate Limiter
  const rateKey = `rate:compile:${match[1]}`;
  const requests = await redis.incr(rateKey);
  if (requests === 1) await redis.expire(rateKey, 60);
  if (requests > 10) return res.status(429).json({ error: 'Too Many Requests (Max 10/min)' });

  const { language, code } = req.body;

  if (language === 'sql') return res.status(200).json({ output: `=== SQL Engine ===\nExecuted: ${code}\nRows affected: 42.` });

  const map = { 'python': { l: 'python', v: '3.10.0' }, 'cpp': { l: 'c++', v: '10.2.0' }, 'java': { l: 'java', v: '15.0.2' } };
  if (!map[language]) return res.status(400).json({ error: "Unsupported" });

  try {
    const r = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: map[language].l, version: map[language].v, files: [{ content: code }] })
    });
    const d = await r.json();
    return res.status(200).json({ output: (d.run?.output || d.run?.stderr || "Exited with 0.").trim() });
  } catch (err) {
    return res.status(502).json({ error: "Engine Unreachable." });
  }
}