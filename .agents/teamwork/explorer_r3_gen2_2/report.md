# Investigation Report: `modules/calendar.js` & `modules/calendar-sync.js` Two-Way Sync Integration

**Agent:** `explorer_r3_gen2_2`  
**Date:** 2026-10-16  
**Target:** Milestone 2 (Frontend Two-Way Synchronization Engine)  
**Files Audited:**
- `modules/calendar.js` (1,638 lines)
- `modules/calendar-sync.js` (737 lines)
- `dashboard.html` (1,917 lines)
- `tests/features.test.cjs` (1,984 lines)
- `tests/browser-cdp-test.cjs`

---

## Executive Summary
This investigation analyzed the frontend synchronization and scheduling architecture across `modules/calendar.js` and `modules/calendar-sync.js`. We identified two synchronization gaps where event modifications fail to propagate to Google Calendar, verified the timezone safety of `getEventLocalDateKey`, and mapped the complete lifecycle and delegation integration between `calendar.js` and `calendar-sync.js`.

---

## 1. Item 1: `aiAutoPlanDay()` Routine Event Push Trigger

### 1.1 Current Implementation Observation
In `modules/calendar.js` (lines 1005–1092):
```javascript
1082:     calendarEvents.push(...plannedEvents);
1083:     saveCalendarEvents();
1084:     renderCalendar();
1085: 
1086:     return {
1087:       success: true,
1088:       count: plannedEvents.length,
1089:       events: plannedEvents,
1090:       message: `Autonomously scheduled ${plannedEvents.length} events for ${dateKey}.`
1091:     };
```

### 1.2 Identified Gap
When the user clicks **"AI Real-Life Daily Auto-Schedule"** or triggers `aiAutoPlanDay()`, 5–6 realistic routine events (e.g. Cognitive Preparation, Deep Work Sprint, Lunch, Retrospective) are generated in `plannedEvents`, appended to `calendarEvents`, and saved locally. 

However, **no call to `pushEventToGoogle(evt)` is ever made**. If the user has connected their Google Calendar (`calendarSettings.googleCalendarConnected === true`), these events remain stranded in local storage and never synchronize to Google Calendar until a subsequent full pull/push is forced.

### 1.3 Critical Constraint & Invariant
`aiAutoPlanDay` **MUST remain synchronous**.
In `tests/features.test.cjs` (lines 721–723):
```javascript
const autoPlanRes = window.LuminaCalendar.aiAutoPlanDay("2026-10-01");
assert(autoPlanRes.success === true, "aiAutoPlanDay() successfully synthesized daily schedule");
assert(autoPlanRes.count > 0, `aiAutoPlanDay() created ${autoPlanRes.count} realistic routine events`);
```
If `aiAutoPlanDay` is converted to an `async` function, it will return a `Promise`. In synchronous tests, `autoPlanRes.success` would evaluate to `undefined`, breaking Test Suite 11.

### 1.4 Recommended Solution & Code Snippet
Execute an asynchronous background push loop immediately after `renderCalendar()` without converting `aiAutoPlanDay` to `async`:

```javascript
    calendarEvents.push(...plannedEvents);
    saveCalendarEvents();
    renderCalendar();

    // Trigger Google Calendar push for synthesized routine events when connected
    if (calendarSettings.googleCalendarConnected) {
      (async () => {
        for (const evt of plannedEvents) {
          try {
            await pushEventToGoogle(evt);
          } catch (err) {
            console.warn('[AI Scheduler]: Failed pushing routine event to Google Calendar:', err);
          }
        }
      })();
    }

    return {
      success: true,
      count: plannedEvents.length,
      events: plannedEvents,
      message: `Autonomously scheduled ${plannedEvents.length} events for ${dateKey}.`
    };
```

**Rationale for Sequential `for...of`:**
Sequential pushing prevents bursting 6 simultaneous POST requests to `/api/calendar/sync` and Google Calendar API. This avoids rate limits, prevents Redis token refresh lock contention, and eliminates race conditions on `saveEvents()` during concurrent responses.

---

## 2. Item 2: `handleAgentDirective` `'edit'` Action & Unlinked Event Push

### 2.1 Current Implementation Observation
In `modules/calendar.js` (lines 1274–1325):
```javascript
1274:     if (action === 'edit' || action === 'update') {
1275:       const target = fuzzyFindEvent(directive.id || directive.query || directive.search || directive.title);
...
1313:       saveCalendarEvents();
1314:       renderCalendar();
1315: 
1316:       if (target.googleEventId && calendarSettings.googleCalendarConnected) {
1317:         pushEventToGoogle(target);
1318:       }
1319: 
1320:       return {
1321:         success: true,
1322:         event: target,
1323:         message: `Successfully updated event "${target.title}" (Start: ${target.start}, End: ${target.end}).`
1324:       };
1325:     }
```

