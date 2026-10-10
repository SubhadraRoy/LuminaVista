# Adversarial Security Exploration & Defensive Assessment Report
**Agent**: `explorer_r4_1`  
**Working Directory**: `c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r4_1`  
**Timestamp**: `2026-10-16T22:45:00Z`  
**Scope**: Serverless Edge APIs (`api/*.js`, `api/_lib/*.js`), Zero-Trust Authentication, Sovereign Session Validation (`api/admin.js`, `api/auth.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js`).

---

## 1. Observation

### Observation 1.1: Constant-Time Crypto Comparisons & Timing Discrepancy Auditing
Across all cryptographic, token, and password checks, timing-safe equality comparisons are enforced:
- **`api/auth.js:57-58`**: Rate-limit bypass authentic master password check:
  ```javascript
  const match1 = crypto.timingSafeEqual(passBuf, candBuf);
  const match2 = crypto.timingSafeEqual(trimmedPassBuf, candBuf);
  ```
- **`api/auth.js:155-158`**: Primary master key check against `expectedPassword`:
  ```javascript
  if (
    crypto.timingSafeEqual(inputHash, expectedHash) ||
    crypto.timingSafeEqual(trimmedHash, expectedHash)
  )
  ```
- **`api/auth.js:197-203`**: Secondary Redis temporary password check:
  ```javascript
  const keyBuf = Buffer.alloc(32);
  const parsedKey = Buffer.from(targetHash, 'hex');
  const validLen = parsedKey.length === 32;
  if (validLen) parsedKey.copy(keyBuf);
  const match1 = crypto.timingSafeEqual(inputHash, keyBuf);
  const match2 = crypto.timingSafeEqual(trimmedHash, keyBuf);
  if (validLen && (match1 || match2)) return true;
  ```
- **`api/auth.js:235-256`**: ClientKey signature HMAC-SHA256 verification:
  ```javascript
  const isMatch = crypto.timingSafeEqual(sigBuf, expectedSigBuf);
  if (validLen && isMatch) return true;
  ```
- **`api/_lib/auth-guard.js:73-77`**: Sovereign session token signature check:
  ```javascript
  if (signature.length === expectedSig.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
        signatureMatch = true;
        break;
      }
    } catch (_) {}
  }
  ```
- **`api/calendar.js:274`**: OAuth2 state anti-CSRF HMAC check:
  ```javascript
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0 || !crypto.timingSafeEqual(sigBuf, expBuf))
  ```
- **`api/iot.js:227-231`**: ESP32 hardware request mutual HMAC check:
  ```javascript
  if (
    expectedBuf.length !== 32 ||
    receivedBuf.length !== 32 ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  )
  ```
- **Search Verification**: Ripgrep search for `===` on `password`, `hash`, `signature`, and `token` confirmed zero raw string equality checks on cryptographic buffers.

### Observation 1.2: Sovereign Session Validation, Revocation & Fail-Closed Posture
In `api/_lib/auth-guard.js:118-177`:
- **Cryptographic Signature Verification**: Line 120 calls `verifySovereignSessionToken(sessionId, masterSecret)`. If signature or age (20 min window, line 61-63) is invalid, returns `{ valid: false, status: 401, error: 'Unauthorized Session' }`.
- **Fail-Closed on Redis Storage Error**: Lines 137-145:
  ```javascript
  } catch (err) {
    storageError = true;
    console.warn('[AUTH_GUARD] Redis revocation check unavailable, failing closed:', err?.message || err);
  }

  // Storage network/read failure: fail closed to prevent revoked session acceptance
  if (storageError) {
    return { valid: false, status: 503, error: 'Session verification failed (storage unavailable)' };
  }
  ```
- **Revocation Enforcement**: Lines 147-155:
  ```javascript
  if (revocationMarker) {
    return { valid: false, status: 401, error: 'Session Revoked' };
  }

  // Active sessions are saved in Redis under session:${sessionId}.
  // When logged out, api/logout.js deletes session:${sessionId}.
  if (!sessionRecord) {
    return { valid: false, status: 401, error: 'Session Expired / Revoked' };
  }
  ```
- **Logout Endpoint Verification**: In `api/logout.js:14-25`, logout deletes `session:${sid}` and writes `session:revoked:${sid}` with a 24-hour TTL (`ex: 86400`).

### Observation 1.3: Minimum-1 Active Access Key Invariant in `api/admin.js`
In `api/admin.js:169-176`:
```javascript
const beforeCount = items.length;
const remaining = items.filter(k => k && k.id !== id);

// Enforce hard security invariant: At least 1 active access key must remain present at all times
if (remaining.length < 1) {
  return sendSecureJson(res, 400, {
    error: 'Cannot delete the last access key: At least one active access password must remain present at all times.'
  }, req);
}
```
- Line 169 evaluates `remaining` by filtering out the target key `id`.
- If `items` has 1 key (or 0 keys), `remaining.length < 1` evaluates to `true`, strictly blocking deletion with HTTP 400.
- `modules/admin-access.js:297-303` mirrors this check in client UI.
- `api/sync.js:123` preserves `currentState.admin_passwords` on workspace state sync, preventing state overwrite of admin keys.

