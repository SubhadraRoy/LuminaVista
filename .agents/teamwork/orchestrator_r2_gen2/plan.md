# Execution Plan — Orchestrator Round 2 Generation 2

## Context & Baseline
- Phase 1 (Adversarial Exploration of all 5 Surfaces) is ALREADY COMPLETED:
  - Surface 1 & 2: `explorer_r2_1/handoff.md` documented 6 vulnerabilities needing remediation:
    1. Residual fallback secrets (`api/admin.js`, `api/_lib/auth-guard.js`, `api/calendar.js`, `api/iot.js`).
    2. CORS wildcard suffix reflection (`api/_lib/auth-guard.js`, `api/calendar.js`).
    3. `vercel.json` conflicting wildcard CORS headers.
    4. Fail-open session revocation during storage errors in `api/_lib/auth-guard.js` and missing revocation key in `api/logout.js`.
    5. Upstream path traversal via URL-encoding in `api/storage.js`.
    6. Cloud metadata / private RFC 1918 SSRF via `customEndpoint` in `api/chat.js`.
  - Surface 3 & 5: `explorer_r2_2/handoff.md` (10/10 checks verified clean, watertight).
  - Surface 4: `explorer_r2_3/analysis.md` (all sandbox boundaries watertight).

## Steps:
1. Dispatch Worker R2-2 (`teamwork_preview_worker`) with sequential remediation tasks targeting the 6 confirmed vulnerabilities and strict verification against all 4 test suites.
2. Dispatch Challenger (`teamwork_preview_challenger`) to stress-test the patched files for bypasses.
3. Convene Ultra-Senior Review Committee:
   - Principal Security Architect Reviewer
   - Cryptographic & IoT Gateway Specialist
   - Adversarial Penetration Challenger
   - Forensic Integrity Auditor
   Require unanimous approval across all 4 committee members.
4. Execute full verification suite:
   - `node tests/lint.cjs` (40 modules)
   - `node tests/recheck-all-tasks.cjs` (42 assertions)
   - `node tests/features.test.cjs` (1,102 assertions)
   - `node tests/browser-cdp-test.cjs` (122 tests)
5. Clean commit amend: `git commit --amend --no-edit && git push --force origin main`.
6. Deliver completion report to Sentinel for independent Victory Audit.
