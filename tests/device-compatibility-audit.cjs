// tests/device-compatibility-audit.cjs
// Automated Chrome DevTools Protocol (CDP) Multi-Device Compatibility Audit
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 3001;
const CDP_PORT = 9224;
const TEMP_PROFILE = path.join(os.tmpdir(), 'chrome_cdp_audit_' + Date.now());
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
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'godx_session=mock_audit_ok; Path=/;' });
    res.end(JSON.stringify({ success: true, sessionId: 'mock_audit_ok' }));
    return;
  }

  if (pathname === '/api/chat') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'Device Audit Mock Active', choices: [{ message: { content: 'OK' } }] }));
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

const DEVICES_TO_AUDIT = [
  { name: 'Ultra-Narrow Foldable (Galaxy Z Fold Cover)', width: 344, height: 882, scale: 2.6, mobile: true, category: 'Foldable' },
  { name: 'Compact Smartphone (iPhone SE)', width: 375, height: 667, scale: 2.0, mobile: true, category: 'Mobile' },
  { name: 'Standard Smartphone (Samsung Galaxy S22/S24)', width: 360, height: 800, scale: 3.0, mobile: true, category: 'Mobile' },
  { name: 'Modern Premium Smartphone (iPhone 15 Pro)', width: 393, height: 852, scale: 3.0, mobile: true, category: 'Mobile' },
  { name: 'Large Smartphone (Google Pixel 7)', width: 412, height: 915, scale: 2.6, mobile: true, category: 'Mobile' },
  { name: 'Unfolded Foldable (Galaxy Z Fold Inner)', width: 768, height: 1076, scale: 2.0, mobile: true, category: 'Tablet' },
  { name: 'Compact Tablet (iPad Mini)', width: 768, height: 1024, scale: 2.0, mobile: true, category: 'Tablet' },
  { name: 'Standard Tablet (iPad Pro 11")', width: 834, height: 1194, scale: 2.0, mobile: true, category: 'Tablet' },
  { name: 'Large Tablet Landscape (iPad Pro 12.9")', width: 1366, height: 1024, scale: 2.0, mobile: false, category: 'Laptop/Tablet' },
  { name: 'Compact Laptop (13" MacBook)', width: 1280, height: 800, scale: 1.0, mobile: false, category: 'Laptop' },
  { name: 'Full HD Desktop Display (1080p)', width: 1920, height: 1080, scale: 1.0, mobile: false, category: 'Desktop' },
  { name: 'Ultra-wide Desktop Display (21:9 UWQHD)', width: 3440, height: 1440, scale: 1.0, mobile: false, category: 'Ultrawide' }
];

const TABS_TO_AUDIT = [
  'tab-ai-studio',
  'tab-projects',
  'tab-sandbox',
  'tab-whiteboard',
  'tab-design',
  'tab-scratchpad',
  'tab-calendar',
  'tab-controls',
  'tab-smartlock'
];

