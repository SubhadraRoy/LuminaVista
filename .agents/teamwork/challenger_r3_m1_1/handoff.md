# Adversarial Evaluation Report — challenger_r3_m1_1

**Target**: Milestone M1 (`api/calendar.js`)  
**Verdict**: **`REQUEST_CHANGES`**

---

## 1. Observation

### 1A. Robust Areas Verified
1. **Redirect URI Resolution (`resolveRedirectUri`)**:
   - `api/calendar.js:38-82`: Correctly forces `PRODUCTION_REDIRECT_URI` (`https://lumina-vista-sigma.vercel.app/api/calendar/callback`) for all `*.github.io` client queries (`https://subhadraroy.github.io/LuminaVista/callback`, `https://attacker.github.io/steal`, etc.) and Vercel preview hosts (`*.vercel.app`).
   - Correctly preserves custom test URIs (`https://luminavista.example.com/api/calendar/callback`) and localhost development ports (`localhost:3000`, `127.0.0.1:8080`).
   - Prioritizes verified `redirectUriFromState` and `process.env.GOOGLE_REDIRECT_URI`.
   - Tested across 16 adversarial/malformed inputs (null, undefined, arrays, non-strings, malformed hosts, prototype injection); survives without uncaught exceptions or crashes.
2. **CORS Preflight on `OPTIONS`**:
   - `api/calendar.js:875`: `if (req.method === 'OPTIONS') return res.status(204).end();`
   - All endpoints (`/api/calendar`, `/api/calendar/auth`, `/api/calendar/callback`, `/api/calendar/status`, `/api/calendar/sync`, `/api/calendar/disconnect`) return HTTP 204 with `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`.
3. **Cookie Attributes & CHIPS**:
   - `api/calendar.js:24-35`: `serializeGcalCookie` sets `Partitioned`, `SameSite=None`, `Secure`, and `HttpOnly` on HTTPS requests.
4. **State Parameter Verification**:
   - `api/calendar.js:192-242`: Enforces HMAC-SHA256 constant-time signature verification, rejects tampered signatures with HTTP 400, rejects states > 15 minutes old, and handles corrupted JSON/base64 without crashing.
5. **Existing Verification Suites**:
   - `node tests/lint.cjs`: `✓ All 40 JavaScript modules passed syntax validation.`
   - `node tests/features.test.cjs`: `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===`
   - `node tests/recheck-all-tasks.cjs`: `🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!`
   - `node tests/browser-cdp-test.cjs`: `=== BROWSER TEST RESULTS: 122/122 PASSED ===`
   - Line count of `api/calendar.js`: 911 lines (well below the 2,000-line budget limit). Firmware untouched.

---

### 1B. Confirmed Vulnerability / Regression Observed
On non-OPTIONS requests returning JSON (such as `GET /api/calendar/status`, `GET /api/calendar/auth`, `POST /api/calendar/sync`, `DELETE /api/calendar/sync`, and `POST /api/calendar/disconnect`):

1. **Header Overwrite in `sendSecureJson`**:
   At `api/calendar.js:118, 148, 431, 584, 600, 682, 695, 778, 828, 864`, responses are sent using `sendSecureJson(res, statusCode, data)`.
   In `api/_lib/auth-guard.js:435-440`:
   ```javascript
   export function sendSecureJson(res, statusCode, data, req = null) {
     const request = req || res.req || res._req;
     setSecurityHeaders(res, request);
     const safeData = sanitizeDeep(data);
     return res.status(statusCode).json(safeData);
   }
   ```
2. **Restricted Origins & Methods in `setSecurityHeaders`**:
   In `api/_lib/auth-guard.js:395-426`:
   ```javascript
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
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
   ```
3. **Verbatim Test Failure**:
   Running `node tests/adversarial-calendar.test.cjs`:
   ```
   ✓ PROBE PASS: Whitelisted origin permitted: https://preview-feat-branch.vercel.app (on OPTIONS)
   ✓ PROBE PASS: Non-OPTIONS GET /api/calendar/status reflects allowed origin: https://subhadraroy.github.io
   ❌ VULNERABILITY DETECTED: Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" missing PATCH
   Error: CORS methods regression: missing PATCH in GET, POST, PUT, DELETE, OPTIONS
   ```
   And running peer adversarial suite `node tests/suite-calendar-adversarial.cjs`:
   ```
   ❌ FAIL: CORS dynamically allows .github.io, .vercel.app, and localhost origins
   AssertionError [ERR_ASSERTION]: Origin https://custom-preview-branch.vercel.app should be reflected
   + actual: 'https://lumina-vista-sigma.vercel.app'
   - expected: 'https://custom-preview-branch.vercel.app'
   ```
4. **Empirical Reproduction Command**:
   ```bash
   node -e "
   (async () => {
     const { default: handler } = await import('./api/calendar.js');
     const headers = {};
     const mockRes = {
       setHeader(k, v) { headers[k.toLowerCase()] = v; },
       getHeader(k) { return headers[k.toLowerCase()]; },
       status() { return this; }, json() { return this; }, send() { return this; }, end() { return this; }
     };
     await handler({ method: 'GET', url: '/api/calendar/status', headers: { origin: 'https://preview-123.vercel.app' } }, mockRes);
     console.log('Origin:', headers['access-control-allow-origin']);
     console.log('Methods:', headers['access-control-allow-methods']);
   })();"
   ```
   **Output**:
   ```
   Origin: https://lumina-vista-sigma.vercel.app
   Methods: GET, POST, PUT, DELETE, OPTIONS
   ```

