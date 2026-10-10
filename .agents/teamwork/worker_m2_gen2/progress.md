# Progress — Worker M2 Gen 2

Last visited: 2026-10-16T17:29:30Z
Current Status: All Milestone 2 defensive remediations implemented and verified across all 4 suites.

## Tasks
- [x] 0. Run initial baseline tests to confirm starting state
  - Syntax Linter: 40/40 passed
  - Unit Tests: 1,102/1,102 passed
  - Recheck Tasks: 42/42 passed
  - Browser CDP: 122/122 passed
- [x] 1. Remediate VULN-API-1 (CORS Origin Reflection in `api/_lib/auth-guard.js` & `api/calendar.js`)
  - Validated allowed origins against whitelist + approved pattern suffixes (.github.io, .vercel.app, localhost, luminavista.example.com)
  - Prevented reflecting arbitrary untrusted origins with credentials: true
- [x] 2. Remediate VULN-API-2 (GitHub Storage Path Traversal & Root Namespace Isolation in `api/storage.js`)
  - Enforced `user_vault/` root directory namespace scoping
  - Restricted repository root assets (.github, .git, .env, node_modules, api, modules, tests, firmware, package.json, vercel.json, etc.)
  - Added safe `action === 'list'` handling within user vault
- [x] 3. Remediate VULN-API-3 (Admin Credential Protection in Cloud Sync in `api/sync.js`)
  - Redacted/omitted `admin_passwords` from `GET /api/sync` unless `auth.role === 'master'`
  - Blocked unvalidated client sync payloads from overwriting admin credentials in `master_workspace_state` (enforced via `currentState.admin_passwords`)
- [x] 4. Remediate VULN-API-4 (OAuth2 State CSRF Nonce & postMessage Target Origin in `api/calendar.js`)
  - Random nonce, timestamp, and HMAC-SHA256 signature encoded into OAuth2 state with 15-minute TTL
  - Replaced wildcard `*` with validated target origin in callback postMessage
- [x] 5. Remediate VULN-API-5 (Telemetry Authentication Consistency in `api/chat.js`)
  - Enforced session validation unconditionally for live telemetry endpoint (independent of `process.env.VERCEL`)
- [x] 6. Remediate VULN-IOT-1 & VULN-IOT-2 (IoT Time Rate-Limiting & Sequence Monotonicity in `api/iot.js`)
  - Added sliding IP rate-limiting (60 req/min) to `GET /api/iot?action=time`
  - Added monotonic sequence number verification (`verification.seq >= (meta.lastSeq || 0)`) in `verifyDeviceRequest` and POST handler
  - Updated `meta.lastSeq` with `Math.max(verification.seq, prevMeta?.lastSeq || 0)`
  - Preserved all ESP32 physical gateway communication formats and dual-TTL command dispatch; untouched `firmware/**`
- [x] 7. Run full test suites and verify 0 regressions & line counts < 2000
  - Syntax Linter: 40/40 modules passed (`tests/lint.cjs`)
  - Features Tests: 1,102/1,102 assertions passed (`tests/features.test.cjs`)
  - Recheck Tasks: 42/42 assertions passed (`tests/recheck-all-tasks.cjs`)
  - Browser CDP: 122/122 Chrome tests passed (`tests/browser-cdp-test.cjs`)
  - All modified files strictly under 2,000 lines:
    * `api/_lib/auth-guard.js`: 477 lines
    * `api/calendar.js`: 822 lines
    * `api/storage.js`: 173 lines
    * `api/sync.js`: 136 lines
    * `api/chat.js`: 755 lines
    * `api/iot.js`: 1,248 lines
- [ ] 8. Final handoff and notification
