# Defensive Security Survey Report: Serverless APIs & Cloud Sync Surface

**Agent**: Explorer 1 (`explorer_survey_1`)  
**Mission**: Comprehensive, read-only defensive security exploration of Serverless API handlers (`api/*.js`, `api/_lib/*.js`) and Cloud Sync (`modules/cloud-sync.js`, `api/sync.js`).  
**Integrity Mode**: Strictly Read-Only  
**Timestamp**: 2026-10-16T16:26:00Z  

---

## 1. Observation

Direct code observations across all serverless API endpoints and cloud sync modules:

### OBS-01: CORS Origin Reflection with Credentials Allowed in `api/_lib/auth-guard.js` & `api/calendar.js`
- **Location 1**: `api/_lib/auth-guard.js:345-360`
  ```javascript
  const origin = request?.headers?.origin || request?.headers?.Origin;
  const ALLOWED_ORIGINS = new Set([
    'https://subhadraroy.github.io',
    'https://lumina-vista-sigma.vercel.app'
  ]);
  const isAllowed = Boolean(origin && (
    ALLOWED_ORIGINS.has(origin) ||
    origin.endsWith('.github.io') ||
    origin.endsWith('.vercel.app') ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ));

  const finalOrigin = isAllowed ? origin : (origin || 'https://lumina-vista-sigma.vercel.app');
  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  ```
- **Location 2**: `api/calendar.js:15-17`
  ```javascript
  const origin = req?.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  ```
- **Observation Detail**: In `api/_lib/auth-guard.js:357`, the ternary expression `finalOrigin = isAllowed ? origin : (origin || ...)` evaluates to `origin` even when `isAllowed === false`, as long as `origin` was passed in the request header. In `api/calendar.js:15-17`, `setCorsHeaders` reflects any request origin (`req?.headers?.origin || '*'`) directly and pairs it with `Access-Control-Allow-Credentials: 'true'`.

