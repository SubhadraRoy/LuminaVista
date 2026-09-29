// api/worker.js - Autonomous Cloud Task Worker & Offline Background Execution Engine
// Executes tasks in the cloud even when the user's PC is shut down.
// Auto-fails over across multi-key pools, drives E2B Firecracker MicroVM,
// and persists finished VFS artifacts and state in cloud storage.

import { Sandbox } from '@e2b/code-interpreter';
import { getRedisClient, getSafeStorage } from './_lib/redis.js';
import { sanitizeError, auditLog, validateSession } from './_lib/auth-guard.js';
import { executeWithFailover, getKeyPool, normalizeOllamaEndpoint, extractCompletionContent } from './_lib/key-pool.js';
import { jevGenerateBespokeResponse } from './_lib/jev-engine.js';
import { sanitizeProviderMessages } from './chat.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  const storage = getSafeStorage();

  // 1. GET Requests: Query job status, check completed jobs, or trigger due schedules
  if (req.method === 'GET') {
    const { jobId, action, userSession } = req.query || {};

    // Specific job lookup
    if (jobId) {
      try {
        const raw = await storage.get(`job_state:${jobId}`);
        if (!raw) return res.status(404).json({ error: 'Job not found' });
        const job = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return res.status(200).json({ success: true, job });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve job state' });
      }
    }

    // Check completed jobs for this user session
    if (action === 'check_completed' || action === 'pending') {
      try {
        const sess = userSession || 'sovereign_session';
        const rawIds = await storage.get(`user_jobs:${sess}`);
        const jobIds = rawIds ? (typeof rawIds === 'string' ? JSON.parse(rawIds) : rawIds) : [];
        const completedJobs = [];

        for (const id of jobIds) {
          const rawJob = await storage.get(`job_state:${id}`);
          if (rawJob) {
            const parsed = typeof rawJob === 'string' ? JSON.parse(rawJob) : rawJob;
            if (parsed.status === 'completed') {
              completedJobs.push({ jobId: id, ...parsed });
            }
          }
        }
        return res.status(200).json({ success: true, completedJobs });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to query completed jobs' });
      }
    }

    // Cron or heartbeat trigger to execute due schedules
    if (action === 'run_due_schedules') {
      try {
        const rawSchedules = await storage.get('cloud_scheduled_tasks');
        const schedules = rawSchedules ? (typeof rawSchedules === 'string' ? JSON.parse(rawSchedules) : rawSchedules) : [];
        const now = Date.now();
        const ranTasks = [];

        for (const task of schedules) {
          if (!task.enabled) continue;
          if (now >= (task.nextRunTime || 0)) {
            // Task is due! Run it autonomously in the cloud
            const autoJobId = `sched_${task.id}_${now}`;
            task.lastRun = now;
            task.nextRunTime = now + (task.intervalSeconds || 3600) * 1000;
            task.executionCount = (task.executionCount || 0) + 1;

            // Execute job
            await executeAutonomousCloudTask({
              jobId: autoJobId,
              prompt: task.prompt,
              messages: [{ role: 'user', content: `[SCHEDULED AUTONOMOUS TASK: ${task.name}]\n${task.prompt}` }],
              currentVfs: task.vfs || {},
              requestedModel: task.model || 'gpt-oss:20b',
              storage
            });
            ranTasks.push(task.name);
          }
        }

        await storage.set('cloud_scheduled_tasks', JSON.stringify(schedules), { ex: 86400 * 30 });
        return res.status(200).json({ success: true, executedCount: ranTasks.length, tasks: ranTasks });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to run due schedules' });
      }
    }

    return res.status(400).json({ error: 'Missing jobId or action parameter' });
  }

  // 2. POST Requests: Dispatch autonomous job or sync scheduled tasks
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { action, jobId, userSession, prompt, requestedModel, provider, messages, currentVfs, schedules } = req.body || {};

  // Action: Sync user's scheduled tasks to cloud
  if (action === 'sync_schedules') {
    if (!Array.isArray(schedules)) return res.status(400).json({ error: 'Invalid schedules payload' });
    try {
      await storage.set('cloud_scheduled_tasks', JSON.stringify(schedules), { ex: 86400 * 30 });
      if (userSession) {
        await storage.set(`user_schedules:${userSession}`, JSON.stringify(schedules), { ex: 86400 * 30 });
      }
      return res.status(200).json({ success: true, count: schedules.length });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to sync schedules' });
    }
  }

  // Dispatch background job
  if (!jobId) {
    return res.status(400).json({ error: 'Missing required worker parameters' });
  }

  const effectiveSession = userSession || 'sovereign_session';

  // Verify user session in Redis / SafeStorage
  const redis = getRedisClient();
  if (redis) {
    try {
      const active = await redis.get(`session:${userSession}`);
      if (!active && userSession && userSession !== 'sovereign_session') {
        auditLog('WORKER_UNAUTHORIZED', req, `Invalid userSession for job ${jobId}`);
        return res.status(401).json({ error: 'Unauthorized worker invocation' });
      }
    } catch (err) {
      // Graceful fallback for mock tests
    }
  }

  try {
    // Record job ID for user session
    const rawUserJobs = await storage.get(`user_jobs:${effectiveSession}`);
    const userJobs = rawUserJobs ? (typeof rawUserJobs === 'string' ? JSON.parse(rawUserJobs) : rawUserJobs) : [];
    if (!userJobs.includes(jobId)) {
      userJobs.push(jobId);
      await storage.set(`user_jobs:${effectiveSession}`, JSON.stringify(userJobs), { ex: 86400 * 7 });
    }

    // Execute the autonomous job in the cloud
    const result = await executeAutonomousCloudTask({
      jobId,
      prompt: prompt || (messages && messages[messages.length - 1]?.content) || 'Autonomous Task',
      messages: messages || [{ role: 'user', content: prompt || 'Autonomous Task' }],
      currentVfs: currentVfs || {},
      requestedModel: requestedModel || 'gpt-oss:20b',
      provider: provider || 'hybrid_pool',
      storage,
      req
    });

    return res.status(200).json({ success: true, jobId, ...result });

  } catch (error) {
    auditLog('WORKER_FAULT', req, error.message);
    const safeError = sanitizeError(error, 'Background execution failure');
    await storage.set(`job_state:${jobId}`, JSON.stringify({ status: 'failed', error: safeError }), { ex: 3600 });
    return res.status(500).json({ error: safeError });
  }
}

