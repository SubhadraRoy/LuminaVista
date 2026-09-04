import { Redis } from '@upstash/redis';

export const maxDuration = 60;

function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  // Normalize, remove null bytes, and block directory traversal sequences
  return userPath
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .replace(/\.\.+[/\\]/g, '') // Strips ../ and ..\
    .replace(/^\/+/, '')
    .trim();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Session Authentication
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  
  try {
    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Unauthorized Session' });
    }
    await redis.expire(`session:${match[1]}`, 1200);
  } catch (e) {
    return res.status(500).json({ error: 'Database Validation Failed' });
  }

  const ghToken = process.env.GITHUB_STORAGE_TOKEN;
  const repo = process.env.GITHUB_STORAGE_REPO;
  if (!ghToken || !repo) return res.status(500).json({ error: 'Storage credentials missing.' });

  const { action, path, content } = req.body;
  const cleanPath = sanitizeFilePath(path);

  if (action !== 'list' && !cleanPath) {
    return res.status(400).json({ error: 'Invalid or illegal file path.' });
  }

  const baseUrl = `https://api.github.com/repos/${repo}/contents/${cleanPath}`;
  const ghHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LuminaVista-OS-Hardened'
  };

  try {
    if (action === 'read') {
      const gitRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!gitRes.ok) return res.status(gitRes.status).json({ error: 'File not found' });
      const data = await gitRes.json();
      const decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');
      return res.status(200).json({ content: decodedContent });
    }

    if (action === 'write') {
      let currentSha = undefined;
      const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (checkRes.ok) {
        currentSha = (await checkRes.json()).sha;
      }

      const putRes = await fetch(baseUrl, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `LuminaVista Commit: ${cleanPath}`,
          content: Buffer.from(content || '').toString('base64'),
          sha: currentSha
        })
      });
      const putData = await putRes.json();
      if (!putRes.ok) return res.status(putRes.status).json({ error: putData.message });
      return res.status(200).json({ success: true, sha: putData.content.sha });
    }

    if (action === 'delete') {
      const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!checkRes.ok) return res.status(404).json({ error: 'File not found' });
      const currentSha = (await checkRes.json()).sha;

      const delRes = await fetch(baseUrl, {
        method: 'DELETE',
        headers: ghHeaders,
        body: JSON.stringify({ message: `LuminaVista Cleanup: ${cleanPath}`, sha: currentSha })
      });
      return res.status(delRes.ok ? 200 : delRes.status).json({ success: delRes.ok });
    }

    return res.status(400).json({ error: 'Unsupported action.' });
  } catch (error) {
    return res.status(502).json({ error: 'Storage upstream failure', details: error.message });
  }
}