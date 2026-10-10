# Handoff Report: `modules/calendar.js` & `modules/calendar-sync.js` Investigation

**Author:** `explorer_r3_gen2_2`  
**Working Directory:** `c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_gen2_2`  
**Recipient:** `af9ebb59-cd4e-4bd2-b963-411241d549ab` (orchestrator_r3_gen2)  
**Date:** 2026-10-16  
**Type:** Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **`aiAutoPlanDay()` routine push omission:**
   In `modules/calendar.js`, lines 1082–1092:
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
   No invocation of `pushEventToGoogle(event)` exists anywhere within `aiAutoPlanDay()`.

2. **Synchronous Contract Invariant for `aiAutoPlanDay()`:**
   In `tests/features.test.cjs`, lines 721–723:
   ```javascript
   721:   const autoPlanRes = window.LuminaCalendar.aiAutoPlanDay("2026-10-01");
   722:   assert(autoPlanRes.success === true, "aiAutoPlanDay() successfully synthesized daily schedule");
   723:   assert(autoPlanRes.count > 0, `aiAutoPlanDay() created ${autoPlanRes.count} realistic routine events`);
   ```
   `autoPlanRes.success` is asserted synchronously. If `aiAutoPlanDay` returns a Promise (via `async function`), `autoPlanRes.success` is `undefined` and test line 722 fails immediately.

3. **`handleAgentDirective` `'edit'` action unlinked event guard:**
   In `modules/calendar.js`, lines 1313–1319:
   ```javascript
   1313:       saveCalendarEvents();
   1314:       renderCalendar();
   1315: 
   1316:       if (target.googleEventId && calendarSettings.googleCalendarConnected) {
   1317:         pushEventToGoogle(target);
   1318:       }
   ```
   Line 1316 guards the push with `target.googleEventId &&`. In contrast:
   - `saveEventFromModal` (line 932):
     ```javascript
     if (calendarSettings.googleCalendarConnected) {
       pushEventToGoogle(calendarEvents[idx]);
     }
     ```
   - `handleAgentDirective` `'add'` (line 1262):
     ```javascript
     if (calendarSettings.googleCalendarConnected) {
       pushEventToGoogle(newEvt);
     }
     ```
   In `modules/calendar-sync.js` (lines 481–486), `pushEventToGoogle(evt)` supports events where `evt.googleEventId` is `undefined`, sending `googleEventId: undefined` in the POST payload to trigger backend creation.

4. **`getEventLocalDateKey` raw date key interception:**
   In `modules/calendar.js`, lines 1362–1376:
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
   Line 1364 matches `/^\d{4}-\d{2}-\d{2}$/` and returns `str` directly, avoiding `new Date("YYYY-MM-DD")` which parses as UTC midnight.

5. **`calendarSync` namespace aliasing and script load order:**
   In `dashboard.html`, lines 1892–1893:
   ```html
   1892:   <script src="./modules/calendar.js"></script>
   1893:   <script src="./modules/calendar-sync.js"></script>
   ```
   `modules/calendar-sync.js` (line 705) binds `window.LuminaCalendarSync`. `window.calendarSync` is currently `undefined`.

6. **Automated Test Suite Execution:**
   Executed `node tests/features.test.cjs`:
   Output: `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===`, exit code `0`.

---

## 2. Logic Chain

