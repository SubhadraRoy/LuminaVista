# Deep Security & Adversarial Vulnerability Analysis: Serverless Edge APIs & Zero-Trust Sessions

**Author**: Explorer R2-1 (Senior Security Exploration Specialist)  
**Date**: 2026-10-16  
**Scope**: 
- Surface 1: Serverless Edge APIs (`api/*.js`, `api/_lib/*.js`)
- Surface 2: Zero-Trust Authentication & Sovereign Session Validation (`api/admin.js`, `api/auth.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js`)

---

## Executive Summary

A comprehensive, read-only adversarial security audit was conducted across LuminaVista OS Surface 1 (Serverless Edge APIs) and Surface 2 (Zero-Trust Session Management). 

The audit confirmed that significant hardening was accomplished in Round 1:
- Master root authentication in `api/auth.js` strictly requires `process.env.ADMIN_PASSWORD` and fails closed (HTTP 500) if missing.
- Constant-time cryptographic comparisons (`crypto.timingSafeEqual`) are correctly implemented across password hashes, sovereign tokens, and IoT signatures with safe buffer padding to prevent length mismatch exceptions.
- The minimum-1 active access key invariant in `api/admin.js` evaluates `remaining.length < 1` post-filtering, properly handling duplicate records.
- All verification test suites pass completely (1,102 unit tests, 122 Google Chrome CDP tests, 42 recheck tasks, 40 linted modules).
- All files strictly adhere to the line count budget (< 2,000 lines).

However, our adversarial deep-dive identified **6 critical security vulnerabilities and defense-in-depth gaps** that remain open or present bypass risks:
1. **Residual Hardcoded Fallback Secrets**: `'lumina_root_secret'` in `api/admin.js:45, 109` and `api/_lib/auth-guard.js:34`; `'lumina_calendar_oauth_secret'` in `api/calendar.js:57, 158`; and hardcoded fallback secret in `api/iot.js:22`.
2. **Wildcard Suffix CORS Origin Reflection**: Overly broad `.endsWith('.github.io')` and `.endsWith('.vercel.app')` reflection with `Access-Control-Allow-Credentials: true` in `api/_lib/auth-guard.js:405-406` and `api/calendar.js:24-25`.
3. **`vercel.json` Conflicting CORS Header**: `"Access-Control-Allow-Origin": "*"` coupled with `"Access-Control-Allow-Credentials": "true"`, causing standard W3C CORS rejection on credentialed requests.
4. **Fail-Open Semantics on Redis Storage Errors**: In `api/_lib/auth-guard.js:141-143`, if Redis suffers a read/network failure during session revocation verification, the validator fails OPEN, treating revoked sessions as valid.
5. **SSRF via `customEndpoint`**: In `api/chat.js:418-423` and `api/_lib/key-pool.js:246`, `normalizeOllamaEndpoint` fails to block cloud metadata service IP `169.254.169.254`, private RFC 1918 subnets, or non-Vercel localhosts.
6. **URL-Encoded Path Traversal in Storage Proxy**: In `api/storage.js:15-27`, `sanitizeFilePath` does not decode percent-encoded sequences prior to traversal checks, allowing `%2e%2e%2f` to traverse out of the `user_vault` namespace at the GitHub API upstream.

---

## Detailed Vulnerability Audit Register

