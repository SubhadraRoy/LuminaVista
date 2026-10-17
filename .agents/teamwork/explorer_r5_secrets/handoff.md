# Secrets, Configuration, Cookies, CSP & Logging Security Audit Report

**Auditor:** `explorer_r5_secrets` (Secrets & Configuration Security)  
**Target:** LuminaVista OS  
**Date:** 2026-10-17  
**Scope:** Hardcoded Secrets, Secure Cookie Flags, Content Security Policy (CSP), PII/Logging, Error Handling & Information Disclosure  

---

## 1. Observation

### Summary Table of Findings

| ID | Title / Vulnerability Class | Affected File(s) & Line(s) | Severity | Status |
|:---|:---|:---|:---:|:---:|
| **SEC-01** | Raw Exception Concatenation & Information Disclosure | `api/auth.js:125-129` | **High** | Confirmed Gap |
| **SEC-02** | Overly Permissive Client CSP Meta Tag Allowing Arbitrary HTTPS Scripts | `dashboard.html:7` | **High** | Confirmed Gap |
| **SEC-03** | Complete Absence of CSP Header in Serverless API Responses | `api/_lib/auth-guard.js:396-427` | **Medium** | Confirmed Gap |
| **SEC-04** | Missing `Partitioned` (CHIPS) Flag & Inconsistent Cookie Invalidation | `api/auth.js:105-111`, `api/logout.js:28-34` | **Medium** | Confirmed Gap |
| **SEC-05** | Plaintext Base64 OAuth Refresh Token Exposure in Client Cookie | `api/calendar.js:123-134, 491-520` | **Medium** | Confirmed Gap |
| **SEC-06** | Unsalted Passcode SHA-256 Hashes Exfiltrated via Admin API | `api/admin.js:59-75` | **Medium** | Confirmed Gap |
| **SEC-07** | Unscrubbed Error & Upstream Token Logging in Serverless Functions | `api/_lib/redis.js:121-125`, `api/_lib/auth-guard.js:139, 207, 269`, `api/calendar.js:435, 712` | **Medium** | Confirmed Gap |
| **SEC-08** | Incomplete File Path & Internal Hostname Scrubbing in `sanitizeError()` | `api/_lib/auth-guard.js:447-459` | **Low** | Confirmed Gap |
| **SEC-09** | Hardcoded Development Fallback Secret in Source Code | `api/iot.js:19-23` | **Low / Defense-in-Depth** | Gated Fallback |
| **SEC-10** | Absence of CSP Meta Tags on Static Landing & Error Pages | `index.html`, `404.html` | **Informational** | Defense-in-Depth |

---

### Detailed Observations by Surface

#### Obs-1: Hardcoded Secrets & Credentials Scan
- Executed full repository regular expression scans for API keys, bearer tokens, OAuth secrets, private keys, and environment variables across `.js`, `.cjs`, `.json`, `.html`, and root configurations.
- **Finding 1.1 (Clean):** Zero production API keys (Ollama Cloud, NVIDIA NIM, Groq, OpenRouter, Gemini, DeepSeek, E2B, GitHub PAT) exist in code. All external API keys are dynamically discovered via `process.env` in `api/_lib/key-pool.js:50-165`.
- **Finding 1.2 (Clean):** Zero `.env` or `.env*` files are tracked in the Git repository. `.gitignore:4-9` strictly ignores `.env`, `.env*.local`, `.env.development`, `.env.production`.
- **Finding 1.3 (Observation):** In `api/iot.js:19-23`:
  ```javascript
  19: export const getDeviceSecret = () => (
  20:   process.env.IOT_DEVICE_SECRET ||
  21:   cachedCloudSecret ||
  22:   (!process.env.VERCEL && process.env.NODE_ENV !== 'production' ? 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8' : '')
  23: ).trim();
  ```
  The fallback 64-character hex secret is hardcoded in source. It is gated by `!process.env.VERCEL && process.env.NODE_ENV !== 'production'`. In production or on Vercel, it safely evaluates to `''`. However, if self-hosted without setting `NODE_ENV=production`, the default secret would be active.
