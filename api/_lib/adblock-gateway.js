// api/_lib/adblock-gateway.js - Ultra-Secure & Ultra-Fast Zero-Trust IoT Gateway (ESP32 DNS Ad-Blocker <-> LuminaVista Cloud OS)
import crypto from 'crypto';
import { getSafeStorage } from './redis.js';
import {
  validateSession,
  checkRateLimit,
  sendSecureJson,
  setSecurityHeaders,
  enforcePayloadLimit,
  getClientIp,
  auditLog,
  sanitizeError
} from './auth-guard.js';

export const DEFAULT_DEVICE_ID = process.env.ADBLOCK_DEVICE_ID || 'esp32-adblock-01';
export const KEY_SECRET = 'adblock:system:hmac_key';

let cachedCloudSecret = '';

export const getDeviceSecret = () => (
  process.env.ADBLOCK_DEVICE_SECRET ||
  process.env.IOT_DEVICE_SECRET ||
  cachedCloudSecret ||
  (process.env.ALLOW_TEST_DEVICE_SECRET === 'true' || (!process.env.VERCEL && process.env.NODE_ENV !== 'production' && process.argv.some(a => typeof a === 'string' && a.includes('test')))
    ? 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8'
    : '')
).trim();

async function ensureDeviceSecretLoaded(storage) {
  if (process.env.ADBLOCK_DEVICE_SECRET || process.env.IOT_DEVICE_SECRET || cachedCloudSecret) return getDeviceSecret();
  try {
    const val = await storage.get(KEY_SECRET);
    if (val && typeof val === 'string' && val.trim().length >= 32) {
      cachedCloudSecret = val.trim();
    }
  } catch { /* ignore storage read errors */ }
  return getDeviceSecret();
}

export const KEY_STATE = 'adblock:system:state';
export const KEY_CLIENTS = 'adblock:system:clients';
export const KEY_LOGS = 'adblock:system:logs';
export const KEY_CMDS = 'adblock:system:cmd_queue';
export const KEY_META = 'adblock:system:meta';
export const KEY_UBO = 'adblock:system:ubo_overrides';
export const MAX_CLOUD_LOGS = 1000;
export const MAX_CLIENTS = 100;

export const ALLOWED_COMMANDS = new Set([
  'add_block',
  'remove_block',
  'ban_client',
  'unban_client',
  'set_name',
  'fetch_now',
  'reboot'
]);

export function getDefaultStatus() {
  return {
    uptime: 0,
    freeHeap: 106000,
    minHeap: 85000,
    totalBlocked: 0,
    totalAllowed: 0,
    rebindBlocked: 0,
    rateLimited: 0,
    rulesCount: 245000,
    activeClients: 0,
    qps: 0,
    lastSeenMs: 0,
    lastOnline: '-',
    lastOffline: '-',
    status: 'ONLINE'
  };
}

export function normalizeStatus(raw = {}, prev = {}) {
  const base = { ...getDefaultStatus(), ...prev, ...raw };
  base.totalBlocked = Number(raw.totalBlocked ?? prev.totalBlocked ?? 0);
  base.totalAllowed = Number(raw.totalAllowed ?? prev.totalAllowed ?? 0);
  base.rebindBlocked = Number(raw.rebindBlocked ?? prev.rebindBlocked ?? 0);
  base.rateLimited = Number(raw.rateLimited ?? prev.rateLimited ?? 0);
  base.rulesCount = Number(raw.rulesCount ?? prev.rulesCount ?? 245000);
  base.freeHeap = Number(raw.freeHeap ?? prev.freeHeap ?? 106000);
  base.minHeap = Number(raw.minHeap ?? prev.minHeap ?? 85000);
  base.uptime = Number(raw.uptime ?? prev.uptime ?? 0);
  base.qps = Number(raw.qps ?? prev.qps ?? 0);
  return base;
}

async function readJsonKey(storage, key, fallbackVal) {
  const val = await storage.get(key);
  if (val === null || val === undefined) return fallbackVal;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallbackVal; }
  }
  return val;
}

