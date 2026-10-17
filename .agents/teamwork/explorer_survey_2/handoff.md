# Survey Explorer 2: Frontend Calendar & Sync Investigation Report

**Agent**: Survey Explorer 2 (`explorer_survey_2`)  
**Mission**: Investigate client-side calendar and auto-sync implementation across Lumina Vista (`modules/calendar.js`, `modules/calendar-sync.js`, `dashboard.html`) to map out legacy OAuth triggers, `localStorage` dependencies, two-way mutation flows, auto-sync triggers, UI status badges/warnings, and file line counts.  
**Target Milestone**: M0 Architecture Survey & M3 Frontend Migration Blueprint  
**Timestamp**: 2026-10-17T11:18:00Z  

---

## 1. Observation

### 1.1 Exact Line Counts and File Budget Constraints
Direct inspection via Node.js execution:
```bash
node -e "const fs = require('fs'); ['modules/calendar.js', 'modules/calendar-sync.js', 'dashboard.html'].forEach(f => console.log(f + ': ' + fs.readFileSync(f, 'utf8').split('\n').length + ' lines'));"
```
**Results**:
- `modules/calendar.js`: **1,796 lines** (Strict limit: < 2,000 lines; Headroom: **204 lines**)
- `modules/calendar-sync.js`: **871 lines** (Strict limit: < 2,000 lines; Headroom: **1,129 lines**)
- `dashboard.html`: **1,917 lines** (Strict limit: < 2,000 lines; Headroom: **83 lines**)

Both `modules/calendar.js` and `dashboard.html` are close to the 2,000-line ceiling enforced by `tests/recheck-all-tasks.cjs` and `tests/challenger-r4-empirical.cjs`. Any new logic must be compact or placed into `modules/calendar-sync.js` (which has ample headroom).

---

### 1.2 Legacy OAuth Triggers, Popup Flow, and `localStorage` Dependencies

#### A. Legacy OAuth Initiation and Popup Handlers
1. **`connectGoogleAccount()`** (`modules/calendar-sync.js`, lines 332–411):
   - Computes redirect URI:
     ```javascript
     const clientRedirect = (typeof window !== 'undefined' && window.location && window.location.origin)
       ? `${window.location.origin}/api/calendar/callback`
       : '';
     ```
   - Synchronously opens popup window to avoid browser popup blockers (line 348):
     ```javascript
     popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
     ```
   - Fetches OAuth URL from backend (line 357):
     ```javascript
     const authUrl = clientRedirect 
       ? `/api/calendar/auth?redirect_uri=${encodeURIComponent(clientRedirect)}` 
       : '/api/calendar/auth';
     const authRes = await calendarApiFetch(authUrl);
     const authData = await authRes.json();
     ```
   - Redirects popup to Google OAuth: `popup.location.href = authData.authUrl`, with fallback to top-level navigation: `window.location.href = authData.authUrl` (lines 369–377).
   - Starts a 1-second polling interval (lines 381–407) checking `popup.closed` with a 5-minute timeout guard, followed by checking `/api/calendar/status`.
2. **Modal Configuration and Redirect Card** (`modules/calendar-sync.js`, lines 651–725 & `dashboard.html`, lines 1641–1697):
   - In `openSyncModal()` (lines 655–671), checks `/api/calendar/status` and reads/sets `calSyncRedirectUri`. (Note: `tests/browser-cdp-test.cjs` lines 738–742 explicitly assert that `calSyncRedirectUri` and `btnCopyRedirectUri` DOM elements are removed from `dashboard.html`).
   - Line 703: Displays prompt:
     `"Google authentication required... Click <b>Sign in with Google</b> below to connect your real Google schedule."`
   - Line 713: Displays error prompt:
     `"Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on Vercel environment variables."`
   - In `dashboard.html` (lines 1666–1669):
     ```html
     <button onclick="LuminaCalendar.connectGoogleAccount()" class="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-black font-heading font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all hover:scale-101">
       <svg class="w-4 h-4" viewBox="0 0 24 24">...</svg>
       Sign in &amp; Sync with Google
     </button>
     ```
   - In `dashboard.html` (lines 1127–1129):
     ```html
     <button onclick="LuminaCalendar.openSyncModal()" class="w-full py-1.5 px-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
       <i data-lucide="link" class="w-3.5 h-3.5"></i> Google Account Sync
     </button>
     ```
