import { Redis } from '@upstash/redis';
import { Sandbox } from '@e2b/code-interpreter';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export const maxDuration = 60;

// Initialize Cloudflare R2 Storage securely on the backend
const s3 = process.env.R2_ENDPOINT ? new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null;

async function performWebSearch(query) {
  try {
    const cleanQuery = query.replace(/[^\w\s-]/gi, ' ').trim().slice(0, 100);
    if (!cleanQuery) return null;
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const snippets = [];
    const snippetRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text) snippets.push(`- ${text}`);
    }
    return snippets.length > 0 ? snippets.join('\n\n') : null;
  } catch (err) { return null; }
}

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
  if (!url || !url.startsWith('http')) return res.status(500).json({ error: 'Redis configuration missing.' });

  try {
    const redis = new Redis({ url, token });
    const match = (req.headers.cookie || '').match(/godx_session=([^;]+)/);
    const sessionToken = match ? match[1] : null;

    if (!sessionToken || !(await redis.get(`session:${sessionToken}`))) {
      return res.status(401).json({ error: 'Session Expired.' });
    }
    await redis.expire(`session:${sessionToken}`, 1200);

    const { messages, prompt, requestedModel, webSearch, enableAgent } = req.body;
    const aiEndpoint = process.env.OLLAMA_ENDPOINT;
    const aiKey = process.env.OLLAMA_API_KEY || '';
    const activeModel = requestedModel || process.env.OLLAMA_MODEL || "gpt-oss:20b";

    if (!aiEndpoint) return res.status(500).json({ error: 'OLLAMA_ENDPOINT missing.' });

    let formattedMessages = Array.isArray(messages) && messages.length > 0 ? [...messages] : [{ role: 'user', content: prompt }];

    // Inject Autonomous Agent System Prompt if enabled
    if (enableAgent && process.env.E2B_API_KEY) {
      const agentDirective = `\n\n[AUTONOMOUS CLOUD AGENT ACTIVATED]\nYou have root access to an isolated Linux Virtual Machine and persistent Cloudflare R2 storage.\n1. To execute a bash terminal command, format exactly like this:\n<execute_terminal>npm install express</execute_terminal>\n2. To save a file permanently to the cloud, format exactly like this:\n<save_file path="server.js">const express = require('express');</save_file>\nYou may execute code, read directories, and build full applications.`;
      if (formattedMessages[0]?.role === 'system') formattedMessages[0].content += agentDirective;
      else formattedMessages.unshift({ role: 'system', content: agentDirective });
    }

    if (webSearch) {
      const lastUserMsg = [...formattedMessages].reverse().find(m => m.role === 'user');
      const searchQuery = lastUserMsg ? lastUserMsg.content : prompt;
      if (searchQuery) {
        const results = await performWebSearch(searchQuery);
        if (results) formattedMessages[0].content += `\n\n[WEB SEARCH RESULTS]:\n${results}`;
      }
    }

    const isNativeOllama = aiEndpoint.includes('/api/chat') || aiEndpoint.includes('/api/generate');
    const payload = {
      model: activeModel,
      messages: formattedMessages,
      stream: false,
      ...(isNativeOllama ? {} : { temperature: 0.7 })
    };

    const aiRes = await fetch(aiEndpoint, {
      method: "POST",
      headers: { 'Content-Type': 'application/json', ...(aiKey && { 'Authorization': `Bearer ${aiKey}` }) },
      body: JSON.stringify(payload),
    });

    if (!aiRes.ok) return res.status(aiRes.status).json({ error: `Upstream HTTP ${aiRes.status}`, details: await aiRes.text() });
    
    let data = await aiRes.json();
    let aiResponseText = data.choices?.[0]?.message?.content || data.message?.content || "";

    // INTERCEPT: Cloudflare R2 File Saving
    if (s3 && aiResponseText.includes('<save_file')) {
      const fileRegex = /<save_file path="([^"]+)">([\s\S]*?)<\/save_file>/g;
      let match;
      while ((match = fileRegex.exec(aiResponseText)) !== null) {
        const filePath = match[1];
        const fileContent = match[2];
        try {
          await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: filePath, Body: fileContent }));
          aiResponseText += `\n\n*[System: Successfully persisted \`${filePath}\` to Cloud Storage.]*`;
        } catch (err) {
          aiResponseText += `\n\n*[System: Failed to save \`${filePath}\` to Cloud. Check R2 buckets.]*`;
        }
      }
    }

    // INTERCEPT: E2B Terminal Execution
    if (process.env.E2B_API_KEY && aiResponseText.includes('<execute_terminal>')) {
      const termRegex = /<execute_terminal>([\s\S]*?)<\/execute_terminal>/g;
      let match;
      while ((match = termRegex.exec(aiResponseText)) !== null) {
        const command = match[1];
        try {
          const sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
          const result = await sandbox.commands.run(command);
          const output = result.stdout || result.stderr || "Command executed successfully (no output).";
          aiResponseText += `\n\n**Terminal Output:**\n\`\`\`bash\n${output}\n\`\`\``;
          await sandbox.kill();
        } catch (err) {
          aiResponseText += `\n\n**Terminal Error:**\n\`\`\`bash\n${err.message}\n\`\`\``;
        }
      }
    }

    // Reconstruct payload to send back modified text
    if (data.choices) data.choices[0].message.content = aiResponseText;
    else if (data.message) data.message.content = aiResponseText;

    return res.status(200).json(data);

  } catch (error) {
    console.error("AI ROUTE ERROR:", error);
    return res.status(502).json({ error: 'Gateway Connection Failure', details: error.message });
  }
}