/**
 * Core Autonomous Cloud Task Execution Logic
 * Continues running on the cloud server even if client shuts down.
 */
async function executeAutonomousCloudTask({ jobId, prompt, messages, currentVfs, requestedModel, provider = 'hybrid_pool', storage, req = null }) {
  // Mark job as processing
  await storage.set(`job_state:${jobId}`, JSON.stringify({
    status: 'processing',
    startTime: Date.now(),
    prompt,
    logs: ['[Worker] Task dispatched to autonomous cloud engine...'],
    vfs: currentVfs
  }), { ex: 86400 });

  let updatedVfs = { ...currentVfs };
  let terminalLogs = [`[Worker] Autonomous processing initiated for Job ${jobId}`];
  let aiReply = '';

  const oPool = getKeyPool('ollama');
  const nPool = getKeyPool('nvidia');

  const makeOllamaFetch = async (apiKey) => {
    const configuredEndpoint = normalizeOllamaEndpoint(process.env.OLLAMA_ENDPOINT || 'https://ollama.com/v1/chat/completions');
    const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
    const payloadMessages = sanitizeProviderMessages(messages, prompt);
    let res = await fetch(configuredEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cleanKey ? { 'Authorization': `Bearer ${cleanKey}` } : {})
      },
      body: JSON.stringify({
        model: requestedModel || 'gpt-oss:20b',
        messages: payloadMessages,
        stream: false
      })
    });
    if (!res.ok && configuredEndpoint !== 'https://ollama.com/v1/chat/completions') {
      res = await fetch('https://ollama.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cleanKey ? { 'Authorization': `Bearer ${cleanKey}` } : {})
        },
        body: JSON.stringify({
          model: requestedModel || 'gpt-oss:20b',
          messages: payloadMessages,
          stream: false
        })
      });
    }
    return res;
  };

  const makeNvidiaFetch = async (apiKey) => {
    const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
    const payloadMessages = sanitizeProviderMessages(messages, prompt);
    return fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model: 'nvidia/llama-3.1-nemotron-70b-instruct',
        messages: payloadMessages,
        temperature: 0.6,
        max_tokens: 4096,
        stream: false
      })
    });
  };

  let failoverResult = null;
  if (oPool.length > 0) {
    failoverResult = await executeWithFailover({
      provider: 'ollama',
      makeRequest: makeOllamaFetch,
      maxCycles: 2
    });
  }

  if ((!failoverResult || !failoverResult.success) && nPool.length > 0) {
    failoverResult = await executeWithFailover({
      provider: 'nvidia',
      makeRequest: makeNvidiaFetch,
      maxCycles: 2
    });
  }

  if (failoverResult && failoverResult.success) {
    aiReply = failoverResult.content || extractCompletionContent(failoverResult.data) || '';
    terminalLogs.push(`[Worker] Generated autonomous output using ${failoverResult.keyMeta?.name || 'Cloud Pool'}`);
  } else {
    terminalLogs.push('[Worker] Using Jev Autonomous Synthesis Engine for offline completion...');
    aiReply = jevGenerateBespokeResponse(prompt, updatedVfs);
  }

  // 2. Parse and execute Tool Directives
  // Write file tool
  const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
  let match;
  while ((match = writeRegex.exec(aiReply)) !== null) {
    updatedVfs[match[1]] = match[2].trim();
    terminalLogs.push(`[Worker] Wrote artifact: ${match[1]}`);
  }

  // Delete file tool
  const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
  while ((match = delRegex.exec(aiReply)) !== null) {
    delete updatedVfs[match[1]];
    terminalLogs.push(`[Worker] Destroyed artifact: ${match[1]}`);
  }

  // Shell command execution in Firecracker MicroVM if available
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
    } catch (sbxErr) {
      terminalLogs.push(`[MicroVM Notice]: ${sbxErr.message}`);
    } finally {
      if (sbx) await sbx.kill().catch(() => {});
    }
  }

  // 3. Mark job as completed and persist to storage
  const finalState = {
    status: 'completed',
    jobId,
    prompt,
    reply: aiReply,
    vfs: updatedVfs,
    logs: terminalLogs,
    completedAt: Date.now()
  };

  await storage.set(`job_state:${jobId}`, JSON.stringify(finalState), { ex: 86400 * 7 });
  return finalState;
}