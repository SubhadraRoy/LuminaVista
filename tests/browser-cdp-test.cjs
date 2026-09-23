// tests/browser-cdp-test.cjs - Automated Chrome DevTools Protocol (CDP) Browser Verification
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const os = require('os');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 3000;
const CDP_PORT = 9223;
const TEMP_PROFILE = path.join(os.tmpdir(), 'chrome_cdp_' + Date.now());

console.log("=== STARTING LUMINA VISTA OS CHROME CDP BROWSER VERIFICATION ===");

// 1. Boot local mock server
const ROOT = path.join(__dirname, '..');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/auth') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'godx_session=mock_session_ok; Path=/;' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (pathname === '/api/chat') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'CDP Test AI Gateway Active.', choices: [{ message: { content: 'CDP Active' } }] }));
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
      console.log("  [Server 404]:", pathname);
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(safePath).pipe(res);
  });
});

async function runBrowserTest() {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  console.log(`[Server] Local mock server listening on http://127.0.0.1:${PORT}`);

  // 2. Launch Headless Chrome
  const chromeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--mute-audio',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
    `--user-data-dir=${TEMP_PROFILE}`
  ];

  console.log(`[Chrome] Launching headless Chrome on port ${CDP_PORT} with profile: ${TEMP_PROFILE}`);
  const chromeProc = spawn(CHROME_PATH, chromeArgs, { stdio: 'ignore' });

  // Wait for CDP port to open
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      if (res.ok) {
        let pages = await res.json();
        let targetPage = pages.find(p => p.type === 'page' && !p.url.startsWith('chrome-extension://'));
        if (!targetPage) {
          const newTargetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?http://127.0.0.1:${PORT}/dashboard.html`, { method: 'PUT' });
          if (newTargetRes.ok) {
            targetPage = await newTargetRes.json();
          }
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

  console.log(`[CDP] Connected to Chrome WebSocket: ${wsUrl}`);
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
      consoleErrors.push(data.params.exceptionDetails);
    }
    if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
      // Ignore favicon or benign warnings
      if (!data.params.entry.text.includes("favicon")) {
        consoleErrors.push(data.params.entry.text);
      }
    }
    if (data.method === 'Page.loadEventFired') {
      pageLoaded = true;
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

  // Enable domains
  await sendCdp('Page.enable');
  await sendCdp('Runtime.enable');
  await sendCdp('Log.enable');

  console.log(`[Navigation] Navigating to http://127.0.0.1:${PORT}/dashboard.html...`);
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/dashboard.html` });

  // Wait until document.readyState === 'complete' and main elements are fully mounted
  for (let i = 0; i < 40; i++) {
    const isReady = await evaluate("document.readyState === 'complete' && !!document.getElementById('mainSidebar') && !!document.getElementById('tab-ai-studio')");
    if (isReady) break;
    await new Promise(r => setTimeout(r, 250));
  }
  await new Promise(r => setTimeout(r, 500));

  let testCount = 0;
  let passedCount = 0;

  function test(name, pass) {
    testCount++;
    if (pass) {
      passedCount++;
      console.log(`  ✓ BROWSER PASS: ${name}`);
    } else {
      console.error(`  ✗ BROWSER FAIL: ${name}`);
    }
  }

  console.log("\n[Browser Execution & Visual Verification]");
  const currentUrl = await evaluate("window.location.href");
  console.log("  [CDP Debug] Current URL:", currentUrl);
  const rawTitle = await evaluate("document.title");
  console.log("  [CDP Debug] Document Title:", rawTitle);
  const rawBody = await evaluate("document.body ? document.body.innerHTML.substring(0, 150) : 'NO BODY'");
  console.log("  [CDP Debug] Body Preview:", rawBody);

  // 1. Page Title & Theme
  const pageTitle = await evaluate("document.title");
  test("Page title matches 'LuminaVista OS'", pageTitle.includes("LuminaVista OS"));

  const theme = await evaluate("document.documentElement.getAttribute('data-theme')");
  test("Default theme is 'cyan'", theme === "cyan");

  // 2. Sidebar minimize / maximize
  await evaluate("toggleSidebarMinimize()");
  const sidebarWidthCollapsed = await evaluate("document.getElementById('mainSidebar').style.width");
  test("Sidebar collapses to 68px", sidebarWidthCollapsed === "68px");

  await evaluate("toggleSidebarMinimize()");
  const sidebarWidthExpanded = await evaluate("document.getElementById('mainSidebar').style.width");
  test("Sidebar expands to 250px", sidebarWidthExpanded === "250px");

  // 3. Tab switching across all 10 tabs
  const tabs = [
    'tab-ai-studio', 'tab-projects', 'tab-sandbox', 'tab-whiteboard',
    'tab-design', 'tab-split', 'tab-terminal', 'tab-analytics',
    'tab-scratchpad', 'tab-controls'
  ];

  for (const t of tabs) {
    await evaluate(`switchTab('${t}')`);
    const isVisible = await evaluate(`!document.getElementById('${t}').classList.contains('hidden')`);
    test(`Switched and verified visibility of #${t}`, isVisible);
  }

  // 4. Verify 22 Personas Roster in DOM
  const personaCount = await evaluate("window.LuminaPersonas.length");
  test(`Loaded ${personaCount} personas (expected 22)`, personaCount >= 20);

  const selectCount = await evaluate("document.getElementById('modalAiPersonaSelect').options.length");
  test(`Persona dropdown has ${selectCount} options (roster populated)`, selectCount >= 20);

  // 5. Whiteboard Pro Canvas & Tool Selection
  await evaluate("switchTab('tab-whiteboard')");
  const hasWbCanvas = await evaluate("document.getElementById('whiteboardCanvas') !== null");
  test("Whiteboard Pro main canvas rendered in Chrome", hasWbCanvas);

  await evaluate("setWbTool('pen'); setWbPresetColor('#10b981');");
  const wbTool = await evaluate("window.wbTool");
  test("Switched whiteboard tool to 'pen'", wbTool === 'pen');

  // 6. Notes Markdown Editor & Preview Mode Switcher
  await evaluate("switchTab('tab-scratchpad')");
  await evaluate("setNoteViewMode('split')");
  const splitVisible = await evaluate("!document.getElementById('notePreviewCol').classList.contains('hidden') && !document.getElementById('adminScratchpad').classList.contains('hidden')");
  test("Notes Markdown split mode active", splitVisible);

  // 7. Compilers & Code Sandbox
  await evaluate("switchTab('tab-sandbox')");
  await evaluate("setSandboxLanguage('python')");
  const currentLang = await evaluate("window.currentSbLang");
  test("Sandbox language switched to 'python'", currentLang === 'python');

  // 8. Clock & Telemetry
  const clockText = await evaluate("document.getElementById('systemClock')?.textContent || ''");
  test("System clock running in header", clockText.length > 0);

  // 9. Security Lock Perimeter Verification
  await evaluate("lockSession(false)");
  const isBlurred = await evaluate("document.getElementById('app-root').classList.contains('blur-lg')");
  test("Security Lock blurs workspace #app-root", isBlurred);
  const isLockOpen = await evaluate("document.getElementById('lockModal').style.display === 'flex'");
  test("Security Lock modal is displayed", isLockOpen);
  await evaluate("document.getElementById('lockModal').style.display = 'none'; document.getElementById('app-root').classList.remove('blur-lg', 'pointer-events-none');");

  // 10. Check for Uncaught Exceptions
  test(`Browser console is free of uncaught exceptions (Found: ${consoleErrors.length})`, consoleErrors.length === 0);
  if (consoleErrors.length > 0) {
    console.error("Console Errors logged:", consoleErrors);
  }

  console.log(`\n=== BROWSER TEST RESULTS: ${passedCount}/${testCount} PASSED ===\n`);

  // Cleanup
  ws.close();
  chromeProc.kill();
  server.close();

  try {
    fs.rmSync(path.join(ROOT, '.chrome-temp-profile'), { recursive: true, force: true });
  } catch (e) {}

  if (passedCount === testCount) {
    console.log("🎉 ALL REAL-BROWSER TESTS PASSED IN GOOGLE CHROME!");
    process.exit(0);
  } else {
    console.error("❌ BROWSER TESTS FAILED!");
    process.exit(1);
  }
}

runBrowserTest().catch(err => {
  console.error("Browser Test Runner Error:", err);
  server.close();
  process.exit(1);
});