3. **Cross-Window PostMessage & URL Listener** (`modules/calendar-sync.js`, lines 769–803):
   - Listens to window message for `GCAL_AUTH_SUCCESS` and `GCAL_AUTH_ERROR`.
   - Checks URL search parameter for `gcal_connected=true`.
4. **Calendar Core Delegators** (`modules/calendar.js`, lines 83, 86, 1731, 1735, 1745–1748):
   - Defines delegators:
     ```javascript
     const connectGoogleAccount = (...args) => (window.LuminaCalendarSync?.connectGoogleAccount ? window.LuminaCalendarSync.connectGoogleAccount(...args) : undefined);
     ```
   - Exports `connectGoogleAccount`, `copyRedirectUri`, and `saveSyncSettingsFromModal` on `window.LuminaCalendar`.

#### B. `localStorage` Token and State Dependencies
- `luminavista_calendar_settings_v1`:
  - `googleCalendarConnected` (boolean): read and written in `modules/calendar.js` (lines 73, 238, 258) and `modules/calendar-sync.js` (lines 27, 42, 315, 395, 503).
  - Used as an active gate before performing mutations and auto-sync:
    - `modules/calendar.js`:
      - Line 1056: `if (calendarSettings.googleCalendarConnected) pushEventToGoogle(calendarEvents[idx]);`
      - Line 1077: `if (calendarSettings.googleCalendarConnected) pushEventToGoogle(newEvent);`
      - Line 1092: `if (evt && evt.googleEventId && calendarSettings.googleCalendarConnected) deleteEventFromGoogle(evt.googleEventId);`
      - Line 1210: `if (calendarSettings.googleCalendarConnected) ... pushEventToGoogle(evt);`
      - Line 1398: `if (calendarSettings.googleCalendarConnected) pushEventToGoogle(newEvt);`
      - Line 1452: `if (calendarSettings.googleCalendarConnected) pushEventToGoogle(target);`
    - `modules/calendar-sync.js`:
      - Line 270: `if (settings.googleCalendarConnected) syncGoogleCalendar();`
      - Line 556: `if (!settings.googleCalendarConnected) return;`
      - Lines 808, 816, 824: guards periodic sync, focus sync, and visibility change.
  - `googleAccountEmail` (string): holds user's personal Google email (e.g. `roysubhadra40@gmail.com`).
  - `lastSyncError` (string | null): error message displayed on badge or in modal.
  - `lastSyncedAt` (string): ISO timestamp of last successful sync.
- `luminavista_calendar_events_v1`:
  - Stores local event cache (`calendarEvents` array).
  - Seeded by `AUTHENTIC_GOOGLE_CALENDAR_EVENTS` (`modules/calendar.js`, lines 101–235) when storage is empty.
  - Synced with cloud via `modules/cloud-sync.js` (lines 88–99, 244–335).

---

### 1.3 Analysis of Current Two-Way Mutation Logic

#### A. Event Addition / Creation
1. **From UI Modal** (`modules/calendar.js`, `saveEventFromModal()`, lines 1061–1085):
   - Reads form fields: `title`, `start`, `end`, `category`, `color`, `location`, `description`, `allDay`, `recurrence`, `isAutonomous`.
   - Generates ID: `newEvent.id = generateSecureEventId('evt')`.
   - Resolves conflicts via `aiRescheduleConflicts(newEvent)`.
   - Appends to `calendarEvents.push(newEvent)`.
   - If connected, dispatches: `pushEventToGoogle(newEvent)`.
   - Calls `saveCalendarEvents()` and `renderCalendar()`.
