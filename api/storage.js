import path from 'path';
import { getRedisClient } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog,
  sendSecureJson,
  scrubSecrets
} from './_lib/auth-guard.js';

export const maxDuration = 60;

function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  // Normalize, remove null bytes, and strictly block directory traversal escapes
  const clean = userPath
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .trim();
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    return '';
  }
  return normalized;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' });

  // 1. Enforce payload limit (Max 250KB)
  if (!enforcePayloadLimit(req, 250000)) {
    return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded' });
  }

  const redis = getRedisClient();

  // 2. Zero-Trust Session Verification
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/storage');
    return sendSecureJson(res, auth.status, { error: auth.error });
  }

  // Enforce master role requirement for storage mutations
  if (auth.role !== 'master') {
    auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/storage - requires master role');
    return sendSecureJson(res, 403, { error: 'Forbidden: Cloud storage access requires master role' });
  }

  // 3. Sliding IP Rate Limiting (30 operations / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'storage', 30, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/storage');
    return sendSecureJson(res, rate.status, { error: rate.error });
  }

  const ghToken = process.env.GITHUB_STORAGE_TOKEN;
  const repo = process.env.GITHUB_STORAGE_REPO;
  if (!ghToken || !repo) {
    auditLog('STORAGE_CONFIG_FAULT', req, 'GitHub credentials missing');
    return sendSecureJson(res, 500, { error: 'Storage repository credentials unconfigured.' });
  }

  const { action, path: rawPath, content } = req.body || {};
  const cleanPath = sanitizeFilePath(rawPath);

  if (action !== 'list' && !cleanPath) {
    auditLog('SUSPICIOUS_PATH_TRAVERSAL', req, `Path: ${rawPath}`);
    return sendSecureJson(res, 400, { error: 'Invalid or illegal file path.' });
  }

  const baseUrl = `https://api.github.com/repos/${repo}/contents/${cleanPath}`;
  const ghHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LuminaVista-OS-Hardened'
  };

  try {
    if (action === 'read') {
      const gitRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!gitRes.ok) return sendSecureJson(res, gitRes.status, { error: 'File not found in storage.' });
      const data = await gitRes.json();
      const decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');
      return sendSecureJson(res, 200, { content: decodedContent });
    }

    if (action === 'write') {
      let currentSha = undefined;
      const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (checkRes.ok) {
        currentSha = (await checkRes.json()).sha;
      }

      const putRes = await fetch(baseUrl, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: `LuminaVista Commit: ${cleanPath}`,
          content: Buffer.from(content || '').toString('base64'),
          sha: currentSha
        })
      });
      const putData = await putRes.json();
      if (!putRes.ok) return sendSecureJson(res, putRes.status, { error: sanitizeError(putData.message, 'Write failed.') });
      return sendSecureJson(res, 200, { success: true, sha: putData.content?.sha });
    }

    if (action === 'delete') {
      const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!checkRes.ok) return sendSecureJson(res, 404, { error: 'File not found in storage.' });
      const currentSha = (await checkRes.json()).sha;

      const delRes = await fetch(baseUrl, {
        method: 'DELETE',
        headers: ghHeaders,
        body: JSON.stringify({ message: `LuminaVista Cleanup: ${cleanPath}`, sha: currentSha })
      });
      return sendSecureJson(res, delRes.ok ? 200 : delRes.status, { success: delRes.ok });
    }

    return sendSecureJson(res, 400, { error: 'Unsupported action.' });
  } catch (error) {
    auditLog('STORAGE_UPSTREAM_FAULT', req, error.message);
    return sendSecureJson(res, 502, { error: sanitizeError(error, 'Storage upstream synchronization failure.') });
  }
}