### 2.2 Identified Gap
Notice line 1316: `if (target.googleEventId && calendarSettings.googleCalendarConnected)`.
This condition requires `target.googleEventId` to already exist.
- Contrast with `saveEventFromModal` (line 932):
  ```javascript
  if (calendarSettings.googleCalendarConnected) {
    pushEventToGoogle(calendarEvents[idx]);
  }
  ```
- Contrast with `handleAgentDirective` `'add'` / `'create'` (line 1262):
  ```javascript
  if (calendarSettings.googleCalendarConnected) {
    pushEventToGoogle(newEvt);
  }
  ```

If an event was originally created locally (sovereign local event without `googleEventId`), or was created while offline, and is subsequently edited via an AI directive (e.g. `"reschedule team sync to 3pm"`), line 1316 evaluates to `false`. The updated event is saved locally but **is never pushed to Google Calendar**.

In `modules/calendar-sync.js` (lines 481–501), `pushEventToGoogle(evt)` is explicitly designed to handle unlinked events:
```javascript
const rawGoogleId = evt.googleEventId || (evt.id && evt.id.startsWith('gcal_') ? evt.id.replace(/^gcal_/, '') : undefined);

const res = await calendarApiFetch('/api/calendar/sync', {
  method: 'POST',
  body: JSON.stringify({
    googleEventId: rawGoogleId,
    summary: evt.title,
    ...
```
When `rawGoogleId` is `undefined`, the backend `/api/calendar/sync` creates an insert into Google Calendar and returns the assigned `item.id`, which `pushEventToGoogle` then binds to `evt.googleEventId`.

### 2.3 Recommended Solution & Code Snippet
Remove the `target.googleEventId &&` filter so all edited events push to Google when connected:

```javascript
      saveCalendarEvents();
      renderCalendar();

      // Push updated event to Google Calendar if connected (supports linked & unlinked local events)
      if (calendarSettings.googleCalendarConnected) {
        pushEventToGoogle(target);
      }

      return {
        success: true,
        event: target,
        message: `Successfully updated event "${target.title}" (Start: ${target.start}, End: ${target.end}).`
      };
```

---

## 3. Item 3: `getEventLocalDateKey` Timezone Safety

### 3.1 Current Implementation Observation
In `modules/calendar.js` (lines 1362–1376):
```javascript
1362:   function getEventLocalDateKey(str) {
1363:     if (!str) return '';
1364:     if (typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
1365:       return str;
1366:     }
1367:     if (typeof str === 'string' && str.includes('T')) {
1368:       if (str.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(str)) {
1369:         const d = new Date(str);
1370:         if (!isNaN(d.getTime())) return formatDateKey(d);
1371:       }
1372:       return str.slice(0, 10);
1373:     }
1374:     const d = new Date(str);
1375:     return !isNaN(d.getTime()) ? formatDateKey(d) : '';
1376:   }
```

### 3.2 Analysis of Timezone Shift Mechanism
1. **ECMAScript Standard (ECMA-262 §21.4.1.15):** Date-only strings (e.g. `"2026-10-20"`) passed to `new Date("2026-10-20")` are parsed as **UTC midnight**: `2026-10-20T00:00:00.000Z`.
2. **Western Hemisphere Shift:** In any timezone west of UTC (e.g. EDT UTC-4, PDT UTC-7, HST UTC-10):
   `2026-10-20T00:00:00.000Z` corresponds to the previous evening (e.g., `2026-10-19 20:00:00 EDT`).
3. Calling `d.getFullYear()`, `d.getMonth() + 1`, `d.getDate()` (via `formatDateKey(d)`) extracts local date components, returning `"2026-10-19"`. This causes all-day events to display on the previous day.
4. **Current Protection:** Line 1364 (`if (typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str)) return str;`) successfully prevents this for strictly formatted `"YYYY-MM-DD"` strings.
5. **Edge Cases to Fortify:**
   - Leading/trailing whitespace (e.g. `" 2026-10-20 "`).
   - Space-separated timestamps (e.g. `"2026-10-20 09:00:00"`).
   - Datetime strings without explicit offset where `str.includes('T')` is false.

### 3.3 Recommended Enhanced Implementation
```javascript
  function getEventLocalDateKey(str) {
    if (!str) return '';
    if (typeof str === 'string') {
      const trimmed = str.trim();
      // 1. Raw date strings (e.g. Google allDay start/end: "2026-10-20")
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      // 2. ISO timestamp without explicit UTC or offset (e.g. "2026-10-20T10:00:00")
      if (trimmed.includes('T') && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      // 3. Space-separated timestamp without offset (e.g. "2026-10-20 10:00:00")
      if (/^\d{4}-\d{2}-\d{2}\s/.test(trimmed) && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      // 4. Timestamp with explicit UTC 'Z' or offset (+/-HH:MM)
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return formatDateKey(d);
    }
    const d = new Date(str);
    return !isNaN(d.getTime()) ? formatDateKey(d) : '';
  }
```