- **Finding 1.4 (Observation):** In `api/_lib/auth-guard.js:25`:
  ```javascript
  25: const salt = process.env.ADMIN_PASSWORD || 'lv_ip_salt';
  26: return 'anon_' + crypto.createHash('sha256').update(`${salt}:${rawIp}`).digest('hex').slice(0, 16);
  ```
  A static salt `'lv_ip_salt'` is used if `ADMIN_PASSWORD` is absent.

#### Obs-2: Secure Cookie Flags (`godx_session` & `gcal_token`)
- **Obs-2.1:** In `api/auth.js:101-111`:
  ```javascript
  101: const requestOrigin = req?.headers?.origin || req?.headers?.Origin || '';
  102: const isCrossSite = Boolean(requestOrigin && !requestOrigin.includes('lumina-vista-sigma.vercel.app'));
  103: const isHttps = req?.headers?.['x-forwarded-proto'] === 'https' || req?.connection?.encrypted || Boolean(process.env.VERCEL);
  104: 
  105: res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
  106:   httpOnly: true,
  107:   secure: isCrossSite ? true : isHttps,
  108:   sameSite: isCrossSite ? 'none' : 'lax',
  109:   maxAge: sessionTtl,
  110:   path: '/'
  111: }));
  ```
  `godx_session` is serialized with `httpOnly: true`, `secure: ...`, `sameSite: isCrossSite ? 'none' : 'lax'`. **However, `partitioned` is completely absent.** Under modern Chromium CHIPS (Cookies Having Independent Partitioned State) policy, cross-site cookies with `SameSite=None; Secure` without `Partitioned` are blocked in third-party or iframe contexts (such as GitHub Pages or embedding environments).
- **Obs-2.2:** In `api/logout.js:28-34`:
  ```javascript
  28: res.setHeader('Set-Cookie', serialize('godx_session', '', {
  29:   httpOnly: true,
  30:   secure: true,
  31:   sameSite: 'strict',
  32:   maxAge: -1,
  33:   path: '/'
  34: }));
  ```
  1. `api/logout.js` specifies `sameSite: 'strict'`. In browsers where the cookie was set with `SameSite=None` or partitioned across domains, setting a clear cookie with `sameSite: 'strict'` fails to match the original cookie jar context.
  2. `partitioned` is missing.
  3. `api/logout.js` only clears `godx_session`; it leaves `gcal_token` intact, failing to revoke or clear Google Calendar OAuth tokens on user logout.
- **Obs-2.3:** In `api/calendar.js:123-134`:
  ```javascript
  123: export function serializeGcalCookie(tokenData, proto, maxAgeSeconds = 30 * 24 * 60 * 60) {
  124:   const isHttps = proto === 'https';
  125:   const val = tokenData ? Buffer.from(JSON.stringify(tokenData)).toString('base64') : '';
  126:   return cookie.serialize('gcal_token', val, {
  127:     httpOnly: true,
  128:     secure: isHttps,
  129:     sameSite: isHttps ? 'none' : 'lax',
  130:     partitioned: isHttps,
  131:     maxAge: maxAgeSeconds,
  132:     path: '/'
  133:   });
  134: }
  ```
  `api/calendar.js` properly enforces `httpOnly: true`, `secure: isHttps`, `sameSite: isHttps ? 'none' : 'lax'`, and `partitioned: isHttps`. However, `tokenData` contains `{ access_token, refresh_token, email }`, base64-encoded without cryptographic encryption. The long-lived Google OAuth `refresh_token` sits in client cookie storage.

#### Obs-3: Content Security Policy (CSP) Inspection
- **Obs-3.1:** In `api/_lib/auth-guard.js:396-427` (`setSecurityHeaders`):
  ```javascript
  415: res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  416: res.setHeader('Access-Control-Allow-Credentials', 'true');
  417: res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  418: res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id, X-Lumina-Device-Id, X-Lumina-Timestamp, X-Lumina-Nonce, X-Lumina-Seq, X-Lumina-Signature');
  419: res.setHeader('X-Content-Type-Options', 'nosniff');
  420: res.setHeader('X-Frame-Options', 'DENY');
  421: res.setHeader('X-XSS-Protection', '1; mode=block');
  422: res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  423: res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  424: res.setHeader('Pragma', 'no-cache');
  425: res.setHeader('Expires', '0');
  426: res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  ```
  **Zero Content-Security-Policy header is set.** API endpoints returning JSON or error payloads do not restrict script execution or frame ancestors at the response header level.
