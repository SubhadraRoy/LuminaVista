# Survey Explorer 1: Serverless Calendar API & Google Service Account JWT Architecture Report

**Agent**: Survey Explorer 1 (`explorer_survey_1`)  
**Mission**: Deep investigation of `api/calendar.js`, `api/_lib/`, OAuth handling, cookie management, token caching, event CRUD flows, error reporting, environment variable consumption, and regression test suites to formulate the definitive migration blueprint for Google Service Account (RS256 JWT) architecture.  
**Target Milestone**: M0 Survey & Architecture Mapping (informing M1 and M2)  
**Timestamp**: 2026-10-17T11:22:00Z  

---

## 1. Observation

### 1.1 Code Inventory & File Status
Direct inspection across `api/` and `api/_lib/`:
- **`api/calendar.js`**: **1,353 lines** (Strict budget: $< 2,000$ lines; Headroom: **647 lines**).
  - Consolidated serverless controller handling all `/api/calendar/*` actions (`auth`, `callback`, `status`, `sync`, `disconnect`).
- **`api/_lib/google-service-auth.js`**: **167 lines** (Strict budget: $< 2,000$ lines).
  - Native zero-dependency Google Service Account RS256 JWT auth engine using Node.js built-in `crypto`.
- **`api/_lib/google-auth.js`**: Currently **does not exist** in `api/_lib/`.
  - `orchestrator_r8/plan.md` (Code Layout & Milestone 1) designates `api/_lib/google-auth.js` as the interface file exporting `getGoogleServiceAccountToken()`. Currently, `api/calendar.js` imports directly from `./_lib/google-service-auth.js`.
- **`api/_lib/auth-guard.js`**: **589 lines**. Provides `sanitizeDeep`, `sanitizeError`, `setSecurityHeaders`, `checkRateLimit`, `enforcePayloadLimit`, `validateSession`, `scrubSecrets`.
- **`api/_lib/redis.js`**: **253 lines**. Provides `getSafeStorage()` with fallback to in-memory `ResilientFallbackStorage`.

---

### 1.2 Function Signatures & Exports

#### A. In `api/_lib/google-service-auth.js`:
1. `export function base64UrlEncode(input: Buffer | string): string` (lines 10–16):
   - Converts input to URL-safe Base64 (`replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')`).
2. `export function sanitizePrivateKey(rawKey: string): string` (lines 21–27):
   - Strips enclosing single/double quotes and replaces escaped `\\n` with real newline characters `\n`.
3. `export function getServiceAccountCredentials(): { email: string, privateKey: string, calendarId: string, isConfigured: boolean }` (lines 33–45):
   - Lazily reads `process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL`, `process.env.GOOGLE_PRIVATE_KEY`, and `process.env.GOOGLE_CALENDAR_ID`. Never throws on undefined env vars.
4. `export function createServiceAccountJwt(email: string, privateKey: string): string` (lines 50–81):
   - Builds JWT Header (`{"alg":"RS256","typ":"JWT"}`) and Claims (`iss`, `scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"`, `aud: "https://oauth2.googleapis.com/token"`, `iat`, `exp: now + 3600`).
   - Signs assertion using `crypto.createSign('RSA-SHA256')`.
