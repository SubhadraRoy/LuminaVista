# Adversarial Security Exploration & Defensive Assessment Handoff Report

**Agent**: `explorer_r4_2`  
**Date**: 2026-10-16T22:35:00Z  
**Scope**: 
1. ESP32 Smart Lock Hardware Telemetry Gateway (`api/iot.js`)
2. Multi-Device Cloud Sync and Hydration (`api/sync.js`, `modules/cloud-sync.js`)

---

## 1. Observation

### Surface 1: ESP32 Smart Lock Hardware Telemetry Gateway (`api/iot.js`)

#### 1.1 5-Layer Request Authentication & Cryptographic Verification
Directly observed in `api/iot.js:188-272` (`verifyDeviceRequest`):
- **Layer 1: Provisioned Device ID Validation (`api/iot.js:190, 196-199`)**:
  ```js
  const deviceId = String(headers['x-lumina-device-id'] || '').trim();
  if (!deviceId || deviceId !== DEFAULT_DEVICE_ID) {
    auditLog('IOT_UNKNOWN_DEVICE', req, `Device: ${deviceId}`);
    return { valid: false, status: 401, error: 'Unknown or unauthorized IoT device ID' };
  }
  ```
  Strictly compares incoming header against `DEFAULT_DEVICE_ID` (`process.env.IOT_DEVICE_ID || 'esp32-main-door-01'`).
- **Layer 2: Timestamp Drift Window (`api/iot.js:201-208`)**:
  ```js
  const ts = parseInt(tsStr, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  const DRIFT_WINDOW_SEC = 60; // +-60s drift window
  const NONCE_TTL_SEC = DRIFT_WINDOW_SEC * 2; // 120s (Invariant: T_nonce >= 2W)
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > DRIFT_WINDOW_SEC) {
    auditLog('IOT_TIMESTAMP_SKEW', req, `ts=${tsStr}, now=${nowSec}`);
    return { valid: false, status: 401, error: 'Expired or skewed timestamp', serverTime: nowSec };
  }
  ```
  Enforces a strict $\pm 60$ second drift window relative to server UTC epoch.
- **Layer 3: Constant-Time HMAC-SHA256 Signature Verification (`api/iot.js:166-170, 214-234`)**:
  ```js
  export function computeDeviceSignature(secret, deviceId, timestamp, nonce, seq, rawBodyStr = '') {
    const bodyHash = crypto.createHash('sha256').update(String(rawBodyStr), 'utf8').digest('hex').toLowerCase();
    const canonical = `${deviceId}.${timestamp}.${nonce}.${seq}.${bodyHash}`;
    return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toLowerCase();
  }
  ```
  ```js
  if (
    expectedBuf.length !== 32 ||
    receivedBuf.length !== 32 ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    auditLog('IOT_BAD_SIGNATURE', req, 'HMAC mismatch');
    return { valid: false, status: 401, error: 'Cryptographic HMAC-SHA256 verification failed' };
  }
  ```
  Employs `crypto.timingSafeEqual` with explicit 32-byte buffer length bounds guards, preventing variable-time side-channel attacks and RangeErrors.
- **Layer 4: Nonce Format Validation (`api/iot.js:210-212`)**:
  ```js
  if (!/^[a-f0-9]{16,64}$/i.test(nonce)) {
    return { valid: false, status: 401, error: 'Invalid cryptographic nonce format' };
  }
  ```
  Rejects malformed, injected, or non-hexadecimal nonce tokens.
- **Layer 5: Atomic Nonce Anti-Replay Lock (`api/iot.js:237-242`)**:
  ```js
  const nonceKey = `iot:nonce:${deviceId}:${nonce}`;
  const lockRes = await storage.set(nonceKey, '1', { nx: true, ex: NONCE_TTL_SEC });
  if (lockRes !== 'OK') {
    auditLog('IOT_REPLAY_BLOCKED', req, `Duplicate nonce: ${nonce}`);
    return { valid: false, status: 401, error: 'Replay attack detected: nonce already used' };
  }
  ```
  Executes an atomic Redis `SET NX EX 120` key reservation.