| ID | Location | Vulnerability / Threat | Severity | Status / Recommendation |
|---|---|---|---|---|
| **SEC-R2-01** | `api/admin.js:45, 109`<br>`api/_lib/auth-guard.js:34` | **Hardcoded Root Secret Fallback** (`'lumina_root_secret'`) | High | Fail closed: throw configuration error if `ADMIN_PASSWORD` is absent. |
| **SEC-R2-02** | `api/_lib/auth-guard.js:403-413`<br>`api/calendar.js:22-31` | **Wildcard Suffix CORS Origin Reflection with Credentials** (`.github.io`, `.vercel.app`) | High | Restrict strictly to exact whitelist (`subhadraroy.github.io`, `lumina-vista-sigma.vercel.app`). |
| **SEC-R2-03** | `vercel.json:21-22` | **Conflicting CORS Headers** (`Allow-Origin: *` with `Allow-Credentials: true`) | Medium | Remove wildcard origin or replace with origin whitelist. |
| **SEC-R2-04** | `api/_lib/auth-guard.js:139-143` | **Fail-Open Semantics During Storage Outage / Revocation Check** | High | Enforce fail-closed semantics (`valid: false`) if session revocation cannot be verified. |
| **SEC-R2-05** | `api/chat.js:418-423`<br>`api/_lib/key-pool.js:246` | **SSRF via `customEndpoint` to Cloud Metadata (`169.254.169.254`) & Private IPs** | High | Validate URL scheme (`http/https`), block private/loopback/link-local IP addresses. |
| **SEC-R2-06** | `api/storage.js:15-27, 102` | **Unescaped / Percent-Encoded Path Traversal in Storage Proxy** (`%2e%2e%2f`) | High | Decode URI components before path normalization and namespace prefixing. |
| **SEC-R2-07** | `api/worker.js:287, 326`<br>`api/chat.js:607, 663` | **Prototype Key Collision / Pollution in VFS Mutations** (`__proto__`, `constructor`) | Medium | Reject reserved prototype keys before mutating VFS dictionary. |
| **SEC-R2-08** | `api/logout.js:13-17` | **Missing Explicit Revocation Marker** (`session:revoked:${sessionId}`) | Low | Write explicit revocation marker with 1200s TTL on logout. |

---

## Code-Level Evidence & Trace Analysis

### 1. Hardcoded Root Secret Fallback (`'lumina_root_secret'`)

**Location**:
- `api/admin.js:45`: `const rawSecret = process.env.ADMIN_PASSWORD || 'lumina_root_secret';`
- `api/admin.js:109`: `const rawSecret = process.env.ADMIN_PASSWORD || 'lumina_root_secret';`
- `api/_lib/auth-guard.js:34`: `const adminSecret = secret || process.env.ADMIN_PASSWORD || 'lumina_root_secret';`

**Analysis**:
In Round 1, `api/auth.js` was patched to remove `'lumina_root_secret'` and fail closed:
```javascript
// api/auth.js:22-25
if (!rawExpectedPassword) {
  auditLog('AUTH_MISCONFIG', req, 'Database credentials or admin password missing');
  return sendSecureJson(res, 500, { success: false, error: 'Server misconfigured. Access blocked.' }, req);
}
```
However, `api/admin.js` and `api/_lib/auth-guard.js` still maintain the hardcoded fallback `'lumina_root_secret'`. 
If `process.env.ADMIN_PASSWORD` is undefined, `generateSovereignSessionToken` generates tokens signed with `'lumina_root_secret'`, while `api/admin.js` signs client keys with `'lumina_root_secret'`. 
An attacker with access to the public repository knows this secret. Furthermore, in `verifySovereignSessionToken` (line 48-49), it checks `if (!adminSecret) return null`, creating an architectural inconsistency where tokens signed by the fallback fail downstream validation.

**Remediation Recommendation**:
In `api/admin.js` and `api/_lib/auth-guard.js`, replace fallback strings with strict presence validation:
```javascript
const rawSecret = process.env.ADMIN_PASSWORD;
if (!rawSecret) throw new Error('ADMIN_PASSWORD not configured');
```

---

### 2. CORS Origin Reflection with Credentials

**Location**:
- `api/_lib/auth-guard.js:403-413`
- `api/calendar.js:22-31`

**Code Snippet**:
```javascript
  const ALLOWED_ORIGINS = new Set([
    'https://subhadraroy.github.io',
    'https://lumina-vista-sigma.vercel.app',
    'https://luminavista.example.com'
  ]);
  const isAllowed = Boolean(origin && (
    ALLOWED_ORIGINS.has(origin) ||
    origin.endsWith('.github.io') ||
    origin.endsWith('.vercel.app') ||
    origin === 'https://luminavista.example.com' ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  ));

  const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';
  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
```

**Adversarial Vector**:
Anyone can register an arbitrary GitHub username (`evil-attacker.github.io`) or deploy an arbitrary project on Vercel (`evil-app.vercel.app`).
Because `origin.endsWith('.github.io')` and `origin.endsWith('.vercel.app')` evaluate to `true`, the server responds with:
`Access-Control-Allow-Origin: https://evil-attacker.github.io`
`Access-Control-Allow-Credentials: true`
A victim browsing `https://evil-attacker.github.io` can be exploited via malicious JavaScript making credentialed cross-origin fetch calls (`credentials: 'include'`) to `/api/admin`, `/api/sync`, or `/api/storage`, exfiltrating admin password hashes, sovereign session cookies (`godx_session`), and private files.

