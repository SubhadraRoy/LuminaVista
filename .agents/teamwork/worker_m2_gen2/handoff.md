# Handoff Report — Milestone 2: Serverless APIs, Edge Security & IoT Telemetry Gateway Remediation

**Worker**: Worker M2 Gen 2 (`worker_m2_gen2`)  
**Mission**: Implement defensive security remediations for Milestone 2 (`api/_lib/auth-guard.js`, `api/calendar.js`, `api/storage.js`, `api/sync.js`, `api/chat.js`, `api/iot.js`).  
**Integrity Mode**: Development / Remediation  
**Timestamp**: 2026-10-16T17:30:00Z  

---

## 1. Observation

Direct observations and findings prior to and after remediation:

1. **CORS Origin Reflection Defenses (VULN-API-1)**:
   - File `api/_lib/auth-guard.js:397-414`:
     ```javascript
     const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
     res.setHeader('Access-Control-Allow-Origin', finalOrigin);
     res.setHeader('Access-Control-Allow-Credentials', 'true');
     ```
     `isAllowed` validates against `ALLOWED_ORIGINS` (`https://subhadraroy.github.io`, `https://lumina-vista-sigma.vercel.app`, `https://luminavista.example.com`), `.github.io`, `.vercel.app`, and `localhost/127.0.0.1`. Untrusted origins fall back to `https://lumina-vista-sigma.vercel.app`, preventing credentialed cross-origin reflection.
   - File `api/calendar.js:13-34`:
     ```javascript
     function setCorsHeaders(req, res) {
       if (!res || typeof res.setHeader !== 'function') return;
       setSecurityHeaders(res, req);
       const origin = req?.headers?.origin || req?.headers?.Origin;
       ...
       const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
       res.setHeader('Access-Control-Allow-Origin', finalOrigin);
       res.setHeader('Access-Control-Allow-Credentials', 'true');
     ```
     Updated `setCorsHeaders` to pass `req` to `setSecurityHeaders` and strictly validate incoming origin against allowed origins before reflection.

2. **GitHub Storage Path Traversal & Root Namespace Isolation (VULN-API-2)**:
   - File `api/storage.js:78-105`:
     ```javascript
     const segments = cleanPath ? cleanPath.split('/').filter(Boolean) : [];
     const hasHiddenSegment = segments.some(seg => seg.startsWith('.'));
     const PROTECTED_PREFIXES = ['.github', '.git', '.env', 'node_modules', 'api', 'modules', 'tests', 'firmware'];
     const PROTECTED_ROOT_FILES = new Set([
       'package.json', 'package-lock.json', 'vercel.json', 'readme.md', 'dashboard.html', 'index.html', '404.html'
     ]);
     ...
     const STORAGE_NAMESPACE = 'user_vault';
     const targetPath = cleanPath
       ? (cleanPath.startsWith(`${STORAGE_NAMESPACE}/`) ? cleanPath : `${STORAGE_NAMESPACE}/${cleanPath}`)
       : (action === 'list' ? STORAGE_NAMESPACE : '');
     ```
     Prevents directory traversal escapes and restricts access to repository root configuration files, source code, and workflows. Scopes all read, write, delete, and list operations to `user_vault/`. Added complete `action === 'list'` handling.

3. **Administrative Credential Protection in Cloud Sync (VULN-API-3)**:
   - File `api/sync.js:66-84`:
     ```javascript
     const isMaster = auth.role === 'master';
     const safeState = state ? { ...state } : null;
     if (safeState && !isMaster) {
       delete safeState.admin_passwords;
     }
     return sendSecureJson(res, 200, {
       ...
       admin_passwords: isMaster ? (state?.admin_passwords || []) : []
     }, req);
     ```
   - File `api/sync.js:121-124`:
     ```javascript
     // Invariant: admin credentials in master_workspace_state cannot be overwritten by client sync payloads.
     // Admin credentials must be managed strictly and sovereignly via api/admin.js.
     admin_passwords: currentState.admin_passwords || [],
     ```
     `GET /api/sync` redacts `admin_passwords` for any session where `role !== 'master'`. `POST /api/sync` ignores untrusted client payloads and preserves existing credentials from `currentState.admin_passwords`.

