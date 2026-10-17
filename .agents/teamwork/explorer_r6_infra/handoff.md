# Comprehensive Defensive Security Audit Report: Infrastructure, Secrets & Dependencies

**Agent**: `explorer_r6_infra`  
**Date**: 2026-10-17T05:46:00Z  
**Parent Orchestrator**: `orchestrator_r6` (Conversation ID: `8e2a6dd3-7ab0-4c08-84e9-557fd6782f75`)  
**Target Repository**: `c:/Users/roysu/LuminaVista`  
**Status**: COMPLETE (Hard Handoff)

---

## Executive Summary

A comprehensive, read-only defensive security audit of LuminaVista OS was conducted across all six mandated infrastructure, secrets, and dependency surfaces:
1. **Hardcoded Secrets & Credentials**
2. **Insecure Environment Fallbacks**
3. **CORS Origin Reflection Boundaries**
4. **Content Security Policy (CSP)**
5. **Subresource Integrity (SRI) on CDN Assets**
6. **Vulnerable Dependencies & Supply Chain**

The audit identified **10 structured findings** categorized as:
- **Critical**: 1
- **High**: 4
- **Medium**: 3
- **Low**: 1
- **Informational**: 1

All findings are documented below with exact file paths, line numbers, root cause analyses, threat scenarios, surgical fail-closed remediation recommendations, and automated verification specifications.

---

## Vulnerability Ledger Summary Table

| Finding ID | Title | Severity | Target File & Line(s) | CWE / OWASP |
|---|---|---|---|---|
| **VULN-INFRA-01** | Non-Production Fail-Open Auth Bypass Grants Master Role to Unauthenticated Requests | **Critical** | `api/_lib/auth-guard.js:105-112, 209-213` | CWE-306 / OWASP A01 |
| **VULN-INFRA-02** | Overly Permissive CORS Origin Reflection & Credential Exposure in Calendar API | **High** | `api/calendar.js:200-208, 227-228` | CWE-942 / OWASP A05 |
| **VULN-INFRA-03** | Hardcoded 256-bit Cryptographic HMAC Key Fallback on IoT Gateway | **High** | `api/iot.js:20-23` | CWE-798 / OWASP A07 |
| **VULN-INFRA-04** | Non-Vercel Privilege Escalation Bypass on Admin Credentials Management | **High** | `api/admin.js:26-32` | CWE-285 / OWASP A01 |
| **VULN-INFRA-05** | Permissive CSP Permitting Cleartext Protocols (`http:`, `ws:`) & Broad CDNs | **High** | `dashboard.html:7`, `vercel.json:14` | CWE-1021 / OWASP A05 |
| **VULN-INFRA-06** | Missing SRI on Tailwind CDN Across HTML Entrypoints Due to CDN CORS Incompatibility | **Medium** | `index.html:10`, `dashboard.html:15`, `404.html:10` | CWE-353 / OWASP A08 |
| **VULN-INFRA-07** | Missing CSP Meta Tags on Static HTML Pages (`index.html`, `404.html`) | **Medium** | `index.html:1-50`, `404.html:1-25` | CWE-693 / OWASP A05 |
| **VULN-INFRA-08** | Inconsistent Environment Variable Aliasing & Missing Fail-Closed Handlers | **Medium** | `api/auth.js:21`, `api/_lib/redis.js:6-7`, `api/calendar.js:344` | CWE-1188 / OWASP A05 |
| **VULN-INFRA-09** | Outdated `cookie` Package in `package-lock.json` with Known CVE-2024-47764 | **Low** | `package-lock.json:14`, `node_modules/cookie` | CWE-74 / OWASP A06 |
| **VULN-INFRA-10** | Method and Status Code Discrepancies in CORS Preflight Handlers | **Informational** | `api/sync.js:20`, `api/_lib/auth-guard.js:418`, `api/iot.js:389` | CWE-693 |

---

# 1. Observation

Direct observations and evidence gathered from the codebase:

