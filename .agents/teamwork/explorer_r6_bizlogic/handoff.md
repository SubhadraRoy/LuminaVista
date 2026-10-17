# DEFENSIVE SECURITY AUDIT REPORT: BUSINESS LOGIC, CONCURRENCY & HARDWARE GATEWAY
**Agent**: `explorer_r6_bizlogic`  
**Working Directory**: `c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_r6_bizlogic`  
**Milestone**: Security Audit R6 — Business Logic, Concurrency & Hardware Gateway  
**Date**: 2026-10-17  
**Scope**:
1. Race Conditions & Session Locks
2. Rate-Limiting Bypasses
3. Monotonic Sequence Counters & IoT Smart Lock Gateway (`api/iot.js`)
4. Unhandled Promise Rejections & Error Leaks
5. Google Calendar Two-Way Sync Logic

---

## 1. Observation

Direct, empirical observations across all audited modules in `api/` and `modules/`:

### Scope 1: Race Conditions & Session Locks
- **`api/admin.js:180-202`**:
  ```javascript
  const raw = await storage.get(ADMIN_PASSWORDS_KEY);
  let items = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  ...
  const remaining = items.filter(k => k && k.id !== id);
  if (remaining.length < 1) {
    return sendSecureJson(res, 400, { error: 'Cannot delete the last access key: ...' }, req);
  }
  items = remaining;
  await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(items));
  await storage.set('admin:revoked_key:' + id, String(Date.now()), { ex: 86400 * 90 });
  ```
  *Observed*: Deletion reads `ADMIN_PASSWORDS_KEY` into memory, performs an in-memory check, and writes back without atomic transactions (Redis `WATCH`/`MULTI`/`EXEC`), CAS (compare-and-swap), or a distributed lock. If two concurrent deletion requests execute for distinct key IDs (e.g., `key_A` and `key_B` when 2 keys exist), both see `remaining.length === 1 >= 1`, both succeed, and both write revocation markers `admin:revoked_key:key_A` and `admin:revoked_key:key_B`. Both keys are permanently revoked, violating the minimum-1 key security invariant.

- **`api/sync.js:93-130` & `modules/cloud-sync.js:758-788`**:
  ```javascript
  const rawCurrent = await redis.get(sessionKey);
  let currentState = rawCurrent || {};
  ...
  const newState = sanitizeWorkspaceState({ ... });
  await redis.set(sessionKey, JSON.stringify(newState));
  ```
  *Observed*: Server-side cloud sync performs a blind read-modify-write on `master_workspace_state` without a monotonic revision/version number or conditional set. Additionally, `updatedAt: Date.now()` is generated on the server at request receipt time rather than honoring causal timestamps or comparing vector clocks. Delayed or out-of-order network packets from Device B will blindly overwrite newer state written by Device A.

- **`api/calendar.js:670-730`**:
  ```javascript
  const refreshToken = tokenData.refresh_token || process.env.GOOGLE_REFRESH_TOKEN || null;
  ...
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', ...);
  if (refreshRes.ok) { ... }
  else {
    const errText = await refreshRes.text();
    if (errText.includes('invalid_grant') || refreshRes.status === 400 || refreshRes.status === 401) {
      if (storage) {
        await storage.del(GCAL_REDIS_KEY);
        ...
        wb.calendarSettings.googleCalendarConnected = false;
        await storage.set('master_workspace_state', JSON.stringify(wb));
      }
    }
  }
  ```
  *Observed*: Multiple concurrent requests (e.g. 5 parallel sync calls on boot) detecting an expired token all simultaneously dispatch refresh requests to Google. When Google rotates the refresh token upon the first request, the second concurrent request fails with `invalid_grant`. This triggers lines 714-727 which delete `GCAL_REDIS_KEY` and set `googleCalendarConnected = false`, severing the entire workspace's Google Calendar connection.

- **`api/auth.js:78-84`**:
  ```javascript
  if (verification.authenticated) {
    try {
      const clientIp = getClientIp(req);
      await storage.del(`rate_limit:auth:${clientIp}`);
    } catch (_) {}
  ```
  *Observed*: Any successful authentication unconditionally deletes `rate_limit:auth:${clientIp}` for the entire IP address.