4. **OAuth2 State CSRF Nonce & postMessage Target Origin (VULN-API-4)**:
   - File `api/calendar.js:54-65`:
     ```javascript
     const nonce = crypto.randomBytes(16).toString('hex');
     const ts = Date.now();
     const oauthSecret = process.env.ADMIN_PASSWORD || process.env.GOOGLE_CLIENT_SECRET || 'lumina_calendar_oauth_secret';
     const sig = crypto.createHmac('sha256', oauthSecret).update(`${nonce}:${redirectUri}:${ts}`).digest('hex');
     const stateObj = { redirect_uri: redirectUri, nonce, ts, sig };
     const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
     ```
   - File `api/calendar.js:120-131`: Validates state signature using `crypto.timingSafeEqual` and enforces 15-minute maximum lifetime.
   - File `api/calendar.js:95-104` and `273-282`: Replaced wildcard `'*'` postMessage target origin with validated target origin against allowed origins list (`locOrigin` verified or defaulted to `https://lumina-vista-sigma.vercel.app`).

5. **Telemetry Authentication Consistency (VULN-API-5)**:
   - File `api/chat.js:138-142`:
     ```javascript
     const auth = await validateSession(req, getRedisClient());
     if (!auth.valid) {
       return sendSecureJson(res, auth.status || 401, { error: auth.error });
     }
     ```
     `validateSession` is enforced unconditionally across both GET and POST telemetry requests, eliminating unauthenticated telemetry exposure in non-Vercel runtimes.

6. **IoT Gateway Rate-Limiting & Sequence Monotonicity (VULN-IOT-1, VULN-IOT-2)**:
   - File `api/iot.js:382-386`:
     ```javascript
     if (req.method === 'GET' && action === 'time') {
       const rate = await checkRateLimit(req, storage, 'iot_time', 60, 60);
       if (!rate.allowed) {
         auditLog('IOT_RATE_LIMIT_EXCEEDED', req, 'Action: time');
         return sendSecureJson(res, rate.status, { error: rate.error });
       }
     ```
     Added sliding rate-limiting (60 requests per minute) to time-sync bootstrap.
   - File `api/iot.js:243-263`:
     ```javascript
     const seq = parseInt(seqStr, 10) || 0;
     if (storage && typeof storage.get === 'function') {
       try {
         const rawMeta = await storage.get(KEY_META);
         const meta = rawMeta ? (typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta) : null;
         if (meta && typeof meta.lastSeq === 'number' && seq < (meta.lastSeq || 0)) {
           auditLog('IOT_STALE_SEQUENCE', req, `seq=${seq}, lastSeq=${meta.lastSeq}`);
           return {
             valid: false,
             status: 401,
             error: 'Stale or out-of-order telemetry packet rejected',
             lastSeq: meta.lastSeq,
             serverTime: nowSec
           };
         }
       } catch (_) {}
     }
     ```
   - File `api/iot.js:669-677`: Monotonic sequence rejection in POST hardware push handler.
   - File `api/iot.js:933`: Monotonically advances `lastSeq = Math.max(verification.seq, prevMeta?.lastSeq || 0)`.
   - Firmware compatibility: ESP32 hardware push, replay nonce deduplication (120s TTL), dual-TTL command dispatch (15s physical vs 24h config), and canonical HMAC verification remain 100% intact. Zero changes made to `firmware/**`.

7. **Line Count Budget Verification**:
   - `api/_lib/auth-guard.js`: 477 lines (< 2,000)
   - `api/calendar.js`: 822 lines (< 2,000)
   - `api/storage.js`: 173 lines (< 2,000)
   - `api/sync.js`: 136 lines (< 2,000)
   - `api/chat.js`: 755 lines (< 2,000)
   - `api/iot.js`: 1,248 lines (< 2,000)

8. **Test Suite Execution Results**:
   - `node tests/lint.cjs`: `✓ All 40 JavaScript modules passed syntax validation.`
   - `node tests/features.test.cjs`: `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===`
   - `node tests/recheck-all-tasks.cjs`: `🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!`
   - `node tests/browser-cdp-test.cjs`: `=== BROWSER TEST RESULTS: 122/122 PASSED ===`

---

## 2. Logic Chain