### Obs 1: `api/_lib/auth-guard.js` Lines 105-112
```javascript
  const isProduction = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
  const allowMock = !isProduction && process.env.ALLOW_MOCK_AUTH !== 'false';
  const redis = redisClient || getSafeStorage();

  // In local offline unit tests / non-production, permit mock sovereign sessions
  if (allowMock && (!redis || !sessionId || sessionId === 'sovereign_session' || sessionId.startsWith('mock_'))) {
    return { valid: true, sessionId: sessionId || 'sovereign_session', role: 'master' };
  }
```
**Evidence**: When `VERCEL` is not set and `NODE_ENV !== 'production'`, `allowMock` is `true`. If `sessionId` is empty or undefined (`!sessionId`), `validateSession` returns `{ valid: true, sessionId: 'sovereign_session', role: 'master' }`. Line 114 (`if (!sessionId ...) return { valid: false, status: 401 }`) is unreachable when `allowMock` is true.

### Obs 2: `api/calendar.js` Lines 200-208 & 227-228
```javascript
  const isAllowed = Boolean(origin && (
    !/evil|attacker|phishing|malicious/i.test(origin) && (
      ALLOWED_ORIGINS.has(origin) ||
      /^https:\/\/[a-zA-Z0-9_-]+\.github\.io$/.test(origin) ||
      /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    )
  ));
  const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
  ...
  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
```
**Evidence**: Any domain ending in `.github.io` or `.vercel.app` (e.g., `https://attacker-account.github.io` or `https://rogue-app.vercel.app`) that does not contain the specific strings "evil", "attacker", "phishing", or "malicious" satisfies `isAllowed === true`. The server sets `Access-Control-Allow-Origin: origin` and `Access-Control-Allow-Credentials: true`.

### Obs 3: `api/iot.js` Lines 19-23
```javascript
export const getDeviceSecret = () => (
  process.env.IOT_DEVICE_SECRET ||
  cachedCloudSecret ||
  (!process.env.VERCEL && process.env.NODE_ENV !== 'production' ? 'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8' : '')
).trim();
```
**Evidence**: When `IOT_DEVICE_SECRET` is unset in non-Vercel environments where `NODE_ENV !== 'production'`, `getDeviceSecret()` returns the static string `'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8'`.

### Obs 4: `api/admin.js` Lines 26-32
```javascript
  // Enforce master role on admin credential management
  if (session.role !== 'master') {
    const isMockTest = (!process.env.VERCEL && process.env.NODE_ENV !== 'production' && session.sessionId && session.sessionId.includes('test_temp'));
    if (!isMockTest) {
      auditLog('ADMIN_FORBIDDEN', req, `Session ${session.sessionId || ''} attempted admin management with role ${session.role}`);
      return sendSecureJson(res, 403, { error: 'Forbidden: Administrator credentials management requires master role.' }, req);
    }
  }
```
**Evidence**: Any caller with role `temporary` possessing a `sessionId` containing `'test_temp'` bypasses the master-role-only restriction when running outside Vercel with `NODE_ENV !== 'production'`.

### Obs 5: `dashboard.html` Line 7 & `vercel.json` Line 14
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://unpkg.com https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; frame-src 'self' data: blob:; connect-src 'self' http: https: wss: ws:; object-src 'none'; base-uri 'self'; form-action 'self';">
```
**Evidence**: `connect-src` explicitly includes unencrypted protocols `http:` and `ws:`. `script-src` includes `'unsafe-inline'`, `'unsafe-eval'`, and broad unpinned CDNs (`https://unpkg.com`, `https://cdnjs.cloudflare.com`).

### Obs 6: `index.html` Line 10, `dashboard.html` Line 15, `404.html` Line 10 & Tailwind CDN Headers
```html
<script src="https://cdn.tailwindcss.com/3.4.15"></script>
```
Empirical HTTP probe via Node.js:
```
Command: node -e "fetch('https://cdn.tailwindcss.com/3.4.15').then(r => console.log('ACAO:', r.headers.get('access-control-allow-origin')))"
Result: ACAO: null
```
**Evidence**: The script tag lacks `integrity` and `crossorigin="anonymous"`. Furthermore, `cdn.tailwindcss.com` does not send `Access-Control-Allow-Origin`, preventing standard SRI attributes from functioning without browser CORS rejection.

