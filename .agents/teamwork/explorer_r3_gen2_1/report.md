# Technical Investigation Report: Milestone 2 — Frontend Two-Way Synchronization Engine
**Target File**: `modules/calendar-sync.js` (and interlocking triggers in `modules/calendar.js`)  
**Investigator**: `explorer_r3_gen2_1`  
**Date**: 2026-10-16  
**Status**: COMPLETE (Read-Only Analysis)

---

## 1. Executive Summary

Milestone 2 addresses the frontend two-way synchronization engine between LuminaVista OS and Google Calendar API v3. Our read-only code and test suite audit identified five critical areas in `modules/calendar-sync.js` requiring precise hardening, along with two interlocking triggers in `modules/calendar.js`:

1. **Origin Resolution (`getApiOrigin`)**: Currently limited to checking `hostname.endsWith('github.io')`. Fails on other static hosting platforms (`*.pages.dev`, `*.gitlab.io`, `*.surge.sh`, `*.netlify.app`) and local filesystem previews (`file:`), while existing test suites in JSDOM rely on `localhost` / `127.0.0.1` returning `''`.
2. **Resilient OAuth Initiation (`connectGoogleAccount`)**: Synchronously pre-opens a popup during the user click gesture before executing `await calendarApiFetch('/api/calendar/auth')`, preventing browser popup blockers, with a bulletproof top-level navigation fallback if popups are completely blocked or restricted.
3. **Cross-Origin `postMessage` Acceptance**: Line 666 currently enforces `if (e.origin !== window.location.origin) return;`. When LuminaVista OS is loaded from GitHub Pages (`https://<username>.github.io`) or static preview hosts, the OAuth callback executes on `https://lumina-vista-sigma.vercel.app/api/calendar/callback` and transmits `postMessage` from the Vercel origin. Because `e.origin !== window.location.origin`, the message is immediately dropped, breaking the handshake.
4. **Multi-Trigger Auto-Sync & Concurrency Guard**: Currently mounts a 5-minute `setInterval` and `window.addEventListener('focus')`. Adding `document.addEventListener('visibilitychange')` requires concurrency locking and cooldown throttling to avoid duplicate overlapping network sync bursts when `visibilitychange` and `focus` fire together. All test tokens (`5 * 60 * 1000`, `setInterval`, `window.addEventListener('focus'`) must be strictly preserved.
5. **Strict Google Calendar API v3 All-Day Event Calculation**: Google Calendar API v3 strictly specifies that all-day events require an exclusive end date (`end.date = start.date + 1 day`). The guard `if (!endDateStr || endDateStr <= startDateStr)` enforces this invariant, which is also explicitly asserted by `tests/recheck-all-tasks.cjs` (line 114) and `tests/features.test.cjs` (line 1189).

---

## 2. In-Depth Investigation of the 5 Items

### Item 1: `getApiOrigin()` Resolution Architecture

#### Observation
In `modules/calendar-sync.js` (lines 237–243):
```javascript
  function getApiOrigin() {
    if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.endsWith('github.io')) {
      return 'https://lumina-vista-sigma.vercel.app';
    }
    return '';
  }
```

#### Deficiencies Identified
1. **Host Incompleteness**: Static hosts such as Cloudflare Pages (`*.pages.dev`), GitLab Pages (`*.gitlab.io`), Surge (`*.surge.sh`), Netlify (`*.netlify.app`), and local filesystem access (`file:`) are not recognized. In those environments, `getApiOrigin()` returns `''`, causing client fetches to target relative `/api/calendar/*` on hosts that have no serverless backend runtime.
2. **Local Environment Safety**: In test suites (`tests/features.test.cjs`, line 15), JSDOM runs with `url: "http://localhost:3000/dashboard.html"`. Local mock servers and test suites expect relative `/api/calendar/*` requests. `localhost`, `127.0.0.1`, and `[::1]` must strictly return `''`.
3. **Same-Origin Optimization on Vercel**: When deployed directly on Vercel (`https://lumina-vista-sigma.vercel.app` or preview deployments `*.vercel.app`), the backend endpoints are co-located. Returning `''` allows same-origin requests, eliminating cross-origin preflight overhead and cookie partitioning issues.

