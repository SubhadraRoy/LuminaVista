## 2026-10-16T17:18:59Z
You are Worker M2 Gen 2 (Serverless APIs, Edge Security & IoT Telemetry Gateway Remediation).
Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m2_gen2
Original request path: c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
Project plan path: c:\Users\roysu\LuminaVista\.agents\teamwork\PROJECT.md
Survey reports:
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_1\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_2\handoff.md

FILE WRITE OWNERSHIP:
You EXCLUSIVELY own:
- `api/_lib/auth-guard.js`
- `api/calendar.js`
- `api/storage.js`
- `api/sync.js`
- `api/chat.js`
- `api/iot.js`
Do NOT modify any files outside this exclusive list.
NEVER MODIFY OR ALTER `firmware/**`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVE:
Implement defensive mitigations for Milestone 2:
1. CORS Origin Reflection Defenses (VULN-API-1):
   - In `api/_lib/auth-guard.js:357`, ensure `finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app'`. Never reflect an untrusted origin when credentials are true. Preserve allowed origin patterns (`.github.io`, `.vercel.app`, `localhost`).
   - In `api/calendar.js:15-17`, update `setCorsHeaders` to validate origin against allowed origins before reflection. Note that `tests/features.test.cjs` line 1153 expects `https://luminavista.example.com` or allowed origins, so ensure allowed origin logic accommodates test suite expectations while defending against arbitrary attacker origins.
2. GitHub Storage Path Traversal & Root Namespace Isolation (VULN-API-2):
   - In `api/storage.js:71-125`, enforce root directory namespace scoping (e.g. prefix paths or restrict root operations) so that arbitrary files at the repo root (such as `.github/workflows/deploy.yml`, `package.json`, `.env`) cannot be modified or deleted by user storage API calls. Preserve legitimate storage operations used by client modules.
3. Administrative Credential Protection in Cloud Sync (VULN-API-3):
   - In `api/sync.js`: Omit or redact `admin_passwords` from `GET /api/sync` unless the requesting session has `role === 'master'`. In `POST /api/sync`, do not allow unvalidated client payloads to overwrite admin credentials in `master_workspace_state` (admin keys must be managed strictly via `api/admin.js`).
4. OAuth2 State CSRF Nonce & postMessage Target Origin (VULN-API-4):
   - In `api/calendar.js:41-45`, add an anti-CSRF random nonce and HMAC signature to OAuth2 `state`.
   - In `api/calendar.js:75, 225`, replace wildcard target origin `'*'` with validated target origin or window origin.
5. Telemetry Authentication Consistency (VULN-API-5):
   - In `api/chat.js:139`, enforce session validation unconditionally for telemetry rather than gating it behind `process.env.VERCEL`.
6. IoT Gateway Rate-Limiting & Sequence Monotonicity (VULN-IOT-1, VULN-IOT-2):
   - In `api/iot.js:382-401`, add sliding rate-limiting to `GET /api/iot?action=time`.
   - In `api/iot.js:193, 249`, check sequence number monotonicity (`verification.seq >= (meta.lastSeq || 0)`) to reject stale/reordered telemetry packets within the timestamp drift window.
   - PRESERVE all existing ESP32 physical gateway communication formats, dual-TTL command dispatch, and canonical HMAC verification. NEVER touch `firmware/**`.
7. Invariants & Verification:
   - All modified files MUST remain strictly under 2,000 lines (`api/iot.js` currently 1,211 lines).
   - Run the full verification suites:
     * `node tests/lint.cjs`
     * `node tests/features.test.cjs`
     * `node tests/recheck-all-tasks.cjs`
     * `node tests/browser-cdp-test.cjs`
   - Keep `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m2_gen2\progress.md` updated.
   - Write your complete handoff report to `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m2_gen2\handoff.md`.
   - Notify parent via `send_message` with your results.