- **Obs-3.2:** In `dashboard.html:7`:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:; object-src 'none';">
  ```
  - `default-src` includes the wildcard scheme `https:`. This permits script, style, frame, and font execution from *any* HTTPS domain on the public web.
  - No explicit `script-src` directive exists in the meta tag.
  - No explicit `style-src` directive exists in the meta tag.
  - No explicit `connect-src` directive exists in the meta tag.
  - Contrast with `vercel.json:14`:
    `"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; frame-src 'self' data: blob:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self';"`
  - When `dashboard.html` is served on GitHub Pages (`subhadraroy.github.io`), Surge, Netlify, or local test environments, `vercel.json` headers are not applied; only the `<meta>` tag is active. Consequently, any arbitrary HTTPS domain can load scripts.
- **Obs-3.3:** Neither `index.html` nor `404.html` contain any `<meta http-equiv="Content-Security-Policy">`.

#### Obs-4: PII & Sensitive Data Logging
- **Obs-4.1:** In `api/calendar.js:435`:
  ```javascript
  435: console.error('Google token exchange error:', tokenData);
  ```
  Logs the raw Google token endpoint error response `tokenData` object directly to console stderr without `scrubSecrets()`.
- **Obs-4.2:** In `api/calendar.js:712`:
  ```javascript
  712: console.error('Google token refresh failed:', errText);
  ```
  Logs the raw text of the token refresh response `errText` to console stderr without `scrubSecrets()`.
- **Obs-4.3:** In `api/_lib/redis.js:121, 124`:
  ```javascript
  121: console.warn(`[SAFE_STORAGE] Redis quota exceeded during ${op} (${msg}). Degrading to fallback memory storage for 60s.`);
  124: console.warn(`[SAFE_STORAGE] Redis error during ${op} (${msg}). Falling back to memory storage.`);
  ```
  If Upstash Redis or a database client throws an error containing connection strings (e.g., `redis://default:TOKEN@host`), `${msg}` logs the raw message without `scrubSecrets(msg)`.
- **Obs-4.4:** In `api/_lib/auth-guard.js:139, 207, 269`:
  ```javascript
  139: console.warn('[AUTH_GUARD] Redis revocation check unavailable, failing closed:', err?.message || err);
  207: console.error("[AUTH_GUARD] Redis session verification failure:", error.message);
  269: console.warn("[AUTH_GUARD] Rate-limiting storage error (degrading to in-memory window):", err.message);
  ```
  Error messages are logged without passing through `scrubSecrets()`.
- **Obs-4.5 (Positive Verification):** `api/_lib/auth-guard.js:476-479`:
  `auditLog()` properly redacts IPs (`IP: [REDACTED]`) and scrubs details via `scrubSecrets(details)`.

#### Obs-5: Error Handling & Internal Information Disclosure
- **Obs-5.1:** In `api/auth.js:125-129`:
  ```javascript
  125: } catch (error) {
  126:   auditLog('AUTH_CRASH', req, error.message);
  127:   return sendSecureJson(res, 502, { success: false, error: 'Authentication engine failure: ' + (error.message || String(error)) }, req);
  128: }
  ```
  `error.message` is concatenated verbatim into the client JSON response. `sanitizeError()` is NOT called. Any runtime exception (e.g. `TypeError: Cannot read properties of undefined at ...`, database connection strings, or system paths) is disclosed to callers.
- **Obs-5.2:** In `api/_lib/auth-guard.js:447-459` (`sanitizeError`):
  ```javascript
  447: export function sanitizeError(error, defaultMessage = 'An internal processing error occurred.') {
  448:   if (!error) return defaultMessage;
  449:   const raw = typeof error === 'string' ? error : (error.message || String(error));
  450: 
  451:   let safe = scrubSecrets(raw);
  452: 
  453:   // If the raw error still contains sensitive stack or provider details, mask with default
  454:   if (/at\s+.+\(.+:\d+:\d+\)/.test(safe) || safe.length > 250) {
  455:     return defaultMessage;
  456:   }
  457: 
  458:   return safe || defaultMessage;
  459: }
  ```
  `sanitizeError()` relies on `/at\s+.+\(.+:\d+:\d+\)/` (which is present in `error.stack`, NOT `error.message`). If an error message contains a server filesystem path (e.g. `ENOENT: no such file, open 'C:\Users\roysu\...'` or `/var/task/api/...`) and length is under 250 characters, it passes through unmasked.
