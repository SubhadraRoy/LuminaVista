# Comprehensive Investigation Report: Frontend Calendar Sync Engine & Core UI

**Investigator**: `explorer_r3_2` (Teamwork Explorer)  
**Date**: 2026-10-16T20:53:00Z  
**Target Files**: `modules/calendar-sync.js`, `modules/calendar.js`  
**Reference Specs**: `ORIGINAL_REQUEST.md` (R2: Frontend Two-Way Synchronization Engine & R3: Month View UI Perfection)

---

## Executive Summary

An exhaustive audit of `modules/calendar-sync.js` (737 lines) and `modules/calendar.js` (1,638 lines) was performed across the 7 designated investigation areas:
1. `getApiOrigin()` routing across GitHub Pages, static hosts, and edge environments
2. Resilient OAuth initiation with synchronous popups and top-level navigation fallbacks
3. Auto-sync mechanisms across startup, tab focus, `visibilitychange`, and periodic timers
4. RFC 5545 and Google Calendar API v3 all-day event formatting with exclusive end dates (`end.date = start.date + 1 day`)
5. Timezone parsing in `getEventLocalDateKey` eliminating Western Hemisphere date shifts
6. Event push triggers across modal creation, modal edits, and AI autonomous planning (`aiAutoPlanDay()`)
7. File line length verification against the strict 2,000-line repository budget

Key defects and architecture gaps discovered:
- **Major Push Gap**: `aiAutoPlanDay()` (`modules/calendar.js:1005-1092`) synthesizes routine events but completely omits `pushEventToGoogle()`, leaving AI-generated events disconnected from Google Calendar.
- **Agent Update Push Gap**: `handleAgentDirective` (`modules/calendar.js:1316`) only pushes on `'edit'` if `target.googleEventId` exists, failing to push previously unlinked local events.
- **Cross-Domain postMessage Filter**: `modules/calendar-sync.js:666` strictly requires `e.origin === window.location.origin`, which drops OAuth success messages when running on GitHub Pages because the popup is on `https://lumina-vista-sigma.vercel.app`.
- **Missing `visibilitychange` Listener**: Tab focus auto-sync only listens to `window.addEventListener('focus')`, missing modern browser tab-switch and mobile foregrounding events.
- **Static Host API Origin Limitation**: `getApiOrigin()` only inspects `github.io`, returning `''` on other static hosting platforms (GitLab Pages, Cloudflare Pages, Surge, Netlify, or `file://`).

---

## Detailed Investigation by Area

### 1. `getApiOrigin()` Routing Architecture

#### Current Implementation (`modules/calendar-sync.js:237-242`)
```javascript
function getApiOrigin() {
  if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.endsWith('github.io')) {
    return 'https://lumina-vista-sigma.vercel.app';
  }
  return '';
}
```

#### Observations & Root Causes:
- How calls are routed: In `modules/calendar-sync.js`, all network requests (`/api/calendar/status`, `/api/calendar/auth`, `/api/calendar/sync`) pass through `calendarApiFetch(endpoint, options)` (lines 252-268):
  `const origin = getApiOrigin(); const url = endpoint.startsWith('http') ? endpoint : (origin + endpoint);`
- When hosted on GitHub Pages (`*.github.io`), `getApiOrigin()` resolves to `https://lumina-vista-sigma.vercel.app`, and requests are routed cross-origin with `credentials: 'include'`.
- When running on other static hosts without a native edge serverless runtime (e.g. `*.gitlab.io`, `*.pages.dev`, `*.surge.sh`, `*.netlify.app`, or `file://` local preview), `getApiOrigin()` returns `''`.
- Relative calls to `/api/calendar/*` on static servers result in HTTP 404 or return static HTML (`dashboard.html`), causing `SyntaxError: Unexpected token '<'` when parsing JSON responses.
- `getApiOrigin()` is currently internal and not exported on `window.LuminaCalendarSync`.

