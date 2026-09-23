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

const RUNNERS = {
  python: { file: 'main.py', cmd: 'python3 main.py' },
  javascript: { file: 'index.js', cmd: 'node index.js' },
  cpp: { file: 'main.cpp', cmd: 'g++ -O2 main.cpp -o main && ./main' },
  c: { file: 'main.c', cmd: 'gcc -O2 main.c -o main && ./main' },
  java: { file: 'Main.java', cmd: 'javac Main.java && java Main' },
  bash: { file: 'script.sh', cmd: 'bash script.sh' }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. Enforce payload size limit (Max 100KB)
  if (!enforcePayloadLimit(req, 100000)) {
    return res.status(413).json({ error: 'Payload Limit Exceeded (Max 100KB)' });
  }

  const redis = getRedisClient();

  // 2. Zero-Trust Session Verification
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/compile');
    return res.status(auth.status).json({ error: auth.error });
  }

  // 3. Sliding IP Rate Limiting (20 compilations / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'compile', 20, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/compile');
    return res.status(rate.status).json({ error: rate.error });
  }

  const { language, code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'No valid source code provided.' });
  }

  if (!process.env.E2B_API_KEY) {
    auditLog('COMPILE_CONFIG_FAULT', req, 'E2B_API_KEY missing in environment');
    return res.status(500).json({ error: 'Cloud compiler infrastructure unconfigured.' });
  }

  const runner = RUNNERS[language ? language.toLowerCase() : 'python'] || RUNNERS.python;

  let sbx = null;
  try {
    sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
    await sbx.files.write(runner.file, code);

    const execution = await sbx.commands.run(runner.cmd, { timeoutMs: 15000 });

    const output = (execution.stdout || '') + (execution.stderr ? (execution.stdout ? '\n' : '') + execution.stderr : '');
    return res.status(200).json({
      output: output || '[Process exited cleanly with no output]',
      exitCode: execution.error ? 1 : 0
    });
  } catch (err) {
    auditLog('COMPILE_EXECUTION_FAULT', req, err.message);
    return res.status(500).json({ error: sanitizeError(err, 'Cloud compiler execution failed.') });
  } finally {
    if (sbx) await sbx.kill().catch(() => {});
  }
}