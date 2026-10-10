# Security & Adversarial Audit Analysis: Surface 3 & Surface 5
**Agent**: Explorer R2-2 (Hardware Cryptography & Distributed Sync Specialist)  
**Date**: 2026-10-16T18:52:00Z  
**Target Surfaces**:
- **Surface 3**: ESP32 Smart Lock Hardware Telemetry Gateway (`api/iot.js`)
- **Surface 5**: Multi-Device Cloud Sync & Hydration (`modules/cloud-sync.js`, `api/sync.js`)

---

## Executive Summary
A comprehensive, read-only security and adversarial audit was conducted on Surface 3 (ESP32 IoT Gateway) and Surface 5 (Multi-Device Cloud Sync & Hydration) in LuminaVista OS.
All 10 required security properties and invariants were rigorously audited, verified against automated test suites (`features.test.cjs`, `browser-cdp-test.cjs`, `recheck-all-tasks.cjs`, `lint.cjs`), and subjected to edge-case and adversarial stress tests.

**Overall Verdict**: **FORTIFIED & VERIFIED — NO BYPASSES FOUND.**
All defenses are robust, fail-closed, mathematically sound, and respect all architectural and line-budget constraints.

---

## 1. Surface 3: ESP32 Smart Lock Hardware Telemetry Gateway (`api/iot.js`)

### 1.1 5-Layer Cryptographic Verification Architecture
`api/iot.js` implements a defense-in-depth hardware authentication and anti-tamper stack via `verifyDeviceRequest(req, rawBodyStr, storage)`:
1. **Layer 1: Provisioned Device Identity Check** (`api/iot.js:196-199`)
   - Rejects missing, empty, or unprovisioned device IDs (`deviceId !== DEFAULT_DEVICE_ID`).
   - Logs `IOT_UNKNOWN_DEVICE` and fails closed with HTTP 401.
2. **Layer 2: Sliding Timestamp Drift Window** (`api/iot.js:201-208`)
   - Rejects non-finite timestamps or clock drift exceeding $\pm 60$ seconds (`Math.abs(nowSec - ts) > 60`).
   - Returns current `serverTime` to allow ESP32 RTC auto-resynchronization.
   - Logs `IOT_TIMESTAMP_SKEW` and fails closed with HTTP 401.
3. **Layer 3: Cryptographic Format & Constant-Time HMAC-SHA256 Verification** (`api/iot.js:210-234`)
   - Strict regex format gates: Nonce must match `/^[a-f0-9]{16,64}$/i` (128-bit hex); signature must match `/^[a-f0-9]{64}$/i` (SHA256 hex).
   - Secret loading: `ensureDeviceSecretLoaded` verifies key presence from environment or Redis (`iot:system:hmac_key`). Returns HTTP 503 if unprovisioned.
   - Canonical HMAC message: `${deviceId}.${timestamp}.${nonce}.${seq}.${bodyHash}`, where `bodyHash` is the SHA-256 digest of the raw UTF-8 payload.
   - Constant-time comparison: Decodes expected and received signatures into 32-byte buffers and executes `crypto.timingSafeEqual(expectedBuf, receivedBuf)`. Buffer length checks precede comparison to prevent unhandled exceptions.
   - Logs `IOT_BAD_SIGNATURE` and fails closed with HTTP 401 on mismatch.
4. **Layer 4 & 5: Atomic Nonce Anti-Replay Lock & Mathematical Invariant** (`api/iot.js:237-242`)
   - Key: `iot:nonce:${deviceId}:${nonce}`
   - Executes atomic Redis command: `storage.set(nonceKey, '1', { nx: true, ex: NONCE_TTL_SEC })` with `NONCE_TTL_SEC = 120s`.
   - **Replay Window Invariant**: $T_{nonce} \ge 2 \times W$ ($120s \ge 2 \times 60s$).
     - Packets sent at timestamp $T$ are valid in server time window $[T - 60s, T + 60s]$.
     - Nonce is stored for 120 seconds upon receipt.
     - When the nonce key expires in Redis ($T_{arr} + 120s \ge T + 60s$), the packet's timestamp is guaranteed to be older than the 60s drift window.
     - An attacker cannot replay a packet either while the nonce is cached (blocked by Redis `NX`) or after the nonce expires (blocked by timestamp drift).
   - **Cache Bounds & DoS Resistance**:
     - Keys automatically evicted by Redis TTL (120s).
     - Hardware push rate-limiting restricts requests to 300 / 60s per IP (`checkRateLimit(req, storage, 'iot_hardware', 300, 60)`).
     - Maximum concurrent nonce keys in Redis $\le 600$ keys per client ($\approx 40$ KB RAM), preventing cache exhaustion attacks.
5. **Layer 6: Monotonic Sequence Validation** (`api/iot.js:246-262` & `670-678`)
   - Rejects reordered or older telemetry packets within the 60-second drift window: `seq < (meta.lastSeq || 0)`.
   - Returns HTTP 401 with `error: 'Stale or out-of-order telemetry packet rejected'`.
   - State updates commit `lastSeq: Math.max(verification.seq, prevMeta?.lastSeq || 0)` monotonically.

### 1.2 Dual-Tier Command TTLs and Command Queue Handling
`api/iot.js:1203-1240` implements dual-tier command expiration and state projection:
- **Tier 1 (Physical / High-Risk Commands)**: `unlock`, `lock`, `lock_mode`, `alarm_clear`, `enroll`, `restart`
  - Enforces strict **15-second TTL** (`expiresAt = nowSec + 15`).
  - Prevents "delayed door unlock" hazards where an offline ESP32 reconnects hours later and executes an old unlock.