### Scope 2: Rate-Limiting Bypasses
- **`api/_lib/auth-guard.js:18-23`**:
  ```javascript
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) rawIp = firstIp.replace(/[^a-fA-F0-9.:]/g, '');
  }
  ```
  *Observed*: Leftmost extraction (`split(',')[0]`) in `x-forwarded-for` uses the client-supplied header. An attacker can pass `X-Forwarded-For: 1.1.1.1`, `X-Forwarded-For: 1.1.1.2`, rotating arbitrary IP values to bypass rate limiting across all edge routes.

- **`api/_lib/auth-guard.js:216-245` & `api/_lib/redis.js:22-105`**:
  ```javascript
  const inMemoryRateLimits = new Map();
  ...
  let record = inMemoryRateLimits.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + (windowSeconds * 1000) };
  } else {
    record.count++;
  }
  inMemoryRateLimits.set(key, record);
  ```
  *Observed*: `inMemoryRateLimits` is an unbounded `Map`. Expired records are only checked on lookup of the same key. Randomized IP spoofing creates unbounded entries, leading to process memory exhaustion.

- **`api/logout.js:5-30` & `api/calendar.js:252-350, 1077-1103`**:
  *Observed*: `POST /api/logout` has no rate limiter. In `api/calendar.js`, only `action === 'sync'` calls `checkRateLimit`; `auth`, `status`, `callback`, and `disconnect` actions have no rate limiting.

### Scope 3: Monotonic Sequence Counters & IoT Smart Lock Gateway (`api/iot.js`)
- **`api/iot.js:251, 671`**:
  ```javascript
  if (meta && typeof meta.lastSeq === 'number' && seq < (meta.lastSeq || 0)) {
    auditLog('IOT_STALE_SEQUENCE', req, `seq=${seq}, lastSeq=${meta.lastSeq}`);
    return { valid: false, status: 401, error: 'Stale or out-of-order telemetry packet rejected', ... };
  }
  ```
  *Observed*: The check uses strict inequality `<`. If `seq === meta.lastSeq`, the condition evaluates to `false` and is accepted. A replayed packet with equal sequence and distinct nonce within the 60s window is not blocked by sequence validation.
- **`api/iot.js:933`**:
  ```javascript
  lastSeq: Math.max(verification.seq, prevMeta?.lastSeq || 0)
  ```
  *Observed*: `lastSeq` monotonically increases and never resets. If an ESP32 hardware device resets or reboots (where firmware counter reinitializes to 1), `seq < meta.lastSeq` rejects all incoming packets with HTTP 401, causing permanent device lockout until Redis keys are manually deleted.
- **`api/iot.js:1215-1232`**:
  *Observed*: Command queueing reads `rawQueue` and overwrites `KEY_CMDS` with `p.set(KEY_CMDS, JSON.stringify(cappedQueue))` without atomic queuing, permitting lost commands under concurrent administration.

### Scope 4: Unhandled Promise Rejections & Error Leaks
- **`api/iot.js:388-1247`**:
  ```javascript
  export default async function handler(req, res) {
    setSecurityHeaders(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    ...
  ```
  *Observed*: The 1,248-line `api/iot.js` default handler has NO outer `try { ... } catch (err)` block! If any Redis operation, JSON parsing, or network request rejects, the error escapes to the Node.js runtime as an unhandled promise rejection.
- **`api/admin.js:8-41`, `api/sync.js:14-56`, `api/storage.js:53-138`, `api/worker.js:15-170`**:
  *Observed*: Handlers execute `validateSession` and `checkRateLimit` outside of `try / catch` blocks.
