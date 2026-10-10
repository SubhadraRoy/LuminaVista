# Handoff Report — Milestone 2 Remediation: OAuth2 State Validation (Iteration 2)

**Agent**: Worker M2 (`worker_m2_it2`)  
**Mission**: Remediate the OAuth2 state validation fail-open vulnerability in `api/calendar.js` identified by Challenger M2_2.  
**Role**: Implementer, QA, Specialist  
**Timestamp**: 2026-10-16T17:51:00Z  
**Verdict**: **COMPLETE / READY FOR AUDIT**  

---

## 1. Observation

Direct empirical observations before and after remediation:

### 1.1 Baseline Defect Reproduction (Challenger M2_2 Defect)
- Running Challenger M2_2's repro script against `api/calendar.js` with a tampered signature (`sig = 'bad_sig'`) previously resulted in:
  ```
  Tampered State Response Status: 200
  BUG CONFIRMED: Tampered state was NOT rejected with HTTP 400!
  ```
  Because the previous lines 123-146 in `handleCallback` caught verification failures silently, ignored them, and allowed the code to fall back to default redirect URIs and continue directly to `fetch('https://oauth2.googleapis.com/token')`.

### 1.2 Remediated Execution Results
- **Tampered State Repro**:
  ```
  Tampered State Response Status: 400
  SUCCESS: Tampered state was rejected with HTTP 400!
  ```
- **State Validation Scenarios**:
  * Valid HMAC-SHA256 state within 15 min TTL: `HTTP 200 OK` (Proceeds with code exchange)
  * Missing `state`: `HTTP 400 Bad Request`
  * Expired `state` (> 15 minutes old): `HTTP 400 Bad Request`
  * Future `state` (skew > 0 into future): `HTTP 400 Bad Request`
  * Unsigned `state` (missing nonce/ts/sig): `HTTP 400 Bad Request`
  * Tampered `state` (invalid signature or truncated buffer): `HTTP 400 Bad Request`

### 1.3 Full Test Suite Execution Results
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
  Exit code: 0. Specifically, Test Suite 15 (OPTIONS CORS preflight line 1153) passed:
  ```
  ✓ OPTIONS preflight returns 204 No Content
  ✓ OPTIONS preflight sets Access-Control-Allow-Origin
  ✓ OPTIONS preflight permits DELETE method
  ✓ OPTIONS preflight permits credentials
  ```

- **Recheck Task Audit (`node tests/recheck-all-tasks.cjs`)**:
  ```
  🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!
  ```
  Exit code: 0.

- **Browser CDP Verification (`node tests/browser-cdp-test.cjs`)**:
  ```
  === BROWSER TEST RESULTS: 122/122 PASSED ===
  🎉 ALL REAL-BROWSER TESTS PASSED IN GOOGLE CHROME!
  ```
  Exit code: 0.

- **Laya Quality Gate (`laya-gate`)**:
  ```
  [PASS] p=0.881 (threshold 0.700) | criteria: "OAuth2 state validation rejects tampered, expired, or unsigned states with HTTP 400"
  ```

### 1.4 Invariants Compliance
- **File ownership**: Exclusively modified `api/calendar.js`.
- **Line count budget**: `api/calendar.js` has 846 lines (strictly below the 2,000 LOC ceiling).
- **Firmware protection**: Zero changes to `firmware/**`.

---

## 2. Logic Chain

1. **Identification of Root Cause (Observation 1.1)**:
   - In `api/calendar.js`, `handleCallback` caught errors and bypassed signature checks without halting request execution when `state` validation failed. Unsigned state was also explicitly permitted by lines 140-143.
2. **Remediation in `api/calendar.js:123-165`**:
   - `handleCallback` now inspects the `state` parameter before initiating Google token exchange.
   - If `state` is missing or not a non-empty string, it immediately terminates the request with HTTP 400.
   - Decodes base64 and parses JSON, verifying that `redirect_uri`, `nonce`, `ts`, and `sig` are present, non-empty strings/numbers.
   - Calculates `age = Date.now() - tsNum` and verifies `age >= 0 && age <= 15 * 60 * 1000`.
   - Computes expected HMAC-SHA256 signature over `${parsed.nonce}:${parsed.redirect_uri}:${parsed.ts}` using `ADMIN_PASSWORD || GOOGLE_CLIENT_SECRET || 'lumina_calendar_oauth_secret'`.
   - Compares signature buffer lengths (`sigBuf.length === expBuf.length && sigBuf.length !== 0`) and verifies with `crypto.timingSafeEqual(sigBuf, expBuf)`.
   - Any failure at any point immediately returns HTTP 400 with `<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>` before invoking `fetch('https://oauth2.googleapis.com/token')`.
   - The unsigned state fallback was permanently removed.
3. **Verification of Non-Regression (Observations 1.2, 1.3, 1.4)**:
   - Valid signed state requests proceed without interruption.
   - OPTIONS CORS preflights continue to return 204 with required headers.
   - All 1,102 unit/feature assertions, 42 recheck tasks, and 122 Chrome CDP browser tests pass with zero errors.

---

## 3. Caveats

- Google OAuth tokens can only be fully exchanged in production with live Google OAuth credentials and a valid Google authentication code. In automated unit and test environments, `fetch` is mocked.
- Time skew tolerance is strictly between 0 and 15 minutes (900,000 ms). Timestamps from the future (> 0 ms skew) or older than 15 minutes are strictly rejected as invalid or expired.
- No caveats regarding regressions: all test suites pass with zero failures.

---

## 4. Conclusion

The OAuth2 state validation fail-open defect in `api/calendar.js` has been completely resolved. Unsigned, malformed, expired, future, and tampered OAuth states are strictly rejected with HTTP 400 before token exchange occurs. All CORS preflight requirements and system invariants are preserved, and all 4 test suites pass completely.

---

## 5. Verification Method

To verify the remediation independently, execute:

```bash
# 1. Verify Challenger M2_2 defect is resolved (tampered state returns HTTP 400)
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
  if (res.statusCode === 400) console.log('SUCCESS: Tampered state was rejected with HTTP 400!');
  else console.log('FAILURE: Status was', res.statusCode);
})();
"

# 2. Verify all test suites pass
node tests/lint.cjs
node tests/features.test.cjs
node tests/recheck-all-tasks.cjs
node tests/browser-cdp-test.cjs

# 3. Verify line budget
node -e "
const fs = require('fs');
const lines = fs.readFileSync('api/calendar.js', 'utf8').split('\n').length;
console.log('api/calendar.js lines:', lines, lines < 2000 ? 'PASS' : 'FAIL');
"
```