- **Tier 2 (Administrative / Config Commands)**: `relay3_schedule`, `relay4_schedule`, `card_rename`, `card_color`, `logs_clear`
  - Enforces **24-hour TTL** (`expiresAt = nowSec + 86400`).
- **Mutual HMAC Signing of Outbound Commands**:
  - `signDeviceCommand(secret, cmdObj)` signs `${cmdId}.${cmd}.${param}.${issuedAt}.${expiresAt}` with HMAC-SHA256 so the ESP32 hardware verifies authenticity before acting.
- **Queue Bounds & Superseding**:
  - Conflicting commands (`unlock` vs `lock`, or rapid repeat commands) automatically supersede un-ACKed previous entries.
  - Hard cap of 50 active commands (`activeQueue.slice(-50)`).
  - Expired commands are pruned on every read and write cycle.
- **Role Enforcement**:
  - Master-only commands (`MASTER_ONLY_COMMANDS`) and destructive actions (`DESTRUCTIVE_ACTIONS`) reject temporary access keys with HTTP 403.

### 1.3 Rate Limiting on `GET /api/iot?action=time`
- Protected by `checkRateLimit(req, storage, 'iot_time', 60, 60)` (60 req/min).
- Prevents HMAC calculation DoS against serverless CPU resources.

### 1.4 Hardware Firmware Invariant (`firmware/**`)
- Git tree inspection and file system scan confirm `firmware/**` remains 100% untouched.
- Gateway wire protocol matches original ESP32 C++ firmware expectations.

---

## 2. Surface 5: Multi-Device Cloud Sync & Hydration (`modules/cloud-sync.js`, `api/sync.js`)

### 2.1 Non-Destructive Cloud Hydration
`modules/cloud-sync.js:218-742` implements union-merge hydration across all domains:
1. **Calendar Events**:
   - Merged by `id` using `localMap`.
   - Matches compare timestamps (`updatedAt`, `lastModified`, `updated`, `createdAt`).
   - Newer timestamp wins.
   - Non-overlapping local events and unkeyed events are retained.
   - Local additions trigger `queueSync(2000)` to propagate up to cloud.
2. **Notes Markdown Vault**:
   - Merged by `id` using `localNotesMap`.
   - Newer timestamp wins.
   - On equal/missing timestamps, preserves local edits unless local was empty.
   - Local notes missing in cloud are preserved.
3. **Virtual File System (VFS)**:
   - Merged by filepath key using prototype-safe dictionary `Object.create(null)`.
   - Prototype pollution defense: keys matching `__proto__`, `prototype`, or `constructor` are discarded.
   - Newer file timestamp wins; if timestamps missing, preserves local edits unless local was empty.
   - Retains all existing local files.
4. **AI Chat Sessions**:
   - Merged by session ID.
   - Keeps session version with higher message count.
   - Preserves local active conversation (`aiConversation`).

### 2.2 Active Tab Preservation During Background Sync
- Cold boot hydration (`pullFromCloud(true)`) sets `hasRestoredInitialTab = true` after restoring `activeTabId`.
- Periodic 90-second background sync interval (`modules/cloud-sync.js:821-825`) invokes `pullFromCloud(false)`.
- Condition in `hydrateWorkspaceFromState`:
  ```javascript
  if (options && options.isInitial && !hasRestoredInitialTab) { ... window.switchTab(state.activeTabId); }
  ```
  evaluates to `false` on all subsequent background runs.
- **Result**: Background sync NEVER calls `window.switchTab` or hijacks user focus.

### 2.3 Sensitive Data Protection in `api/sync.js`
- **Session Authentication & Role Gate**:
  - Requires valid sovereign session (`validateSession`).
  - Restricts endpoint to authenticated roles (`master` and `temporary`).
- **Administrative Credential Redaction**:
  - If `auth.role !== 'master'`, `safeState.admin_passwords` is deleted before serialization (`api/sync.js:69-71`).
  - Response pipeline passes through `sendSecureJson`, which invokes `sanitizeDeep`.
  - `sanitizeDeep` matches keys against `/^(key|secret|password|token|apiKey|api_key|access_token|refresh_token|client_secret|signing_key|private_key)$/i` and redacts values to `'[REDACTED]'`.
  - Client local caching in `modules/cloud-sync.js:716-723` caches only safe preview metadata (`preview: p.preview || '••••••••'`), never plaintext passwords.
- **Immutability of Admin Credentials via Sync POST**:
  - `POST /api/sync` explicitly sets:
    `admin_passwords: currentState.admin_passwords || [],`
  - Client sync payloads CANNOT overwrite, inject, or tamper with admin credentials. Admin credentials can only be managed sovereignly via `api/admin.js`.

---

## 3. Line Budget Audit (< 2,000 Lines)

| Target File | Line Count | Budget Limit | Headroom | Status |
|-------------|------------|--------------|----------|--------|
| `api/iot.js` | 1,248 | 2,000 | 752 lines | COMPLIANT |
| `modules/cloud-sync.js` | 852 | 2,000 | 1,148 lines | COMPLIANT |
| `api/sync.js` | 136 | 2,000 | 1,864 lines | COMPLIANT |

---

## 4. Test Suite Verification Status
All automated test suites executed with 100% pass rates:
- `node tests/lint.cjs`: 40/40 modules clean syntax.
- `node tests/recheck-all-tasks.cjs`: 42/42 task audit assertions pass.
- `node tests/features.test.cjs`: 1,102/1,102 unit assertions pass.
- `node tests/browser-cdp-test.cjs`: 122/122 real Google Chrome CDP tests pass.