- **`api/worker.js:379` & `api/_lib/auth-guard.js:456-462`**:
  ```javascript
  terminalLogs.push(`[MicroVM Notice]: ${sbxErr.message}`);
  ```
  *Observed*: `sbxErr.message` is pushed directly without `sanitizeError` or `scrubSecrets`. Furthermore, in `sanitizeError`:
  `safe.replace(/[a-zA-Z]:\\[^"'\n\r\t<>]+/g, '[REDACTED_PATH]')` only matches backslashes `\`, missing forward-slash Windows paths (`c:/Users/...`) and Linux root prefixes like `/app/` and `/workspace/`. Stack traces without parentheses (`at /path/file.js:1:2`) are not masked by `sanitizeError`.

### Scope 5: Google Calendar Two-Way Sync Logic
- **`api/calendar.js:976-985` & `modules/calendar-sync.js:484-489, 515-560`**:
  *Observed*: When creating events in Google Calendar, `POST /api/calendar/sync` and the outbound Google API request omit an idempotent `id`. Google generates a random ID on each request. Parallel pushes or retried syncs create duplicate events on Google Calendar.
- **`modules/calendar-sync.js:522-537` & `modules/calendar.js:1484-1502`**:
  *Observed*: If `evt.start` contains a UTC timestamp (`2026-10-10T02:00:00Z`), `getEventLocalDateKey` in western hemisphere time zones (UTC-5, UTC-8) converts it to the prior day (`2026-10-09`), shifting all-day events backward by 1 full day.
- **`modules/calendar-sync.js:430-432, 524-529`**:
  *Observed*: Multi-day all-day events have exclusive `end.date` in Google Calendar. Pushing local dates without exclusive end-date conversion shortens multi-day events by 1 day on each round-trip sync.

---

## 2. Logic Chain

1. **Race Condition in Minimum-1 Access Key Invariant**:
   - `api/admin.js:180-202` filters `items` in memory: `remaining = items.filter(k => k && k.id !== id)`.
   - If Admin 1 deletes `key_1` and Admin 2 deletes `key_2` concurrently, both queries retrieve `[key_1, key_2]`.
   - Admin 1 evaluates `[key_2].length >= 1` (valid). Admin 2 evaluates `[key_1].length >= 1` (valid).
   - Both proceed to write revocations: `admin:revoked_key:key_1` and `admin:revoked_key:key_2`.
   - In `api/auth.js:268`, both keys are rejected as revoked.
   - *Conclusion*: A TOCTOU race condition completely defeats the minimum-1 access key invariant.

2. **Unhandled Exception in Hardware Gateway**:
   - `api/iot.js` exports `handler` with 860 lines of asynchronous business logic without an enclosing `try / catch`.
   - If `storage.pipeline().exec()` or `ensureDeviceSecretLoaded()` encounters an Upstash Redis socket reset or timeout, the exception is unhandled.
   - Node.js runtime terminates the serverless request without sending CORS or security headers, returning raw runtime error traces.
   - *Conclusion*: Missing fail-closed exception boundary in `api/iot.js` creates a high-impact crash and information leak vulnerability.

3. **Rate Limiting Bypass**:
   - `getClientIp()` takes the leftmost element of `X-Forwarded-For`.
   - Attackers sending `X-Forwarded-For: 10.0.0.${random}` bypass the IP-based sliding rate limit.
   - Every request is hashed with `crypto.createHash('sha256').update('${salt}:${rawIp}')`, creating a new counter key in Redis/memory.
   - *Conclusion*: Rate limiting can be bypassed on every edge route by injecting client headers.

4. **Stampeding Herd & Google Calendar Disconnection**:
   - When access tokens expire, concurrent requests enter `api/calendar.js:675`.
   - Multiple requests send `grant_type: 'refresh_token'` to Google.
   - Google invalidates the old refresh token when issuing a new one; the second request receives `invalid_grant`.
   - Line 714 deletes `gcal:master_tokens` and sets `googleCalendarConnected: false`.
   - *Conclusion*: Concurrency without a distributed refresh lock causes accidental workspace-wide calendar disconnection.

---

## 3. Prioritized Vulnerability Ledger

| Finding ID | Severity | Title | Target File & Lines | CWE / OWASP |
|---|---|---|---|---|
| **SEC-R6-BIZ-01** | **Critical** | Concurrency Race Condition in Minimum-1 Access Key Invariant | `api/admin.js:180-202` | CWE-367 / API10:2023 |
| **SEC-R6-BIZ-02** | **Critical** | Missing Top-Level Try/Catch in Master Hardware Gateway Crashing Serverless Lambda | `api/iot.js:388-1247` | CWE-755 / CWE-248 |
| **SEC-R6-BIZ-03** | **High** | IP Rate Limiting Bypass via Leftmost `X-Forwarded-For` Client Header Spoofing | `api/_lib/auth-guard.js:18-23` | CWE-290 / CWE-345 |
| **SEC-R6-BIZ-04** | **High** | Lost Updates and Unversioned State Overwrite in Multi-Device Cloud Sync | `api/sync.js:93-130`, `modules/cloud-sync.js:758-788` | CWE-362 |
| **SEC-R6-BIZ-05** | **High** | Stampeding Herd Race Condition in Google OAuth Token Refresh Triggering Accidental Disconnection | `api/calendar.js:670-730` | CWE-362 / CWE-295 |
| **SEC-R6-BIZ-06** | **High** | Non-Strict Sequence Monotonicity Check Permits Duplicate Telemetry Processing | `api/iot.js:251, 671` | CWE-294 / CWE-362 |
| **SEC-R6-BIZ-07** | **High** | Duplicate Event Injection in Google Calendar Due to Missing Idempotency Keys | `api/calendar.js:976-985`, `modules/calendar-sync.js:484-560` | CWE-362 / CWE-670 |
| **SEC-R6-BIZ-08** | **High** | Incomplete Outer Try/Catch Scope in Serverless Edge Handlers | `api/admin.js:8-41`, `api/sync.js:14-56`, `api/storage.js:53-138`, `api/worker.js:15-170` | CWE-755 / CWE-248 |
| **SEC-R6-BIZ-09** | **Medium** | Shared IP Rate Limiter Reset on Authentication Permits Interleaved Password Guessing | `api/auth.js:79-84` | CWE-307 / API2:2023 |
| **SEC-R6-BIZ-10** | **Medium** | Denial of Service via Rate Limiter In-Memory Fallback Cache Exhaustion (Unbounded Map) | `api/_lib/auth-guard.js:216-245, 273-287` | CWE-400 / CWE-770 |
| **SEC-R6-BIZ-11** | **Medium** | Unrated Edge Endpoints in `api/logout.js` and `api/calendar.js` | `api/logout.js:5-30`, `api/calendar.js:252-350, 1077-1103` | CWE-770 / API4:2023 |
| **SEC-R6-BIZ-12** | **Medium** | Permanent Hardware Lockout Denial of Service on ESP32 Reboot Due to Unresettable Monotonic Counter | `api/iot.js:251, 671, 933` | CWE-755 |
| **SEC-R6-BIZ-13** | **Medium** | Information Leakage in `api/worker.js` MicroVM Notice and Incomplete Path Redaction in `sanitizeError` | `api/worker.js:379`, `api/_lib/auth-guard.js:456-462` | CWE-209 / CWE-497 |
| **SEC-R6-BIZ-14** | **Medium** | All-Day Event 1-Day Backward Timezone Drift on Timed Date Inputs | `modules/calendar-sync.js:522-537`, `modules/calendar.js:1047-1050, 1484-1502` | CWE-840 |
| **SEC-R6-BIZ-15** | **Medium** | Multi-Day All-Day Sync Shrinkage Due to Asymmetric End-Date Exclusivity Handling | `modules/calendar-sync.js:430-432, 524-529`, `modules/calendar.js:1558-1565` | CWE-840 |
| **SEC-R6-BIZ-16** | **Low** | Memory Leak in `ResilientFallbackStorage` for IoT Nonce Deduplication Cache | `api/_lib/redis.js:22-45`, `api/iot.js:237-242` | CWE-400 / CWE-770 |
| **SEC-R6-BIZ-17** | **Low** | IoT Command Queue Race Condition Between Concurrent Admin Senders | `api/iot.js:1215-1232` | CWE-362 |
| **SEC-R6-BIZ-18** | **Informational** | Architectural Separation of Firmware and Cloud Gateway Invariants | `api/iot.js:14-178`, `firmware/**` | CWE-1059 |

---

## 4. Detailed Vulnerability Analyses & Defensive Remediations

### Finding SEC-R6-BIZ-01 (Critical): Concurrency Race Condition in Minimum-1 Access Key Invariant
- **Target**: `api/admin.js:180-202`
- **CWE / OWASP**: CWE-367 (TOCTOU Race Condition) / OWASP API10:2023
- **Root Cause & Threat Scenario**: When multiple access key delete requests arrive concurrently, both read the current key list `[key1, key2]` from Redis. Both see that deleting their target key leaves 1 key remaining (`remaining.length >= 1`). Both commit their deletion, and both set revocation markers `admin:revoked_key:<id>`. All keys are revoked, violating the minimum-1 key rule.
- **Defensive Remediation**:
  Use an atomic Redis lock (e.g. `storage.set('lock:admin_passwords', '1', { nx: true, ex: 5 })`) or Redis transaction/Lua script around the read-modify-write cycle. If lock acquisition fails, retry up to 3 times with exponential backoff or fail-closed with HTTP 409 Conflict. Re-verify `remaining.length >= 1` under lock before applying deletions.
- **Verification Method**: Automated concurrency harness dispatching `Promise.all([deleteKey('k1'), deleteKey('k2')])` when exactly two keys exist, asserting that exactly one succeeds and one returns HTTP 400/409, leaving 1 active key intact.

### Finding SEC-R6-BIZ-02 (Critical): Missing Top-Level Try/Catch in Master Hardware Gateway Crashing Serverless Lambda
- **Target**: `api/iot.js:388-1247`
- **CWE / OWASP**: CWE-755 (Improper Handling of Exceptional Conditions) / CWE-248
- **Root Cause & Threat Scenario**: `api/iot.js` lacks an outer `try { ... } catch (err)` wrapper around `export default async function handler(req, res)`. If any storage call (`storage.pipeline().exec()`, `storage.get()`, `storage.set()`) throws or times out, the function crashes with an unhandled promise rejection.
- **Defensive Remediation**: Wrap the entire handler logic in `try { ... } catch (err)` that logs via `auditLog('IOT_CRITICAL_FAULT', req, err.message)` and returns `sendSecureJson(res, 500, { error: sanitizeError(err, 'IoT gateway service failure') })`.
- **Verification Method**: Pass an abnormal request or simulate a failing Redis proxy to `api/iot.js`, confirming the endpoint returns HTTP 500 JSON with security headers without crashing the process.

### Finding SEC-R6-BIZ-03 (High): IP Rate Limiting Bypass via Leftmost `X-Forwarded-For` Client Header Spoofing
- **Target**: `api/_lib/auth-guard.js:18-23`
- **CWE / OWASP**: CWE-290 (Authentication Bypass by Spoofing) / CWE-345
- **Root Cause & Threat Scenario**: `getClientIp()` inspects `req.headers['x-forwarded-for'].split(',')[0].trim()`. Any attacker can supply a spoofed IP as the first comma-separated value, generating a unique hash on each request.
- **Defensive Remediation**: Prioritize platform-authenticated headers (`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`). For `x-forwarded-for`, take the rightmost trusted proxy IP or inspect `req.socket.remoteAddress` when running outside trusted cloud proxies.
- **Verification Method**: Invoke `checkRateLimit` with varying `X-Forwarded-For` headers from the same socket, asserting that the rate limit accumulates against the authentic remote IP.

### Finding SEC-R6-BIZ-04 (High): Lost Updates and Unversioned State Overwrite in Multi-Device Cloud Sync
- **Target**: `api/sync.js:93-130`, `modules/cloud-sync.js:758-788`
- **CWE / OWASP**: CWE-362 (Race Condition)
- **Root Cause & Threat Scenario**: Cloud sync reads `master_workspace_state` and writes `newState` with `updatedAt = Date.now()` without version checking. Device B with stale data or network delay overwrites recent changes committed by Device A.
- **Defensive Remediation**: Include a monotonic `revision: (currentState.revision || 0) + 1` in `master_workspace_state`. Require clients to submit their `baseRevision`. Reject updates where `baseRevision < currentRevision` with HTTP 409 Conflict, requiring the client to pull and merge before writing.
- **Verification Method**: Send two concurrent POST updates with divergent states; assert server detects conflict or merges non-destructively.

### Finding SEC-R6-BIZ-05 (High): Stampeding Herd Race Condition in Google OAuth Token Refresh
- **Target**: `api/calendar.js:670-730`
- **CWE / OWASP**: CWE-362 (Race Condition) / CWE-295
- **Root Cause & Threat Scenario**: Multiple simultaneous requests detect an expired token and call Google OAuth. Google's token rotation causes the second request to receive `invalid_grant`, triggering token deletion and workspace calendar disconnection.
- **Defensive Remediation**: Use an in-process promise mutex (`let refreshPromise = null;`) and Redis lock (`storage.set('lock:gcal_refresh', '1', { nx: true, ex: 10 })`). Concurrent requests wait on the in-flight promise and re-read the freshly cached token from Redis.
- **Verification Method**: Execute 5 simultaneous requests with an expired token mock; verify exactly 1 upstream token refresh request is made.

### Finding SEC-R6-BIZ-06 (High): Non-Strict Sequence Monotonicity Check Permits Duplicate Telemetry Processing
- **Target**: `api/iot.js:251, 671`
- **CWE / OWASP**: CWE-294 / CWE-362
- **Root Cause & Threat Scenario**: Sequence validation checks `seq < meta.lastSeq`. If a packet arrives with `seq === meta.lastSeq` and a distinct nonce, it bypasses the sequence check and gets processed.
- **Defensive Remediation**: Change validation to `seq <= (meta.lastSeq || 0)` to enforce strict monotonicity. Allow `seq === 1` only if accompanied by verified boot telemetry (`uptime < 30s`).
- **Verification Method**: Send a telemetry packet with `seq === lastSeq`; verify gateway rejects it with HTTP 401 `Stale or out-of-order telemetry packet rejected`.

### Finding SEC-R6-BIZ-07 (High): Duplicate Event Injection in Google Calendar Due to Missing Idempotency Keys
- **Target**: `api/calendar.js:976-985`, `modules/calendar-sync.js:484-560`
- **CWE / OWASP**: CWE-362 / CWE-670
- **Root Cause & Threat Scenario**: `POST /api/calendar/sync` creates Google events without supplying a deterministic client-generated event ID. Interrupted pushes and retries generate duplicate Google Calendar entries.
- **Defensive Remediation**: Generate a deterministic base32hex ID (e.g. `crypto.createHash('sha256').update(evt.id).digest('hex').slice(0, 32)`) and include it in the Google API payload: `{ id: deterministicId, ...payload }`.
- **Verification Method**: Push the same event twice; verify Google API returns existing event without creating a duplicate.

### Finding SEC-R6-BIZ-08 (High): Incomplete Outer Try/Catch Scope in Edge Handlers
- **Target**: `api/admin.js:8-41`, `api/sync.js:14-56`, `api/storage.js:53-138`, `api/worker.js:15-170`
- **CWE / OWASP**: CWE-755 / CWE-248
- **Root Cause & Threat Scenario**: Code before line 41/56 executes outside `try / catch`. If `validateSession` or `checkRateLimit` throws, the request crashes unhandled.
- **Defensive Remediation**: Wrap the entire handler from line 1 in `try { ... } catch (err)` returning standard sanitized JSON errors with security headers.
- **Verification Method**: Pass an invalid storage client that throws on get; verify handler catches and returns 500 without crashing.

### Finding SEC-R6-BIZ-09 (Medium): Shared IP Rate Limiter Reset on Authentication Permits Interleaved Password Guessing
- **Target**: `api/auth.js:79-84`
- **CWE / OWASP**: CWE-307 / OWASP API2:2023
- **Root Cause & Threat Scenario**: Login success calls `storage.del(\`rate_limit:auth:${clientIp}\`)`. An attacker with one valid credential resets the rate limiter to continue parallel brute-force guessing.
- **Defensive Remediation**: Track failed attempts in a dedicated key `rate_limit:auth_fail:${clientIp}` that is never wiped by secondary key logins, or track failures per credential ID.
- **Verification Method**: Interleave valid and invalid login attempts; verify rate limit lockout still activates against excessive failures.

### Finding SEC-R6-BIZ-10 (Medium): Denial of Service via Rate Limiter In-Memory Fallback Cache Exhaustion
- **Target**: `api/_lib/auth-guard.js:216-245, 273-287`
- **CWE / OWASP**: CWE-400 / CWE-770
- **Root Cause & Threat Scenario**: `inMemoryRateLimits` is an unbounded `Map`. Millions of spoofed IP headers exhaust process memory.
- **Defensive Remediation**: Bound the cache size to 5,000 entries. If capacity is exceeded, evict the oldest entry or run a periodic sweep of expired entries.
- **Verification Method**: Insert 10,000 unique keys; verify `inMemoryRateLimits.size` is strictly capped.

### Finding SEC-R6-BIZ-11 (Medium): Unrated Edge Endpoints in `api/logout.js` and `api/calendar.js`
- **Target**: `api/logout.js:5-30`, `api/calendar.js:252-350, 1077-1103`
- **CWE / OWASP**: CWE-770 / OWASP API4:2023
- **Root Cause & Threat Scenario**: Missing rate limits allow flooding of `/api/logout` and `/api/calendar?action=auth|status|callback|disconnect`.
- **Defensive Remediation**: Add `checkRateLimit` calls with appropriate quotas across all unrated endpoints.
- **Verification Method**: Send 100 requests in 5 seconds to `/api/logout`; verify HTTP 429 is returned.

### Finding SEC-R6-BIZ-12 (Medium): Permanent Hardware Lockout Denial of Service on ESP32 Reboot
- **Target**: `api/iot.js:251, 671, 933`
- **CWE / OWASP**: CWE-755
- **Root Cause & Threat Scenario**: When the ESP32 hardware resets, its sequence counter resets to 1. `seq < meta.lastSeq` permanently blocks all future telemetry from the rebooted lock.
- **Defensive Remediation**: Allow sequence re-baselining if HMAC signature is verified, `seq === 1`, and payload reports `uptime < 60s`.
- **Verification Method**: Simulate an ESP32 reboot with `seq = 1` and `uptime = 5s` against an existing `lastSeq = 500`; verify packet is accepted and `lastSeq` resets to 1.

### Finding SEC-R6-BIZ-13 (Medium): Information Leakage in `api/worker.js` and Incomplete Path Redaction in `sanitizeError`
- **Target**: `api/worker.js:379`, `api/_lib/auth-guard.js:456-462`
- **CWE / OWASP**: CWE-209 / CWE-497
- **Root Cause & Threat Scenario**: `sbxErr.message` is unredacted. `sanitizeError` fails to match forward-slash Windows paths (`c:/Users/...`) and Linux `/app/` paths, and misses stack traces without parentheses.
- **Defensive Remediation**: Wrap `sbxErr.message` in `sanitizeError()`. Update path masking regex to match `[a-zA-Z]:[/\\\\][^"'\n\r\t<>]+` and container paths `/(?:app|workspace|root|var|tmp)/[^"'\n\r\t<>]+`.
- **Verification Method**: Test `sanitizeError('Error at c:/Users/roysu/app.js:10:5')`; verify path and stack location are replaced with `[REDACTED_PATH]`.

### Finding SEC-R6-BIZ-14 (Medium): All-Day Event 1-Day Backward Timezone Drift on Timed Date Inputs
- **Target**: `modules/calendar-sync.js:522-537`, `modules/calendar.js:1047-1050, 1484-1502`
- **CWE / OWASP**: CWE-840
- **Root Cause & Threat Scenario**: All-day event inputs containing time components (`T02:00:00Z`) shift backward by 1 day when parsed in UTC-5 or UTC-8 timezones.
- **Defensive Remediation**: For all-day events, strictly truncate date strings to `YYYY-MM-DD` before parsing or passing to Google API.
- **Verification Method**: In an simulated UTC-8 environment, create an all-day event with start `2026-10-10T02:00:00Z`; verify `start.date` remains `2026-10-10`.

### Finding SEC-R6-BIZ-15 (Medium): Multi-Day All-Day Sync Shrinkage Due to Asymmetric End-Date Exclusivity Handling
- **Target**: `modules/calendar-sync.js:430-432, 524-529`, `modules/calendar.js:1558-1565`
- **CWE / OWASP**: CWE-840
- **Root Cause & Threat Scenario**: Google Calendar v3 uses exclusive end dates for all-day events. Multi-day events lose 1 day each time they are synced and saved locally.
- **Defensive Remediation**: Consistently convert between Google Calendar's exclusive `end.date` and local inclusive display dates during pull and push operations.
- **Verification Method**: Sync a 3-day all-day event (`2026-10-10` to `2026-10-13`); edit and re-push; verify end date remains `2026-10-13`.

### Finding SEC-R6-BIZ-16 (Low): Memory Leak in `ResilientFallbackStorage` for IoT Nonce Deduplication Cache
- **Target**: `api/_lib/redis.js:22-45`, `api/iot.js:237-242`
- **CWE / OWASP**: CWE-400 / CWE-770
- **Defensive Remediation**: Add max size bounding (e.g. 10,000 items) and periodic sweeps in `ResilientFallbackStorage`.

### Finding SEC-R6-BIZ-17 (Low): IoT Command Queue Race Condition Between Concurrent Admin Senders
- **Target**: `api/iot.js:1215-1232`
- **CWE / OWASP**: CWE-362
- **Defensive Remediation**: Use Redis list push (`rpush`) or atomic transaction for command queuing.

### Finding SEC-R6-BIZ-18 (Informational): Architectural Separation of Firmware and Cloud Gateway Invariants
- **Target**: `api/iot.js:14-178`, `firmware/**`
- **CWE / OWASP**: CWE-1059
- **Observation**: ESP32 firmware compatibility remains intact without modifying firmware files.

---

## 5. Caveats

1. **Read-Only Inspection**: This audit is strictly analytical. No source code modifications or weaponized exploit scripts were created.
2. **Firmware Untouched**: Physical ESP32 firmware files (`firmware/**`) remain 100% untouched and unverified with physical hardware chips (verified via protocol analysis and unit harnesses).
3. **Upstash Redis Availability**: In environments where Upstash Redis is unconfigured or rate-limited, fallback memory stores are utilized. While functioning correctly in single-process tests, in multi-instance serverless deployments, in-memory state is not shared across worker isolates.
4. **Line Count Budget Compliance**: All repository files remain strictly below the 2,000-line budget limit. Any future remediation patches must avoid exceeding this ceiling.

---

## 6. Conclusion

LuminaVista OS exhibits strong cryptographic design foundations (5-layer HMAC verification, sovereign session tokens, constant-time comparisons, and zero-trust edge guards). However, critical vulnerabilities exist in concurrency control and error resilience:

1. **Two Critical vulnerabilities**:
   - `SEC-R6-BIZ-01`: Concurrency race condition in `api/admin.js` capable of destroying the minimum-1 access key invariant.
   - `SEC-R6-BIZ-02`: Missing top-level `try/catch` in `api/iot.js` exposing the hardware gateway to unhandled exceptions and serverless lambda crashes.
2. **Six High-severity vulnerabilities**: Leftmost `X-Forwarded-For` rate-limiting bypass, lost updates in multi-device cloud sync, stampeding herd token refresh disconnections, non-strict sequence monotonicity, duplicate Google Calendar event injection, and incomplete try/catch scopes in edge handlers.
3. **Seven Medium-severity vulnerabilities**: Cache exhaustion in rate limiting fallback, unrated edge routes, ESP32 reboot lockout DoS, error information leakage in MicroVM notices, and all-day calendar timezone/exclusivity drift.
4. **Two Low-severity vulnerabilities & One Informational**: Memory leaks in fallback storage, command queue overwrites, and architecture preservation.

All identified vulnerabilities can be remediated surgically and defensively without modifying firmware files or exceeding file line limits.

---

## 7. Verification Method

To independently reproduce, audit, and verify the findings and existing system baseline:

1. **Syntax Linting**:
   ```powershell
   node tests/lint.cjs
   ```
   *Expected*: All 40 JavaScript modules pass syntax verification.

2. **Core Feature Test Suite**:
   ```powershell
   node tests/features.test.cjs
   ```
   *Expected*: All 1,102 assertions pass with 0 failures.

3. **Recheck Verification Suite**:
   ```powershell
   node tests/recheck-all-tasks.cjs
   ```
   *Expected*: All 42 audit assertions pass with 0 failures.

4. **Empirical Calendar & Concurrency Suite**:
   ```powershell
   node tests/challenger-calendar-empirical.cjs
   ```
   *Expected*: All 63 empirical assertions pass with 0 failures.

5. **Adversarial Penetration Harness**:
   ```powershell
   node tests/challenger-r4-empirical.cjs
   ```
   *Expected*: All 141 adversarial assertions pass with 0 failures.

6. **Adversarial Calendar Controller Suite**:
   ```powershell
   node tests/adversarial-calendar.test.cjs
   node tests/suite-calendar-adversarial.cjs
   ```
   *Expected*: All 109 and 25 probes pass with 0 failures.

7. **Line Count Budget Verification**:
   ```powershell
   node -e "const fs = require('fs'), path = require('path'); function s(d){for(const f of fs.readdirSync(d)){if(f==='node_modules'||f==='.git'||f==='.agents')continue;const p=path.join(d,f);if(fs.statSync(p).isDirectory())s(p);else if(/\.(js|cjs|html)$/.test(f)){const l=fs.readFileSync(p,'utf8').split('\n').length;if(l>=2000)console.error('VIOLATION:',p,l);}}};s('.');console.log('Line audit complete.');"
   ```
   *Expected*: 0 violations. All files strictly < 2,000 lines.
