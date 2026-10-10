# Execution Plan — Round 2 Defensive Security Hardening & Audit

## Step 1: Initialization & Heartbeat
- Initialize `plan.md`, `progress.md`, `BRIEFING.md`, `DISPATCH.md`.
- Register recurring heartbeat cron (`schedule(CronExpression="*/10 * * * *")`).

## Step 2: Multi-Surface Deep Adversarial Exploration
- Spawn 3 parallel senior Explorers (`teamwork_preview_explorer`):
  - **Explorer 1 (Surface 1 & 2)**: Serverless Edge APIs & Zero-Trust Auth (`api/*.js`, `api/_lib/*.js`, `api/admin.js`, `api/auth.js`, `modules/admin-access.js`).
    - Focus: Authorization bypass, timing attacks, prototype pollution, SSRF, injection, min-1 access key invariant, sovereign token revocation.
  - **Explorer 2 (Surface 3 & 5)**: IoT Gateway & Multi-Device Cloud Sync (`api/iot.js`, `modules/cloud-sync.js`, `api/sync.js`).
    - Focus: 5-layer HMAC validation, monotonic sequence checking, replay nonce cache bounding, command TTLs, non-destructive hydration, background tab hijacking.
  - **Explorer 3 (Surface 4)**: Client Sandboxes & VFS (`modules/codespace.js`, `modules/compiler.js`, `dashboard.html`, `modules/ai-studio.js`, `api/terminal.js`, `api/compile.js`).
    - Focus: iframe sandbox attributes, allow-same-origin risks, DOM XSS, command injection in compiler/terminal, prototype pollution in VFS.

## Step 3: Synthesis & Remediation Strategy
- Read and synthesize reports from all 3 Explorers.
- Determine if any vulnerabilities, weaknesses, or defense-in-depth gaps exist in current codebase.
- Formulate concrete file modifications and assign strict write boundaries.

## Step 4: Targeted Defensive Hardening & Adversarial Probing (if changes needed)
- Dispatch Worker (`teamwork_preview_worker`) with Explorer findings, write ownership rules, and mandatory integrity warning.
- Dispatch Challenger (`teamwork_preview_challenger`) to stress-test edge cases, bypasses, or fail-open fallbacks.
- Worker executes all test suites (`lint.cjs`, `recheck-all-tasks.cjs`, `features.test.cjs`, `browser-cdp-test.cjs`).

## Step 5: Convene Ultra-Senior Review Committee
- Require unanimous approval across all 4 committee members:
  1. Principal Security Architect Reviewer (`teamwork_preview_reviewer`)
  2. Cryptographic & IoT Gateway Specialist (`teamwork_preview_critic`)
  3. Adversarial Penetration Challenger (`teamwork_preview_challenger`)
  4. Forensic Integrity Auditor (`teamwork_preview_auditor`)
- Record gate verdicts in `GATE_STATUS.md`.

## Step 6: Full Verification & Release Packaging
- Verify file line budgets: all files strictly $< 2,000$ lines.
- Verify `firmware/**` untouched.
- Verify test suites untampered.
- Worker executes git commit amend: `git commit --amend --no-edit && git push --force origin main`.

## Step 7: Final Completion Handover
- Send structured completion report to Sentinel (`c552cf0a-bf68-4280-b727-faaa7aa654e4`) to trigger the independent Victory Auditor.
