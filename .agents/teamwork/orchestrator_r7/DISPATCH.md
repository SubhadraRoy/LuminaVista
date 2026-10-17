# Dispatch Instructions for Orchestrator R7

## Mission
Launch a full-scale defensive security review and hardening cycle across LuminaVista OS. Deploy a swarm of specialized sub-agents divided into three teams:
- DISCOVERY TEAM (Static & Dynamic Code Auditors): Perform deep taint analysis from all untrusted user inputs to sensitive sinks (database, filesystem, external APIs, rendering engines). Map out trust boundaries and flag any missing validation, sanitization, or authorization checks.
- REMEDIATION TEAM (Staff Security Engineers): Refactor vulnerable code paths using defense-in-depth principles (parameterized queries, strict schema validation, least-privilege access, secure cryptographic defaults). Do not use band-aid workarounds.
- REVIEW BOARD (Principal Security Architects): Independently review every code diff produced by the Remediation Team. Reject any patch that lacks test coverage, degrades performance, breaks backward compatibility, or fails to address the root cause.

## Original User Request
Refer to `c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md` under `## Follow-up — 2026-10-17T08:13:40Z`.

## Working Directory
`c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7`

## Repository Root
`c:/Users/roysu/LuminaVista`

## Verification Resources (10 Automated Test Suites - 1,691 Assertions)
- Unit Test Suite: `node tests/features.test.cjs` (1,102 assertions)
- Browser CDP Test Suite: `node tests/browser-cdp-test.cjs` (122 Google Chrome CDP tests)
- 5-Point Architecture Audit: `node tests/recheck-all-tasks.cjs` (42 assertions)
- Syntax Linter: `node tests/lint.cjs` (40 JS modules)
- Forensic Calendar Token & Sync Lifecycle: `node tests/suite-calendar-sync-forensic.cjs` (7 tests)
- Challenger Calendar Empirical Suite: `node tests/challenger-calendar-empirical.cjs` (63 assertions)
- Adversarial Penetration Challenge (R4): `node tests/challenger-r4-empirical.cjs` (141 assertions)
- Adversarial Calendar Controller Harness: `node tests/adversarial-calendar.test.cjs` (109 probes)
- Adversarial Calendar Probe: `node tests/suite-calendar-adversarial.cjs` (25 tests)
- Security Regression Suite (R6): `node tests/suite-r6-security-regression.cjs` (40 tests)

## Directives & Execution Protocol

### 1. Discovery Team (Deep Taint Analysis & Surface Mapping)
Conduct end-to-end taint tracking across all application boundaries:
- Edge API Route Taint Analysis: Trace untrusted request inputs (headers, query params, body payloads, cookies) to sensitive sinks across all endpoints:
  - `api/admin.js`, `api/auth.js`, `api/calendar.js`, `api/chat.js`, `api/iot.js`, `api/sync.js`, `api/token.js`, `api/_lib/*`.
  - Sinks: Upstash Redis queries/updates, filesystem operations, outbound HTTP requests (SSRF), shell/CLI executions, response header setting (CORS, cookies).
- Client Sandbox & DOM XSS / Prototype Pollution:
  - Inspect `modules/codespace.js`, `modules/compiler.js`, `modules/ai-studio.js`, and `dashboard.html`.
  - Trace untrusted LLM outputs, VFS files, and markdown previews to DOM sinks (`innerHTML`, `eval`, `Function`, `iframe.srcdoc`).
  - Check object merging and deep cloning paths for Prototype Pollution (`__proto__`, `constructor.prototype`).
- Cryptographic & IoT Hardware Gateway Integrity:
  - Audit `api/iot.js` HMAC-SHA256 signature verification, monotonic sequence counter enforcement, replay nonce deduplication, and command TTL validations.
  - Verify zero-trust invariant: minimum-1 access key rule and constant-time password comparisons (`crypto.timingSafeEqual`).

### 2. Remediation Team (Defense-in-Depth Refactoring)
For every confirmed vulnerability or defense-in-depth weakness:
- Implement minimal, surgical, production-ready refactors directly in the affected files.
- Enforce strict JSON schema validation, type guards, and input sanitization before processing.
- Apply secure cryptographic defaults (constant-time comparisons, cryptographically random nonces/tokens, timing-safe error flows).
- Maintain fail-closed authorization semantics across all edge routes.
- Do NOT introduce synthetic/algorithmic code generators that degrade handcrafted domain fidelity.
- Do NOT generate offensive exploit scripts or weaponized payloads.

### 3. Review Board (Principal Security Architect Independent Review)
Convene an independent review board of Principal Security Architects to scrutinize every diff:
1. Verify root-cause remediation without band-aid workarounds.
2. Ensure 100% test coverage with automated regression assertions for every patched vulnerability.
3. Verify zero performance degradation, zero breaking API changes, and zero regressions across all 10 automated test suites (1,691 assertions).
4. Ensure all modified files strictly comply with the < 2,000 line ceiling.
5. Confirm physical ESP32 firmware (`firmware/**`) remains 100% untouched.

### 4. Quality & Acceptance Criteria
- [ ] 0 Critical, 0 High, and 0 Medium security vulnerabilities remain across all edge APIs and client modules.
- [ ] Deep taint analysis completed and documented for all sensitive sinks.
- [ ] Constant-time comparisons (`crypto.timingSafeEqual`) enforced across all authentication and cryptographic signature checks.
- [ ] SSRF defenses strictly validated against loopback, private RFC1918, link-local, and cloud metadata IPs (`169.254.169.254`, IPv6 equivalents).
- [ ] CORS reflection boundaries strictly locked to authorized origins with zero reflection of untrusted origins.
- [ ] All 10 verification test suites pass with 100% pass rate (zero errors, zero regressions).
- [ ] Syntax linter passes 40/40 JavaScript modules cleanly.
- [ ] All modified repository files remain strictly < 2,000 lines.
- [ ] Firmware files in `firmware/**` remain 100% untouched.
- [ ] Final executive summary produced detailing every vulnerability found, root cause, and exact file/line remediation.

Maintain your `BRIEFING.md`, `plan.md`, and `progress.md` in your working directory (`c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7`).
When all requirements are fulfilled and unanimous Review Board approval is achieved, submit your final handoff report (`handoff.md`) and notify the Sentinel.


## Received Message — 2026-10-17T08:15:50Z
From: f7fa2b7b-1952-44b9-8cdd-e7bbafab3014 (Parent Sentinel)
Mission: Launch Round 7 full-scale defensive security review and hardening cycle across LuminaVista OS.
Working Directory: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7
Repository Root: c:/Users/roysu/LuminaVista
