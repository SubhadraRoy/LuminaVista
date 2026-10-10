## 2026-10-16T20:24:27Z
You are Worker R2-Final (Release, Final Verification & Commit Specialist).
Your working directory is: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r2_final

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY READING:
First, read these authoritative documents before doing any work:
- c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\orchestrator_r2_gen2\GATE_STATUS.md

PROJECT ROOT: c:\Users\roysu\LuminaVista

OBJECTIVE:
Execute Phase 5: Final Verification Suite Execution and Single Root Commit Amend & Force Push:
1. Verify Invariants:
   - Run `git status` to verify `firmware/**` and `tests/**` have 0 modifications.
   - Verify every file in the repository remains strictly < 2,000 lines.
2. Run all 4 official verification test suites:
   - `node tests/lint.cjs` (must pass 40/40)
   - `node tests/recheck-all-tasks.cjs` (must pass 42/42)
   - `node tests/features.test.cjs` (must pass 1,102/1,102)
   - `node tests/browser-cdp-test.cjs` (must pass 122/122 in Google Chrome)
3. Stage and Amend Commit:
   - Stage the modified files (`api/`, `vercel.json` and any related root files, leaving `.agents/teamwork` untracked if not tracked or keeping git status clean).
   - Execute single root commit amend:
     `git commit --amend --no-edit`
   - Force push to origin main:
     `git push --force origin main`
   - Verify `git log -n 1` and `git status`.
4. Output:
   - Write comprehensive handoff report to `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r2_final\handoff.md`.
   - Send completion message to parent orchestrator with the commit hash and test verification results.
