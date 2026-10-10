# Explorer 2 Handoff Report: Zero-Trust Auth, Sovereign Session Keys, Minimum-1 Access Key Rule & IoT Gateway Survey

- **Auditor**: Explorer 2 (Auth, Zero-Trust, Access Control & IoT Gateway Survey)
- **Target Surfaces**: `api/admin.js`, `api/auth.js`, `modules/admin-access.js`, `api/iot.js`, `api/_lib/auth-guard.js`, `api/_lib/redis.js`
- **Timestamp**: 2026-10-16T16:24:00Z
- **Integrity Mode**: Read-Only Defensive Security Audit

---

## 1. Observation

### 1.1 Zero-Trust Session Validation & Revocation
- **File**: `api/_lib/auth-guard.js` lines 115-125
  ```javascript
  // 1. Sovereign Cryptographic Verification Check (Zero-Latency, Immune to Redis Limits)
  const masterSecret = process.env.ADMIN_PASSWORD;
  if (masterSecret && sessionId.startsWith('lv_')) {
    const verified = verifySovereignSessionToken(sessionId, masterSecret);
    if (verified && verified.valid) {
      if (redis && typeof redis.expire === 'function') {
        try { redis.expire(`session:${sessionId}`, 1200).catch(() => {}); } catch (_) {}
      }
      return { valid: true, sessionId, role: verified.role, keyId: null };
    }
  }
  ```
  `validateSession` verifies sovereign session tokens statelessly via HMAC-SHA256 and timestamp age check (`age <= 1200 * 1000`). It returns `{ valid: true }` without checking if Redis deleted or revoked the session.
- **File**: `api/logout.js` lines 13-17
  ```javascript
  if (sid && redis) {
    try {
      await redis.del(`session:${sid}`);
    } catch (_) {}
  }
  ```
  Logout only calls `redis.del('session:' + sid)`. Because `validateSession` never checks for key existence when `sessionId.startsWith('lv_')`, a sovereign session token continues to authenticate for its remaining 20-minute validity window even after logout.

### 1.2 Hardcoded Fallback Secret in Client Key Verification
- **File**: `api/auth.js` lines 216-234
  ```javascript
  if (expectedPassword && Array.isArray(clientKeys) && clientKeys.length > 0) {
    const cleanExpected = typeof expectedPassword === 'string' ? expectedPassword.trim().replace(/^["']|["']$/g, '').trim() : expectedPassword;
    const signingSecrets = Array.from(new Set([cleanExpected, expectedPassword, 'lumina_root_secret'])).filter(Boolean);

    const matchedClientKey = clientKeys.find(k => {
      if (!k || typeof k.hash !== 'string' || typeof k.sig !== 'string') return false;
      const targetHash = k.hash.toLowerCase().trim();
      if (targetHash !== inputHex && targetHash !== trimmedHex) return false;

      // Verify HMAC-SHA256 signature against candidate admin secrets
      for (const secret of signingSecrets) {
        try {
          const expectedSig = crypto.createHmac('sha256', secret).update(`${k.id}:${k.hash}:${k.createdAt}`).digest('hex');
          if (k.sig.toLowerCase() === expectedSig.toLowerCase()) return true;
        } catch (_) {}
      }
      return false;
    });
  ```
  `'lumina_root_secret'` is hardcoded and unconditionally included in `signingSecrets` at line 218 even when `expectedPassword` is configured.
  At lines 237-254, successful matches are written into Redis (`await storage.set('admin:temp_passwords', JSON.stringify(parsedCurrent));`).
  At line 229, signature comparison `k.sig.toLowerCase() === expectedSig.toLowerCase()` uses standard string equality instead of constant-time buffer comparison.

### 1.3 Timing Discrepancies in Password Verification
- **File**: `api/auth.js` lines 50-54
  ```javascript
  const isMasterAttempt = password && (
    password === rawExpectedPassword ||
    password.trim() === rawExpectedPassword.trim() ||
    password.trim() === cleanExpected
  );
  ```
  During rate-limit lockout (`!rateCheck.allowed`), the master password override is checked with `===` string equality, early-terminating on mismatched characters.