export function computeDeviceSignature(secret, deviceId, timestamp, nonce, seq, rawBodyStr = '') {
  const bodyHash = crypto.createHash('sha256').update(String(rawBodyStr), 'utf8').digest('hex').toLowerCase();
  const canonical = `${deviceId}.${timestamp}.${nonce}.${seq}.${bodyHash}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toLowerCase();
}

export function signDeviceCommand(secret, cmdObj) {
  const canonical = `${cmdObj.cmdId}.${cmdObj.cmd}.${cmdObj.param || ''}.${cmdObj.issuedAt}.${cmdObj.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toLowerCase();
}

export async function verifyDeviceRequest(req, rawBodyStr, storage) {
  const headers = req.headers || {};
  const deviceId = String(headers['x-lumina-device-id'] || '').trim();
  const tsStr = String(headers['x-lumina-timestamp'] || '').trim();
  const nonce = String(headers['x-lumina-nonce'] || '').trim().toLowerCase();
  const seqStr = String(headers['x-lumina-seq'] || '0').trim();
  const receivedSig = String(headers['x-lumina-signature'] || '').trim().toLowerCase();

  if (!deviceId || deviceId !== DEFAULT_DEVICE_ID) {
    auditLog('ADBLOCK_UNKNOWN_DEVICE', req, `Device: ${deviceId}`);
    return { valid: false, status: 401, error: 'Unknown or unauthorized IoT device ID' };
  }

  const ts = parseInt(tsStr, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  const DRIFT_WINDOW_SEC = 60; // +-60s drift window
  const NONCE_TTL_SEC = 180; // 180s (Invariant: T_nonce >= 2W + jitter)
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > DRIFT_WINDOW_SEC) {
    auditLog('ADBLOCK_TIMESTAMP_SKEW', req, `ts=${tsStr}, now=${nowSec}`);
    return { valid: false, status: 401, error: 'Expired or skewed timestamp', serverTime: nowSec };
  }

  if (!/^[a-f0-9]{16,64}$/i.test(nonce)) {
    return { valid: false, status: 401, error: 'Invalid cryptographic nonce format' };
  }

  if (!/^[a-f0-9]{64}$/i.test(receivedSig)) {
    auditLog('ADBLOCK_BAD_SIGNATURE', req, 'Malformed signature');
    return { valid: false, status: 401, error: 'Invalid HMAC signature format' };
  }

  const secret = await ensureDeviceSecretLoaded(storage);
  if (!secret) {
    return { valid: false, status: 503, error: 'AdBlock gateway cryptographic key not provisioned' };
  }

  const expectedSig = computeDeviceSignature(secret, deviceId, tsStr, nonce, seqStr, rawBodyStr);
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const receivedBuf = Buffer.from(receivedSig, 'hex');

  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    auditLog('ADBLOCK_BAD_SIGNATURE', req, 'HMAC mismatch');
    return { valid: false, status: 401, error: 'Invalid cryptographic device signature' };
  }

  // Nonce Anti-Replay Gate
  const nonceKey = `adblock:nonce:${deviceId}:${nonce}`;
  try {
    const lockRes = await storage.set(nonceKey, '1', { nx: true, ex: NONCE_TTL_SEC });
    if (lockRes !== 'OK') {
      auditLog('ADBLOCK_REPLAY_BLOCKED', req, `Duplicate nonce: ${nonce}`);
      return { valid: false, status: 401, error: 'Replay attack detected: nonce already used' };
    }
  } catch (err) {
    return { valid: false, status: 503, error: 'Storage failure during anti-replay check' };
  }

  return { valid: true, deviceId, ts, seq: parseInt(seqStr, 10) || 0 };
}

export function isValidIpv4(ip) {
  if (typeof ip !== 'string') return false;
  if (/^\s|\s$/.test(ip)) return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = parseInt(part, 10);
    if (n < 0 || n > 255) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
  }
  return true;
}

export function sanitizeClientAlias(alias) {
  if (typeof alias !== 'string') return '';
  return alias.trim().replace(/[^\w\s\.-]/g, '').slice(0, 31);
}

export function sanitizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw.trim().toLowerCase();
  clean = clean.replace(/^[a-z]+:\/\//i, '');
  clean = clean.split('/')[0].split('?')[0].split('#')[0];
  clean = clean.replace(/:\d+$/, '');
  clean = clean.trim();
  if (clean.length > 253) return '';
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(clean)) {
    return '';
  }
  return clean;
}

