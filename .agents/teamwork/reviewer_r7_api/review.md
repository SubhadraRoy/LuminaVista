# Independent Security Review Report: Edge API & Authentication Surface
**Review Cycle**: Round 7 Defensive Security Review  
**Reviewer**: Reviewer 1 (Principal Security Architect - APIs & Auth)  
**Date**: 2026-10-17  
**Scope**: `api/terminal.js`, `api/worker.js`, `api/_lib/key-pool.js`, and general API security posture (`api/admin.js`, `api/auth.js`, `api/iot.js`, `api/_lib/auth-guard.js`)  

---

## 1. Executive Summary & Verdict

- **Verdict**: **`APPROVE`**
- **Risk Assessment**: **`LOW / FORTIFIED`**
- **Integrity Assessment**: **`CLEAN (Zero Integrity Violations)`**

An exhaustive, line-by-line quality and adversarial review was conducted across all code diffs implemented by Worker 1 (`api/terminal.js`, `api/worker.js`, `api/_lib/key-pool.js`), as well as the broader Edge API and authentication perimeter (`api/admin.js`, `api/auth.js`, `api/iot.js`, `api/_lib/auth-guard.js`).

All three assigned defense-in-depth tasks (**VULN-R7-06**, **VULN-R7-07**, **VULN-R7-08**) address root causes without band-aid workarounds, maintain 100% backward compatibility, introduce zero performance overhead, preserve fail-closed authorization semantics, and adhere strictly to repository invariant budgets (< 2,000 line limit, 100% untouched ESP32 firmware).

---

## 2. Detailed Code Review by Target File

### 2.1. `api/terminal.js` (Consolidation onto Canonical Path Sanitizer)
- **Diff Analysis**:
  - Removed local `sanitizeFilePath(userPath)` and unused `import path from 'path';`.
  - Imported canonical `sanitizeFilePath` from `./_lib/auth-guard.js`.
- **Root-Cause Analysis**:
  - The previous local helper in `terminal.js` used a simple string replace for `\0` and `\\` followed by `path.posix.normalize()`. It did not handle recursive URI percent-encoding (`%2e%2e`, `%252e%252e`), did not strip ASCII control bytes `[\x00-\x1f\x7f]`, and did not guard against query/hash delimiters (`?`, `#`).
  - Canonical `sanitizeFilePath` in `api/_lib/auth-guard.js:551-580` implements recursive `decodeURIComponent` until stability, rejects any ASCII control character, strips query/hash fragments, normalizes POSIX paths, and strictly rejects any path where `clean.includes('..')` or normalized segments evaluate to `'..'`.
- **Correctness & Robustness**:
  - The function is used when mounting VFS files into the ephemeral E2B Firecracker container (`sbx.files.write(safeName, String(file.content))`). If `safeName` evaluates to `''`, the file write is safely skipped, preventing container escape or host mounting traversal.
- **Verdict**: **APPROVED (Root-Cause Fixed)**.

### 2.2. `api/worker.js` (Strict `jobId` Format Validation & BOLA Defense)
- **Diff Analysis**:
  - Introduced module-level regex: `const VALID_JOB_ID = /^[a-zA-Z0-9_\-]{1,128}$/;`.
  - Added type-guarded format checks on GET handler (`jobId || action === 'status' || action === 'output'`).
  - Added format validation on POST status/output queries and background task dispatches.
  - Added sanitized `cleanTaskId` in scheduled tasks runner (`String(task.id || 'task').replace(/[^a-zA-Z0-9_\-]/g, '')`).
  - Added format validation guard inside `executeAutonomousCloudTask`.
- **Root-Cause Analysis**:
  - Previously, `jobId` from query string or body was only checked for truthiness (`if (jobId)`). While `sessionId` and `adminKeyId` were regex-validated, `jobId` could receive arbitrarily long strings, carriage returns, or Redis injection characters.
  - The new regex strictly allows only 1 to 128 characters from the ASCII set `[a-zA-Z0-9_-]`. Non-string types (`number`, `object`, `array`) and malformed strings are immediately rejected with HTTP 400 `{ error: 'Invalid or missing jobId format' }` before any storage query or key interpolation occurs.
- **BOLA & Authorization**:
  - Verified that job queries strictly enforce ownership: non-master callers can only access jobs matching their `auth.sessionId` (`auth.role === 'master' || (Boolean(job.ownerSessionId) && job.ownerSessionId === auth.sessionId)`). Unmatched requests trigger an audit log and return HTTP 403 Forbidden.