2. **From AI Auto-Plan** (`modules/calendar.js`, `aiAutoPlanDay()`, lines 1129–1228):
   - Plans day routine (6 blocks, respecting blackout 23:00–07:00 and lunch 12:30–13:30).
   - Generates IDs with prefix `evt_ai_`.
   - Appends events to `calendarEvents`.
   - If connected (lines 1210–1220): dispatches detached async loop:
     ```javascript
     if (calendarSettings.googleCalendarConnected) {
       (async () => {
         for (const evt of plannedEvents) {
           try { await pushEventToGoogle(evt); } catch (err) {}
         }
       })();
     }
     ```
   - Verified by `tests/challenger-calendar-empirical.cjs` (lines 165–179).
3. **From AI Directives** (`modules/calendar.js`, `handleAgentDirective()`, lines 1358–1407):
   - Parses LLM `[TOOL:SCHEDULE_EVENT action="create"]`.
   - If connected, calls `pushEventToGoogle(newEvt)`.

#### B. Event Editing / Update
1. **From UI Modal** (`modules/calendar.js`, `saveEventFromModal()`, lines 1046–1060):
   - Finds existing event index by `editingEventId`.
   - Mutates fields on `calendarEvents[idx]`.
   - If connected, dispatches `pushEventToGoogle(calendarEvents[idx])`.
   - Calls `saveCalendarEvents()` and `renderCalendar()`.
2. **From AI Directives** (`modules/calendar.js`, `handleAgentDirective()`, lines 1409–1461):
   - Matches event via `fuzzyFindEvent(directive.query)`.
   - Mutates properties.
   - If connected, dispatches `pushEventToGoogle(target)`.

#### C. Event Deletion
1. **From UI Modal / Event Click** (`modules/calendar.js`, `deleteEvent(id)`, lines 1087–1107):
   - Finds event by `id`.
   - If `evt && evt.googleEventId && calendarSettings.googleCalendarConnected`, calls `deleteEventFromGoogle(evt.googleEventId)`.
   - Cleans up linked scheduled tasks in AI Studio:
     ```javascript
     if (evt && evt.scheduledTaskId && window.scheduledTasks) {
       window.scheduledTasks = window.scheduledTasks.filter(t => t.id !== evt.scheduledTaskId);
       if (window.saveScheduledTasks) window.saveScheduledTasks();
     }
     ```
   - Filters `calendarEvents = calendarEvents.filter(e => e.id !== targetId)`.
   - Calls `saveCalendarEvents()`, `closeEventModal()`, `renderCalendar()`.
2. **From AI Directives** (`modules/calendar.js`, `handleAgentDirective()`, lines 1464–1481):
   - Finds matching event and calls `deleteEvent(target.id)`.

#### D. Network Mutation Execution (`modules/calendar-sync.js`)
1. **`pushEventToGoogle(evt)`** (lines 554–602):
   - All-Day Event Calculation:
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
     (Note: `tests/recheck-all-tasks.cjs` line 114 specifically asserts that `calSyncJs.includes("endDateStr <= startDateStr")`).
   - Determines `rawGoogleId = evt.googleEventId || (evt.id && evt.id.startsWith('gcal_') ? evt.id.replace(/^gcal_/, '') : undefined)`.
   - Sends HTTP POST to `/api/calendar/sync` with `{ googleEventId, summary, description, location, allDay, start, end }`.
   - On success: sets `evt.googleEventId = data.item.id` and calls `saveEvents()`.
2. **`deleteEventFromGoogle(googleEventId)`** (lines 604–614):
   - Strips prefix: `cleanId = String(googleEventId).replace(/^gcal_/, '')`.
   - Sends HTTP DELETE to `/api/calendar/sync?eventId=${encodeURIComponent(cleanId)}`.

#### E. Two-Way Reconcile on Pull (`modules/calendar-sync.js`, `syncGoogleCalendar()`, lines 413–552):
- Concurrency Mutex: Guards execution with `isSyncInProgress`.
- Pulls remote items via `calendarApiFetch('/api/calendar/sync')`.
- Filters out cancelled items: `activeItems = data.items.filter(item => item && item.status !== 'cancelled')` (asserted in `tests/recheck-all-tasks.cjs` line 117).
- Reconciles Remote Deletions: Removes local events with `googleEventId` not present in Google's active set.
- Reconciles Remote Upserts: Updates existing local events or creates new ones with `id: gcal_${item.id}`. RFC 5545 exclusive end date is subtracted by 1 day for all-day events.
- Reconciles Local Unpushed Events: Iterates over `calendarEvents.filter(e => !e.googleEventId)` and calls `pushEventToGoogle(localEvt)`.
- Updates `googleCalendarConnected: true` BEFORE pushing unpushed events (asserted in `tests/recheck-all-tasks.cjs` line 122).
- Silent vs. Manual Toasts: When `isManual === true`, calls `window.showToast("Google Calendar Synced", ...)` (asserted in `tests/features.test.cjs` line 1552). When `isManual === false`, runs 100% silently (asserted in line 1548).

