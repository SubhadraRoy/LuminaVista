# Plan: Google Calendar Two-Way Sync & Month View UI Perfection

## Architecture & Scope
1. **Milestone 1 (M1): Google OAuth & Serverless Calendar Controller**
   - Files: `api/calendar.js`
   - Production redirect URI prioritization (`https://lumina-vista-sigma.vercel.app/api/calendar/callback`)
   - Decouple from master password session locks; authenticate via `gcal_token` cookie or `gcal:master_tokens` Redis state
   - Full CORS preflight `OPTIONS` returning HTTP 204 with credentials & allow-origin
   - Preserve `refresh_token` across re-authorizations, `SameSite=None; Secure; Partitioned` cookie attributes, Redis persistence

2. **Milestone 2 (M2): Frontend Two-Way Synchronization Engine**
   - Files: `modules/calendar-sync.js`, `modules/calendar.js`
   - `getApiOrigin()` routing `/api/calendar/*` to `https://lumina-vista-sigma.vercel.app` on GitHub Pages / static host
   - Resilient OAuth popup + direct navigation fallback
   - Auto-sync on startup, tab focus, periodic background timer
   - Google Calendar API v3 all-day events `end.date = start.date + 1 day`
   - `getEventLocalDateKey` preserving raw `YYYY-MM-DD` strings without UTC `new Date()` conversion
   - Push new, modal-edited, and AI-scheduled events (`aiAutoPlanDay()`) to Google Calendar

3. **Milestone 3 (M3): Calendar Month View UI Perfection & Verification**
   - Files: `modules/calendar.js`, `dashboard.html` (if applicable)
   - Day 1 month name text wrap clean rendering without circular badge warping
   - Eliminate Today cell height blowout and border overlap (`min-h-[90px]`, `ring-inset`)
   - Dynamic sync badge (`Local Sovereign` vs `Google Synced`)
   - Full test execution & verification:
     - `node tests/features.test.cjs` (1,102 assertions)
     - `node tests/browser-cdp-test.cjs` (122 CDP tests)
     - `node tests/recheck-all-tasks.cjs` (42 assertions)
     - `node tests/lint.cjs` (40 modules)
     - < 2000 lines budget check
     - Firmware untouched check

## Execution Flow
1. **Survey / Exploration**:
   - Dispatch 3 parallel Explorers:
     - `explorer_r3_1`: Investigate `api/calendar.js` (OAuth redirect, auth decoupling, CORS, refresh token, Redis).
     - `explorer_r3_2`: Investigate `modules/calendar-sync.js` & `modules/calendar.js` (origin, popup, auto-sync, all-day end.date, timezone key, push on save/AI).
     - `explorer_r3_3`: Investigate UI month view in `modules/calendar.js` & tests in `tests/` (day 1 month text wrap, cell height min-h-[90px], ring-inset, sync badge, CDP tests).
2. **Implementation & Review Cycles**:
   - M1: Worker -> Reviewers (2) -> Challenger -> Auditor
   - M2: Worker -> Reviewers (2) -> Challenger -> Auditor
   - M3: Worker -> Reviewers (2) -> Challenger -> Auditor
3. **Final Gate & Victory Certification**:
   - Ultra-senior review committee & Victory Auditor sign-off.
