# Code Changes — Worker 1 (Edge API Hardening Engineer)

## Overview
Worker 1 implemented surgical, defense-in-depth security hardening across 3 assigned Edge API serverless modules:
1. `api/terminal.js` (VULN-R7-06)
2. `api/worker.js` (VULN-R7-07)
3. `api/_lib/key-pool.js` (VULN-R7-08)

All changes adhere strictly to the minimal change principle, preserve existing functionality, pass all lint and security verification suites, and keep all files well under the 2,000 line ceiling.

---

## Detailed Modifications

### 1. `api/terminal.js` (VULN-R7-06)
- **Problem**: `api/terminal.js` defined a redundant, weaker local `sanitizeFilePath` implementation (lines 18-29) instead of utilizing the canonical, battle-tested `sanitizeFilePath` from `api/_lib/auth-guard.js`. The local implementation failed to handle recursive URL encoding, control characters, query parameters, and hash fragment injections.
- **Remediation**:
  - Removed unused `import path from 'path';`.
  - Added `sanitizeFilePath` to the imports from `./_lib/auth-guard.js`.
  - Removed local `sanitizeFilePath` function definition entirely.
  - Retained invocation `const safeName = sanitizeFilePath(file.name)` in sandbox file writing loop.
- **Line Count**: 126 lines (Limit: < 2,000).

### 2. `api/worker.js` (VULN-R7-07)
- **Problem**: Missing format validation on untrusted `jobId` parameters in GET and POST requests before interpolating into Upstash Redis / SafeStorage key patterns `job_state:${jobId}`. An attacker could potentially supply malicious characters, path separators, or overly long strings to manipulate key boundaries or degrade storage performance.
- **Remediation**:
  - Defined strict validation regex:
    ```javascript
    const VALID_JOB_ID = /^[a-zA-Z0-9_\-]{1,128}$/;
    ```
  - In GET handler (`action === 'status' || action === 'output' || jobId`):
    Enforced strict type and regex check returning HTTP 400 `{ error: 'Invalid or missing jobId format' }` for missing or non-matching IDs before reading `storage.get(\`job_state:\${jobId}\`)`.
  - In POST handler:
    Enforced strict validation on `jobId` in `action === 'status'`, `action === 'output'`, and job dispatch handlers returning HTTP 400 `{ error: 'Invalid or missing jobId format' }` before performing Redis operations.
  - In `run_due_schedules`:
    Sanitized `task.id` using `String(task.id || 'task').replace(/[^a-zA-Z0-9_\-]/g, '')` before constructing `autoJobId`.
  - In `executeAutonomousCloudTask`:
    Added defense-in-depth validation throwing if `jobId` does not strictly conform to `VALID_JOB_ID`.
- **Line Count**: 452 lines (Limit: < 2,000).

### 3. `api/_lib/key-pool.js` (VULN-R7-08)
- **Problem**: In `normalizeOllamaEndpoint`, SSRF target filtering was conditionally gated on `process.env.VERCEL`:
  ```javascript
  if (process.env.VERCEL && isBlockedSsrfTarget(ep))
  ```
  In local development, self-hosted Docker, or non-Vercel edge environments where `VERCEL` is unset, user-controlled endpoints targeting private RFC1918 subnets, loopbacks (`127.0.0.1`, `localhost`), or link-local IPs would not be redirected to the secure Ollama Cloud fallback.
- **Remediation**:
  - Removed `process.env.VERCEL &&` condition, transforming the check to:
    ```javascript
    if (isBlockedSsrfTarget(ep)) {
      return 'https://ollama.com/v1/chat/completions';
    }
    ```
  - This guarantees SSRF target blocking is unconditional across all environments.
- **Line Count**: 626 lines (Limit: < 2,000).