### Observation 1.4: Critical CORS Origin Reflection with Credentials in `api/calendar.js`
In `api/calendar.js:85-128`:
```javascript
92:   const origin = request?.headers?.origin || request?.headers?.Origin;
93:   const ALLOWED_ORIGINS = new Set([
94:     'https://subhadraroy.github.io',
95:     'https://lumina-vista-sigma.vercel.app',
96:     'https://luminavista.example.com'
97:   ]);
...
101:  const isAllowed = Boolean(origin && (
102:    ALLOWED_ORIGINS.has(origin) ||
103:    origin.endsWith('.github.io') ||
104:    origin.endsWith('.vercel.app') ||
105:    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
106:  ));
107:  const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
...
126:  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
127:  res.setHeader('Access-Control-Allow-Credentials', 'true');
```
Lines 103-104 permit any domain ending in `.github.io` or `.vercel.app` (e.g., `https://attacker.github.io` or `https://malicious.vercel.app`) to be marked as `isAllowed: true`, which reflects `origin` with `Access-Control-Allow-Credentials: true`.

### Observation 1.5: SSRF Filter Bypass via IPv6-Mapped IPv4 in `api/_lib/key-pool.js`
In `api/_lib/key-pool.js:242-307`:
`isBlockedSsrfTarget` validates `targetUrl` using:
```javascript
270:  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
...
295:  if (
296:    hostname === '::1' ||
297:    hostname === '0:0:0:0:0:0:0:1' ||
298:    hostname === '::' ||
299:    hostname.startsWith('fe80:') ||
300:    hostname.startsWith('fc') ||
301:    hostname.startsWith('fd')
302:  ) {
303:    return true;
304:  }
```
Empirical testing in Node.js v24:
```bash
node -e "const { isBlockedSsrfTarget } = require('./api/_lib/key-pool.js'); console.log(isBlockedSsrfTarget('http://[::ffff:127.0.0.1]/')); console.log(isBlockedSsrfTarget('http://[::ffff:169.254.169.254]/'));"
```
Output:
```
false
false
```
`http://[::ffff:127.0.0.1]/` and `http://[::ffff:169.254.169.254]/` bypass `isBlockedSsrfTarget`, returning `false`.

### Observation 1.6: Missing CORS Headers on HTTP OPTIONS Preflight in Multiple API Endpoints
In `api/storage.js:52-55`, `api/chat.js:132-133`, `api/compile.js:25-26`, `api/terminal.js:30-35`, and `api/worker.js:15-16`:
```javascript
// Example in api/storage.js:53-55:
if (req.method === 'OPTIONS') {
  return res.status(200).end();
}
```
`setSecurityHeaders(res, req)` is not called before the `OPTIONS` return in these files, resulting in missing CORS response headers on preflight requests.

### Observation 1.7: Wildcard `targetOrigin` postMessage Data Leak in `api/calendar.js`
In `api/calendar.js:214` and `api/calendar.js:402`:
```javascript
214: window.opener.postMessage({ type: 'GCAL_AUTH_ERROR', event: 'gcal_auth_error', error: ${JSON.stringify(errorMsg)} }, '*');
...
402: window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', event: 'gcal_auth_success', email: ${JSON.stringify(userEmail)} }, '*');
```
Target origin is hardcoded to `'*'`.

### Observation 1.8: Missing Rate Limiting and Payload Limit Enforcement in `api/calendar.js` and `api/worker.js`
- `api/calendar.js`: Contains zero calls to `checkRateLimit` or `enforcePayloadLimit`.
- `api/worker.js`: Contains zero calls to `checkRateLimit` or `enforcePayloadLimit`.

---

## 2. Logic Chain

1. **Premise 1 (Crypto Constant-Time)**: From Observation 1.1, all password comparisons (`api/auth.js:57-58, 155-158`), temporary password lookups (`api/auth.js:197-203`), client key signatures (`api/auth.js:235-256`), sovereign session tokens (`api/_lib/auth-guard.js:73-77`), OAuth state anti-CSRF signatures (`api/calendar.js:274`), and IoT hardware signatures (`api/iot.js:227-231`) utilize `crypto.timingSafeEqual` with normalized buffer lengths.
   - *Inference*: The application is fortified against remote side-channel timing attacks on authentication and cryptographic signing tokens.