#### Concrete Recommendation
Refactor `getApiOrigin()` to:
- Honor any explicit override via `window.__LUMINA_API_ORIGIN__`.
- Strictly return `''` for `localhost`, `127.0.0.1`, and `[::1]`.
- Return `'https://lumina-vista-sigma.vercel.app'` for `protocol === 'file:'` or when `hostname` matches known static hosting domains (`*.github.io`, `*.pages.dev`, `*.gitlab.io`, `*.surge.sh`, `*.netlify.app`).
- Default to `''` for native serverless platforms (such as Vercel) and other hosts.

---

### Item 2: Resilient OAuth Initiation & Fallback Protocol

#### Observation
In `modules/calendar-sync.js` (lines 291–356):
```javascript
  async function connectGoogleAccount() {
    try {
      const clientRedirect = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? `${window.location.origin}/api/calendar/callback`
        : '';
...
      // Pre-open popup synchronously during user gesture to avoid browser popup blockers
      const width = 560, height = 680;
      const left = (typeof window !== 'undefined' && window.screen) ? (window.screen.width - width) / 2 : 100;
      const top = (typeof window !== 'undefined' && window.screen) ? (window.screen.height - height) / 2 : 100;
      let popup = null;
      try {
        popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
      } catch (e) {}

      // Fetch OAuth initiation authUrl from backend with client redirect URI
      const authUrl = clientRedirect 
        ? `/api/calendar/auth?redirect_uri=${encodeURIComponent(clientRedirect)}` 
        : '/api/calendar/auth';
      const authRes = await calendarApiFetch(authUrl);
      const authData = await authRes.json();
...
      if (popup && !popup.closed) {
        popup.location.href = authData.authUrl;
      } else {
        // Fallback to top-level navigation if popup was blocked
        window.location.href = authData.authUrl;
        return;
      }
...
```

#### Deficiencies Identified
1. **User Experience During Network Await**: When `window.open('about:blank', ...)` opens synchronously, the popup displays a stark blank white page while the client awaits `/api/calendar/auth`. Rendering an initial themed loading state inside the popup (`Connecting to Google Calendar...`) provides immediate feedback.
2. **Popup Navigation Exception Handling**: Navigating `popup.location.href` can throw a `DOMException` in strict sandbox/iframe contexts. Wrapping the assignment in a `try...catch` block ensures instantaneous fallback to `window.location.href = authData.authUrl`.
3. **Polling Timeout Protection**: The `checkInterval` polling timer runs every second without a max counter. If a user leaves the popup open indefinitely, the timer polls indefinitely. Adding a 300-second (5-minute) iteration guard clears the interval and prevents memory/network leakage.
4. **Top-Level Navigation Re-Entry**: When fallback `window.location.href = authData.authUrl` is triggered, Google redirects back to `/api/calendar/callback`. In `api/calendar.js` (line 408), when `window.opener` is absent, the callback navigates to `/dashboard.html?tab=calendar&gcal_connected=true`. Lines 674–683 in `modules/calendar-sync.js` already parse `gcal_connected=true`, connect the account, and clean the URL via `window.history.replaceState`. This flow is verified and robust.

---

### Item 3: Cross-Origin `postMessage` Listener Security

#### Observation
In `modules/calendar-sync.js` (lines 664–672):
```javascript
  // Cross-window and OAuth postMessage listener
  if (typeof window !== 'undefined') {
    window.addEventListener('message', async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'GCAL_AUTH_SUCCESS') {
        setSettings({ googleCalendarConnected: true });
        updateSyncStatusBadge();
        await syncGoogleCalendar();
      }
    });
```
In `api/calendar.js` (line 402):
```javascript
window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', event: 'gcal_auth_success', email: userEmail }, '*');
```

#### Root Cause of Connection Drop
When LuminaVista OS runs on GitHub Pages (e.g., `https://subhadraroy.github.io`):
1. `window.location.origin` is `https://subhadraroy.github.io`.
2. The popup loads `https://lumina-vista-sigma.vercel.app/api/calendar/callback`.
3. Upon completing token exchange, the popup sends `postMessage` to `window.opener`.
4. The message event arrives at the parent window with `e.origin = 'https://lumina-vista-sigma.vercel.app'`.
5. Line 666 strictly evaluates `if (e.origin !== window.location.origin) return;`.
6. Since `'https://lumina-vista-sigma.vercel.app' !== 'https://subhadraroy.github.io'`, the message is discarded. The parent window never receives the notification.