- **Obs-5.3:** In `api/admin.js:59-75`:
  ```javascript
  59: const vaultList = (Array.isArray(items) ? items : []).map(it => {
  60:   const sig = it.sig || crypto.createHmac('sha256', adminSecret).update(`${it.id}:${it.hash}:${it.createdAt}`).digest('hex');
  61:   return {
  62:     id: it.id,
  63:     label: it.label || 'Access Key',
  64:     preview: it.preview || '••••••••',
  65:     hash: it.hash,
  66:     sig,
  67:     createdAt: it.createdAt || Date.now()
  68:   };
  69: });
  ```
  `it.hash` is the plain hex SHA-256 hash of the user-created access password. Because SHA-256 without salt or key-stretching is trivial to crack using rainbow tables or hashcat, exposing `hash` to the client in the `vault` payload creates an offline cracking vector.

---

## 2. Logic Chain

1. **Information Disclosure in `api/auth.js` (Obs-5.1):**
   - In `api/auth.js:127`, the catch block constructs `{ success: false, error: 'Authentication engine failure: ' + (error.message || String(error)) }`.
   - Node.js errors include internal messages such as `connect ECONNREFUSED 127.0.0.1:6379`, `Cannot read property 'x' of undefined at /var/task/...`, or database credentials in driver errors.
   - Because `sanitizeError()` was omitted, any unhandled exception leaks server environment and path information directly in HTTP 502 responses.
   - **Conclusion:** Violates zero information disclosure requirements.