#### Proposed Remediation:
1. Expand `getApiOrigin()` to recognize explicit overrides (`window.LUMINA_API_ORIGIN`, `localStorage.getItem('lumina_api_origin')`), `file:` protocol, and any non-localhost/non-vercel host:
```javascript
function getApiOrigin() {
  if (typeof window !== 'undefined') {
    if (window.LUMINA_API_ORIGIN) return window.LUMINA_API_ORIGIN;
    try {
      const stored = localStorage.getItem('lumina_api_origin');
      if (stored) return stored;
    } catch (e) {}
    if (window.location) {
      const host = window.location.hostname || '';
      const proto = window.location.protocol || '';
      if (
        proto === 'file:' ||
        host.endsWith('github.io') ||
        host.endsWith('gitlab.io') ||
        host.endsWith('pages.dev') ||
        host.endsWith('surge.sh') ||
        host.endsWith('netlify.app') ||
        (!host.includes('localhost') && !host.includes('127.0.0.1') && !host.endsWith('.vercel.app'))
      ) {
        return 'https://lumina-vista-sigma.vercel.app';
      }
    }
  }
  return '';
}
```
2. Export `getApiOrigin` on `window.LuminaCalendarSync` for verification suites and external module access.

---

### 2. Resilient OAuth Initiation & Popup Blocker Handling

#### Current Implementation (`modules/calendar-sync.js:291-356`)
```javascript
async function connectGoogleAccount() {
  try {
    const clientRedirect = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? `${window.location.origin}/api/calendar/callback`
      : '';
    ...
    // Pre-open popup synchronously during user gesture
    popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
    ...
    const authRes = await calendarApiFetch(authUrl);
    const authData = await authRes.json();
    ...
    if (popup && !popup.closed) {
      popup.location.href = authData.authUrl;
    } else {
      window.location.href = authData.authUrl; // Fallback
    }
```

#### Observations & Root Causes:
1. **Synchronous Popup Creation**: `window.open('about:blank', ...)` executes synchronously at the start of the user gesture click, avoiding browser heuristic popup blocking on Safari/Chrome.
2. **Fallback Navigation**: If `!popup || popup.closed`, direct navigation `window.location.href = authData.authUrl` is triggered.
3. **Flaw 1: Redirect URI Mismatch on Static Hosts**:
   - Lines 293-295 compute `clientRedirect = ${window.location.origin}/api/calendar/callback`.
   - On GitHub Pages (`https://<user>.github.io`), this sends `redirect_uri=https://<user>.github.io/api/calendar/callback` to Google OAuth.
   - Google rejects this with **Error 400: redirect_uri_mismatch** because only `https://lumina-vista-sigma.vercel.app/api/calendar/callback` is registered in Google Cloud Console.
   - On static hosts, the redirect URI parameter should be omitted or set to `${getApiOrigin()}/api/calendar/callback`.
4. **Flaw 2: Cross-Origin postMessage Dropped**:
   - At line 666: `if (e.origin !== window.location.origin) return;`
   - When the app runs on GitHub Pages, the popup authenticates at `https://lumina-vista-sigma.vercel.app`.
   - The popup's postMessage has `e.origin = 'https://lumina-vista-sigma.vercel.app'`.
   - The parent window drops the message because `e.origin !== window.location.origin`.
   - Remediation: Allow `e.origin === window.location.origin || e.origin === 'https://lumina-vista-sigma.vercel.app' || e.origin === getApiOrigin()`.
5. **Flaw 3: Polling Interval Termination**:
   - Polling check `setInterval` runs every 1000ms until `popup.closed`.
   - If popup remains open, it polls indefinitely. A 10-minute timeout cap should be enforced.

---

### 3. Auto-Sync Mechanisms