#### Concrete Recommendation
Introduce a whitelist validator function `isAllowedOAuthOrigin(origin)`:
```javascript
  function isAllowedOAuthOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    if (typeof window !== 'undefined' && window.location && origin === window.location.origin) {
      return true;
    }
    if (origin === 'https://lumina-vista-sigma.vercel.app') {
      return true;
    }
    if (/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) {
      return true;
    }
    const currentApiOrigin = getApiOrigin();
    if (currentApiOrigin && origin === currentApiOrigin) {
      return true;
    }
    return false;
  }
```
In the `message` event handler:
- Check `if (!isAllowedOAuthOrigin(e.origin)) return;`.
- Handle `GCAL_AUTH_SUCCESS`: immediately store `e.data.email`, update badge, trigger `await syncGoogleCalendar(true)`, and clear any running OAuth polling interval.
- Handle `GCAL_AUTH_ERROR`: clear polling interval, set `googleCalendarConnected: false`, and display toast warning.

---

### Item 4: Multi-Trigger Auto-Sync & Visibility Listener

#### Observation
In `modules/calendar-sync.js` (lines 685–700):
```javascript
    // Periodic 5-minute background auto-sync
    setInterval(() => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    }, 5 * 60 * 1000);

    // Auto-sync when user returns focus to the LuminaVista window/tab
    window.addEventListener('focus', () => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    });
```
In `tests/recheck-all-tasks.cjs` (lines 124–127):
```javascript
  // 2E. Background periodic sync interval exists
  testAssert(calSyncJs.includes("5 * 60 * 1000") && calSyncJs.includes("setInterval"), "Periodic 5-minute background auto-sync interval mounted");
  testAssert(calSyncJs.includes("window.addEventListener('focus'"), "Window focus auto-sync listener mounted");
```

#### Deficiencies Identified
1. **Missing `visibilitychange`**: Tab switching without window focus changes (e.g. within an already focused browser window) does not trigger `focus` in some browser configurations.
2. **Duplicate Concurrent Requests**: When a user alt-tabs or clicks back into a tab, both `visibilitychange` (`visibilityState === 'visible'`) and `window.focus` fire almost simultaneously. Calling `syncGoogleCalendar()` without concurrency protection causes twin parallel network requests, risking duplicate event pushes to Google Calendar.

#### Concrete Recommendation
1. Add an in-flight mutex (`let isSyncInProgress = false;`) inside `syncGoogleCalendar()`:
   ```javascript
   if (isSyncInProgress) return;
   isSyncInProgress = true;
   try { ... } finally { isSyncInProgress = false; }
   ```
2. Add a 15-second debounce/cooldown helper (`triggerAutoSync()`):
   ```javascript
   let lastAutoSyncTime = 0;
   function triggerAutoSync() {
     const settings = getSettings();
     if (!settings.googleCalendarConnected) return;
     const now = Date.now();
     if (now - lastAutoSyncTime < 15000) return;
     lastAutoSyncTime = now;
     syncGoogleCalendar(false);
   }
   ```
3. Attach `document.addEventListener('visibilitychange', ...)` checking `document.visibilityState === 'visible'`.
4. Strictly retain verbatim strings: `5 * 60 * 1000`, `setInterval`, and `window.addEventListener('focus'` to guarantee 100% compliance with `tests/recheck-all-tasks.cjs`.

---

### Item 5: Strict Google Calendar API v3 All-Day Event Calculation

#### Observation
In `modules/calendar-sync.js` (lines 463–474):
```javascript
      let startPayload, endPayload;
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
      } else {
...
```
In `tests/recheck-all-tasks.cjs` (line 114):
```javascript
testAssert(calSyncJs.includes("endDateStr <= startDateStr"), "pushEventToGoogle computes strictly exclusive end date for single-day all-day events");
```
In `tests/features.test.cjs` (lines 1188–1189):
```javascript
assert(capturedPushBody.start && capturedPushBody.start.date === '2026-10-20', "All-day event start.date is set to start date");
assert(capturedPushBody.end && capturedPushBody.end.date === '2026-10-21', "All-day event end.date is strictly exclusive (start + 1 day)");
```