---

## 2. Logic Chain

1. From Observation 1A: Worker M1 added `setCorsHeaders(req, res)` at `api/calendar.js:85-109` to dynamically allow `origin.endsWith('.github.io')` and `origin.endsWith('.vercel.app')`, and set `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`.
2. From Observation 1B.1 and 1B.2: Whenever `sendSecureJson` is invoked on any JSON response, `sendSecureJson` internally calls `setSecurityHeaders(res, request)`.
3. Because `setSecurityHeaders` in `api/_lib/auth-guard.js` does NOT include `.endsWith('.github.io')` or `.endsWith('.vercel.app')` in its origin check, it calculates `isAllowed = false` for any Vercel preview domain (`https://preview-123.vercel.app`) and any non-subhadraroy GitHub Pages fork (`https://community-fork.github.io`).
4. Therefore, `setSecurityHeaders` overwrites `res.setHeader('Access-Control-Allow-Origin', 'https://lumina-vista-sigma.vercel.app')` and overwrites `res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')`.
5. This creates an asymmetric CORS failure: preflight `OPTIONS` returns the correct preview origin, but the subsequent `GET /api/calendar/status` or `POST /api/calendar/sync` response has its origin overwritten to `lumina-vista-sigma.vercel.app`. The client's browser sees an origin mismatch and blocks the response, preventing two-way synchronization on all preview and community fork environments.
6. Furthermore, `PATCH` is stripped from `Access-Control-Allow-Methods`, violating the requirement in `ORIGINAL_REQUEST.md:149`.

---

## 3. Caveats
- Live token exchange with Google's production servers requires active Google Cloud Client ID and Secret in production Vercel environment variables; tested locally with mocked credentials and simulated token responses.
- `api/_lib/auth-guard.js` is shared across other endpoints (`api/admin.js`, `api/iot.js`, `api/sync.js`). Worker M1 can remediate this entirely inside `api/calendar.js` by hooking/intercepting `res.setHeader` within `setCorsHeaders` to ensure that subsequent calls to `setSecurityHeaders` cannot downgrade `Access-Control-Allow-Origin` or `Access-Control-Allow-Methods`.

---

## 4. Conclusion & Required Changes

**Verdict**: **`REQUEST_CHANGES`**

### Required Action for Worker M1
In `api/calendar.js`, update `setCorsHeaders(req, res)` to wrap `res.setHeader` so that any subsequent call from `sendSecureJson` cannot overwrite the dynamically verified CORS origin or strip `PATCH` from `Access-Control-Allow-Methods`.

#### Concrete Patch for Worker M1 (`api/calendar.js` in `setCorsHeaders`):
```javascript
function setCorsHeaders(req, res) {
  if (!res || typeof res.setHeader !== 'function') return;
  setSecurityHeaders(res, req);
  const origin = req?.headers?.origin || req?.headers?.Origin;
  const ALLOWED_ORIGINS = new Set([
    'https://subhadraroy.github.io',
    'https://lumina-vista-sigma.vercel.app',
    'https://luminavista.example.com'
  ]);
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean).forEach(o => ALLOWED_ORIGINS.add(o));
  }
  const isAllowed = Boolean(origin && (
    ALLOWED_ORIGINS.has(origin) ||
    origin.endsWith('.github.io') ||
    origin.endsWith('.vercel.app') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ));
  const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, x-session-id, X-Session-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Guard against sendSecureJson / setSecurityHeaders overwriting origin or methods later in the response lifecycle
  if (!res._lvCorsHooked) {
    res._lvCorsHooked = true;
    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = (key, val) => {
      const lower = String(key).toLowerCase();
      if (lower === 'access-control-allow-origin' && isAllowed) {
        return origSetHeader(key, finalOrigin);
      }
      if (lower === 'access-control-allow-methods') {
        return origSetHeader(key, 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      }
      return origSetHeader(key, val);
    };
  }
}
```

---

## 5. Verification Method

Once Worker M1 applies the fix, verify independently with:

1. **Adversarial Test Harness (Section 2C non-OPTIONS CORS verification)**:
   ```bash
   node tests/adversarial-calendar.test.cjs
   ```
   *Expected*: `🎉 ALL 105 ADVERSARIAL PROBES PASSED WITH ZERO FAILURES!`
2. **Peer Adversarial Suite**:
   ```bash
   node tests/suite-calendar-adversarial.cjs
   ```
   *Expected*: `🎉 ALL ADVERSARIAL TESTS PASSED!`
3. **Core Test Suites**:
   ```bash
   node tests/lint.cjs
   node tests/features.test.cjs
   node tests/recheck-all-tasks.cjs
   node tests/browser-cdp-test.cjs
   ```
   *Expected*: All 4 suites pass with 0 errors.