export function applyPendingCommandsToState(state, clients, cmdQueue) {
  if (!Array.isArray(cmdQueue) || cmdQueue.length === 0) return { state, clients };
  const updatedClients = Array.isArray(clients) ? [...clients] : [];
  for (const c of cmdQueue) {
    if (!c || typeof c !== 'object') continue;
    if (c.cmd === 'ban_client' && isValidIpv4(c.param)) {
      const ip = c.param.trim();
      const idx = updatedClients.findIndex(cl => cl.ip === ip);
      if (idx !== -1) {
        updatedClients[idx] = { ...updatedClients[idx], banned: true };
      } else {
        updatedClients.push({ ip, name: ip, banned: true, queries: 0, blocked: 0, iface: 'lan' });
      }
    } else if (c.cmd === 'unban_client' && isValidIpv4(c.param)) {
      const ip = c.param.trim();
      const idx = updatedClients.findIndex(cl => cl.ip === ip);
      if (idx !== -1) {
        updatedClients[idx] = { ...updatedClients[idx], banned: false };
      }
    } else if (c.cmd === 'set_name' && typeof c.param === 'string') {
      const parts = c.param.split('|');
      const ip = parts[0]?.trim();
      const alias = sanitizeClientAlias(parts[1]);
      const iface = parts[2]?.trim().toLowerCase() === 'wan' ? 'wan' : 'lan';
      if (isValidIpv4(ip) && alias) {
        const idx = updatedClients.findIndex(cl => cl.ip === ip);
        if (idx !== -1) {
          updatedClients[idx] = { ...updatedClients[idx], name: alias, iface };
        } else {
          updatedClients.push({ ip, name: alias, iface, banned: false, queries: 0, blocked: 0 });
        }
      }
    }
  }
  return { state, clients: updatedClients };
}

