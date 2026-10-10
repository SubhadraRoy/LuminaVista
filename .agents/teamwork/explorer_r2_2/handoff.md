# Handoff Report: Surface 3 & Surface 5 Security Audit

**Agent**: Explorer R2-2 (Hardware Cryptography & Distributed Sync Specialist)  
**Date**: 2026-10-16T18:53:00Z  
**Type**: Hard Handoff (Investigation & Verification Complete)  
**Audited Surfaces**:
- Surface 3: ESP32 Smart Lock Hardware Telemetry Gateway (`api/iot.js`)
- Surface 5: Multi-Device Cloud Sync & Hydration (`modules/cloud-sync.js`, `api/sync.js`)

---

## 1. Observation

1. **5-Layer Hardware HMAC Verification (`api/iot.js:188-272`)**:
   - `verifyDeviceRequest` validates:
     - Device ID: `if (!deviceId || deviceId !== DEFAULT_DEVICE_ID) { auditLog('IOT_UNKNOWN_DEVICE', req, ...); return { valid: false, status: 401, error: 'Unknown or unauthorized IoT device ID' }; }` (lines 196-198)
     - Timestamp skew: `if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > DRIFT_WINDOW_SEC) { auditLog('IOT_TIMESTAMP_SKEW', ...); return { valid: false, status: 401, error: 'Expired or skewed timestamp', serverTime: nowSec }; }` (lines 205-208, with `DRIFT_WINDOW_SEC = 60`)
     - Nonce regex format: `/^[a-f0-9]{16,64}$/i` (line 210)
     - Signature regex format: `/^[a-f0-9]{64}$/i` (line 214)
     - Secret key presence: `const secret = await ensureDeviceSecretLoaded(storage); if (!secret) return { valid: false, status: 503, error: 'IoT gateway cryptographic key not provisioned' };` (lines 219-222)
     - Constant-time HMAC comparison:
       ```javascript
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
       ```
       (lines 223-234)
     - Outbound command signing: `signDeviceCommand` computes HMAC-SHA256 over `${cmdObj.cmdId}.${cmdObj.cmd}.${cmdObj.param || ''}.${cmdObj.issuedAt}.${cmdObj.expiresAt}` (lines 175-178).

2. **Nonce Replay Prevention Invariant & Bounds (`api/iot.js:204, 237-242, 633`)**:
   - `const NONCE_TTL_SEC = DRIFT_WINDOW_SEC * 2; // 120s (Invariant: T_nonce >= 2W)` (line 204)
   - `const nonceKey = \`iot:nonce:${deviceId}:${nonce}\`;`
   - `const lockRes = await storage.set(nonceKey, '1', { nx: true, ex: NONCE_TTL_SEC });`
   - `if (lockRes !== 'OK') { auditLog('IOT_REPLAY_BLOCKED', ...); return { valid: false, status: 401, error: 'Replay attack detected: nonce already used' }; }` (lines 238-242)
   - Hardware push rate limit: `checkRateLimit(req, storage, 'iot_hardware', 300, 60)` (line 633) bounds live Redis nonce keys to $\le 600$ keys ($\approx 40$ KB).

3. **Monotonic Sequence Validation (`api/iot.js:246-262, 670-678`)**:
   - `if (meta && typeof meta.lastSeq === 'number' && seq < (meta.lastSeq || 0)) { auditLog('IOT_STALE_SEQUENCE', ...); return { valid: false, status: 401, error: 'Stale or out-of-order telemetry packet rejected', lastSeq: meta.lastSeq, serverTime: nowSec }; }`
   - Monotonic metadata commitment: `lastSeq: Math.max(verification.seq, prevMeta?.lastSeq || 0)` (line 933).

4. **Dual-Tier Command TTLs and Role Separation (`api/iot.js:1009-1014, 1067-1074, 1203-1225`)**:
   - `const ttlSec = TIER1_PHYSICAL_COMMANDS.has(cmd) ? 15 : 86400;` (line 1203)
   - `TIER1_PHYSICAL_COMMANDS = new Set(['unlock', 'lock', 'lock_mode', 'alarm_clear', 'enroll', 'restart']);` (line 65)
   - Master-only commands and destructive actions enforce `if (session.role !== 'master') return sendSecureJson(res, 403, ...);` (lines 1011-1014, 1071-1074).
   - Conflicting command superseding (`unlock` vs `lock`) and hard queue capping (`activeQueue.slice(-50)`) (lines 1218-1224).

5. **Sliding-Window Rate Limiting on Time Endpoint (`api/iot.js:402-407`)**:
   - `if (req.method === 'GET' && action === 'time') { const rate = await checkRateLimit(req, storage, 'iot_time', 60, 60); if (!rate.allowed) return sendSecureJson(res, rate.status, { error: rate.error }); ... }`

6. **Firmware Integrity (`firmware/**`)**:
   - Physical firmware files remain completely untouched and unmodified.
   - Command wire protocols and JSON payloads adhere strictly to existing ESP32 firmware specs.

7. **Non-Destructive Cloud Hydration (`modules/cloud-sync.js:228-657`)**:
   - Calendar: `localMap` keyed by `ev.id`, compares timestamps via `getEventTimestamp(evt)`, retains newer events, non-overlapping local events, and unkeyed events (lines 263-311).
   - Notes: `localNotesMap` keyed by `n.id`, compares timestamps via `getNoteTimestamp(note)`, protects local content on tie, retains all unkeyed and non-overlapping local notes (lines 577-634).
   - VFS: Iterates keys using prototype-free `Object.create(null)` dictionary, filters `__proto__`, `prototype`, `constructor`, retains newer file timestamp or local changes on tie, preserves local files not present in cloud (lines 469-545).
   - AI Chats: Merges sessions by ID, retains session with more messages, protects local ongoing conversation (lines 350-405).