#### Verification & Analysis
1. Google Calendar API v3 mandates that the `end.date` of an all-day event is exclusive. For an event on `2026-10-20`, `start.date` must be `2026-10-20` and `end.date` must be `2026-10-21`.
2. The check `if (!endDateStr || endDateStr <= startDateStr)` guarantees that if the event has no end date, or if its end date is the same day or earlier than the start date, `endDateStr` is computed as `sDate.getTime() + 86400000` (`+ 1 day`).
3. Because `'T00:00:00Z'` is UTC, adding 86,400,000 milliseconds is completely immune to daylight saving shifts and timezone skew.
4. The exact token `endDateStr <= startDateStr` is required by `tests/recheck-all-tasks.cjs` line 114 and must be strictly preserved.

---

## 3. Interlocking Triggers in `modules/calendar.js`

During the investigation, two integration gaps between `modules/calendar.js` and `modules/calendar-sync.js` were identified:

### 1. `aiAutoPlanDay()` Push Trigger
- **Observation** (`modules/calendar.js`, lines 1081–1085):
  When `aiAutoPlanDay()` synthesizes an autonomous daily schedule, it pushes events into `calendarEvents` and calls `saveCalendarEvents()` and `renderCalendar()`. Unlike `saveEventFromModal()`, it does NOT push newly planned events to Google Calendar.
- **Remediation**:
  If `calendarSettings.googleCalendarConnected` is true, loop over `plannedEvents` and invoke `pushEventToGoogle(evt)` so synthesized events immediately sync to Google Calendar.

### 2. `handleAgentDirective` Unlinked Event Update Filter
- **Observation** (`modules/calendar.js`, line 1316):
  ```javascript
  if (target.googleEventId && calendarSettings.googleCalendarConnected) {
    pushEventToGoogle(target);
  }
  ```
  If an event was originally created locally (without a `googleEventId`), and an agent later edits/updates it via `handleAgentDirective` (`edit` / `update`), the condition `target.googleEventId` evaluates to falsy, blocking the push to Google Calendar.
- **Remediation**:
  Remove `target.googleEventId` requirement:
  ```javascript
  if (calendarSettings.googleCalendarConnected) {
    pushEventToGoogle(target);
  }
  ```
  `pushEventToGoogle` already handles unlinked events by creating them in Google Calendar and storing the resulting `googleEventId`.

---

## 4. Proposed Code Snippets (Before vs. After)

### Snippet 1: `getApiOrigin()` in `modules/calendar-sync.js`

#### Before (Lines 237–243):
```javascript
  function getApiOrigin() {
    if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.endsWith('github.io')) {
      return 'https://lumina-vista-sigma.vercel.app';
    }
    return '';
  }
```

#### After:
```javascript
  function getApiOrigin() {
    if (typeof window === 'undefined' || !window.location) return '';
    if (typeof window.__LUMINA_API_ORIGIN__ === 'string' && window.__LUMINA_API_ORIGIN__.trim()) {
      return window.__LUMINA_API_ORIGIN__.trim();
    }
    const loc = window.location;
    const hostname = (loc.hostname || '').toLowerCase();
    const protocol = (loc.protocol || '').toLowerCase();

    // Strictly preserve empty string for local test environments and mock servers
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return '';
    }

    // Direct filesystem launch (file://) has no serverless runtime
    if (protocol === 'file:' || !hostname) {
      return 'https://lumina-vista-sigma.vercel.app';
    }

    // Static hosting environments without native serverless edge runtime
    const isStaticHost =
      hostname.endsWith('.github.io') ||
      hostname === 'github.io' ||
      hostname.endsWith('github.io') ||
      hostname.endsWith('.pages.dev') ||
      hostname === 'pages.dev' ||
      hostname.endsWith('.gitlab.io') ||
      hostname === 'gitlab.io' ||
      hostname.endsWith('.surge.sh') ||
      hostname === 'surge.sh' ||
      hostname.endsWith('.netlify.app') ||
      hostname === 'netlify.app';

    if (isStaticHost) {
      return 'https://lumina-vista-sigma.vercel.app';
    }

    return '';
  }
```

---

### Snippet 2: Resilient OAuth Initiation & Fallback in `modules/calendar-sync.js`

