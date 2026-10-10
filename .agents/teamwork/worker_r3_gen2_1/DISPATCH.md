## 2026-10-16T21:43:00Z
You are worker_r3_gen2_1, working in c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r3_gen2_1.

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md before doing any other work.
Also read PROJECT.md at c:\Users\roysu\LuminaVista\.agents\teamwork\orchestrator_r3_gen2\PROJECT.md.
Also read Explorer handoff reports:
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_gen2_1\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_gen2_2\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r3_gen2_3\handoff.md

FILE WRITE OWNERSHIP:
You have exclusive write ownership of:
- `modules/calendar-sync.js`
- `modules/calendar.js`
- `dashboard.html` (only if updating line 1045 badge dot color)
CRITICAL INVARIANTS:
- All repository files must remain strictly < 2,000 lines.
- Hardware physical firmware (`firmware/**`) must remain 100% untouched.
- Do NOT add lines to `tests/features.test.cjs` (currently at 1,984 lines, 16 lines from limit).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASKS TO IMPLEMENT:

1. In `modules/calendar-sync.js`:
   a. Expand `getApiOrigin()`:
      If `typeof window !== 'undefined' && window.location`:
      - If `window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'`, return `''` (essential for test mock servers).
      - If `window.location.protocol === 'file:'` or `window.location.hostname.endsWith('github.io')` or `window.location.hostname.endsWith('pages.dev')` or `window.location.hostname.endsWith('gitlab.io')` or `window.location.hostname.endsWith('surge.sh')` or `window.location.hostname.endsWith('netlify.app')`, return `'https://lumina-vista-sigma.vercel.app'`.
      - Otherwise, return `''`.
   b. Resilient OAuth in `connectGoogleAccount()`:
      - Synchronously open popup during user gesture (`popup = window.open('about:blank', 'google_oauth_popup', ...)`);
      - Write inline dark-themed spinner into popup document while awaiting API response:
        `popup.document.write('<!DOCTYPE html><html><head><title>Connecting Google Calendar...</title><style>body{background:#09090b;color:#00f2fe;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column} .spinner{width:36px;height:36px;border:3px solid rgba(0,242,254,0.2);border-top-color:#00f2fe;border-radius:50%;animation:spin 0.8s linear infinite;} @keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="spinner"></div><p style="margin-top:16px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa">Contacting Google OAuth...</p></body></html>');`
      - If popup is blocked or navigating popup fails, fallback seamlessly to direct top-level redirect: `window.location.href = authData.authUrl`.
      - Add a 5-minute timeout guard to `checkInterval` to prevent memory leaks if popup is abandoned.
   c. Cross-Origin `postMessage` Acceptance:
      - In `window.addEventListener('message')` (line ~666):
        Permit messages if `e.origin === window.location.origin || e.origin === 'https://lumina-vista-sigma.vercel.app' || e.origin.endsWith('.vercel.app') || e.origin.endsWith('.github.io')`.
        Handle `GCAL_AUTH_SUCCESS` and `GCAL_AUTH_ERROR`.
   d. Concurrency Mutex & Multi-Trigger Auto-Sync:
      - Add module-level `let isSyncInProgress = false;` in `modules/calendar-sync.js`.
      - In `syncGoogleCalendar()`: guard with `if (isSyncInProgress) return; isSyncInProgress = true; try { ... } finally { isSyncInProgress = false; }`.
      - Create debounced helper `triggerAutoSync()` with 15s cooldown.
      - Mount `document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') triggerAutoSync(); });`.
      - CRITICAL TEST INVARIANT: You MUST preserve the exact verbatim strings checked in `tests/recheck-all-tasks.cjs`:
        `calSyncJs.includes("5 * 60 * 1000") && calSyncJs.includes("setInterval")`
        `calSyncJs.includes("window.addEventListener('focus'")`
   e. Strict All-Day Event Calculation:
      - Ensure `pushEventToGoogle` calculates `end.date = start.date + 1 day` for single-day all-day events and preserves verbatim string: `endDateStr <= startDateStr`.
   f. Expose namespace alias:
      `window.calendarSync = window.LuminaCalendarSync;`

2. In `modules/calendar.js`:
   a. In `aiAutoPlanDay()` (line ~1082):
      CRITICAL INVARIANT: `aiAutoPlanDay()` MUST remain synchronous (`return { success: true, count: plannedEvents.length, events: plannedEvents, message: ... }`).
      After `renderCalendar()`, trigger Google Calendar push for synthesized routine events in a background sequential async loop when `calendarSettings.googleCalendarConnected` is true:
      ```javascript
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
      ```
   b. In `handleAgentDirective` `'edit'` action (line ~1316):
      Change `if (target.googleEventId && calendarSettings.googleCalendarConnected)` to `if (calendarSettings.googleCalendarConnected)` so unlinked local events edited by agents are pushed and linked to Google Calendar.
   c. In `getEventLocalDateKey` (line ~1362):
      Verify raw `YYYY-MM-DD` strings are returned directly without UTC `new Date()` conversion.
   d. Ensure Day 1 month abbreviation outside circular badge and `min-h-[90px]` with `ring-2 ring-inset ring-cyan-400` are strictly preserved (retaining assertions in `tests/recheck-all-tasks.cjs:136-147`).

3. In `dashboard.html`:
   - Line 1045: Ensure static placeholder for `#calSyncStatusBadge` has `<span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>` matching Local Sovereign before JS hydration.

VERIFICATION COMMANDS (You MUST run all of these and document results in handoff.md):
- `node tests/lint.cjs` (40 modules pass)
- `node tests/recheck-all-tasks.cjs` (42 audit assertions pass)
- `node tests/features.test.cjs` (1,102 assertions pass)
- `node tests/browser-cdp-test.cjs` (122 Chrome CDP tests pass)
- Line counts: `node -e "['modules/calendar-sync.js', 'modules/calendar.js', 'dashboard.html'].forEach(f => console.log(f, fs.readFileSync(f, 'utf8').split('\n').length))"`
- `git status` check: Confirm `firmware/**` is 100% clean and untouched.

DELIVERABLES:
Write `handoff.md` in `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r3_gen2_1` following Handoff Protocol (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
When complete, notify caller via `send_message`.