#### 1.2 Monotonic Sequence Number Validation (`lastSeq`)
Directly observed in `api/iot.js:244-262, 670-678, 933`:
- In `verifyDeviceRequest` (`api/iot.js:251-260`):
  ```js
  if (meta && typeof meta.lastSeq === 'number' && seq < (meta.lastSeq || 0)) {
    auditLog('IOT_STALE_SEQUENCE', req, `seq=${seq}, lastSeq=${meta.lastSeq}`);
    return {
      valid: false,
      status: 401,
      error: 'Stale or out-of-order telemetry packet rejected',
      lastSeq: meta.lastSeq,
      serverTime: nowSec
    };
  }
  ```
- In POST handler (`api/iot.js:671-678`):
  ```js
  if (prevMeta && typeof prevMeta.lastSeq === 'number' && verification.seq < (prevMeta.lastSeq || 0)) {
    auditLog('IOT_STALE_SEQUENCE', req, `seq=${verification.seq}, lastSeq=${prevMeta.lastSeq}`);
    return sendSecureJson(res, 401, {
      error: 'Stale or out-of-order telemetry packet rejected',
      lastSeq: prevMeta.lastSeq,
      serverTime: nowSec
    });
  }
  ```
- Stored sequence update (`api/iot.js:933`):
  ```js
  lastSeq: Math.max(verification.seq, prevMeta?.lastSeq || 0)
  ```

#### 1.3 Replay Nonce Deduplication Memory and Cache Bounds
Directly observed in `api/iot.js:204, 237-242, 633`:
- Nonce TTL: `NONCE_TTL_SEC = 120` seconds ($2 \times W = 2 \times 60\text{s}$).
- Rate limit: `checkRateLimit(req, storage, 'iot_hardware', 300, 60)` enforces a maximum of 300 requests per 60 seconds (average 5 req/sec).
- Under maximum saturated traffic, at most $5 \times 120 = 600$ active nonce keys exist in Redis concurrently ($\approx 30\text{ KB}$ memory footprint), preventing Redis memory exhaustion.

#### 1.4 Physical Command TTLs and Command Validation
Directly observed in `api/iot.js:65, 1203-1211, 1214-1232`:
- **Dual-Tier TTLs**:
  ```js
  const TIER1_PHYSICAL_COMMANDS = new Set(['unlock', 'lock', 'lock_mode', 'alarm_clear', 'enroll', 'restart']);
  const ttlSec = TIER1_PHYSICAL_COMMANDS.has(cmd) ? 15 : 86400;
  ```
  Physical actuation commands (`unlock`, `lock`, etc.) expire in strictly **15 seconds**. Configuration commands (`relay3_schedule`, etc.) expire in **24 hours** (86,400 seconds).
- **Mutual HMAC Signing for Outbound Hardware Commands (`api/iot.js:175-178, 1211`)**:
  ```js
  export function signDeviceCommand(secret, cmdObj) {
    const canonical = `${cmdObj.cmdId}.${cmdObj.cmd}.${cmdObj.param || ''}.${cmdObj.issuedAt}.${cmdObj.expiresAt}`;
    return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex').toLowerCase();
  }
  ```
- **Command Superseding and Queue Capping (`api/iot.js:1214-1225`)**:
  ```js
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
  ```
  Queue is hard-capped at 50 active commands, and mutually conflicting or rapid repeated commands are superseded automatically.
- **Physical Command Shadow Isolation (`api/iot.js:1228-1230`)**:
  `if (!TIER1_PHYSICAL_COMMANDS.has(cmd)) { p.set(KEY_STATE, JSON.stringify(currentState)); }`
  Tier 1 physical commands are never written to persistent `KEY_STATE` in advance; they are dynamically projected in memory until physical execution is ACKed by ESP32 via `ackCmdIds`.

#### 1.5 Hardware Firmware Immutability
- Directly verified via filesystem inspection: No `firmware/**` directory exists on disk in the repository, and `git status` shows zero firmware modifications.
- The gateway fully complies with the hardware wire contract (`x-lumina-*` headers, signed JSON bodies, ACK return buffers) without altering physical hardware firmware.

---

### Surface 2: Multi-Device Cloud Sync and Hydration (`api/sync.js`, `modules/cloud-sync.js`)