- **File**: `api/auth.js` lines 186-193
  ```javascript
  const targetHash = k.hash.toLowerCase().trim();
  if (targetHash === inputHex || targetHash === trimmedHex) return true;
  try {
    const keyBuf = Buffer.from(targetHash, 'hex');
    if (keyBuf.length === 32) {
      return crypto.timingSafeEqual(inputHash, keyBuf) || crypto.timingSafeEqual(trimmedHash, keyBuf);
    }
  } catch (_) {}
  ```
  Line 187 checks `targetHash === inputHex` with string comparison before reaching `crypto.timingSafeEqual`.

### 1.4 Permissive CORS Origin Reflection
- **File**: `api/_lib/auth-guard.js` lines 356-359
  ```javascript
  const finalOrigin = isAllowed ? origin : (origin || 'https://lumina-vista-sigma.vercel.app');
  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  ```
  Because `(origin || 'https://lumina-vista-sigma.vercel.app')` evaluates to `origin` whenever an `origin` header is present, any untrusted origin (`https://attacker.com`) is reflected in `Access-Control-Allow-Origin` alongside `Access-Control-Allow-Credentials: true`.

### 1.5 Minimum-1 Access Key Rule Enforced Pre-Filter Only
- **File**: `api/admin.js` lines 160-170
  ```javascript
  // Enforce hard security invariant: At least 1 active access key must remain present at all times
  if (items.length <= 1) {
    return sendSecureJson(res, 400, {
      error: 'Cannot delete the last access key: At least one active access password must remain present at all times.'
    }, req);
  }

  const beforeCount = items.length;
  items = items.filter(k => k && k.id !== id);

  await storage.set(ADMIN_PASSWORDS_KEY, JSON.stringify(items));
  ```
  The invariant check occurs before filtering. If `items` contains duplicate records with the same `id`, `items.filter` deletes all instances, potentially leaving 0 items in storage.

### 1.6 Unsalted SHA-256 Hashes in Admin Vault
- **File**: `api/admin.js` lines 55-65, 96
  ```javascript
  const hash = crypto.createHash('sha256').update(rawPass).digest('hex');
  ...
  const vaultList = (Array.isArray(items) ? items : []).map(it => {
    const sig = it.sig || crypto.createHmac('sha256', adminSecret).update(`${it.id}:${it.hash}:${it.createdAt}`).digest('hex');
    return {
      id: it.id,
      label: it.label || 'Access Key',
      preview: it.preview || '••••••••',
      hash: it.hash,
      sig,
      createdAt: it.createdAt || Date.now()
    };
  });
  ```
  Temporary access passwords are stored as unsalted single-iteration SHA-256 hashes and returned over the wire to authenticated clients in `vaultList`.

### 1.7 Missing Rate Limit on IoT Time-Sync Bootstrap
- **File**: `api/iot.js` lines 382-401
  ```javascript
  if (req.method === 'GET' && action === 'time') {
    const challenge = String(urlObj.searchParams.get('challenge') || (req.query && req.query.challenge) || '').slice(0, 64);
    const nowSec = Math.floor(Date.now() / 1000);
    const secret = await ensureDeviceSecretLoaded(storage);
    ...
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`time.${nowSec}.${challenge}`, 'utf8')
      .digest('hex')
      .toLowerCase();
  ```
  `GET /api/iot?action=time` performs HMAC-SHA256 computations without any IP or request rate limiting.

### 1.8 Out-of-Order Telemetry State Regression
- **File**: `api/iot.js` lines 193, 249, 895-898
  The header `x-lumina-seq` is parsed and recorded into `meta.lastSeq = verification.seq`, but incoming telemetry is not validated to ensure `verification.seq >= (prevMeta.lastSeq || 0)`. Stale, reordered packets arriving within the +-60s drift window can overwrite newer hardware state.

