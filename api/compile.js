import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  
  try {
    if (!url.startsWith('http')) return res.status(500).json({ error: 'Server Redis configuration error.' });
    if (JSON.stringify(req.body || {}).length > 20000) return res.status(413).json({ error: 'Payload Limit Exceeded (Max 20KB)' });

    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match) return res.status(401).json({ error: 'Session Expired (No Cookie)' });

    const isValid = await redis.get(`session:${match[1]}`);
    if (!isValid) return res.status(401).json({ error: 'Session Expired (Not in DB)' });

    const { language, code } = req.body;
    
    // Fallback logic for Mock SQL
    if (language === 'sql') return res.status(200).json({ output: `=== SQL MOCK ===\nExecute: ${code.substring(0,50)}\nRows: 12\nState: OK.` });

    const langMap = { 'python': { l: 'python', v: '3.10.0' }, 'cpp': { l: 'c++', v: '10.2.0' }, 'java': { l: 'java', v: '15.0.2' } };
    if (!langMap[language]) return res.status(400).json({ error: "Language Unsupported" });

    // Request Piston execution
    const pistonRes = await fetch("https://emkc.org/api/v2/piston/execute", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: langMap[language].l, version: langMap[language].v, files: [{ content: code }] })
    });

    const d = await pistonRes.json();
    const finalOutput = (d.run?.output || d.run?.stderr || "Finished with no output (Exit 0)").trim();
    return res.status(200).json({ output: finalOutput });

  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Code Execution Service Down." });
  }
}