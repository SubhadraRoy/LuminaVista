# LuminaVista OS — Google Calendar Architecture Investigation Report
**Subagent**: `explorer_r3_1` (Teamwork Explorer)  
**Date**: 2026-10-16T20:53:30Z  
**Target File**: `c:\Users\roysu\LuminaVista\api\calendar.js`  
**Dependencies Audited**: `api/_lib/auth-guard.js`, `api/_lib/redis.js`, `vercel.json`, `modules/calendar-sync.js`, `modules/calendar.js`, `tests/features.test.cjs`, `tests/recheck-all-tasks.cjs`

---

## 1. Executive Summary

A comprehensive, read-only architectural investigation of `api/calendar.js` and its supporting modules was conducted to resolve five critical Google Calendar synchronization and integration challenges in LuminaVista OS:
1. **Google OAuth Redirect URI Determination**: Identified that dynamic host resolution (`req.headers.host`) and unvalidated client queries (`req.query.redirect_uri`) cause Google OAuth Error 400 `redirect_uri_mismatch` when running on GitHub Pages or Vercel preview deployments. Prioritizing `https://lumina-vista-sigma.vercel.app/api/calendar/callback` resolves this permanently.
2. **Authentication & Guest Decoupling**: Discovered an artificial master session barrier at `api/calendar.js:826-835` (`validateSession`) that blocks `/api/calendar/status`, `/api/calendar/auth`, and `/api/calendar/sync` unless an admin `godx_session` cookie is present. In production, this causes all guest sessions to fail closed with HTTP 401/403. Decoupling these endpoints allows `/api/calendar/status` and `/api/calendar/auth` to operate without admin credentials, and lets `/api/calendar/sync` authenticate directly via `gcal_token` or Redis `gcal:master_tokens`.
3. **CORS Preflight Compatibility**: Verified that all endpoints handle HTTP `OPTIONS` and return `HTTP 204 No Content`. However, `setCorsHeaders` only contains a static list of allowed origins, which causes cross-origin drops on GitHub Pages forks or preview environments unless wildcard pattern matching (`*.github.io`, `*.vercel.app`) is applied.
4. **Token Persistence & CHIPS Partitioned Cookies**: Confirmed that `refresh_token` preservation and Redis multi-device persistence (`gcal:master_tokens`) are architected in code, but modern browser cookie partitioning (`Partitioned`) is completely missing from all `cookie.serialize` calls, risking 3rd-party cookie blocking in Chrome 114+.
5. **Line Count Budget**: `api/calendar.js` is currently **855 lines**, well within the mandatory 2,000-line budget constraint (< 43%).

---

## 2. Investigation Point 1: Google OAuth Redirect URI Determination & Construction

### 2.1 Current Implementation in `api/calendar.js`
In `api/calendar.js`, the OAuth redirect URI is constructed independently in three distinct locations:
- **`handleAuth` (Line 49–52)**:
  ```javascript
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;
  ```
- **`handleCallback` (Line 181–185)**:
  ```javascript
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = redirectUriFromState || process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;
  ```
- **`handleStatus` (Line 383–387)**:
  ```javascript
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;
  ```

### 2.2 Root Cause of Google Error 400 `redirect_uri_mismatch`
1. **GitHub Pages Deployment**:
   When LuminaVista OS is loaded from GitHub Pages (`https://subhadraroy.github.io/LuminaVista`), `modules/calendar-sync.js:293-295` computes:
   ```javascript
   const clientRedirect = `${window.location.origin}/api/calendar/callback`;
   // Evaluates to: "https://subhadraroy.github.io/api/calendar/callback"
   ```
   The client passes this in the query: `/api/calendar/auth?redirect_uri=https://subhadraroy.github.io/api/calendar/callback`.
   Because GitHub Pages is a static host with no serverless functions, Google Cloud Console has **never** registered `https://subhadraroy.github.io/api/calendar/callback` as an authorized redirect URI (nor could GitHub Pages handle the code exchange). When Google OAuth receives this `redirect_uri`, it immediately aborts with Error 400 `redirect_uri_mismatch`.
2. **Vercel Preview Deployments**:
   If `req.query.redirect_uri` is omitted, the fallback `${proto}://${host}/api/calendar/callback` uses the preview hostname (e.g., `lumina-vista-git-main-subhadraroy.vercel.app`), which also triggers `redirect_uri_mismatch`.

### 2.3 Proposed Production Prioritization Strategy
To ensure that Google Cloud Console never throws `redirect_uri_mismatch`, define a centralized helper in `api/calendar.js`:

```javascript
const PRODUCTION_REDIRECT_URI = 'https://lumina-vista-sigma.vercel.app/api/calendar/callback';

export function resolveRedirectUri(req, redirectUriFromState = null) {
  // 1. Highest priority: state verification during OAuth callback code exchange
  if (redirectUriFromState) return redirectUriFromState;

  // 2. Explicit environment override in Vercel project settings
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;

  // 3. Client query parameter (if provided)
  const queryRedirect = req.query?.redirect_uri;
  if (queryRedirect) {
    // If the client erroneously passes a github.io domain (which cannot process serverless callbacks),
    // force rewrite to production Vercel URI to match Google Cloud Console registration.
    if (queryRedirect.includes('github.io')) {
      return PRODUCTION_REDIRECT_URI;
    }
    return queryRedirect;
  }

  // 4. Localhost development inspection
  const rawHost = req.headers?.['x-forwarded-host'] || req.headers?.host || '';
  const host = rawHost.split(',')[0].trim();
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    const proto = req.headers?.['x-forwarded-proto'] || 'http';
    return `${proto}://${host}/api/calendar/callback`;
  }

  // 5. Default production fallback for all production, alias, and preview environments
  return PRODUCTION_REDIRECT_URI;
}
```

**Verification against Existing Test Suite**:
In `tests/features.test.cjs:855-871`, the test supplies:
`query: { redirect_uri: 'https://luminavista.example.com/api/calendar/callback' }`
Since `luminavista.example.com` does not contain `github.io`, `resolveRedirectUri` returns `https://luminavista.example.com/api/calendar/callback`, preserving 100% test pass fidelity for assertion 871.

---

## 3. Investigation Point 2: Authentication & Authorization Decoupling

### 3.1 Current Implementation in `api/calendar.js`
In `api/calendar.js` (Lines 826–835), the master dispatcher enforces:
```javascript
  if (action !== 'callback') {
    const storage = getSafeStorage();
    const auth = await validateSession(req, storage);
    if (!auth.valid) {
      return sendSecureJson(res, auth.status || 401, { error: auth.error || 'Unauthorized' });
    }
    if (auth.role !== 'master' && auth.role !== 'temporary') {
      return sendSecureJson(res, 403, { error: 'Forbidden: Authenticated session required for calendar.' });
    }
  }
```

### 3.2 Failure Mechanism for Sovereign Guest Sessions
In `api/_lib/auth-guard.js:104-115`, `validateSession` operates under zero-trust production rules:
```javascript
  const isProduction = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  const allowMock = !isProduction && process.env.ALLOW_MOCK_AUTH !== 'false';
  ...
  if (!sessionId || sessionId === 'sovereign_session') {
    return { valid: false, status: 401, error: 'Unauthorized Session' };
  }
```
When LuminaVista OS runs in production:
1. `process.env.VERCEL` is active, disabling mock sessions (`allowMock = false`).
2. A visitor browsing the workspace as a sovereign guest has no `godx_session` cookie and no admin password session.
3. When the dashboard mounts and queries `/api/calendar/status`, lines 828-830 fail closed and return `HTTP 401 Unauthorized`.
4. When the user clicks "Connect Google Calendar" (`/api/calendar/auth`), the request is blocked with `HTTP 401 Unauthorized`.
5. When two-way sync executes (`/api/calendar/sync`), the request is blocked before Google OAuth tokens can even be evaluated.

### 3.3 Decoupling Architecture
Google Calendar endpoints must be decoupled as follows:
- **`/api/calendar/status`**: Fully public GET endpoint. Returns `{ configured, connected, needsReauth, email, redirectUri }`. Requires no admin session. (Fulfills Acceptance Criteria: `/api/calendar/status returns HTTP 200 with configuration details without requiring admin login`).
- **`/api/calendar/auth`**: Public initiation endpoint. Generates the Google OAuth authorization URL with anti-CSRF HMAC state. Requires no admin session.
- **`/api/calendar/callback`**: Public OAuth callback endpoint. Exchanges the auth code with Google OAuth servers and sets HttpOnly cookie and Redis state. Already exempted in code.
- **`/api/calendar/sync`**: Decoupled from Lumina OS master password. Authenticates exclusively against Google OAuth credentials via `getValidAccessToken(req, res)`:
  - Validates `gcal_token` cookie or `gcal:master_tokens` in Redis.
  - Automatically refreshes stale access tokens using `refresh_token`.
  - For unauthenticated GET requests, gracefully returns cached calendar items from Redis `master_workspace_state` (`cached: true`).
  - Returns `HTTP 401 {"connected": false, "error": "Not connected to Google Calendar. Please authenticate."}` only if no valid Google OAuth credentials or cached data exist.