### Obs 7: `package-lock.json` Line 14 vs `package.json` Line 31 & `npm audit`
```json
// package.json:
"dependencies": {
  "cookie": "^0.7.0"
}
// package-lock.json:
"node_modules/cookie": {
  "version": "0.6.0"
}
```
`npm audit --json` output:
```json
"vulnerabilities": {
  "cookie": {
    "name": "cookie",
    "severity": "low",
    "title": "cookie accepts cookie name, path, and domain with out of bounds characters",
    "url": "https://github.com/advisories/GHSA-pxg6-pf52-xh8x",
    "range": "<0.7.0"
  }
}
```
**Evidence**: Installed version is `0.6.0` despite `package.json` declaring `^0.7.0`, causing vulnerability GHSA-pxg6-pf52-xh8x / CVE-2024-47764.

---

# 2. Logic Chain

1. **Premise 1 (Zero-Trust Session Invariant)**: In any zero-trust architecture, authorization decisions must fail closed. When an incoming request presents no session token, it must be rejected with HTTP 401.
   - *From Obs 1*: In non-Vercel environments (e.g. Docker, AWS, Render, Kubernetes, or self-hosted dev servers), `!isProduction` is true and `allowMock` is true by default. When an unauthenticated request arrives without a cookie or session header, `!sessionId` evaluates to true, causing `validateSession` to return `{ valid: true, role: 'master' }`.
   - *Inference*: Any unauthenticated actor accessing any protected endpoint in a non-Vercel environment is immediately granted root administrator privileges.

2. **Premise 2 (CORS Credentialed Reflection)**: Browsers permit cross-origin JavaScript to read responses containing credentials (`Access-Control-Allow-Credentials: true`) ONLY if `Access-Control-Allow-Origin` matches the requesting Origin. Reflecting arbitrary origins with credentials destroys the same-origin boundary.
   - *From Obs 2*: `api/calendar.js` uses regexes matching ANY subdomain of `.github.io` or `.vercel.app`. The only barrier is a substring check for "evil", "attacker", "phishing", or "malicious".
   - *Inference*: Any attacker hosting an arbitrary GitHub Pages site (`https://anything-else.github.io`) can make authenticated, credentialed cross-origin requests to `/api/calendar?action=sync` and steal user calendar events and tokens.

3. **Premise 3 (Cryptographic Key Invariance)**: ESP32 hardware authentication relies on a shared 256-bit secret key between the device and cloud gateway. A known default secret allows complete authentication bypass.
   - *From Obs 3*: If `IOT_DEVICE_SECRET` is not set in process environment, the gateway defaults to a hardcoded 64-character hex key string in non-Vercel environments.
   - *Inference*: Anyone with access to the source code can compute valid HMAC-SHA256 signatures for arbitrary telemetry packets, bypass hardware replay verification, and trigger physical door lock state changes.

4. **Premise 4 (Content Security Policy Integrity)**: CSP is designed to restrict content injection and data exfiltration. Allowing cleartext protocols (`http:`, `ws:`) and unrestricted domains bypasses exfiltration defenses.
   - *From Obs 5*: `dashboard.html:7` permits `http:` and `ws:` in `connect-src`.
   - *Inference*: Malicious scripts or injected extensions can bypass HTTPS encryption and exfiltrate sensitive data over plain HTTP or unencrypted WebSockets.

5. **Premise 5 (Supply Chain & Subresource Integrity)**: Third-party CDNs must either be pinned with SRI hashes or served same-origin. If a CDN does not support CORS headers, it cannot be safely protected by SRI.
   - *From Obs 6*: `cdn.tailwindcss.com` does not provide CORS headers, creating a deadlock where adding SRI breaks the UI.
   - *Inference*: Tailwind must be migrated to a CORS-compliant CDN or self-hosted to enable cryptographic integrity verification.

---

# 3. Caveats

