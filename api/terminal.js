import { Redis } from '@upstash/redis';
import { Sandbox } from '@e2b/code-interpreter';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Vercel-Auth');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  try {
    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    if (!match || !(await redis.get(`session:${match[1]}`))) {
      return res.status(401).json({ error: 'Session Expired / Unauthorized' });
    }
    await redis.expire(`session:${match[1]}`, 1200);
  } catch (e) {
    return res.status(500).json({ error: 'Auth Database Failure' });
  }

  const { command, files } = req.body;
  if (!command) return res.status(400).json({ error: "Missing terminal command." });
  if (!process.env.E2B_API_KEY) return res.status(500).json({ error: "E2B_API_KEY is missing in Vercel settings." });

  try {
    const sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });

    // Mount VFS files into the microVM
    if (Array.isArray(files)) {
      for (const file of files) {
        if (file.name && file.content !== undefined) {
          await sbx.files.write(file.name, file.content);
        }
      }
    }

    // Execute bash command inside the Firecracker sandbox
    const execution = await sbx.commands.run(command, { timeoutMs: 45000 });

    // Inspect if workspace files were created or modified
    const workspaceFiles = [];
    try {
      const list = await sbx.files.list('.');
      for (const item of list) {
        if (item.type === 'file') {
          const content = await sbx.files.read(item.name);
          workspaceFiles.push({ name: item.name, content });
        }
      }
    } catch (ignore) {}

    await sbx.kill();

    return res.status(200).json({
      stdout: execution.stdout || '',
      stderr: execution.stderr || '',
      error: execution.error || null,
      workspaceFiles
    });

  } catch (error) {
    console.error("E2B MicroVM Sandbox Error:", error);
    return res.status(502).json({ error: "E2B Infrastructure Error", details: error.message });
  }
}