#### 2.1 Non-Destructive Union Merge Logic
Directly observed in `modules/cloud-sync.js`:
- **Calendar Merge (`modules/cloud-sync.js:228-330`)**:
  Local events are mapped by `String(ev.id)` into `localMap`. Cloud events are iterated; if present in both, timestamps (`updatedAt`, `lastModified`, `updated`, `createdAt`) are compared. If `cloudTs > localTs`, the cloud event is adopted; otherwise local is preserved. All remaining unkeyed or local-only events from `localMap` are retained (`lines 305-310`).
- **Notes Vault Merge (`modules/cloud-sync.js:555-657`)**:
  Notes are matched by `String(n.id)`. When timestamps match or are absent, content lengths are checked (`lines 610-617`): local content is preserved if non-empty, preventing overwriting in-progress notes. Local notes not in the cloud are preserved.
- **Virtual File System (VFS) Merge (`modules/cloud-sync.js:456-553`)**:
  Creates an explicit prototype-free container: `const mergedVfs = Object.create(null)`. Seeds with local files, then non-destructively merges cloud files. If timestamps match, non-empty cloud content fills empty local stubs, but existing local code is never clobbered. Local files missing from the cloud are preserved.

#### 2.2 Session Token and Password Hash Protection (Zero Leakage)
Directly observed in `api/sync.js`, `modules/cloud-sync.js`, and `api/_lib/auth-guard.js`:
- **Server-Side Credential Stripping (`api/sync.js:66-71, 83`)**:
  ```js
  const isMaster = auth.role === 'master';
  const safeState = state ? { ...state } : null;
  if (safeState && !isMaster) {
    delete safeState.admin_passwords;
  }
  ```
  Temporary and unauthenticated sessions never receive admin password credentials.
- **Client Sync Payload Credential Immutability (`api/sync.js:121-123`)**:
  ```js
  // Invariant: admin credentials in master_workspace_state cannot be overwritten by client sync payloads.
  // Admin credentials must be managed strictly and sovereignly via api/admin.js.
  admin_passwords: currentState.admin_passwords || [],
  ```
  Client POST requests cannot overwrite, inject, or tamper with `admin_passwords` in Redis; only `api/admin.js` can manage keys.
- **Zero Session Token Leakage in Client Payloads (`modules/cloud-sync.js:136-159`)**:
  `getSyncPayload()` serializes workspace state (calendar, chat, whiteboard, vfs, notes, theme) but strictly omits `lumina_session_id`. Authentication tokens are only transmitted in the `x-session-id` HTTP header.
- **Deep Sanitization (`api/_lib/auth-guard.js:378-387`)**:
  `sanitizeDeep` redacts sensitive keys matching `/^(key|secret|password|token|apiKey|api_key|access_token|refresh_token|client_secret|signing_key|private_key)$/i` with `'[REDACTED]'`, and scrubs JWTs and bearer tokens from all string values.

#### 2.3 Background Tab Hijacking Prevention
Directly observed in `modules/cloud-sync.js:15, 190-194, 728-741, 821-825`:
- `hasRestoredInitialTab` variable latches to `true` after initial cold boot (`line 15, 193`).
- In `hydrateWorkspaceFromState` (`lines 731-739`):
  ```js
  if (options && options.isInitial && !hasRestoredInitialTab) {
    hasRestoredInitialTab = true;
    if (window.currentActiveTab !== state.activeTabId) {
      window.currentActiveTab = state.activeTabId;
      if (typeof window.switchTab === 'function') {
        window.switchTab(state.activeTabId);
      }
    }
  }
  ```
- The periodic 90-second background sync interval (`lines 821-825`) calls `pullFromCloud(false)` with `isInitial = false`. Consequently, `window.switchTab` is NEVER triggered during background cycles.

#### 2.4 Prototype Pollution and State Poisoning Audit
- **Client-Side VFS Prototype Filtering (`modules/cloud-sync.js:469-504`)**:
  ```js
  const isForbiddenKey = (key) => {
    return key === '__proto__' || key === 'prototype' || key === 'constructor';
  };
  ```
  Keys matching `__proto__`, `prototype`, or `constructor` are blocked from being added to `window.vfs` or local storage.