**Remediation Recommendation**:
Eliminate wildcard domain suffix checks. Validate against the explicit `ALLOWED_ORIGINS` Set and strict localhost regex for development:
```javascript
const isAllowed = Boolean(origin && (
  ALLOWED_ORIGINS.has(origin) ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
));
```

---

### 3. Fail-Open Semantics in Sovereign Session Revocation

**Location**:
`api/_lib/auth-guard.js:129-143`

**Code Snippet**:
```javascript
      try {
        [revocationMarker, sessionRecord] = await Promise.all([
          redis.get(`session:revoked:${sessionId}`),
          redis.get(`session:${sessionId}`)
        ]);
      } catch (err) {
        storageError = true;
        console.warn('[AUTH_GUARD] Redis revocation check unavailable, falling back to sovereign token:', err?.message || err);
      }

      // Storage network/read failure during cold start or outage:
      // Maintain sovereign zero-trust resilience fallback
      if (storageError) {
        return { valid: true, sessionId, role: verified.role, keyId: null };
      }
```

**Adversarial Vector**:
When an administrator logs out or revokes an access session, the session token remains mathematically valid for its 20-minute lifetime. 
If an attacker can induce storage latency, network partition, or Upstash rate limits (HTTP 429), `storageError` becomes `true`. 
The auth guard falls open and returns `{ valid: true }`, allowing a revoked/compromised session token to execute privileged operations.

**Remediation Recommendation**:
Follow strict zero-trust fail-closed principles: if Redis storage is reachable, session revocation MUST be verified. If an outage occurs, privileged admin routes must reject requests (`valid: false, status: 503, error: 'Session revocation check unavailable'`).

---

### 4. Server-Side Request Forgery (SSRF) via `customEndpoint`

**Location**:
- `api/chat.js:418-423`
- `api/_lib/key-pool.js:241-264`

**Code Snippet**:
```javascript
// api/chat.js:418-423
const endpoint = normalizeOllamaEndpoint(customEndpoint);
return fetch(endpoint, {
  method: 'POST',
  headers,
  body: JSON.stringify({ ... })
});

// api/_lib/key-pool.js:246
if (process.env.VERCEL && /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(ep)) {
  return 'https://ollama.com/v1/chat/completions';
}
```

**Adversarial Vector**:
1. Cloud Metadata Service: An attacker passes `customEndpoint: "http://169.254.169.254/latest/meta-data/"`. The regex `/localhost|127\.0\.0\.1|0\.0\.0\.0/i` does NOT match. The server issues a POST request to the AWS/GCP cloud metadata IP.
2. Private VPC Subnets: Passing `http://10.0.0.1/` or `http://192.168.1.5/` allows scanning and accessing private internal microservices.
3. Non-Vercel Deployments: When `process.env.VERCEL` is false, even `http://localhost:8080` is fetched directly.

**Remediation Recommendation**:
Parse `customEndpoint` using `new URL()`. Enforce protocol (`https:` in production), and resolve host to verify it does not fall into loopback (`127.0.0.0/8`), link-local (`169.254.0.0/16`), or RFC 1918 private subnets.

---

### 5. URL-Encoded Path Traversal in Storage Proxy

**Location**:
`api/storage.js:15-27, 70-105`

**Code Snippet**:
```javascript
function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  const clean = userPath
    .replace(/\0/g, '')
    .replace(/\\/g, '/')
    .trim();
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    return '';
  }
  return normalized;
}
```

**Adversarial Vector**:
`path.posix.normalize` operates on literal character strings and does NOT decode percent-encoded octets.
When a request provides `path: "%2e%2e%2f.env"`, `sanitizeFilePath` produces `"%2e%2e%2f.env"`.
Because `cleanPath` does not start with `.`, it passes `hasHiddenSegment` and `PROTECTED_PREFIXES`.
`targetPath` becomes `user_vault/%2e%2e%2f.env`.
When sent to `https://api.github.com/repos/${repo}/contents/user_vault/%2e%2e%2f.env`, the upstream GitHub API server decodes `%2e%2e%2f` to `../` and resolves to the repository root `.env` file!

**Remediation Recommendation**:
Apply `decodeURIComponent` (repeatedly until fully decoded) or explicitly reject `%` characters before normalization:
```javascript
let decoded = userPath;
try { decoded = decodeURIComponent(userPath); } catch (_) { return ''; }
if (decoded.includes('%')) return ''; // block double-encoding
```