2. **Client CSP Meta Vulnerability (Obs-3.2):**
   - The CSP in `dashboard.html:7` specifies `default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:`.
   - In CSP syntax, `default-src https:` allows loading scripts, workers, frames, and objects from *any* arbitrary HTTPS server in the world.
   - If an attacker achieves DOM injection or XSS, CSP fails to restrict script sources to trusted origins (`cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, `unpkg.com`).
   - On GitHub Pages (`subhadraroy.github.io`), `vercel.json` is not served; only `dashboard.html`'s `<meta>` tag takes effect.
   - **Conclusion:** High-severity CSP bypass on all non-Vercel deployments.

3. **Missing API CSP (Obs-3.1):**
   - `setSecurityHeaders()` in `api/_lib/auth-guard.js` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `HSTS`, but zero CSP header.
   - When API handlers return error pages, text, or JSON, absence of CSP permits execution if the response is rendered in a browser context.
   - Industry standard for REST/RPC APIs requires `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`.
   - **Conclusion:** Defense-in-depth deficiency across all serverless API endpoints.

4. **Cookie Security Flaws (Obs-2.1, Obs-2.2):**
   - `api/auth.js:105-111` sets `godx_session` without `partitioned: true`.
   - Chromium CHIPS deprecates third-party unpartitioned cookies. Cross-site requests from `subhadraroy.github.io` calling `lumina-vista-sigma.vercel.app` with `SameSite=None` without `Partitioned` are blocked.
   - `api/logout.js:28-34` attempts to clear `godx_session` with `sameSite: 'strict'`, failing to clear cross-site cookies, and fails to clear `gcal_token`.
   - **Conclusion:** Broken logout teardown and cookie rejection on partitioned browsers.

5. **Plaintext OAuth Refresh Token in Cookie (Obs-2.3):**
   - In `api/calendar.js:125, 491-496`, `gcal_token` contains base64-encoded `masterTokenPayload` with `refresh_token`.
   - Google OAuth refresh tokens grant indefinite access to calendar data until explicitly revoked.
   - Transmitting long-lived refresh tokens in client cookies exposes them to intermediate logging, browser extensions with cookie access, and cross-site cookie leaks.
   - **Conclusion:** Refresh tokens should remain in Redis server storage; cookies should only carry an opaque session ID or short-lived encrypted token.

6. **Unscrubbed Logging in Exception Handlers (Obs-4.1 - Obs-4.4):**
   - `api/calendar.js:435` logs `console.error('Google token exchange error:', tokenData)`.
   - Upstream OAuth error payloads can reflect authorization codes, client secrets, or user tokens.
   - `api/_lib/redis.js:121-125` logs `msg` without `scrubSecrets(msg)`.
   - **Conclusion:** Violates the zero-token-logging security invariant.

---

## 3. Caveats

1. **Read-Only Constraint:** Per instructions, no application source files were edited by this auditor. All proposed patches are presented below for implementation.
2. **Third-Party CDN Dependencies:** `dashboard.html` relies on `'unsafe-inline'`, `'unsafe-eval'`, `https://cdn.tailwindcss.com`, `https://cdnjs.cloudflare.com`, and `https://unpkg.com`. Fully eliminating `'unsafe-inline'` and `'unsafe-eval'` requires bundling all scripts via Vite/Webpack with cryptographic nonces or SHA hashes.
3. **Offline Mock Authentication:** `allowMock` in `api/_lib/auth-guard.js:105` is active when `!process.env.VERCEL && process.env.NODE_ENV !== 'production'`. This is required for offline test suites (`features.test.cjs`), but must never be enabled in production environments.
4. **No other caveats:** All surfaces within the defined scope were inspected directly.

---

## 4. Conclusion

The LuminaVista OS codebase possesses strong foundational security primitives:
- Constant-time cryptographic comparisons (`crypto.timingSafeEqual`) in `verifySovereignSessionToken`, `verifyCredentials`, and `verifyDeviceRequest`.
- Zero hardcoded production API keys.
- Comprehensive `scrubSecrets()` and `sanitizeDeep()` algorithms.
- 5-layer IoT HMAC-SHA256 signature and replay prevention.

However, **four high/medium severity security defects** must be resolved prior to production sign-off:
1. **`api/auth.js:127`**: Must replace raw string concatenation with `sanitizeError(error, 'Authentication engine failure.')`.
2. **`dashboard.html:7`**: Must align the `<meta>` CSP with `vercel.json`'s strict whitelist (`script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://unpkg.com`, etc.).
3. **`api/_lib/auth-guard.js:setSecurityHeaders`**: Must add `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
4. **`api/auth.js` & `api/logout.js`**: Must add `partitioned: true` to `godx_session`, mirror `SameSite` flags during logout, and clear `gcal_token`.

---

## 5. Verification Method & Exact Defensive Mitigations

### Independent Verification Commands
Run the automated test suites to ensure zero regressions before and after applying mitigations:
```bash
# 1. Full Unit Test Suite (1,102 assertions)
node tests/features.test.cjs

# 2. Syntax Linter (40 JS modules)
node tests/lint.cjs

# 3. Comprehensive 5-Point Recheck Audit (42 assertions)
node tests/recheck-all-tasks.cjs

# 4. Challenger Empirical Calendar Harness (63 assertions)
node tests/challenger-calendar-empirical.cjs

# 5. Adversarial Penetration Challenge (141 assertions)
node tests/challenger-r4-empirical.cjs

# 6. Adversarial Calendar Harnesses (134 assertions)
node tests/suite-calendar-adversarial.cjs
node tests/adversarial-calendar.test.cjs
```

---

### Exact Recommended Code Changes

#### Mitigation 1: Fix Information Disclosure in `api/auth.js` (SEC-01)
**File:** `api/auth.js`  
**Target lines:** 125-129  
```javascript
// BEFORE (Lines 125-129):
  } catch (error) {
    auditLog('AUTH_CRASH', req, error.message);
    return sendSecureJson(res, 502, { success: false, error: 'Authentication engine failure: ' + (error.message || String(error)) }, req);
  }

// AFTER:
  } catch (error) {
    auditLog('AUTH_CRASH', req, error.message);
    return sendSecureJson(res, 502, { success: false, error: sanitizeError(error, 'Authentication engine failure.') }, req);
  }
```
*(Also ensure `sanitizeError` is imported from `./_lib/auth-guard.js` on line 10).*

---

#### Mitigation 2: Enforce Strict CSP Meta Tag in `dashboard.html` (SEC-02)
**File:** `dashboard.html`  
**Target line:** 7  
```html
<!-- BEFORE (Line 7): -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:; object-src 'none';">

