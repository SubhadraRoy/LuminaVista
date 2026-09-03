import { Redis } from '@upstash/redis';

export const maxDuration = 60;

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
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  
  try {
    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Session Expired / Unauthorized' });
    }
    await redis.expire(`session:${match[1]}`, 1200); // Reset timeout
  } catch (e) {
    return res.status(500).json({ error: 'Auth Database Failure' });
  }

  // 3. GitHub API Setup
  const ghToken = process.env.GITHUB_STORAGE_TOKEN;
  const repo = process.env.GITHUB_STORAGE_REPO;
  if (!ghToken || !repo) return res.status(500).json({ error: 'GitHub Storage Credentials Missing in Vercel' });

  const { action, path, content } = req.body;
  const safePath = path ? path.replace(/^\/+/, '') : '';
  const baseUrl = `https://api.github.com/repos/${repo}/contents/${safePath}`;
  const ghHeaders = {
    'Authorization': `token ${ghToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LuminaVista-OS-Storage'
  };

  try {
    // READ / LIST FILES
    if (action === 'read' || action === 'list') {
      const gitRes = await fetch(baseUrl, { headers: ghHeaders });
      const data = await gitRes.json();
      if (!gitRes.ok) return res.status(gitRes.status).json({ error: data.message });

      if (action === 'read') {
        const decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');
        return res.status(200).json({ content: decodedContent });
      }
      return res.status(200).json({ files: data });
    }

    // WRITE / UPDATE FILES
    if (action === 'write') {
      let currentSha = undefined;
      const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        currentSha = checkData.sha; // Required by GitHub to overwrite existing files
      }

      const putRes = await fetch(baseUrl, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `LuminaVista Auto-Save: ${safePath}`,
          content: Buffer.from(content || '').toString('base64'),
          sha: currentSha
        })
      });
      const putData = await putRes.json();
      if (!putRes.ok) return res.status(putRes.status).json({ error: putData.message });
      return res.status(200).json({ success: true, sha: putData.content.sha });
    }

    // DELETE FILES
    if (action === 'delete') {
      const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!checkRes.ok) return res.status(404).json({ error: "File not found" });
      const currentSha = (await checkRes.json()).sha;

      const delRes = await fetch(baseUrl, {
        method: 'DELETE',
        headers: ghHeaders,
        body: JSON.stringify({ message: `LuminaVista Deletion: ${safePath}`, sha: currentSha })
      });
      return res.status(delRes.ok ? 200 : delRes.status).json({ success: delRes.ok });
    }

    return res.status(400).json({ error: 'Invalid action parameter. Use read, list, write, or delete.' });
  } catch (error) {
    return res.status(502).json({ error: 'Cloud Storage Error', details: error.message });
  }
}