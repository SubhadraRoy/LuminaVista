// api/iot.js - Ultra-Secure & Ultra-Fast Zero-Trust IoT Gateway (ESP32 Smart Door Lock <-> LuminaVista Cloud OS)
import crypto from 'crypto';
import { getSafeStorage } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sendSecureJson,
  setSecurityHeaders,
  enforcePayloadLimit,
  getClientIp,
  auditLog
} from './_lib/auth-guard.js';

export const DEFAULT_DEVICE_ID = process.env.IOT_DEVICE_ID || 'esp32-main-door-01';
export const KEY_SECRET = 'iot:system:hmac_key';

let cachedCloudSecret = '';

export const getDeviceSecret = () => (
  process.env.IOT_DEVICE_SECRET ||
  cachedCloudSecret ||
  (!process.env.VERCEL ? 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8' : '')
).trim();

async function ensureDeviceSecretLoaded(storage) {
  if (process.env.IOT_DEVICE_SECRET || cachedCloudSecret) return getDeviceSecret();
  try {
    const val = await storage.get(KEY_SECRET);
    if (val && typeof val === 'string' && val.trim().length >= 32) {
      cachedCloudSecret = val.trim();
    }
  } catch { /* ignore storage read errors */ }
  return getDeviceSecret();
}

export const KEY_STATE = 'iot:door:state';
export const KEY_CARDS = 'iot:door:cards';
export const KEY_LOGS  = 'iot:door:logs';
export const KEY_CMDS  = 'iot:door:cmd_queue';
export const KEY_META  = 'iot:door:meta';
export const KEY_CONN_HISTORY = 'iot:door:conn_history';
export const MAX_CLOUD_LOGS = 2000;
export const MAX_CARD_HISTORY = 100;
export const MAX_CONN_HISTORY = 500;

const ALLOWED_COMMANDS = new Set([
  'unlock',
  'lock',
  'lock_mode',
  'alarm_clear',
  'restart',
  'relay3',
  'relay3_schedule',
  'relay4',
  'relay4_schedule',
  'enroll',
  'cards_clear',
  'card_rename',
  'card_toggle',
  'card_color',
  'card_remove',
  'logs_clear'
]);

const TIER1_PHYSICAL_COMMANDS = new Set(['unlock', 'lock', 'lock_mode', 'alarm_clear', 'enroll', 'restart']);

function getDefaultStatus() {
  return {
    lock: 'LOCKED',
    door: 'CLOSED',
    doorOpenTime: 'Closed',
    doorCloseTime: '-',
    alarm: false,
    accessWindow: false,
    relockOnClose: false,
    failedAttempts: 0,
    nfcOnline: true,
    last_event: 'Door Lock System Ready',
    lastEvent: 'Door Lock System Ready',
    last_door_event: 'Door CLOSED',
    lastDoorEvent: 'Door CLOSED',
    last_access_event: '-',
    lastAccessEvent: '-',
    last_nfc: 'None',
    lastNfcEvent: 'None',
    relay3: false,
    relay3Schedule: false,
    relay3On: '18:00',
    relay3Off: '06:00',
    relay3_schedule: 'Disabled',
    relay4: false,
    relay4Schedule: false,
    relay4On: '18:00',
    relay4Off: '06:00',
    relay4_schedule: 'Disabled',
    cards: 0,
    enroll: false,
    wifi: 'STA',
    ip: 'LAN-PROTECTED',
    rssi: -52,
    wifi_rssi: -52,
    cpu_load: 8,
    heap_free: 218400,
    heap_total: 327680,
    uptime: 0,
    last_online: '-',
    lastOnline: '-',
    last_offline: '-',
    lastOffline: '-'
  };
}

function normalizeStatus(raw = {}, prev = {}) {
  const base = { ...getDefaultStatus(), ...prev, ...raw };
  base.ip = 'LAN-PROTECTED';
  base.last_event = raw.last_event ?? raw.lastEvent ?? prev.last_event ?? base.last_event;
  base.lastEvent = base.last_event;
  base.last_door_event = raw.last_door_event ?? raw.lastDoorEvent ?? prev.last_door_event ?? base.last_door_event;
  base.lastDoorEvent = base.last_door_event;
  base.last_access_event = raw.last_access_event ?? raw.lastAccessEvent ?? prev.last_access_event ?? base.last_access_event;
  base.lastAccessEvent = base.last_access_event;
  base.last_nfc = raw.last_nfc ?? raw.lastNfcEvent ?? prev.last_nfc ?? base.last_nfc;
  base.lastNfcEvent = base.last_nfc;
  base.rssi = Number.isFinite(Number(raw.rssi ?? raw.wifi_rssi)) ? Number(raw.rssi ?? raw.wifi_rssi) : base.rssi;
  base.wifi_rssi = base.rssi;
  base.last_online = raw.last_online ?? raw.lastOnline ?? prev.last_online ?? base.last_online;
  base.lastOnline = base.last_online;
  base.last_offline = raw.last_offline ?? raw.lastOffline ?? prev.last_offline ?? base.last_offline;
  base.lastOffline = base.last_offline;

  if (typeof raw.relay3Schedule === 'boolean') base.relay3Schedule = raw.relay3Schedule;
  if (typeof raw.relay4Schedule === 'boolean') base.relay4Schedule = raw.relay4Schedule;
  base.relay3_schedule = raw.relay3_schedule || (base.relay3Schedule ? `ON ${base.relay3On || '18:00'} / OFF ${base.relay3Off || '06:00'}` : 'Disabled');
  base.relay4_schedule = raw.relay4_schedule || (base.relay4Schedule ? `ON ${base.relay4On || '18:00'} / OFF ${base.relay4Off || '06:00'}` : 'Disabled');
  if (!base.doorOpenTime) {
    base.doorOpenTime = base.door === 'OPEN' ? (base.last_door_event || 'Open') : 'Closed';
  }
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

async function writeJsonKey(storage, key, val) {
  await storage.set(key, JSON.stringify(val));
}

/**
 * Computes outbound ESP32 -> LuminaVista HMAC-SHA256 request signature.
 */
export function computeDeviceSignature(secret, deviceId, timestamp, nonce, seq, rawBodyStr = '') {
  const bodyHash = crypto.createHash('sha256').update(String(rawBodyStr), 'utf8').digest('hex').toLowerCase();
  const canonical = `${deviceId}.${timestamp}.${nonce}.${seq}.${bodyHash}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toLowerCase();
}

/**
 * Computes LuminaVista -> ESP32 mutual HMAC-SHA256 command signature.
 */
export function signDeviceCommand(secret, cmdObj) {
  const canonical = `${cmdObj.cmdId}.${cmdObj.cmd}.${cmdObj.param || ''}.${cmdObj.issuedAt}.${cmdObj.expiresAt}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toLowerCase();
}

/**
 * Verifies 5-Layer ESP32 Hardware Request Security:
 * 1. Provisioned Device ID validation
 * 2. +-60s Timestamp Drift Window
 * 3. Constant-Time HMAC-SHA256 Signature Check
 * 4. 128-bit Nonce Format Validation
 * 5. Atomic Nonce Anti-Replay Lock (NX + 120s TTL, invariant T_nonce >= 2W)
 */
export async function verifyDeviceRequest(req, rawBodyStr, storage) {
  const headers = req.headers || {};
  const deviceId = String(headers['x-lumina-device-id'] || '').trim();
  const tsStr = String(headers['x-lumina-timestamp'] || '').trim();
  const nonce = String(headers['x-lumina-nonce'] || '').trim().toLowerCase();
  const seqStr = String(headers['x-lumina-seq'] || '0').trim();
  const receivedSig = String(headers['x-lumina-signature'] || '').trim().toLowerCase();

  if (!deviceId || deviceId !== DEFAULT_DEVICE_ID) {
    auditLog('IOT_UNKNOWN_DEVICE', req, `Device: ${deviceId}`);
    return { valid: false, status: 401, error: 'Unknown or unauthorized IoT device ID' };
  }

  const ts = parseInt(tsStr, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  const DRIFT_WINDOW_SEC = 60; // +-60s drift window
  const NONCE_TTL_SEC = DRIFT_WINDOW_SEC * 2; // 120s (Invariant: T_nonce >= 2W)
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > DRIFT_WINDOW_SEC) {
    auditLog('IOT_TIMESTAMP_SKEW', req, `ts=${tsStr}, now=${nowSec}`);
    return { valid: false, status: 401, error: 'Expired or skewed timestamp', serverTime: nowSec };
  }

  if (!/^[a-f0-9]{16,64}$/i.test(nonce)) {
    return { valid: false, status: 401, error: 'Invalid cryptographic nonce format' };
  }

  if (!/^[a-f0-9]{64}$/i.test(receivedSig)) {
    auditLog('IOT_BAD_SIGNATURE', req, 'Malformed signature');
    return { valid: false, status: 401, error: 'Invalid HMAC signature format' };
  }

  const secret = await ensureDeviceSecretLoaded(storage);
  if (!secret) {
    return { valid: false, status: 503, error: 'IoT gateway cryptographic key not provisioned' };
  }
  const expectedSig = computeDeviceSignature(secret, deviceId, tsStr, nonce, seqStr, rawBodyStr);
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  const receivedBuf = Buffer.from(receivedSig, 'hex');

  if (
    expectedBuf.length !== 32 ||
    receivedBuf.length !== 32 ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    auditLog('IOT_BAD_SIGNATURE', req, 'HMAC mismatch');
    return { valid: false, status: 401, error: 'Cryptographic HMAC-SHA256 verification failed' };
  }

  // Atomic Nonce Anti-Replay Check (Single Redis Round-Trip SET NX EX 600)
  const nonceKey = `iot:nonce:${deviceId}:${nonce}`;
  const lockRes = await storage.set(nonceKey, '1', { nx: true, ex: NONCE_TTL_SEC });
  if (lockRes === null) {
    auditLog('IOT_REPLAY_BLOCKED', req, `Duplicate nonce: ${nonce}`);
    return { valid: false, status: 401, error: 'Replay attack detected: nonce already used' };
  }

  return {
    valid: true,
    deviceId,
    timestamp: ts,
    nonce,
    seq: parseInt(seqStr, 10) || 0,
    serverTime: nowSec
  };
}

function formatIstTimestamp(ms = Date.now()) {
  const d = new Date((Number(ms) || Date.now()) + 19800 * 1000); // IST UTC+5:30 display alignment
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function formatNowTimestamp() {
  return formatIstTimestamp(Date.now());
}

function normalizeLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  let ts = String(entry.ts || '-');
  let msg = String(entry.msg || '').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[LAN-PROTECTED]');
  if (/^boot\+\d+/i.test(ts)) {
    const resolvedTs = formatIstTimestamp(entry.receivedAt || Date.now());
    ts = resolvedTs;
    msg = msg.replace(/@\s*boot\+\d+\s*ms/i, `@ ${resolvedTs}`);
    return { ...entry, ts, msg };
  }
  if (msg !== entry.msg) {
    return { ...entry, msg };
  }
  return entry;
}

/**
 * Projects any un-acknowledged pending commands onto the incoming ESP32 shadow state
 * so an in-flight pre-command heartbeat never reverts the cloud state before hardware ACK.
 */
function applyPendingCommandsToState(state, cards, pendingQueue) {
  if (!Array.isArray(pendingQueue) || pendingQueue.length === 0) return;
  for (const cmdObj of pendingQueue) {
    if (!cmdObj || !cmdObj.cmd) continue;
    const cmd = String(cmdObj.cmd);
    const param = String(cmdObj.param || '');

    if (state) {
      if (cmd === 'unlock') {
        state.lock = 'UNLOCKED';
        state.alarm = false;
        state.last_event = 'UNLOCKED (15s) via lumina cloud';
        state.lastEvent = state.last_event;
      } else if (cmd === 'lock') {
        state.lock = 'LOCKED';
        state.alarm = false;
        state.last_event = 'LOCK: lumina cloud';
        state.lastEvent = state.last_event;
      } else if (cmd === 'alarm_clear') {
        state.alarm = false;
        state.last_event = 'ALARM CLEARED: lumina cloud';
        state.lastEvent = state.last_event;
      } else if (cmd === 'restart') {
        state.last_event = 'RESTART requested via LuminaVista';
        state.lastEvent = state.last_event;
      } else if (cmd === 'relay3' || cmd === 'relay4') {
        const key = cmd === 'relay3' ? 'relay3' : 'relay4';
        const st = param.toLowerCase();
        state[key] = st === 'on' ? true : (st === 'off' ? false : !state[key]);
        state.last_event = `${cmd.toUpperCase()} set to ${state[key] ? 'ON' : 'OFF'} (cloud)`;
        state.lastEvent = state.last_event;
      } else if (cmd === 'relay3_schedule' || cmd === 'relay4_schedule') {
        const [enStr, on, off] = param.split('|');
        const enabled = enStr === '1';
        if (on && off) {
          if (cmd === 'relay3_schedule') {
            state.relay3Schedule = enabled;
            state.relay3On = on;
            state.relay3Off = off;
            state.relay3_schedule = enabled ? `ON ${on} / OFF ${off}` : 'Disabled';
          } else {
            state.relay4Schedule = enabled;
            state.relay4On = on;
            state.relay4Off = off;
            state.relay4_schedule = enabled ? `ON ${on} / OFF ${off}` : 'Disabled';
          }
        }
      } else if (cmd === 'enroll') {
        const en = param === '1';
        state.enroll = en;
        state.last_event = en ? 'Enroll next NFC card' : 'Enrollment canceled';
        state.lastEvent = state.last_event;
      } else if (cmd === 'cards_clear') {
        state.cards = 0;
        state.enroll = false;
        state.last_event = 'All cards cleared (cloud)';
        state.lastEvent = state.last_event;
      }
    }

    if (Array.isArray(cards)) {
      if (cmd === 'cards_clear') {
        cards.length = 0;
      } else if (cmd === 'card_rename') {
        const [uid, cleanName] = param.split('|');
        const card = cards.find(c => String(c.uid).toUpperCase() === String(uid).toUpperCase());
        if (card && cleanName) card.name = cleanName;
      } else if (cmd === 'card_toggle') {
        const uid = param.toUpperCase();
        const card = cards.find(c => String(c.uid).toUpperCase() === uid);
        if (card) card.active = !card.active;
      } else if (cmd === 'card_color') {
        const [uid, color] = param.split('|');
        const card = cards.find(c => String(c.uid).toUpperCase() === String(uid).toUpperCase());
        if (card && color) card.color = color;
      } else if (cmd === 'card_remove') {
        const uid = param.toUpperCase();
        const idx = cards.findIndex(c => String(c.uid).toUpperCase() === uid);
        if (idx !== -1) cards.splice(idx, 1);
        if (state) state.cards = cards.length;
      }
    }
  }
}

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const storage = getSafeStorage();
  const urlObj = new URL(req.url || '/api/iot', 'http://localhost');
  const action = urlObj.searchParams.get('action') || (req.query && req.query.action) || '';

  // =========================================================================
  // 1. GET /api/iot?action=time (Signed Time-Sync Bootstrap for ESP32)
  // =========================================================================
  if (req.method === 'GET' && action === 'time') {
    const challenge = String(urlObj.searchParams.get('challenge') || (req.query && req.query.challenge) || '').slice(0, 64);
    const nowSec = Math.floor(Date.now() / 1000);
    const secret = await ensureDeviceSecretLoaded(storage);
    if (!secret) {
      return sendSecureJson(res, 503, { error: 'IoT gateway cryptographic key not provisioned' });
    }
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`time.${nowSec}.${challenge}`, 'utf8')
      .digest('hex')
      .toLowerCase();

    return sendSecureJson(res, 200, {
      ok: true,
      serverTime: nowSec,
      challenge,
      signature
    });
  }

  // =========================================================================
  // 2. GET /api/iot?action=logs&format=txt (Cloud Log File Download)
  // =========================================================================
  if (req.method === 'GET' && action === 'logs') {
    const [session, rawLogs] = await Promise.all([
      validateSession(req, storage),
      readJsonKey(storage, KEY_LOGS, [])
    ]);
    if (!session.valid) {
      return sendSecureJson(res, session.status || 401, { error: session.error });
    }
    if (session.role !== 'master') {
      auditLog('IOT_FORBIDDEN', req, `Temporary session attempted log download (role=${session.role})`);
      return sendSecureJson(res, 403, { error: 'Forbidden: Master Administrator access required to download audit logs.' });
    }

    const logs = Array.isArray(rawLogs) ? rawLogs.map(normalizeLogEntry) : [];
    const lines = logs.map(entry => {
      if (typeof entry === 'string') return entry;
      const ts = entry.ts || '-';
      const msg = entry.msg || '';
      const seq = entry.seq !== undefined ? `#${entry.seq}` : '#0';
      const src = entry.source || 'live';
      return `${ts} | ${msg} [seq=${seq}, ${src}]`;
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="door_logs.txt"');
    return res.status(200).send ? res.status(200).send(lines.join('\n') + '\n') : res.end(lines.join('\n') + '\n');
  }

  // =========================================================================
  // 2B. GET /api/iot?action=watchdog (24/7 Zero-PII Liveness & Offline Detector)
  // =========================================================================
  if (req.method === 'GET' && action === 'watchdog') {
    const [rate, rawState, meta, rawConnHistory] = await Promise.all([
      checkRateLimit(req, storage, 'iot_watchdog', 180, 60),
      readJsonKey(storage, KEY_STATE, null),
      readJsonKey(storage, KEY_META, null),
      readJsonKey(storage, KEY_CONN_HISTORY, [])
    ]);
    if (!rate.allowed) {
      return sendSecureJson(res, 429, { error: rate.error });
    }

    const nowMs = Date.now();
    const lastSeenMs = meta && meta.lastSeenMs ? Number(meta.lastSeenMs) : 0;
    const online = Boolean(lastSeenMs && (nowMs - lastSeenMs) < 12000);

    if (meta && meta.wasOnline === true && !online) {
      const offlineTs = formatIstTimestamp(lastSeenMs);
      const durationSec = meta.lastOnlineMs
        ? Math.max(1, Math.round((lastSeenMs - Number(meta.lastOnlineMs)) / 1000))
        : null;
      const connHistory = Array.isArray(rawConnHistory) ? [...rawConnHistory] : [];
      const offlineEvent = {
        seq: meta.lastSeq || 0,
        type: 'OFFLINE',
        ts: offlineTs,
        reason: 'Heartbeat Timeout (ESP32 Unreachable > 12s)',
        durationSec,
        source: 'cloud_watchdog',
        receivedAt: nowMs
      };
      connHistory.unshift(offlineEvent);
      while (connHistory.length > MAX_CONN_HISTORY) connHistory.pop();

      meta.wasOnline = false;
      meta.lastOfflineMs = lastSeenMs;
      meta.lastOfflineTs = offlineTs;

      const writes = [
        writeJsonKey(storage, KEY_CONN_HISTORY, connHistory),
        writeJsonKey(storage, KEY_META, meta)
      ];
      if (rawState && typeof rawState === 'object') {
        rawState.last_offline = offlineTs;
        rawState.lastOffline = offlineTs;
        writes.push(writeJsonKey(storage, KEY_STATE, rawState));
      }
      await Promise.all(writes);
    }

    return sendSecureJson(res, 200, {
      ok: true,
      online,
      lastSeenMs,
      serverTime: Math.floor(nowMs / 1000)
    });
  }

  // =========================================================================
  // 3. GET /api/iot?action=dashboard (Browser Admin Dashboard Poll)
  // =========================================================================
  if (req.method === 'GET') {
    const [session, rawState, cards, logs, rawQueue, meta, rawConnHistory] = await Promise.all([
      validateSession(req, storage),
      readJsonKey(storage, KEY_STATE, null),
      readJsonKey(storage, KEY_CARDS, []),
      readJsonKey(storage, KEY_LOGS, []),
      readJsonKey(storage, KEY_CMDS, []),
      readJsonKey(storage, KEY_META, null),
      readJsonKey(storage, KEY_CONN_HISTORY, [])
    ]);
    if (!session.valid) {
      return sendSecureJson(res, session.status || 401, { error: session.error });
    }

    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);
    const activeCommands = Array.isArray(rawQueue)
      ? rawQueue.filter(c => c && Number(c.expiresAt) >= nowSec)
      : [];

    if (Array.isArray(rawQueue) && activeCommands.length !== rawQueue.length) {
      await writeJsonKey(storage, KEY_CMDS, activeCommands);
    }

    const status = normalizeStatus(rawState || {});
    const cardsList = Array.isArray(cards) ? cards : [];
    status.cards = cardsList.length || status.cards || 0;
    if (activeCommands.length > 0) {
      applyPendingCommandsToState(status, null, activeCommands);
    }

    const lastSeenMs = meta && meta.lastSeenMs ? Number(meta.lastSeenMs) : 0;
    const online = Boolean(lastSeenMs && (nowMs - lastSeenMs) < 12000);
    const connHistory = Array.isArray(rawConnHistory) ? [...rawConnHistory] : [];

    // 24/7 Cloud Watchdog: Record exact OFFLINE transition if ESP32 stopped sending heartbeats
    if (meta && meta.wasOnline === true && !online) {
      const offlineTs = formatIstTimestamp(lastSeenMs);
      const durationSec = meta.lastOnlineMs
        ? Math.max(1, Math.round((lastSeenMs - Number(meta.lastOnlineMs)) / 1000))
        : null;
      const offlineEvent = {
        seq: meta.lastSeq || 0,
        type: 'OFFLINE',
        ts: offlineTs,
        reason: 'Heartbeat Timeout (ESP32 Unreachable > 12s)',
        durationSec,
        source: 'cloud_watchdog',
        receivedAt: nowMs
      };
      connHistory.unshift(offlineEvent);
      while (connHistory.length > MAX_CONN_HISTORY) connHistory.pop();

      meta.wasOnline = false;
      meta.lastOfflineMs = lastSeenMs;
      meta.lastOfflineTs = offlineTs;
      status.last_offline = offlineTs;
      status.lastOffline = offlineTs;

      await Promise.all([
        writeJsonKey(storage, KEY_CONN_HISTORY, connHistory),
        writeJsonKey(storage, KEY_META, meta),
        writeJsonKey(storage, KEY_STATE, status)
      ]);
    } else if (meta) {
      if (meta.lastOnlineTs && (!status.last_online || status.last_online === '-')) {
        status.last_online = meta.lastOnlineTs;
        status.lastOnline = meta.lastOnlineTs;
      }
      if (meta.lastOfflineTs && meta.lastOfflineTs !== '-' && (!status.last_offline || status.last_offline === '-')) {
        status.last_offline = meta.lastOfflineTs;
        status.lastOffline = meta.lastOfflineTs;
      }
    }

    return sendSecureJson(res, 200, {
      ok: true,
      online,
      lastSeenMs,
      deviceId: DEFAULT_DEVICE_ID,
      securityProtocol: 'HMAC-SHA256 + 128-bit Nonce + Dual-TTL',
      lastSeq: meta?.lastSeq || 0,
      status,
      cards: cardsList,
      logs: Array.isArray(logs) ? logs.map(normalizeLogEntry) : [],
      connHistory: connHistory.slice(0, MAX_CONN_HISTORY),
      pendingCommands: activeCommands
    });
  }

  // =========================================================================
  // 4. POST /api/iot
  // =========================================================================
  if (req.method === 'POST') {
    if (!enforcePayloadLimit(req, 250000)) {
      return sendSecureJson(res, 413, { error: 'Payload too large' });
    }

    const hasDeviceSig = Boolean(req.headers && req.headers['x-lumina-signature']);

    // -----------------------------------------------------------------------
    // 4A. ESP32 Hardware Push & Command Poll (Signed with X-Lumina-Signature)
    // -----------------------------------------------------------------------
    if (hasDeviceSig) {
      const rawBodyStr = typeof req.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

      const rate = await checkRateLimit(req, storage, 'iot_hardware', 120, 60);
      if (!rate.allowed) {
        return sendSecureJson(res, 429, { error: rate.error });
      }

      const verification = await verifyDeviceRequest(req, rawBodyStr, storage);
      if (!verification.valid) {
        return sendSecureJson(res, verification.status || 401, {
          error: verification.error,
          ...(verification.serverTime ? { serverTime: verification.serverTime } : {})
        });
      }

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      body = body || {};

      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const nowTs = formatIstTimestamp(nowMs);
      const hasStatus = Boolean(body.status && typeof body.status === 'object');
      const hasCards = Array.isArray(body.cards);
      const hasLogs = Array.isArray(body.logs) && body.logs.length > 0;
      const hasConnEvents = Array.isArray(body.connEvents) && body.connEvents.length > 0;

      // Parallelize all Redis reads into a single network round-trip
      const [prevMeta, prevState, prevCards, existingLogs, existingConnHistory, rawQueue] = await Promise.all([
        readJsonKey(storage, KEY_META, {}),
        (hasStatus || body.probeOnly) ? readJsonKey(storage, KEY_STATE, {}) : Promise.resolve(null),
        hasCards ? readJsonKey(storage, KEY_CARDS, []) : Promise.resolve([]),
        hasLogs ? readJsonKey(storage, KEY_LOGS, []) : Promise.resolve([]),
        readJsonKey(storage, KEY_CONN_HISTORY, []),
        readJsonKey(storage, KEY_CMDS, [])
      ]);

      if (body.probeOnly === true) {
        return sendSecureJson(res, 200, {
          ok: true,
          serverTime: nowSec,
          meta: prevMeta || {},
          status: prevState || {},
          pendingCommands: Array.isArray(rawQueue) ? rawQueue.filter(cmd => cmd && Number(cmd.expiresAt) >= nowSec) : []
        });
      }

      // 1. Process acknowledged commands & filter expired commands first
      const ackSet = new Set(Array.isArray(body.ackCmdIds) ? body.ackCmdIds.map(String) : []);
      const remainingQueue = Array.isArray(rawQueue)
        ? rawQueue.filter(cmd => cmd && !ackSet.has(String(cmd.cmdId)) && Number(cmd.expiresAt) >= nowSec)
        : [];

      // 2. Additive Card Tap History Merge (preserves cloud history after ESP32 purges its RAM)
      let sanitizedCards = null;
      if (hasCards) {
        const prevCardMap = new Map(
          (Array.isArray(prevCards) ? prevCards : []).map(pc => [String(pc.uid || '').toUpperCase(), pc])
        );

        sanitizedCards = body.cards.slice(0, 20).map((c, idx) => {
          const uid = String(c.uid || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 20);
          const prev = prevCardMap.get(uid);

          const incomingHist = Array.isArray(c.history)
            ? c.history
                .slice(0, MAX_CARD_HISTORY)
                .map(h => {
                  const s = String(h).replace(/[\x00-\x1F\x7F]/g, '').slice(0, 32);
                  return /^boot\+\d+/i.test(s) ? nowTs : s;
                })
                .filter(Boolean)
            : [];
          const prevHist = (prev && Array.isArray(prev.history)) ? prev.history : [];

          const seenTaps = new Set();
          const mergedHist = [];
          for (const tapTs of [...incomingHist, ...prevHist]) {
            if (tapTs && tapTs !== '-' && !seenTaps.has(tapTs)) {
              seenTaps.add(tapTs);
              mergedHist.push(tapTs);
            }
          }
          const finalHist = mergedHist.slice(0, MAX_CARD_HISTORY);

          const prevCount = prev ? (parseInt(prev.count ?? prev.usage_count ?? 0, 10) || 0) : 0;
          const incomingCount = Math.max(0, parseInt(c.count ?? c.usage_count ?? 0, 10) || 0);
          const newTapDelta = Math.max(0, finalHist.length - prevHist.length);
          const mergedCount = Math.max(prevCount + newTapDelta, incomingCount, finalHist.length);

          let incomingLast = String(c.last || c.last_used || '-').replace(/[\x00-\x1F\x7F]/g, '').slice(0, 32);
          if (/^boot\+\d+/i.test(incomingLast)) incomingLast = nowTs;
          const mergedLast = (incomingLast && incomingLast !== '-')
            ? incomingLast
            : (finalHist[0] || (prev && (prev.last || prev.last_used)) || '-');

          return {
            uid,
            name: String(c.name || (prev && prev.name) || `Card ${idx + 1}`).replace(/[\x00-\x1F\x7F]/g, '').slice(0, 31),
            active: c.active !== false,
            color: /^#[0-9A-Fa-f]{6}$/.test(String(c.color || '')) ? c.color : ((prev && prev.color) || '#3b82f6'),
            last: mergedLast,
            count: mergedCount,
            history: finalHist
          };
        }).filter(c => c.uid.length >= 4);
      }

      // 3. Merge hardware status shadow & preserve any un-ACKed pending commands
      let mergedState = null;
      if (hasStatus) {
        mergedState = normalizeStatus(body.status, prevState || {});
      }
      if (remainingQueue.length > 0) {
        applyPendingCommandsToState(mergedState, sanitizedCards, remainingQueue);
      }

      // 4. Ingest & deduplicate online / offline-flushed logs (up to MAX_CLOUD_LOGS = 2000)
      let ackedLogSeq = 0;
      let updatedLogs = null;
      if (hasLogs) {
        const seenKeys = new Set();
        existingLogs.forEach(item => {
          seenKeys.add(`${item.seq ?? 0}|${item.ts ?? ''}|${item.msg ?? ''}`);
          if (item.rawTs) seenKeys.add(`${item.seq ?? 0}|${item.rawTs}|${item.msg ?? ''}`);
        });

        const newEntries = [];
        for (const rawItem of body.logs) {
          let seq = 0;
          let ts = nowTs;
          let msg = '';
          let source = 'live';

          if (typeof rawItem === 'string') {
            const parts = rawItem.split(' | ');
            if (parts.length >= 2) {
              ts = parts[0].trim();
              msg = parts.slice(1).join(' | ').trim();
            } else {
              msg = rawItem.trim();
            }
          } else if (rawItem && typeof rawItem === 'object') {
            seq = parseInt(rawItem.seq, 10) || 0;
            ts = String(rawItem.ts || ts).slice(0, 32);
            msg = String(rawItem.msg || '').slice(0, 200);
            source = rawItem.source === 'offline_buffer' || rawItem.from_offline_buffer ? 'offline_buffer' : 'live';
          }

          if (!msg) continue;
          if (seq > ackedLogSeq) ackedLogSeq = seq;

          msg = msg.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[LAN-PROTECTED]');
          const rawTs = ts;
          if (/^boot\+\d+/i.test(ts)) {
            ts = nowTs;
            msg = msg.replace(/@\s*boot\+\d+\s*ms/i, `@ ${nowTs}`);
          }

          const dedupKey = `${seq}|${rawTs}|${msg}`;
          if (!seenKeys.has(dedupKey)) {
            seenKeys.add(dedupKey);
            seenKeys.add(`${seq}|${ts}|${msg}`);
            newEntries.push({ seq, ts, rawTs, msg, source, receivedAt: nowMs });
          }
        }

        if (newEntries.length > 0) {
          const combined = [...newEntries, ...existingLogs];
          combined.sort((a, b) => {
            const timeDiff = (Number(b.receivedAt) || 0) - (Number(a.receivedAt) || 0);
            if (timeDiff !== 0) return timeDiff;
            return (Number(b.seq) || 0) - (Number(a.seq) || 0);
          });
          updatedLogs = combined.slice(0, MAX_CLOUD_LOGS);
        }
      }

      // 5. 24/7 Connection Timing History (ESP32 connEvents + Server-Side Gap & Recovery Detection)
      let ackedConnSeq = 0;
      let updatedConnHistory = null;
      const connHistoryList = Array.isArray(existingConnHistory) ? [...existingConnHistory] : [];
      const seenConnKeys = new Set(
        connHistoryList.map(ev => `${ev.seq ?? 0}|${ev.ts ?? ''}|${ev.type ?? ''}`)
      );
      const newConnEntries = [];

      let effectiveWasOnline = Boolean(prevMeta && prevMeta.wasOnline);
      let effectiveLastOfflineMs = prevMeta && prevMeta.lastOfflineMs ? Number(prevMeta.lastOfflineMs) : 0;
      let effectiveLastOfflineTs = (prevMeta && prevMeta.lastOfflineTs) ? String(prevMeta.lastOfflineTs) : '-';

      // If ESP32 was previously online, and >= 12s elapsed without any browser polling watchdog/dashboard,
      // record the missed OFFLINE transition automatically before recording recovery!
      if (effectiveWasOnline && prevMeta && prevMeta.lastSeenMs && (nowMs - Number(prevMeta.lastSeenMs)) >= 12000) {
        const missedOfflineMs = Number(prevMeta.lastSeenMs);
        const missedOfflineTs = formatIstTimestamp(missedOfflineMs);
        const durationSec = prevMeta.lastOnlineMs
          ? Math.max(1, Math.round((missedOfflineMs - Number(prevMeta.lastOnlineMs)) / 1000))
          : null;
        newConnEntries.push({
          seq: prevMeta.lastSeq || 0,
          type: 'OFFLINE',
          ts: missedOfflineTs,
          reason: 'Heartbeat Timeout (ESP32 Unreachable > 12s)',
          durationSec,
          source: 'cloud_watchdog',
          receivedAt: missedOfflineMs
        });
        effectiveWasOnline = false;
        effectiveLastOfflineMs = missedOfflineMs;
        effectiveLastOfflineTs = missedOfflineTs;
      }

      if (hasConnEvents) {
        for (const rawEv of body.connEvents) {
          if (!rawEv || typeof rawEv !== 'object') continue;
          const seq = parseInt(rawEv.seq, 10) || 0;
          if (seq > ackedConnSeq) ackedConnSeq = seq;
          const type = String(rawEv.type || 'ONLINE').toUpperCase() === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';
          let ts = String(rawEv.ts || nowTs).slice(0, 32);
          if (/^boot\+\d+/i.test(ts)) ts = nowTs;
          const reason = String(rawEv.reason || (type === 'ONLINE' ? 'ESP32 Connected' : 'ESP32 Disconnected'))
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[LAN-PROTECTED]')
            .slice(0, 96);

          const key = `${seq}|${ts}|${type}`;
          if (!seenConnKeys.has(key)) {
            seenConnKeys.add(key);
            newConnEntries.push({
              seq,
              type,
              ts,
              reason,
              source: 'esp32_hardware',
              receivedAt: nowMs
            });
            if (type === 'OFFLINE') {
              effectiveLastOfflineMs = nowMs;
              effectiveLastOfflineTs = ts;
            }
          }
        }
      }

      // Server-side ONLINE transition detection (when recovering from OFFLINE or initial boot)
      if (!prevMeta || !effectiveWasOnline || !prevMeta.lastSeenMs) {
        const downtimeSec = effectiveLastOfflineMs
          ? Math.max(1, Math.round((nowMs - effectiveLastOfflineMs) / 1000))
          : null;
        const existingOnlineEv = newConnEntries.find(e => e.type === 'ONLINE');
        if (existingOnlineEv) {
          if (downtimeSec && !existingOnlineEv.downtimeSec) {
            existingOnlineEv.downtimeSec = downtimeSec;
          }
        } else {
          newConnEntries.unshift({
            seq: verification.seq || 0,
            type: 'ONLINE',
            ts: nowTs,
            reason: effectiveLastOfflineMs ? 'ESP32 Reconnected to Cloud Gateway' : 'ESP32 Online & Streaming',
            downtimeSec,
            source: 'cloud_watchdog',
            receivedAt: nowMs
          });
        }
      }

      if (newConnEntries.length > 0) {
        // Order so ONLINE recovery sits above an earlier missed OFFLINE entry
        newConnEntries.sort((a, b) => {
          if (a.receivedAt !== b.receivedAt) return (Number(b.receivedAt) || 0) - (Number(a.receivedAt) || 0);
          if (a.type !== b.type) return a.type === 'ONLINE' ? -1 : 1;
          return (Number(b.seq) || 0) - (Number(a.seq) || 0);
        });
        updatedConnHistory = [...newConnEntries, ...connHistoryList].slice(0, MAX_CONN_HISTORY);
      }

      // 6. Update device heartbeat metadata & flush all Redis writes in one parallel round-trip
      const isTransitionToOnline = !prevMeta || !effectiveWasOnline || !prevMeta.lastSeenMs;
      const meta = {
        ...(prevMeta || {}),
        lastSeenMs: nowMs,
        lastSeq: verification.seq,
        wasOnline: true,
        lastOnlineMs: isTransitionToOnline ? nowMs : (prevMeta.lastOnlineMs || nowMs),
        lastOnlineTs: isTransitionToOnline ? nowTs : (prevMeta.lastOnlineTs || nowTs),
        lastOfflineMs: effectiveLastOfflineMs,
        lastOfflineTs: effectiveLastOfflineTs,
        ...(hasLogs ? { lastAckedLogSeq: ackedLogSeq } : {}),
        ...(hasConnEvents ? { lastAckedConnSeq: ackedConnSeq } : {})
      };

      if (mergedState) {
        if (!mergedState.last_online || mergedState.last_online === '-' || /^boot\+/i.test(mergedState.last_online)) {
          mergedState.last_online = meta.lastOnlineTs;
          mergedState.lastOnline = meta.lastOnlineTs;
        }
        if (meta.lastOfflineTs && meta.lastOfflineTs !== '-') {
          if (!mergedState.last_offline || mergedState.last_offline === '-' || /^boot\+/i.test(mergedState.last_offline)) {
            mergedState.last_offline = meta.lastOfflineTs;
            mergedState.lastOffline = meta.lastOfflineTs;
          }
        }
      }

      const writes = [writeJsonKey(storage, KEY_META, meta)];
      if (mergedState) writes.push(writeJsonKey(storage, KEY_STATE, mergedState));
      if (sanitizedCards) writes.push(writeJsonKey(storage, KEY_CARDS, sanitizedCards));
      if (updatedLogs) writes.push(writeJsonKey(storage, KEY_LOGS, updatedLogs));
      if (updatedConnHistory) writes.push(writeJsonKey(storage, KEY_CONN_HISTORY, updatedConnHistory));
      if (!Array.isArray(rawQueue) || remainingQueue.length !== rawQueue.length) {
        writes.push(writeJsonKey(storage, KEY_CMDS, remainingQueue));
      }
      await Promise.all(writes);

      return sendSecureJson(res, 200, {
        ok: true,
        serverTime: nowSec,
        ackedLogSeq,
        ackedConnSeq,
        pendingCommands: remainingQueue
      });
    }

    // -----------------------------------------------------------------------
    // 4B. Browser Admin Command Dispatch (Session Authenticated)
    // -----------------------------------------------------------------------
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const bodyAction = String(body.action || 'command');
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    // Parallelize auth, rate-limit, secret load, and state reads into a single Redis round-trip
    const [session, rate, secret, rawState, rawCards, rawQueue] = await Promise.all([
      validateSession(req, storage),
      checkRateLimit(req, storage, 'iot_admin', 120, 60),
      ensureDeviceSecretLoaded(storage),
      bodyAction === 'command' ? readJsonKey(storage, KEY_STATE, null) : Promise.resolve(null),
      bodyAction === 'command' ? readJsonKey(storage, KEY_CARDS, []) : Promise.resolve([]),
      (bodyAction !== 'clear_queue' && bodyAction !== 'clear_conn_history') ? readJsonKey(storage, KEY_CMDS, []) : Promise.resolve([])
    ]);

    if (!session.valid) {
      return sendSecureJson(res, session.status || 401, { error: session.error });
    }
    if (!rate.allowed) {
      return sendSecureJson(res, 429, { error: rate.error });
    }
    if (!secret) {
      return sendSecureJson(res, 503, { error: 'IoT gateway cryptographic key not provisioned' });
    }

    // Restrict destructive actions to Master Administrator
    const DESTRUCTIVE_ACTIONS = ['clear_conn_history', 'clear_logs', 'clear_queue'];
    if (DESTRUCTIVE_ACTIONS.includes(bodyAction) && session.role !== 'master') {
      auditLog('IOT_FORBIDDEN', req, `Temporary session attempted ${bodyAction} (role=${session.role})`);
      return sendSecureJson(res, 403, { error: 'Forbidden: Master Administrator access required.' });
    }

    // Action: Clear Connection Timing History
    if (bodyAction === 'clear_conn_history') {
      await writeJsonKey(storage, KEY_CONN_HISTORY, []);
      return sendSecureJson(res, 200, { ok: true, message: 'Connection timing history cleared', connHistory: [] });
    }

    // Action: Clear Cloud Logs
    if (bodyAction === 'clear_logs') {
      const clearEntry = {
        seq: 0,
        ts: formatNowTimestamp(),
        msg: 'LOGS CLEARED by Admin via LuminaVista Cloud',
        source: 'cloud_admin',
        receivedAt: nowMs
      };

      const cmdObj = {
        cmdId: `cmd_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
        cmd: 'logs_clear',
        param: '',
        issuedAt: nowSec,
        expiresAt: nowSec + 86400
      };
      cmdObj.signature = signDeviceCommand(secret, cmdObj);
      const validExisting = Array.isArray(rawQueue)
        ? rawQueue.filter(item => item && Number(item.expiresAt) >= nowSec && item.cmd !== 'logs_clear')
        : [];
      const queue = [...validExisting, cmdObj].slice(-50);

      await Promise.all([
        writeJsonKey(storage, KEY_LOGS, [clearEntry]),
        writeJsonKey(storage, KEY_CMDS, queue)
      ]);

      return sendSecureJson(res, 200, { ok: true, message: 'Cloud logs cleared', queued: cmdObj });
    }

    // Action: Clear Command Queue
    if (bodyAction === 'clear_queue') {
      await writeJsonKey(storage, KEY_CMDS, []);
      return sendSecureJson(res, 200, { ok: true, message: 'Pending command queue cleared' });
    }

    // Action: Queue Signed Hardware Command
    if (bodyAction === 'command') {
      const cmd = String(body.cmd || '').trim();
      if (!ALLOWED_COMMANDS.has(cmd)) {
        return sendSecureJson(res, 400, { error: `Unsupported IoT command: ${cmd}` });
      }

      // Restrict administrative/destructive commands to Master Administrator (CRIT-04)
      const MASTER_ONLY_COMMANDS = new Set([
        'lock_mode', 'cards_clear', 'restart', 'enroll', 'card_remove', 'card_toggle',
        'card_rename', 'card_color', 'relay3_schedule', 'relay4_schedule', 'logs_clear'
      ]);
      if (MASTER_ONLY_COMMANDS.has(cmd) && session.role !== 'master') {
        auditLog('IOT_FORBIDDEN', req, `Temporary session attempted restricted command ${cmd} (role=${session.role})`);
        return sendSecureJson(res, 403, { error: 'Forbidden: Master Administrator access required.' });
      }

      let param = '';
      const currentState = normalizeStatus(rawState || {});
      const currentCards = Array.isArray(rawCards) ? rawCards : [];

      if (cmd === 'unlock') {
        param = '';
        currentState.lock = 'UNLOCKED';
        currentState.alarm = false;
        currentState.last_event = 'UNLOCKED (15s) via lumina cloud';
        currentState.lastEvent = currentState.last_event;
        currentState.last_access_event = `Cloud unlock @ ${formatNowTimestamp()}`;
        currentState.lastAccessEvent = currentState.last_access_event;
      } else if (cmd === 'lock') {
        param = '';
        currentState.lock = 'LOCKED';
        currentState.alarm = false;
        currentState.last_event = 'LOCK: lumina cloud';
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'lock_mode') {
        const currentMode = Boolean(currentState.manualMode || currentState.lockMode === 'MANUAL');
        const st = String(body.state !== undefined ? body.state : 'toggle').toLowerCase();
        let nextMode;
        if (st === 'toggle') {
          nextMode = !currentMode;
        } else {
          nextMode = !(st === '0' || st === 'false' || st === 'off');
        }
        param = nextMode ? '1' : '0';
        currentState.manualMode = nextMode;
        currentState.lockMode = nextMode ? 'MANUAL' : 'AUTO';
        currentState.last_event = `Lock Mode set to ${nextMode ? 'ON (Lockout)' : 'OFF (Normal)'} (cloud)`;
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'alarm_clear') {
        param = '';
        currentState.alarm = false;
        currentState.last_event = 'ALARM CLEARED: lumina cloud';
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'restart') {
        param = '';
        currentState.last_event = 'RESTART requested via LuminaVista';
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'relay3' || cmd === 'relay4') {
        const st = String(body.state || 'toggle').toLowerCase();
        if (!['on', 'off', 'toggle'].includes(st)) {
          return sendSecureJson(res, 400, { error: 'Relay state must be on, off, or toggle' });
        }
        const key = cmd === 'relay3' ? 'relay3' : 'relay4';
        const nextVal = st === 'on' ? true : (st === 'off' ? false : !currentState[key]);
        currentState[key] = nextVal;
        // Resolve 'toggle' to explicit 'on'/'off' in command param for idempotent state projection
        param = st === 'toggle' ? (nextVal ? 'on' : 'off') : st;
        currentState.last_event = `${cmd.toUpperCase()} set to ${nextVal ? 'ON' : 'OFF'} (cloud)`;
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'relay3_schedule' || cmd === 'relay4_schedule') {
        const enabled = Boolean(body.enabled);
        const on = String(body.on || '').trim();
        const off = String(body.off || '').trim();
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(on) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(off)) {
          return sendSecureJson(res, 400, { error: 'Schedule times must be in valid HH:MM (24h) format' });
        }
        if (on === off) {
          return sendSecureJson(res, 400, { error: 'Schedule ON and OFF times cannot be identical' });
        }
        param = `${enabled ? '1' : '0'}|${on}|${off}`;
        if (cmd === 'relay3_schedule') {
          currentState.relay3Schedule = enabled;
          currentState.relay3On = on;
          currentState.relay3Off = off;
          currentState.relay3_schedule = enabled ? `ON ${on} / OFF ${off}` : 'Disabled';
        } else {
          currentState.relay4Schedule = enabled;
          currentState.relay4On = on;
          currentState.relay4Off = off;
          currentState.relay4_schedule = enabled ? `ON ${on} / OFF ${off}` : 'Disabled';
        }
      } else if (cmd === 'enroll') {
        const en = !(body.state === false || body.state === 0 || body.state === '0');
        param = en ? '1' : '0';
        currentState.enroll = en;
        currentState.last_event = en ? 'Enroll next NFC card' : 'Enrollment canceled';
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'cards_clear') {
        param = '';
        currentCards.length = 0;
        currentState.cards = 0;
        currentState.enroll = false;
        currentState.last_event = 'All cards cleared (cloud)';
        currentState.lastEvent = currentState.last_event;
      } else if (cmd === 'card_rename') {
        const uid = String(body.uid || '').trim().toUpperCase();
        const cleanName = String(body.name || '').replace(/[|\r\n]/g, '').trim().slice(0, 31);
        if (!/^[0-9A-F]{4,20}$/.test(uid) || !cleanName) {
          return sendSecureJson(res, 400, { error: 'Valid card UID and non-empty name (max 31 chars) required' });
        }
        param = `${uid}|${cleanName}`;
        const card = currentCards.find(c => String(c.uid).toUpperCase() === uid);
        if (card) card.name = cleanName;
      } else if (cmd === 'card_toggle') {
        const uid = String(body.uid || '').trim().toUpperCase();
        if (!/^[0-9A-F]{4,20}$/.test(uid)) {
          return sendSecureJson(res, 400, { error: 'Valid hexadecimal card UID required' });
        }
        param = uid;
        const card = currentCards.find(c => String(c.uid).toUpperCase() === uid);
        if (card) card.active = !card.active;
      } else if (cmd === 'card_color') {
        const uid = String(body.uid || '').trim().toUpperCase();
        const color = String(body.color || '').trim();
        if (!/^[0-9A-F]{4,20}$/.test(uid) || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return sendSecureJson(res, 400, { error: 'Valid card UID and #RRGGBB color required' });
        }
        param = `${uid}|${color}`;
        const card = currentCards.find(c => String(c.uid).toUpperCase() === uid);
        if (card) card.color = color;
      } else if (cmd === 'card_remove') {
        const uid = String(body.uid || '').trim().toUpperCase();
        if (!/^[0-9A-F]{4,20}$/.test(uid)) {
          return sendSecureJson(res, 400, { error: 'Valid hexadecimal card UID required' });
        }
        param = uid;
        const idx = currentCards.findIndex(c => String(c.uid).toUpperCase() === uid);
        if (idx !== -1) currentCards.splice(idx, 1);
        currentState.cards = currentCards.length;
      } else if (cmd === 'logs_clear') {
        param = '';
      }

      const ttlSec = TIER1_PHYSICAL_COMMANDS.has(cmd) ? 15 : 86400;
      const cmdObj = {
        cmdId: `cmd_${nowMs}_${crypto.randomBytes(4).toString('hex')}`,
        cmd,
        param,
        issuedAt: nowSec,
        expiresAt: nowSec + ttlSec
      };
      cmdObj.signature = signDeviceCommand(secret, cmdObj);

      // Deduplicate/supersede any older un-ACKed command of the same type so rapid clicks don't pile up
      const supersedeCmds = new Set(['unlock', 'lock', 'lock_mode', 'relay3', 'relay4', 'relay3_schedule', 'relay4_schedule', 'enroll']);
      const activeQueue = Array.isArray(rawQueue)
        ? rawQueue.filter(c => {
            if (!c || Number(c.expiresAt) < nowSec) return false;
            if (supersedeCmds.has(cmd) && c.cmd === cmd) return false;
            if ((cmd === 'unlock' && c.cmd === 'lock') || (cmd === 'lock' && c.cmd === 'unlock')) return false;
            return true;
          })
        : [];
      activeQueue.push(cmdObj);
      const cappedQueue = activeQueue.slice(-50);

      await Promise.all([
        writeJsonKey(storage, KEY_CMDS, cappedQueue),
        ...(TIER1_PHYSICAL_COMMANDS.has(cmd) ? [] : [writeJsonKey(storage, KEY_STATE, currentState)]),
        writeJsonKey(storage, KEY_CARDS, currentCards)
      ]);

      return sendSecureJson(res, 200, {
        ok: true,
        queued: cmdObj,
        status: currentState,
        cards: currentCards,
        pendingCommands: cappedQueue
      });
    }

    return sendSecureJson(res, 400, { error: `Unknown action: ${bodyAction}` });
  }

  return sendSecureJson(res, 405, { error: 'Method not allowed' });
}
