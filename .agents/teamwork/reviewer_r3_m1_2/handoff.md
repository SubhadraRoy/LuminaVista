# Independent Code Quality & Adversarial Review Report — Milestone M1

**Reviewer Agent**: `reviewer_r3_m1_2`  
**Roles**: Quality Reviewer, Adversarial Critic  
**Working Directory**: `c:\Users\roysu\LuminaVista\.agents\teamwork\reviewer_r3_m1_2`  
**Target Under Review**: `api/calendar.js` (Worker: `worker_r3_m1`)  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Observation

### Target File Integrity, Line Limits, and Physical Boundaries
- **Target File**: `c:\Users\roysu\LuminaVista\api\calendar.js`
- **Line Count**: **911 lines** (verified via `node -e "console.log(fs.readFileSync('api/calendar.js', 'utf8').split('\n').length)"`). Strictly compliant with the < 2,000-line budget limit (45.5% capacity).
- **Physical Firmware Boundaries**: `git diff --name-only origin/main -- firmware/` returned empty; physical firmware files in `firmware/**` are 100% untouched.
- **Verification Suites**: `tests/features.test.cjs`, `tests/lint.cjs`, `tests/recheck-all-tasks.cjs`, and `tests/browser-cdp-test.cjs` remain 100% untampered.

### Automated Test Suite Execution Results
Direct execution of all project test suites in the local environment:
1. **Module Syntax Linter**:
   - Command: `node tests/lint.cjs`
   - Result: `✓ All 40 JavaScript modules passed syntax validation.` (0 errors)
2. **Unit Feature Verification Suite**:
   - Command: `node tests/features.test.cjs`
   - Result: `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===` (0 failures)
3. **Recheck All Tasks 5-Point Audit**:
   - Command: `node tests/recheck-all-tasks.cjs`
   - Result: `🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!` (0 failures)
4. **Google Chrome Real-Browser CDP Suite**:
   - Command: `node tests/browser-cdp-test.cjs`
   - Result: `=== BROWSER TEST RESULTS: 122/122 PASSED ===` (122/122 passed in headless Chrome)
5. **Universal Laya Gate Decision**:
   - Command: `laya-gate -f api/calendar.js -c "Google OAuth redirect URI, CORS preflight OPTIONS 204, CHIPS Partitioned cookie, Redis persistence, line count under 2000" --fail-open`
   - Result: `[PASS] p=0.776 (threshold 0.700)`
6. **Adversarial Test Suite 1**:
   - Command: `node tests/adversarial-calendar.test.cjs`
   - Result: `🎉 ALL 101 ADVERSARIAL PROBES PASSED WITH ZERO FAILURES!`

### Adversarial Finding & Defect Observation
Direct execution of adversarial suite `node tests/suite-calendar-adversarial.cjs`:
- Result: `🎉 ADVERSARIAL CALENDAR SUITE: 22/23 TESTS PASSED!`
- **Verbatim Failure Output**:
  ```text
  [SECTION 2: CORS & Preflight Compliance]
    ✓ PASS: OPTIONS on all calendar actions returns HTTP 204 with credentials and methods
    ❌ FAIL: CORS dynamically allows .github.io, .vercel.app, and localhost origins
       Reason: Origin https://custom-preview-branch.vercel.app should be reflected
  + actual - expected

  + 'https://lumina-vista-sigma.vercel.app'
  - 'https://custom-preview-branch.vercel.app'
  ```

### Code Root Cause Investigation
1. In `api/calendar.js:7`:
   ```javascript
   import { sendSecureJson, sanitizeError, setSecurityHeaders } from './_lib/auth-guard.js';
   ```
2. In `api/calendar.js:85-109`, `setCorsHeaders(req, res)` correctly matches:
   ```javascript
   const isAllowed = Boolean(origin && (
     ALLOWED_ORIGINS.has(origin) ||
     origin.endsWith('.github.io') ||
     origin.endsWith('.vercel.app') ||
     /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
   ));
   const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
   res.setHeader('Access-Control-Allow-Origin', finalOrigin);
   ```
3. However, all JSON responses in `api/calendar.js` (lines 118, 131, 148, 431, 584, 600, 628, 682, 688, 695, 769, 778, 784, 791, 799, 820, 828, 831, 835, 864) return via:
   ```javascript
   return sendSecureJson(res, statusCode, data);
   ```
4. Looking into `api/_lib/auth-guard.js:428-433`:
   ```javascript
   export function sendSecureJson(res, statusCode, data, req = null) {
     setSecurityHeaders(res, req);
     res.status(statusCode).json(data);
   }
   ```