#### Current Implementation (`modules/calendar-sync.js:685-735`)
```javascript
// Periodic 5-minute background auto-sync
setInterval(() => {
  const settings = getSettings();
  if (settings.googleCalendarConnected) {
    syncGoogleCalendar();
  }
}, 5 * 60 * 1000);

// Auto-sync when user returns focus
window.addEventListener('focus', () => {
  const settings = getSettings();
  if (settings.googleCalendarConnected) {
    syncGoogleCalendar();
  }
});
```

#### Observations & Deficiencies:
1. **Missing `visibilitychange` Listener**:
   - `window.addEventListener('focus')` does not reliably fire on mobile browsers, tablets, or when switching tabs inside an existing Chrome window.
   - W3C Page Lifecycle standard `document.addEventListener('visibilitychange')` should be mounted alongside `focus`.
2. **Missing Concurrency Guard in `syncGoogleCalendar()`**:
   - If `focus` and `visibilitychange` trigger in rapid succession, or if startup sync runs concurrently with user-triggered sync, multiple `syncGoogleCalendar()` executions overlap.
   - This causes duplicate network requests and potential event ID race conditions.
3. **Throttling**:
   - Auto-sync calls triggered by tab visibility should enforce a minimum cooldown interval (e.g. 15 seconds) to avoid spamming the backend.
4. **Test Suite Invariants**:
   - `tests/recheck-all-tasks.cjs:125-126` requires literal substrings `"5 * 60 * 1000"`, `"setInterval"`, and `"window.addEventListener('focus'"`. These exact signatures must be maintained.

---

### 4. All-Day Event Formatting for Google Calendar API v3

#### Current Implementation (`modules/calendar-sync.js:464-474`)
```javascript
if (evt.allDay) {
  const startDateStr = getEventLocalDateKey(evt.start);
  let endDateStr = evt.end ? getEventLocalDateKey(evt.end) : startDateStr;
  if (!endDateStr || endDateStr <= startDateStr) {
    const sDate = new Date(startDateStr + 'T00:00:00Z');
    const eDate = new Date(sDate.getTime() + 86400000);
    endDateStr = eDate.toISOString().slice(0, 10);
  }
  startPayload = { date: startDateStr };
  endPayload = { date: endDateStr };
}
```

#### Observations & Compliance:
1. **Single-Day All-Day Events**:
   - Google Calendar API v3 requires `start: { date: "YYYY-MM-DD" }` and `end: { date: "YYYY-MM-DD" }`.
   - `end.date` is strictly exclusive. If `end.date === start.date`, Google returns `400 Bad Request`.
   - The condition `endDateStr <= startDateStr` triggers when `endDateStr` equals `startDateStr`.
   - `new Date(startDateStr + 'T00:00:00Z').getTime() + 86400000` accurately advances the date by exactly 1 day in UTC without local DST interference.
   - For single-day event `2026-10-17`, `startPayload = { date: '2026-10-17' }` and `endPayload = { date: '2026-10-18' }`. This complies with Google Calendar API v3.
2. **Deserializing / Pulling All-Day Events**:
   - Google returns `item.start.date` and `item.end.date`.
   - `modules/calendar.js:1425` in `getEventsForDate(cellDate)` currently only checks:
     `const startKey = getEventLocalDateKey(evt.start); if (startKey === key) return true;`
   - While single-day events display on `startKey`, multi-day all-day events (e.g., 3-day conference) do not render on days 2 and 3 because `key >= startKey && key < endKey` is not evaluated.
   - Recommendation: Update `getEventsForDate` in `modules/calendar.js` to support multi-day all-day spans:
     ```javascript
     if (evt.allDay && evt.end) {
       const startKey = getEventLocalDateKey(evt.start);
       const endKey = getEventLocalDateKey(evt.end);
       if (key >= startKey && key < endKey) return true;
     }
     ```

---

### 5. Timezone Parsing in `getEventLocalDateKey`

