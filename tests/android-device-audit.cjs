// tests/android-device-audit.cjs
// Deep Chrome DevTools Protocol (CDP) Android Ecosystem Compatibility Suite
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 3002;
const CDP_PORT = 9225;
const TEMP_PROFILE = path.join(os.tmpdir(), 'chrome_cdp_android_' + Date.now());
const ROOT = path.join(__dirname, '..');
const ARTIFACT_DIR = "C:\\Users\\roysu\\.gemini\\antigravity\\brain\\83517808-f46e-465e-b687-161411f06537";

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/auth') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'godx_session=mock_android_ok; Path=/;' });
    res.end(JSON.stringify({ success: true, sessionId: 'mock_android_ok' }));
    return;
  }

  if (pathname === '/api/chat') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'Android CDP Mock AI Active', choices: [{ message: { content: 'OK' } }] }));
    return;
  }

  if (pathname === '/api/calendar/status' || pathname === '/api/calendar') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured: true, connected: false }));
    return;
  }

  if (pathname === '/api/iot') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        req.rawBody = body;
        req.body = body ? JSON.parse(body) : {};
        const iotMod = await import('../api/iot.js');
        let statusCode = 200;
        const vercelRes = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (code) => { statusCode = code; return vercelRes; },
          json: (obj) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.writeHead(statusCode);
            res.end(JSON.stringify(obj));
          },
          send: (str) => { res.writeHead(statusCode); res.end(str); },
          end: (str) => { res.writeHead(statusCode); res.end(str); }
        };
        await iotMod.default(req, vercelRes);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found: ' + pathname);
      return;
    }
    const ext = path.extname(safePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    fs.createReadStream(safePath).pipe(res);
  });
});