- **Server-Side Gap in `sanitizeDeep` (`api/_lib/auth-guard.js:380-388`)**:
  ```js
  const result = {};
  for (const [k, v] of Object.entries(data)) {
    if (SENSITIVE_KEY_NAMES.test(k) && typeof v === 'string') {
      result[k] = '[REDACTED]';
    } else {
      result[k] = sanitizeDeep(v);
    }
  }
  return result;
  ```
  `sanitizeDeep` does not skip `__proto__`, `constructor`, or `prototype`. While `Object.entries()` does not iterate inherited prototype properties, objects deserialized from JSON can contain an own property named `__proto__`, which mutates the prototype of `result` upon assignment (`result['__proto__'] = ...`).
- **Server-Side Gap in `api/sync.js:101-125`**:
  Input fields in `req.body.data` (`calendar`, `notes`, `vfs`, `activeTabId`) are merged into `newState` without explicit type guards (`Array.isArray`, object validation, or string length bounds).

---

## 2. Logic Chain

1. **Replay Invariant Verification ($T_{nonce} \ge 2W$)**:
   - Observation: Drift window $W = 60\text{s}$, Nonce TTL $T_{nonce} = 120\text{s}$.
   - Deduction: For any request timestamp $T_0$, the server accepts requests received between $T_0 - 60$ and $T_0 + 60$. The maximum duration between the earliest acceptable arrival time and latest acceptable arrival time is $120\text{s}$. Because Redis records the nonce with a $120\text{s}$ TTL upon first arrival, any replay attempt within $120\text{s}$ will fail on `storage.set(..., { nx: true })`. Any replay attempt after $120\text{s}$ will have $|T_{server} - T_0| > 60\text{s}$ and will fail on the timestamp drift check. Therefore, the window of vulnerability is mathematically zero.

2. **Sequence Monotonicity Verification**:
   - Observation: `api/iot.js` rejects incoming telemetry if `seq < meta.lastSeq`.
   - Deduction: Even within the 60-second drift window, an attacker who intercepts an earlier packet cannot replay it out-of-order after a higher sequence packet has been processed. The probe-only action (`body.probeOnly === true`) allows an ESP32 recovering from boot to synchronize its sequence counter with `meta.lastSeq` without violating monotonicity.

3. **Memory & DoS Protection**:
   - Observation: Rate limit is 300 req/min for hardware telemetry. Nonces expire in 120s. Outbound command queue is sliced to 50 (`cappedQueue.slice(-50)`).
   - Deduction: Redis nonce storage is strictly bounded to $\le 600$ keys ($\approx 30\text{ KB}$), and pending commands are bounded to $\le 50$ items. The system cannot be subjected to memory exhaustion or queue flooding.

4. **Physical Safety & Ghost Lock Mitigation**:
   - Observation: Tier 1 physical actuation commands have a 15-second TTL and are never written to `KEY_STATE` prior to ESP32 execution acknowledgment.
   - Deduction: If a network outage occurs right after an admin clicks "Unlock", the command expires harmlessly after 15 seconds. Because the state was only projected dynamically, the cloud UI reverts to LOCKED rather than becoming permanently desynchronized with the physical lock state.

5. **Multi-Device State Integrity**:
   - Observation: `modules/cloud-sync.js` merges calendar, notes, and VFS using additive map algorithms with timestamp comparisons and length-based fallbacks.
   - Deduction: If Device A edits an existing note while Device B creates a new note, both notes survive during hydration. Local unsaved changes are preserved over equal/stale cloud state.

6. **Tab Hijacking Elimination**:
   - Observation: `hasRestoredInitialTab` latches true on first cold boot, and periodic 90s background sync runs with `isInitial = false`.
   - Deduction: Tab switching is strictly confined to page initialization, preventing disruptive UI switches while the user is actively working.

7. **Vulnerability Assessment: Server-Side Prototype Pollution & Type Guard Defenses**:
   - Observation: `sanitizeDeep` in `api/_lib/auth-guard.js` iterates `Object.entries(data)` and assigns `result[k] = sanitizeDeep(v)`. `api/sync.js` assigns `b.calendar`, `b.vfs`, and `b.activeTabId` directly from request bodies.
   - Deduction: If an authenticated client pushes a sync payload containing `{"__proto__": ...}` or non-array structures for `calendar`/`notes`, `result`'s prototype can be manipulated during deep sanitization, or invalid structures can be persisted to Redis, potentially causing downstream crashes or prototype pollution on consumers that merge the payload.