#### Current Implementation (`modules/calendar.js:1362-1376` & `modules/calendar-sync.js:75-89`)
```javascript
// modules/calendar.js:1362-1376
function getEventLocalDateKey(str) {
  if (!str) return '';
  if (typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (typeof str === 'string' && str.includes('T')) {
    if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return formatDateKey(d);
    }
    return str.slice(0, 10);
  }
  const d = new Date(str);
  return !isNaN(d.getTime()) ? formatDateKey(d) : '';
}
```

#### Observations & Root Causes:
1. **Western Hemisphere Date Shift Problem**:
   - According to ECMAScript specification, parsing date-only string `"YYYY-MM-DD"` with `new Date("2026-10-17")` creates a UTC midnight timestamp (`2026-10-17T00:00:00.000Z`).
   - In timezones west of UTC (e.g. New York UTC-4, San Francisco UTC-7):
     `new Date("2026-10-17").getDate()` returns `16` (previous day).
   - In `modules/calendar.js`, line 1364: `/^\d{4}-\d{2}-\d{2}$/.test(str)` intercepts date strings and immediately returns `str` verbatim without converting to `Date`.
   - This eliminates date shifts in the Western Hemisphere.
2. **Discrepancy in `modules/calendar-sync.js` fallback**:
   - Line 83: `if (str.length >= 10 && str.charAt(4) === '-' && str.charAt(7) === '-') return str.slice(0, 10);`
   - If `window.LuminaCalendar` is not loaded, UTC timestamp `"2026-10-17T01:00:00Z"` gets sliced as `"2026-10-17"`, ignoring client timezone.
   - Recommendation: Align `calendar-sync.js` fallback with `calendar.js` so both execute identical logic.

---

### 6. Event Push Triggers

#### Current Implementation Analysis:
1. **Modal Event Creation (`modules/calendar.js:953-955`)**:
   ```javascript
   if (calendarSettings.googleCalendarConnected) {
     pushEventToGoogle(newEvent);
   }
   ```
   - Trigger status: **Active & Functioning**.
2. **Modal Event Edit (`modules/calendar.js:932-934`)**:
   ```javascript
   if (calendarSettings.googleCalendarConnected) {
     pushEventToGoogle(calendarEvents[idx]);
   }
   ```
   - Trigger status: **Active & Functioning**.
3. **Modal Event Deletion (`modules/calendar.js:968-970`)**:
   ```javascript
   if (evt && evt.googleEventId && calendarSettings.googleCalendarConnected) {
     deleteEventFromGoogle(evt.googleEventId);
   }
   ```
   - Trigger status: **Active & Functioning**.
4. **AI Auto-Plan Day (`modules/calendar.js:1005-1092`)**:
   ```javascript
   calendarEvents.push(...plannedEvents);
   saveCalendarEvents();
   renderCalendar();

   return {
     success: true,
     count: plannedEvents.length,
     events: plannedEvents,
     message: `Autonomously scheduled ${plannedEvents.length} events for ${dateKey}.`
   };
   ```
   - **CRITICAL DEFECT**: `aiAutoPlanDay()` synthesizes 5 to 6 routine events into `calendarEvents` and saves locally, but **NEVER calls `pushEventToGoogle`**!
   - Result: Autonomous AI schedules are not propagated to Google Calendar when connected.
   - Remediation:
     ```javascript
     if (calendarSettings.googleCalendarConnected) {
       for (const evt of plannedEvents) {
         pushEventToGoogle(evt);
       }
     }
     ```
5. **Agent Directive Handler (`modules/calendar.js:1316-1318`)**:
   ```javascript
   if (target.googleEventId && calendarSettings.googleCalendarConnected) {
     pushEventToGoogle(target);
   }
   ```
   - **DEFECT**: In the `'edit'` / `'update'` action, `pushEventToGoogle(target)` is only called if `target.googleEventId` is truthy.
   - If an event was created offline or locally and is subsequently edited via agent directive, it is never pushed to Google Calendar.
   - Remediation: Change condition to `if (calendarSettings.googleCalendarConnected) { pushEventToGoogle(target); }`.
