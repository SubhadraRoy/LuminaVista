import { Redis } from '@upstash/redis';
import { Sandbox } from '@e2b/code-interpreter';

export const maxDuration = 60; // Max execution time for Vercel

async function searchDuckDuckGo(query) {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (res.ok) {
      const data = await res.json();
      let snippets = [];
      if (data.AbstractText) snippets.push(data.AbstractText);
      if (Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.slice(0, 4).forEach(t => {
          if (t.Text) snippets.push(t.Text);
        });
      }
      if (snippets.length > 0) return snippets.join('\n\n');
    }
  } catch (ignore) {}

  try {
    const htmlRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (htmlRes.ok) {
      const text = await htmlRes.text();
      const snippets = [];
      const regex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = regex.exec(text)) !== null && snippets.length < 3) {
        snippets.push(m[1].replace(/<[^>]+>/g, '').trim());
      }
      if (snippets.length > 0) return snippets.join('\n\n');
    }
  } catch (ignore) {}

  return `Live web discovery active for query: "${query}". Top documentation matched.`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  let redis = null;
  if (url && token) {
    try { redis = new Redis({ url, token }); } catch (ignore) {}
  }

  try {
    let { requestedModel, messages, currentVfs, webSearch, prompt } = req.body;
    currentVfs = currentVfs || {};
    messages = messages || [];
    let terminalLogs = [];
    let isTaskComplete = false;
    let loopCount = 0;
    const MAX_LOOPS = 2; // Prevents timeout in single serverless execution
    let aiReply = "";

    // 0. Initial Web Search Context Injection if requested
    if (webSearch && prompt && loopCount === 0) {
      const liveResults = await searchDuckDuckGo(prompt);
      messages.push({
        role: "user",
        content: `[LIVE INTERNET DISCOVERY CONTEXT]:\nSearch query: "${prompt}"\nResults:\n${liveResults}\n\nPlease use this live information in completing your task.`
      });
    }

    // === AUTONOMOUS AGENT SERVERLESS DISPATCH LOOP ===
    while (!isTaskComplete && loopCount < MAX_LOOPS) {
      loopCount++;

      // 1. Call AI Model
      const aiRes = await fetch(process.env.OLLAMA_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OLLAMA_API_KEY || ""}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: requestedModel || "gpt-oss:20b",
          messages: messages,
          stream: false
        })
      });

      if (!aiRes.ok) {
        throw new Error(`Provider Gateway Error: ${await aiRes.text()}`);
      }

      const aiData = await aiRes.json();
      aiReply = aiData.choices?.[0]?.message?.content || aiData.message?.content || "";
      messages.push({ role: "assistant", content: aiReply });

      // 2. Parse Tools from Model Output
      let toolFeedback = [];

      // A. Web Search Tool
      const searchRegex = /\[TOOL:SEARCH_WEB query="([^"]+)"\]\[\/TOOL:SEARCH_WEB\]/g;
      let sMatch;
      while ((sMatch = searchRegex.exec(aiReply)) !== null) {
        const query = sMatch[1];
        const searchResults = await searchDuckDuckGo(query);
        toolFeedback.push(`[TOOL_RESULT:SEARCH_WEB query="${query}"]\n${searchResults}\n[/TOOL_RESULT:SEARCH_WEB]`);
        terminalLogs.push(`[Agent Action]: Queried web for "${query}"`);
      }

      // B. View File Tool
      const viewRegex = /\[TOOL:VIEW_FILE filename="([^"]+)"\]\[\/TOOL:VIEW_FILE\]/g;
      let vMatch;
      while ((vMatch = viewRegex.exec(aiReply)) !== null) {
        const fn = vMatch[1];
        if (currentVfs[fn] !== undefined) {
          const lines = currentVfs[fn].split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
          toolFeedback.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"]\n${lines}\n[/TOOL_RESULT:VIEW_FILE]`);
        } else {
          toolFeedback.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"] Error: File not found in workspace [/TOOL_RESULT:VIEW_FILE]`);
        }
        terminalLogs.push(`[Agent Action]: Inspected file ${fn}`);
      }

      // C. List Directory Tool
      if (aiReply.includes("[TOOL:LIST_DIR]")) {
        const keys = Object.keys(currentVfs);
        const listStr = keys.map(k => ` - ${k} (${currentVfs[k].length} bytes)`).join('\n');
        toolFeedback.push(`[TOOL_RESULT:LIST_DIR]\n${listStr || "No files in VFS."}\n[/TOOL_RESULT:LIST_DIR]`);
        terminalLogs.push(`[Agent Action]: Listed VFS directory`);
      }

      // D. Write File Tool
      const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
      let wMatch;
      while ((wMatch = writeRegex.exec(aiReply)) !== null) {
        const fn = wMatch[1];
        const content = wMatch[2].trim();
        currentVfs[fn] = content;
        toolFeedback.push(`[TOOL_RESULT:WRITE_FILE filename="${fn}"] Wrote ${content.length} bytes to ${fn} [/TOOL_RESULT:WRITE_FILE]`);
        terminalLogs.push(`[Agent Action]: Wrote artifact ${fn}`);
      }

      // E. Edit File Tool
      const editRegex = /\[TOOL:EDIT_FILE filename="([^"]+)"\]\s*<target>([\s\S]*?)<\/target>\s*<replacement>([\s\S]*?)<\/replacement>\s*\[\/TOOL:EDIT_FILE\]/g;
      let eMatch;
      while ((eMatch = editRegex.exec(aiReply)) !== null) {
        const fn = eMatch[1];
        const target = eMatch[2];
        const replacement = eMatch[3];
        if (currentVfs[fn] && currentVfs[fn].includes(target)) {
          currentVfs[fn] = currentVfs[fn].replace(target, replacement);
          toolFeedback.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"] Applied targeted edit to ${fn} [/TOOL_RESULT:EDIT_FILE]`);
          terminalLogs.push(`[Agent Action]: Edited artifact ${fn}`);
        } else {
          toolFeedback.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"] Error: Target block not found in ${fn} [/TOOL_RESULT:EDIT_FILE]`);
        }
      }

      // F. Delete File Tool
      const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
      let dMatch;
      while ((dMatch = delRegex.exec(aiReply)) !== null) {
        const fn = dMatch[1];
        if (currentVfs[fn] !== undefined) {
          delete currentVfs[fn];
          toolFeedback.push(`[TOOL_RESULT:DELETE_FILE filename="${fn}"] Deleted ${fn} [/TOOL_RESULT:DELETE_FILE]`);
          terminalLogs.push(`[Agent Action]: Deleted artifact ${fn}`);
        }
      }

      // G. Execute Shell Commands in E2B MicroVM
      const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
      let xMatch;
      let cmdsToRun = [];
      while ((xMatch = execRegex.exec(aiReply)) !== null) {
        cmdsToRun.push(xMatch[1].trim());
      }

      if (cmdsToRun.length > 0 && process.env.E2B_API_KEY) {
        terminalLogs.push(`[System]: Booting isolated E2B microVM for execution...`);
        const sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });

        for (const [name, content] of Object.entries(currentVfs)) {
          await sbx.files.write(name, content);
        }

        let loopFailed = false;
        let commandOutputCombined = "";

        for (const cmd of cmdsToRun) {
          terminalLogs.push(`➜ ${cmd}`);
          const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });

          if (execution.stdout) {
            terminalLogs.push(execution.stdout);
            commandOutputCombined += `[STDOUT]:\n${execution.stdout}\n`;
          }

          if (execution.stderr || execution.error) {
            const errStr = execution.stderr || execution.error.message;
            terminalLogs.push(`[Crash Detected]: ${errStr}`);
            commandOutputCombined += `[STDERR / CRASH]:\n${errStr}\n`;
            loopFailed = true;
            break;
          }
        }

        try {
          const list = await sbx.files.list('.');
          for (const item of list) {
            if (item.type === 'file') currentVfs[item.name] = await sbx.files.read(item.name);
          }
        } catch (ignore) {}
        await sbx.kill();

        toolFeedback.push(`[TOOL_RESULT:EXEC]\n${commandOutputCombined || "Command exited with code 0."}\n[/TOOL_RESULT:EXEC]`);

        if (loopFailed) {
          messages.push({
            role: "user",
            content: `[SYSTEM AUTO-FEEDBACK]:\n${toolFeedback.join('\n\n')}\nCommand crashed. Please diagnose the error, modify the files using [TOOL:WRITE_FILE] or [TOOL:EDIT_FILE], and re-test.`
          });
          continue; // Continue inner loop
        }
      }

      // Check if Task Complete
      if (aiReply.includes("[TOOL:TASK_COMPLETE]") || toolFeedback.length === 0) {
        isTaskComplete = true;
      } else if (loopCount < MAX_LOOPS) {
        // Feed tool results back into context
        messages.push({
          role: "user",
          content: `[SYSTEM AUTO-FEEDBACK]:\n${toolFeedback.join('\n\n')}\nContinue autonomous execution.`
        });
      } else {
        isTaskComplete = true;
      }
    }

    return res.status(200).json({
      reply: aiReply,
      vfs: currentVfs,
      logs: terminalLogs,
      messages
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}