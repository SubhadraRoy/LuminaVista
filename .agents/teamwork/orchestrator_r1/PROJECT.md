# Project: LuminaVista OS Defensive Security Hardening & Auto-Remediation

## Architecture
LuminaVista OS is a web-based operating system combining client-side application studios, sovereign session management, serverless backend API handlers (`api/*.js`), IoT hardware telemetry gateways (`api/iot.js`), and virtual filesystem (VFS) execution sandboxes (`modules/codespace.js`, `modules/compiler.js`).

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Zero-Trust Auth, Sovereign Session Keys & Access Keys | `api/auth.js`, `api/admin.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js` | None | **DONE** |
| M2 | Serverless APIs, Edge Security & IoT Telemetry Gateway | `api/_lib/auth-guard.js`, `api/calendar.js`, `api/storage.js`, `api/sync.js`, `api/chat.js`, `api/iot.js` | M1 | **DONE** |
| M3 | Multi-Device Cloud Sync & Non-Destructive Hydration | `modules/cloud-sync.js` | M1, M2 | **DONE** |
| M4 | Client Execution Sandboxes, VFS Boundaries & Compiler Guardrails | `dashboard.html`, `modules/codespace.js`, `modules/compiler.js`, `modules/telemetry-theme.js`, `modules/ai-studio.js`, `api/terminal.js`, `api/compile.js`, `modules/calendar-sync.js` | None | **DONE** |
| M5 | Full Verification, Adversarial Hardening, Git Commit Amend | Full test suites, forensic audit, git amend | M1, M2, M3, M4 | **IN_PROGRESS** |