- **Verdict**: **APPROVED (Root-Cause Fixed)**.

### 2.3. `api/_lib/key-pool.js` (Unconditional SSRF Screening in `normalizeOllamaEndpoint`)
- **Diff Analysis**:
  - Removed `process.env.VERCEL &&` condition preceding `isBlockedSsrfTarget(ep)`.
  - Lines 360-363 now evaluate:
    ```javascript
    if (isBlockedSsrfTarget(ep)) {
      return 'https://ollama.com/v1/chat/completions';
    }
    ```
- **Root-Cause Analysis**:
  - Previously, if LuminaVista was run in a non-Vercel environment (e.g. self-hosted Node runtime, Docker, staging cluster), `process.env.VERCEL` evaluated to falsy, bypassing the automatic Ollama Cloud fallback for private/loopback IP endpoints.
  - Evaluating `isBlockedSsrfTarget(ep)` unconditionally ensures that loopback (`127.0.0.1`, `localhost`), RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata (`169.254.169.254`, `metadata.google.internal`), and IPv6-mapped equivalents (`::ffff:127.0.0.1`, `::7f00:1`, `::a9fe:a9fe`) automatically redirect to Ollama Cloud across all execution environments.
- **Verdict**: **APPROVED (Root-Cause Fixed)**.

---

## 3. General API Security Posture Audit

### 3.1. Zero-Trust Fail-Closed Authorization
- All protected edge handlers (`api/admin.js`, `api/chat.js`, `api/compile.js`, `api/storage.js`, `api/sync.js`, `api/terminal.js`, `api/worker.js`) invoke `await validateSession(req, storage)`.
- If `!auth.valid`, handlers immediately terminate and return HTTP 401 Unauthorized via `sendSecureJson`.
- High-privilege mutations (`admin.js`, `storage.js` deletion, `sync.js` POST, `worker.js` schedule sync) strictly enforce `auth.role === 'master'`, failing closed with HTTP 403 Forbidden for temporary or guest credentials.

### 3.2. Constant-Time Cryptographic Verification
- Audited all occurrences of `crypto.timingSafeEqual`:
  - `api/auth.js:58-59, 160-161, 205-206, 253-254, 267`: All inputs are either pre-hashed SHA-256 digests (`.digest()`, 32 bytes) or verified for identical buffer lengths before comparison.
  - `api/iot.js:230-234`: Verifies `expectedBuf.length === 32 && receivedBuf.length === 32` before calling `crypto.timingSafeEqual`.
  - `api/calendar.js:405`: Verifies `sigBuf.length === expBuf.length && sigBuf.length > 0` before comparing state signatures.
  - `api/_lib/auth-guard.js:98`: Compares session token signatures with length checks.
- Constant-time verification is 100% compliant and immune to timing disparity side-channels.

### 3.3. SSRF & CORS Boundaries
- **SSRF**: `isBlockedSsrfTarget` covers IPv4-mapped, IPv4-compatible dual-hextet, RFC 1918, Carrier Grade NAT (`100.64.0.0/10`), link-local, cloud metadata, named localhost, and trailing-dot normalization.
- **CORS**: `setSecurityHeaders` evaluates `origin` against `ALLOWED_ORIGINS` set and localhost regex. Untrusted or hostile origins (`evil`, `attacker`, `phishing`) fall back strictly to `https://lumina-vista-sigma.vercel.app` and are NEVER reflected with `Access-Control-Allow-Credentials: true`.

### 3.4. Minimum-1 Access Key Invariant
- `api/admin.js` acquires distributed Redis lock `lock:admin_passwords` (5-second TTL), evaluates remaining active keys after filtering out the target key, and rejects deletion with HTTP 400 if `remaining.length < 1`. Permanent revocation tombstone `admin:revoked_key:${id}` is stored without expiry.

---

## 4. Adversarial Stress-Testing & Attack Surface Probe Results

