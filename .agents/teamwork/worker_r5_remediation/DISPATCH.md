## 2026-10-17T04:48:08Z
You are worker_r5_remediation, the Lead Defensive Remediation Worker for LuminaVista OS.
Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r5_remediation

MANDATORY FIRST STEPS:
1. Read c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md.
2. Read the 4 comprehensive audit reports produced by our exploratory subagents:
   - c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r5_sast\handoff.md
   - c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r5_dast\handoff.md
   - c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r5_supply\handoff.md
   - c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r5_secrets\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

INVARIANTS & CONSTRAINTS:
- Every file in the repository must strictly contain < 2,000 lines. Check line lengths before and after editing.
- Hardware physical firmware (`firmware/**`) must remain 100% untouched.
- Do NOT generate weaponized exploit scripts or offensive payloads.
- All 8 verification suites must pass with 0 failures:
  1. node tests/lint.cjs (40 JS modules)
  2. node tests/recheck-all-tasks.cjs (42 assertions)
  3. node tests/challenger-calendar-empirical.cjs (63 assertions)
  4. node tests/challenger-r4-empirical.cjs (141 assertions)
  5. node tests/adversarial-calendar.test.cjs (109 probes)
  6. node tests/suite-calendar-adversarial.cjs (25 tests)
  7. node tests/features.test.cjs (1,102 assertions)
  8. node tests/browser-cdp-test.cjs (122 Google Chrome CDP tests)

Your Remediation Assignment:
Implement the synthesized defensive mitigations across target files:
1. `api/_lib/key-pool.js`:
   - Fix IPv4-compatible IPv6 SSRF bypasses (`::127.0.0.1`, `::169.254.169.254`, `::7f00:1`, `::a9fe:a9fe`, `::0a00:1`, `::c0a8:1`). Ensure `isBlockedSsrfTarget` blocks them.
2. `api/worker.js`:
   - BOLA fix: Enforce that `jobId` access verifies job ownership (`job.ownerSessionId === auth.sessionId || (auth.role === 'master' && job.ownerRole === 'master')`).
   - Use authenticated `auth.sessionId` for `check_completed` / `pending` job lookups.
   - Screen model `[TOOL:EXEC]` directives with `inspectJevCommandSafety(cmd)`.
   - Sanitize VFS filenames with `sanitizeFilePath` before `sbx.files.write`.
   - Enforce `enforcePayloadLimit(req, 250000)`.
3. `api/admin.js`:
   - Enforce master role on admin credential management (`if (session.role !== 'master') return sendSecureJson(res, 403, ...)`).
   - In `action === 'delete'`, record revocation tombstone: `await storage.set('admin:revoked_key:' + id, String(Date.now()), { ex: 86400 * 90 });`.
   - Enforce `enforcePayloadLimit(req, 100000)`.
4. `api/auth.js`:
   - In `verifyCredentials`, check `admin:revoked_key:${matchedClientKey.id}` before re-hydrating or authenticating deleted keys.
   - Line 127: Wrap catch block in `sanitizeError(error, 'Authentication engine failure.')`.
   - Set `godx_session` cookie with `partitioned: isCrossSite || isHttps`.
5. `api/calendar.js`:
   - In `handleSync`, if client lacks `gcal_token` cookie and falls back to Redis `gcal:master_tokens`, require valid authenticated session (`validateSession(req, storage)`).
   - Scrub error logging (`sanitizeDeep(tokenData)` and `scrubSecrets(errText)`).
   - Wrap top-level handler in `try/catch`.
6. `api/chat.js`:
   - Screen `[TOOL:EXEC]` commands with `inspectJevCommandSafety(cmd)`.
   - Sanitize VFS filenames with `sanitizeFilePath` before `sbx.files.write`.
   - Wrap top-level handler in `try/catch`.
7. `api/compile.js`:
   - Check `Object.prototype.hasOwnProperty.call(RUNNERS, langKey)` to prevent prototype shadowing.
   - Wrap in top-level `try/catch`.
8. `api/terminal.js`:
   - Wrap in top-level `try/catch`.
9. `api/logout.js`:
   - Enforce `req.method === 'POST'`.
   - Mirror `sameSite` and `partitioned` flags, and clear both `godx_session` and `gcal_token`.
10. `api/iot.js`:
    - Align hardware push rate limiting from 300 to 60 req/60s.
    - Call `checkRateLimit(req, storage, 'iot', 60, 60)`.
11. `api/_lib/auth-guard.js`:
    - In `setSecurityHeaders`: set `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`.
    - In `sanitizeError`: enhance file path scrubbing for Windows and POSIX absolute paths.
12. `api/_lib/redis.js`:
    - Wrap error `msg` in `scrubSecrets(msg)`.
13. `package.json`:
    - Bump `"cookie": "^0.6.0"` to `"cookie": "^0.7.0"`.
14. `dashboard.html`:
    - Line 7: Enforce strict whitelist CSP `<meta>`.
    - Line 15: Pin Tailwind to `https://cdn.tailwindcss.com/3.4.15` with `integrity="sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN"` and `crossorigin="anonymous"`.
    - Line 28: Pin Lucide to `https://unpkg.com/lucide@1.58.0/dist/umd/lucide.min.js` with `integrity="sha384-ZemqnyvuKtPJISxDW78AAL1B4QhqxJ0SeEj42qO/4SLmpu+yFCcErD98G2F5vov3"` and `crossorigin="anonymous"`.
    - Line 29: Add GSAP SRI `integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt"` and `crossorigin="anonymous"`.
15. `index.html` & `404.html`:
    - Update Tailwind and GSAP CDN script tags with pinned versions and SRI hashes.
16. `modules/state.js`:
    - Wrap startup `JSON.parse` calls in safe `try/catch` helper.
17. `modules/cloud-sync.js` & `modules/ai-tasks-sessions.js`:
    - Wrap unguarded `JSON.parse` in `cloud-sync.js:156` and `ai-tasks-sessions.js:56` in `try/catch`.
