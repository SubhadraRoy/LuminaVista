# Dispatch Instructions for Orchestrator R6

## Mission
Execute a comprehensive, multi-stage defensive security audit and automated remediation workflow across LuminaVista OS under /goal mode. Specialized sub-agents will audit authentication & access control, input & injection security, infrastructure/secrets/dependencies, and business logic & concurrency, triage and implement minimal, surgical production-safe fixes with automated tests, and iterate through an adversarial verification loop until an independent panel of Principal Application Security Reviewer sub-agents reaches unanimous consensus that zero Critical, High, or Medium vulnerabilities remain and all tests pass with zero regressions.

## Original User Request
Refer to `c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md` under `## Follow-up — 2026-10-17T05:33:54Z`.

## Working Directory
`c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r6`

## Repository Root
`c:/Users/roysu/LuminaVista`

## 2026-10-17T05:35:34Z
Sender: 9fe7e8d4-a8b7-4e6b-afe0-1ee7111f9531
Content:
You are the Project Orchestrator for Round 6 of the LuminaVista security audit and remediation workflow.
Your working directory is: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r6
The repository root is: c:/Users/roysu/LuminaVista
The authoritative user request is recorded in: c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md under ## Follow-up — 2026-10-17T05:33:54Z

Key Requirements & Directives:
1. Parallel Audit Phase (Specialist Sub-Agents):
   Deploy 4 specialized exploratory sub-agents across the entire repository:
   - Agent 1 (Auth & Access Control): Audit authentication flows, sovereign session management, zero-trust RBAC/ABAC, BOLA/IDOR in edge routes, credential revocation tombstones, and privilege escalation vectors.
   - Agent 2 (Input & Injection Security): Audit all data ingestion points for SQLi, XSS, SSRF (including IPv6 and cloud metadata bypasses), CLI/command injection, prototype pollution, insecure deserialization, and path traversal in VFS artifacts.
   - Agent 3 (Infrastructure, Secrets & Dependencies): Scan for hardcoded API keys or master passwords, insecure environment fallbacks, CORS origin reflection boundaries, strict CSP meta tags, Subresource Integrity (SRI) on CDN assets, and vulnerable dependencies.
   - Agent 4 (Business Logic & Concurrency): Audit race conditions in session locks, rate-limiting bypasses, monotonic sequence counters on the IoT Smart Lock gateway, unhandled Promise rejections, and error states that leak internal stack traces or paths.

2. Triage & Surgical Remediation Phase:
   - Consolidate all audit findings into a prioritized vulnerability ledger (Critical, High, Medium, Low).
   - Implement minimal, surgical, production-safe defensive fixes for every Critical, High, and Medium issue directly in the target codebase files.
   - Enforce strict input validation, type guards, constant-time cryptographic comparisons (crypto.timingSafeEqual), and fail-closed edge authorization semantics.
   - Write automated regression tests for each patched vulnerability to guarantee continuous regression protection.
   - Do NOT generate offensive exploit scripts, weaponized payloads, or malicious proof-of-concept exploits in the repository.

3. Adversarial Verification Loop & Principal AppSec Panel Consensus:
   - Re-audit all modified files and run the full automated verification test suite to ensure no regressions or secondary vulnerabilities were introduced.
   - Convene an independent review panel of Principal Application Security Reviewer sub-agents to evaluate the codebase against:
     a) Complete resolution of all Critical, High, and Medium vulnerabilities.
     b) 100% automated test coverage for all security patches.
     c) Clean builds and zero functional regressions across all client and serverless features.
   - Require unanimous panel consensus before reporting project completion to the Sentinel.

4. Preservation of Invariants & Budget Constraints:
   - File Length Ceiling: Every file in the repository must strictly contain fewer than 2,000 lines.
   - Hardware Boundary: Physical ESP32 firmware files (firmware/**) must remain 100% untouched.
   - Test Integrity: Existing verification suites (tests/**) must remain active with zero regressions:
     * node tests/features.test.cjs (1,102 assertions)
     * node tests/browser-cdp-test.cjs (122 Google Chrome CDP tests)
     * node tests/recheck-all-tasks.cjs (42 assertions)
     * node tests/lint.cjs (40 JS modules)
     * node tests/challenger-calendar-empirical.cjs (63 assertions)
     * node tests/challenger-r4-empirical.cjs (141 assertions)
     * node tests/adversarial-calendar.test.cjs (109 probes)
     * node tests/suite-calendar-adversarial.cjs (25 tests)
   - Clean Repository: Final working tree must be committed and pushed to origin/main.

Maintain your BRIEFING.md, plan.md, and progress.md in your working directory (c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r6).
When all requirements are fulfilled and unanimous panel consensus is achieved, submit your final handoff report (handoff.md) and notify the Sentinel.