2. **Premise 2 (Zero-Trust Session Posture)**: From Observation 1.2, session validation requires cryptographic HMAC verification against `ADMIN_PASSWORD` (within 20 minutes) and queries Redis for revocation markers and session existence.
   - *Inference*: If Redis is unreachable during verification, `validateSession` fails closed (`status: 503`). When logged out, `session:${sid}` is deleted and `session:revoked:${sid}` is stored, causing any subsequent request with the token to be rejected (`status: 401`).

3. **Premise 3 (Min-1 Access Key Invariant)**: From Observation 1.3, deletion in `api/admin.js` computes `remaining = items.filter(k => k && k.id !== id)` and aborts with HTTP 400 if `remaining.length < 1`.
   - *Inference*: Neither single deletion of the last key nor duplicate-ID collisions can reduce active access keys to 0. Furthermore, `api/sync.js:123` ignores incoming `admin_passwords` payloads, preventing state sync poisoning of access keys.

4. **Premise 4 (CORS Over-Permissiveness)**: From Observation 1.4, `api/calendar.js:103-104` tests `origin.endsWith('.github.io') || origin.endsWith('.vercel.app')` and reflects any matching origin with `Access-Control-Allow-Credentials: true`.
   - *Inference*: Because `.github.io` and `.vercel.app` are public multi-tenant hosting platforms where any user can host a website, an attacker hosting `https://attacker.github.io` or `https://malicious.vercel.app` can issue cross-origin requests with credentials to `api/calendar?action=sync`, extracting calendar data or adding/deleting user schedule items.

5. **Premise 5 (SSRF Bypass Mechanism)**: From Observation 1.5, `isBlockedSsrfTarget` in `api/_lib/key-pool.js` converts input URLs using Node's `URL` parser. For IPv6-mapped IPv4 inputs (e.g. `[::ffff:127.0.0.1]` or `[::ffff:169.254.169.254]`), the parser outputs colon-separated hex representations (`::ffff:7f00:1` and `::ffff:a9fe:a9fe`).
   - *Inference*: The IPv4 regex (`/^\d+\.\d+\.\d+\.\d+$/`) fails to match due to colons, and the IPv6 blocklist checks only for `fe80:`, `fc`, `fd`, `::1`, and `::`. Consequently, `isBlockedSsrfTarget` returns `false`, allowing requests to loopback and cloud metadata endpoints when configuring `customEndpoint` in `api/chat.js`.

6. **Premise 6 (Preflight CORS Omission)**: From Observation 1.6, preflight `OPTIONS` requests handled in `api/storage.js`, `api/chat.js`, `api/compile.js`, `api/terminal.js`, and `api/worker.js` terminate immediately without invoking `setSecurityHeaders`.
   - *Inference*: Authorized cross-origin clients (such as `https://subhadraroy.github.io`) receive HTTP 200 without `Access-Control-Allow-Origin` and `Access-Control-Allow-Methods`, causing preflight check failure in standard web browsers.

7. **Premise 7 (postMessage Wildcard Exposure)**: From Observation 1.7, `api/calendar.js:214, 402` uses `window.opener.postMessage(..., '*')`.
   - *Inference*: The user's Google account email is broadcast to whichever window or domain opened the popup, violating origin-isolation boundaries.

8. **Premise 8 (DoS and Compute Exhaustion Surface)**: From Observation 1.8, `api/calendar.js` and `api/worker.js` lack sliding rate-limits and payload limits.
   - *Inference*: An unauthenticated or authenticated user can spam calendar synchronization endpoints or submit unbounded JSON payloads to background workers.

---

## 3. Caveats

1. **Physical Hardware Gateway**: Firmware files (`firmware/**`) were not modified, adhering strictly to the non-destructive exploration constraint. Hardware-side crypto is validated through the edge gateway handler `api/iot.js`.
2. **Third-Party Upstream Dependencies**: Cloud microVM execution (`@e2b/code-interpreter`) and Google Calendar APIs (`googleapis.com`) depend on upstream network reachability and valid API tokens; when unconfigured, both cleanly fall back to local sandboxing or return 500/503.
3. **Read-Only Constraint**: As an explorer subagent, source code was analyzed read-only without modifying production files or deploying offensive payloads.

---

## 4. Conclusion

The LuminaVista OS authentication and session architecture is well-fortified in several key dimensions:
- **Constant-time cryptographic comparisons** (`crypto.timingSafeEqual`) are rigorously implemented across all password, token, and signature validation pathways.
- **Sovereign session validation** fails closed on storage failure and actively checks revocation markers and active session keys.
- **Minimum-1 active access key invariant** is enforced at both the API (`api/admin.js:172`) and client (`modules/admin-access.js:298`) layers, and protected against sync poisoning (`api/sync.js:123`).

However, four specific vulnerabilities and three defense-in-depth gaps exist across the edge APIs that require remediation:

| ID | Severity | File | Line(s) | Description |
|---|---|---|---|---|
| **VULN-CORS-REFLECT** | High | `api/calendar.js` | 103-104 | Untrusted origin reflection (`*.github.io`, `*.vercel.app`) with `Access-Control-Allow-Credentials: true` |
| **VULN-SSRF-IPV6** | High | `api/_lib/key-pool.js` | 242-307 | SSRF guardrail bypass via IPv6-mapped IPv4 addresses (`[::ffff:127.0.0.1]`, `[::ffff:169.254.169.254]`) |
| **VULN-CORS-OPTIONS** | Medium | `api/storage.js`, `api/chat.js`, `api/compile.js`, `api/terminal.js`, `api/worker.js` | `handler` entry | Missing `setSecurityHeaders` before handling HTTP OPTIONS preflight |
| **VULN-POSTMESSAGE-WILD** | Medium | `api/calendar.js` | 214, 402 | `window.opener.postMessage` broadcasts Google account email to wildcard `'*'` |
| **VULN-DOS-RATELIMIT** | Low | `api/calendar.js`, `api/worker.js` | `handler` entry | Missing IP rate limiting (`checkRateLimit`) and request payload cap (`enforcePayloadLimit`) |

### Recommended Defensive Mitigations

1. **Fix CORS in `api/calendar.js`**:
   Replace:
   ```javascript
   const isAllowed = Boolean(origin && (
     ALLOWED_ORIGINS.has(origin) ||
     origin.endsWith('.github.io') ||
     origin.endsWith('.vercel.app') ||
     /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
   ));
   ```
   With strict origin checking:
   ```javascript
   const isAllowed = Boolean(origin && (
     ALLOWED_ORIGINS.has(origin) ||
     /^https:\/\/lumina-vista-[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin) ||
     /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
   ));
   ```

2. **Fix SSRF in `api/_lib/key-pool.js`**:
   In `isBlockedSsrfTarget`, add parsing for IPv6-mapped IPv4 targets before checking subnets:
   ```javascript
   let testHostname = hostname;
   if (testHostname.startsWith('::ffff:')) {
     const suffix = testHostname.replace('::ffff:', '');
     if (suffix.includes(':')) {
       // Convert hex pairs to dotted-decimal IPv4
       const parts = suffix.split(':').map(h => parseInt(h, 16));
       if (parts.length === 2 && !parts.some(isNaN)) {
         testHostname = `${(parts[0] >> 8) & 0xff}.${parts[0] & 0xff}.${(parts[1] >> 8) & 0xff}.${parts[1] & 0xff}`;
       }
     } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(suffix)) {
       testHostname = suffix;
     }
   }
   ```
   Then apply IPv4 private range and metadata filtering against `testHostname`.

3. **Standardize HTTP OPTIONS & Security Headers**:
   In `api/storage.js`, `api/chat.js`, `api/compile.js`, `api/terminal.js`, and `api/worker.js`, ensure:
   ```javascript
   res._req = req;
   setSecurityHeaders(res, req);
   if (req.method === 'OPTIONS') return res.status(204).end();
   ```

4. **Target Specific Origin in postMessage (`api/calendar.js`)**:
   In `api/calendar.js:214, 402`, replace `'*'` with the sanitized `finalOrigin` or the validated redirect origin from OAuth state.

5. **Enforce Rate Limiting & Payload Caps**:
   Add `checkRateLimit` and `enforcePayloadLimit` to `api/calendar.js` and `api/worker.js`.

---

## 5. Verification Method

To independently verify these findings and confirm existing system stability, execute the following commands in powershell:

1. **Verify SSRF IPv6 Bypass Behavior**:
   ```powershell
   node -e "const { isBlockedSsrfTarget } = require('./api/_lib/key-pool.js'); console.log('IPv4 loopback:', isBlockedSsrfTarget('http://127.0.0.1/')); console.log('IPv6-mapped loopback:', isBlockedSsrfTarget('http://[::ffff:127.0.0.1]/')); console.log('IPv6-mapped metadata:', isBlockedSsrfTarget('http://[::ffff:169.254.169.254]/'));"
   ```
   *Expected Current Output*: `true`, `false`, `false` (confirming bypass).
   *Post-Remediation Output*: `true`, `true`, `true`.

2. **Verify CORS Over-Permissiveness in `api/calendar.js`**:
   Inspect line 103-104 in `api/calendar.js` to observe `origin.endsWith('.github.io') || origin.endsWith('.vercel.app')`.

3. **Run Full System Verification Suites**:
   ```powershell
   node tests/lint.cjs                         # Expected: 40/40 modules pass
   node tests/recheck-all-tasks.cjs            # Expected: 42/42 assertions pass
   node tests/challenger-calendar-empirical.cjs# Expected: 63/63 assertions pass
   node tests/features.test.cjs                # Expected: 1,102/1,102 assertions pass
   ```