### 3.4 Proposed Handler Implementation
Replace lines 826-835 in `api/calendar.js` with:
```javascript
  // Decoupled sovereign calendar operations:
  // Google OAuth authorization, status inspection, and calendar sync authenticate
  // via Google OAuth tokens (cookie or Redis) rather than requiring admin master sessions.
  if (action === 'auth') {
    return handleAuth(req, res);
  }
  if (action === 'callback') {
    return handleCallback(req, res);
  }
  if (action === 'status') {
    return handleStatus(req, res);
  }
  if (action === 'sync') {
    return handleSync(req, res);
  }
```

---

## 4. Investigation Point 3: CORS Preflight Handling & Cross-Domain Compatibility

### 4.1 Current CORS Setup in `api/calendar.js`
In `api/calendar.js:13-34`:
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
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ));
  const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, x-session-id');
}
```

### 4.2 Endpoint Preflight Audit
All sub-handlers explicitly check for `OPTIONS` and return `HTTP 204 No Content`:
- Master dispatcher: `api/calendar.js:815`: `if (req.method === 'OPTIONS') return res.status(204).end();`
- `handleAuth`: `api/calendar.js:39`: `if (req.method === 'OPTIONS') return res.status(204).end();`
- `handleCallback`: `api/calendar.js:86`: `if (req.method === 'OPTIONS') return res.status(204).end();`
- `handleStatus`: `api/calendar.js:339`: `if (req.method === 'OPTIONS') return res.status(204).end();`
- `handleSync`: `api/calendar.js:538`: `if (req.method === 'OPTIONS') return res.status(204).end();`

### 4.3 Gap Analysis & Improvement
1. **Dynamic Origin Matching**:
   If a user deploys or tests LuminaVista on another GitHub Pages account (e.g. `https://<org>.github.io`) or on Vercel preview environments (`https://lumina-vista-<branch>.vercel.app`), the `ALLOWED_ORIGINS.has(origin)` check fails.
   When `isAllowed` is false, `finalOrigin` falls back to `'https://lumina-vista-sigma.vercel.app'`. Because the browser's calling `Origin` does not match the returned `Access-Control-Allow-Origin`, the browser drops the request with a CORS error.
   **Solution**:
   Extend `isAllowed` to match any `.github.io` and `.vercel.app` domain:
   ```javascript
   const isAllowed = Boolean(origin && (
     ALLOWED_ORIGINS.has(origin) ||
     origin.endsWith('.github.io') ||
     origin.endsWith('.vercel.app') ||
     /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
   ));
   ```
2. **Access-Control-Allow-Headers**:
   Include IoT and custom session telemetry headers (`X-Session-Id`, `X-Lumina-*`) to maintain uniform compatibility across client network stacks.
3. **`vercel.json` Consistency**:
   In `vercel.json:19-27`, `/api/(.*)` already configures:
   - `Access-Control-Allow-Credentials: true`
   - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
   - `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, x-session-id, X-Lumina-*`
   The headers set in `api/calendar.js` align directly with `vercel.json`.

---

## 5. Investigation Point 4: Token Storage, Refresh Preservation & Partitioned Cookies

### 5.1 `refresh_token` Preservation Across Re-authorizations
In Google OAuth 2.0, Google only issues a `refresh_token` on the first authorization or when `prompt=consent` is requested. If a user re-authorizes without full consent, Google's token endpoint omits `refresh_token`.
- `api/calendar.js:231-254` explicitly safeguards against this by checking:
  1. The existing client cookie (`cookies.gcal_token`).
  2. The Redis sovereign store (`storage.get(GCAL_REDIS_KEY)`).
  3. Setting `finalRefreshToken = tokenData.refresh_token || existingRefreshToken || null;`.
- In addition, `handleAuth:74` specifies `access_type=offline&prompt=consent`, ensuring Google always attempts to issue an offline refresh token.
- During token refresh (`getValidAccessToken:482-484`), if Google returns a new refresh token, it is updated; otherwise, the existing refresh token is preserved.

### 5.2 CHIPS / Partitioned Cookies
Modern browsers (Chrome 114+) enforce cookie partitioning under CHIPS (Cookies Having Independent Partitioned State). When LuminaVista on GitHub Pages makes authenticated credentialed cross-site requests to Vercel, third-party cookies without the `Partitioned` attribute are blocked.
In `api/calendar.js`:
- Line 285–291:
  ```javascript
  res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(masterTokenPayload)).toString('base64'), {
    httpOnly: true,
    secure: proto === 'https',
    sameSite: proto === 'https' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/'
  }));
  ```