---

## 3. Caveats

1. **Hardware In-the-Loop Emulation**:
   - Testing of `api/iot.js` was conducted via automated test harnesses (`tests/features.test.cjs`, `tests/suite-smart-lock.cjs`, mock HTTP requests, and cryptographic verification suites). Physical ESP32 microcontrollers were not connected to a physical USB/UART programmer during this run.
2. **Firmware Directory Absence**:
   - `firmware/**` is absent from the git repository. The requirement to preserve firmware immutability is satisfied vacuously on the repository level and substantively via strict wire contract adherence.
3. **Redis Backend Mock vs Clustered Production**:
   - Redis operations were evaluated against `getSafeStorage()` (in-memory mock storage in test mode, Upstash/ioredis in deployment). In clustered Redis setups, multi-key pipelines across non-hash-tagged keys require appropriate slot affinity or single-key scoping.

---

## 4. Conclusion & Recommended Defensive Mitigations

### Status Summary
- **ESP32 IoT Gateway (`api/iot.js`)**: **FORTIFIED**. The 5-layer HMAC verification, monotonic sequence checking, atomic anti-replay TTL invariant ($T_{nonce} \ge 2W$), dual-tier command TTLs (15s physical / 24h config), and command queue superseding provide defense-in-depth protection.
- **Cloud Sync Engine (`api/sync.js`, `modules/cloud-sync.js`)**: **SUBSTANTIALLY HARDENED**. Non-destructive union hydration successfully prevents data loss; tab hijacking is eliminated; session tokens and admin passwords are completely insulated from leakage.

### Recommended Targeted Defensive Mitigations
To achieve absolute zero-trust hardening, the following targeted defensive patches are recommended:

1. **Defense-in-Depth Prototype Key Stripping in `api/_lib/auth-guard.js:sanitizeDeep`**:
   Filter out reserved prototype keys before assignment:
   ```js
   for (const [k, v] of Object.entries(data)) {
     if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
       continue;
     }
     ...
   ```
2. **Strict Schema & Type Guards in `api/sync.js:101-125`**:
   Enforce structural type guards on client-provided fields before writing to `newState`:
   ```js
   calendar: Array.isArray(b.calendar) ? b.calendar : currentState.calendar,
   notes: Array.isArray(b.notes) ? b.notes : currentState.notes,
   vfs: (b.vfs && typeof b.vfs === 'object' && !Array.isArray(b.vfs)) ? b.vfs : currentState.vfs,
   activeTabId: (typeof b.activeTabId === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(b.activeTabId))
     ? b.activeTabId 
     : currentState.activeTabId,
   ```
3. **Numeric Regex Validation on IoT Headers in `api/iot.js:201, 244`**:
   Validate `x-lumina-seq` with `/^\d{1,10}$/` and `x-lumina-timestamp` with `/^\d{9,12}$/` to ensure strictly well-formed numeric values before parsing.

---

## 5. Verification Method

To independently verify all findings and validate that no regressions are introduced:

1. **Unit Test Suite**:
   ```bash
   node tests/features.test.cjs
   ```
   *Expected*: 1,102 assertions pass with 0 failures (includes Suite 28 Cloud Sync and Suite 29 Smart Lock).
2. **Recheck All Tasks Audit**:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
   *Expected*: 42 assertions pass with 0 failures (validates zero occurrences of legacy admin strings, non-destructive sync invariants, and line budgets).
3. **Empirical Challenger Suite**:
   ```bash
   node tests/challenger-calendar-empirical.cjs
   ```
   *Expected*: 63 assertions pass with 0 failures.
4. **Syntax Linter**:
   ```bash
   node tests/lint.cjs
   ```
   *Expected*: All 40 JavaScript modules pass syntax checks.
5. **Code Line Budget Audit**:
   Verify file lengths stay strictly under 2,000 lines:
   - `api/iot.js`: 1,248 lines (< 2,000)
   - `api/sync.js`: 136 lines (< 2,000)
   - `modules/cloud-sync.js`: 852 lines (< 2,000)

**Invalidation Conditions**:
- Any unit test failure in `suite-smart-lock.cjs` or `suite-cloud-sync.cjs`.
- Any modification to `firmware/**`.
- Any file exceeding 2,000 lines.