---

### 6. Prototype Pollution in VFS Tool Parsing

**Location**:
- `api/worker.js:284-289, 326`
- `api/chat.js:601-608`

**Code Snippet**:
```javascript
const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
let match;
while ((match = writeRegex.exec(aiReply)) !== null) {
  updatedVfs[match[1]] = match[2].trim();
  terminalLogs.push(`[Worker] Wrote artifact: ${match[1]}`);
}
```

**Adversarial Vector**:
If `match[1]` is `'__proto__'`, direct assignment `updatedVfs[match[1]] = ...` mutates `Object.prototype` in environments where `__proto__` is not neutralized.
Similarly, `delete updatedVfs[match[1]]` or receiving `currentVfs` with `constructor` can crash object lookups or alter prototype behavior.

**Remediation Recommendation**:
Create VFS maps with `Object.create(null)` and reject prototype-polluting keys:
```javascript
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
if (DANGEROUS_KEYS.has(match[1])) continue;
```

---

## Invariant & Constraint Verification

| Invariant / Constraint | Target Limit | Current State | Verdict |
|---|---|---|---|
| `api/admin.js` Line Count | < 2,000 lines | 199 lines | **COMPLIANT** |
| `api/auth.js` Line Count | < 2,000 lines | 293 lines | **COMPLIANT** |
| `api/calendar.js` Line Count | < 2,000 lines | 846 lines | **COMPLIANT** |
| `api/chat.js` Line Count | < 2,000 lines | 755 lines | **COMPLIANT** |
| `api/compile.js` Line Count | < 2,000 lines | 111 lines | **COMPLIANT** |
| `api/iot.js` Line Count | < 2,000 lines | 1,248 lines | **COMPLIANT** |
| `api/logout.js` Line Count | < 2,000 lines | 32 lines | **COMPLIANT** |
| `api/storage.js` Line Count | < 2,000 lines | 173 lines | **COMPLIANT** |
| `api/sync.js` Line Count | < 2,000 lines | 136 lines | **COMPLIANT** |
| `api/terminal.js` Line Count | < 2,000 lines | 133 lines | **COMPLIANT** |
| `api/worker.js` Line Count | < 2,000 lines | 352 lines | **COMPLIANT** |
| `api/_lib/auth-guard.js` Line Count | < 2,000 lines | 477 lines | **COMPLIANT** |
| `modules/admin-access.js` Line Count | < 2,000 lines | 439 lines | **COMPLIANT** |
| `tests/**` Untampered | 0 modified | 0 modified (verified by `git status`) | **COMPLIANT** |
| `firmware/**` Untampered | 0 modified | 0 modified (verified by `git status`) | **COMPLIANT** |
| Unit Test Suite (`tests/features.test.cjs`) | 1,102 passed | 1,102 / 1,102 passed (0 errors) | **COMPLIANT** |
| Chrome CDP Suite (`tests/browser-cdp-test.cjs`) | 122 passed | 122 / 122 passed (0 errors) | **COMPLIANT** |
| Recheck Suite (`tests/recheck-all-tasks.cjs`) | 42 passed | 42 / 42 passed (0 errors) | **COMPLIANT** |
| Syntax Linter (`tests/lint.cjs`) | 40 passed | 40 / 40 passed (0 errors) | **COMPLIANT** |

---

## Conclusion & Proposed Action Plan

The codebase has achieved solid baseline stability with 100% test passing rates and robust constant-time cryptographic primitives. 
However, before LuminaVista OS can be certified as fully fortified and production-ready under Zero-Trust principles, the auto-remediation agents must execute targeted fixes for the 6 identified vulnerabilities:
1. Purge all remaining fallback keys (`'lumina_root_secret'`, `'lumina_calendar_oauth_secret'`).
2. Lock down CORS origin reflection to remove wildcard suffix matching (`.github.io`, `.vercel.app`).
3. Correct `vercel.json` conflicting CORS credentials/origin header.
4. Implement strict fail-closed authorization semantics on Redis storage errors during session verification.
5. Add SSRF private IP and cloud metadata filters to `normalizeOllamaEndpoint`.
6. Enforce URI decoding and `%` stripping in `api/storage.js` path sanitization.
7. Shield VFS dictionary mutations in `api/chat.js` and `api/worker.js` against prototype pollution keys.
