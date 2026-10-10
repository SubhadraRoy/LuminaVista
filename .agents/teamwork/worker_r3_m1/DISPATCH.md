## 2026-10-16T20:58:15Z
You are worker_r3_m1, a teamwork_preview_worker.
Your working directory is: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r3_m1

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Read the authoritative specification file:
c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md (specifically the latest section ## Follow-up — 2026-10-16T20:45:05Z).

Read the project scope and explorer findings:
- Scope: c:\Users\roysu\LuminaVista\.agents\teamwork\orchestrator_r3\PROJECT.md
- Explorer Report: c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_1\report.md
- Explorer Handoff: c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_1\handoff.md

Your exclusive write ownership is: `api/calendar.js` ONLY.
Do NOT modify firmware (`firmware/**`) or tests (`tests/**`).

Implement the following fixes in `api/calendar.js`:
1. Production OAuth Redirect URI Prioritization:
   - Formulate/refine `resolveRedirectUri` so it prioritizes `https://lumina-vista-sigma.vercel.app/api/calendar/callback` whenever clients access via GitHub Pages (`*.github.io`), Vercel preview URLs, or default deployments, so Google Cloud Console never throws Error 400 `redirect_uri_mismatch`.
   - Preserve custom redirect URIs passed in `query.redirect_uri` or test domains (especially `https://luminavista.example.com/api/calendar/callback` asserted in `tests/features.test.cjs:871`).
2. Decouple Calendar Auth from Master Password Session:
   - Make `/api/calendar/status` and `/api/calendar/auth` public endpoints: return config status and OAuth URL without requiring an admin password session lock.
   - For `/api/calendar/sync`: authenticate via Google OAuth credentials (`getValidAccessToken` from `gcal_token` cookie or `gcal:master_tokens` Redis state). Sovereign guest sessions must NOT fail closed with 401/403 if they have valid Google OAuth credentials.
3. CORS Preflight & Origin Handling:
   - Handle HTTP `OPTIONS` on all `/api/calendar/*` endpoints, returning HTTP 204 with `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, and `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`.
   - In `setCorsHeaders`, ensure origins ending with `.github.io` and `.vercel.app` are dynamically allowed (in addition to localhost and existing trusted origins).
4. Token Persistence & Partitioned Cookies (CHIPS):
   - Preserve `refresh_token` across re-authorizations, ensure cookies are serialized with `partitioned: proto === 'https'` (CHIPS) alongside `SameSite=None; Secure; HttpOnly`, and maintain Redis persistence (`gcal:master_tokens`).
5. Budget & Invariant Constraints:
   - `api/calendar.js` must strictly remain under 2,000 lines (currently ~855 lines).

Verification:
- Run `node tests/lint.cjs`
- Run `node tests/features.test.cjs`
- Run `node tests/recheck-all-tasks.cjs`
- Run `node tests/browser-cdp-test.cjs`
- Confirm all pass 100%.

Write your handoff report to:
c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r3_m1\handoff.md
and send a completion message back.
