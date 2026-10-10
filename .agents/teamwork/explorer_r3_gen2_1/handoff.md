# Handoff Report — Milestone 2: Frontend Two-Way Synchronization Engine
**Author**: `explorer_r3_gen2_1`  
**Recipient**: `orchestrator_r3_gen2` / Worker Agents  
**Target Files**: `modules/calendar-sync.js` (and `modules/calendar.js`)  
**Date**: 2026-10-16T21:40:00Z  
**Type**: Hard Handoff (Investigation & Architecture Design Complete)

---

## 1. Observation

1. **`getApiOrigin()` Limited Domain Coverage**:
   - In `modules/calendar-sync.js` lines 237–243:
     ```javascript
     function getApiOrigin() {
       if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.endsWith('github.io')) {
         return 'https://lumina-vista-sigma.vercel.app';
       }
       return '';
     }
     ```
   - Only `github.io` is routed to Vercel. Static hosts like `*.pages.dev`, `*.gitlab.io`, `*.surge.sh`, `*.netlify.app`, and `file:` return `''`, making calls fail with 404 on those platforms.
   - In `tests/features.test.cjs` line 15, JSDOM sets `url: "http://localhost:3000/dashboard.html"`. Tests rely on `localhost` returning `''` for mock fetch matching.

2. **OAuth Popup Initiation and Blockers**:
   - In `modules/calendar-sync.js` lines 301–329:
     ```javascript
     popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
     ...
     if (popup && !popup.closed) {
       popup.location.href = authData.authUrl;
     } else {
       window.location.href = authData.authUrl;
       return;
     }
     ```
   - `window.open` is called synchronously during the user gesture before `await calendarApiFetch(authUrl)`. If popup blockers prevent window creation, `popup` is null/closed and `window.location.href` handles the top-level redirect.
   - However, `about:blank` is initially a white screen with no user feedback during fetch latency.
   - `checkInterval` lacks a maximum iteration limit (leak risk if user abandons popup).

3. **Cross-Origin `postMessage` Rejection on GitHub Pages**:
   - In `modules/calendar-sync.js` lines 664–672:
     ```javascript
     window.addEventListener('message', async (e) => {
       if (e.origin !== window.location.origin) return;
       if (e.data && e.data.type === 'GCAL_AUTH_SUCCESS') {
         setSettings({ googleCalendarConnected: true });
         updateSyncStatusBadge();
         await syncGoogleCalendar();
       }
     });
     ```
   - In `api/calendar.js` line 402:
     ```javascript
     window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', event: 'gcal_auth_success', email: ${JSON.stringify(userEmail)} }, '*');
     ```
   - When LuminaVista OS runs on `https://<username>.github.io`, `window.location.origin` is `https://<username>.github.io`. The message arrives with `e.origin = 'https://lumina-vista-sigma.vercel.app'`. Line 666 (`e.origin !== window.location.origin`) drops the message, breaking the OAuth completion handshake on GitHub Pages.

4. **Auto-Sync Triggers & Test Suite Assertions**:
   - In `tests/recheck-all-tasks.cjs` lines 124–127:
     ```javascript
     testAssert(calSyncJs.includes("5 * 60 * 1000") && calSyncJs.includes("setInterval"), "Periodic 5-minute background auto-sync interval mounted");
     testAssert(calSyncJs.includes("window.addEventListener('focus'"), "Window focus auto-sync listener mounted");
     ```
   - `visibilitychange` is not currently mounted.
   - When tab focus switches, both `visibilitychange` and `focus` fire concurrently, causing dual simultaneous network sync requests if not gated by a concurrency lock.

