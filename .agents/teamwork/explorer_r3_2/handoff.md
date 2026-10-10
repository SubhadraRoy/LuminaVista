# Handoff Report — Frontend Calendar Sync Engine & Core UI

**Agent**: `explorer_r3_2`  
**Handoff Type**: Hard (Investigation complete)  
**Target Modules**: `modules/calendar-sync.js`, `modules/calendar.js`  
**Report Artifact**: `c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_2\report.md`

---

## 1. Observation
- `modules/calendar-sync.js` is 737 lines; `modules/calendar.js` is 1,638 lines. Both are strictly under the 2,000 line limit.
- In `modules/calendar.js:1082-1085`, `aiAutoPlanDay()` pushes synthesized routine events to `calendarEvents`, saves to storage, and renders, but never calls `pushEventToGoogle()`.
- In `modules/calendar.js:1316-1318`, `handleAgentDirective` action `'edit'` only calls `pushEventToGoogle(target)` if `target.googleEventId` is truthy, ignoring unlinked local events.
- In `modules/calendar-sync.js:237-242`, `getApiOrigin()` only checks `window.location.hostname.endsWith('github.io')`, returning `''` for other static hosts (`pages.dev`, `gitlab.io`, `surge.sh`, `netlify.app`, `file:`).
- In `modules/calendar-sync.js:293-295`, `connectGoogleAccount()` computes `clientRedirect = ${window.location.origin}/api/calendar/callback`, which on GitHub Pages sends an unregistered redirect URI to Google OAuth, causing Error 400 `redirect_uri_mismatch`.
- In `modules/calendar-sync.js:666`, `window.addEventListener('message')` drops OAuth completion messages if `e.origin !== window.location.origin`, breaking cross-origin notification from `lumina-vista-sigma.vercel.app` to `*.github.io`.
- In `modules/calendar-sync.js:694`, only `window.addEventListener('focus')` is registered for auto-sync; `document.addEventListener('visibilitychange')` is not implemented.
- In `modules/calendar-sync.js:464-474`, `pushEventToGoogle` computes `endDateStr = eDate.toISOString().slice(0, 10)` where `eDate = sDate.getTime() + 86400000`, strictly ensuring `end.date = start.date + 1 day` for single-day all-day events.
- In `modules/calendar.js:1364`, `getEventLocalDateKey` intercepts `YYYY-MM-DD` with regex `/^\d{4}-\d{2}-\d{2}$/` and returns the raw string without `new Date()`, preventing Western Hemisphere UTC midnight date shifts.
- In `modules/calendar.js:298-306`, Month View renders Day 1 month name outside the circular badge and standardizes Today cell to `min-h-[90px]` with `ring-inset`.

---

## 2. Logic Chain
1. **AI Plan Day Push Gap**:
   - `saveEventFromModal()` (lines 933, 954) calls `pushEventToGoogle()` when connected.
   - `aiAutoPlanDay()` (line 1082) adds events to `calendarEvents` but has no call to `pushEventToGoogle()`.
   - Inference: Users who connect Google Calendar and use AI Auto-Plan Day will see events locally in LuminaVista, but these events will never appear in their real Google Calendar until an external sync occurs.
2. **Cross-Origin OAuth Communication**:
   - On GitHub Pages, LuminaVista runs on `https://<user>.github.io/LuminaVista`.
   - The backend runs on `https://lumina-vista-sigma.vercel.app`.
   - The OAuth popup opens on `https://lumina-vista-sigma.vercel.app/api/calendar/callback`.
   - The popup executes `window.opener.postMessage(..., targetOrigin)`.
   - The listener in `calendar-sync.js:666` checks `if (e.origin !== window.location.origin) return;`.
   - Since `e.origin` (`lumina-vista-sigma.vercel.app`) does not match `window.location.origin` (`<user>.github.io`), the message is rejected.
   - Inference: Frontend sync state remains disconnected unless the user closes the popup and triggers the polling fallback.
3. **Static Hosting API Routing**:
   - On static environments other than `*.github.io`, `getApiOrigin()` returns `''`.
   - `calendarApiFetch` makes relative calls to `/api/calendar/*`.
   - Without an edge serverless runtime, static hosts return 404 or HTML.
   - Inference: Expanding `getApiOrigin()` ensures all static hosting platforms route calendar API calls to `https://lumina-vista-sigma.vercel.app`.
4. **Visibility & Background Tab Foregrounding**:
   - Desktop and mobile browsers suspend inactive tabs and throttle focus events.
   - W3C Page Lifecycle defines `visibilitychange` as the canonical resume trigger.
   - Inference: Registering both `visibilitychange` and `focus` ensures resilient auto-sync when users return to the tab.

---

## 3. Caveats
- `tests/recheck-all-tasks.cjs` strictly enforces string assertions:
  - `calSyncJs.includes("endDateStr <= startDateStr")`
  - `calSyncJs.includes("item && item.status !== 'cancelled'")`
  - `connectedPos < unpushedPos`
  - `calSyncJs.includes("5 * 60 * 1000") && calSyncJs.includes("setInterval")`
  - `calSyncJs.includes("window.addEventListener('focus'")`
  Any implementation changes must retain these exact literal tokens.
- In `tests/features.test.cjs` and `tests/server.cjs`, the local development server runs at `http://localhost:3000`. `getApiOrigin()` must continue returning `''` for `localhost` and `127.0.0.1` to preserve local mock server compatibility.

---

## 4. Conclusion
The frontend calendar sync engine is well-architected but contains 5 specific defects:
1. `aiAutoPlanDay()` omits Google Calendar event pushing.
2. `handleAgentDirective` `'edit'` restricts push to events with existing `googleEventId`.
3. `getApiOrigin()` does not cover non-GitHub static hosts or local static previews.
4. Cross-domain OAuth postMessage is rejected on `github.io` due to strict origin equality check.
5. `visibilitychange` event listener is absent for tab foreground auto-sync.

All 5 items can be resolved with localized, low-risk patches (< 30 lines) within the existing budget headroom (`calendar-sync.js`: 737 lines, `calendar.js`: 1,638 lines).

---

## 5. Verification Method
1. **Unit Test Suite**:
   ```bash
   node tests/features.test.cjs
   ```
   (Must pass 1,102 / 1,102 assertions).
2. **Recheck Audit Suite**:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
   (Must pass 42 / 42 assertions).
3. **Syntax Linter**:
   ```bash
   node tests/lint.cjs
   ```
   (Must pass 40 / 40 JS modules).
4. **Browser CDP Suite**:
   ```bash
   node tests/browser-cdp-test.cjs
   ```
   (Must pass 122 / 122 CDP tests).
5. **Static Analysis & Line Budget**:
   Inspect line lengths of `modules/calendar-sync.js` and `modules/calendar.js` to ensure neither exceeds 2,000 lines.