### 1.9 Target File Line Counts
Executing PowerShell `(Get-Content $f).Count` on target files:
- `api/iot.js`: 1,211 lines (< 2,000 budget limit, 789 headroom)
- `api/admin.js`: 196 lines (< 2,000 budget limit, 1,804 headroom)
- `api/auth.js`: 267 lines (< 2,000 budget limit, 1,733 headroom)
- `api/_lib/auth-guard.js`: 422 lines (< 2,000 budget limit, 1,578 headroom)
- `modules/admin-access.js`: 437 lines (< 2,000 budget limit, 1,563 headroom)
- `tests/features.test.cjs`: 1,984 lines (Caution: 16 lines from 2,000 ceiling)

---

## 2. Logic Chain

1. **Authentication Bypass via Hardcoded Secret (Finding 1.2)**:
   - Observation: Line 218 in `api/auth.js` includes `'lumina_root_secret'` in `signingSecrets`.
   - Line 41 extracts `clientKeys` from the request body.
   - An attacker can forge an HMAC signature using `'lumina_root_secret'` for any password they choose.
   - `verifyCredentials` evaluates line 228 with `secret = 'lumina_root_secret'`.
   - The check passes, granting the attacker a valid session with `type: 'temporary'`.
   - In `api/admin.js`, line 16 authorizes any valid session to access credentials.
   - Thus, an unauthenticated remote attacker can obtain full administrative access to LuminaVista OS without knowledge of `ADMIN_PASSWORD`.

2. **Session Revocation Blind Spot (Finding 1.1)**:
   - Observation: Line 116 in `api/_lib/auth-guard.js` branches on `sessionId.startsWith('lv_')`.
   - It verifies HMAC signature and timestamp age.
   - Observation: Line 15 in `api/logout.js` only executes `redis.del('session:' + sid)`.
   - Because `validateSession` never checks whether `session:${sessionId}` exists in Redis when evaluating sovereign tokens, deleting the Redis session key has zero effect on session validity.
   - Therefore, logged-out sessions remain fully authorized until natural 20-minute expiration.

3. **Cross-Origin Data Leakage (Finding 1.4)**:
   - Observation: Line 357 in `api/_lib/auth-guard.js` resolves `finalOrigin = isAllowed ? origin : (origin || ...)`.
   - When `origin` is not in `ALLOWED_ORIGINS`, `isAllowed` is `false`.
   - The expression evaluates to `origin`.
   - Line 359 sets `Access-Control-Allow-Credentials: true`.
   - Therefore, any third-party malicious website can issue credentialed cross-origin requests and read sensitive responses (including door state, logs, and admin keys).

4. **Minimum-1 Access Key Bypass (Finding 1.5)**:
   - Observation: In `api/admin.js:161`, `items.length <= 1` is evaluated before `filter`.
   - If `items` has 2 elements sharing the same `id` (`['key_A', 'key_A']`), `items.length` is 2 (`> 1`).
   - Line 168 filters out all occurrences of `key_A`, resulting in `items = []`.
   - Line 170 writes `[]` to storage, violating the invariant that at least 1 access key must remain present.

5. **Timing Attacks (Finding 1.3)**:
   - Observation: `api/auth.js:50-54`, line 187, line 229 all use `===` string comparisons.
   - JavaScript engine string equality compares character-by-character, terminating on first mismatch.
   - An attacker measuring request latency can incrementally determine valid secrets, hashes, and signatures.

6. **IoT Denial-of-Service (Finding 1.7)**:
   - Observation: `GET /api/iot?action=time` performs HMAC-SHA256 calculations without `checkRateLimit`.
   - All other endpoints implement rate limiting (120 to 300 req/min).
   - An unauthenticated attacker can flood `action=time` with arbitrary challenges to exhaust serverless execution CPU time.

---

## 3. Caveats

