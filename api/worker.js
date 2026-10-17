// api/worker.js - Autonomous Cloud Task Worker & Offline Background Execution Engine
// Executes tasks in the cloud even when the user's PC is shut down.
// Auto-fails over across multi-key pools, drives E2B Firecracker MicroVM,
// and persists finished VFS artifacts and state in cloud storage.

import { Sandbox } from '@e2b/code-interpreter';
import { getRedisClient, getSafeStorage } from './_lib/redis.js';
import { sanitizeError, auditLog, validateSession, sendSecureJson, scrubSecrets, sanitizeDeep, setSecurityHeaders, checkRateLimit, enforcePayloadLimit, sanitizeFilePath } from './_lib/auth-guard.js';
import { executeWithFailover, getKeyPool, normalizeOllamaEndpoint, extractCompletionContent } from './_lib/key-pool.js';
import { jevGenerateBespokeResponse, inspectJevCommandSafety } from './_lib/jev-engine.js';
import { sanitizeProviderMessages } from './chat.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res._req = req;
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const storage = getSafeStorage();

    // 1. Rate limiting & payload limit
    const rateLimit = await checkRateLimit(req, storage, 'worker', 60, 60);
    if (rateLimit && !rateLimit.allowed) {
      return sendSecureJson(res, 429, { error: rateLimit.error || 'Rate limit exceeded' }, req);
    }

    if (!enforcePayloadLimit(req, 250000)) {
      return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded' }, req);
    }

    const auth = await validateSession(req, storage);
    if (!auth.valid) {
      auditLog('WORKER_UNAUTHORIZED', req, 'Endpoint: /api/worker');
      return sendSecureJson(res, auth.status || 401, { error: auth.error });
    }

    // Enforce authenticated role requirement for background worker execution
    if (auth.role !== 'master' && auth.role !== 'temporary') {
      auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/worker');
      return sendSecureJson(res, 403, { error: 'Forbidden: Background worker execution requires authenticated session' });
    }

    // 1. GET Requests: Query job status, check completed jobs, or trigger due schedules
    if (req.method === 'GET') {
      const { jobId, action, userSession } = req.query || {};

      // Specific job lookup
      if (jobId) {
        try {
          const raw = await storage.get(`job_state:${jobId}`);
          if (!raw) return sendSecureJson(res, 404, { error: 'Job not found' });
          const job = typeof raw === 'string' ? JSON.parse(raw) : raw;

          // Enforce session ownership (BOLA prevention - HIGH-01)
          const isOwner = auth.role === 'master' || (Boolean(job.ownerSessionId) && job.ownerSessionId === auth.sessionId);
          if (!isOwner) {
            auditLog('WORKER_BOLA_BLOCKED', req, `Session ${auth.sessionId} attempted access to Job ${jobId}`);
            return sendSecureJson(res, 403, { error: 'Forbidden: Access to this job is restricted to the job creator.' });
          }

          return sendSecureJson(res, 200, { success: true, job });
        } catch (err) {
          return sendSecureJson(res, 500, { error: 'Failed to retrieve job state' });
        }
      }

    // Check completed jobs for this user session
    if (action === 'check_completed' || action === 'pending') {
      try {
        const sess = auth.sessionId || userSession || 'sovereign_session';
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
        return sendSecureJson(res, 200, { success: true, completedJobs });
      } catch (err) {
        return sendSecureJson(res, 500, { error: 'Failed to query completed jobs' });
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
              storage,
              ownerRole: 'master',
              ownerSessionId: 'system_master_scheduler'
            });
            ranTasks.push(task.name);
          }
        }

        await storage.set('cloud_scheduled_tasks', JSON.stringify(schedules), { ex: 86400 * 30 });
        return sendSecureJson(res, 200, { success: true, executedCount: ranTasks.length, tasks: ranTasks });
      } catch (err) {
        return sendSecureJson(res, 500, { error: 'Failed to run due schedules' });
      }
    }

    return sendSecureJson(res, 400, { error: 'Missing jobId or action parameter' });
  }

  // 2. POST Requests: Dispatch autonomous job or sync scheduled tasks
  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' });

  const { action, jobId, userSession, prompt, requestedModel, provider, messages, currentVfs, schedules } = req.body || {};

  // Action: Sync user's scheduled tasks to cloud (HIGH-07)
  if (action === 'sync_schedules') {
    if (auth.role !== 'master') {
      auditLog('INSUFFICIENT_PRIVILEGES', req, 'Action: sync_schedules requires master role');
      return sendSecureJson(res, 403, { error: 'Forbidden: Schedule management requires master role' });
    }
    if (!Array.isArray(schedules)) return sendSecureJson(res, 400, { error: 'Invalid schedules payload' });
    try {
      await storage.set('cloud_scheduled_tasks', JSON.stringify(schedules), { ex: 86400 * 30 });
      if (userSession) {
        await storage.set(`user_schedules:${userSession}`, JSON.stringify(schedules), { ex: 86400 * 30 });
      }
      return sendSecureJson(res, 200, { success: true, count: schedules.length });
    } catch (err) {
      return sendSecureJson(res, 500, { error: 'Failed to sync schedules' });
    }
  }

  // Dispatch background job
  if (!jobId) {
    return sendSecureJson(res, 400, { error: 'Missing required worker parameters' });
  }

  const effectiveSession = auth.sessionId || userSession || 'sovereign_session';

  // Verify user session in Redis / SafeStorage
  const redis = getRedisClient();
  if (redis) {
    try {
      const active = await redis.get(`session:${userSession}`);
      if (!active && userSession && userSession !== 'sovereign_session') {
        auditLog('WORKER_UNAUTHORIZED', req, `Invalid userSession for job ${jobId}`);
        return sendSecureJson(res, 401, { error: 'Unauthorized worker invocation' });
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
      req,
      ownerSessionId: auth.sessionId,
      ownerRole: auth.role
    });

    return sendSecureJson(res, 200, { success: true, jobId, ...result });

  } catch (error) {
    auditLog('WORKER_FAULT', req, error.message);
    const safeError = sanitizeError(error, 'Background execution failure');
    await storage.set(`job_state:${jobId}`, JSON.stringify({
      status: 'failed',
      ownerSessionId: auth.sessionId,
      ownerRole: auth.role,
      error: safeError
    }), { ex: 3600 });
    return sendSecureJson(res, 500, { error: safeError });
  }
  } catch (err) {
    auditLog('WORKER_UNHANDLED_EXCEPTION', req, err.message);
    return sendSecureJson(res, 500, { error: sanitizeError(err.message || 'Internal server error') });
  }
}