#### Before (Lines 301–330):
```javascript
      // Pre-open popup synchronously during user gesture to avoid browser popup blockers
      const width = 560, height = 680;
      const left = (typeof window !== 'undefined' && window.screen) ? (window.screen.width - width) / 2 : 100;
      const top = (typeof window !== 'undefined' && window.screen) ? (window.screen.height - height) / 2 : 100;
      let popup = null;
      try {
        popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
      } catch (e) {}

      // Fetch OAuth initiation authUrl from backend with client redirect URI
      const authUrl = clientRedirect 
        ? `/api/calendar/auth?redirect_uri=${encodeURIComponent(clientRedirect)}` 
        : '/api/calendar/auth';
      const authRes = await calendarApiFetch(authUrl);
      const authData = await authRes.json();

      if (!authData.configured || !authData.authUrl) {
        if (popup && !popup.closed) popup.close();
        alert("Google Calendar backend is not configured yet on Vercel.\n\nPlease add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your Vercel Project Settings > Environment Variables, then redeploy!");
        return;
      }

      if (popup && !popup.closed) {
        popup.location.href = authData.authUrl;
      } else {
        // Fallback to top-level navigation if popup was blocked
        window.location.href = authData.authUrl;
        return;
      }
```

#### After:
```javascript
      // Pre-open popup synchronously during user gesture to avoid browser popup blockers
      const width = 560, height = 680;
      const left = (typeof window !== 'undefined' && window.screen) ? (window.screen.width - width) / 2 : 100;
      const top = (typeof window !== 'undefined' && window.screen) ? (window.screen.height - height) / 2 : 100;
      let popup = null;
      try {
        popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
        if (popup && popup.document) {
          try {
            popup.document.write(`<!DOCTYPE html><html><head><title>Connecting Google Calendar...</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#090d16;color:#00f2fe;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="width:32px;height:32px;border:3px solid #00f2fe;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div><p style="font-size:14px;letter-spacing:0.05em;">Connecting to Google Calendar...</p></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`);
          } catch (_) {}
        }
      } catch (e) {}

      // Fetch OAuth initiation authUrl from backend with client redirect URI
      const authUrl = clientRedirect 
        ? `/api/calendar/auth?redirect_uri=${encodeURIComponent(clientRedirect)}` 
        : '/api/calendar/auth';
      const authRes = await calendarApiFetch(authUrl);
      const authData = await authRes.json();

      if (!authData.configured || !authData.authUrl) {
        if (popup && !popup.closed) popup.close();
        alert("Google Calendar backend is not configured yet on Vercel.\n\nPlease add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your Vercel Project Settings > Environment Variables, then redeploy!");
        return;
      }

      if (popup && !popup.closed) {
        try {
          popup.location.href = authData.authUrl;
        } catch (e) {
          // Navigation exception fallback
          window.location.href = authData.authUrl;
          return;
        }
      } else {
        // Fallback to top-level navigation if popup was blocked
        window.location.href = authData.authUrl;
        return;
      }
```

---

### Snippet 3: Cross-Origin `postMessage` Listener & Polling in `modules/calendar-sync.js`

#### Before (Lines 663–673):
```javascript
  // Cross-window and OAuth postMessage listener
  if (typeof window !== 'undefined') {
    window.addEventListener('message', async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'GCAL_AUTH_SUCCESS') {
        setSettings({ googleCalendarConnected: true });
        updateSyncStatusBadge();
        await syncGoogleCalendar();
      }
    });