5. And looking into `api/_lib/auth-guard.js:395-414`:
   ```javascript
   export function setSecurityHeaders(res, req = null) {
     ...
     const origin = request?.headers?.origin || request?.headers?.Origin;
     const ALLOWED_ORIGINS = new Set([
       'https://subhadraroy.github.io',
       'https://lumina-vista-sigma.vercel.app',
       'https://luminavista.example.com'
     ]);
     ...
     const isAllowed = Boolean(origin && (
       ALLOWED_ORIGINS.has(origin) ||
       /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
     ));
     const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
     res.setHeader('Access-Control-Allow-Origin', finalOrigin);
   ```
6. **The Conflict**:
   `sendSecureJson` calls `setSecurityHeaders` immediately before calling `res.status().json()`.
   `setSecurityHeaders` does **NOT** support `*.vercel.app` or `*.github.io` wildcard matching; it only has hardcoded strings.
   Consequently, for any preview deployment (`https://custom-preview-branch.vercel.app`) or any GitHub Pages user fork (`https://contributor.github.io`), `sendSecureJson` **clobbers** the `Access-Control-Allow-Origin` header back to `'https://lumina-vista-sigma.vercel.app'`.
   While `OPTIONS` preflight returns 204 with the matching origin (because it exits before `sendSecureJson`), the actual subsequent `GET` or `POST` fetch from the browser is rejected by the browser's CORS policy due to origin mismatch!

---

## 2. Logic Chain

1. *From R1 specification in ORIGINAL_REQUEST.md & PROJECT.md*:
   The requirement mandates full CORS support for static hosts and preview deployments (`*.github.io` and `*.vercel.app`), enabling cross-domain calendar synchronization without connection drops.
2. *From Worker Handoff Report*:
   Worker M1 intended to enable dynamic matching for `origin.endsWith('.github.io') || origin.endsWith('.vercel.app')` inside `setCorsHeaders`.
3. *From Empirical Testing & Observation*:
   On HTTP `OPTIONS` requests, `handler` returns 204 before `sendSecureJson` is reached, so `OPTIONS` reflects the caller's origin.
   However, on real `GET /api/calendar/status`, `GET /api/calendar/sync`, `POST /api/calendar/sync`, etc., `sendSecureJson` from `auth-guard.js` re-invokes `setSecurityHeaders`, silently overwriting `Access-Control-Allow-Origin` with `https://lumina-vista-sigma.vercel.app`.
4. *From Browser Impact*:
   When a user accesses LuminaVista OS from a preview branch (`https://preview-123.vercel.app`) or a GitHub Pages fork (`https://fork-user.github.io`), their browser preflights successfully, but the actual GET `/api/calendar/status` and sync requests fail closed in the browser with:
   `Access to fetch at '...' from origin 'https://preview-123.vercel.app' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header has a value 'https://lumina-vista-sigma.vercel.app' that is not equal to the supplied origin.`
5. *From Integrity Check*:
   No integrity violations were detected. The core Google OAuth redirect URI logic, sovereign guest session decoupling, CHIPS Partitioned cookies, Redis master token persistence, and all-day date calculations are genuinely implemented and robust.
6. *Conclusion*:
   Because this CORS header clobbering defect breaks cross-domain preview and fork functionality, the verdict must be **REQUEST_CHANGES** with a scoped, drop-in remediation provided to Worker M1.

---

## 3. Caveats

- **Google OAuth Production Client Secrets**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set in the Vercel project environment for live token exchange with Google's servers. Under mock/offline test environments, graceful error boundaries operate properly.
- **Scope Discipline**: Firmware files in `firmware/**` were intentionally not touched. Reviewer did not directly modify implementation code.

---

## 4. Conclusion & Required Remediation

**Verdict**: **REQUEST_CHANGES**

### Actionable Remediation for Worker M1 (`api/calendar.js`)
Worker M1 can completely resolve this issue inside `api/calendar.js` without altering `api/_lib/auth-guard.js`:

In `api/calendar.js`:
1. Change the import at line 7 from:
   ```javascript
   import { sendSecureJson, sanitizeError, setSecurityHeaders } from './_lib/auth-guard.js';
   ```
   to:
   ```javascript
   import { sanitizeError, setSecurityHeaders } from './_lib/auth-guard.js';

   // Calendar-specific response helper ensuring dynamic CORS origins are not clobbered by auth-guard
   function sendSecureJson(res, statusCode, data) {
     setCorsHeaders(res?._req || res?.req, res);
     return res.status(statusCode).json(data);
   }
   ```

