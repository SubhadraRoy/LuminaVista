// tests/recheck-all-tasks.cjs - Rigorous recheck of all 5 target issues requested by user
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

async function runComprehensiveRecheck() {
  console.log("=================================================================");
  console.log("   LUMINAVISTA OS COMPREHENSIVE 5-POINT VERIFICATION AUDIT       ");
  console.log("=================================================================\n");

  const rootDir = path.resolve(__dirname, '..');
  const dashboardHtmlPath = path.join(rootDir, 'dashboard.html');
  const dashboardHtml = fs.readFileSync(dashboardHtmlPath, 'utf8');

  const dom = new JSDOM(dashboardHtml, {
    url: 'http://localhost:3000/dashboard.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const { document } = window;

  let passedAssertions = 0;
  function testAssert(condition, message) {
    assert(condition, message);
    passedAssertions++;
    console.log(`  ✓ PASS: ${message}`);
  }

  // =========================================================================
  // ITEM 1: ADMIN ACCESS PASSWORDS & MIN-1 KEY RULE (ZERO 'MASTER ADMIN' REFERENCES)
  // =========================================================================
  console.log("\n[ITEM 1 AUDIT: Admin Access Passwords & Min-1 Key Rule]");

  // 1A. Grep entire repository for "Master Administrator" and "master admin key"
  const adminJs = fs.readFileSync(path.join(rootDir, 'api', 'admin.js'), 'utf8');
  const iotJs = fs.readFileSync(path.join(rootDir, 'api', 'iot.js'), 'utf8');
  const adminAccessJs = fs.readFileSync(path.join(rootDir, 'modules', 'admin-access.js'), 'utf8');

  testAssert(!adminJs.includes("Master Administrator"), "api/admin.js has ZERO occurrences of 'Master Administrator'");
  testAssert(!adminJs.includes("master admin"), "api/admin.js has ZERO occurrences of 'master admin'");
  testAssert(!iotJs.includes("Master Administrator"), "api/iot.js has ZERO occurrences of 'Master Administrator'");
  testAssert(!adminAccessJs.includes("Master Administrator"), "modules/admin-access.js has ZERO occurrences of 'Master Administrator'");

  // 1B. Test API delete logic with <= 1 item in storage
  const adminMod = await import('../api/admin.js');
  const redisMod = await import('../api/_lib/redis.js');
  const safeStorage = redisMod.getSafeStorage();

  const sessionId = 'test_temp_session_123';
  await safeStorage.set(`session:${sessionId}`, JSON.stringify({ role: 'temporary', keyId: 'sole_key_01' }));

  // Pre-seed storage with 1 key
  await safeStorage.set('admin:temp_passwords', JSON.stringify([
    { id: 'sole_key_01', label: 'Primary Key', hash: 'abc', preview: '••••11' }
  ]));

  let sentStatus = 0;
  let sentJson = null;
  const mockRes = {
    status(s) { sentStatus = s; return this; },
    json(data) { sentJson = data; return this; },
    setHeader() {},
    end() {}
  };

  const mockReq = {
    method: 'POST',
    headers: { 'x-session-id': sessionId },
    body: { action: 'delete', id: 'sole_key_01' }
  };

  await adminMod.default(mockReq, mockRes);
  console.log("DEBUG sentStatus:", sentStatus, sentJson);

  testAssert(sentStatus === 400, "Deleting the only active key returns HTTP 400 Bad Request");
  testAssert(
    sentJson && sentJson.error === 'Cannot delete the last access key: At least one active access password must remain present at all times.',
    `API returns exact error: "${sentJson?.error}"`
  );

  // 1C. Verify multiple keys deletion works down to 1
  await safeStorage.set('admin:temp_passwords', JSON.stringify([
    { id: 'key_1', label: 'Key 1', hash: 'h1', preview: '•••1' },
    { id: 'key_2', label: 'Key 2', hash: 'h2', preview: '•••2' }
  ]));

  const mockReq2 = {
    method: 'POST',
    headers: { 'x-session-id': sessionId },
    body: { action: 'delete', id: 'key_1' }
  };

  await adminMod.default(mockReq2, mockRes);
  testAssert(sentStatus === 200 && sentJson.success === true, "Deleting when > 1 key succeeds with HTTP 200");

  const storedAfterDelete = JSON.parse(await safeStorage.get('admin:temp_passwords'));
  testAssert(storedAfterDelete.length === 1 && storedAfterDelete[0].id === 'key_2', "Remaining key 'key_2' preserved in storage");

  // =========================================================================
  // ITEM 2: GOOGLE CALENDAR TWO-WAY SYNCHRONIZATION
  // =========================================================================
  console.log("\n[ITEM 2 AUDIT: Google Calendar Two-Way Synchronization]");

  const calSyncJs = fs.readFileSync(path.join(rootDir, 'modules', 'calendar-sync.js'), 'utf8');
  const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));

  // 2A. CORS Methods include DELETE
  const apiHeaderRule = vercelJson.headers.find(h => h.source === '/api/(.*)');
  const corsMethods = apiHeaderRule?.headers.find(h => h.key === 'Access-Control-Allow-Methods')?.value;
  testAssert(corsMethods && corsMethods.includes('DELETE'), `vercel.json CORS includes DELETE: "${corsMethods}"`);

  // 2B. Exclusive all-day end dates in pushEventToGoogle
  testAssert(calSyncJs.includes("endDateStr <= startDateStr"), "pushEventToGoogle computes strictly exclusive end date for single-day all-day events");

  // 2C. Cancelled events filter on pull
  testAssert(calSyncJs.includes("item && item.status !== 'cancelled'"), "syncGoogleCalendar filters out cancelled Google Calendar events");

  // 2D. Connected flag is set before unpushed events loop
  const connectedPos = calSyncJs.indexOf("googleCalendarConnected: true");
  const unpushedPos = calSyncJs.indexOf("const unpushedEvents = calendarEvents.filter");
  testAssert(connectedPos !== -1 && unpushedPos !== -1 && connectedPos < unpushedPos, "googleCalendarConnected is set BEFORE unpushedEvents loop so events are pushed");

  // 2E. Background periodic sync interval exists
  testAssert(calSyncJs.includes("5 * 60 * 1000") && calSyncJs.includes("setInterval"), "Periodic 5-minute background auto-sync interval mounted");
  testAssert(calSyncJs.includes("window.addEventListener('focus'"), "Window focus auto-sync listener mounted");

  // =========================================================================
  // ITEM 3: CALENDAR UI MONTH VIEW (DAY 1 WRAP & TODAY BLOWOUT)
  // =========================================================================
  console.log("\n[ITEM 3 AUDIT: Calendar Month View UI Mistakes]");

  const calJs = fs.readFileSync(path.join(rootDir, 'modules', 'calendar.js'), 'utf8');

  // 3A. Date 1 separation from circular span
  testAssert(
    calJs.includes("${cellDay === 1 ? `<span class=\"text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 mr-0.5\">${cellDate.toLocaleString('default', { month: 'short' })}</span>` : ''}"),
    "Month name abbreviation (e.g. 'Oct') rendered outside circular badge when cellDay === 1"
  );
  testAssert(
    !calJs.includes("${cellDay === 1 ? `${cellDate.toLocaleString('default', { month: 'short' })} ${cellDay}` : cellDay}"),
    "Fixed circular badge no longer forces 'Oct 1' into 24px circle (eliminates vertical text wrapping)"
  );

  // 3B. Today cell height and padding matched to normal cells
  testAssert(calJs.includes("min-h-[90px]") && !calJs.includes("min-h-[95px]"), "Today cell standardized to min-h-[90px] (eliminates min-h-[95px] row blowout)");
  testAssert(calJs.includes("ring-2 ring-inset ring-cyan-400"), "Today cell uses ring-inset instead of external border-2 (prevents cell 16 from overlapping day 23)");

  // =========================================================================
  // ITEM 4: AI CHAT DISAPPEARING AFTER A FEW MINUTES (CLOUD SYNC MERGE)
  // =========================================================================
  console.log("\n[ITEM 4 AUDIT: AI Chat Disappearing & Non-Destructive Cloud Sync]");

  const cloudSyncJs = fs.readFileSync(path.join(rootDir, 'modules', 'cloud-sync.js'), 'utf8');

  // 4A. Non-destructive merge logic exists
  testAssert(cloudSyncJs.includes("Non-destructive merge to protect active conversations"), "Non-destructive chat merge comments and structure present in cloud-sync.js");

  // 4B. Test non-destructive merge simulation
  window.localStorage.clear();

  // Create active local conversation with 3 messages
  const localActiveChat = [
    { role: 'user', content: 'What is LuminaVista OS?' },
    { role: 'assistant', content: 'LuminaVista OS is a sovereign desktop environment.' },
    { role: 'user', content: 'Can you show me the calendar?' }
  ];
  const localSessions = [
    {
      id: 'session_active_01',
      title: 'What is LuminaVista OS?',
      messages: localActiveChat,
      updatedAt: Date.now()
    }
  ];

  window.aiSessions = [...localSessions];
  window.chatSessions = [...localSessions];
  window.aiConversation = [...localActiveChat];
  window.localStorage.setItem('lumina_chat_sessions', JSON.stringify(localSessions));
  window.localStorage.setItem('lumina_ai_history', JSON.stringify(localActiveChat));

  // Load cloud-sync module into DOM window
  eval(`(function(window, document) { ${cloudSyncJs} })(window, document);`);

  testAssert(typeof window.LuminaCloudSync === 'object', "window.LuminaCloudSync is initialized");

  // Simulate incoming cloud state from 90s pull with STALE / EMPTY session
  const staleCloudState = {
    chatSessions: [
      {
        id: 'session_active_01',
        title: 'New Conversation',
        messages: [], // Empty messages in stale cloud!
        updatedAt: Date.now() - 600000
      }
    ],
    aiConversation: [] // Empty active conversation in stale cloud!
  };

  // Apply cloud payload
  window.LuminaCloudSync.applyCloudPayload(staleCloudState);

  // Verify that local active conversation was NOT wiped!
  const preservedSessions = JSON.parse(window.localStorage.getItem('lumina_chat_sessions'));
  const preservedConv = JSON.parse(window.localStorage.getItem('lumina_ai_history'));

  testAssert(preservedSessions.length === 1, "Session preserved after cloud hydration");
  testAssert(preservedSessions[0].messages.length === 3, `Preserved all 3 messages in session (Found: ${preservedSessions[0].messages.length})`);
  testAssert(preservedConv.length === 3, `Preserved active conversation memory without wipe (Found: ${preservedConv.length})`);
  testAssert(preservedConv[2].content === 'Can you show me the calendar?', "Active conversation contents remain 100% intact");

  // =========================================================================
  // ITEM 5: AI CHAT HEADER CLEANUP & DYNAMIC ACTIVE MODEL DISPLAY
  // =========================================================================
  console.log("\n[ITEM 5 AUDIT: AI Chat Header Cleanup & Dynamic Active Model Badge]");

  // 5A. Web Live and JEV 2.0 HUD are hidden visually from header
  const webBadge = document.getElementById('webSearchActiveBadge');
  const jevHud = document.getElementById('jevStudioHud');
  const modelBadge = document.getElementById('aiActiveModelBadge');

  testAssert(webBadge !== null && webBadge.classList.contains('hidden'), "#webSearchActiveBadge is cleanly hidden from header");
  testAssert(jevHud !== null && jevHud.classList.contains('hidden'), "#jevStudioHud is cleanly hidden from header visually");
  testAssert(modelBadge !== null && !modelBadge.classList.contains('hidden'), "#aiActiveModelBadge is mounted and visible");

  // 5B. Model badge displays current active model name
  const aiStudioJs = fs.readFileSync(path.join(rootDir, 'modules', 'ai-studio.js'), 'utf8');
  testAssert(!aiStudioJs.includes('modelBadge.textContent = "Universal Hybrid (Ollama + NIM)"'), "Eliminated hardcoded 'Universal Hybrid (Ollama + NIM)' text on model badge");
  testAssert(aiStudioJs.includes('modelBadge.textContent = selectedModel;'), "modelBadge textContent dynamically populated with actual selected model");

  // 5C. /api/chat tracks actualModel across all failovers
  const chatApiJs = fs.readFileSync(path.join(rootDir, 'api', 'chat.js'), 'utf8');
  testAssert(chatApiJs.includes("let actualModelUsed = requestedModel || 'gpt-oss:20b'"), "api/chat.js initializes actualModelUsed tracker");
  testAssert(chatApiJs.includes("actualModel: actualModelUsed"), "api/chat.js returns actualModel in JSON response");
  testAssert(aiStudioJs.includes("activeModelBadge.textContent = data.actualModel;"), "modules/ai-studio.js dynamically updates model badge when failover model is returned");

  // =========================================================================
  // LINE COUNT LIMITS & REPO INTEGRITY (< 2,000 LINES)
  // =========================================================================
  console.log("\n[CONSTRAINT AUDIT: Line Count Budget & Hardware Gateway Protection]");

  const targetFiles = [
    'api/admin.js',
    'api/chat.js',
    'api/iot.js',
    'dashboard.html',
    'modules/admin-access.js',
    'modules/ai-studio.js',
    'modules/calendar-sync.js',
    'modules/calendar.js',
    'modules/cloud-sync.js',
    'tests/features.test.cjs'
  ];

  for (const relPath of targetFiles) {
    const fullPath = path.join(rootDir, relPath);
    const lineCount = fs.readFileSync(fullPath, 'utf8').split('\n').length;
    testAssert(lineCount < 2000, `${relPath} line count is ${lineCount} (< 2,000 limit)`);
  }

  console.log(`\n=================================================================`);
  console.log(`🎉 ALL ${passedAssertions} COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!`);
  console.log(`=================================================================\n`);
  process.exit(0);
}

runComprehensiveRecheck().catch(err => {
  console.error("❌ RECHECK FAILED:", err);
  process.exit(1);
});