1. **Read-Only Scope**: In strict accordance with the explorer archetype and mission constraints, no source code files or dependency locks were modified during this investigation.
2. **Firmware Untouched**: Physical firmware files under `firmware/**` were verified as protected and untouched.
3. **No Offensive Exploits**: No weaponized exploit scripts or attack payloads were created. All threat scenarios are defensive risk models mapped to CWE/OWASP taxonomies.
4. **Test Suite Compatibility**: Existing test suites (`tests/features.test.cjs`, `tests/challenger-calendar-empirical.cjs`, `tests/challenger-r4-empirical.cjs`, `tests/adversarial-calendar.test.cjs`, `tests/suite-calendar-adversarial.cjs`) currently test specific mock behaviors (e.g. allowing `test_temp` in mock environments, or testing `community-fork.github.io`). Any remediation must preserve these test invariants by updating tests in lockstep with defensive fixes.

---

# 4. Detailed Findings & Defensive Remediation Recommendations

### Finding VULN-INFRA-01: Non-Production Fail-Open Authentication Bypass Grants Master Role to Unauthenticated Requests
- **Severity**: **Critical** (CVSS 3.1: 9.8 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
- **Target File & Lines**: `api/_lib/auth-guard.js`, Lines 105-112, Lines 209-213
- **CWE / OWASP**: CWE-306 (Missing Authentication for Critical Function), CWE-653, OWASP A01:2021 (Broken Access Control)
- **Root Cause**: `allowMock` defaults to true when `process.env.VERCEL` is missing and `NODE_ENV !== 'production'`. In line 110:
  `if (allowMock && (!redis || !sessionId || sessionId === 'sovereign_session' || sessionId.startsWith('mock_')))`
  evaluates to true for any request where `sessionId` is empty or undefined (`!sessionId`).
- **Defensive Remediation**:
  1. Enforce strict fail-closed: `!sessionId` must ALWAYS return `{ valid: false, status: 401, error: 'Unauthorized Session' }`, regardless of `allowMock`.
  2. Require explicit opt-in for mock sessions: `allowMock` should only be active when `process.env.ALLOW_MOCK_AUTH === 'true'` AND `process.env.NODE_ENV === 'test'`.
  3. When Redis fails in line 209, never grant `role: 'master'`; fail closed with HTTP 503.
- **Verification Method**: Run automated probe sending unauthenticated `GET /api/admin` with `NODE_ENV='development'` and `VERCEL=''` — verify response is `HTTP 401 Unauthorized`.

---

### Finding VULN-INFRA-02: Overly Permissive CORS Origin Reflection and Credential Exposure in Calendar API
- **Severity**: **High** (CVSS 3.1: 8.1 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`)
- **Target File & Lines**: `api/calendar.js`, Lines 200-208, Lines 227-228
- **CWE / OWASP**: CWE-942 (Permissive Cross-Domain Policy with Untrusted Domains), OWASP A05:2021 (Security Misconfiguration)
- **Root Cause**: Wildcard regexes `^https:\/\/[a-zA-Z0-9_-]+\.github\.io$` and `^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$` permit any tenant on GitHub Pages or Vercel to reflect the Origin header with `Access-Control-Allow-Credentials: true`.
- **Defensive Remediation**:
  1. Replace broad wildcard regexes with strict whitelist matching:
     ```javascript
     const ALLOWED_ORIGINS = new Set([
       'https://subhadraroy.github.io',
       'https://lumina-vista-sigma.vercel.app',
       'https://luminavista.example.com'
     ]);
     ```
  2. Support custom domains via `process.env.ALLOWED_ORIGINS` (comma-separated).
  3. For local development, permit only `^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$`.
  4. Reject arbitrary `*.github.io` and `*.vercel.app` subdomains.
- **Verification Method**: Send request to `/api/calendar/status` with `Origin: https://unauthorized-tenant.github.io`; assert `Access-Control-Allow-Origin` is NOT reflected (falls back safely to `https://lumina-vista-sigma.vercel.app`).

---

### Finding VULN-INFRA-03: Hardcoded 256-bit Cryptographic HMAC Key Fallback on IoT Gateway
- **Severity**: **High** (CVSS 3.1: 7.5 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **Target File & Lines**: `api/iot.js`, Lines 20-23
- **CWE / OWASP**: CWE-798 (Use of Hardcoded Credentials), CWE-1188, OWASP A07:2021 (Identification and Authentication Failures)
- **Root Cause**: `getDeviceSecret()` falls back to string `'a9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8'` when `IOT_DEVICE_SECRET` is unset in non-Vercel development environments.
- **Defensive Remediation**:
  1. Remove hardcoded fallback string entirely:
     ```javascript
     export const getDeviceSecret = () => (
       process.env.IOT_DEVICE_SECRET ||
       cachedCloudSecret ||
       ''
     ).trim();
     ```
  2. If secret is empty, fail closed in `ensureDeviceSecretLoaded()` and return `HTTP 503 Service Unavailable ("IoT gateway cryptographic key not provisioned")`.
- **Verification Method**: Execute `node -e "delete process.env.IOT_DEVICE_SECRET; ..."` and call `GET /api/iot?action=time`; assert HTTP 503 is returned.

---

### Finding VULN-INFRA-04: Non-Vercel Privilege Escalation Bypass on Admin Credentials Management
- **Severity**: **High** (CVSS 3.1: 8.8 - `CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H`)
- **Target File & Lines**: `api/admin.js`, Lines 26-32
- **CWE / OWASP**: CWE-285 (Improper Authorization), OWASP A01:2021 (Broken Access Control)
- **Root Cause**: Temporary session tokens containing the substring `'test_temp'` bypass the `session.role === 'master'` requirement when running outside Vercel with `NODE_ENV !== 'production'`.
- **Defensive Remediation**:
  1. Remove the `isMockTest` token substring bypass from `api/admin.js:27`.
  2. Enforce strict `if (session.role !== 'master') return sendSecureJson(res, 403, ...);` across all environments.
  3. If mock tests require testing temporary keys against admin endpoints, mock the authorization function at test harness level.
- **Verification Method**: Invoke `handler(req, res)` with `session.role = 'temporary'` and `session.sessionId = 'lv_test_temp_...'`; assert HTTP 403 Forbidden is returned.

---

### Finding VULN-INFRA-05: Permissive Content Security Policy (CSP) Permitting Cleartext Protocols (`http:`, `ws:`) & Broad CDNs
- **Severity**: **High** (CVSS 3.1: 7.5 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N`)
- **Target File & Lines**: `dashboard.html`, Line 7; `vercel.json`, Line 14
- **CWE / OWASP**: CWE-1021 (Improper Restriction of Rendered UI Layers), CWE-693, OWASP A05:2021 (Security Misconfiguration)
- **Root Cause**: `dashboard.html:7` configures `connect-src 'self' http: https: wss: ws:;`, permitting unencrypted cleartext `http:` and `ws:` network traffic. Furthermore, `script-src` includes `'unsafe-inline'` and `'unsafe-eval'`.
- **Defensive Remediation**:
  1. Remove `http:` and `ws:` from `connect-src`. Constrain to `connect-src 'self' https: wss:;`.
  2. Remove `'unsafe-eval'` where dynamic compilation is not strictly required.
  3. Ensure `https://accounts.google.com` is present in `vercel.json` CSP to align with Google OAuth.
- **Verification Method**: Parse CSP meta tag in `dashboard.html` and verify `connect-src` contains no cleartext schemes (`http:`, `ws:`).

---

### Finding VULN-INFRA-06: Missing Subresource Integrity (SRI) on Tailwind CDN Across HTML Entrypoints Due to CDN CORS Incompatibility
- **Severity**: **Medium** (CVSS 3.1: 6.5 - `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N`)
- **Target File & Lines**: `index.html` (Line 10), `dashboard.html` (Line 15), `404.html` (Line 10)
- **CWE / OWASP**: CWE-353 (Missing Support for Integrity Check), OWASP A08:2021 (Software and Data Integrity Failures)
- **Root Cause**: `<script src="https://cdn.tailwindcss.com/3.4.15"></script>` lacks `integrity` and `crossorigin="anonymous"`. Direct probing confirms `cdn.tailwindcss.com` returns `Access-Control-Allow-Origin: null`.
- **Defensive Remediation**:
  1. Migrate Tailwind script from `cdn.tailwindcss.com` to a CORS-compliant provider (e.g., `cdnjs.cloudflare.com`) or bundle Tailwind CSS locally.
  2. Add `integrity="sha384-..."` and `crossorigin="anonymous"` once CORS headers are present.
- **Verification Method**: Automated script scanning all `<script src="http...">` tags in HTML files to verify that each possesses `integrity` and `crossorigin="anonymous"`.

---

### Finding VULN-INFRA-07: Missing CSP Meta Tags on Static HTML Pages (`index.html`, `404.html`)
- **Severity**: **Medium** (CVSS 3.1: 5.3 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`)
- **Target File & Lines**: `index.html` (Lines 1-50), `404.html` (Lines 1-25)
- **CWE / OWASP**: CWE-693 (Protection Mechanism Failure), OWASP A05:2021 (Security Misconfiguration)
- **Root Cause**: `index.html` and `404.html` omit `<meta http-equiv="Content-Security-Policy">`. In static hosting (GitHub Pages), `vercel.json` HTTP headers are not applied, leaving the pages without CSP protection.
- **Defensive Remediation**: Add strict `<meta http-equiv="Content-Security-Policy" content="...">` to the `<head>` of `index.html` and `404.html`.
- **Verification Method**: Assert `document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length > 0` on both `index.html` and `404.html`.

---

### Finding VULN-INFRA-08: Inconsistent Environment Variable Aliasing and Missing Fail-Closed Handlers
- **Severity**: **Medium** (CVSS 3.1: 5.3 - `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`)
- **Target File & Lines**: `api/auth.js:21`, `api/_lib/redis.js:6-7`, `api/calendar.js:344`
- **CWE / OWASP**: CWE-1188 (Insecure Default Initialization of Resource), OWASP A05:2021
- **Root Cause**: Standard environment variable aliases documented in requirements (`ADMIN_MASTER_PASSWORD`, `REDIS_URL`, `GCAL_CLIENT_SECRET`) are not recognized.
- **Defensive Remediation**:
  - `api/auth.js`: Check `process.env.ADMIN_PASSWORD || process.env.ADMIN_MASTER_PASSWORD`.
  - `api/_lib/redis.js`: Check `process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.REDIS_URL`.
  - `api/calendar.js`: Check `process.env.GOOGLE_CLIENT_SECRET || process.env.GCAL_CLIENT_SECRET`.
  - In all cases, fail closed with HTTP 500/503 when required secrets are missing.
- **Verification Method**: Run test with only `ADMIN_MASTER_PASSWORD` set; verify successful authentication.

---

### Finding VULN-INFRA-09: Outdated `cookie` Package in `package-lock.json` with Known CVE-2024-47764
- **Severity**: **Low** (CVSS 3.1: 3.1 - `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N`)
- **Target File & Lines**: `package-lock.json:14`, `node_modules/cookie/package.json`
- **CWE / OWASP**: CWE-74 (Improper Neutralization of Special Elements in Output Used by a Downstream Component), OWASP A06:2021 (Vulnerable and Outdated Components)
- **Root Cause**: `package-lock.json` and `node_modules` retain `cookie@0.6.0`, which is vulnerable to GHSA-pxg6-pf52-xh8x / CVE-2024-47764.
- **Defensive Remediation**: Run `npm update cookie` or `npm install cookie@^0.7.2` to update `package-lock.json` to version `>=0.7.0`.
- **Verification Method**: Run `npm audit --json` and verify 0 vulnerabilities are reported.

---

### Finding VULN-INFRA-10: Method and Status Code Discrepancies in CORS Preflight Handlers
- **Severity**: **Informational**
- **Target File & Lines**: `api/sync.js:20`, `api/_lib/auth-guard.js:418`, `api/iot.js:389`
- **Root Cause**:
  1. `api/sync.js:20` returns `HTTP 200` instead of standard `HTTP 204` on OPTIONS preflight.
  2. `api/_lib/auth-guard.js:418` omits `PATCH` from `Access-Control-Allow-Methods`.
  3. `api/iot.js:389` calls `setSecurityHeaders(res)` without passing `req`.
- **Defensive Remediation**: Standardize OPTIONS responses to `res.status(204).end()`, add `PATCH` to `Access-Control-Allow-Methods`, and pass `req` to `setSecurityHeaders(res, req)`.
- **Verification Method**: Issue `OPTIONS /api/sync` and assert `status === 204`.

---

# 5. Verification Method

To independently verify all findings and test suites:

### 1. Test Suite Verification Commands
```bash
# Unit test suite (1,102 assertions)
node tests/features.test.cjs

# Comprehensive 5-point task audit (42 assertions)
node tests/recheck-all-tasks.cjs

# 40-module syntax linter
node tests/lint.cjs

# Empirical calendar challenger harness (63 assertions)
node tests/challenger-calendar-empirical.cjs

# Adversarial penetration challenge (141 assertions)
node tests/challenger-r4-empirical.cjs

# Adversarial calendar controller harness (109 probes)
node tests/adversarial-calendar.test.cjs

# Adversarial calendar probe (25 tests)
node tests/suite-calendar-adversarial.cjs

# Dependency vulnerability audit
npm audit --json
```

### 2. Specific Verification Probes for Discovered Findings

```javascript
// Verification Probe for VULN-INFRA-01 (Unauthenticated Fail-Open Auth Bypass):
const { validateSession } = require('./api/_lib/auth-guard.js');
delete process.env.VERCEL;
process.env.NODE_ENV = 'development';
const mockReq = { headers: {} }; // No cookies, no session header
const sessionResult = await validateSession(mockReq);
assert.strictEqual(sessionResult.valid, false, "Unauthenticated request MUST NOT be valid!");
assert.strictEqual(sessionResult.status, 401, "Must return HTTP 401 Unauthorized!");

// Verification Probe for VULN-INFRA-02 (CORS Origin Reflection):
const calendarHandler = require('./api/calendar.js').default;
let capturedOrigin = null;
const fakeReq = { method: 'OPTIONS', headers: { origin: 'https://attacker.github.io' }, url: '/api/calendar/status' };
const fakeRes = {
  setHeader: (k, v) => { if (k.toLowerCase() === 'access-control-allow-origin') capturedOrigin = v; },
  status: () => ({ end: () => {} })
};
await calendarHandler(fakeReq, fakeRes);
assert.notStrictEqual(capturedOrigin, 'https://attacker.github.io', "Hostile origin must NOT be reflected!");

// Verification Probe for VULN-INFRA-03 (Hardcoded IoT Key):
delete process.env.IOT_DEVICE_SECRET;
delete process.env.VERCEL;
process.env.NODE_ENV = 'development';
const { getDeviceSecret } = require('./api/iot.js');
assert.strictEqual(getDeviceSecret(), '', "Must NOT return hardcoded key fallback!");
```

### Invalidation Conditions
- If `validateSession` in `api/_lib/auth-guard.js` is proven to strictly return `status: 401` when `!sessionId` without checking `allowMock`, Finding VULN-INFRA-01 is invalidated.
- If `api/calendar.js` is proven to reject `https://untrusted.github.io`, Finding VULN-INFRA-02 is invalidated.
- If `api/iot.js` contains no static 64-character hex string fallback, Finding VULN-INFRA-03 is invalidated.

---

## Conclusion & Next Steps for Remediation Phase

The LuminaVista OS infrastructure and secret management demonstrates strong cryptographic foundations (HMAC-SHA256 sovereign tokens, constant-time `crypto.timingSafeEqual` checks, and automatic secret scrubbing in logs). However, defense-in-depth gaps exist in non-production environment fallbacks, broad regex CORS reflection in `api/calendar.js`, hardcoded default IoT secrets, cleartext CSP schemes, and dependency synchronization in `package-lock.json`.

These 10 findings provide a prioritized blueprint for surgical, production-safe remediation by the remediation engineering team.
