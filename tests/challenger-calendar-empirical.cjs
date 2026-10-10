// tests/challenger-calendar-empirical.cjs
// Empirical Challenge Suite for Google Calendar Two-Way Sync & Core Calendar Engine
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

async function runEmpiricalSuite() {
  console.log("=================================================================");
  console.log("   CHALLENGER R3 GEN2: EMPIRICAL CALENDAR TEST HARNESS          ");
  console.log("=================================================================\n");

  const rootDir = path.resolve(__dirname, '..');
  const dashboardHtml = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
  const calSyncCode = fs.readFileSync(path.join(rootDir, 'modules', 'calendar-sync.js'), 'utf8');
  const calCode = fs.readFileSync(path.join(rootDir, 'modules', 'calendar.js'), 'utf8');

  let passedTests = 0;
  function testAssert(condition, message) {
    assert(condition, message);
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  }

  // =========================================================================
  // SECTION 1: EMPIRICAL VERIFICATION OF getApiOrigin()
  // =========================================================================
  console.log("[SECTION 1: Empirical Verification of getApiOrigin()]");

  // Extract getApiOrigin definition directly from calendar-sync.js to test logic in isolation
  const getApiOriginMatch = calSyncCode.match(/function getApiOrigin\(\)\s*\{[\s\S]*?\n  \}/);
  assert(getApiOriginMatch, "calendar-sync.js contains function getApiOrigin()");

  const evaluateGetApiOrigin = (mockWindow) => {
    const fn = new Function('window', `
      ${getApiOriginMatch[0]}
      return getApiOrigin();
    `);
    return fn(mockWindow);
  };

  // Test matrix as specified in challenger instructions:
  const originsTestMatrix = [
    { hostname: 'localhost', protocol: 'http:', expected: '' },
    { hostname: '127.0.0.1', protocol: 'http:', expected: '' },
    { hostname: 'subhadraroy.github.io', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'test.pages.dev', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'gitlab.io', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'surge.sh', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'netlify.app', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: '', protocol: 'file:', expected: 'https://lumina-vista-sigma.vercel.app' },
    // Adversarial edge cases
    { hostname: 'org.gitlab.io', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'preview.surge.sh', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'branch.netlify.app', protocol: 'https:', expected: 'https://lumina-vista-sigma.vercel.app' },
    { hostname: 'attacker.github.io.evil.com', protocol: 'https:', expected: '' },
    { hostname: 'evilpages.dev.phishing.org', protocol: 'https:', expected: '' },
    { hostname: 'custom-enterprise-domain.com', protocol: 'https:', expected: '' },
  ];

  for (const t of originsTestMatrix) {
    const mockWin = { location: { hostname: t.hostname, protocol: t.protocol } };
    const actual = evaluateGetApiOrigin(mockWin);
    testAssert(actual === t.expected, `getApiOrigin() for ${t.hostname || t.protocol} -> '${actual}' (expected '${t.expected}')`);
  }

  // Verify integration with calendarApiFetch inside full JSDOM instance
  const testFetchRouting = async (hostname, protocol, expectedTargetPrefix) => {
    const dom = new JSDOM(dashboardHtml, {
      url: `${protocol === 'file:' ? 'file:///C:/test/dashboard.html' : protocol + '//' + hostname + '/dashboard.html'}`,
      runScripts: 'outside-only'
    });
    const win = dom.window;

    let interceptedUrl = null;
    win.fetch = async (url) => {
      interceptedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ connected: false })
      };
    };

    win.eval(calCode);
    win.eval(calSyncCode);

    await win.LuminaCalendarSync.checkBackendConnectionStatus();
    testAssert(interceptedUrl && interceptedUrl.startsWith(expectedTargetPrefix),
      `Integration fetch on ${hostname || protocol} calls URL prefix '${expectedTargetPrefix}' (actual: '${interceptedUrl}')`);
  };

  await testFetchRouting('localhost', 'http:', '/api/calendar/status');
  await testFetchRouting('subhadraroy.github.io', 'https:', 'https://lumina-vista-sigma.vercel.app/api/calendar/status');
  await testFetchRouting('test.pages.dev', 'https:', 'https://lumina-vista-sigma.vercel.app/api/calendar/status');

  // =========================================================================
  // SECTION 2: EMPIRICAL VERIFICATION OF aiAutoPlanDay()
  // =========================================================================
  console.log("\n[SECTION 2: Empirical Verification of aiAutoPlanDay()]");

  const dom = new JSDOM(dashboardHtml, {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  const win = dom.window;
  win.localStorage.clear();
  win.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });

  win.eval(calCode);
  win.eval(calSyncCode);

  testAssert(typeof win.LuminaCalendar.aiAutoPlanDay === 'function', "LuminaCalendar exports aiAutoPlanDay()");

  // Call aiAutoPlanDay("2026-10-01")
  const planDate = "2026-10-01";
  const startTime = Date.now();
  const planResult = win.LuminaCalendar.aiAutoPlanDay(planDate);
  const elapsedMs = Date.now() - startTime;

  testAssert(typeof planResult === 'object' && planResult !== null, "aiAutoPlanDay() returns an object");
  testAssert(planResult.success === true, "aiAutoPlanDay() returns success === true");
  testAssert(typeof planResult.count === 'number' && planResult.count > 0, `aiAutoPlanDay() returns count > 0 (count: ${planResult.count})`);
  testAssert(Array.isArray(planResult.events) && planResult.events.length === planResult.count, "planResult.events is array matching count");
  testAssert(elapsedMs < 100, `aiAutoPlanDay() returned synchronously in ${elapsedMs}ms (no async delay)`);

  // Verify events are stored in calendar events array and localStorage
  const currentEvents = win.LuminaCalendar.getEvents();
  const storedJson = win.localStorage.getItem('luminavista_calendar_events_v1');
  const storedEvents = storedJson ? JSON.parse(storedJson) : [];

  testAssert(currentEvents.length >= planResult.count, `Current in-memory events contains all ${planResult.count} planned events`);
  testAssert(storedEvents.length >= planResult.count, `localStorage 'lumina_calendar_events' contains all ${planResult.count} planned events`);

  // Verify event schema & invariants
  for (const evt of planResult.events) {
    testAssert(evt.id && evt.id.startsWith('evt_ai_'), `Event ${evt.title} has valid evt_ai_ prefix ID`);
    testAssert(evt.isAutonomous === true, `Event ${evt.title} is marked isAutonomous: true`);
    testAssert(typeof evt.color === 'string' && evt.color.startsWith('#'), `Event ${evt.title} has valid hex color (${evt.color})`);
    testAssert(evt.start && evt.end && evt.start < evt.end, `Event ${evt.title} has start (${evt.start}) < end (${evt.end})`);
  }

  // Verify sleep blackout window & lunch block
  const sleepViolations = planResult.events.filter(e => {
    const h = new Date(e.start).getHours();
    return h >= 23 || h < 7;
  });
  testAssert(sleepViolations.length === 0, "Zero events scheduled in sleep blackout window (23:00 - 07:00)");

  const lunchEvt = planResult.events.find(e => e.title.toLowerCase().includes('lunch'));
  testAssert(lunchEvt !== undefined, "Includes protected lunch meal block");

  // Stress-test weekend exclusion
  win.LuminaCalendar.setSettings({ excludeWeekends: true });
  const weekendResult = win.LuminaCalendar.aiAutoPlanDay("2026-10-04"); // Sunday
  testAssert(weekendResult.success === false && weekendResult.reason === 'weekend_excluded',
    "Weekend scheduling safely excluded when excludeWeekends is true");

  // Reset weekend setting for leap year test
  win.LuminaCalendar.setSettings({ excludeWeekends: false });
  const leapResult = win.LuminaCalendar.aiAutoPlanDay("2028-02-29");
  testAssert(leapResult.success === true && leapResult.count > 0,
    `Leap year date 2028-02-29 scheduled successfully with ${leapResult.count} events`);

  // Verify Google push dispatch when connected
  let pushedGoogleEvents = [];
  win.LuminaCalendarSync.pushEventToGoogle = async (evt) => {
    pushedGoogleEvents.push(evt);
  };
  win.LuminaCalendar.setSettings({ googleCalendarConnected: true });

  const connectedPlan = win.LuminaCalendar.aiAutoPlanDay("2026-10-02");
  testAssert(connectedPlan.success === true, "Scheduling while connected succeeds synchronously");

  // Allow microtask cycle to flush detached async push loop
  await new Promise(r => setTimeout(r, 50));
  testAssert(pushedGoogleEvents.length === connectedPlan.count,
    `All ${connectedPlan.count} routine events were dispatched to pushEventToGoogle()`);

  // =========================================================================
  // SECTION 3: EMPIRICAL VERIFICATION OF CONCURRENCY MUTEX
  // =========================================================================
  console.log("\n[SECTION 3: Empirical Verification of Concurrency Mutex]");

  const mutexDom = new JSDOM(dashboardHtml, {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  const mWin = mutexDom.window;
  mWin.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
  mWin.eval(calCode);
  mWin.eval(calSyncCode);

  let activeFetchCount = 0;
  let maxConcurrentFetches = 0;
  let totalFetchDispatches = 0;
  let resolveDelay = null;

  mWin.fetch = async (url) => {
    if (url.includes('/api/calendar/sync')) {
      activeFetchCount++;
      totalFetchDispatches++;
      if (activeFetchCount > maxConcurrentFetches) {
        maxConcurrentFetches = activeFetchCount;
      }
      await new Promise(resolve => {
        resolveDelay = resolve;
      });
      activeFetchCount--;
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [] })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  // Launch initial sync
  const call1Promise = mWin.LuminaCalendarSync.syncGoogleCalendar();
  testAssert(activeFetchCount === 1, "Call 1 successfully enters sync and initiates fetch");

  // Attempt 5 concurrent calls while Call 1 is in-flight
  const droppedCalls = [];
  for (let i = 2; i <= 6; i++) {
    droppedCalls.push(mWin.LuminaCalendarSync.syncGoogleCalendar());
  }

  // All dropped calls should resolve immediately because isSyncInProgress is true
  await Promise.all(droppedCalls);
  testAssert(activeFetchCount === 1, "Concurrent calls 2-6 did not launch additional network requests");
  testAssert(totalFetchDispatches === 1, `Total fetch calls dispatched remains exactly 1 (Actual: ${totalFetchDispatches})`);
  testAssert(maxConcurrentFetches === 1, "Max concurrent sync requests strictly clamped to 1");

  // Resolve delay to complete Call 1
  resolveDelay();
  await call1Promise;
  testAssert(activeFetchCount === 0, "Call 1 completed and activeFetchCount returned to 0");

  // Verify mutex released in finally block by initiating Call 7
  let call7Dispatched = false;
  mWin.fetch = async (url) => {
    if (url.includes('/api/calendar/sync')) {
      call7Dispatched = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [] })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await mWin.LuminaCalendarSync.syncGoogleCalendar();
  testAssert(call7Dispatched === true, "Mutex cleanly released: subsequent syncGoogleCalendar() succeeds");

  // Test Exception Resilience: verify mutex releases even when fetch throws network error
  mWin.fetch = async (url) => {
    if (url.includes('/api/calendar/sync')) {
      throw new Error("Simulated transient socket reset");
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  // Run failing sync
  await mWin.LuminaCalendarSync.syncGoogleCalendar();

  // Next call with restored network should succeed (proves finally block cleared isSyncInProgress)
  let callAfterErrorDispatched = false;
  mWin.fetch = async (url) => {
    if (url.includes('/api/calendar/sync')) {
      callAfterErrorDispatched = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [] })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  await mWin.LuminaCalendarSync.syncGoogleCalendar();
  testAssert(callAfterErrorDispatched === true,
    "Exception resilience confirmed: mutex cleanly unlocked in finally block after network failure");

  // Test triggerAutoSync debounce window (15s)
  let autoSyncDispatches = 0;
  mWin.fetch = async (url) => {
    if (url.includes('/api/calendar/sync')) {
      autoSyncDispatches++;
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  mWin.LuminaCalendar.setSettings({ googleCalendarConnected: true });

  // Call triggerAutoSync three times back-to-back
  mWin.LuminaCalendarSync.triggerAutoSync();
  mWin.LuminaCalendarSync.triggerAutoSync();
  mWin.LuminaCalendarSync.triggerAutoSync();

  testAssert(autoSyncDispatches === 1,
    `triggerAutoSync() debounced 3 rapid calls to exactly 1 sync dispatch (Actual: ${autoSyncDispatches})`);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n=================================================================`);
  console.log(`🎉 ALL ${passedTests} EMPIRICAL CHALLENGER ASSERTIONS PASSED WITH ZERO FAILURES!`);
  console.log(`=================================================================\n`);
  process.exit(0);
}

runEmpiricalSuite().catch(err => {
  console.error("❌ EMPIRICAL SUITE FAILED:", err);
  process.exit(1);
});