- Lines 448–454 and lines 496–502 repeat this serialization.
**Crucial Finding**:
`partitioned: proto === 'https'` (or `partitioned: true`) is **completely missing** from all three `cookie.serialize` invocations.
Package verification via `node -e "const c = require('cookie'); console.log(c.serialize('foo', 'bar', { secure: true, sameSite: 'none', partitioned: true }))"` confirms `cookie` v0.6.0 natively supports `Partitioned`:
```
foo=bar; Secure; Partitioned; SameSite=None
```
Adding `partitioned: proto === 'https'` ensures `gcal_token` survives cross-domain partitioning rules.

### 5.3 Sovereign Redis Persistence (`gcal:master_tokens`)
`api/calendar.js` maintains Redis state under key `gcal:master_tokens`:
1. **Multi-device Sync**: When an authorized user connects on Desktop, tokens are written to `gcal:master_tokens`. When opening LuminaVista on a mobile phone or incognito window, `getValidAccessToken` checks `storage.get(GCAL_REDIS_KEY)` and seamlessly establishes the connection without requiring re-authentication.
2. **State Hydration**: On connection, `wb.calendarSettings.googleCalendarConnected = true` and `googleAccountEmail = userEmail` are written to `master_workspace_state`.
3. **Cached Events for Guest Browsers**: In `handleSync` (Line 544–568), if `accessToken` is not present, the endpoint reads cached events from `master_workspace_state` and returns them with `{ success: true, items, cached: true }`.

---

## 6. Investigation Point 5: Line Length & Budget Verification

### 6.1 Line Count Audit
- **Target File**: `api/calendar.js`
- **Total Lines**: **855 lines**
- **Total Bytes**: 34,804 bytes
- **Limit**: Strictly fewer than 2,000 lines (`PROJECT.md` & `ORIGINAL_REQUEST.md` invariant R3)
- **Margin**: 1,145 lines remaining (42.8% of capacity).

The proposed optimizations (centralizing `resolveRedirectUri`, adding `partitioned: true` to cookies, updating origin matching, and removing `validateSession`) will result in a net change of approximately $\pm 15$ lines, maintaining the file comfortably below 900 lines.

---

## 7. Implementation Blueprint & Recommendations

### Recommendation 1: Centralize Redirect URI Resolution
Replace duplicate redirect URI construction across `handleAuth`, `handleCallback`, and `handleStatus` with `resolveRedirectUri(req, redirectUriFromState)`. Prioritize `https://lumina-vista-sigma.vercel.app/api/calendar/callback` whenever running on GitHub Pages or production Vercel.

### Recommendation 2: Decouple Master Password from Calendar Operations
Remove the `validateSession(req, storage)` blocker at `api/calendar.js:826-835`. Dispatch all calendar actions directly:
- `auth`: Public (generates OAuth URL)
- `callback`: Public (handles token exchange)
- `status`: Public (returns `{ configured, connected, needsReauth, email, redirectUri }`)
- `sync`: Validates Google OAuth credentials via `getValidAccessToken(req, res)` (using cookie or Redis `gcal:master_tokens`)

### Recommendation 3: Add `partitioned: proto === 'https'` to All Cookies
Update all three `cookie.serialize('gcal_token', ...)` calls:
```javascript
res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(tokenData)).toString('base64'), {
  httpOnly: true,
  secure: proto === 'https',
  sameSite: proto === 'https' ? 'none' : 'lax',
  partitioned: proto === 'https',
  maxAge: 30 * 24 * 60 * 60,
  path: '/'
}));
```

### Recommendation 4: Broaden CORS Origin Matching
Update `setCorsHeaders` to recognize `.github.io` and `.vercel.app` origins dynamically:
```javascript
const isAllowed = Boolean(origin && (
  ALLOWED_ORIGINS.has(origin) ||
  origin.endsWith('.github.io') ||
  origin.endsWith('.vercel.app') ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
));
```

### Recommendation 5: Verification Suite Mapping
Following any implementation changes, run:
1. `node tests/lint.cjs` (Ensure 40/40 modules pass syntax validation)
2. `node tests/features.test.cjs` (Ensure 1,102/1,102 assertions pass, especially suites 21-23 testing `calendarController`)
3. `node tests/recheck-all-tasks.cjs` (Ensure 42/42 audit assertions pass, especially Item 2 & 3)
4. `node tests/browser-cdp-test.cjs` (Ensure 122/122 Chrome CDP tests pass)