6. **Programmatic `addEvent` (`modules/calendar.js:1581-1587`)**:
   - `addEvent` pushes to local array but does not invoke `pushEventToGoogle`.
   - Remediation: Trigger `if (calendarSettings.googleCalendarConnected) pushEventToGoogle(evt);`.

---

### 7. Line Length & Budget Verification

#### Current Measurements:
| File | Current Lines | Budget Limit | Headroom | Status |
| :--- | :--- | :--- | :--- | :--- |
| `modules/calendar-sync.js` | 737 lines | 2,000 lines | +1,263 lines | **COMPLIANT** |
| `modules/calendar.js` | 1,638 lines | 2,000 lines | +362 lines | **COMPLIANT** |

#### Budget Constraint Safeguards:
- `modules/calendar-sync.js` has substantial headroom (1,263 lines available).
- `modules/calendar.js` has 362 lines of headroom. All proposed edits are concise and add fewer than 20 lines total, maintaining strict compliance with the `< 2,000` line invariant.

---

## Month View UI Status Verification (R3)

The following UI items were verified in `modules/calendar.js`:
- **Day 1 Month Name**: Handled at line 306:
  `${cellDay === 1 ? `<span class="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 mr-0.5">${cellDate.toLocaleString('default', { month: 'short' })}</span>` : ''}`
  Rendered cleanly outside the circular badge, preventing vertical text wrap.
- **Today Cell Standardization**: Handled at line 298:
  `min-h-[90px]` standardized across all cells, with `ring-2 ring-inset ring-cyan-400` preventing border blowout and cell overlap with row below.
- **Dynamic Sync Status Badge**: Located in `dashboard.html:1044` (`#calSyncStatusBadge`) and dynamically updated by `updateSyncStatusBadge()` in `modules/calendar-sync.js:524-546`.

---

## Actionable Recommendations & Proposed Changes

### Proposed Patch 1: `modules/calendar-sync.js`
1. Enhance `getApiOrigin()` to route static hosts (GitHub Pages, GitLab Pages, Cloudflare Pages, Surge, Netlify, `file:`) to `https://lumina-vista-sigma.vercel.app`.
2. In `connectGoogleAccount()`, avoid passing invalid static-host redirect URIs: default `clientRedirect` to `https://lumina-vista-sigma.vercel.app/api/calendar/callback` if `getApiOrigin()` is active.
3. In cross-window postMessage listener (line 666), accept messages from `window.location.origin`, `https://lumina-vista-sigma.vercel.app`, and `getApiOrigin()`.
4. In `syncGoogleCalendar()`, add an `isSyncInProgress` concurrency lock and a 15-second auto-sync throttle.
5. Add `document.addEventListener('visibilitychange')` listener alongside existing `window.addEventListener('focus')`.
6. Export `getApiOrigin` on `window.LuminaCalendarSync`.

### Proposed Patch 2: `modules/calendar.js`
1. In `aiAutoPlanDay()`, push each generated event to Google Calendar if `calendarSettings.googleCalendarConnected` is true:
   ```javascript
   if (calendarSettings.googleCalendarConnected) {
     for (const evt of plannedEvents) {
       pushEventToGoogle(evt);
     }
   }
   ```
2. In `handleAgentDirective` action `'edit'` / `'update'`, remove `target.googleEventId` requirement:
   ```javascript
   if (calendarSettings.googleCalendarConnected) {
     pushEventToGoogle(target);
   }
   ```
3. In `addEvent`, push to Google if connected:
   ```javascript
   if (calendarSettings.googleCalendarConnected) {
     pushEventToGoogle(evt);
   }
   ```
4. In `getEventsForDate`, support multi-day all-day spans:
   ```javascript
   if (evt.allDay && evt.end) {
     const startKey = getEventLocalDateKey(evt.start);
     const endKey = getEventLocalDateKey(evt.end);
     if (key >= startKey && key < endKey) return true;
   }
   ```