async function runDeviceAudit() {
  console.log("================================================================================");
  console.log("   LUMINAVISTA OS — CHROME DEVTOOLS PROTOCOL (CDP) DEVICE AUDIT ENGINE");
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

  // Connect CDP
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

  console.log("[CDP] Navigating to dashboard.html...");
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
          door_open_time_s: 14,
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
          { uid: '04:A1:B2:C3:D4:E5:F6', name: 'Master Executive Key', status: 'active', color: '#00f2fe', tap_count: 42, last_tap: '2026-10-07 19:28:10' },
          { uid: '04:88:99:AA:BB:CC:DD', name: 'Guest NFC Badge', status: 'suspended', color: '#f43f5e', tap_count: 5, last_tap: '2026-10-06 14:10:00' }
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

  const auditReport = [];
  let totalChecks = 0;
  let passedChecks = 0;

  for (const dev of DEVICES_TO_AUDIT) {
    console.log(`\n🔍 Auditing [${dev.category}] ${dev.name} (${dev.width}x${dev.height}, Scale: ${dev.scale}x)...`);

    // 1. Emulate Device Viewport & Touch
    await sendCdp('Emulation.setDeviceMetricsOverride', {
      width: dev.width,
      height: dev.height,
      deviceScaleFactor: dev.scale,
      mobile: dev.mobile
    });
    await sendCdp('Emulation.setTouchEmulationEnabled', {
      enabled: dev.mobile,
      maxTouchPoints: dev.mobile ? 5 : 0
    });
    await new Promise(r => setTimeout(r, 200));

    const deviceResult = {
      device: dev.name,
      dimensions: `${dev.width}x${dev.height}`,
      category: dev.category,
      issues: [],
      tabsTested: []
    };

    // 2. Global Document Overflow Check
    const globalOverflow = await evaluate(`(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const bodyW = document.body.scrollWidth;
      return {
        hasDocOverflow: docW > winW + 2,
        docW,
        winW,
        bodyW,
        overflowPixels: Math.max(0, docW - winW)
      };
    })()`);

    totalChecks++;
    if (!globalOverflow.hasDocOverflow) {
      passedChecks++;
    } else {
      deviceResult.issues.push(`Global horizontal overflow on document: scrollWidth (${globalOverflow.docW}px) > window.innerWidth (${globalOverflow.winW}px) by ${globalOverflow.overflowPixels}px`);
    }

    // 3. Navigation & Responsive Chrome Check
    const navCheck = await evaluate(`(() => {
      const isMobileBreakpoint = window.innerWidth < 768;
      const mobileToggleBtn = document.getElementById('mobileMenuToggleBtn');
      const desktopSidebar = document.getElementById('mainSidebar');

      let mobileToggleOk = true;
      if (isMobileBreakpoint) {
        const toggleStyle = mobileToggleBtn ? window.getComputedStyle(mobileToggleBtn) : null;
        mobileToggleOk = Boolean(toggleStyle && toggleStyle.display !== 'none');
      }

      let desktopSidebarOk = true;
      if (!isMobileBreakpoint) {
        const dStyle = desktopSidebar ? window.getComputedStyle(desktopSidebar) : null;
        desktopSidebarOk = Boolean(dStyle && dStyle.display !== 'none');
      }

      return {
        isMobileBreakpoint,
        mobileToggleOk,
        desktopSidebarOk
      };
    })()`);

    totalChecks++;
    if (navCheck.mobileToggleOk && navCheck.desktopSidebarOk) {
      passedChecks++;
    } else {
      deviceResult.issues.push(`Navigation responsive mode failure: mobileToggleOk=${navCheck.mobileToggleOk}, desktopSidebarOk=${navCheck.desktopSidebarOk}`);
    }

    // 4. Tab-by-Tab Responsive Layout Audit
    for (const tabId of TABS_TO_AUDIT) {
      await evaluate(`switchTab('${tabId}')`);
      await new Promise(r => setTimeout(r, 60));

      const tabMetrics = await evaluate(`(() => {
        const tabEl = document.getElementById('${tabId}');
        if (!tabEl) return { exists: false };
        const style = window.getComputedStyle(tabEl);
        if (style.display === 'none') return { exists: true, hidden: true };

        const tabRect = tabEl.getBoundingClientRect();
        const tabScrollW = tabEl.scrollWidth;
        const tabClientW = tabEl.clientWidth;
        const hasTabOverflow = tabScrollW > tabClientW + 3;

        // Specific Tab Checks
        let specificOk = true;
        let specificNote = '';

        if ('${tabId}' === 'tab-smartlock') {
          const connPanel = document.getElementById('slConnHistoryPanel');
          const logsList = document.getElementById('slLogsList');
          if (!connPanel || !logsList) {
            specificOk = false;
            specificNote = 'Missing SmartLock panels';
          } else {
            const connRect = connPanel.getBoundingClientRect();
            const logsRect = logsList.getBoundingClientRect();
            if (connRect.width < 220 || logsRect.width < 220) {
              specificOk = false;
              specificNote = \`Panel width too squished: conn=\${Math.round(connRect.width)}px, logs=\${Math.round(logsRect.width)}px\`;
            }
          }
        }

        if ('${tabId}' === 'tab-ai-studio') {
          const promptInput = document.getElementById('aiPromptTextarea');
          const chatScroll = document.getElementById('aiChatHistory');
          if (!promptInput || !chatScroll) {
            specificOk = false;
            specificNote = 'Missing AI Studio prompt or chat scroll area';
          } else {
            const inputRect = promptInput.getBoundingClientRect();
            if (inputRect.width < 180) {
              specificOk = false;
              specificNote = \`Prompt input too narrow (\${Math.round(inputRect.width)}px)\`;
            }
          }
        }

        if ('${tabId}' === 'tab-calendar') {
          const calContainer = document.getElementById('calendarViewContainer');
          if (!calContainer) {
            specificOk = false;
            specificNote = 'Missing calendarViewContainer';
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
        deviceResult.tabsTested.push({ tab: tabId, status: 'PASS' });
      } else {
        const errorMsg = `Tab [${tabId}] issue: hasTabOverflow=${tabMetrics.hasTabOverflow} (scrollW:${tabMetrics.tabScrollW} vs clientW:${tabMetrics.tabClientW}) note=${tabMetrics.specificNote}`;
        deviceResult.issues.push(errorMsg);
        deviceResult.tabsTested.push({ tab: tabId, status: 'FAIL', error: errorMsg });
      }
    }

    // 5. Capture visual evidence screenshots for representative devices
    if (['iPhone 15 Pro', 'Compact Tablet (iPad Mini)', 'Full HD Desktop Display (1080p)', 'Ultra-Narrow Foldable (Galaxy Z Fold Cover)'].includes(dev.name)) {
      // Capture screenshot of SmartLock Tab
      await evaluate("switchTab('tab-smartlock')");
      await new Promise(r => setTimeout(r, 100));
      const ssData = await sendCdp('Page.captureScreenshot', { format: 'png' });
      if (ssData.result?.data) {
        const safeName = dev.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const ssPath = path.join(ARTIFACT_DIR, `device_${safeName}_smartlock.png`);
        fs.writeFileSync(ssPath, Buffer.from(ssData.result.data, 'base64'));
        deviceResult.screenshot = ssPath;
      }
    }

    auditReport.push(deviceResult);
    if (deviceResult.issues.length === 0) {
      console.log(`  ✅ ${dev.name}: All layout, viewport, and tab checks PASSED!`);
    } else {
      console.log(`  ❌ ${dev.name}: Found ${deviceResult.issues.length} issue(s):`);
      deviceResult.issues.forEach(iss => console.log(`     - ${iss}`));
    }
  }

  // Restore Default Desktop
  await sendCdp('Emulation.clearDeviceMetricsOverride');

  console.log("\n================================================================================");
  console.log(`   DEVICE AUDIT SUMMARY: ${passedChecks} / ${totalChecks} CHECKS PASSED`);
  console.log(`   CONSOLE ERRORS RECORDED: ${consoleErrors.length}`);
  console.log("================================================================================\n");

  // Cleanup
  ws.close();
  chromeProc.kill();
  server.close();
  try {
    fs.rmSync(TEMP_PROFILE, { recursive: true, force: true });
  } catch (e) {}

  // Write out structured JSON audit report for review
  const reportPath = path.join(ARTIFACT_DIR, 'device_compatibility_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalChecks,
    passedChecks,
    consoleErrorsCount: consoleErrors.length,
    devicesAuditedCount: DEVICES_TO_AUDIT.length,
    devices: auditReport
  }, null, 2));
  console.log(`[Report] Saved audit report to ${reportPath}`);

  if (passedChecks === totalChecks && consoleErrors.length === 0) {
    console.log("🎉 ALL DEVICE COMPATIBILITY CHECKS PASSED WITH 100% SUCCESS!");
    process.exit(0);
  } else {
    console.error("⚠️ Some device compatibility issues were detected.");
    process.exit(1);
  }
}

runDeviceAudit().catch(err => {
  console.error("Audit Runner Fatal Error:", err);
  server.close();
  process.exit(1);
});
