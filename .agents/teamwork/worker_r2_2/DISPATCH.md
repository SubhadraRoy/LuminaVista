## 2026-10-16T19:38:26Z

You are Worker R2-2 (Security Auto-Remediation Specialist).
Your working directory is: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r2_2

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY READING:
First, read these authoritative documents before doing any work:
- c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r2_1\handoff.md

PROJECT ROOT: c:\Users\roysu\LuminaVista

OBJECTIVE:
Formulate and implement targeted defensive remediations for the 6 confirmed vulnerabilities from explorer_r2_1/handoff.md, and verify that 100% of all test suites pass with zero regressions.

CRITICAL INVARIANTS:
1. NEVER modify any files in `firmware/**`.
2. NEVER modify any files in `tests/**`.
3. ALL modified files must strictly remain under 2,000 lines. Check line counts after modifying.
4. Fail-closed security: do NOT introduce any fail-open fallbacks.

THE 6 TARGET VULNERABILITIES TO REMEDIATE:
1. Target 1 - Residual Fallback Secrets:
   - `api/admin.js:45, 109`: Remove `'lumina_root_secret'` fallback. Fail closed if `process.env.ADMIN_PASSWORD` is missing, consistent with `api/auth.js`.
   - `api/_lib/auth-guard.js:34`: Remove `'lumina_root_secret'` fallback. Ensure fail closed if secret is missing.
   - `api/calendar.js:57, 158`: Remove `'lumina_calendar_oauth_secret'` fallback.
   - `api/iot.js:22`: Review static fallback hex secret. Ensure production/Vercel environments require explicit secret or fail closed.
   (Verify that all tests in `tests/features.test.cjs` still pass — if tests set up mock env or pass secrets, make sure your changes integrate cleanly with test mocks).

2. Target 2 - CORS Origin Wildcard Suffix Reflection:
   - `api/_lib/auth-guard.js:403-413` & `api/calendar.js:22-31`:
     Do NOT reflect arbitrary attacker domains matching `.endsWith('.github.io')` or `.endsWith('.vercel.app')` when `Access-Control-Allow-Credentials` is true. Whitelist only legitimate origins (e.g. `https://lumina-vista-sigma.vercel.app`, exact `ALLOWED_ORIGINS`, localhost/127.0.0.1, or specific project subdomains).
   - `vercel.json:19-24`:
     Fix conflicting wildcard origin (`"Access-Control-Allow-Origin": "*"`) paired with `"Access-Control-Allow-Credentials": "true"`.

3. Target 3 - Fail-Open Session Revocation:
   - `api/_lib/auth-guard.js:129-143`:
     When Redis encounters an error or network failure during session lookup, fail closed (`return { valid: false, error: 'Session verification failed (storage unavailable)' }`) instead of granting valid access.
   - `api/logout.js:15`:
     Also record `redis.set('session:revoked:' + sid, '1', 'EX', 86400)` or equivalent with TTL upon logout, in addition to deleting `session:${sid}`.

4. Target 4 - Upstream Path Traversal in Storage API:
   - `api/storage.js:15-27`:
     In `sanitizeFilePath`, perform URL decoding (e.g. `decodeURIComponent`) before posix normalization and traversal checking (`cleanPath.includes('..')`, `.startsWith('.')`, etc.) so that encoded payloads like `%2e%2e%2f` are decoded and strictly rejected.

5. Target 5 - Cloud Metadata & Private RFC 1918 SSRF via customEndpoint:
   - `api/chat.js:418-423` & `api/_lib/key-pool.js:246`:
     In `normalizeOllamaEndpoint` or endpoint validation, strictly block requests targeting cloud metadata IPs (`169.254.169.254`, `metadata.google.internal`), loopback addresses (`127.0.0.0/8`, `localhost`), and private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fe80::/10`, `::1`).

6. Target 6 - Prototype Pollution in VFS Handlers:
   - `api/worker.js:287` & `api/chat.js:607`:
     Screen VFS keys against prototype pollution (`__proto__`, `constructor`, `prototype`) or use null-prototype dictionaries (`Object.create(null)`).

EXECUTION & VERIFICATION PROTOCOL:
1. Run pre-implementation baseline verification:
   - `node tests/lint.cjs`
   - `node tests/recheck-all-tasks.cjs`
   - `node tests/features.test.cjs`
   - `node tests/browser-cdp-test.cjs`
2. Formulate and apply clean, targeted patches to each file.
3. Check line counts of all touched files to verify they are strictly < 2,000 lines.
4. Run all 4 test suites again:
   - `node tests/lint.cjs` (must pass 40 modules)
   - `node tests/recheck-all-tasks.cjs` (must pass 42 assertions)
   - `node tests/features.test.cjs` (must pass 1,102 assertions)
   - `node tests/browser-cdp-test.cjs` (must pass 122 tests)
5. Verify `git status` shows NO modifications to `tests/**` or `firmware/**`.
6. Write a comprehensive, self-contained handoff report to:
   `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r2_2\handoff.md`
   Format: Observation, Logic Chain, Changes Made, Test Results, Caveats, Conclusion.
7. Send a message to your orchestrator when complete with the path to your handoff report.
