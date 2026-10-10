# Handoff Report — Milestone 2 Challenge: IoT Gateway Defenses & OAuth2 State Validation

**Agent**: Challenger M2_2 (`challenger_m2_2`)  
**Mission**: Empirically verify Milestone 2 IoT Gateway defenses, OAuth2 state validation, and test suites, issuing an APPROVE or REJECT verdict.  
**Role**: Empirical Challenger (critic, specialist)  
**Timestamp**: 2026-10-16T17:42:00Z  
**Verdict**: **REJECT**  

---

## 1. Observation

Direct empirical observations and execution results across the requested verification tasks:

### 1.1 Automated Test Suites Execution
- **Syntax Linter (`node tests/lint.cjs`)**:
  ```
  ✓ All 40 JavaScript modules passed syntax validation.
  ```
  Exit code: 0.

- **Features Test Suite (`node tests/features.test.cjs`)**:
  ```
  === TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===
  🎉 ALL TESTS PASSED WITH ZERO ERRORS!
  ```
  Exit code: 0.

- **Recheck Task Audit (`node tests/recheck-all-tasks.cjs`)**:
  ```
  🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!
  ```
  Exit code: 0.

### 1.2 IoT Gateway Rate-Limiting (`GET /api/iot?action=time`)
- **Code Inspection (`api/iot.js:402-407`)**:
  ```javascript
  if (req.method === 'GET' && action === 'time') {
    const rate = await checkRateLimit(req, storage, 'iot_time', 60, 60);
    if (!rate.allowed) {
      auditLog('IOT_RATE_LIMIT_EXCEEDED', req, 'Action: time');
      return sendSecureJson(res, rate.status, { error: rate.error });
    }
  ```
- **Empirical Execution**:
  Dispatched 65 consecutive requests with IP `203.0.113.195`:
  - Requests 1 through 60 returned HTTP 200 with valid HMAC signatures.
  - Requests 61 through 65 were throttled: HTTP 429 (`{ error: 'Rate limit exceeded. Maximum 60 requests per 1 minutes.' }`).
  - Emitted audit log: `[SEC_AUDIT] ... | EVENT: IOT_RATE_LIMIT_EXCEEDED | IP: [REDACTED] | Action: time`.
  - Request from distinct IP `198.51.100.77` succeeded with HTTP 200 (IP isolation verified).
  - **Result**: PASS.

### 1.3 IoT Sequence Monotonicity (`api/iot.js:671-678`)
- **Empirical Execution**:
  - Telemetry push seq=500 succeeded with HTTP 200 (`ok: true`).
  - Stale telemetry push seq=499 was blocked with HTTP 401:
    `{ error: 'Stale or out-of-order telemetry packet rejected', lastSeq: 500, serverTime: ... }`.
  - Subsequent monotonic push seq=501 succeeded with HTTP 200.
  - **Result**: PASS.

### 1.4 OAuth2 State Validation Defect (`api/calendar.js:123-153`)
- **Code Inspection (`api/calendar.js:123-153`)**:
  ```javascript
  let redirectUriFromState = null;
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      if (parsed.redirect_uri) {
        if (parsed.nonce && parsed.ts && parsed.sig) {
          const age = Date.now() - parsed.ts;
          // State expires after 15 minutes (900,000ms)
          if (age >= 0 && age <= 15 * 60 * 1000) {
            const oauthSecret = process.env.ADMIN_PASSWORD || process.env.GOOGLE_CLIENT_SECRET || 'lumina_calendar_oauth_secret';
            const expectedSig = crypto.createHmac('sha256', oauthSecret).update(`${parsed.nonce}:${parsed.redirect_uri}:${parsed.ts}`).digest('hex');
            const sigBuf = Buffer.from(parsed.sig, 'hex');
            const expBuf = Buffer.from(expectedSig, 'hex');
            if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
              redirectUriFromState = parsed.redirect_uri;
            }
          }
        } else {
          // Backward compatibility for unsigned states in tests
          redirectUriFromState = parsed.redirect_uri;
        }
      }
    } catch (e) {}
  }

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = redirectUriFromState || process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { ...
  ```

- **Empirical Execution & Failure Reproduction**:
  1. **Tampered State Attack**:
     - Constructed payload with forged HMAC signature:
       `sig = 'bad0000000000000000000000000000000000000000000000000000000000000'`.
     - Sent request `GET /api/calendar?action=callback&code=stolen_code&state=${tamperedState}`.
     - **Observed**: The handler **did NOT reject the request**. It set `redirectUriFromState = null`, defaulted `redirectUri` to `${proto}://${host}/api/calendar/callback`, executed token exchange, and returned **HTTP 200 OK** (`<!DOCTYPE html>...<title>Google Calendar Connected</title>`).
  2. **Expired State Attack**:
     - Constructed payload with timestamp 60 minutes in the past: `ts = Date.now() - 3,600,000`.
     - Sent request `GET /api/calendar?action=callback&code=stolen_code&state=${expiredState}`.
     - **Observed**: The handler **did NOT reject the request**. It proceeded with token exchange and returned **HTTP 200 OK**.
  3. **Unsigned State Bypass (Line 140-143)**:
     - Constructed unsigned state payload: `{ redirect_uri: 'http://attacker.com' }` (omitting `nonce`, `ts`, and `sig`).
     - **Observed**: Line 142 accepted the unverified `redirect_uri` directly (`redirectUriFromState = parsed.redirect_uri`).
  - **Result**: **FAIL (CRITICAL SECURITY FLAW)**.

