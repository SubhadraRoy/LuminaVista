import { Redis } from '@upstash/redis';
import { Sandbox } from '@e2b/code-interpreter';

export const maxDuration = 60; // Max execution time for Vercel Hobby

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url, token });

  try {
    let { requestedModel, messages, currentVfs } = req.body;
    let terminalLogs = [];
    let isTaskComplete = false;
    let loopCount = 0;
    const MAX_LOOPS = 2; // Prevents infinite looping within Vercel's 60s timeout
    let aiReply = "";

    // === THE AUTONOMOUS EXECUTION LOOP ===
    while (!isTaskComplete && loopCount < MAX_LOOPS) {
      loopCount++;
      
      // 1. Ask LLM
      const aiRes = await fetch(process.env.OLLAMA_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OLLAMA_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: requestedModel || "gpt-oss:20b", messages: messages, stream: false })
      });

      if (!aiRes.ok) throw new Error(`Provider Error: ${await aiRes.text()}`);
      const aiData = await aiRes.json();
      aiReply = aiData.choices?.[0]?.message?.content || aiData.message?.content || "";
      
      messages.push({ role: "assistant", content: aiReply });

      // 2. Parse Tool Executions from AI response
      let hasTerminalExec = false;
      const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
      const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
      
      let match;
      while ((match = writeRegex.exec(aiReply)) !== null) {
        currentVfs[match[1]] = match[2].trim();
        terminalLogs.push(`[Agent Action]: Wrote artifact ${match[1]}`);
      }

      let cmdsToRun = [];
      while ((match = execRegex.exec(aiReply)) !== null) {
        cmdsToRun.push(match[1].trim());
        hasTerminalExec = true;
      }

      // 3. E2B MicroVM Execution & Auto-Fixing
      if (hasTerminalExec && process.env.E2B_API_KEY) {
        terminalLogs.push(`[System]: Booting isolated E2B microVM for execution...`);
        const sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
        
        // Inject current files into the VM
        for (const [name, content] of Object.entries(currentVfs)) {
          await sbx.files.write(name, content);
        }

        let loopFailed = false;
        let systemFeedback = "";

        // Run commands
        for (const cmd of cmdsToRun) {
          terminalLogs.push(`➜ ${cmd}`);
          const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
          
          if (execution.stdout) terminalLogs.push(execution.stdout);
          
          // AUTONOMOUS FEEDBACK: If command crashes, inject error back to AI
          if (execution.stderr || execution.error) {
            terminalLogs.push(`[Crash Detected]: ${execution.stderr || execution.error.message}`);
            systemFeedback += `Command '${cmd}' failed with error:\n${execution.stderr}\nPlease analyze this error, rewrite the required files using [TOOL:WRITE_FILE], and run the command again using [TOOL:EXEC].`;
            loopFailed = true;
            break; 
          }
        }

        // Sync files back in case the VM modified them
        try {
          const list = await sbx.files.list('.');
          for (const item of list) {
            if (item.type === 'file') currentVfs[item.name] = await sbx.files.read(item.name);
          }
        } catch (ignore) {}
        await sbx.kill();

        // If loop failed, restart the while-loop without user input
        if (loopFailed) {
          terminalLogs.push(`[System]: Initiating autonomous self-correction loop...`);
          messages.push({ role: "user", content: `[SYSTEM AUTO-FEEDBACK]:\n${systemFeedback}` });
        } else {
          isTaskComplete = true; // Success! Exit loop.
        }
      } else {
        isTaskComplete = true; // No terminal commands needed. Exit loop.
      }
    }

    return res.status(200).json({ reply: aiReply, vfs: currentVfs, logs: terminalLogs, messages });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}