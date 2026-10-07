// tests/all-devices-all-tabs-audit.cjs
// Comprehensive Chrome DevTools Protocol (CDP) All-Devices x All-Tabs Individual Verification
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 3003;
const CDP_PORT = 9226;
const TEMP_PROFILE = path.join(os.tmpdir(), 'chrome_cdp_matrix_' + Date.now());
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
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'godx_session=mock_all_ok; Path=/;' });
    res.end(JSON.stringify({ success: true, sessionId: 'mock_all_ok' }));
    return;
  }

  if (pathname === '/api/chat') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'All Devices Audit AI Active', choices: [{ message: { content: 'OK' } }] }));
    return;
  }

  if (pathname === '/api/calendar/status' || pathname === '/api/calendar') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured: true, connected: false }));
    return;
  }

  if (pathname === '/api/calendar/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, items: [] }));
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

const ALL_DEVICES = [
  // 1. Mobile Phones (Compact to Large)
  { name: 'Ultra-Budget Phone (320x640)', width: 320, height: 640, scale: 1.5, type: 'Phone' },
  { name: 'Classic Budget Phone (360x640)', width: 360, height: 640, scale: 2.0, type: 'Phone' },
  { name: 'Compact iPhone (375x667)', width: 375, height: 667, scale: 2.0, type: 'Phone' },
  { name: 'Standard Android - Galaxy A54 (360x800)', width: 360, height: 800, scale: 3.0, type: 'Phone' },
  { name: 'Compact Flagship - Galaxy S24 (360x780)', width: 360, height: 780, scale: 3.0, type: 'Phone' },
  { name: 'Midrange Pro - Redmi Note 13 (393x873)', width: 393, height: 873, scale: 2.75, type: 'Phone' },
  { name: 'Modern iPhone 15 Pro (393x852)', width: 393, height: 852, scale: 3.0, type: 'Phone' },
  { name: 'Google Pixel 8 (412x915)', width: 412, height: 915, scale: 2.625, type: 'Phone' },
  { name: 'Flagship Ultra - Galaxy S24 Ultra (412x892)', width: 412, height: 892, scale: 3.5, type: 'Phone' },
  { name: 'Large Pro Flagship (448x998)', width: 448, height: 998, scale: 2.875, type: 'Phone' },

  // 2. Foldables & Flip Devices
  { name: 'Foldable Cover Screen (344x882)', width: 344, height: 882, scale: 2.625, type: 'Foldable' },
  { name: 'Flip Phone Unfolded (360x880)', width: 360, height: 880, scale: 3.0, type: 'Foldable' },
  { name: 'Foldable Inner Screen (768x1076)', width: 768, height: 1076, scale: 2.0, type: 'Foldable' },

  // 3. Tablets
  { name: 'Compact Tablet - iPad Mini (768x1024)', width: 768, height: 1024, scale: 2.0, type: 'Tablet' },
  { name: 'Standard Tablet - iPad Pro 11" (834x1194)', width: 834, height: 1194, scale: 2.0, type: 'Tablet' },
  { name: 'Large Tablet Landscape (1366x1024)', width: 1366, height: 1024, scale: 2.0, type: 'Tablet' },

  // 4. PCs & Laptops
  { name: 'Compact Laptop 13" (1280x800)', width: 1280, height: 800, scale: 1.0, type: 'Laptop' },
  { name: 'Standard Laptop 15.6" (1366x768)', width: 1366, height: 768, scale: 1.0, type: 'Laptop' },
  { name: 'Full HD Desktop PC (1920x1080)', width: 1920, height: 1080, scale: 1.0, type: 'Desktop' },
  { name: '2K QHD Desktop Display (2560x1440)', width: 2560, height: 1440, scale: 1.0, type: 'Desktop' },
  { name: '21:9 Ultrawide Desktop (3440x1440)', width: 3440, height: 1440, scale: 1.0, type: 'Ultrawide' }
];

const ALL_14_TABS = [
  { id: 'tab-ai-studio', name: '1. AI-Studio' },
  { id: 'tab-artifacts', name: '2. Artifacts IDE' },
  { id: 'tab-graphify', name: '3. Graphify Graph' },
  { id: 'tab-projects', name: '4. Projects Explorer' },
  { id: 'tab-sandbox', name: '5. Compilers & SQL' },
  { id: 'tab-whiteboard', name: '6. Whiteboard Pro' },
  { id: 'tab-design', name: '7. UI Generator' },
  { id: 'tab-split', name: '8. Split Compare' },
  { id: 'tab-terminal', name: '9. Terminal MicroVM' },
  { id: 'tab-analytics', name: '10. Telemetry' },
  { id: 'tab-scratchpad', name: '11. Notes Markdown' },
  { id: 'tab-calendar', name: '12. Calendar & Agenda' },
  { id: 'tab-controls', name: '13. Settings & Theme' },
  { id: 'tab-smartlock', name: '14. Smart Door Lock' }
];

async function runMegaAudit() {
  console.log("================================================================================");
  console.log("   LUMINAVISTA OS — ALL-DEVICES x ALL-14-TABS COMPREHENSIVE CDP AUDIT ENGINE");
  console.log(`   Auditing ${ALL_DEVICES.length} Distinct Devices x ${ALL_14_TABS.length} Tabs = ${ALL_DEVICES.length * ALL_14_TABS.length} Individual Sessions`);
  console.log("================================================================================\n");

  await new Promise(r => server.listen(PORT, r));
  console.log(`[Server] Local HTTP server listening on http://127.0.0.1:${PORT}`);

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

  console.log(`[CDP] Connected to Chrome DevTools Protocol WebSocket: ${wsUrl}`);
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

  console.log("[CDP] Navigating to dashboard.html...");
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/dashboard.html` });
  await new Promise(r => setTimeout(r, 1500));

  // Initialize SmartLock mock state
  await evaluate(`(() => {
    if (window.LuminaSmartLock) {
      window.LuminaSmartLock.setState({
        online: true,
        status: {
          door_status: 1,
          alarm_status: 0,
          door_open_time_s: 18,
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
          { uid: '04:A1:B2:C3:D4:E5:F6', name: 'Executive Master Card', status: 'active', color: '#00f2fe', tap_count: 58, last_tap: '2026-10-07 19:28:10' }
        ],
        connHistory: [
          { seq: 1, type: 'ONLINE', ts: '2026-10-07 19:30:00', reason: 'Reconnected to Gateway' }
        ],
        logs: [
          { seq: 1, ts: '2026-10-07 19:30:00', category: 'access', msg: 'System armed and ready' }
        ]
      });
    }
  })()`);

  let totalSessions = 0;
  let passedSessions = 0;
  const failures = [];

  for (const device of ALL_DEVICES) {
    const isMobile = device.width < 768;
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`📱 [${device.type}] ${device.name} — Viewport: ${device.width}x${device.height} (DPR: ${device.scale})`);
    console.log(`--------------------------------------------------------------------------------`);

    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.scale,
      mobile: isMobile
    });
    await sendCdp('Emulation.setTouchEmulationEnabled', {
      enabled: isMobile,
      maxTouchPoints: isMobile ? 5 : 0
    });
    await new Promise(r => setTimeout(r, 120));

    for (const tab of ALL_14_TABS) {
      totalSessions++;
      await evaluate(`switchTab('${tab.id}')`);
      await new Promise(r => setTimeout(r, 75));

      const tabResult = await evaluate(`(() => {
        let targetId = '${tab.id}';
        if (targetId === 'tab-artifacts' || targetId === 'tab-graphify') {
          targetId = 'tab-ai-studio';
        }
        const tabEl = document.getElementById(targetId);
        if (!tabEl) return { ok: false, error: 'Element does not exist: ' + targetId };

        const style = window.getComputedStyle(tabEl);
        if (style.display === 'none') return { ok: false, error: 'Tab is display: none: ' + targetId };

        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        const bodyW = document.body.scrollWidth;
        const hasDocOverflow = docW > winW + 2 || bodyW > winW + 2;

        const tabScrollW = tabEl.scrollWidth;
        const tabClientW = tabEl.clientWidth;
        const hasTabOverflow = tabScrollW > tabClientW + 3;

        // Specific element sanity checks
        let componentCheck = true;
        let compError = '';

        if ('${tab.id}' === 'tab-ai-studio') {
          const ta = document.getElementById('aiPromptTextarea');
          if (!ta) { componentCheck = false; compError = 'Missing #aiPromptTextarea'; }
        } else if ('${tab.id}' === 'tab-artifacts') {
          const meter = document.getElementById('vfsStorageBar');
          const csCol = document.getElementById('aiCodespaceColumn');
          const isVisible = csCol && !csCol.classList.contains('hidden');
          if (!meter || !isVisible) { componentCheck = false; compError = 'Missing #vfsStorageBar or #aiCodespaceColumn hidden'; }
        } else if ('${tab.id}' === 'tab-graphify') {
          const cv = document.getElementById('graphifyCanvas');
          const grCol = document.getElementById('aiGraphifyColumn');
          const isVisible = grCol && !grCol.classList.contains('hidden');
          if (!cv || !isVisible) { componentCheck = false; compError = 'Missing #graphifyCanvas or #aiGraphifyColumn hidden'; }
        } else if ('${tab.id}' === 'tab-projects') {
          const frame = document.getElementById('previewIframe');
          if (!frame) { componentCheck = false; compError = 'Missing #previewIframe'; }
        } else if ('${tab.id}' === 'tab-sandbox') {
          const codeInput = document.getElementById('sandboxCodeInput');
          if (!codeInput) { componentCheck = false; compError = 'Missing #sandboxCodeInput'; }
        } else if ('${tab.id}' === 'tab-whiteboard') {
          const cv = document.getElementById('whiteboardCanvas');
          if (!cv) { componentCheck = false; compError = 'Missing #whiteboardCanvas'; }
        } else if ('${tab.id}' === 'tab-design') {
          const btn = document.querySelector('#tab-design button[onclick*=\"copyGeneratedDesignCss\"]');
          if (!btn) { componentCheck = false; compError = 'Missing Copy CSS Token button'; }
        } else if ('${tab.id}' === 'tab-split') {
          const sel = document.getElementById('splitLeftSelect');
          if (!sel) { componentCheck = false; compError = 'Missing #splitLeftSelect'; }
        } else if ('${tab.id}' === 'tab-terminal') {
          const termIn = document.getElementById('terminalInput');
          if (!termIn) { componentCheck = false; compError = 'Missing #terminalInput'; }
        } else if ('${tab.id}' === 'tab-analytics') {
          const chart = document.getElementById('metricsChart');
          if (!chart) { componentCheck = false; compError = 'Missing #metricsChart'; }
        } else if ('${tab.id}' === 'tab-scratchpad') {
          const pad = document.getElementById('adminScratchpad');
          if (!pad) { componentCheck = false; compError = 'Missing #adminScratchpad'; }
        } else if ('${tab.id}' === 'tab-calendar') {
          const calCont = document.getElementById('calendarViewContainer');
          if (!calCont) { componentCheck = false; compError = 'Missing #calendarViewContainer'; }
        } else if ('${tab.id}' === 'tab-controls') {
          const themeBtn = document.querySelector('button[onclick*=\"setDashboardTheme\"]');
          if (!themeBtn) { componentCheck = false; compError = 'Missing theme button'; }
        } else if ('${tab.id}' === 'tab-smartlock') {
          const uBtn = document.getElementById('slBtnUnlock');
          if (!uBtn) { componentCheck = false; compError = 'Missing #slBtnUnlock'; }
        }

        const isSuccess = !hasDocOverflow && !hasTabOverflow && componentCheck;
        return {
          ok: isSuccess,
          hasDocOverflow,
          docW,
          winW,
          hasTabOverflow,
          tabScrollW,
          tabClientW,
          componentCheck,
          compError
        };
      })()`);

      if (tabResult.ok) {
        passedSessions++;
        process.stdout.write(`  ✓ [${tab.name.padEnd(20)}] PASS (scrollW: ${tabResult.docW}px <= ${tabResult.winW}px)\n`);
      } else {
        const failureReason = tabResult.hasDocOverflow
          ? `Document horizontal overflow: ${tabResult.docW}px > ${tabResult.winW}px`
          : (tabResult.hasTabOverflow
            ? `Tab container horizontal overflow: ${tabResult.tabScrollW}px > ${tabResult.tabClientW}px`
            : (tabResult.compError || tabResult.error || 'Unknown failure'));
        failures.push({
          device: device.name,
          tab: tab.name,
          reason: failureReason
        });
        process.stdout.write(`  ❌ [${tab.name.padEnd(20)}] FAIL: ${failureReason}\n`);
      }
    }
  }

  // Restore Default Desktop Viewport
  await sendCdp('Emulation.clearDeviceMetricsOverride');

  console.log("\n================================================================================");
  console.log(`   MEGA AUDIT FINAL RESULTS: ${passedSessions} / ${totalSessions} SESSIONS PASSED`);
  console.log(`   CONSOLE ERRORS RECORDED: ${consoleErrors.length}`);
  console.log("================================================================================\n");

  // Cleanup
  ws.close();
  chromeProc.kill();
  server.close();
  try {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  } catch (e) {}

  const reportPath = path.join(ARTIFACT_DIR, 'mega_device_tabs_audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalSessions,
    passedSessions,
    consoleErrorsCount: consoleErrors.length,
    devicesAudited: ALL_DEVICES.map(d => `${d.name} (${d.width}x${d.height})`),
    tabsAudited: ALL_14_TABS.map(t => t.name),
    failures
  }, null, 2));
  console.log(`[Report] Saved complete mega audit report to ${reportPath}`);

  if (passedSessions === totalSessions && consoleErrors.length === 0) {
    console.log("🎉 ALL 14 TABS ON ALL 18 DEVICE TYPES PASSED WITH 100% SUCCESS!");
    process.exit(0);
  } else {
    console.error(`⚠️ Detected ${failures.length} session failure(s).`);
    process.exit(1);
  }
}

runMegaAudit().catch(err => {
  console.error("Mega Audit Fatal Error:", err);
  server.close();
  process.exit(1);
});
