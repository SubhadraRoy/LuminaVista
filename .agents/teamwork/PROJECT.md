# Project: LuminaVista OS Defensive Security Hardening & Auto-Remediation

## Architecture
LuminaVista OS is a web-based operating system combining client-side application studios, sovereign session management, serverless backend API handlers (`api/*.js`), IoT hardware telemetry gateways (`api/iot.js`), and virtual filesystem (VFS) execution sandboxes (`modules/codespace.js`, `modules/compiler.js`).

### Security Boundaries:
1. **Zero-Trust Auth & Session Boundary**: Edge serverless authentication (`api/auth.js`, `api/_lib/auth-guard.js`) generating HMAC-signed sovereign session tokens (`lv_...`) and validating admin access keys (`api/admin.js`).
2. **IoT Hardware Telemetry Gateway**: Bi-directional hardware telemetry gateway (`api/iot.js`) communicating with physical ESP32 locks via mutual HMAC-SHA256, 128-bit anti-replay nonces, and dual-TTL command validation.
3. **Serverless Edge APIs & Cloud Storage**: Data synchronization (`api/sync.js`), GitHub storage proxy (`api/storage.js`), Google Calendar integration (`api/calendar.js`), and LLM microVM agents (`api/chat.js`, `api/worker.js`).
4. **Multi-Device Cloud Hydration**: Real-time multi-device cloud synchronization (`modules/cloud-sync.js`) persisting state across devices with non-destructive union hydration.
5. **Client Execution Sandboxes & VFS**: In-browser code preview (`dashboard.html`), compiler execution (`modules/compiler.js`), codespace IDE (`modules/codespace.js`), and microVM terminal bridges (`api/terminal.js`, `api/compile.js`).

---

## Feature / Vulnerability Inventory

Every surveyed vulnerability and hardening requirement is mapped below:

| # | Vulnerability / Requirement | Description | Milestone | Source |
|---|-----------------------------|-------------|-----------|--------|
| 1 | VULN-AUTH-1: Hardcoded Root Secret | Hardcoded `'lumina_root_secret'` in `api/auth.js:218` allows forged clientKey signatures | M1 | Survey (Exp 1 & 2) |
| 2 | VULN-AUTH-2: Session Revocation Gap | Sovereign session tokens in `api/_lib/auth-guard.js` not checked against Redis revocation | M1 | Survey (Exp 2) |
| 3 | VULN-AUTH-3: Timing Discrepancies | Variable-time string `===` comparisons in `api/auth.js:50-54, 187, 229` | M1 | Survey (Exp 1 & 2) |
| 4 | VULN-AUTH-4: Minimum-1 Access Key Invariant | `api/admin.js:161` pre-filter check can delete all access keys if duplicate IDs exist | M1 | Survey (Exp 2) |
| 5 | VULN-API-1: CORS Origin Reflection | `api/_lib/auth-guard.js:357` & `api/calendar.js:15` reflect untrusted origins with credentials | M2 | Survey (Exp 1 & 2) |
| 6 | VULN-API-2: GitHub Storage Traversal | `api/storage.js:71-125` lacks root directory namespace scoping, permitting CI/root overwrite | M2 | Survey (Exp 1) |
| 7 | VULN-API-3: Admin Hash Leak & State Poisoning | `api/sync.js:75, 113-115` leaks admin password hashes in sync and allows unvalidated overwrite | M2 | Survey (Exp 1) |
| 8 | VULN-API-4: OAuth2 State CSRF & postMessage Leak | `api/calendar.js:41-45, 75, 225` lacks anti-CSRF nonce and leaks data to wildcard origin | M2 | Survey (Exp 1) |
| 9 | VULN-API-5: Telemetry Auth Bypass in Non-Vercel | `api/chat.js:139` guards session verification by `process.env.VERCEL` | M2 | Survey (Exp 1) |
| 10 | VULN-IOT-1: IoT Time-Sync Rate Limit Gap | `GET /api/iot?action=time` in `api/iot.js:382` performs unrated HMAC calculations | M2 | Survey (Exp 2) |
| 11 | VULN-IOT-2: IoT Sequence Regression | `api/iot.js:193` missing sequence monotonicity check on telemetry packets | M2 | Survey (Exp 2) |
| 12 | VULN-SYNC-1: Destructive Cloud Hydration Overwrite | `modules/cloud-sync.js:221-232, 359-382` blindly overwrites calendar, notes, and VFS files | M3 | Survey (Exp 1) |
| 13 | VULN-SYNC-2: Background Tab Hijacking | `modules/cloud-sync.js:453-463` calls `window.switchTab` during 90s background sync cycles | M3 | Survey (Exp 1) |
| 14 | VULN-SANDBOX-1: Missing Sandbox on Preview Frame | `dashboard.html:731` `#sandboxPreviewFrame` lacks `sandbox` attribute | M4 | Survey (Exp 1 & 3) |
| 15 | VULN-SANDBOX-2: Dangerous allow-same-origin | `dashboard.html:683, 897, 898` has `allow-same-origin` with `allow-scripts` | M4 | Survey (Exp 3) |
| 16 | VULN-SANDBOX-3: Same-Origin Blob Popout Escape | `modules/codespace.js:440-442` creates same-origin Blob URLs without sandboxing | M4 | Survey (Exp 1 & 3) |
| 17 | VULN-SANDBOX-4: DOM XSS in Codespace Tree & Tabs | `modules/codespace.js:78, 103, 125, 160` interpolates unescaped filenames/folders | M4 | Survey (Exp 3) |
| 18 | VULN-SANDBOX-5: Command Injection in runActiveFile | `modules/codespace.js:346-350` unsanitized filename interpolation into shell command | M4 | Survey (Exp 3) |
| 19 | VULN-SANDBOX-6: Prototype Collision DoS | `modules/codespace.js:45-55` crashes on reserved Object methods (`toString`) | M4 | Survey (Exp 3) |
| 20 | VULN-SANDBOX-7: Prototype Pollution in VFS | `modules/codespace.js`, `modules/ai-studio.js`, `api/chat.js:665`, `api/worker.js:311` | M4 | Survey (Exp 1 & 3) |
| 21 | VULN-SANDBOX-8: Path Traversal in api/terminal.js | `api/terminal.js:83` single-pass regex fails to strip backslashes | M4 | Survey (Exp 3) |
| 22 | VULN-SANDBOX-9: Missing Jev Guardrails in Compile | `api/compile.js` lacks server-side Jev command safety screening | M4 | Survey (Exp 3) |
| 23 | VULN-SANDBOX-10: Unvalidated postMessage Origin | `modules/calendar-sync.js:665-671` accepts messages from any origin | M4 | Survey (Exp 3) |
| 24 | REQ-VERIFY: Comprehensive Verification Suites | All 4 test suites pass: features (1102), cdp (122), recheck (42), lint (40) | M5 | User Request |
| 25 | REQ-BUDGET: Line Count Limit (< 2,000 lines) | All modified files must remain strictly under 2,000 lines | M1-M5 | User Request |
| 26 | REQ-FIRMWARE: Never touch firmware/** | ESP32 physical firmware files must not be altered | M1-M5 | User Request |
| 27 | REQ-GIT: Single commit amend & force push | Clean working tree committed via `git commit --amend --no-edit` | M5 | User Request |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Zero-Trust Auth, Sovereign Session Keys & Access Keys | `api/auth.js`, `api/admin.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js` | None | DONE |
| M2 | Serverless APIs, Edge Security & IoT Telemetry Gateway | `api/_lib/auth-guard.js`, `api/calendar.js`, `api/storage.js`, `api/sync.js`, `api/chat.js`, `api/iot.js` | M1 | DONE |
| M3 | Multi-Device Cloud Sync & Non-Destructive Hydration | `modules/cloud-sync.js` | M1, M2 | DONE |
| M4 | Client Execution Sandboxes, VFS Boundaries & Compiler Guardrails | `dashboard.html`, `modules/codespace.js`, `modules/compiler.js`, `modules/telemetry-theme.js`, `modules/ai-studio.js`, `api/terminal.js`, `api/compile.js`, `modules/calendar-sync.js` | None | DONE |
| M5 | Full Verification, Adversarial Hardening, Git Commit Amend | Full test suites, forensic audit, git amend | M1, M2, M3, M4 | DONE |

---

## Interface Contracts & Invariants

### 1. Zero-Trust Auth & Sovereign Session Keys
- `verifySovereignSessionToken(token, secret)`: Returns `{ valid: boolean, role: string }`.
- Session revocation: When a session is logged out in `api/logout.js`, if a revocation marker is stored in Redis (e.g. `session:revoked:${sessionId}` or missing from `session:${sessionId}`), `validateSession` must fail closed.
- Min-1 Key Rule: `api/admin.js` must verify `remaining.length < 1` post-filtering, ensuring at least 1 active access key remains at all times.
- No `'lumina_root_secret'` in `api/auth.js` when `expectedPassword` is configured.
- Constant-time comparison: Use `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))` for all password and signature checks.

### 2. CORS & Storage Sandboxing
- `setSecurityHeaders` in `api/_lib/auth-guard.js`: If `isAllowed` is false, fallback strictly to default allowed origin (`https://lumina-vista-sigma.vercel.app`), never reflecting untrusted origins when credentials are true.
- `api/storage.js`: Enforce strict namespace scoping (e.g., prefix paths with `storage/` or `user_vault/`), rejecting `.github/`, `.env`, and repo root overrides.

### 3. IoT Smart Lock Gateway
- Preserve all existing ESP32 physical firmware communication formats (`firmware/**` strictly untouched).
- Add sliding rate-limit to `GET /api/iot?action=time` (e.g. 120 req/min).
- Verify sequence number monotonicity (`meta.lastSeq`) to reject reordered telemetry packets.

### 4. Non-Destructive Cloud Hydration
- In `modules/cloud-sync.js`: Calendar events merged by `id` / `updatedAt`; notes merged by `id` / `updatedAt`; VFS files merged non-destructively.
- Decouple `activeTabId`: Never trigger `switchTab` during background 90s sync cycles; only restore on initial cold boot.

### 5. Client Sandboxing & VFS
- Add `sandbox="allow-scripts allow-modals allow-forms"` to `#sandboxPreviewFrame` in `dashboard.html`.
- Remove `allow-same-origin` from sandboxed frames (`#previewIframe`, `#splitLeftFrame`, `#splitRightFrame`).
- Apply `escapeHtml()` to all filenames/folder names in `modules/codespace.js`.
- Prevent prototype pollution in VFS mutations by rejecting `__proto__`, `prototype`, `constructor`.

---

## Code Layout & File Line Budgets (< 2,000 lines)

| File | Current Lines | Budget Status | Notes |
|------|---------------|---------------|-------|
| `api/auth.js` | 267 | OK (1,733 headroom) | Keep under 2,000 lines |
| `api/admin.js` | 196 | OK (1,804 headroom) | Keep under 2,000 lines |
| `api/_lib/auth-guard.js` | 422 | OK (1,578 headroom) | Keep under 2,000 lines |
| `api/iot.js` | 1,211 | OK (789 headroom) | Never touch firmware/** |
| `api/storage.js` | 133 | OK (1,867 headroom) | Keep under 2,000 lines |
| `api/sync.js` | 137 | OK (1,863 headroom) | Keep under 2,000 lines |
| `api/calendar.js` | 338 | OK (1,662 headroom) | Keep under 2,000 lines |
| `modules/cloud-sync.js` | 557 | OK (1,443 headroom) | Keep under 2,000 lines |
| `modules/codespace.js` | 589 | OK (1,411 headroom) | Keep under 2,000 lines |
| `dashboard.html` | 1,917 | WATCH (83 headroom) | Do NOT add bulky code |
| `tests/features.test.cjs` | 1,984 | CRITICAL (16 headroom) | Do NOT add tests here! |
| `firmware/**` | N/A | PROTECTED | NEVER modify firmware files |


---

## Round 4: Defensive Vulnerability Assessment & Auto-Remediation

### R4 Feature / Vulnerability Inventory
| # | Vulnerability / Requirement | Description | Milestone | Source |
|---|-----------------------------|-------------|-----------|--------|
| R4-1 | VULN-SSRF-IPV6: IPv6-mapped IPv4 bypass | `api/_lib/key-pool.js:242-307` bypasses `isBlockedSsrfTarget` via `[::ffff:127.0.0.1]` / `[::ffff:169.254.169.254]` | R4-M1 | Survey Exp 1 |
| R4-2 | VULN-CORS-REFLECT: Wildcard origin reflection | `api/calendar.js:103-104` reflects untrusted `*.github.io` / `*.vercel.app` with `credentials: true` | R4-M1 | Survey Exp 1 |
| R4-3 | VULN-CORS-OPTIONS: Missing security headers on OPTIONS | `api/storage.js`, `api/chat.js`, `api/compile.js`, `api/terminal.js`, `api/worker.js` omit `setSecurityHeaders` | R4-M1 | Survey Exp 1 |
| R4-4 | VULN-POSTMESSAGE-WILD: Wildcard targetOrigin & broad origin | `api/calendar.js:214, 402` leaks email to `'*'`; `modules/calendar-sync.js:712` accepts any vercel/github subdomain | R4-M1 | Survey Exp 1 & 3 |
| R4-5 | VULN-DOM-XSS: Workspace name interpolation | `modules/projects.js:59` unescaped `${p.name}` inside `b.innerHTML` | R4-M1 | Survey Exp 3 |
| R4-6 | VULN-PATH-TRAVERSAL: Project URL directory traversal | `modules/projects.js:7` lacks `..` segment check in `resolveProjectUrl()` | R4-M1 | Survey Exp 3 |
| R4-7 | VULN-CLI-FLAG: Shell parameter injection | `modules/codespace.js:370` allows leading `-` in filename without `--` delimiter | R4-M1 | Survey Exp 3 |
| R4-8 | VULN-PROTO-POLLUTION: Server sanitization prototype bypass | `api/_lib/auth-guard.js:380-388` in `sanitizeDeep` does not skip `__proto__`, `constructor`, `prototype` | R4-M1 | Survey Exp 2 |
| R4-9 | VULN-SYNC-TYPEGUARDS: Missing structural type guards | `api/sync.js:101-125` lacks array and string format validation on sync payloads | R4-M1 | Survey Exp 2 |
| R4-10 | VULN-RATE-LIMIT: Missing edge rate limits and payload caps | `api/calendar.js` and `api/worker.js` missing `checkRateLimit` and `enforcePayloadLimit` | R4-M1 | Survey Exp 1 |
| R4-11 | REQ-COMMITTEE: Ultra-Senior Review Committee | Principal Security Architect, Cryptographic & IoT Specialist, Adversarial Challenger, Forensic Auditor unanimous sign-off | R4-M2 | User Request |
| R4-12 | REQ-VICTORY: Independent Victory Auditor Certification | `teamwork_preview_victory_auditor` official `VICTORY CONFIRMED` sign-off | R4-M2 | User Request |
| R4-13 | REQ-INVARIANTS: Line budgets, firmware immutability, test suites | All files < 2,000 lines, firmware untouched, 1,102 unit, 122 cdp, 42 recheck, 63 empirical, 40 lint pass | R4-M3 | User Request |
| R4-14 | REQ-GIT-AMEND: Single root commit amend and force push | Clean working tree, `git commit --amend --no-edit && git push --force origin main` | R4-M3 | User Request |

### Round 4 Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| R4-M1 | Multi-Surface Defensive Auto-Remediation & Hardening | `api/_lib/key-pool.js`, `api/calendar.js`, `api/storage.js`, `api/chat.js`, `api/compile.js`, `api/terminal.js`, `api/worker.js`, `modules/calendar-sync.js`, `modules/projects.js`, `modules/codespace.js`, `api/_lib/auth-guard.js`, `api/sync.js` | None | DONE |
| R4-M2 | Multi-Agent Adversarial Re-Audit & Ultra-Senior Review Committee | Principal Security Architect Reviewer, Cryptographic & IoT Gateway Specialist, Adversarial Penetration Challenger, Forensic Integrity Auditor | R4-M1 | DONE |
| R4-M3 | System Verification, Line Budgets, Git Commit Amend & Victory | Run all suites (1102 unit, 122 cdp, 42 recheck, 63 empirical, 40 lint), verify line counts, amend & push, victory handoff | R4-M2 | DONE |