<!-- AFTER: -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; frame-src 'self' data: blob:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; form-action 'self';">
```

---

#### Mitigation 3: Add CSP to `setSecurityHeaders` in `api/_lib/auth-guard.js` (SEC-03)
**File:** `api/_lib/auth-guard.js`  
**Target lines:** 415-427  
```javascript
// Add before line 427:
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
```

---

#### Mitigation 4: Add `Partitioned` & Fix Cookie Teardown in `api/auth.js` & `api/logout.js` (SEC-04)
**File:** `api/auth.js`  
**Target lines:** 105-111  
```javascript
// BEFORE:
      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true,
        secure: isCrossSite ? true : isHttps,
        sameSite: isCrossSite ? 'none' : 'lax',
        maxAge: sessionTtl,
        path: '/'
      }));

// AFTER:
      res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
        httpOnly: true,
        secure: isCrossSite ? true : isHttps,
        sameSite: isCrossSite ? 'none' : 'lax',
        partitioned: isCrossSite || isHttps,
        maxAge: sessionTtl,
        path: '/'
      }));
```

**File:** `api/logout.js`  
**Target lines:** 28-35  
```javascript
// BEFORE:
    res.setHeader('Set-Cookie', serialize('godx_session', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: -1,
      path: '/'
    }));

// AFTER:
    const cookieHeader = req?.headers?.cookie || '';
    const origin = req?.headers?.origin || '';
    const isCrossSite = Boolean(origin && !origin.includes('lumina-vista-sigma.vercel.app'));
    const isHttps = req?.headers?.['x-forwarded-proto'] === 'https' || req?.connection?.encrypted || Boolean(process.env.VERCEL);
    const sameSiteVal = isCrossSite ? 'none' : 'lax';

    res.setHeader('Set-Cookie', [
      serialize('godx_session', '', {
        httpOnly: true,
        secure: isCrossSite ? true : isHttps,
        sameSite: sameSiteVal,
        partitioned: isCrossSite || isHttps,
        maxAge: -1,
        path: '/'
      }),
      serialize('gcal_token', '', {
        httpOnly: true,
        secure: isHttps,
        sameSite: isHttps ? 'none' : 'lax',
        partitioned: isHttps,
        maxAge: 0,
        path: '/'
      })
    ]);
```

---

#### Mitigation 5: Scrub Server Log Messages in Redis & Calendar (SEC-07)
**File:** `api/_lib/redis.js`  
**Target lines:** 121, 124  
```javascript
// Wrap msg in scrubSecrets:
import { scrubSecrets } from './auth-guard.js';
...
console.warn(`[SAFE_STORAGE] Redis quota exceeded during ${op} (${scrubSecrets(msg)}). Degrading to fallback memory storage for 60s.`);
console.warn(`[SAFE_STORAGE] Redis error during ${op} (${scrubSecrets(msg)}). Falling back to memory storage.`);
```

**File:** `api/calendar.js`  
**Target lines:** 435, 712  
```javascript
// BEFORE (Line 435):
console.error('Google token exchange error:', tokenData);
// AFTER:
console.error('Google token exchange error:', sanitizeDeep(tokenData));

// BEFORE (Line 712):
console.error('Google token refresh failed:', errText);
// AFTER:
console.error('Google token refresh failed:', scrubSecrets(errText));
```

---

#### Mitigation 6: Strengthen File Path Masking in `sanitizeError()` (SEC-08)
**File:** `api/_lib/auth-guard.js`  
**Target lines:** 447-459  
```javascript
export function sanitizeError(error, defaultMessage = 'An internal processing error occurred.') {
  if (!error) return defaultMessage;
  const raw = typeof error === 'string' ? error : (error.message || String(error));

  let safe = scrubSecrets(raw);

  // Mask absolute filesystem paths (Windows C:\... and POSIX /var/task/...)
  safe = safe
    .replace(/[a-zA-Z]:\\[^"'\n\r\t<>]+/g, '[REDACTED_PATH]')
    .replace(/(?:\/(?:var|home|usr|etc|opt|tmp|task|Users))\/[^"'\n\r\t<>]+/g, '[REDACTED_PATH]');

  // If the raw error still contains stack trace indicators, DNS hostnames, or excessive length
  if (/at\s+.+\(.+:\d+:\d+\)/.test(safe) || /upstash\.io|redis\.com|amazonaws\.com/i.test(safe) || safe.length > 250) {
    return defaultMessage;
  }

  return safe || defaultMessage;
}
```