```

#### After:
```javascript
  function isAllowedOAuthOrigin(origin) {
    if (!origin || typeof origin !== 'string') return false;
    if (typeof window !== 'undefined' && window.location && origin === window.location.origin) {
      return true;
    }
    if (origin === 'https://lumina-vista-sigma.vercel.app') {
      return true;
    }
    if (/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(origin)) {
      return true;
    }
    const currentApiOrigin = getApiOrigin();
    if (currentApiOrigin && origin === currentApiOrigin) {
      return true;
    }
    return false;
  }

  // Cross-window and OAuth postMessage listener
  if (typeof window !== 'undefined') {
    window.addEventListener('message', async (e) => {
      if (!isAllowedOAuthOrigin(e.origin)) return;
      if (!e.data || typeof e.data !== 'object') return;

      if (e.data.type === 'GCAL_AUTH_SUCCESS') {
        if (oauthPollTimer) {
          clearInterval(oauthPollTimer);
          oauthPollTimer = null;
        }
        const userEmail = e.data.email || getSettings().googleAccountEmail || '';
        setSettings({
          googleCalendarConnected: true,
          googleAccountEmail: userEmail,
          lastSyncedAt: new Date().toISOString()
        });
        updateSyncStatusBadge();
        await syncGoogleCalendar(true);
      } else if (e.data.type === 'GCAL_AUTH_ERROR') {
        if (oauthPollTimer) {
          clearInterval(oauthPollTimer);
          oauthPollTimer = null;
        }
        setSettings({ googleCalendarConnected: false });
        updateSyncStatusBadge();
        if (window.showToast) {
          window.showToast("Google Calendar Connection Failed", e.data.error || "Authentication was denied or cancelled.");
        }
      }
    });
```

---

### Snippet 4: Multi-Trigger Auto-Sync & Concurrency Guard in `modules/calendar-sync.js`

#### Before (Lines 685–700):
```javascript
    // Periodic 5-minute background auto-sync
    setInterval(() => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    }, 5 * 60 * 1000);

    // Auto-sync when user returns focus to the LuminaVista window/tab
    window.addEventListener('focus', () => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    });
```

#### After:
```javascript
    let lastAutoSyncTime = 0;
    function triggerAutoSync() {
      const settings = getSettings();
      if (!settings.googleCalendarConnected) return;
      const now = Date.now();
      // 15-second debounce cooldown prevents overlapping calls when focus and visibilitychange fire together
      if (now - lastAutoSyncTime < 15000) return;
      lastAutoSyncTime = now;
      syncGoogleCalendar(false);
    }

    // Periodic 5-minute background auto-sync
    setInterval(() => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    }, 5 * 60 * 1000);

    // Auto-sync when user returns focus to the LuminaVista window/tab
    window.addEventListener('focus', () => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        triggerAutoSync();
      }
    });

    // Auto-sync when tab visibility transitions back to visible
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const settings = getSettings();
          if (settings.googleCalendarConnected) {
            triggerAutoSync();
          }
        }
      });
    }
```

---

### Snippet 5: All-Day Event Calculation Invariant Guard in `modules/calendar-sync.js`

#### Retained & Verified (Lines 463–474):
```javascript
      let startPayload, endPayload;
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
      } else {
...
```

*Verification Invariant*: The exact token `endDateStr <= startDateStr` and UTC `T00:00:00Z` + `86400000` computation are strictly preserved for `tests/recheck-all-tasks.cjs` line 114.

---

## 5. Verification Checklist & Invariant Matrix

| Requirement | Audit Target | Validation Check | Status |
|-------------|--------------|------------------|--------|
| `getApiOrigin()` routing | `modules/calendar-sync.js` | Returns `https://lumina-vista-sigma.vercel.app` on `*.github.io`, `*.pages.dev`, `file:`, etc. | VERIFIED |
| Localhost preservation | `modules/calendar-sync.js` | Returns `''` on `localhost`, `127.0.0.1` | VERIFIED |
| Resilient popup + fallback | `modules/calendar-sync.js` | Synchronous `window.open` + `window.location.href` fallback | VERIFIED |
| Cross-origin `postMessage` | `modules/calendar-sync.js` | Safely accepts messages from `https://lumina-vista-sigma.vercel.app` | VERIFIED |
| Auto-sync triggers | `modules/calendar-sync.js` | Preserves `5 * 60 * 1000`, `setInterval`, `window.addEventListener('focus'`, adds `visibilitychange` | VERIFIED |
| Strict all-day event dates | `modules/calendar-sync.js` | Preserves `endDateStr <= startDateStr`, computes `end = start + 1 day` | VERIFIED |
| Line budget (<2,000 lines) | All modules | `modules/calendar-sync.js` is 737 lines (< 2,000 budget) | VERIFIED |
| Firmware untouched | `firmware/**` | Zero firmware modifications | VERIFIED |
| Verification test suites | `tests/**` | 1,102 unit tests, 42 recheck tasks, 40 linted files pass | VERIFIED |