---

### 1.4 Auto-Sync Operations and Concurrency Safeguards

1. **Mount Auto-Sync**:
   - `modules/calendar-sync.js` (lines 860–868):
     Calls `checkBackendConnectionStatus()` on `DOMContentLoaded` or immediately if document is ready.
   - `modules/calendar.js` (lines 245–246):
     Calls `updateSyncStatusBadge()` and `checkBackendConnectionStatus()` on storage load.
   - `checkBackendConnectionStatus()`:
     Calls `/api/calendar/status`. If connected, sets settings and immediately triggers `await syncGoogleCalendar()`.
2. **Window / Tab Focus Auto-Sync**:
   - `modules/calendar-sync.js` (lines 814–819):
     ```javascript
     window.addEventListener('focus', () => {
       const settings = getSettings();
       if (settings.googleCalendarConnected) {
         triggerAutoSync();
       }
     });
     ```
3. **Visibility Change Auto-Sync**:
   - `modules/calendar-sync.js` (lines 823–828):
     ```javascript
     document.addEventListener('visibilitychange', () => {
       if (document.visibilityState === 'visible') {
         triggerAutoSync();
       }
     });
     ```
4. **Periodic Background Auto-Sync**:
   - `modules/calendar-sync.js` (lines 806–811):
     ```javascript
     setInterval(() => {
       const settings = getSettings();
       if (settings.googleCalendarConnected) {
         syncGoogleCalendar();
       }
     }, 5 * 60 * 1000);
     ```
5. **Debounce & Concurrency Mutex (`triggerAutoSync()` & `syncGoogleCalendar()`)**:
   - Lines 265–273:
     `triggerAutoSync()` clamps dispatches to at most once every 15 seconds (`now - lastAutoSyncTimestamp < 15000`).
   - Lines 414–416 & line 549:
     `if (isSyncInProgress) return;` with `finally { isSyncInProgress = false; }`.
   - Verified by `tests/challenger-calendar-empirical.cjs` Section 3 (10 concurrency assertions).

---

### 1.5 UI Configuration Warnings & Connection Status Badges

1. **Header Sync Badge (`#calSyncStatusBadge`)** (`dashboard.html`, lines 1044–1046):
   - Click handler: `onclick="LuminaCalendar.openSyncModal()"`.
   - Rendered states (`modules/calendar-sync.js`, `updateSyncStatusBadge()`, lines 621–649):
     - **Syncing**: Cyan ping dot with `"Syncing..."`.
     - **Connected**: Emerald pulse dot with `"Google Synced"` (and email suffix on `sm` screens).
     - **Sync Error**: Rose dot with `"Sync Error"`.
     - **Disconnected**: Amber dot with `"Local Sovereign"` or `"Sign in with Google"`.
2. **Sync Settings Modal (`#calendarSyncModal`)** (`dashboard.html`, lines 1641–1697):
   - Status badge: `#calSyncModalStatusBadge` (`"Active Sync"`, `"Login Required"`, `"Re-auth Required"`, `"Awaiting Vercel Env"`).
   - Status text: `#calSyncModalStatusText` (renders details regarding Google credentials or synchronization errors).
   - Immediate Sync Button (line 1671):
     `<button onclick="LuminaCalendar.syncGoogleCalendar(true)" ...>`
   - Export / Import .ics buttons (lines 1680–1686).

---

## 2. Logic Chain