// Complete Android Device Spectrum Matrix
const ANDROID_DEVICES = [
  {
    name: 'Android Ultra-Budget (JioPhone Next / Galaxy A01 Core)',
    width: 320,
    height: 640,
    scale: 1.5,
    category: 'Ultra-Budget (320px)',
    ua: 'Mozilla/5.0 (Linux; Android 11; SM-A013F Build/RP1A.200720.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Android Classic Budget (Galaxy J2 / Redmi 9A / Moto E)',
    width: 360,
    height: 640,
    scale: 2.0,
    category: 'Budget 16:9 (360px)',
    ua: 'Mozilla/5.0 (Linux; Android 10; M2006C3LG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Samsung Galaxy A14 / A34 / A54 (World #1 Android Viewport)',
    width: 360,
    height: 800,
    scale: 3.0,
    category: 'Mass-Market 20:9 (360px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Samsung Galaxy S22 / S23 / S24 (Compact Flagship)',
    width: 360,
    height: 780,
    scale: 3.0,
    category: 'Compact Flagship (360px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Xiaomi Redmi Note 12 / 13 Pro / Poco F5',
    width: 393,
    height: 873,
    scale: 2.75,
    category: 'High-Density Midrange (393px)',
    ua: 'Mozilla/5.0 (Linux; Android 13; 23049PCD8G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Google Pixel 7 / 7a / 8 / 8a',
    width: 412,
    height: 915,
    scale: 2.625,
    category: 'Google Pixel Standard (412px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Samsung Galaxy S23 Ultra / S24 Ultra',
    width: 412,
    height: 892,
    scale: 3.5,
    category: 'Flagship Ultra (412px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Google Pixel 8 Pro / 9 Pro XL',
    width: 448,
    height: 998,
    scale: 2.875,
    category: 'Large Pro Flagship (448px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Samsung Galaxy Z Fold 5/6 (Cover Screen)',
    width: 344,
    height: 882,
    scale: 2.625,
    category: 'Foldable Cover (344px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Samsung Galaxy Z Flip 5/6 (Unfolded Ultra-Tall 22:9)',
    width: 360,
    height: 880,
    scale: 3.0,
    category: 'Flip Unfolded (360px)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-F731B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Android Virtual Keyboard (IME Active Resized Viewport)',
    width: 360,
    height: 420,
    scale: 3.0,
    category: 'Virtual Keyboard Open (360x420)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  },
  {
    name: 'Android Landscape Orientation (Galaxy S24 Landscape)',
    width: 800,
    height: 360,
    scale: 3.0,
    category: 'Landscape Phone (800x360)',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  }
];

const TABS_TO_AUDIT = [
  'tab-ai-studio',
  'tab-smartlock',
  'tab-projects',
  'tab-sandbox',
  'tab-whiteboard',
  'tab-design',
  'tab-scratchpad',
  'tab-calendar',
  'tab-controls'
];

async function runAndroidAudit() {
  console.log("================================================================================");
  console.log("   LUMINAVISTA OS — CHROME DEVTOOLS PROTOCOL ANDROID ECOSYSTEM AUDIT");
  console.log("================================================================================\n");

  await new Promise(r => server.listen(PORT, r));
  console.log(`[Server] Local HTTP server running on http://127.0.0.1:${PORT}`);

  const chromeArgs = [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--mute-audio',
    '--window-size=1440,900',
    `--user-data-dir=${TEMP_PROFILE}`
  ];

  const chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        let pages = await res.json();
        let targetPage = pages.find(p => p.type === 'page' && !p.url.startsWith('chrome-extension://'));
        if (!targetPage) {
          const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${PORT}/dashboard.html`, { method: 'PUT' });
          if (newTargetRes.ok) targetPage = await newTargetRes.json();
        }
        if (targetPage && targetPage.webSocketDebuggerUrl) {
          wsUrl = targetPage.webSocketDebuggerUrl;
          break;
        }
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error("❌ Failed to connect to Chrome DevTools Protocol");
    chromeProc.kill();
    server.close();
    process.exit(1);
  }

  console.log(`[CDP] Connected to Chrome DevTools WebSocket: ${wsUrl}`);
  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pendingRequests = new Map();
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pendingRequests.has(data.id)) {
      const cb = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      cb(data);
    }
    if (data.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(data.params.exceptionDetails?.text || 'Exception');
    }
  };

  await new Promise(r => ws.onopen = r);

  function sendCdp(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pendingRequests.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await sendCdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.error) console.error("CDP Eval Error:", res.error);
    return res.result?.result?.value;
  }

  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('Log.enable');

  console.log("[CDP] Loading LuminaVista OS dashboard for Android audit...");
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/dashboard.html` });
  await new Promise(r => setTimeout(r, 1200));

  // Initialize SmartLock mock state
  await evaluate(`(() => {
    if (window.LuminaSmartLock) {
      window.LuminaSmartLock.setState({
        online: true,
        status: {
          door_status: 1,
          alarm_status: 0,
          door_open_time_s: 24,
          last_door_event: 'DOOR_OPEN (Manual Exterior Entry)',
          last_event: 'NFC_TAP_AUTHORIZED UID: 04:A1:B2:C3:D4:E5:F6',
          relay3_state: 1,
          relay4_state: 0,
          heap_free: 208896,
          heap_total: 327680,
          last_online: '2026-10-07 19:30:00',
          last_offline: '2026-10-07 19:15:00'
        },
        cards: [
          { uid: '04:A1:B2:C3:D4:E5:F6', name: 'Executive Master Card', status: 'active', color: '#00f2fe', tap_count: 58, last_tap: '2026-10-07 19:28:10' },
          { uid: '04:88:99:AA:BB:CC:DD', name: 'Temporary Contractor Key', status: 'suspended', color: '#f43f5e', tap_count: 3, last_tap: '2026-10-06 14:10:00' }
        ],
        connHistory: [
          { seq: 3, type: 'ONLINE', ts: '2026-10-07 19:30:00', reason: 'Reconnected to Gateway' },
          { seq: 2, type: 'OFFLINE', ts: '2026-10-07 19:15:00', reason: 'Heartbeat Timeout' },
          { seq: 1, type: 'ONLINE', ts: '2026-10-07 18:00:00', reason: 'System Boot' }
        ],
        logs: [
          { seq: 1, ts: '2026-10-07 19:30:00', category: 'access', msg: 'Admin unlock command dispatched successfully' },
          { seq: 2, ts: '2026-10-07 19:28:10', category: 'access', msg: 'Authorized NFC Badge scanned (UID: 04:A1:B2:C3:D4:E5:F6)' },
          { seq: 3, ts: '2026-10-07 19:15:00', category: 'alarm', msg: 'Warning: Door held open > 10 seconds' }
        ]
      });
    }
  })()`);

  const androidAuditReport = [];
  let totalChecks = 0;
  let passedChecks = 0;

  for (const phone of ANDROID_DEVICES) {
    console.log(`\n📱 Auditing [${phone.category}] ${phone.name} (${phone.width}x${phone.height}, DPR: ${phone.scale})...`);

    // 1. Emulate Android Device Metrics, Touch, and User Agent
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: phone.width,
      height: phone.height,
      deviceScaleFactor: phone.scale,
      mobile: true,
      screenOrientation: phone.width > phone.height
        ? { angle: 90, type: 'landscapePrimary' }
        : { angle: 0, type: 'portraitPrimary' }
    });
    await sendCdp('Emulation.setUserAgentOverride', {
      userAgent: phone.ua,
      platform: 'Linux armv8l'
    });
    await sendCdp('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5
    });
    await new Promise(r => setTimeout(r, 200));

    const result = {
      device: phone.name,
      category: phone.category,
      resolution: `${phone.width}x${phone.height}`,
      issues: [],
      tabsTested: []
    };

    // 2. Global Document Overflow Check on Android
    const globalOverflow = await evaluate(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const bodyW = document.body.scrollWidth;
      return {
        hasDocOverflow: docW > winW + 2,
        docW,
        winW,
        bodyW,
        overflowDelta: Math.max(0, docW - winW)
      };
    })()`);

    totalChecks++;
    if (!globalOverflow.hasDocOverflow) {
      passedChecks++;
    } else {
      result.issues.push(`Global horizontal overflow: scrollWidth (${globalOverflow.docW}px) > innerWidth (${globalOverflow.winW}px) by ${globalOverflow.overflowDelta}px`);
    }

    // 3. Android Mobile Navigation Drawer & Hamburger Check
    const navDrawerCheck = await evaluate(`(() => {
      const toggleBtn = document.getElementById('mobileMenuToggleBtn');
      const backdrop = document.getElementById('sidebarBackdrop');
      const sidebar = document.getElementById('mainSidebar');
      if (!toggleBtn || !backdrop || !sidebar) return { ok: false, reason: 'Missing nav elements' };

      const isMobile = window.innerWidth < 768;
      if (!isMobile) return { ok: true, isMobile: false };

      const btnRect = toggleBtn.getBoundingClientRect();
      const btnVisible = btnRect.width >= 32 && btnRect.height >= 32;

      // Test Drawer Open
      window.toggleMobileSidebar && window.toggleMobileSidebar();
      const openedStyle = window.getComputedStyle(sidebar);
      const isDrawerOpen = sidebar.classList.contains('translate-x-0') || !sidebar.classList.contains('-translate-x-full');

      // Test Drawer Close
      window.closeMobileSidebar && window.closeMobileSidebar();
      const isDrawerClosed = sidebar.classList.contains('-translate-x-full');

      return {
        ok: btnVisible && isDrawerOpen && isDrawerClosed,
        btnVisible,
        btnWidth: btnRect.width,
        isDrawerOpen,
        isDrawerClosed
      };
    })()`);

    totalChecks++;
    if (navDrawerCheck.ok) {
      passedChecks++;
    } else {
      result.issues.push(`Navigation drawer failure: btnVisible=${navDrawerCheck.btnVisible} (${navDrawerCheck.btnWidth}px), open=${navDrawerCheck.isDrawerOpen}, closed=${navDrawerCheck.isDrawerClosed}`);
    }

    // 4. Tab-by-Tab Compatibility Audit on Android
    for (const tabId of TABS_TO_AUDIT) {
      await evaluate(`switchTab('${tabId}')`);
      await new Promise(r => setTimeout(r, 60));

      const tabMetrics = await evaluate(`(() => {
        const tabEl = document.getElementById('${tabId}');
        if (!tabEl) return { exists: false };
        const style = window.getComputedStyle(tabEl);
        if (style.display === 'none') return { exists: true, hidden: true };

        const tabScrollW = tabEl.scrollWidth;
        const tabClientW = tabEl.clientWidth;
        const hasTabOverflow = tabScrollW > tabClientW + 3;

        let specificOk = true;
        let specificNote = '';

        if ('${tabId}' === 'tab-smartlock') {
          const btnUnlock = document.getElementById('slBtnUnlock');
          const btnLock = document.getElementById('slBtnLock');
          const connPanel = document.getElementById('slConnHistoryPanel');
          const logsList = document.getElementById('slLogsList');

          if (!btnUnlock || !btnLock || !connPanel || !logsList) {
            specificOk = false;
            specificNote = 'Missing SmartLock core controls';
          } else {
            const uRect = btnUnlock.getBoundingClientRect();
            const lRect = btnLock.getBoundingClientRect();
            // Verify buttons are comfortably tapable on mobile touchscreens (height >= 32px)
            if (uRect.height < 32 || lRect.height < 32) {
              specificOk = false;
              specificNote = \`Unlock/Lock touch target too small: unlockH=\${Math.round(uRect.height)}px, lockH=\${Math.round(lRect.height)}px\`;
            }
          }
        }

        if ('${tabId}' === 'tab-ai-studio') {
          const textarea = document.getElementById('aiPromptTextarea');
          const sendBtn = document.getElementById('btnAiSend');
          const voiceBtn = document.getElementById('btnAiVoiceMode');
          if (!textarea || !sendBtn || !voiceBtn) {
            specificOk = false;
            specificNote = 'Missing AI Studio input bar elements';
          } else {
            const tRect = textarea.getBoundingClientRect();
            const sRect = sendBtn.getBoundingClientRect();
            if (tRect.width < 140 || sRect.width < 32 || sRect.height < 32) {
              specificOk = false;
              specificNote = \`AI prompt bar cramped: textW=\${Math.round(tRect.width)}px, sendW=\${Math.round(sRect.width)}px\`;
            }
          }
        }

        return {
          exists: true,
          hasTabOverflow,
          tabScrollW,
          tabClientW,
          specificOk,
          specificNote
        };
      })()`);

      totalChecks++;
      if (tabMetrics.exists && !tabMetrics.hasTabOverflow && tabMetrics.specificOk) {
        passedChecks++;
        result.tabsTested.push({ tab: tabId, status: 'PASS' });
      } else {
        const err = `Tab [${tabId}] failed on ${phone.name}: overflow=${tabMetrics.hasTabOverflow} (${tabMetrics.tabScrollW}px vs ${tabMetrics.tabClientW}px) note=${tabMetrics.specificNote}`;
        result.issues.push(err);
        result.tabsTested.push({ tab: tabId, status: 'FAIL', error: err });
      }
    }

    // 5. Capture visual screenshot for representative Android models
    if ([
      'Samsung Galaxy A14 / A34 / A54 (World #1 Android Viewport)',
      'Google Pixel 7 / 7a / 8 / 8a',
      'Android Ultra-Budget (JioPhone Next / Galaxy A01 Core)',
      'Samsung Galaxy Z Fold 5/6 (Cover Screen)',
      'Android Virtual Keyboard (IME Active Resized Viewport)'
    ].includes(phone.name)) {
      await evaluate("switchTab('tab-smartlock')");
      await new Promise(r => setTimeout(r, 100));
      const ss = await sendCdp('Page.captureScreenshot', { format: 'png' });
      if (ss.result?.data) {
        const safeName = phone.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const ssPath = path.join(ARTIFACT_DIR, `android_${safeName}.png`);
        fs.writeFileSync(ssPath, Buffer.from(ss.result.data, 'base64'));
        result.screenshot = ssPath;
      }
    }

    androidAuditReport.push(result);
    if (result.issues.length === 0) {
      console.log(`  ✅ ${phone.name}: 100% Android compatible (0 overflow, responsive touch targets, smooth drawer)!`);
    } else {
      console.log(`  ❌ ${phone.name}: Found ${result.issues.length} issue(s):`);
      result.issues.forEach(iss => console.log(`     - ${iss}`));
    }
  }

  // Restore Default Desktop Viewport
  await sendCdp('Emulation.clearDeviceMetricsOverride');
  await sendCdp('Emulation.setUserAgentOverride', { userAgent: '' });

  console.log("\n================================================================================");
  console.log(`   ANDROID AUDIT SUMMARY: ${passedChecks} / ${totalChecks} CHECKS PASSED`);
  console.log(`   CONSOLE ERRORS RECORDED: ${consoleErrors.length}`);
  console.log("================================================================================\n");

  // Cleanup
  ws.close();
  chromeProc.kill();
  server.close();
  try {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  } catch (e) {}

  const reportPath = path.join(ARTIFACT_DIR, 'android_device_compatibility_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalChecks,
    passedChecks,
    consoleErrorsCount: consoleErrors.length,
    androidDevicesAuditedCount: ANDROID_DEVICES.length,
    results: androidAuditReport
  }, null, 2));
  console.log(`[Report] Saved Android audit report to ${reportPath}`);

  if (passedChecks === totalChecks && consoleErrors.length === 0) {
    console.log("🎉 ALL ANDROID PHONE COMPATIBILITY CHECKS PASSED WITH 100% SUCCESS!");
    process.exit(0);
  } else {
    console.error("⚠️ Some Android compatibility issues were detected.");
    process.exit(1);
  }
}

runAndroidAudit().catch(err => {
  console.error("Android Audit Fatal Error:", err);
  server.close();
  process.exit(1);
});
