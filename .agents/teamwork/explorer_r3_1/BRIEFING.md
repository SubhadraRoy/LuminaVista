# BRIEFING — 2026-10-16T20:53:30Z

## Mission
Investigate api/calendar.js and its dependencies for Google OAuth redirect URIs, auth/guest decoupling, CORS preflights, token preservation, and line length.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_1
- Original parent: 1d2dc854-d014-48f9-a44e-485f7955375e
- Milestone: calendar_investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Inspect api/calendar.js, api/_lib/auth-guard.js, Redis client, etc.
- Verify redirect_uri construction, guest session handling, CORS preflight, token storage, line length

## Current Parent
- Conversation ID: 1d2dc854-d014-48f9-a44e-485f7955375e
- Updated: not yet

## Investigation State
- **Explored paths**: `api/calendar.js`, `api/_lib/auth-guard.js`, `api/_lib/redis.js`, `vercel.json`, `modules/calendar-sync.js`, `modules/calendar.js`, `tests/features.test.cjs`, `tests/recheck-all-tasks.cjs`, `tests/browser-cdp-test.cjs`
- **Key findings**:
  1. Redirect URI: GitHub Pages origin passing triggers Google `redirect_uri_mismatch`. Prioritizing `https://lumina-vista-sigma.vercel.app/api/calendar/callback` fixes it.
  2. Master session lock: Lines 826-835 enforce `validateSession`, blocking guest access with 401/403. Decoupling allows public status/auth and credential-driven sync.
  3. CORS: OPTIONS 204 handled across all routes, but origin set needs dynamic `*.github.io` and `*.vercel.app` matching.
  4. Token storage: Refresh token preserved; Redis persistence intact; missing `partitioned: true` in cookies for Chrome CHIPS.
  5. Line length: 855 lines (< 2,000 line limit).
- **Unexplored areas**: None (investigation complete).

## Key Decisions Made
- Formulated `resolveRedirectUri` architecture with production prioritization.
- Designed decoupling strategy for sovereign guest calendar synchronization.
- Produced detailed `report.md` and 5-component `handoff.md`.

## Artifact Index
- report.md — comprehensive findings and recommendations
- handoff.md — 5-component handoff report
- progress.md — liveness heartbeat