/**
 * Core Autonomous Cloud Task Execution Logic
 * Continues running on the cloud server even if client shuts down.
 */
async function executeAutonomousCloudTask({ jobId, prompt, messages, currentVfs, requestedModel, provider = 'hybrid_pool', storage, req = null, ownerSessionId = '', ownerRole = '' }) {
  // Mark job as processing
  await storage.set(`job_state:${jobId}`, JSON.stringify({
    status: 'processing',
    startTime: Date.now(),
    prompt,
    ownerSessionId,
    ownerRole,
    logs: ['[Worker] Task dispatched to autonomous cloud engine...'],
    vfs: currentVfs
  }), { ex: 86400 });

  let updatedVfs = Object.create(null);
  if (currentVfs && typeof currentVfs === 'object') {
    for (const [k, v] of Object.entries(currentVfs)) {
      if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') {
        updatedVfs[k] = v;
      }
    }
  }
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
    const nModel = (requestedModel && requestedModel.includes('/') && (requestedModel.startsWith('nvidia/') || requestedModel.startsWith('meta/')))
      ? requestedModel
      : 'meta/llama-3.3-70b-instruct';
    return fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cleanKey}`
      },
      body: JSON.stringify({
        model: nModel,
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
    const fn = match[1];
    if (fn === '__proto__' || fn === 'constructor' || fn === 'prototype') continue;
    updatedVfs[fn] = match[2].trim();
    terminalLogs.push(`[Worker] Wrote artifact: ${fn}`);
  }

  // Delete file tool
  const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
  while ((match = delRegex.exec(aiReply)) !== null) {
    const fn = match[1];
    if (fn === '__proto__' || fn === 'constructor' || fn === 'prototype') continue;
    delete updatedVfs[fn];
    terminalLogs.push(`[Worker] Destroyed artifact: ${fn}`);
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
        const safeName = sanitizeFilePath(name);
        if (safeName) {
          await sbx.files.write(safeName, content);
        }
      }

      for (const cmd of execCommands) {
        const safety = inspectJevCommandSafety(cmd);
        if (!safety.safe) {
          terminalLogs.push(`🛡️ [Jev Guardrail]: Blocked destructive command: ${cmd} (${safety.threatCategory})`);
          continue;
        }
        terminalLogs.push(`➜ ${cmd}`);
        const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
        if (execution.stdout) terminalLogs.push(execution.stdout);
        if (execution.stderr) terminalLogs.push(`[MicroVM Error]: ${sanitizeError(execution.stderr)}`);
      }

      try {
        const list = await sbx.files.list('.');
        for (const item of list) {
          if (item.type === 'file' && item.name !== '__proto__' && item.name !== 'constructor' && item.name !== 'prototype') {
            updatedVfs[item.name] = await sbx.files.read(item.name);
          }
        }
      } catch (ignore) {}
    } catch (sbxErr) {
      terminalLogs.push(`[MicroVM Notice]: ${sanitizeError(sbxErr.message)}`);
    } finally {
      if (sbx) await sbx.kill().catch(() => {});
    }
  }

  // 3. Mark job as completed and persist to storage
  const rawFinalState = {
    status: 'completed',
    jobId,
    prompt,
    ownerSessionId,
    ownerRole,
    reply: aiReply,
    vfs: updatedVfs,
    logs: terminalLogs,
    completedAt: Date.now()
  };

  const finalState = sanitizeDeep(rawFinalState);

  await storage.set(`job_state:${jobId}`, JSON.stringify(finalState), { ex: 86400 * 7 });
  return finalState;
}