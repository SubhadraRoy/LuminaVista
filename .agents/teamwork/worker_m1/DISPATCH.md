## 2026-10-16T16:28:47Z
You are Worker M1 (Zero-Trust Auth & Sovereign Session Keys Remediation).
Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m1
Original request path: c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
Project plan path: c:\Users\roysu\LuminaVista\.agents\teamwork\PROJECT.md
Survey findings:
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_2\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_1\handoff.md

FILE WRITE OWNERSHIP:
You EXCLUSIVELY own:
- `api/auth.js`
- `api/admin.js`
- `api/_lib/auth-guard.js`
- `modules/admin-access.js`
Do NOT modify any files outside this exclusive list.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVE:
Implement defensive mitigations for Milestone 1:
1. Remove Hardcoded Root Secret (VULN-AUTH-1):
   In `api/auth.js:218`, ensure `'lumina_root_secret'` is NOT included in candidate signing secrets when an authentic master secret (`expectedPassword` / `process.env.ADMIN_PASSWORD`) is configured.
2. Fix Sovereign Session Revocation Gap (VULN-AUTH-2):
   In `api/_lib/auth-guard.js`, update `validateSession` so that sovereign session tokens (`sessionId.startsWith('lv_')`) verify revocation status in Redis when Redis is available (e.g. check if `session:${sessionId}` exists or if revoked marker exists) while maintaining resilience/cold-start fallback without breaking valid sessions.
3. Eliminate Timing Side-Channels (VULN-AUTH-3):
   In `api/auth.js`, replace variable-time string comparisons (`===`) at lines 50-54, 187, and 229 with constant-time cryptographic comparisons (`crypto.timingSafeEqual`) on fixed-length buffers.
4. Enforce Minimum-1 Access Key Invariant (VULN-AUTH-4):
   In `api/admin.js:161`, ensure the invariant check validates that remaining access keys count `remaining.length < 1` post-filtering, guaranteeing that duplicate key IDs or concurrent operations cannot delete the last active access key. Preserve support for accepted temporary admin key privileges as required by `tests/recheck-all-tasks.cjs`.
5. Invariants & Verification:
   - All modified files MUST remain strictly under 2,000 lines.
   - NEVER modify `firmware/**`.
   - Run the full verification suites:
     * `node tests/lint.cjs` (All 40 modules must pass)
     * `node tests/features.test.cjs` (All 1,102 assertions must pass)
     * `node tests/recheck-all-tasks.cjs` (All 42 assertions must pass)
     * `node tests/browser-cdp-test.cjs` (All 122 tests must pass)
   - Keep `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m1\progress.md` updated.
   - Write your complete handoff report to `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m1\handoff.md`.
   - Notify parent via `send_message` with your results.
