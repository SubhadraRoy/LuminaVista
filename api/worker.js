import { Redis } from '@upstash/redis';
import { Sandbox } from '@e2b/code-interpreter';

export const maxDuration = 60; // Max execution time for Vercel Hobby

export default async function handler(req, res) {
  // 1. Validate QStash Request
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { jobId, userSession, prompt, requestedModel, messages, currentVfs } = req.body;
  if (!jobId || !userSession) return res.status(400).json({ error: 'Missing payload parameters' });

  const dbUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const dbToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url: dbUrl, token: dbToken });

  try {
    // 2. Mark job as actively processing in Redis
    await redis.set(`job_state:${jobId}`, JSON.stringify({ status: 'processing', logs: [], vfs: currentVfs }), { ex: 3600 });

    let updatedVfs = { ...currentVfs };
    let terminalLogs = [];

    // 3. Query the LLM Provider
    const aiRes = await fetch(process.env.OLLAMA_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OLLAMA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: requestedModel || "gpt-oss:20b",
        messages: messages,
        stream: false
      })
    });

    if (!aiRes.ok) throw new Error(`LLM Upstream Error: ${await aiRes.text()}`);
    const aiData = await aiRes.json();
    const aiReply = aiData.choices?.[0]?.message?.content || aiData.message?.content || "";

    // 4. Autonomous Interceptor: Parse [TOOL] Directives
    // Write Files
    const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
    let match;
    while ((match = writeRegex.exec(aiReply)) !== null) {
      updatedVfs[match[1]] = match[2].trim();
      terminalLogs.push(`[Worker] Wrote artifact: ${match[1]}`);
    }

    // Delete Files
    const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
    while ((match = delRegex.exec(aiReply)) !== null) {
      delete updatedVfs[match[1]];
      terminalLogs.push(`[Worker] Destroyed artifact: ${match[1]}`);
    }

    // Extract Exec Commands
    const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
    const execCommands = [];
    while ((match = execRegex.exec(aiReply)) !== null) {
      execCommands.push(match[1].trim());
    }

    // 5. Execute E2B Sandbox if terminal commands exist
    if (execCommands.length > 0 && process.env.E2B_API_KEY) {
      terminalLogs.push(`[Worker] Booting Firecracker MicroVM for ${execCommands.length} directive(s)...`);
      const sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
      
      // Mount the VFS into the MicroVM
      for (const [name, content] of Object.entries(updatedVfs)) {
        await sbx.files.write(name, content);
      }

      // Run commands sequentially
      for (const cmd of execCommands) {
        terminalLogs.push(`➜ ${cmd}`);
        const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
        if (execution.stdout) terminalLogs.push(execution.stdout);
        if (execution.stderr) terminalLogs.push(`[MicroVM Error]: ${execution.stderr}`);
      }

      // Sync any files mutated inside the VM back to the VFS
      try {
        const list = await sbx.files.list('.');
        for (const item of list) {
          if (item.type === 'file') {
            updatedVfs[item.name] = await sbx.files.read(item.name);
          }
        }
      } catch (ignore) {}
      await sbx.kill();
    }

    // 6. Save Final State to Redis for the Frontend to retrieve
    const finalState = {
      status: 'completed',
      reply: aiReply,
      vfs: updatedVfs,
      logs: terminalLogs
    };

    // Store the completed job data for 24 hours
    await redis.set(`job_state:${jobId}`, JSON.stringify(finalState), { ex: 86400 });

    // Respond to QStash to acknowledge successful execution
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("Worker Fault:", error);
    await redis.set(`job_state:${jobId}`, JSON.stringify({ status: 'failed', error: error.message }), { ex: 3600 });
    return res.status(500).json({ error: error.message });
  }
}