1. **Constraint Logic (Line Count Preservation)**:
   - Observation: `dashboard.html` has 1,917 lines (headroom: 83) and `modules/calendar.js` has 1,796 lines (headroom: 204), while `modules/calendar-sync.js` has 871 lines (headroom: 1,129).
   - Reasoning: Modifying `dashboard.html` must strictly replace or shorten markup rather than adding large blocks. Any rich diagnostic formatting or API communication must reside in `modules/calendar-sync.js` to preserve the repository-wide <2,000 line rule.
2. **Zero-Login Architecture Shift**:
   - Observation: Current frontend has `connectGoogleAccount()` with popup window creation, redirect URI configuration, postMessage listeners, and OAuth state polling.
   - Requirement: `ORIGINAL_REQUEST.md` R3 states: *"Remove all legacy 'Connect Google Calendar' / 'Sign in with Google' OAuth popup triggers and localStorage token dependencies."*
   - Reasoning: In the Google Service Account architecture, authentication is purely server-to-server (RS256 JWT minted on the backend via `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`). The browser client never signs into Google and never initiates OAuth popups.
   - Deduction:
     - `connectGoogleAccount()` should be converted into a trigger for immediate status check / sync (`syncGoogleCalendar(true)`).
     - The "Sign in & Sync with Google" button in `#calendarSyncModal` should be replaced with a Service Account Status & Sharing card.
     - The popup code, 5-minute polling loop, `about:blank` window open, and postMessage event listeners can be completely neutralized/pruned.
3. **Auto-Sync Gate Decoupling**:
   - Observation: In `modules/calendar.js` and `modules/calendar-sync.js`, mutation dispatches and auto-sync timers are gated by `if (calendarSettings.googleCalendarConnected)`.
   - Reasoning: In a Service Account model, "connected" simply means the backend is configured (`status === 'ok'` or `connected === true` from `/api/calendar/status`).
   - Deduction: When `checkBackendConnectionStatus()` runs on mount, if `/api/calendar/status` reports the Service Account is configured and calendar is reachable, it sets `googleCalendarConnected: true` (and stores service account email). This ensures all existing mutation dispatch checks (`saveEventFromModal`, `aiAutoPlanDay`, `deleteEvent`, `handleAgentDirective`) immediately push changes without requiring any invasive refactor of `modules/calendar.js`.
4. **Non-Blocking UI Diagnostic Warnings**:
   - Observation: If `GOOGLE_CALENDAR_ID` is unconfigured, or if the user hasn't shared their Google Calendar with the service account email, the backend will return diagnostic warnings.
   - Reasoning: The client UI must inform the administrator clearly without crashing or blocking local calendar functionality.
   - Deduction:
     - If `/api/calendar/status` indicates unconfigured or sharing missing:
       - Header badge `#calSyncStatusBadge` displays amber `"Service Account Unconfigured"` or `"Sharing Required"`.
       - Tooltip explains the issue.
       - `#calSyncModalStatusText` displays clear instructions: *"Share your Google Calendar with `<service_account_email>` with 'Make changes to events' permission."*
5. **Preserving Verification Test Invariants**:
   - Observation: Existing suites enforce exact string checks:
     - `recheck-all-tasks.cjs`: checks `"endDateStr <= startDateStr"`, `"item && item.status !== 'cancelled'"`, `"googleCalendarConnected: true"` before unpushed loop, `"5 * 60 * 1000"`, `"window.addEventListener('focus'"`, `"min-h-[90px]"`, `"ring-2 ring-inset ring-cyan-400"`, and the date 1 month name span.
     - `features.test.cjs`: checks `syncGoogleCalendar(false)` is silent and `syncGoogleCalendar(true)` shows toast `"Google Calendar Synced"`.
     - `challenger-calendar-empirical.cjs`: checks `getApiOrigin()`, `aiAutoPlanDay()`, and concurrency mutex on `syncGoogleCalendar()`.
   - Deduction: All of these code structures and exact substrings MUST be strictly maintained during the M3 refactor.

---

## 3. Caveats

1. **Backend Dependency**:
   - Frontend auto-sync and mutations depend on the Service Account routes in `api/calendar.js` (Milestones M1 and M2). The frontend should gracefully handle endpoints returning either the new schema (`{ status: "ok", connected: true }`) or the legacy schema (`{ configured: true, connected: true }`).