1. **Test Suite Expectations**:
   - `tests/recheck-all-tasks.cjs` line 50-51 explicitly seeds a session with `role: 'temporary'` to execute `POST /api/admin` key deletion. Restricting `api/admin.js` strictly to `role: 'master'` would cause `recheck-all-tasks.cjs` to fail. Any role restrictions must preserve the test suite's accepted temporary admin privileges.
   - `tests/features.test.cjs` line 1153 expects `Access-Control-Allow-Origin: https://luminavista.example.com` on OPTIONS requests to `/api/calendar/sync`. This is governed by `setCorsHeaders` in `api/calendar.js`, not `api/_lib/auth-guard.js`.
2. **Offline Sovereign Tokens vs. Redis State**:
   - Sovereign tokens were deliberately designed to operate during Redis cold-starts, rate limits, and outages. Introducing Redis checks into `validateSession` must fail-open on storage network errors while failing-closed when an explicit revocation marker exists.
3. **Firmware Constraints**:
   - ESP32 hardware firmware (`firmware/**`) must never be modified. All gateway changes in `api/iot.js` must strictly preserve existing packet signatures, header names, JSON schemas, and command canonical formatting.

---

## 4. Conclusion

The LuminaVista OS Zero-Trust Authentication and IoT Hardware Gateway architecture is structurally robust—featuring mutual HMAC-SHA256 hardware telemetry signing, sliding rate limiters, 128-bit anti-replay nonces, and secret scrubbing. However, several critical vulnerabilities undermine these defenses:

1. **CRITICAL**: Hardcoded `'lumina_root_secret'` in `api/auth.js:218` enables authentication bypass and key persistence by any attacker submitting signed clientKeys.
2. **HIGH**: Stateless sovereign session tokens in `api/_lib/auth-guard.js:115` ignore `api/logout.js` session deletion, allowing replay of logged-out tokens for up to 20 minutes.
3. **HIGH**: Origin reflection logic error in `api/_lib/auth-guard.js:357` grants universal credentialed CORS access to any origin.
4. **MEDIUM**: Pre-filter check in `api/admin.js:161` permits deletion of all keys if duplicate IDs exist.
5. **MEDIUM**: Timing side-channels in `api/auth.js` lines 50, 187, and 229 via non-constant-time string comparisons.
6. **MEDIUM**: Unrated HMAC calculations on `GET /api/iot?action=time` in `api/iot.js:382`.
7. **LOW**: Unchecked sequence number monotonicity in `api/iot.js:193` permitting out-of-order telemetry state regression.

All target files currently adhere to the 2,000-line budget limit (`api/iot.js` at 1,211 lines, `api/admin.js` at 196 lines).

---

## 5. Verification Method

### 5.1 Automated Test Execution Commands
Run the verification suites in PowerShell:
```powershell
# 1. Feature unit tests (1,102 assertions)
node tests/features.test.cjs

# 2. Chrome browser CDP tests (122 tests)
node tests/browser-cdp-test.cjs

# 3. 5-point comprehensive task audit (42 assertions)
node tests/recheck-all-tasks.cjs

# 4. Syntax linter across all 40 modules
node tests/lint.cjs
```

### 5.2 Specific Code Invalidation Conditions
- **Auth Bypass**: If `api/auth.js:218` includes `'lumina_root_secret'` when `process.env.ADMIN_PASSWORD` is defined, the vulnerability is UNRESOLVED.
- **CORS Leak**: If `api/_lib/auth-guard.js:357` contains `(origin || ...)`, untrusted origins are reflected with credentials, and the vulnerability is UNRESOLVED.
- **Min-1 Key Rule**: If `api/admin.js` checks `items.length <= 1` before filtering rather than `remaining.length < 1` after filtering, the invariant remains vulnerable.
- **Line Count**: If any modified file reaches >= 2,000 lines (e.g. `tests/features.test.cjs` is already at 1,984 lines), Acceptance Criteria R3 is breached.
