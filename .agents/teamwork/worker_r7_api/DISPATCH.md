## 2026-10-17T08:31:47Z
You are Worker 1 (Edge API Hardening Engineer) of the Remediation Team for Round 7 of the LuminaVista security review.
Your working directory is: c:/Users/roysu/LuminaVista/.agents/teamwork/worker_r7_api
Parent orchestrator conversation ID: 847b0db7-3b35-4e6b-8b9d-7ed3e8274c3a

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEPS:
1. Read the authoritative user request at: c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md (specifically ## Follow-up — 2026-10-17T08:13:40Z).
2. Read dispatch instructions at: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7/DISPATCH.md.
3. Read the taint analysis ledger at: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7/TAINT_ANALYSIS.md.

YOUR EXCLUSIVE WRITE OWNERSHIP:
You own and may ONLY edit these 3 files:
1. `api/terminal.js`
2. `api/worker.js`
3. `api/_lib/key-pool.js`
DO NOT edit any other files. DO NOT touch firmware/**.

TASKS TO IMPLEMENT:
1. In `api/terminal.js`:
   - Remove the local, weaker `sanitizeFilePath` function (lines ~18-29).
   - Import canonical `sanitizeFilePath` from `./_lib/auth-guard.js`.
   - Ensure `sanitizeFilePath(targetPath)` is invoked on incoming path parameters as before.
2. In `api/worker.js`:
   - Enforce strict format regex on incoming `jobId` in GET and POST handlers:
     `const VALID_JOB_ID = /^[a-zA-Z0-9_\-]{1,128}$/;`
     `if (!jobId || typeof jobId !== 'string' || !VALID_JOB_ID.test(jobId)) { return sendSecureJson(res, 400, { error: 'Invalid or missing jobId format' }, req); }`
     Apply this check in `action === 'status'` / `action === 'output'` and wherever `jobId` is read before interpolating into `job_state:${jobId}`.
3. In `api/_lib/key-pool.js`:
   - In `normalizeOllamaEndpoint` (around line 361), change:
     `if (process.env.VERCEL && isBlockedSsrfTarget(ep))`
     to:
     `if (isBlockedSsrfTarget(ep))`
     so that SSRF target blocking is unconditional across all environments.
4. VERIFICATION:
   - Run `node tests/lint.cjs` and verify all 40 modules pass.
   - Run `node tests/suite-r6-security-regression.cjs` and verify 40/40 pass.
   - Verify all modified files remain strictly < 2,000 lines.
5. REPORTING:
   - Write `changes.md` and `handoff.md` in `c:/Users/roysu/LuminaVista/.agents/teamwork/worker_r7_api/`.
   - Notify parent orchestrator via `send_message` (Recipient="847b0db7-3b35-4e6b-8b9d-7ed3e8274c3a") when done.
