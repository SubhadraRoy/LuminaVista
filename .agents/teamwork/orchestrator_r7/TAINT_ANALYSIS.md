# Round 7 Taint Analysis & Vulnerability Ledger

## Executive Summary
The Discovery Team (Explorers 1, 2, and 3) performed exhaustive end-to-end taint tracking across all Edge API endpoints (`api/*.js`, `api/_lib/*`), client modules (`modules/*.js`, `dashboard.html`), and cryptographic/IoT hardware gateways (`api/iot.js`, `api/auth.js`, `api/admin.js`).
Overall architecture is robust with fail-closed edge authorization, strict iframe sandboxing, and zero hardcoded secrets. 7 specific, actionable remediations were identified for surgical defense-in-depth refactoring.

---

## Prioritized Vulnerability & Remediation Ledger

| ID | Severity | File(s) & Lines | Vulnerability / Defense-in-Depth Gap | Root Cause & Remediating Action | Team Assigned |
|----|----------|-----------------|--------------------------------------|---------------------------------|---------------|
| VULN-R7-01 | High | `modules/calendar.js:447-448, 696, 710, 867-868` | DOM XSS via unescaped `evt.id` in inline `onclick` and unescaped `evt.title` in `title` attributes | Escape `evt.id` using alphanumeric regex / `escapeHtml` and escape `escapeHtml(evt.title)` in tooltip attributes | Remediation (Worker Client) |
| VULN-R7-02 | High | `modules/whiteboard-gallery.js:752, 753, 755` | DOM XSS via raw `b.id` interpolation into inline `onclick` string literals | Sanitize `b.id` with `String(b.id).replace(/[^a-zA-Z0-9_\-]/g, '')` before interpolating into inline handlers | Remediation (Worker Client) |
| VULN-R7-03 | Medium | `modules/terminal.js:152-157` | Prototype Pollution via unvalidated `f.name` in `workspaceFiles` VFS assignment | Add `isValidVfsKey(f.name)` guard checking for `__proto__`, `constructor`, `prototype`, traversal, and control chars before writing to `vfs` | Remediation (Worker Client) |
| VULN-R7-04 | Medium | `modules/ai-studio.js:36-44` | Inconsistent `isValidVfsKey` allowing leading slashes, backslashes, and control characters | Align `isValidVfsKey` in `ai-studio.js` with `codespace.js` to reject `\\`, leading `/`, `?`, `#`, and `[\x00-\x1f\x7f]` | Remediation (Worker Client) |
| VULN-R7-05 | Medium | `modules/calendar-sync.js:770-776` | `postMessage` origin bypass when `window.location.origin` is `"null"` | Require `window.location.origin !== 'null'` before comparing `e.origin === window.location.origin` | Remediation (Worker Client) |
| VULN-R7-06 | Medium | `api/terminal.js:18-29` | Redundant / weaker local `sanitizeFilePath` instead of canonical implementation | Remove local `sanitizeFilePath` and import canonical `sanitizeFilePath` from `./_lib/auth-guard.js` | Remediation (Worker API) |
| VULN-R7-07 | Medium | `api/worker.js:52, 158, 206` | Missing format validation on `jobId` in Redis key interpolation | Add strict regex guard `/^[a-zA-Z0-9_\-]{1,128}$/` on `jobId` before Redis operations | Remediation (Worker API) |
| VULN-R7-08 | Low | `api/_lib/key-pool.js:361` | SSRF check in `normalizeOllamaEndpoint` conditionally gated on `process.env.VERCEL` | Enforce `if (isBlockedSsrfTarget(ep))` unconditionally on all environments | Remediation (Worker API) |

---

## Invariant Audit Summary
1. **IoT Hardware Gateway (`api/iot.js`)**:
   - Mutual HMAC-SHA256: PASS
   - Monotonic Sequence Counter (`seq > lastSeq`): PASS
   - Anti-Replay Nonce Cache ($T_{\text{nonce}} \ge 2W$): PASS
   - 15-second physical command TTL: PASS
   - Rate limiting: PASS
2. **Zero-Trust Auth & Sovereign Session Keys (`api/admin.js`, `api/auth.js`, `api/_lib/auth-guard.js`)**:
   - Minimum-1 access key rule under distributed spin-lock: PASS
   - Constant-time cryptographic comparisons (`crypto.timingSafeEqual`): PASS (100% compliance)
   - Sovereign session token signing & revocation checks: PASS
   - Hardcoded secrets (`lumina_root_secret`): ZERO (PASS)
3. **Firmware Integrity (`firmware/**`)**: 100% UNTOUCHED (PASS)
4. **File Length Budgets**: All files < 2,000 lines (PASS)