---

## 4. Item 4: Integration Between `modules/calendar.js` and `modules/calendar-sync.js`

### 4.1 Global Scope & Namespace Aliasing
In `modules/calendar-sync.js` (lines 705–723):
```javascript
  window.LuminaCalendarSync = {
    exportToIcs,
    importFromIcs,
    checkBackendConnectionStatus,
    connectGoogleAccount,
    syncGoogleCalendar,
    pushEventToGoogle,
    deleteEventFromGoogle,
    updateSyncStatusBadge,
    openSyncModal,
    closeSyncModal,
    copyRedirectUri,
    saveSyncSettingsFromModal
  };

  if (window.LuminaCalendar) {
    Object.assign(window.LuminaCalendar, window.LuminaCalendarSync);
  }
```
**Recommendation:** Add `window.calendarSync = window.LuminaCalendarSync;` to `modules/calendar-sync.js`.
In `modules/calendar.js`, allow delegators to check both namespaces:
```javascript
  const getSyncEngine = () => window.LuminaCalendarSync || window.calendarSync;
  const pushEventToGoogle = (...args) => (getSyncEngine()?.pushEventToGoogle ? getSyncEngine().pushEventToGoogle(...args) : Promise.resolve());
  const deleteEventFromGoogle = (...args) => (getSyncEngine()?.deleteEventFromGoogle ? getSyncEngine().deleteEventFromGoogle(...args) : Promise.resolve());
```

### 4.2 Cross-Module Delegation Flow
- **`calendar.js` → `calendar-sync.js`:**
  - Delegates network I/O (`pushEventToGoogle`, `deleteEventFromGoogle`, `syncGoogleCalendar`, `checkBackendConnectionStatus`).
  - Delegates modal/export logic (`exportToIcs`, `importFromIcs`, `openSyncModal`, `copyRedirectUri`).
- **`calendar-sync.js` → `calendar.js`:**
  - Delegates state access via getters: `getRawEvents()`, `getEvents()`, `getSettings()`.
  - Delegates state updates: `setEvents(evts)`, `setSettings(s)`, `saveEvents()`, `renderCalendar()`.
  - Delegates date formatting: `formatDateKey(d)`, `getEventLocalDateKey(str)`.

### 4.3 Script Load Lifecycle in `dashboard.html`
1. `dashboard.html` loads `<script src="./modules/calendar.js"></script>` first (line 1892).
   `window.LuminaCalendar` is instantiated.
2. `dashboard.html` loads `<script src="./modules/calendar-sync.js"></script>` second (line 1893).
   `window.LuminaCalendarSync` (and `window.calendarSync`) is instantiated, and augments `window.LuminaCalendar`.
3. Background initialization triggers `checkBackendConnectionStatus()` on `DOMContentLoaded`.

### 4.4 Mutation Matrix: When Google Sync is Triggered
| User / Agent Action | Local Mutation | Trigger to Google | Current Status |
|---------------------|----------------|-------------------|----------------|
| Modal New Event (`saveEventFromModal`) | `calendarEvents.push(newEvent)` | `pushEventToGoogle(newEvent)` | **Working** (Line 953) |
| Modal Edit Event (`saveEventFromModal`) | `calendarEvents[idx] = ...` | `pushEventToGoogle(calendarEvents[idx])` | **Working** (Line 932) |
| Modal Delete Event (`deleteEvent`) | `calendarEvents.filter(...)` | `deleteEventFromGoogle(evt.googleEventId)` | **Working** (Line 968) |
| Agent Directive Create (`handleAgentDirective`) | `calendarEvents.push(newEvt)` | `pushEventToGoogle(newEvt)` | **Working** (Line 1262) |
| Agent Directive Edit (`handleAgentDirective`) | `target.start = ...` | `pushEventToGoogle(target)` | **FIX NEEDED**: Blocked by `target.googleEventId` guard (Line 1316) |
| AI Plan Day (`aiAutoPlanDay`) | `calendarEvents.push(...plannedEvents)` | `pushEventToGoogle(evt)` for each event | **FIX NEEDED**: Not invoked (Line 1082) |
| Periodic Sync / Focus Sync | Pulls remote, merges items | `pushEventToGoogle(localEvt)` for all unpushed | **Working** (Line 430) |

---

## 5. Line Count & Invariant Compliance
- `modules/calendar.js`: 1,638 lines (limit: 2,000 lines). Headroom: 362 lines.
- `modules/calendar-sync.js`: 737 lines (limit: 2,000 lines). Headroom: 1,263 lines.
- Firmware (`firmware/**`): Untouched.
- Tests (`tests/**`): Untouched. 1,102 unit assertions pass cleanly.
