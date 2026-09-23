import { Sandbox } from '@e2b/code-interpreter';
import { getRedisClient } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog
} from './_lib/auth-guard.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. Enforce payload limit (Max 200KB)
  if (!enforcePayloadLimit(req, 200000)) {
    return res.status(413).json({ error: 'Payload Limit Exceeded (Max 200KB)' });
  }

  const redis = getRedisClient();

  // 2. Zero-Trust Session Verification
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/terminal');
    return res.status(auth.status).json({ error: auth.error });
  }

  // 3. Sliding IP Rate Limiting (20 commands / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'terminal', 20, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/terminal');
    return res.status(rate.status).json({ error: rate.error });
  }

  const { command, files } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: "Missing or invalid terminal command." });
  }

  if (!process.env.E2B_API_KEY) {
    auditLog('TERMINAL_CONFIG_FAULT', req, 'E2B_API_KEY missing in environment');
    return res.status(500).json({ error: "MicroVM infrastructure unconfigured." });
  }

  let sbx = null;
  try {
    sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });

    // Mount VFS files into the microVM
    if (Array.isArray(files)) {
      for (const file of files) {
        if (file && file.name && typeof file.name === 'string' && file.content !== undefined) {
          // Prevent directory traversal inside container mounts
          const safeName = file.name.replace(/\.\.+[/\\]/g, '').replace(/^\/+/, '');
          if (safeName) {
            await sbx.files.write(safeName, String(file.content));
          }
        }
      }
    }

    // Execute bash command inside the Firecracker sandbox
    const execution = await sbx.commands.run(command, { timeoutMs: 30000 });

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

    return res.status(200).json({
      stdout: execution.stdout || '',
      stderr: execution.stderr || '',
      error: execution.error ? sanitizeError(execution.error.message) : null,
      workspaceFiles
    });

  } catch (error) {
    auditLog('TERMINAL_FAULT', req, error.message);
    return res.status(502).json({ error: sanitizeError(error, "MicroVM execution error.") });
  } finally {
    if (sbx) await sbx.kill().catch(() => {});
  }
}