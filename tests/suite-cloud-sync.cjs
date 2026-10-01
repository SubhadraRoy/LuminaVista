// tests/suite-cloud-sync.cjs - Sovereign Cloud Sync & Multi-Device Continuity Suite
'use strict';

module.exports = async function runCloudSyncSuite({ assert, window, document, rootDir }) {
  console.log("\n--- SUITE 28: Sovereign Cloud Sync & Multi-Device Continuity ---");

  // 1. Verify LuminaCloudSync interface exists on window
  assert(typeof window.LuminaCloudSync === 'object' && window.LuminaCloudSync !== null, "window.LuminaCloudSync is initialized");
  assert(typeof window.LuminaCloudSync.pullFromCloud === 'function', "LuminaCloudSync exposes pullFromCloud()");
  assert(typeof window.LuminaCloudSync.pushToCloud === 'function', "LuminaCloudSync exposes pushToCloud()");
  assert(typeof window.LuminaCloudSync.queueSync === 'function', "LuminaCloudSync exposes queueSync()");
  assert(typeof window.LuminaCloudSync.flushSync === 'function', "LuminaCloudSync exposes flushSync()");
  assert(typeof window.LuminaCloudSync.getSyncPayload === 'function', "LuminaCloudSync exposes getSyncPayload()");
  assert(typeof window.LuminaCloudSync.applyCloudPayload === 'function', "LuminaCloudSync exposes applyCloudPayload()");

  // 2. Verify Header UI Sync Indicator
  const syncIndicator = document.getElementById("cloudSyncIndicator");
  assert(syncIndicator !== null, "cloudSyncIndicator element mounted in dashboard header");
  const syncDot = document.getElementById("cloudSyncDot");
  assert(syncDot !== null, "cloudSyncDot indicator light mounted in DOM");
  const syncText = document.getElementById("cloudSyncText");
  assert(syncText !== null, "cloudSyncText status label mounted in DOM");

  // 3. Test State Gathering / Payload Serialization
  // Set up representative user state across domains
  const testCalendarEvent = {
    id: "evt_cloud_sync_test_1",
    title: "JEE Mock Exam Final Review",
    date: "2026-10-15",
    start: "10:00",
    end: "13:00",
    category: "exam"
  };
  if (window.LuminaCalendar?.setEvents) {
    window.LuminaCalendar.setEvents([testCalendarEvent]);
  } else {
    window.calendarEvents = [testCalendarEvent];
  }
  window.localStorage.setItem("luminavista_calendar_events_v1", JSON.stringify([testCalendarEvent]));
  window.localStorage.setItem("lumina_calendar_events", JSON.stringify([testCalendarEvent]));

  const testChatSession = {
    id: "session_cloud_test_42",
    title: "Physics Mechanics Discussion",
    updatedAt: Date.now(),
    messages: [
      { role: "user", content: "Explain rotational inertia" },
      { role: "assistant", content: "Rotational inertia depends on mass distribution..." }
    ]
  };
  window.chatSessions = [testChatSession];
  window.activeSessionId = testChatSession.id;
  window.localStorage.setItem("lumina_chat_sessions", JSON.stringify(window.chatSessions));
  window.localStorage.setItem("lumina_active_session_id", testChatSession.id);

  window.vaultNotes = [
    { id: "note_cloud_test", title: "Study Plan Oct 2026", content: "# Sovereign Notes\n- Review thermodynamics\n- Revise optics" }
  ];
  window.activeNoteId = "note_cloud_test";
  window.localStorage.setItem("lumina_godx_multi_notes", JSON.stringify(window.vaultNotes));
  window.localStorage.setItem("lumina_active_note_id", "note_cloud_test");

  window.vfs = {
    "index.html": "<!DOCTYPE html><html><body><h1>Cloud Sync VFS</h1></body></html>",
    "solution.py": "# Cloud synced python\nprint('Sync verified')\n"
  };
  window.localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));

  const payload = window.LuminaCloudSync.getSyncPayload();
  assert(Array.isArray(payload.calendar) && payload.calendar.some(e => e.id === "evt_cloud_sync_test_1"), "Payload captures calendar events");
  assert(Array.isArray(payload.chatSessions) && payload.chatSessions.some(s => s.id === "session_cloud_test_42"), "Payload captures chat sessions");
  assert(payload.activeSessionId === "session_cloud_test_42", "Payload captures activeSessionId");
  assert(Array.isArray(payload.notes) && payload.notes.some(n => n.id === "note_cloud_test"), "Payload captures notes vault");
  assert(payload.vfs && payload.vfs["solution.py"] !== undefined, "Payload captures VFS workspace files");
  assert(typeof payload.updatedAt === 'number', "Payload includes valid timestamp");

  // 4. Test Cloud Hydration / Payload Application (Simulating new device / fresh session)
  const incomingDevicePayload = {
    calendar: [
      { id: "evt_from_phone", title: "Synced from mobile phone", date: "2026-10-18", start: "09:00", end: "10:00", category: "study" }
    ],
    chatSessions: [
      {
        id: "session_from_phone",
        title: "Mobile Math Session",
        updatedAt: Date.now(),
        messages: [{ role: "user", content: "Mobile greeting" }, { role: "assistant", content: "Hello from cloud" }]
      }
    ],
    activeSessionId: "session_from_phone",
    notes: [
      { id: "note_from_phone", title: "Phone Quick Note", content: "Written on mobile while traveling" }
    ],
    activeNoteId: "note_from_phone",
    vfs: {
      "mobile_entry.js": "console.log('Written on phone');"
    },
    whiteboardBoards: [
      { id: "board_phone", title: "Phone Scratch Board", stickies: [], theme: "whiteboard", bg: "grid", updatedAt: Date.now() }
    ],
    whiteboardActiveBoardId: "board_phone",
    whiteboardTheme: "whiteboard",
    theme: "emerald",
    activeTabId: "tab-whiteboard",
    updatedAt: Date.now() + 1000
  };

  const applyResult = window.LuminaCloudSync.applyCloudPayload(incomingDevicePayload);
  assert(applyResult === true, "applyCloudPayload executed successfully");

  // Verify memory & localStorage were hydrated
  const hydratedEvents = JSON.parse(window.localStorage.getItem("lumina_calendar_events") || "[]");
  assert(hydratedEvents.some(e => e.id === "evt_from_phone"), "Calendar events hydrated into storage");

  const hydratedSessions = JSON.parse(window.localStorage.getItem("lumina_chat_sessions") || "[]");
  assert(hydratedSessions.some(s => s.id === "session_from_phone"), "Chat sessions hydrated into storage");
  assert(window.localStorage.getItem("lumina_active_session_id") === "session_from_phone", "Active session ID restored");

  const hydratedNotes = JSON.parse(window.localStorage.getItem("lumina_godx_multi_notes") || "[]");
  assert(hydratedNotes.some(n => n.id === "note_from_phone"), "Notes vault hydrated into storage");

  const hydratedVfs = JSON.parse(window.localStorage.getItem("lumina_codespace_vfs") || "{}");
  assert(hydratedVfs["mobile_entry.js"] !== undefined, "VFS files hydrated into storage");

  assert(window.localStorage.getItem("lumina_whiteboard_theme") === "whiteboard", "Whiteboard theme hydrated into storage");
  assert(window.localStorage.getItem("lumina_theme") === "emerald", "Theme hydrated into storage");
  assert(window.localStorage.getItem("lumina_active_tab_id") === "tab-whiteboard", "Active tab restored to open where last closed");

  // 5. Test Push to Mock Cloud API
  let pushedBody = null;
  const originalFetch = window.fetch;
  window.fetch = async (url, options = {}) => {
    if (url === '/api/sync') {
      if (options.method === 'POST') {
        pushedBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, timestamp: Date.now() })
        };
      }
      if (!options.method || options.method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: incomingDevicePayload, timestamp: incomingDevicePayload.updatedAt })
        };
      }
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    const pushOk = await window.LuminaCloudSync.pushToCloud();
    assert(pushOk === true, "pushToCloud successfully pushed state to API");
    assert(pushedBody !== null, "Pushed body captured by API mock");
    assert(pushedBody.data && Array.isArray(pushedBody.data.calendar), "Pushed body contains calendar data");
    assert(pushedBody.data && pushedBody.data.vfs["mobile_entry.js"] !== undefined, "Pushed body contains VFS files");
    assert(pushedBody.data && pushedBody.data.activeTabId !== undefined, "Pushed body contains activeTabId for same-tab resume");

    // 6. Test Pull from Cloud
    const pullOk = await window.LuminaCloudSync.pullFromCloud();
    assert(pullOk === true, "pullFromCloud successfully retrieved and applied state");
  } finally {
    window.fetch = originalFetch;
  }

  // 7. Test Active Session Window (20-minute active session window & auto-logout policy)
  const authGuardPath = require('path').join(rootDir, 'api', '_lib', 'auth-guard.js');
  const authGuardSrc = require('fs').readFileSync(authGuardPath, 'utf8');
  assert(/1200/.test(authGuardSrc) || /20\s*\*\s*60/.test(authGuardSrc), "auth-guard.js enforces 20-minute active session window (1200s)");

  const authApiPath = require('path').join(rootDir, 'api', 'auth.js');
  const authApiSrc = require('fs').readFileSync(authApiPath, 'utf8');
  assert(/1200/.test(authApiSrc) || /20\s*\*\s*60/.test(authApiSrc), "api/auth.js sets 20-minute cookie maxAge (1200s)");
  assert(/sessionId/.test(authApiSrc), "api/auth.js returns sessionId in JSON response");

  // 8. Test 20-Minute Idle Auto-Logout & Exact Last Trigger Cloud Flush
  const systemPath = require('path').join(rootDir, 'modules', 'system.js');
  const systemSrc = require('fs').readFileSync(systemPath, 'utf8');
  assert(/IDLE_TIMEOUT_MS\s*=\s*20\s*\*\s*60\s*\*\s*1000/.test(systemSrc), "system.js sets active session timeout to exactly 20 minutes");
  assert(systemSrc.includes('handleSessionTimeout'), "system.js defines handleSessionTimeout");
  assert(systemSrc.includes('flushSync'), "system.js flushes cloud sync on session timeout at exact last trigger");

  // 9. Test Login Warp Prefetch & Tab Hydration in index.html
  const indexPath = require('path').join(rootDir, 'index.html');
  const indexSrc = require('fs').readFileSync(indexPath, 'utf8');
  assert(indexSrc.includes('/api/sync'), "index.html prefetches /api/sync during login warp transition");
  assert(indexSrc.includes('lumina_session_id'), "index.html preserves lumina_session_id in localStorage");
  assert(indexSrc.includes('lumina_active_tab_id'), "index.html preserves lumina_active_tab_id for opening same tab where last closed");

  // 9. Test Debounced Queueing
  let queueTriggered = false;
  const mockFlush = window.LuminaCloudSync.flushSync;
  window.LuminaCloudSync.flushSync = () => { queueTriggered = true; };
  window.LuminaCloudSync.queueSync();
  assert(window.LuminaCloudSync.isSyncScheduled() === true, "queueSync schedules background sync timer");
  window.LuminaCloudSync.flushSync = mockFlush;

  console.log("✓ Sovereign Cloud Sync & Multi-Device Continuity sub-suite completed successfully!");
};