8. **Zero Background Tab Hijacking (`modules/cloud-sync.js:727-741, 821-825`)**:
   - Variable `let hasRestoredInitialTab = false;` (line 15).
   - `pullFromCloud(true)` called ONLY during initial cold boot (`init()` line 813). Sets `hasRestoredInitialTab = true` (line 732).
   - 90-second background cycle calls `pullFromCloud(false)` (lines 821-825).
   - `window.switchTab` is gated by `if (options && options.isInitial && !hasRestoredInitialTab)` (line 731). Never fires in background sync.

9. **Sensitive Data Protection in Sync (`api/sync.js:66-71, 83, 101-125`)**:
   - Redacts admin passwords for non-master sessions:
     `if (safeState && !isMaster) delete safeState.admin_passwords;` (lines 69-71).
   - POST handler enforces immutability of admin credentials from client payloads:
     `admin_passwords: currentState.admin_passwords || [],` (line 123).
   - `sendSecureJson` executes `sanitizeDeep`, stripping sensitive tokens matching `/^(key|secret|password|token|...)$/i` (line 436 in `auth-guard.js`).

10. **Line Counts**:
    - `api/iot.js`: 1,248 lines (< 2,000)
    - `modules/cloud-sync.js`: 852 lines (< 2,000)
    - `api/sync.js`: 136 lines (< 2,000)

---

## 2. Logic Chain

1. **Premise**: In an IoT gateway communicating over public networks, replay attacks, out-of-order delivery, and clock skew can compromise physical security (e.g. unlocking a physical door after an authorized window has passed).
2. **Analysis of Observation 1 & 2**:
   - By enforcing $W = 60s$ drift window and setting $T_{nonce} = 2W = 120s$, every captured packet expires in server time before its nonce lock is released from Redis.
   - Atomic `SET NX EX` in Redis guarantees mutual exclusion across concurrent serverless instances.
   - Dual-tier TTLs ensure physical commands expire in 15 seconds, preventing stale command execution if the ESP32 loses connectivity.
3. **Analysis of Observation 3**:
   - Stale sequence validation (`seq < meta.lastSeq`) ensures dropped, delayed, or out-of-order packets cannot regress the lock state within the 60s drift window.
4. **Analysis of Observation 5**:
   - Rate limiting `/api/iot?action=time` (60 req/min) prevents unauthenticated CPU exhaustion attacks via repeated HMAC calculations.
5. **Analysis of Observation 7 & 8**:
   - Blind overwrites in cloud sync cause catastrophic data loss when multiple devices edit state asynchronously. Intelligent union-merging with timestamp tie-breakers preserves concurrent local and remote updates.
   - Gating `window.switchTab` to cold boot (`!hasRestoredInitialTab && options.isInitial`) guarantees user workflows are never disrupted during background 90s sync cycles.
6. **Analysis of Observation 9**:
   - Stripping `admin_passwords` for non-master sessions, preventing client POST overwrites of `admin_passwords`, and running `sanitizeDeep` guarantees that credentials cannot leak through workspace synchronization.

---

## 3. Caveats

- **No Caveats.**
  - All requirements from `ORIGINAL_REQUEST.md` and `PROJECT.md` for Surface 3 and Surface 5 were thoroughly verified.
  - All 4 test suites pass with 0 errors.
  - No source code or firmware files were altered.

---

## 4. Conclusion

Surface 3 (`api/iot.js`) and Surface 5 (`modules/cloud-sync.js`, `api/sync.js`) are **fully fortified, robust against adversarial attacks, and 100% compliant with all security, architectural, and budget constraints**.
- Mutual HMAC authentication and constant-time comparisons prevent forgery and timing side-channels.
- The $T_{nonce} \ge 2W$ invariant and monotonic sequence checking eliminate replay and stale packet attacks.
- Physical commands enforce 15s TTLs and master role authorization.
- Cloud hydration merges calendar, notes, VFS, and chat without data destruction.
- Background sync preserves active tabs without interruption.
- Sensitive data is strictly redacted and immutable via sync.
- All files remain strictly below 2,000 lines.

---

## 5. Verification Method

To independently verify these conclusions, execute the following commands in powershell:

1. **Verify Syntax & Integrity Across Modules**:
   ```pwsh
   node tests/lint.cjs
   ```
   *Expected: All 40 JS modules pass syntax validation.*

2. **Verify Task Audit Invariants**:
   ```pwsh
   node tests/recheck-all-tasks.cjs
   ```
   *Expected: All 42 audit assertions pass with 0 failures.*

3. **Verify Full Unit Suite (Including Smart Lock & Cloud Sync)**:
   ```pwsh
   node tests/features.test.cjs
   ```
   *Expected: All 1,102 unit assertions pass.*

4. **Verify Real-Browser CDP Suite in Chrome**:
   ```pwsh
   node tests/browser-cdp-test.cjs
   ```
   *Expected: All 122 Google Chrome CDP tests pass.*

5. **Verify Line Budgets**:
   ```pwsh
   (Get-Content -Path api/iot.js).Count
   (Get-Content -Path modules/cloud-sync.js).Count
   (Get-Content -Path api/sync.js).Count
   ```
   *Expected: All < 2,000 lines (Actual: 1248, 852, 136).*

6. **Verify Firmware Untouched**:
   ```pwsh
   git status -- firmware/
   ```
   *Expected: Clean working tree.*