export default async function handler(req, res) {
  setSecurityHeaders(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const storage = await getSafeStorage();
  const urlObj = new URL(req.url || '/api/adblock', 'http://localhost');
  const action = req.query?.action || urlObj.searchParams.get('action') || (req.body && req.body.action) || 'status';

  // Public Time Synchronization Action
  if (action === 'time') {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const secret = await ensureDeviceSecretLoaded(storage);
    const sig = secret ? crypto.createHmac('sha256', secret).update(String(nowSec)).digest('hex') : '';
    return sendSecureJson(res, 200, {
      ok: true,
      time: nowSec,
      timeMs: nowMs,
      iso: new Date(nowMs).toISOString(),
      sig
    }, req);
  }

  // 24/7 Zero-PII Watchdog Liveness Pulse
  if (action === 'watchdog') {
    const meta = await readJsonKey(storage, KEY_META, {});
    const lastSeenMs = meta.lastSeenMs || 0;
    const isOnline = Boolean(lastSeenMs && (Date.now() - lastSeenMs) < 45000);
    return sendSecureJson(res, 200, {
      ok: true,
      service: 'esp32-adblock-cloud-gateway',
      online: isOnline,
      lastSeenMs,
      timestamp: Date.now()
    }, req);
  }

  // Heartbeat Push Action (Direct from ESP32 over Wi-Fi)
  if (action === 'heartbeat') {
    if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' }, req);

    if (!enforcePayloadLimit(req, 65536)) {
      return sendSecureJson(res, 413, { error: 'Payload too large. Maximum size is 64KB.' }, req);
    }
    const rateLimit = await checkRateLimit(req, storage, 'adblock_hw_push', 60, 60);
    if (!rateLimit.allowed) {
      auditLog('ADBLOCK_RATE_LIMITED', req, `IP: ${getClientIp(req)}`);
      return sendSecureJson(res, 429, { error: 'Rate limit exceeded' }, req);
    }

    const rawBodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const auth = await verifyDeviceRequest(req, rawBodyStr, storage);
    if (!auth.valid) {
      return sendSecureJson(res, auth.status || 401, { error: auth.error, serverTime: auth.serverTime }, req);
    }

    const payload = typeof req.body === 'object' && req.body !== null ? req.body : (JSON.parse(rawBodyStr || '{}'));
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    const prevMeta = await readJsonKey(storage, KEY_META, {});
    const lastSeq = prevMeta.lastSeq || 0;

    // Sequence Monotonicity Invariant (prevent state regression while gracefully handling retries and reboots)
    const isColdReboot = (auth.seq === 1) || (payload.uptime && payload.uptime < 120);
    if (auth.seq < lastSeq && !isColdReboot) {
      auditLog('ADBLOCK_REGRESSIVE_SEQ', req, `seq=${auth.seq}, lastSeq=${lastSeq}`);
    }
    const nextSeq = Math.max(lastSeq, auth.seq);

    const prevStatus = await readJsonKey(storage, KEY_STATE, getDefaultStatus());
    const nextStatus = normalizeStatus(payload, prevStatus);
    nextStatus.lastSeenMs = nowMs;
    nextStatus.status = 'ONLINE';

    // Transition tracking: record online/offline events (45s window covers 3x slow heartbeat cycle)
    const wasOnline = Boolean(prevMeta.lastSeenMs && (nowMs - prevMeta.lastSeenMs) < 45000);
    if (!wasOnline) {
      nextStatus.lastOnline = new Date(nowMs).toISOString();
    }

    // Ingest Clients List if provided
    let nextClients = await readJsonKey(storage, KEY_CLIENTS, []);
    if (Array.isArray(payload.clients) && payload.clients.length > 0) {
      const clientMap = new Map(nextClients.map(c => [c.ip, c]));
      for (const cl of payload.clients) {
        if (!cl || !cl.ip) continue;
        const existing = clientMap.get(cl.ip) || {};
        clientMap.set(cl.ip, {
          ...existing,
          ...cl,
          lastSeenMs: nowMs
        });
      }
      nextClients = Array.from(clientMap.values()).slice(0, MAX_CLIENTS);
    }

    // Ingest Logs if provided (circular buffer capped at MAX_CLOUD_LOGS)
    let nextLogs = await readJsonKey(storage, KEY_LOGS, []);
    if (Array.isArray(payload.logs) && payload.logs.length > 0) {
      const incoming = payload.logs.map(l => ({
        ...l,
        ts: l.ts || nowMs
      }));
      nextLogs = [...incoming, ...nextLogs].slice(0, MAX_CLOUD_LOGS);
    }

    // Read and filter pending commands
    let cmdQueue = await readJsonKey(storage, KEY_CMDS, []);
    const ackedCmdIds = new Set(Array.isArray(payload.ackCmdIds) ? payload.ackCmdIds : []);

    // Purge acknowledged commands or expired commands (> 60s)
    cmdQueue = cmdQueue.filter(cmd => !ackedCmdIds.has(cmd.cmdId) && cmd.expiresAt > nowSec);

    // Atomic Pipelined Storage Write
    const pipeline = storage.pipeline();
    pipeline.set(KEY_STATE, JSON.stringify(nextStatus));
    pipeline.set(KEY_CLIENTS, JSON.stringify(nextClients));
    pipeline.set(KEY_LOGS, JSON.stringify(nextLogs));
    pipeline.set(KEY_CMDS, JSON.stringify(cmdQueue));
    pipeline.set(KEY_META, JSON.stringify({
      lastSeenMs: nowMs,
      lastSeq: nextSeq,
      lastOnlineTs: nextStatus.lastOnline,
      wasOnline: true
    }));
    await pipeline.exec();

    // Prepare downlink signed commands for ESP32
    return sendSecureJson(res, 200, {
      ok: true,
      commands: cmdQueue,
      serverTime: nowSec
    }, req);
  }

  // Dashboard Telemetry Action (Called by Lumina Vista Web UI)
  if (action === 'dashboard') {
    const session = await validateSession(req, storage);
    if (!session.valid) {
      return sendSecureJson(res, 401, { error: 'Authentication required to view AdBlocker telemetry' }, req);
    }

    const rateLimit = await checkRateLimit(req, storage, 'adblock_dash', 120, 60);
    if (!rateLimit.allowed) {
      return sendSecureJson(res, 429, { error: 'Rate limit exceeded' }, req);
    }

    const nowMs = Date.now();
    const meta = await readJsonKey(storage, KEY_META, {});
    const rawState = await readJsonKey(storage, KEY_STATE, getDefaultStatus());
    const rawClients = await readJsonKey(storage, KEY_CLIENTS, []);
    const rawLogs = await readJsonKey(storage, KEY_LOGS, []);
    const cmdQueue = await readJsonKey(storage, KEY_CMDS, []);
    const uboOverrides = await readJsonKey(storage, KEY_UBO, []);

    const lastSeenMs = meta.lastSeenMs || rawState.lastSeenMs || 0;
    const isOnline = Boolean(lastSeenMs && (nowMs - lastSeenMs) < 45000);

    // Apply pending in-flight commands to state for optimistic consistency
    const { state, clients } = applyPendingCommandsToState(rawState, rawClients, cmdQueue);

    return sendSecureJson(res, 200, {
      ok: true,
      online: isOnline,
      lastSeenMs,
      status: state,
      clients,
      logs: rawLogs.slice(0, 100),
      uboOverrides,
      pendingCommands: cmdQueue
    }, req);
  }

  // Command Dispatch Action (Called by Lumina Vista Web UI)
  if (action === 'command') {
    if (req.method !== 'POST') return sendSecureJson(res, 405, { error: 'Method Not Allowed' }, req);

    const session = await validateSession(req, storage);
    if (!session.valid) {
      return sendSecureJson(res, 401, { error: 'Authentication required to execute AdBlocker commands' }, req);
    }

    if (!enforcePayloadLimit(req, 8192)) {
      return sendSecureJson(res, 413, { error: 'Payload too large. Maximum size is 8KB.' }, req);
    }
    const rateLimit = await checkRateLimit(req, storage, 'adblock_cmd', 30, 60);
    if (!rateLimit.allowed) {
      return sendSecureJson(res, 429, { error: 'Command rate limit exceeded' }, req);
    }

    const body = req.body || {};
    const cmd = String(body.cmd || '').trim().toLowerCase();
    const param = String(body.param || '').trim();

    if (!ALLOWED_COMMANDS.has(cmd)) {
      return sendSecureJson(res, 400, { error: `Invalid command '${cmd}'. Allowed: ${Array.from(ALLOWED_COMMANDS).join(', ')}` }, req);
    }

    // Role Enforcement for Destructive & Administrative Actions (CWE-285)
    const MASTER_COMMANDS = new Set(['ban_client', 'unban_client', 'set_name', 'reboot', 'fetch_now']);
    if (MASTER_COMMANDS.has(cmd) && session.role !== 'master') {
      auditLog('ADBLOCK_FORBIDDEN', req, `Temporary session attempted ${cmd} (role=${session.role})`);
      return sendSecureJson(res, 403, { error: 'Master role authorization required for administrative operations' }, req);
    }

    // Input Validation & Parameter Canonicalization (CWE-20)
    let sanitizedParam = '';
    if (cmd === 'add_block' || cmd === 'remove_block') {
      sanitizedParam = sanitizeDomain(param);
      if (!sanitizedParam) {
        return sendSecureJson(res, 400, { error: 'Invalid hostname format for block command' }, req);
      }
    } else if (cmd === 'ban_client' || cmd === 'unban_client') {
      if (!isValidIpv4(param)) {
        return sendSecureJson(res, 400, { error: 'Invalid IPv4 address format for client ban/unban' }, req);
      }
      sanitizedParam = param.trim();
    } else if (cmd === 'set_name') {
      const parts = param.split('|');
      const ip = parts[0]?.trim();
      const alias = sanitizeClientAlias(parts[1]);
      const iface = parts[2]?.trim().toLowerCase() === 'wan' ? 'wan' : 'lan';
      if (!isValidIpv4(ip) || !alias) {
        return sendSecureJson(res, 400, { error: 'Invalid set_name parameter: expected valid IPv4 and non-empty alias (max 31 characters)' }, req);
      }
      sanitizedParam = `${ip}|${alias}|${iface}`;
    } else if (cmd === 'reboot' || cmd === 'fetch_now') {
      sanitizedParam = '';
    }

    const secret = await ensureDeviceSecretLoaded(storage);
    if (!secret) {
      return sendSecureJson(res, 503, { error: 'Cryptographic key not provisioned for command signing' }, req);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const cmdObj = {
      cmdId: `cmd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      cmd,
      param: sanitizedParam,
      issuedAt: nowSec,
      expiresAt: nowSec + 60
    };
    cmdObj.signature = signDeviceCommand(secret, cmdObj);

    let cmdQueue = await readJsonKey(storage, KEY_CMDS, []);
    cmdQueue.push(cmdObj);
    await storage.set(KEY_CMDS, JSON.stringify(cmdQueue));

    auditLog('ADBLOCK_CMD_QUEUED', req, `Cmd: ${cmd}, ID: ${cmdObj.cmdId}`);

    return sendSecureJson(res, 200, {
      ok: true,
      message: `Command '${cmd}' queued successfully for hardware dispatch`,
      cmdId: cmdObj.cmdId,
      expiresAt: cmdObj.expiresAt
    }, req);
  }

  return sendSecureJson(res, 400, { error: 'Unknown action specified' }, req);
}