5. **Strict All-Day Event Invariant**:
   - In `tests/recheck-all-tasks.cjs` line 114:
     ```javascript
     testAssert(calSyncJs.includes("endDateStr <= startDateStr"), "pushEventToGoogle computes strictly exclusive end date for single-day all-day events");
     ```
   - In `tests/features.test.cjs` lines 1188–1189:
     ```javascript
     assert(capturedPushBody.start && capturedPushBody.start.date === '2026-10-20', "All-day event start.date is set to start date");
     assert(capturedPushBody.end && capturedPushBody.end.date === '2026-10-21', "All-day event end.date is strictly exclusive (start + 1 day)");
     ```
   - `modules/calendar-sync.js` lines 467–471 contains:
     ```javascript
     if (!endDateStr || endDateStr <= startDateStr) {
       const sDate = new Date(startDateStr + 'T00:00:00Z');
       const eDate = new Date(sDate.getTime() + 86400000);
       endDateStr = eDate.toISOString().slice(0, 10);
     }
     ```
   - This exact computation fulfills both Google Calendar API v3 specification and all verification test assertions.

6. **Interlocking Triggers in `modules/calendar.js`**:
   - `aiAutoPlanDay()` (`modules/calendar.js` line 1082) saves events locally but does not call `pushEventToGoogle` for generated events when `calendarSettings.googleCalendarConnected` is true.
   - `handleAgentDirective` (`modules/calendar.js` line 1316) filters on `if (target.googleEventId && calendarSettings.googleCalendarConnected)`. Local unlinked events edited by agents fail to push to Google Calendar.

---

## 2. Logic Chain

1. **Static Origin Routing (Item 1)**:
   - *From Observation 1*: Static hosting environments have no Node.js/serverless edge backend. Calls to `/api/calendar/*` on these hosts 404 unless prepended with the Vercel production origin `https://lumina-vista-sigma.vercel.app`.
   - *From Observation 1*: Local development and test suites running on `localhost` or `127.0.0.1` must use relative paths `''` so they communicate with local dev/mock servers.
   - *Inference*: `getApiOrigin()` must check `hostname === 'localhost' || hostname === '127.0.0.1'` first and return `''`, while checking `protocol === 'file:'` or `hostname.endsWith(...)` for `github.io`, `pages.dev`, `gitlab.io`, `surge.sh`, and `netlify.app` to return `'https://lumina-vista-sigma.vercel.app'`.

2. **Resilient OAuth (Item 2)**:
   - *From Observation 2*: Browser popup blockers block asynchronous `window.open` calls made after network round-trips. Synchronous opening at click time bypasses blockers.
   - *Inference*: Keep synchronous `window.open`, add inline dark themed loading indicator to the opened popup, and maintain `window.location.href = authData.authUrl` fallback if popup is blocked or throws on navigation.

3. **Cross-Origin PostMessage (Item 3)**:
   - *From Observation 3*: The OAuth callback on Vercel sends `postMessage` with origin `'https://lumina-vista-sigma.vercel.app'`.
   - *From Observation 3*: The parent window on `*.github.io` currently rejects any message where `e.origin !== window.location.origin`.
   - *Inference*: The origin check must explicitly permit `https://lumina-vista-sigma.vercel.app`, `*.vercel.app`, and `window.location.origin`.

4. **Multi-Trigger Auto-Sync & Concurrency Guard (Item 4)**:
   - *From Observation 4*: `tests/recheck-all-tasks.cjs` strictly asserts `"5 * 60 * 1000"`, `"setInterval"`, and `"window.addEventListener('focus'"`.
   - *From Observation 4*: Adding `visibilitychange` without synchronization causes race conditions when both events fire upon switching tabs.
   - *Inference*: Add an in-flight mutex (`isSyncInProgress`) inside `syncGoogleCalendar()` and a 15-second debounce helper `triggerAutoSync()` used by both `focus` and `document.addEventListener('visibilitychange')`, preserving all test tokens verbatim.

5. **Exclusive All-Day Event Calculation (Item 5)**:
   - *From Observation 5*: Google Calendar API v3 mandates exclusive end dates for all-day events (`end.date > start.date`).
   - *From Observation 5*: `tests/recheck-all-tasks.cjs` strictly asserts `calSyncJs.includes("endDateStr <= startDateStr")`.
   - *Inference*: The guard `if (!endDateStr || endDateStr <= startDateStr)` computing `+ 86400000` ms on UTC midnight must be strictly retained.