5. `export async function getServiceAccountAccessToken(forceRefresh = false): Promise<{ ok: boolean, accessToken?: string, cached?: boolean, expiresAt?: number, error?: string, missing?: string[], details?: any }>` (lines 87–158):
   - In-memory cache valid until 5 minutes before expiration (`tokenExpiresAt - now > 300000`).
   - Exchanges assertion via `POST https://oauth2.googleapis.com/token` (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`).
6. `export function invalidateServiceAccountToken(): void` (lines 163–166):
   - Resets `cachedToken = null; tokenExpiresAt = 0;`.

#### B. In `api/calendar.js`:
1. `export { getServiceAccountCredentials, getServiceAccountAccessToken, invalidateServiceAccountToken, sanitizePrivateKey, createServiceAccountJwt }` (lines 17–23):
   - Re-exported from `_lib/google-service-auth.js`.
2. `export function getTargetCalendarId(req = null): string` (lines 25–35):
   ```javascript
   export function getTargetCalendarId(req = null) {
     const envCalId = (process.env.GOOGLE_CALENDAR_ID || '').trim();
     if (envCalId) return envCalId;
     if (req?.query?.calendarId && typeof req.query.calendarId === 'string') {
       return req.query.calendarId.trim();
     }
     if (req?.body?.calendarId && typeof req.body.calendarId === 'string') {
       return req.body.calendarId.trim();
     }
     return 'primary';
   }
   ```
3. `export function getProto(req: Request): 'http' | 'https'` (lines 140–147)
4. `export function serializeGcalCookie(tokenData: object | null, proto: string, maxAgeSeconds = 2592000): string` (lines 150–161):
   - Formats `gcal_token` cookie with `HttpOnly; Secure; SameSite=None; Partitioned` (CHIPS) on HTTPS; `SameSite=Lax` on HTTP.
5. `export function getGoogleOAuthCredentials(): { clientId, clientSecret, redirectUriOverride, oauthSecret }` (lines 164–171)
6. `export function resolveRedirectUri(req: Request, redirectUriFromState = null): string` (lines 174–219)
7. `export function sendSecureJson(res, statusCode, data, req = null): Response` (lines 277–291)
8. `export async function getValidAccessToken(req, res, forceRefresh = false): Promise<string | null>` (lines 656–823)
9. `export async function executeGoogleCalendarApi(endpointOrUrl, options = {}, req = null, res = null, retryCount = 0): Promise<object>` (lines 826–938)
10. `export default async function handler(req, res): Promise<void>` (lines 1305–1352)
11. `export const PRODUCTION_REDIRECT_URI = 'https://lumina-vista-sigma.vercel.app/api/calendar/callback'` (line 38)
12. `export const AUTHENTIC_GOOGLE_CALENDAR_EVENTS: Array<object>` (lines 40–137)

---

### 1.3 Critical Defect Identified: Undeclared Variable in `api/calendar.js`
In `api/calendar.js`, line 725 references `inFlightTokenRefresh`:
```javascript
724:     // Stampeding herd protection: coalesce concurrent token refreshes
725:     if (inFlightTokenRefresh) {
726:       try {
727:         await inFlightTokenRefresh;
...
810:     inFlightTokenRefresh = refreshPromise;
811:     try {
812:       const refreshedAccessToken = await refreshPromise;
813:       if (refreshedAccessToken) return refreshedAccessToken;
814:     } finally {
815:       if (inFlightTokenRefresh === refreshPromise) {
816:         inFlightTokenRefresh = null;
817:       }
818:     }
```
**Git Inspection**:
`git diff api/calendar.js` lines 625–630 reveals:
```diff
-let inFlightTokenRefresh = null;
+// 4. Token Refresh Helper supporting Service Account and Multi-Device Cloud Persistence
+export async function getValidAccessToken(req, res, forceRefresh = false) {
```
The declaration `let inFlightTokenRefresh = null;` was accidentally erased when the comment was modified.  
**Impact Observed**:
- Running `node tests/suite-calendar-adversarial.cjs` throws:
  ```
  ReferenceError: inFlightTokenRefresh is not defined
      at getValidAccessToken (file:///C:/Users/roysu/LuminaVista/api/calendar.js:725:5)
  ```
  Resulting in 2 failures (23/25 passed).
- Running `node tests/suite-calendar-sync-forensic.cjs` fails:
  ```
  ReferenceError: inFlightTokenRefresh is not defined
      at getValidAccessToken (file:///C:/Users/roysu/LuminaVista/api/calendar.js:725:5)
  ```
Restoring `let inFlightTokenRefresh = null;` at module scope immediately fixes this failure.

---

### 1.4 Hardcoded `'primary'` Calendar Defect
In `api/calendar.js`:
- Line 34: `getTargetCalendarId()` returns `'primary'` when `GOOGLE_CALENDAR_ID` is unset.
- Line 1068: `primaryUrl = '/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250'` (in `git diff`, updated to `/calendars/${encodeURIComponent(targetCalId)}/events`).
- Lines 1226, 1234, 1277: `executeGoogleCalendarApi('/calendars/primary/events...')` (in `git diff`, updated to `targetCalId`).
**Service Account Conflict**:
A Google Service Account has its own empty default calendar and **cannot** access a user's events via `'primary'`. It requires the specific calendar ID (e.g., `user@gmail.com` or `xyz@group.calendar.google.com`) explicitly shared with the service account email.
Therefore, `GOOGLE_CALENDAR_ID` must be strictly targeted and never fallback to `'primary'` in Service Account mode.

---

### 1.5 Current Endpoint Routing & Action Mapping
`handler(req, res)` (lines 1305–1352) currently routes by inspecting `req.query.action` or `req.url` pathname segment 2 (`/api/calendar/:action`):
- `action === 'auth'`: calls `handleAuth(req, res)`
- `action === 'callback'`: calls `handleCallback(req, res)`
- `action === 'status'`: calls `handleStatus(req, res)`
- `action === 'sync'`: calls `handleSync(req, res)`
- `action === 'disconnect'`: calls `handleDisconnect(req, res)`
- `req.method === 'POST' || req.method === 'DELETE'`: calls `handleSync(req, res)`
- Fallback: `handleStatus(req, res)`

**Plan Requirement M2 Gap**:
`orchestrator_r8/plan.md` specifies:
- `GET /api/calendar?action=events&timeMin=...&timeMax=...`
- `POST /api/calendar`
- `PATCH /api/calendar`
- `DELETE /api/calendar?id=...`
Currently, `action === 'events'` is NOT recognized and falls through to `handleStatus(req, res)`.  
`DELETE /api/calendar` expects `req.query.eventId || req.body.eventId`, but plan states `req.query.id`.

---

### 1.6 Verification Suite Baseline Results
Execution of all project verification suites:
1. `node tests/lint.cjs`: **✓ All 41 JavaScript modules passed syntax validation.**
2. `node tests/suite-env-clean.cjs`: **✓ All 4 sections passed** (Disk: 0 `.env` files, Git index: 0, Git history: 0, Ignores: complete).
3. `node tests/features.test.cjs`: **✓ 1,102 / 1,102 assertions passed with 0 failures.**
4. `node tests/adversarial-calendar.test.cjs`: **✓ 109 / 109 adversarial probes passed with 0 failures.**
5. `node tests/challenger-calendar-empirical.cjs`: **✓ 63 / 63 empirical assertions passed with 0 failures.**
6. `node tests/suite-r6-security-regression.cjs`: **✓ 40 / 40 security tests passed with 0 failures.**
7. `node tests/challenger-r4-empirical.cjs`: **✓ 141 / 141 empirical assertions passed with 0 failures.**
8. `node tests/recheck-all-tasks.cjs`: **✓ 42 / 42 audit assertions passed with 0 failures.**
9. `node tests/suite-calendar-adversarial.cjs`: **23/25 passed** (2 failures caused exclusively by missing `inFlightTokenRefresh` declaration).
10. `node tests/suite-calendar-sync-forensic.cjs`: **2/7 passed** (failures caused exclusively by missing `inFlightTokenRefresh` declaration).

---

## 2. Logic Chain

```
[Observation 1.3: ReferenceError inFlightTokenRefresh]
  └─► [Git Diff: line "let inFlightTokenRefresh = null;" removed]
        └─► [getValidAccessToken evaluates line 725 in strict ES module scope]
              └─► [ReferenceError thrown -> uncaught in caller -> HTTP 500 response]
                    └─► [Conclusion: Declaring "let inFlightTokenRefresh = null;" at module scope is required for test suites to pass]

[Observation 1.4: Google Calendar v3 REST API semantics]
  └─► [Service Account JWT represents bot identity, not end-user identity]
        └─► [Endpoint /calendars/primary/events accesses bot's non-existent primary calendar]
              └─► [Throws HTTP 404 Not Found or returns empty list]
                    └─► [Conclusion: URL must be /calendars/${encodeURIComponent(calendarId)}/events where calendarId = GOOGLE_CALENDAR_ID]

[Observation 1.1: File budget constraints]
  └─► [api/calendar.js is 1,353 lines; dashboard.html is 1,917 lines; limit is 2,000 lines]
        └─► [dashboard.html only has 83 lines of headroom; modules/calendar.js has 204 lines]
              └─► [Conclusion: Complex logic should reside in api/_lib/google-auth.js or modules/calendar-sync.js]

[Observation 1.5: Plan interface contract vs. current routing]
  └─► [Plan specifies action=events, DELETE ?id=..., PATCH /api/calendar]
        └─► [calendar.js currently only checks action=sync, DELETE ?eventId=...]
              └─► [Conclusion: Add action === 'events' handler and support query parameter 'id' alongside 'eventId']
```

---

## 3. Caveats

1. **Private Key Escaping in Vercel Cloud**:
   - `GOOGLE_PRIVATE_KEY` in Vercel environment variables is frequently pasted with literal `\n`, wrapped in quotes, or in PKCS#8 format. `sanitizePrivateKey()` in `api/_lib/google-service-auth.js` already handles `replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')`, which is robust.
2. **Calendar Sharing Requirement**:
   - For the Service Account to access user events, the user must share their Google Calendar with `GOOGLE_SERVICE_ACCOUNT_EMAIL` giving permission `"Make changes to events"`. If the user has not done this, Google API returns `HTTP 404 Not Found` (if calendar ID is unrecognized by the bot) or `HTTP 403 Forbidden`. The API controller must surface structured diagnostic JSON with actionable troubleshooting guidance rather than a generic 500.
3. **Existing Test Suite Expectations**:
   - `tests/adversarial-calendar.test.cjs` expects `resolveRedirectUri`, `serializeGcalCookie`, `PRODUCTION_REDIRECT_URI`, and `getProto` to remain exported from `api/calendar.js`.
   - Therefore, legacy helper functions and exports MUST NOT be deleted during migration; they must be preserved to guarantee zero test regressions.

---

## 4. Conclusion & Migration Recommendations

### 4.1 Recommendation for Milestone 1 (`api/_lib/google-auth.js`)
1. Create `api/_lib/google-auth.js` to satisfy the exact interface specified in `plan.md`:
   - Export `getGoogleServiceAccountToken()`: Returns `Promise<string | null>` (calling `getServiceAccountAccessToken()`).
   - Export `getServiceAccountCredentials()`, `createServiceAccountJwt()`, `sanitizePrivateKey()`, `invalidateServiceAccountToken()`, `base64UrlEncode()`.
   - Ensure `api/_lib/google-auth.js` and `api/_lib/google-service-auth.js` are synchronized so both import paths work seamlessly.

### 4.2 Recommendation for Milestone 2 (`api/calendar.js`)
1. **Fix Undeclared Variable**:
   Add `let inFlightTokenRefresh = null;` at module level (around line 39).
2. **Safe Environment Variable Integration**:
   - Lazily evaluate `process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL`, `process.env.GOOGLE_PRIVATE_KEY`, and `process.env.GOOGLE_CALENDAR_ID` inside functions (`getServiceAccountCredentials()` and `getTargetCalendarId()`).
   - Never evaluate or validate at top-level module evaluation time (preserves build-time safety).
3. **Target Calendar Routing**:
   - Refactor all Google Calendar v3 URLs:
     `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalId)}/events`
   - If `targetCalId` is unset or empty when Service Account auth is invoked, return `HTTP 200` with:
     ```json
     {
       "connected": false,
       "error": "GOOGLE_CALENDAR_ID is not configured in process.env",
       "diagnostic": {
         "missing": ["GOOGLE_CALENDAR_ID"],
         "hint": "Provide your Google Calendar ID and share the calendar with your service account email."
       }
     }
     ```
4. **Action & Method Routing**:
   - In `handler(req, res)`:
     - Allow `action === 'events'` to invoke `handleSync(req, res)`.
     - Support `PATCH /api/calendar` (map to update).
     - In `DELETE`: check `req.query.id || req.query.eventId || req.body.id || req.body.eventId`.
5. **Universal `Cache-Control`**:
   - In `sendSecureJson(res, statusCode, data, req)`:
     `res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');`
6. **Graceful Status Reporting**:
   - `handleStatus`: If Service Account credentials are valid, return:
     `{ configured: true, connected: true, authMode: 'service_account', serviceAccountEmail: saCreds.email, calendarId: saCreds.calendarId }`.
   - If OAuth credentials exist, preserve legacy fields (`hasClientId`, `hasClientSecret`, `redirectUri`) for test suites.

---

## 5. Verification Method

To independently verify all findings and test suite compatibility:

1. **Verify Syntax & Linters**:
   ```bash
   node tests/lint.cjs
   ```
2. **Verify Zero `.env` File Policy**:
   ```bash
   node tests/suite-env-clean.cjs
   ```
3. **Verify Existing Calendar Controller Adversarial Harness**:
   ```bash
   node tests/adversarial-calendar.test.cjs
   ```
4. **Verify Calendar Empirical Suite**:
   ```bash
   node tests/challenger-calendar-empirical.cjs
   ```
5. **Verify Security Regression Suite**:
   ```bash
   node tests/suite-r6-security-regression.cjs
   ```
6. **Verify 5-Point Recheck Suite**:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
7. **Verify Line Counts**:
   ```bash
   node -e "['api/calendar.js', 'api/_lib/google-service-auth.js'].forEach(f => console.log(f + ': ' + require('fs').readFileSync(f, 'utf8').split('\n').length + ' lines'))"
   ```