1. **CORS Defenses (VULN-API-1)**:
   - *Observation*: Origin reflection combined with `Access-Control-Allow-Credentials: true` enables malicious origins to read authenticated responses via cross-origin requests.
   - *Inference*: By validating origin against an explicit whitelist and approved pattern matching (`.github.io`, `.vercel.app`, `localhost`), and defaulting any unapproved origin to the canonical app domain, unauthorized origins cannot read credentialed responses.
   - *Result*: VULN-API-1 is remediated in both `auth-guard.js` and `calendar.js`.

2. **Storage Namespace Isolation (VULN-API-2)**:
   - *Observation*: Without namespace scoping, callers with authenticated sessions could manipulate root repository files (`.github/workflows`, `package.json`).
   - *Inference*: Enforcing `user_vault/` directory scoping and explicitly rejecting any path referencing protected prefixes or root system files isolates user data from system assets.
   - *Result*: VULN-API-2 is remediated.

3. **Cloud Sync Admin Credential Protection (VULN-API-3)**:
   - *Observation*: Returning `admin_passwords` to non-master roles leaked credential hashes; accepting `admin_passwords` in `POST /api/sync` permitted unauthorized credential overwrites.
   - *Inference*: Redacting `admin_passwords` on GET unless `auth.role === 'master'`, and strictly locking `admin_passwords` to `currentState.admin_passwords` on POST, ensures credentials can only be created and deleted via `api/admin.js`.
   - *Result*: VULN-API-3 is remediated.

4. **OAuth2 State Anti-CSRF & postMessage Validation (VULN-API-4)**:
   - *Observation*: Unsigned OAuth2 states and wildcard postMessage targets allowed login CSRF and token interception.
   - *Inference*: Adding cryptographic HMAC signatures with 15-minute expiration to `state`, and restricting `postMessage` target origin to validated origins, closes these vulnerabilities.
   - *Result*: VULN-API-4 is remediated.

5. **Telemetry Authentication (VULN-API-5)**:
   - *Observation*: Gating telemetry session validation behind `process.env.VERCEL` allowed unauthenticated access in non-Vercel environments.
   - *Inference*: Calling `validateSession` unconditionally ensures uniform authentication across all deployment environments.
   - *Result*: VULN-API-5 is remediated.

6. **IoT Gateway Rate-Limiting & Monotonicity (VULN-IOT-1, VULN-IOT-2)**:
   - *Observation*: Unthrottled time-sync enabled DoS/HMAC exhaustion; out-of-order packets within drift window could regress telemetry state.
   - *Inference*: Applying sliding rate limits (60/min) and enforcing `verification.seq >= (meta.lastSeq || 0)` ensures compute protection and chronological state consistency without disrupting ESP32 operations.
   - *Result*: VULN-IOT-1 and VULN-IOT-2 are remediated.

---

## 3. Caveats

- `firmware/**` was strictly untouched per invariant rules; firmware telemetry protocol and packet formats remain backward-compatible with physical ESP32 hardware.
- Redis storage operations gracefully degrade to in-memory window tracking if Redis is unreachable.

---

## 4. Conclusion

Milestone 2 remediation is 100% complete and fully verified. All six target files (`api/_lib/auth-guard.js`, `api/calendar.js`, `api/storage.js`, `api/sync.js`, `api/chat.js`, `api/iot.js`) have been hardened against their identified vulnerabilities. No files outside the exclusive ownership list were altered. All file line counts remain well below the 2,000-line budget ceiling. All 4 verification suites (1,102 unit assertions, 122 browser CDP tests, 42 task audit checks, 40 syntax lint modules) pass with 0 failures and 0 regressions.

---

## 5. Verification Method

To independently verify this work, execute the following commands in sequence:

```bash
# 1. Syntax Validation (40 JS modules)
node tests/lint.cjs

# 2. Features Test Suite (1,102 assertions)
node tests/features.test.cjs

# 3. Comprehensive Task Recheck Audit (42 assertions)
node tests/recheck-all-tasks.cjs

# 4. Chrome Browser CDP Real-Interaction Suite (122 tests)
node tests/browser-cdp-test.cjs

# 5. Line Count Budget Check (< 2,000 lines per file)
node -e "const fs=require('fs'); ['api/_lib/auth-guard.js','api/calendar.js','api/storage.js','api/sync.js','api/chat.js','api/iot.js'].forEach(f => console.log(f, fs.readFileSync(f, 'utf8').split('\n').length));"
```
