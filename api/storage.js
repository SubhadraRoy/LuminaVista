import path from 'path';
import { getSafeStorage } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog,
  sendSecureJson,
  setSecurityHeaders,
  scrubSecrets
} from './_lib/auth-guard.js';

export const maxDuration = 60;

function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  let decoded = userPath;
  try {
    decoded = decodeURIComponent(userPath);
  } catch (_) {
    return ''; // Malformed URI sequence is strictly rejected
  }
  while (decoded.includes('%')) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) {
      break;
    }
  }
  // Strictly reject control characters, null bytes, and newlines (CWE-20 / CWE-93)
  if (/[\x00-\x1f\x7f]/.test(decoded)) return '';

  const clean = decoded
    .replace(/\\/g, '/')
    .trim();
  if (clean.includes('..') || clean.includes('?') || clean.includes('#') || /[<>"';|&`$(){}]/.test(clean)) return '';
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    normalized.split('/').includes('..') ||
    normalized.includes('..') ||
    normalized.includes('?') ||
    normalized.includes('#')
  ) {
    return '';
  }

  // Strictly reject Windows reserved device names (CWE-22 / CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  const segments = normalized.split('/').filter(Boolean);
  const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  for (const seg of segments) {
    if (WINDOWS_RESERVED.test(seg)) return '';
  }

  return normalized;
}

export default async function handler(req, res) {
  res._req = req;
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' });

  try {
    // 1. Enforce payload limit (Max 250KB)
    if (!enforcePayloadLimit(req, 250000)) {
      return sendSecureJson(res, 413, { error: 'Payload Limit Exceeded' });
    }

  const redis = getSafeStorage();

  // 2. Zero-Trust Session Verification
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/storage');
    return sendSecureJson(res, auth.status, { error: auth.error });
  }

  // Enforce authenticated role requirement for storage mutations
  if (auth.role !== 'master' && auth.role !== 'temporary') {
    auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/storage');
    return sendSecureJson(res, 403, { error: 'Forbidden: Cloud storage access requires authenticated session' });
  }

  const { action, path: rawPath, content } = req.body || {};

  // HIGH-02: Deletion in global storage restricted strictly to master role
  if (action === 'delete' && auth.role !== 'master') {
    auditLog('INSUFFICIENT_PRIVILEGES', req, 'Action: delete requires master role');
    return sendSecureJson(res, 403, { error: 'Forbidden: Deleting storage files requires master role' });
  }

  // 3. Sliding IP Rate Limiting (30 operations / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'storage', 30, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/storage');
    return sendSecureJson(res, rate.status, { error: rate.error });
  }

  // 4. Input Validation & Path Traversal Sanitization (CWE-22 / Strix DAST)
  const cleanPath = sanitizeFilePath(rawPath);

  if (action !== 'list' && !cleanPath) {
    auditLog('SUSPICIOUS_PATH_TRAVERSAL', req, `Path: ${rawPath}`);
    return sendSecureJson(res, 400, { error: 'Invalid or illegal file path.' });
  }

  // Enforce root directory namespace scoping & isolate repository root assets
  const segments = cleanPath ? cleanPath.split('/').filter(Boolean) : [];
  const hasHiddenSegment = segments.some(seg => seg.startsWith('.'));
  const PROTECTED_PREFIXES = ['.github', '.git', '.env', 'node_modules', 'api', 'modules', 'tests', 'firmware'];
  const PROTECTED_ROOT_FILES = new Set([
    'package.json',
    'package-lock.json',
    'vercel.json',
    'readme.md',
    'dashboard.html',
    'index.html',
    '404.html'
  ]);
  const isProtectedAsset = hasHiddenSegment ||
    PROTECTED_PREFIXES.some(p => cleanPath.toLowerCase().startsWith(p.toLowerCase())) ||
    (segments.length === 1 && PROTECTED_ROOT_FILES.has(segments[0].toLowerCase()));

  if (isProtectedAsset) {
    auditLog('SUSPICIOUS_PATH_TRAVERSAL', req, `Path: ${rawPath}`);
    return sendSecureJson(res, 400, { error: 'Invalid or illegal file path: access to protected repository assets is prohibited.' });
  }

  const ghToken = process.env.GITHUB_STORAGE_TOKEN;
  const repo = process.env.GITHUB_STORAGE_REPO;
  if (!ghToken || !repo) {
    auditLog('STORAGE_CONFIG_FAULT', req, 'GitHub credentials missing');
    return sendSecureJson(res, 500, { error: 'Storage repository credentials unconfigured.' });
  }

  const STORAGE_NAMESPACE = 'user_vault';
  const targetPath = cleanPath
    ? (cleanPath.startsWith(`${STORAGE_NAMESPACE}/`) ? cleanPath : `${STORAGE_NAMESPACE}/${cleanPath}`)
    : (action === 'list' ? STORAGE_NAMESPACE : '');

  const baseUrl = `https://api.github.com/repos/${repo}/contents/${targetPath}`;
  const ghHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'LuminaVista-OS-Hardened'
  };

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
        message: `LuminaVista Commit: ${targetPath}`,
        content: Buffer.from(content || '').toString('base64'),
        sha: currentSha
      })
    });
    const putData = await putRes.json();
    if (!putRes.ok) return sendSecureJson(res, putRes.status, { error: sanitizeError(putData.message, 'Write failed.') });
    return sendSecureJson(res, 200, { success: true, sha: putData.content?.sha });
  }

  if (action === 'delete') {
    if (auth.role !== 'master') {
      auditLog('INSUFFICIENT_PRIVILEGES', req, 'Action: delete requires master role');
      return sendSecureJson(res, 403, { error: 'Forbidden: Deleting storage files requires master role' });
    }
    const checkRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!checkRes.ok) return sendSecureJson(res, 404, { error: 'File not found in storage.' });
      const currentSha = (await checkRes.json()).sha;

      const delRes = await fetch(baseUrl, {
        method: 'DELETE',
        headers: ghHeaders,
        body: JSON.stringify({ message: `LuminaVista Cleanup: ${targetPath}`, sha: currentSha })
      });
      return sendSecureJson(res, delRes.ok ? 200 : delRes.status, { success: delRes.ok });
    }

    if (action === 'list') {
      const gitRes = await fetch(baseUrl, { headers: ghHeaders });
      if (!gitRes.ok) return sendSecureJson(res, gitRes.status, { error: 'Failed to list storage directory.' });
      const data = await gitRes.json();
      const files = Array.isArray(data) ? data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size
      })) : [];
      return sendSecureJson(res, 200, { files });
    }

    return sendSecureJson(res, 400, { error: 'Unsupported action.' });
  } catch (error) {
    auditLog('STORAGE_UPSTREAM_FAULT', req, error.message);
    return sendSecureJson(res, 502, { error: sanitizeError(error, 'Storage upstream synchronization failure.') });
  }
}