### OBS-02: Hardcoded Secret Backdoor in Client Key Verification in `api/auth.js`
- **Location**: `api/auth.js:216-233`
  ```javascript
  // Tertiary Check: Sovereign Cryptographically Signed Credentials
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
- **Observation Detail**: Line 218 explicitly includes `'lumina_root_secret'` in `signingSecrets` at all times, even when `expectedPassword` is configured. Any key signed with `'lumina_root_secret'` is authenticated as a valid session and auto-hydrated into storage (`admin:temp_passwords`, lines 236-254).

### OBS-03: Variable-Time Comparisons (Timing Side-Channels) in `api/auth.js`
- **Location 1**: `api/auth.js:50-54`
  ```javascript
  // Emergency administrator override: authentic root password bypasses lockout
  const isMasterAttempt = password && (
    password === rawExpectedPassword ||
    password.trim() === rawExpectedPassword.trim() ||
    password.trim() === cleanExpected
  );
  ```
- **Location 2**: `api/auth.js:187`
  ```javascript
  const targetHash = k.hash.toLowerCase().trim();
  if (targetHash === inputHex || targetHash === trimmedHex) return true;
  ```
- **Location 3**: `api/auth.js:229`
  ```javascript
  if (k.sig.toLowerCase() === expectedSig.toLowerCase()) return true;
  ```
- **Observation Detail**: Passwords, hashes, and signatures are evaluated using the standard `===` string equality operator, which returns early on the first mismatched byte, creating measurable timing discrepancies.

### OBS-04: Unscoped GitHub Repository Path Traversal in `api/storage.js`
- **Location**: `api/storage.js:71-125`
  ```javascript
  const { action, path: rawPath, content } = req.body || {};
  const cleanPath = sanitizeFilePath(rawPath);

  if (action !== 'list' && !cleanPath) {
    auditLog('SUSPICIOUS_PATH_TRAVERSAL', req, `Path: ${rawPath}`);
    return sendSecureJson(res, 400, { error: 'Invalid or illegal file path.' });
  }

  const baseUrl = `https://api.github.com/repos/${repo}/contents/${cleanPath}`;
  ```
- **Observation Detail**: `sanitizeFilePath` prevents `../` upward directory traversal escapes, but does not enforce a root directory namespace or sandbox prefix. An authenticated user can read, write, or delete arbitrary files at the root of the GitHub repository, including `.github/workflows/deploy.yml`, `package.json`, or server source code.

### OBS-05: Administrative Password Hash Exposure & State Poisoning in `api/sync.js`
- **Location 1**: `api/sync.js:75`
  ```javascript
  admin_passwords: state?.admin_passwords || []
  ```
- **Location 2**: `api/sync.js:113-115`
  ```javascript
  admin_passwords: (Array.isArray(b.admin_passwords) && b.admin_passwords.length > 0)
    ? b.admin_passwords
    : (currentState.admin_passwords || []),
  ```
- **Observation Detail**: `GET /api/sync` serializes `admin_passwords` (containing SHA-256 hashes, previews, and HMAC signatures of temporary access credentials) to any authenticated session (including temporary users). `POST /api/sync` accepts arbitrary `b.admin_passwords` without schema validation or min-1 key enforcement, directly overwriting `master_workspace_state.admin_passwords`, which is used as a fallback credential store by `api/auth.js` (lines 170-179) and `api/admin.js` (lines 35-42).

### OBS-06: Destructive Cloud Sync Hydration Overwrite & Tab Hijacking in `modules/cloud-sync.js`
- **Location 1**: `modules/cloud-sync.js:221-232` (Calendar Overwrite)
  ```javascript
  if (Array.isArray(state.calendar)) {
    try {
      localStorage.setItem('luminavista_calendar_events_v1', JSON.stringify(state.calendar));
      localStorage.setItem('lumina_calendar_events', JSON.stringify(state.calendar));
      if (window.LuminaCalendar?.setEvents) {
        window.LuminaCalendar.setEvents(state.calendar);
      } else if (window.calendarEvents) {
        window.calendarEvents = state.calendar;
      }
      hasCalendarUpdated = true;
    } catch (e) {}
  }
  ```
- **Location 2**: `modules/cloud-sync.js:359-382` (VFS and Notes Overwrite)
  ```javascript
  if (state.vfs && typeof state.vfs === 'object') {
    localStorage.setItem('lumina_codespace_vfs', JSON.stringify(state.vfs));
    window.vfs = state.vfs;
    hasVfsUpdated = true;
  }
  if (Array.isArray(state.notes)) {
    localStorage.setItem('lumina_godx_multi_notes', JSON.stringify(state.notes));
    window.vaultNotes = state.notes;
    ...
  }
  ```
- **Location 3**: `modules/cloud-sync.js:453-463` & `543-547` (Tab Hijacking during background polling)
  ```javascript
  if (state.activeTabId && typeof state.activeTabId === 'string') {
    localStorage.setItem('lumina_active_tab_id', state.activeTabId);
    if (window.currentActiveTab !== state.activeTabId) {
      window.currentActiveTab = state.activeTabId;
      if (window.switchTab) {
        window.switchTab(state.activeTabId);
      }
    }
  }
  ...
  setInterval(() => {
    if (!isSyncing && !hasPendingSync) {
      pullFromCloud();
    }
  }, 90000);
  ```
- **Observation Detail**: While chat sessions implement non-destructive merging (lines 243-311), calendar events, VFS files, and notes are blindly replaced during periodic 90s sync cycles (`pullFromCloud`). Furthermore, `pullFromCloud` triggers `window.switchTab(state.activeTabId)`, forcefully navigating the user away from their active tab if another device last synced on a different tab.

### OBS-07: Same-Origin Sandbox Escape via Blob URL in `modules/codespace.js`
- **Location**: `modules/codespace.js:440-442`
  ```javascript
  function openCodespacePopout() {
    const blob = new Blob([bundleCodespaceHTML()], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  }
  ```
- **Observation Detail**: `openCodespacePopout()` renders user-provided VFS code into a Blob URL and opens it in a new window. Because Blob URLs inherit the top-level origin (`window.origin`), untrusted scripts execute in the application's origin context with full access to `localStorage` and `document.cookie`.

### OBS-08: Missing Sandbox Attribute on Compiler HTML Preview Iframe in `dashboard.html`
- **Location 1**: `dashboard.html:731`
  ```html
  <iframe id="sandboxPreviewFrame" class="w-full h-full border-0 absolute inset-0"></iframe>
  ```
- **Location 2**: `modules/compiler.js:69-70`
  ```javascript
  const previewFrame = document.getElementById("sandboxPreviewFrame");
  if (previewFrame) previewFrame.srcdoc = code;
  ```
- **Observation Detail**: In contrast to `#csPreviewFrame` (`dashboard.html:614`, which defines `sandbox="allow-scripts allow-modals allow-forms"`), `#sandboxPreviewFrame` has no `sandbox` attribute. Injecting code into its `srcdoc` allows same-origin execution and parent DOM traversal (`window.parent.localStorage`).

### OBS-09: Unauthenticated Telemetry Exposure in Non-Vercel Environments in `api/chat.js`
- **Location**: `api/chat.js:136-144`
  ```javascript
  const isTelemetry = (req.method === 'GET' && (req.query?.action === 'telemetry' || req.url?.includes('action=telemetry'))) ||
                      (req.method === 'POST' && req.body?.action === 'telemetry');
  if (isTelemetry) {
    if (process.env.VERCEL) {
      const auth = await validateSession(req, getRedisClient());
      if (!auth.valid) {
        return sendSecureJson(res, auth.status || 401, { error: auth.error });
      }
    }
  ```
- **Observation Detail**: `validateSession` is guarded by `if (process.env.VERCEL)`. When deployed in Node.js, Docker, or self-hosted environments without `VERCEL`, session verification is skipped completely.

### OBS-10: Prototype Pollution & Path Traversal in MicroVM File Injection in `api/chat.js` & `api/worker.js`
- **Location 1**: `api/chat.js:665-667` and `api/worker.js:311-314`
  ```javascript
  for (const [name, content] of Object.entries(currentVfs)) {
    await sbx.files.write(name, content);
  }
  ```
- **Location 2**: `api/chat.js:609, 625` and `api/worker.js:287`
  ```javascript
  currentVfs[fn] = content;
  updatedVfs[match[1]] = match[2].trim();
  ```
- **Observation Detail**: Keys from `currentVfs` or `[TOOL:WRITE_FILE]` directives are assigned directly without checking for prototype pollution keys (`__proto__`, `constructor`, `prototype`) or directory traversal (`../`).

### OBS-11: Insecure OAuth2 State Handling (Missing Anti-CSRF Nonce) in `api/calendar.js`
- **Location**: `api/calendar.js:41-45, 90-95`
  ```javascript
  const stateObj = {
    redirect_uri: redirectUri,
    ts: Date.now()
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
  ```
- **Observation Detail**: The OAuth2 `state` parameter is plain un-signed base64 JSON containing only `redirect_uri` and timestamp. It contains no random CSRF nonce or HMAC signature tied to the user's session cookie.

### OBS-12: Target Origin Wildcard in `postMessage` in `api/calendar.js`
- **Location**: `api/calendar.js:75, 225`
  ```javascript
  window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', email: ... }, '*');
  window.opener.postMessage({ type: 'GCAL_AUTH_ERROR', error: ... }, '*');
  ```
- **Observation Detail**: `handleCallback` broadcasts user authentication tokens and email addresses to `window.opener` using wildcard target origin `'*'`.

---

## 2. Logic Chain

1. **From OBS-01**: In `api/_lib/auth-guard.js:357`, the boolean evaluation of `finalOrigin` results in `origin` being echoed back whenever the `Origin` header is supplied, regardless of `isAllowed`. Because `Access-Control-Allow-Credentials` is set to `'true'`, any external origin can make authenticated requests with cookies and read sensitive JSON responses from endpoints relying on `setSecurityHeaders` (such as `/api/sync`, `/api/admin`, `/api/calendar`).
2. **From OBS-02**: In `api/auth.js:218`, `'lumina_root_secret'` is hardcoded into `signingSecrets`. When a client submits an arbitrary key in `clientKeys` signed with `'lumina_root_secret'`, the server validates the HMAC against `'lumina_root_secret'`, marks the user as authenticated with `role: 'temporary'`, and saves the key into storage. This constitutes an authentication bypass without knowledge of `ADMIN_PASSWORD`.
3. **From OBS-03**: In `api/auth.js:50-54`, `isMasterAttempt` performs string comparison using `===`. If an attacker triggers IP rate-limiting on `/api/auth`, they can repeatedly test master password candidates and observe timing differences, bypassing rate-limiting and leaking character matches. Similarly, `api/auth.js:187` and `api/auth.js:229` use `===` before or instead of constant-time comparisons.
4. **From OBS-04**: In `api/storage.js:71-78`, `cleanPath` is directly concatenated to `https://api.github.com/repos/${repo}/contents/${cleanPath}` without root scoping. An authenticated session can overwrite `.github/workflows/deploy.yml` or core source files, leading to GitHub Actions runner compromise.
5. **From OBS-05**: In `api/sync.js:75` and `113-115`, `admin_passwords` is returned over the wire and accepted in state updates. A temporary user can obtain hashes/signatures of other keys, or inject poisoned keys into `master_workspace_state`, which are later restored as active admin keys by `api/auth.js` fallback logic.
6. **From OBS-06**: In `modules/cloud-sync.js:221-232, 359-382`, multi-device hydration replaces local calendar events, notes, and VFS files with incoming cloud arrays. If a user edits offline or on two devices simultaneously, the last device to sync destroys the other device's work. Moreover, restoring `activeTabId` during background 90s polls causes unexpected UI tab jumps while typing.
7. **From OBS-07 & OBS-08**: In `modules/codespace.js:440` and `dashboard.html:731`, untrusted HTML/JS is executed in the top-level origin via Blob URLs or an un-sandboxed `<iframe>`. This bypasses the client sandbox and allows malicious code to access `window.parent.localStorage` and `document.cookie`.
8. **From OBS-09 & OBS-10**: In `api/chat.js:139`, guarding authentication by `process.env.VERCEL` leaves non-Vercel environments unprotected. In `api/chat.js` and `api/worker.js`, un-sanitized keys from `currentVfs` written via `sbx.files.write` allow prototype pollution and container path tampering.
9. **From OBS-11 & OBS-12**: In `api/calendar.js:41-45`, lack of a signed CSRF nonce allows authorization code injection. In lines 75 and 225, `postMessage(..., '*')` leaks user email addresses to unauthorized windows.

---

## 3. Caveats

1. **Hardware ESP32 Firmware**: In accordance with user constraint R3 ("Never modify or alter the ESP32 physical firmware files (`firmware/**`)"), physical firmware was inspected for communication protocol compatibility but not targeted for modifications.
2. **Read-Only Scope**: This survey is strictly read-only. No code modifications or test suite alterations have been made during this exploration phase.
3. **External Cloud Services**: Actual live API keys for NVIDIA NIM, Ollama Cloud, Groq, and E2B were not invoked live during static analysis; inspection was performed on handler dispatch and failover mechanics.

---

## 4. Conclusion

The Serverless APIs and Cloud Sync surfaces have several well-designed mechanisms (e.g. 5-layer IoT HMAC verification with anti-replay nonces, multi-key auto-failover, secret scrubbing, and non-destructive chat merge). However, 12 specific vulnerabilities exist that require targeted defensive hardening:

| ID | Surface | Severity | Vulnerability Summary |
|---|---|---|---|
| **VULN-01** | `api/_lib/auth-guard.js`, `api/calendar.js` | **Critical** | CORS Origin Reflection with `Access-Control-Allow-Credentials: true` |
| **VULN-02** | `api/auth.js` | **High** | Hardcoded Fallback Secret (`'lumina_root_secret'`) in Client Key Auth |
| **VULN-03** | `api/auth.js` | **Medium** | Variable-Time String Comparisons in Root Password Bypass & HMAC Checks |
| **VULN-04** | `api/storage.js` | **High** | Unscoped GitHub Repository Path Traversal (Arbitrary File Overwrite / CI Poisoning) |
| **VULN-05** | `api/sync.js` | **High** | Sensitive Credential Leakage & State Poisoning of `admin_passwords` |
| **VULN-06** | `modules/cloud-sync.js` | **Medium** | Destructive Cloud Hydration Overwrites (Calendar, Notes, VFS) & Background Tab Hijacking |
| **VULN-07** | `modules/codespace.js` | **High** | Same-Origin Sandbox Escape via Blob URL in Artifacts Popout |
| **VULN-08** | `dashboard.html`, `modules/compiler.js` | **High** | Missing Sandbox Attribute on Compiler HTML Preview Iframe |
| **VULN-09** | `api/chat.js` | **Low** | Unauthenticated Telemetry Endpoint Exposure in Non-Vercel Runtimes |
| **VULN-10** | `api/chat.js`, `api/worker.js` | **Medium** | Prototype Pollution & Unsanitized File Paths in MicroVM VFS Injection |
| **VULN-11** | `api/calendar.js` | **Medium** | Missing Anti-CSRF Nonce & HMAC Signature in OAuth2 State |
| **VULN-12** | `api/calendar.js` | **Low** | Target Origin Wildcard (`'*'`) in OAuth Callback `postMessage` |

### Recommended Defensive Remediations
1. **Fix CORS Reflection**: Update `auth-guard.js` line 357 to strictly use default origin when `isAllowed === false` (`finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app'`). Update `calendar.js:16` to validate origin against allowed origins before reflection.
2. **Remove Hardcoded Secret Backdoor**: In `api/auth.js:218`, remove `'lumina_root_secret'` when `expectedPassword` is configured.
3. **Enforce Constant-Time Comparison**: In `api/auth.js:50-54`, compare password hashes using `crypto.timingSafeEqual`. In lines 187 and 229, enforce `crypto.timingSafeEqual` for all hash and signature checks.
4. **Sandbox GitHub Storage Prefix**: In `api/storage.js:71`, prefix all paths with `user_vault/` or `storage/` and reject hidden files (`.github/`, `.env`, `.git/`).
5. **Protect Admin Passwords in Sync**: In `api/sync.js:75`, omit `admin_passwords` from `/api/sync` or restrict to `role === 'master'`. In `api/sync.js:113`, ignore client-supplied `b.admin_passwords` (passwords should be managed strictly through `/api/admin`).
6. **Additive Union Hydration & Decouple Background Tab Switching**: In `modules/cloud-sync.js`, implement non-destructive ID and timestamp merging for Calendar, Notes, and VFS files. Only restore `activeTabId` on initial page load, never during periodic 90s sync.
7. **Sandbox Codespace Popout**: In `modules/codespace.js:440`, render popouts within a sandboxed frame or sandboxed data URI, preventing access to top-level `localStorage` and cookies.
8. **Add Sandbox to Preview Iframe**: In `dashboard.html:731`, add `sandbox="allow-scripts allow-modals allow-forms"` to `#sandboxPreviewFrame`.
9. **Uniform Session Verification**: In `api/chat.js:139`, require session verification unconditionally for telemetry.
10. **Sanitize MicroVM VFS Keys**: Filter out `__proto__`, `constructor`, `prototype`, and apply `path.posix.normalize` before writing files to E2B sandboxes.
11. **HMAC OAuth State**: Bind a random session CSRF token and verify HMAC signature on `state` in `api/calendar.js`.
12. **Specify Target Origin in postMessage**: Replace `'*'` with `window.location.origin` in `api/calendar.js` callback.

---

## 5. Verification Method

To independently reproduce the baseline and verify any subsequent remediation:

### Automated Test Suites
1. **Module Syntax Linter**:
   ```bash
   node tests/lint.cjs
   ```
   *Expected*: All 40 JavaScript modules pass syntax validation.

2. **5-Point Task Verification Audit**:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
   *Expected*: All 42 verification assertions pass with zero errors (including min-1 admin key rule, Google Calendar sync, and non-destructive chat merge).

3. **Full Features Unit Test Suite**:
   ```bash
   node tests/features.test.cjs
   ```
   *Expected*: All 1,102 unit assertions pass with zero failures.

4. **Real Google Chrome CDP Browser Suite**:
   ```bash
   node tests/browser-cdp-test.cjs
   ```
   *Expected*: All 122 browser automation tests pass cleanly in Chrome without uncaught console exceptions.

### Files to Inspect
- `api/_lib/auth-guard.js` (lines 345-360)
- `api/auth.js` (lines 50-62, 187-195, 216-235)
- `api/admin.js` (lines 15-26, 160-165)
- `api/storage.js` (lines 71-125)
- `api/sync.js` (lines 75, 113-115)
- `api/calendar.js` (lines 12-20, 41-45, 75, 225)
- `api/chat.js` (lines 136-144, 665-667)
- `modules/cloud-sync.js` (lines 221-232, 359-382, 453-463)
- `modules/codespace.js` (lines 440-442)
- `dashboard.html` (line 731)

### Invalidation Conditions
- Any proposed remediation that breaks the min-1 access key rule or allows deleting the sole admin password.
- Any change causing file line counts to exceed 2,000 lines (e.g. in `dashboard.html`, `modules/ai-studio.js`, `api/iot.js`).
- Any regression in the 1,102 unit assertions or 122 CDP browser tests.
- Any modification to ESP32 physical firmware files (`firmware/**`).
