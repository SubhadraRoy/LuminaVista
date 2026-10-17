# Round 7 Security Review and Hardening Plan

## Objective
Execute a comprehensive defensive security review, taint analysis, and defense-in-depth hardening across LuminaVista OS, adhering to all invariants (<2,000 lines, firmware untouched, no offensive payloads) and achieving 100% pass rate across 10 automated verification suites (1,691 assertions).

## Team Topology & Milestones

### Milestone 1: Discovery Team (Taint Analysis & Attack Surface Mapping)
- **Explorer 1 (Edge API Routes & Sinks)**:
  - Working dir: `.agents/teamwork/explorer_r7_api`
  - Targets: `api/admin.js`, `api/auth.js`, `api/calendar.js`, `api/chat.js`, `api/iot.js`, `api/sync.js`, `api/token.js`, `api/_lib/*`
  - Scope: Taint tracking from headers, query params, body, cookies to Redis, filesystem, outbound HTTP (SSRF), shell, and CORS headers.
- **Explorer 2 (Client Sandbox & DOM XSS / Prototype Pollution)**:
  - Working dir: `.agents/teamwork/explorer_r7_client`
  - Targets: `modules/codespace.js`, `modules/compiler.js`, `modules/ai-studio.js`, `dashboard.html`
  - Scope: Untrusted LLM outputs, VFS files, markdown previews to DOM sinks (`innerHTML`, `eval`, `Function`, `iframe.srcdoc`). Object merging/cloning prototype pollution.
- **Explorer 3 (Cryptographic & IoT Hardware Gateway Integrity)**:
  - Working dir: `.agents/teamwork/explorer_r7_cryptoiot`
  - Targets: `api/iot.js`, `api/auth.js`, `api/admin.js`, `modules/admin-access.js`
  - Scope: HMAC-SHA256 verification, monotonic sequence counter, replay nonce deduplication, command TTLs, minimum-1 access key rule, constant-time `crypto.timingSafeEqual`.
- **Output**: Consolidated, deduplicated vulnerability ledger and taint map in `.agents/teamwork/orchestrator_r7/TAINT_ANALYSIS.md`.

### Milestone 2: Remediation Team (Defense-in-Depth Refactoring)
- **Worker 1 (Edge API & Backend Hardening)**:
  - Working dir: `.agents/teamwork/worker_r7_api`
  - Implement defense-in-depth fixes for all confirmed API vulnerabilities.
  - Strict schema validation, constant-time comparisons, SSRF blocklists, CORS reflection prevention.
- **Worker 2 (Client Sandbox & DOM Hardening)**:
  - Working dir: `.agents/teamwork/worker_r7_client`
  - Implement client sandbox protections, DOM sanitization, prototype pollution guards.
- **Worker 3 / Test Execution (Automated Test Verification)**:
  - Working dir: `.agents/teamwork/worker_r7_verify`
  - Execute and verify all 10 test suites (1,691 assertions):
    1. `node tests/features.test.cjs` (1,102 assertions)
    2. `node tests/browser-cdp-test.cjs` (122 assertions)
    3. `node tests/recheck-all-tasks.cjs` (42 assertions)
    4. `node tests/lint.cjs` (40 modules)
    5. `node tests/suite-calendar-sync-forensic.cjs` (7 tests)
    6. `node tests/challenger-calendar-empirical.cjs` (63 assertions)
    7. `node tests/challenger-r4-empirical.cjs` (141 assertions)
    8. `node tests/adversarial-calendar.test.cjs` (109 probes)
    9. `node tests/suite-calendar-adversarial.cjs` (25 tests)
    10. `node tests/suite-r6-security-regression.cjs` (40 tests)

### Milestone 3: Review Board (Principal Security Architect Independent Review & Forensic Audit)
- **Reviewer 1 (Principal AppSec Architect - APIs & Auth)**:
  - Working dir: `.agents/teamwork/reviewer_r7_api`
  - Verify edge APIs, authorization, SSRF, CORS, session tokens.
- **Reviewer 2 (Principal AppSec Architect - Client & DOM)**:
  - Working dir: `.agents/teamwork/reviewer_r7_client`
  - Verify client sandboxing, prototype pollution, DOM XSS prevention.
- **Challenger 1 (Adversarial Penetration Challenger)**:
  - Working dir: `.agents/teamwork/challenger_r7_adv`
  - Probing edge-case bypasses, fail-open fallbacks, and boundary conditions.
- **Challenger 2 (Quality & Empirical Challenger)**:
  - Working dir: `.agents/teamwork/challenger_r7_empirical`
  - Empirical verification of all 10 automated test suites.
- **Forensic Auditor (`teamwork_preview_auditor`)**:
  - Working dir: `.agents/teamwork/auditor_r7_forensic`
  - Forensic integrity verification against hardcoded mocks, facade implementations, and test bypasses.

### Milestone 4: Final Sign-off & Handoff
- Synthesize all findings and reviews.
- Verify file length constraints (<2,000 lines).
- Verify ESP32 firmware immutability (`firmware/**`).
- Write `handoff.md` and report to Sentinel.