---

## 2. Logic Chain

1. **Test Suites & Invariants (Observation 1.1)**:
   - All 3 test suites (`lint.cjs`, `features.test.cjs`, `recheck-all-tasks.cjs`) execute cleanly with 0 errors.
   - Line counts for all modified files remain below the 2,000 LOC ceiling.

2. **IoT Rate Limiting Verification (Observation 1.2 & 1.3)**:
   - `GET /api/iot?action=time` enforces 60 requests per 60 seconds per IP, blocking request 61+ with HTTP 429.
   - Sequence monotonicity rejects out-of-order/stale packets (`seq < lastSeq`) with HTTP 401.
   - IoT defenses comply fully with requirements.

3. **OAuth2 State Validation Failure (Observation 1.4)**:
   - *Requirement*: "Verify tampered or expired OAuth state signatures are rejected."
   - *Vulnerability*: In `api/calendar.js`, when signature verification fails or timestamp expires, the code only skips assigning `redirectUriFromState`.
   - *Consequence*: It fails-open by falling back to `process.env.GOOGLE_REDIRECT_URI` or the host default and continues directly to the Google token exchange.
   - *Impact*: Any attacker can submit an arbitrary, tampered, or expired OAuth `state` parameter without triggering rejection. This breaks anti-CSRF protections (RFC 6749 §10.12).

---

## 3. Caveats

- All other Milestone 2 remediations (CORS in `auth-guard.js`, GitHub storage path traversal in `storage.js`, admin password redaction in `sync.js`, telemetry session checks in `chat.js`, rate limiting and sequence monotonicity in `iot.js`) were verified and functioning properly.
- The failure is isolated specifically to `api/calendar.js:123-153` failing-open rather than rejecting with HTTP 400 when an invalid, tampered, or expired `state` is encountered.

---

## 4. Conclusion

**Verdict: REJECT**

Milestone 2 cannot be approved in its current state because `api/calendar.js` fails to reject tampered and expired OAuth2 state signatures, directly violating acceptance requirement #2.

### Required Worker Action:
In `api/calendar.js` (`handleCallback`):
1. When `state` is received, strictly parse and validate that:
   - `state` is a valid base64-encoded JSON object containing `redirect_uri`, `nonce`, `ts`, and `sig`.
   - `age = Date.now() - parsed.ts` satisfies `age >= 0 && age <= 15 * 60 * 1000`.
   - `parsed.sig` matches HMAC-SHA256(`nonce:redirect_uri:ts`, secret) using `crypto.timingSafeEqual`.
2. If `state` is missing, malformed, expired, or carries an invalid signature:
   **Immediately reject the request** with an HTTP 400 error page / JSON (e.g. `res.status(400).send(...)` or error modal) BEFORE invoking `fetch('https://oauth2.googleapis.com/token')`.
3. Eliminate line 140-143 fallback that allows unsigned state objects to bypass signature verification.
4. Keep `api/calendar.js` under 2,000 lines (currently 822 lines).

---

## 5. Verification Method

To independently reproduce both the passing IoT rate limiter and the failing OAuth2 state vulnerability, execute:

```bash
# 1. Verify IoT Gateway Rate Limiting (Expect: 60 allowed, request 61+ returns HTTP 429)
node -e "
(async () => {
  const iot = await import('./api/iot.js');
  const handler = iot.default;
  function mockRes() {
    return { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, json(d) { this.body = d; return this; } };
  }
  let allowed = 0, blocked = 0;
  for (let i = 1; i <= 65; i++) {
    const res = mockRes();
    await handler({ method: 'GET', url: '/api/iot?action=time', headers: { 'x-forwarded-for': '203.0.113.195' }, query: { action: 'time' } }, res);
    if (res.statusCode === 200) allowed++; else blocked++;
  }
  console.log('IoT Time Rate Limit: Allowed=' + allowed + ', Blocked=' + blocked);
})();
"

# 2. Verify OAuth2 State Validation Defect (Reproduce failure to reject tampered state)
node -e "
(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-sec';
  process.env.ADMIN_PASSWORD = 'master-password';
  global.fetch = async () => ({ ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) });
  const cal = await import('./api/calendar.js');
  const handler = cal.default;
  const tamperedState = Buffer.from(JSON.stringify({ redirect_uri: 'http://localhost:3000', nonce: '123', ts: Date.now(), sig: 'bad_sig' })).toString('base64');
  const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, send(t) { this.text = t; return this; }, setHeader() {} };
  await handler({ method: 'GET', url: '/api/calendar?action=callback&code=abc&state=' + encodeURIComponent(tamperedState), query: { action: 'callback', code: 'abc', state: tamperedState }, headers: { host: 'localhost:3000' } }, res);
  console.log('Tampered State Response Status:', res.statusCode);
  if (res.statusCode === 200) console.log('BUG CONFIRMED: Tampered state was NOT rejected with HTTP 400!');
})();
"

# 3. Standard Test Suites
node tests/lint.cjs
node tests/features.test.cjs
node tests/recheck-all-tasks.cjs
```
