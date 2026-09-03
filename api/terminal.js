import { Redis } from '@upstash/redis';
import { Sandbox } from '@e2b/code-interpreter';

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
  } catch (e) {
    return res.status(500).json({ error: 'Auth Database Failure' });
  }

  // 3. E2B Sandbox Execution
  const { command, files } = req.body; 
  if (!command) return res.status(400).json({ error: "Missing terminal command." });
  if (!process.env.E2B_API_KEY) return res.status(500).json({ error: "E2B_API_KEY is missing in Vercel." });

  try {
    // Creates an isolated Linux microVM (Takes ~200ms)
    const sbx = await Sandbox.create();
    
    // Inject your LuminaVista Codespace files into the cloud VM
    if (Array.isArray(files)) {
      for (const file of files) {
        await sbx.files.write(file.name, file.content);
      }
    }
    
    // Execute the bash or node command
    const execution = await sbx.commands.run(command);
    
    return res.status(200).json({ 
      stdout: execution.stdout, 
      stderr: execution.stderr,
      error: execution.error
    });

  } catch (error) {
    console.error("E2B Sandbox Error:", error);
    return res.status(502).json({ error: "E2B Infrastructure Error", details: error.message });
  }
}