2. Because `setCorsHeaders(req, res)` already calls `setSecurityHeaders(res, req)` internally (setting all defensive security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Cache-Control`, `Referrer-Policy`, etc.) and then sets the expanded CORS headers (`.github.io`, `.vercel.app`, methods, credentials), defining `sendSecureJson` this way guarantees that `Access-Control-Allow-Origin` remains intact for the actual JSON response payload.

---

## 5. Verification Method

Once Worker M1 applies the fix, verify that:
1. `node tests/suite-calendar-adversarial.cjs` passes **23/23 assertions** (100%):
   ```bash
   node tests/suite-calendar-adversarial.cjs
   ```
   *Expected Output*: `🎉 ALL 23 ADVERSARIAL CALENDAR TESTS PASSED WITH ZERO FAILURES!`
2. Verify all other suites continue passing with zero regressions:
   ```bash
   node tests/lint.cjs
   node tests/features.test.cjs
   node tests/recheck-all-tasks.cjs
   node tests/browser-cdp-test.cjs
   node tests/adversarial-calendar.test.cjs
   ```
3. Direct node verification of GET /api/calendar/status origin reflection:
   ```bash
   node -e "
   (async () => {
     const mod = await import('./api/calendar.js');
     const h = {};
     const res = { setHeader: (k,v) => h[k.toLowerCase()] = v, status: () => res, json: () => res };
     await mod.default({ method: 'GET', url: '/api/calendar/status', headers: { origin: 'https://preview-test.vercel.app' } }, res);
     console.assert(h['access-control-allow-origin'] === 'https://preview-test.vercel.app');
     console.log('CORS reflection verified!');
   })();"
   ```

---

## Quality Review Summary

**Verdict**: **REQUEST_CHANGES**

### Findings

#### [Major] CORS Origin Clobbered by `auth-guard.js:sendSecureJson` on Actual Responses
- **What**: For any origin ending in `.vercel.app` (e.g. `https://custom-preview-branch.vercel.app`) or `.github.io` (other than `subhadraroy.github.io`), `GET` and `POST` responses return `Access-Control-Allow-Origin: https://lumina-vista-sigma.vercel.app` instead of reflecting the caller's origin.
- **Where**: `api/calendar.js:7, 118, 131, 148, 431, 584, 600, 628, 682, 688, 695, 769, 778, 784, 791, 799, 820, 828, 831, 835, 864`.
- **Why**: `sendSecureJson` imported from `auth-guard.js` invokes `setSecurityHeaders` right before flushing JSON, which overwrites `Access-Control-Allow-Origin` using a strict set that lacks `.vercel.app` and `.github.io` domain patterns.
- **Suggestion**: Define `sendSecureJson` locally in `api/calendar.js` to call `setCorsHeaders(res?._req || res?.req, res)` before `res.status().json()`.

### Verified Claims
- **Integrity Validation**: Zero hardcoded test results, facade bypasses, or cheated assertions found in `api/calendar.js` → **PASS**
- **Redirect URI Prioritization**: Rewrites GitHub Pages to `PRODUCTION_REDIRECT_URI` while preserving localhost and custom domains → **PASS**
- **Public Decoupling**: `/api/calendar/status` and `/api/calendar/auth` accessible without master admin cookies → **PASS**
- **CHIPS Partitioned Cookies**: HTTPS cookies serialized with `Partitioned`, `SameSite=None`, `Secure`, `HttpOnly` → **PASS**
- **Google Calendar Sync Token Handling**: Refreshes tokens on 401 and falls back to Redis cache for guest devices → **PASS**
- **All-Day Event Calculation**: Enforces `end.date = start.date + 1 day` for single-day all-day events → **PASS**
- **Line Count Budget**: 911 lines (< 2,000 limit) → **PASS**
- **Firmware Protection**: `firmware/**` untouched → **PASS**
- **Automated Test Suites**: `lint.cjs`, `features.test.cjs`, `recheck-all-tasks.cjs`, `browser-cdp-test.cjs` pass 100% → **PASS**

---

## Adversarial Challenge Report

**Overall Risk Assessment**: **MEDIUM** (due to CORS origin clobbering on preview/fork deployments)

### Challenges Tested
1. **OAuth State Signature & Expiration**:
   - Forged signatures and tampered redirect URIs are strictly rejected with HTTP 400 using `crypto.timingSafeEqual`.
   - States older than 15 minutes or with future timestamps are rejected with HTTP 400.
2. **Malformed Cookie & Prototype Pollution Probes**:
   - Corrupted base64 or invalid JSON in `gcal_token` cookie fails closed to null without unhandled exceptions.
   - Payloads containing `__proto__` do not pollute `Object.prototype`.
3. **CORS Origin Reflection on Actual Non-OPTIONS Responses**:
   - `OPTIONS` preflight returns 204 with correct origin reflection.
   - Non-OPTIONS `GET`/`POST` responses fail to reflect dynamic origins due to `auth-guard.js:sendSecureJson` clobbering (**DEFECT CONFIRMED**).