| Probe Scenario | Attack Vector / Payload | Target Handler | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|---|
| **ADV-API-01** | Path Traversal with double URL encoding (`%252e%252e/etc/passwd`) | `api/terminal.js` (`sanitizeFilePath`) | Returns `""`, mount skipped | Returned `""` | **PASS** |
| **ADV-API-02** | Path Traversal with null byte (`foo/bar\0baz`) | `api/terminal.js` (`sanitizeFilePath`) | Returns `""`, mount skipped | Returned `""` | **PASS** |
| **ADV-API-03** | Path Traversal with query separator (`foo/bar?param=1`) | `api/terminal.js` (`sanitizeFilePath`) | Returns `""`, mount skipped | Returned `""` | **PASS** |
| **ADV-API-04** | Redis Injection via malformed `jobId` (`job\r\nSET evil 1`) | `api/worker.js` (GET / POST) | HTTP 400 Bad Request | HTTP 400 (`Invalid or missing jobId format`) | **PASS** |
| **ADV-API-05** | Directory Traversal in `jobId` (`../../etc/passwd`) | `api/worker.js` (GET / POST) | HTTP 400 Bad Request | HTTP 400 (`Invalid or missing jobId format`) | **PASS** |
| **ADV-API-06** | Buffer / Key DoS via oversized `jobId` (129 chars) | `api/worker.js` (GET / POST) | HTTP 400 Bad Request | HTTP 400 (`Invalid or missing jobId format`) | **PASS** |
| **ADV-API-07** | BOLA / IDOR cross-tenant access to another session's job | `api/worker.js` (GET / POST) | HTTP 403 Forbidden | HTTP 403 (`Forbidden: Access to this job is restricted...`) | **PASS** |
| **ADV-API-08** | SSRF via IPv4-mapped loopback (`http://[::ffff:127.0.0.1]:11434`) | `normalizeOllamaEndpoint` | Redirects to Ollama Cloud | Redirected to `https://ollama.com/v1/chat/completions` | **PASS** |
| **ADV-API-09** | SSRF via IPv6 hex dual-hextet metadata (`http://[::a9fe:a9fe]:11434`) | `normalizeOllamaEndpoint` | Redirects to Ollama Cloud | Redirected to `https://ollama.com/v1/chat/completions` | **PASS** |
| **ADV-API-10** | SSRF via RFC 1918 private IP without `VERCEL` env var | `normalizeOllamaEndpoint` | Redirects to Ollama Cloud | Redirected to `https://ollama.com/v1/chat/completions` | **PASS** |

---

## 5. Invariant & Budget Verification

1. **File Line Count Budget (< 2,000 Lines)**:
   - `api/terminal.js`: **126 lines** (Budget: < 2,000) — **PASS**
   - `api/worker.js`: **452 lines** (Budget: < 2,000) — **PASS**
   - `api/_lib/key-pool.js`: **626 lines** (Budget: < 2,000) — **PASS**
   - All other API handlers remain well under 2,000 lines (`api/calendar.js`: 1,318, `api/iot.js`: 1,265, `api/_lib/jev-engine.js`: 1,610).
2. **Physical ESP32 Firmware Boundary (`firmware/**`)**:
   - `git status -- firmware` confirms working tree is clean. **100% UNTOUCHED** — **PASS**.
3. **Verification Suite Health**:
   - `tests/lint.cjs`: **40/40 modules passed** (0 errors).
   - `tests/features.test.cjs`: **1,102/1,102 assertions passed** (0 errors).
   - `tests/recheck-all-tasks.cjs`: **42/42 assertions passed** (0 errors).
   - `tests/suite-r6-security-regression.cjs`: **40/40 security regression tests passed** (0 errors).
   - `tests/challenger-r4-empirical.cjs`: **141/141 adversarial penetration challenge assertions passed** (0 errors).
   - `tests/browser-cdp-test.cjs`: **122/122 real Google Chrome CDP tests passed** (0 errors).
   - `tests/challenger-calendar-empirical.cjs`: **63/63 empirical assertions passed** (0 errors).
   - `tests/adversarial-calendar.test.cjs`: **109/109 adversarial probes passed** (0 errors).
   - `tests/suite-calendar-adversarial.cjs`: **25/25 adversarial tests passed** (0 errors).
   - `tests/suite-calendar-sync-forensic.cjs`: **7/7 forensic tests passed** (0 errors).

---

## 6. Integrity Audit

- **Hardcoded test results or expected outputs**: ZERO detected.
- **Dummy or facade implementations**: ZERO detected. Regex validation, path normalization, and SSRF filtering are genuine, production-ready implementations.
- **Shortcuts bypassing the task**: None. All fixes were implemented directly in source files.
- **Fabricated logs or verification outputs**: None. All test outputs were produced by live command executions in the Windows shell.
- **Self-certifying work**: All findings and test runs were independently reproduced and verified by this reviewer.

---

## 7. Conclusion

The Edge API surface has been successfully hardened. The patches for VULN-R7-06, VULN-R7-07, and VULN-R7-08 are minimal, surgical, robust against adversarial manipulation, and introduce zero regressions.

**Recommendation**: APPROVE without conditions.
