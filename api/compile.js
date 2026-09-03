import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !url.startsWith('http')) return res.status(500).json({ error: 'Vercel Database environment variable missing.' });
  if (JSON.stringify(req.body || {}).length > 20000) return res.status(413).json({ error: 'Payload Limit Exceeded (Max 20KB)' });

  try {
    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Session Expired. Refresh dashboard.' });
    }

    const { language, code } = req.body;
    if (language === 'sql') return res.status(200).json({ output: `=== SQL MOCK ===\nExecute: ${code.substring(0,30)}...\nState: Query Completed OK.` });

    const langMap = { 'python': { l: 'python', v: '3.10.0' }, 'cpp': { l: 'c++', v: '10.2.0' }, 'java': { l: 'java', v: '15.0.2' } };
    if (!langMap[language]) return res.status(400).json({ error: "Language Unsupported" });

    const pistonRes = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: langMap[language].l, version: langMap[language].v, files: [{ content: code }] })
    });

    const d = await pistonRes.json();
    return res.status(200).json({ output: (d.run?.output || d.run?.stderr || "Exited without output (Exit 0)").trim() });

  } catch (error) {
    return res.status(502).json({ error: "Code Execution Sub-Service Down." });
  }
}