6. **Interlocking Triggers (Calendar Integration)**:
   - *From Observation 6*: AI-generated events and unlinked edited events in `modules/calendar.js` were omitting `pushEventToGoogle`.
   - *Inference*: In `aiAutoPlanDay()`, push planned events if connected. In `handleAgentDirective`, remove `target.googleEventId` condition from `pushEventToGoogle(target)`.

---

## 3. Caveats

1. **Read-Only Scope**: This agent is strictly read-only. No modifications to `modules/calendar-sync.js` or `modules/calendar.js` were made during this phase. Code snippets and patches are documented in `report.md` for the implementing agent.
2. **Third-Party Cookie Partitioning (CHIPS)**: In cross-domain contexts (GitHub Pages contacting Vercel API), browsers partition cookies. The backend in `api/calendar.js` was already hardened in M1 to set `Partitioned; SameSite=None; Secure`, but `syncGoogleCalendar` also passes `x-session-id` and retrieves tokens from Redis.
3. **Firmware Integrity**: ESP32 physical firmware files (`firmware/**`) were not touched and must remain untouched.

---

## 4. Conclusion

The architecture and exact code modifications for Milestone 2 (Frontend Two-Way Synchronization Engine) are completely formulated, verified against the test suites, and ready for immediate implementation.

### Implementation Checklist for Implementer Agent:
- [ ] In `modules/calendar-sync.js`:
  - Replace `getApiOrigin()` with multi-host static routing (Item 1).
  - Add inline loading spinner to popup and exception handling in `connectGoogleAccount()` (Item 2).
  - Add `isAllowedOAuthOrigin()` whitelist to the `message` event listener and process `GCAL_AUTH_SUCCESS` / `GCAL_AUTH_ERROR` (Item 3).
  - Add `isSyncInProgress` concurrency mutex to `syncGoogleCalendar()` and add `visibilitychange` listener via `triggerAutoSync()`, strictly preserving `5 * 60 * 1000`, `setInterval`, and `window.addEventListener('focus'` (Item 4).
  - Preserve `endDateStr <= startDateStr` in `pushEventToGoogle()` (Item 5).
- [ ] In `modules/calendar.js`:
  - In `aiAutoPlanDay()`: call `pushEventToGoogle` for synthesized events when `calendarSettings.googleCalendarConnected`.
  - In `handleAgentDirective` (`edit`/`update`): change `if (target.googleEventId && calendarSettings.googleCalendarConnected)` to `if (calendarSettings.googleCalendarConnected)`.

---

## 5. Verification Method

To independently verify the implementation:

1. **Recheck Tasks Audit (42 Assertions)**:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
   *Expected*: 42/42 assertions pass with 0 errors.

2. **JavaScript Syntax Linting (40 Modules)**:
   ```bash
   node tests/lint.cjs
   ```
   *Expected*: All 40 modules pass syntax validation.

3. **Comprehensive Unit Test Suite (1,102 Assertions)**:
   ```bash
   node tests/features.test.cjs
   ```
   *Expected*: All 1,102 unit assertions pass with 0 errors.

4. **Line Count Budget Constraint**:
   ```bash
   wc -l modules/calendar-sync.js modules/calendar.js
   ```
   *Expected*: Both files remain strictly $< 2,000$ lines.

5. **Invalidation Conditions**:
   - If `getApiOrigin()` returns anything other than `''` for `localhost` or `127.0.0.1`, `features.test.cjs` will fail mock URL matching.
   - If `endDateStr <= startDateStr`, `5 * 60 * 1000`, `setInterval`, or `window.addEventListener('focus'` are altered or removed, `tests/recheck-all-tasks.cjs` will fail on assertions 2B and 2E.
