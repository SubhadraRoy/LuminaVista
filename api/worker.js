import { Sandbox } from '@e2b/code-interpreter';
import { getRedisClient } from './_lib/redis.js';
import { sanitizeError, auditLog } from './_lib/auth-guard.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { jobId, userSession, prompt, requestedModel, messages, currentVfs } = req.body;
  if (!jobId || !userSession) {
    return res.status(400).json({ error: 'Missing required worker parameters' });
  }

  const redis = getRedisClient();
  if (!redis) {
    return res.status(500).json({ error: 'Worker database unconfigured' });
  }

  // Verify that the dispatching user session is active in Redis
  try {
    const active = await redis.get(`session:${userSession}`);
    if (!active) {
      auditLog('WORKER_UNAUTHORIZED', req, `Invalid userSession for job ${jobId}`);
      return res.status(401).json({ error: 'Unauthorized worker invocation' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Session verification failure' });
  }

  try {
    // Mark job as processing
    await redis.set(`job_state:${jobId}`, JSON.stringify({ status: 'processing', logs: [], vfs: currentVfs }), { ex: 3600 });

    let updatedVfs = { ...currentVfs };
    let terminalLogs = [];

    // Query LLM Provider safely using server-side environment variables
    const endpoint = process.env.OLLAMA_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions";
    const apiKey = process.env.OLLAMA_API_KEY || "";

    const aiRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: requestedModel || "gpt-oss:20b",
        messages: messages,
        stream: false
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      console.error('[WORKER_LLM_ERROR]', aiRes.status, sanitizeError(errText));
      throw new Error(`LLM Upstream Error (HTTP ${aiRes.status})`);
    }

    const aiData = await aiRes.json();
    const aiReply = aiData.choices?.[0]?.message?.content || aiData.message?.content || "";

    // Parse [TOOL] Directives
    const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
    let match;
    while ((match = writeRegex.exec(aiReply)) !== null) {
      updatedVfs[match[1]] = match[2].trim();
      terminalLogs.push(`[Worker] Wrote artifact: ${match[1]}`);
    }

    const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
    while ((match = delRegex.exec(aiReply)) !== null) {
      delete updatedVfs[match[1]];
      terminalLogs.push(`[Worker] Destroyed artifact: ${match[1]}`);
    }

    const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
    const execCommands = [];
    while ((match = execRegex.exec(aiReply)) !== null) {
      execCommands.push(match[1].trim());
    }

    if (execCommands.length > 0 && process.env.E2B_API_KEY) {
      let sbx = null;
      try {
        terminalLogs.push(`[Worker] Booting Firecracker MicroVM for ${execCommands.length} directive(s)...`);
        sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
        
        for (const [name, content] of Object.entries(updatedVfs)) {
          await sbx.files.write(name, content);
        }

        for (const cmd of execCommands) {
          terminalLogs.push(`➜ ${cmd}`);
          const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
          if (execution.stdout) terminalLogs.push(execution.stdout);
          if (execution.stderr) terminalLogs.push(`[MicroVM Error]: ${sanitizeError(execution.stderr)}`);
        }

        try {
          const list = await sbx.files.list('.');
          for (const item of list) {
            if (item.type === 'file') {
              updatedVfs[item.name] = await sbx.files.read(item.name);
            }
          }
        } catch (ignore) {}
      } finally {
        if (sbx) await sbx.kill().catch(() => {});
      }
    }

    const finalState = {
      status: 'completed',
      reply: aiReply,
      vfs: updatedVfs,
      logs: terminalLogs
    };

    await redis.set(`job_state:${jobId}`, JSON.stringify(finalState), { ex: 86400 });
    return res.status(200).json({ success: true });

  } catch (error) {
    auditLog('WORKER_FAULT', req, error.message);
    const safeError = sanitizeError(error, 'Background execution failure');
    await redis.set(`job_state:${jobId}`, JSON.stringify({ status: 'failed', error: safeError }), { ex: 3600 });
    return res.status(500).json({ error: safeError });
  }
}