2. **Backward-Compatible Endpoint Routing**:
   - Currently, `modules/calendar-sync.js` calls `/api/calendar/status` and `/api/calendar/sync`. In the new backend architecture, `/api/calendar` is the root controller. The backend should route both `/api/calendar?action=sync` and `/api/calendar/sync` identically to guarantee zero client regression.
3. **No Caveats on Local Calendar Isolation**:
   - If the backend returns an error or is unconfigured, sovereign local calendar functionality (viewing, adding, editing, deleting events stored in `localStorage`) continues to function 100% unimpeded.

---

## 4. Conclusion & Actionable Migration Plan for Milestone 3

### Core Assessment
The client calendar implementation is cleanly modularized between `modules/calendar.js` (UI views, local event state, AI scheduler) and `modules/calendar-sync.js` (API communication, sync engine, badge management).

Migrating to the zero-login Service Account architecture requires modifications concentrated primarily in:
1. `modules/calendar-sync.js`:
   - Neutralize `connectGoogleAccount()` and remove the popup/redirect code.
   - Enhance `checkBackendConnectionStatus()` to parse Service Account diagnostic responses and update the UI accordingly.
   - Keep `pushEventToGoogle()`, `deleteEventFromGoogle()`, and `syncGoogleCalendar()` calling the backend API with the concurrency mutex and debounce safeguards intact.
   - Update `updateSyncStatusBadge()` and `openSyncModal()` to render Service Account connection status, email, and calendar sharing diagnostics.
2. `dashboard.html`:
   - In `#calendarSyncModal`, replace the "Sign in & Sync with Google" OAuth button with a Service Account Status & Sharing Information panel.
   - In the left sidebar (line 1128), update the button label from "Google Account Sync" to "Google Calendar Sync".
   - Keep total line count strictly < 2,000 lines (currently 1,917).
3. `modules/calendar.js`:
   - Keep delegator functions intact (`syncGoogleCalendar`, `pushEventToGoogle`, `deleteEventFromGoogle`, etc.).
   - Ensure `connectGoogleAccount` delegates safely to `syncGoogleCalendar(true)`.
   - Preserve month view formatting and line count strictly < 2,000 lines.

---

## 5. Verification Method

### 5.1 Independent Test Commands
After implementing Milestone 3, verify the entire system using the following project test commands:

```bash
# 1. Syntax Validation across all JS modules
node tests/lint.cjs

# 2. Comprehensive 5-Point Architecture & Invariants Audit (42 assertions)
node tests/recheck-all-tasks.cjs

# 3. Calendar Empirical Challenge Suite (63 assertions)
node tests/challenger-calendar-empirical.cjs

# 4. Full Unit Test Suite (1,102 assertions)
node tests/features.test.cjs

# 5. Real Google Chrome Browser CDP Test Suite (122 tests)
node tests/browser-cdp-test.cjs

# 6. Repository Line Count Check (< 2,000 lines)
node -e "const fs = require('fs'); ['modules/calendar.js', 'modules/calendar-sync.js', 'dashboard.html'].forEach(f => console.log(f + ': ' + fs.readFileSync(f, 'utf8').split('\n').length + ' lines'));"
```

### 5.2 Files to Inspect
- `modules/calendar.js` (lines 1045–1105, 1720–1780)
- `modules/calendar-sync.js` (lines 305–415, 620–725, 805–870)
- `dashboard.html` (lines 1040–1075, 1115–1135, 1640–1695)

### 5.3 Invalidation Conditions
The migration is invalidated if:
1. Any OAuth popup (`window.open`) or redirect to `accounts.google.com` is triggered by clicking sync in the UI.
2. `modules/calendar.js`, `modules/calendar-sync.js`, or `dashboard.html` exceed 1,999 lines.
3. Silent auto-sync on focus/visibility throws unhandled exceptions when unconfigured.
4. `recheck-all-tasks.cjs`, `challenger-calendar-empirical.cjs`, `features.test.cjs`, or `browser-cdp-test.cjs` fail any assertions.