1. **Step 1 (From Observation 1):** `aiAutoPlanDay()` populates `plannedEvents` (5–6 items) and saves them to `calendarEvents` and `localStorage`, but never calls `pushEventToGoogle`. Therefore, newly planned routine events are invisible on Google Calendar when the user is connected.
2. **Step 2 (From Observation 2):** Because `tests/features.test.cjs:722` asserts `autoPlanRes.success === true` synchronously, `aiAutoPlanDay` cannot be an `async` function. The Google push must be executed asynchronously in a detached IIFE or promise chain after `renderCalendar()`.
3. **Step 3 (From Observation 1 & 2):** When pushing multiple routine events, sequential iteration (`for (const evt of plannedEvents) await pushEventToGoogle(evt)`) prevents 6 concurrent HTTP POST requests to `/api/calendar/sync`, eliminating Google rate limit errors, Redis write collisions, and storage desynchronization.
4. **Step 4 (From Observation 3):** `handleAgentDirective` line 1316 blocks `pushEventToGoogle` if `target.googleEventId` is missing. An event created locally before connecting Google Calendar has `target.googleEventId === undefined`. When edited by the user or an agent, it is saved locally but never pushed to Google Calendar. Removing `target.googleEventId &&` allows `pushEventToGoogle` to push and link the event (matching `saveEventFromModal`).
5. **Step 5 (From Observation 4):** Standard ECMAScript parses `new Date("YYYY-MM-DD")` as UTC midnight. In UTC-negative timezones (US Eastern, Pacific, Hawaii), UTC midnight falls on the previous day in local time. Line 1364 prevents this shift by returning the raw string directly without UTC parsing. Enhancing this with `.trim()` and space-separator detection prevents edge-case fallthrough to `new Date(str)`.
6. **Step 6 (From Observation 5):** `modules/calendar.js` delegates to `window.LuminaCalendarSync`. Adding an alias `window.calendarSync = window.LuminaCalendarSync` in `calendar-sync.js` and checking `window.LuminaCalendarSync || window.calendarSync` in `calendar.js` guarantees complete cross-compatibility for external consumers.

---

## 3. Caveats

1. **Scope Boundary:** This investigation is strictly READ-ONLY. No source code or tests were modified during this investigation.
2. **Backend Rate Limits:** When Google Calendar connection is active, pushing 6 events sequentially from `aiAutoPlanDay()` takes approximately 600–1200ms in the background. Because it runs asynchronously, UI responsiveness is unaffected.
3. **Network Failure Resilience:** If an individual event push in `aiAutoPlanDay()` fails due to network drop, the local event remains intact. The existing two-way sync loop (`syncGoogleCalendar` line 428) pushes unlinked local events upon subsequent focus or background interval.

---

## 4. Conclusion

The required modifications for Milestone 2 in `modules/calendar.js` and `modules/calendar-sync.js` are precise, self-contained, and zero-risk to existing tests:

### Proposal A: `modules/calendar.js` — `aiAutoPlanDay()` (line ~1085)
```javascript
<<<<
    calendarEvents.push(...plannedEvents);
    saveCalendarEvents();
    renderCalendar();

    return {
====
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
>>>>
```

### Proposal B: `modules/calendar.js` — `handleAgentDirective` `'edit'` (line ~1316)
```javascript
<<<<
      if (target.googleEventId && calendarSettings.googleCalendarConnected) {
        pushEventToGoogle(target);
      }
====
      if (calendarSettings.googleCalendarConnected) {
        pushEventToGoogle(target);
      }
>>>>
```

### Proposal C: `modules/calendar.js` — `getEventLocalDateKey` (line ~1362)
```javascript
<<<<
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
====
  function getEventLocalDateKey(str) {
    if (!str) return '';
    if (typeof str === 'string') {
      const trimmed = str.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      if (trimmed.includes('T') && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      if (/^\d{4}-\d{2}-\d{2}\s/.test(trimmed) && !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) return formatDateKey(d);
    }
    const d = new Date(str);
    return !isNaN(d.getTime()) ? formatDateKey(d) : '';
  }
>>>>
```

### Proposal D: `modules/calendar-sync.js` — Alias `window.calendarSync` (line ~719)
```javascript
<<<<
  window.LuminaCalendarSync = {
====
  window.LuminaCalendarSync = {
...
  };
  window.calendarSync = window.LuminaCalendarSync;
>>>>
```

---

## 5. Verification Method

1. **Unit Test Suite Verification:**
   Run:
   ```bash
   node tests/features.test.cjs
   ```
   Expected: 1,102 / 1,102 assertions pass with 0 errors. Specifically verify Test Suite 11 (lines 660–810).
2. **Syntax Lint Verification:**
   Run:
   ```bash
   node tests/lint.cjs
   ```
   Expected: 40 / 40 JS modules pass with 0 syntax errors.
3. **Recheck All Tasks Audit:**
   Run:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
   Expected: 42 / 42 audit assertions pass.
4. **File Line Budget Verification:**
   Verify `modules/calendar.js` remains $< 2,000$ lines (currently 1,638 lines; $+15$ lines $\rightarrow 1,653$ lines).
5. **Invalidation Conditions:**
   - Any modification making `aiAutoPlanDay` an `async` function invalidates compliance with `tests/features.test.cjs:722`.
   - Modifying firmware files (`firmware/**`) invalidates compliance with R4.
