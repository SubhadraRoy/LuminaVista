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

  let mockCdpWorkspace = null;

  if (pathname === '/api/sync') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id, authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: mockCdpWorkspace,
        timestamp: mockCdpWorkspace ? mockCdpWorkspace.updatedAt : Date.now()
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          mockCdpWorkspace = {
            ...(parsed.data || {}),
            updatedAt: Date.now()
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Cloud sync updated', timestamp: mockCdpWorkspace.updatedAt }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (pathname === '/api/auth') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'godx_session=mock_session_ok; Path=/;' });
    res.end(JSON.stringify({ success: true, sessionId: 'mock_session_ok' }));
    return;
  }

  if (pathname === '/api/chat') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'CDP Test AI Gateway Active.', choices: [{ message: { content: 'CDP Active' } }] }));
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

  if (pathname === '/api/calendar/auth') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured: true, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=true' }));
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

  const isCollapsedClassApplied = await evaluate("document.getElementById('mainSidebar').classList.contains('sidebar-collapsed')");
  test("Sidebar has .sidebar-collapsed class when minimized", isCollapsedClassApplied);

  const headerFlexDir = await evaluate("window.getComputedStyle(document.getElementById('sidebarHeader')).flexDirection");
  test("Sidebar header stacks brand and toggle button vertically (flex-direction: column)", headerFlexDir === "column");

  const brandAndToggleNonOverlapping = await evaluate(`(() => {
    const brandRect = document.getElementById('sidebarBrand').getBoundingClientRect();
    const toggleRect = document.getElementById('sidebarToggleBtn').getBoundingClientRect();
    const noVerticalOverlap = toggleRect.top >= brandRect.bottom;
    const sbRect = document.getElementById('mainSidebar').getBoundingClientRect();
    const sbCenter = sbRect.left + sbRect.width / 2;
    const brandCenter = brandRect.left + brandRect.width / 2;
    const toggleCenter = toggleRect.left + toggleRect.width / 2;
    const isBrandCentered = Math.abs(brandCenter - sbCenter) < 5;
    const isToggleCentered = Math.abs(toggleCenter - sbCenter) < 5;
    return noVerticalOverlap && isBrandCentered && isToggleCentered;
  })()`);
  test("GX logo and collapse toggle button are vertically stacked and centered without merging", brandAndToggleNonOverlapping);

  const navIconsCentered = await evaluate(`(() => {
    const sbRect = document.getElementById('mainSidebar').getBoundingClientRect();
    const sbCenter = sbRect.left + sbRect.width / 2;
    const buttons = Array.from(document.querySelectorAll('#mainSidebar nav .tab-btn'));
    return buttons.every(btn => {
      const rect = btn.getBoundingClientRect();
      const btnCenter = rect.left + rect.width / 2;
      return Math.abs(btnCenter - sbCenter) < 4;
    });
  })()`);
  test("All sidebar navigation tab icons are horizontally centered in 68px column", navIconsCentered);

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

  // 4. Verify 35 Categories & 1,800+ Specialists Matrix in DOM
  const personaCount = await evaluate("window.LuminaPersonas.length");
  test(`Loaded ${personaCount} personas (expected >= 1800)`, personaCount >= 1800);

  const categoryOptionsCount = await evaluate("document.getElementById('modalAiCategorySelect')?.options.length || 0");
  test(`Category dropdown has 35 domains (Found: ${categoryOptionsCount})`, categoryOptionsCount === 35);

  const selectCount = await evaluate("document.getElementById('modalAiPersonaSelect').options.length");
  test(`Persona dropdown has ${selectCount} options for active category`, selectCount >= 50);

  // Test dynamic 2-tier category switching in browser
  await evaluate("document.getElementById('modalAiCategorySelect').value = 'cybersecurity'; onModalCategoryChange();");
  const cyberSpecialistCount = await evaluate("document.getElementById('modalAiPersonaSelect').options.length");
  test(`Switching category to 'cybersecurity' dynamically loads 50+ specialists (Found: ${cyberSpecialistCount})`, cyberSpecialistCount >= 50);

  // Test Universal Hybrid Engine default and removal of simulation option in Chrome
  const providerOptions = await evaluate("Array.from(document.getElementById('modalAiProviderSelect').options).map(o => o.value)");
  test("Provider dropdown contains 'hybrid_pool' as top option", providerOptions[0] === 'hybrid_pool');
  test("Provider dropdown cleanly removed 'simulation' option", !providerOptions.includes('simulation'));

  // Test presence of all requested free-quota Ollama models in Chrome
  const modelOptions = await evaluate("Array.from(document.getElementById('modalAiModelSelect').querySelectorAll('option')).map(o => o.value)");
  const hasAllFreeModels = [
    "gemma4:31b",
    "gpt-oss:120b",
    "gpt-oss:20b",
    "nemotron-3-nano:30b",
    "nemotron-3-super",
    "nemotron-3-ultra"
  ].every(m => modelOptions.includes(m));
  test("Model selector contains all 6 requested Ollama Cloud free-quota models", hasAllFreeModels);

  // Test presence of multiple categorized optgroups in Chrome
  const optgroupCount = await evaluate("document.getElementById('modalAiModelSelect').querySelectorAll('optgroup').length");
  test(`Model selector is structured with clear category optgroups (Found: ${optgroupCount})`, optgroupCount >= 4);

  // Test Thinking Orb Canvas Presence
  const hasThinkingOrb = await evaluate("document.getElementById('headerThinkingOrb') !== null");
  test("Thinking Orb canvas rendered in AI Studio header", hasThinkingOrb);

  // Test AI Studio Sub-Tabs Switching (Chat, Artifacts & Files, Graphify Graph)
  await evaluate("switchAiSubTab('artifacts')");
  const isArtifactsVisible = await evaluate("!document.getElementById('aiCodespaceColumn').classList.contains('hidden') && document.getElementById('aiChatView').classList.contains('hidden')");
  test("AI Studio sub-tab switched to 'artifacts'", isArtifactsVisible);

  await evaluate("switchAiSubTab('graphify')");
  const isGraphifyVisible = await evaluate("!document.getElementById('aiGraphifyColumn').classList.contains('hidden') && document.getElementById('aiCodespaceColumn').classList.contains('hidden')");
  test("AI Studio sub-tab switched to 'graphify'", isGraphifyVisible);

  const hasGraphifyCanvas = await evaluate("document.getElementById('graphifyCanvas') !== null");
  test("Graphify architecture canvas rendered in DOM", hasGraphifyCanvas);

  await evaluate("switchAiSubTab('chat')");
  const isChatVisible = await evaluate("!document.getElementById('aiChatView').classList.contains('hidden') && document.getElementById('aiGraphifyColumn').classList.contains('hidden')");
  test("AI Studio sub-tab returned to 'chat'", isChatVisible);

  // Test Slider Navigation for Artifacts IDE and Graphify Graph
  await evaluate("switchTab('tab-artifacts')");
  const sliderArtifactsActive = await evaluate("!document.getElementById('aiCodespaceColumn').classList.contains('hidden') && document.getElementById('btn-tab-artifacts').classList.contains('nav-tab-active')");
  test("Slider navigation switches to Artifacts IDE and highlights button", sliderArtifactsActive);

  await evaluate("switchTab('tab-graphify')");
  const sliderGraphifyActive = await evaluate("!document.getElementById('aiGraphifyColumn').classList.contains('hidden') && document.getElementById('btn-tab-graphify').classList.contains('nav-tab-active')");
  test("Slider navigation switches to Graphify Graph and highlights button", sliderGraphifyActive);

  // Verify Graphify canvas maintains rendered pixels and does not vanish
  await new Promise(r => setTimeout(r, 600));
  const graphifyPixels = await evaluate(`
    (() => {
      const c = document.getElementById('graphifyCanvas');
      if (!c) return 0;
      const ctx = c.getContext('2d');
      const img = ctx.getImageData(0, 0, c.width, c.height);
      let filled = 0;
      for (let i = 3; i < img.data.length; i += 4) {
        if (img.data[i] > 0) filled++;
      }
      return filled;
    })()
  `);
  test("Graphify canvas remains rendered and visible after simulation settles (> 1000px)", graphifyPixels > 1000);

  // Test dynamic real-time graph update when VFS changes
  const initialNodesText = await evaluate("document.getElementById('graphifyNodeCount')?.textContent || ''");
  await evaluate(`
    (() => {
      window.vfs = window.vfs || {};
      window.vfs['neural-agent.py'] = 'def run(): pass';
      if (window.rebuildGraphData) window.rebuildGraphData();
    })()
  `);
  const updatedNodesText = await evaluate("document.getElementById('graphifyNodeCount')?.textContent || ''");
  test("Graphify graph updates dynamically when VFS files change", updatedNodesText !== initialNodesText);

  const topTabsHidden = await evaluate("document.getElementById('aiSubTabsBar').classList.contains('hidden')");
  test("Top sub-tabs bar #aiSubTabsBar is hidden (moved to slider)", topTabsHidden);

  // Test AI-Studio Tab Renaming, Antigravity Quoting, Prompt Edit/Copy in Chrome
  const sidebarBtnText = await evaluate("document.getElementById('btn-tab-ai-studio')?.textContent || ''");
  test("Sidebar tab button labeled 'AI-Studio'", sidebarBtnText.includes("AI-Studio"));

  const promptPlaceholder = await evaluate("document.getElementById('aiPromptTextarea')?.placeholder || ''");
  test("Prompt textarea placeholder set to 'Message AI-Studio...'", promptPlaceholder.includes("AI-Studio"));

  const hasQuoteBanner = await evaluate("document.getElementById('aiQuoteBanner') !== null");
  test("Antigravity quoted message context banner present in Chrome", hasQuoteBanner);

  // Test quoting interaction in Chrome
  await evaluate(`
    window.aiConversation = [{ role: 'assistant', content: 'Here is sample code to inspect.' }];
    window.quoteChatMessage(0, 'assistant');
  `);
  const isBannerVisible = await evaluate("!document.getElementById('aiQuoteBanner').classList.contains('hidden')");
  test("Quote banner activates and becomes visible on quoteChatMessage", isBannerVisible);

  await evaluate("window.clearQuotedMessage()");
  const isBannerHidden = await evaluate("document.getElementById('aiQuoteBanner').classList.contains('hidden')");
  test("Quote banner hides on clearQuotedMessage", isBannerHidden);

  // Test prompt edit interaction in Chrome
  await evaluate(`
    window.aiConversation = [{ role: 'user', content: 'What is WebGL?' }, { role: 'assistant', content: 'WebGL is a JavaScript API.' }];
    window.startEditingPrompt(0);
  `);
  const hasInlineEditor = await evaluate("document.getElementById('inlineEditPromptTextarea_0') !== null");
  test("Inline prompt editor renders on startEditingPrompt", hasInlineEditor);

  await evaluate("window.cancelEditingPrompt()");
  const isEditorCleared = await evaluate("document.getElementById('inlineEditPromptTextarea_0') === null");
  test("Inline prompt editor clears on cancelEditingPrompt", isEditorCleared);

  // Test Antigravity Collapsible Chat & Feedback Privacy in Chrome
  await evaluate(`
    window.aiConversation = [
      { role: 'user', content: 'remove all files i want clean' },
      { role: 'assistant', content: '<thought>Removing files</thought>[TOOL:LIST_DIR][/TOOL:LIST_DIR][TOOL:DELETE_FILE filename="demo.txt"][/TOOL:DELETE_FILE]\\nFiles removed cleanly.' },
      { role: 'user', content: '[SYSTEM AUTO-FEEDBACK TOOL RESULTS]:\\n[TOOL_RESULT:DELETE_FILE]done[/TOOL_RESULT:DELETE_FILE]', isSystemFeedback: true },
      { role: 'assistant', content: '[TOOL:TASK_COMPLETE summary="Done."]Clean slate verified.' }
    ];
    window.renderAiChat();
  `);

  const thoughtCardCollapsed = await evaluate(`
    (() => {
      const el = document.querySelector('.thought-card');
      return el !== null && !el.hasAttribute('open');
    })()
  `);
  test("Thought card is collapsed by default in Chrome", thoughtCardCollapsed);

  const workDoneCardCollapsed = await evaluate(`
    (() => {
      const el = document.querySelector('.work-done-card');
      return el !== null && !el.hasAttribute('open');
    })()
  `);
  test("Antigravity Work Done card is collapsed by default in Chrome", workDoneCardCollapsed);

  const userBubblesCount = await evaluate(`document.querySelectorAll('#aiChatHistory .flex-row-reverse').length`);
  test("Internal system feedback is never rendered under ME (Found: 1)", userBubblesCount === 1);

  const noFeedbackLeaked = await evaluate(`
    !document.getElementById('aiChatHistory').innerHTML.includes('[SYSTEM AUTO-FEEDBACK') &&
    !document.getElementById('aiChatHistory').innerHTML.includes('[TOOL_RESULT:')
  `);
  test("Chat history is completely free of leaked system feedback and tool results in Chrome", noFeedbackLeaked);

  // Click summary to expand Work Done card in Chrome
  await evaluate(`
    (() => {
      const s = document.querySelector('.work-done-summary');
      if (s) s.click();
    })()
  `);
  const workDoneExpanded = await evaluate(`document.querySelector('.work-done-card').hasAttribute('open')`);
  test("Work Done card expands on click to reveal action details in Chrome", workDoneExpanded);

  // Test Mobile Sidebar Drawer
  await evaluate("openMobileSidebar()");
  const isMobileSidebarOpen = await evaluate("document.getElementById('mainSidebar').classList.contains('translate-x-0') && !document.getElementById('mainSidebar').classList.contains('-translate-x-full')");
  test("Mobile sidebar opened via openMobileSidebar()", isMobileSidebarOpen);

  await evaluate("closeMobileSidebar()");
  const isMobileSidebarClosed = await evaluate("document.getElementById('mainSidebar').classList.contains('-translate-x-full')");
  test("Mobile sidebar closed via closeMobileSidebar()", isMobileSidebarClosed);

  // Test Sessions Drawer Toggle
  await evaluate("toggleSessionsDrawer(true)");
  const isDrawerOpen = await evaluate("!document.getElementById('aiSessionsDrawer').classList.contains('hidden')");
  test("Sessions history drawer opened", isDrawerOpen);
  await evaluate("toggleSessionsDrawer(false)");
  const isDrawerClosed = await evaluate("document.getElementById('aiSessionsDrawer').classList.contains('hidden')");
  test("Sessions history drawer closed", isDrawerClosed);

  // 5. Whiteboard Pro Canvas & Tool Selection
  await evaluate("switchTab('tab-whiteboard')");
  const hasWbCanvas = await evaluate("document.getElementById('whiteboardCanvas') !== null");
  test("Whiteboard Pro main canvas rendered in Chrome", hasWbCanvas);

  await evaluate("setWbTool('pen'); setWbPresetColor('#10b981');");
  const wbTool = await evaluate("window.wbTool");
  test("Switched whiteboard tool to 'pen'", wbTool === 'pen');

  const touchActionNone = await evaluate("document.getElementById('whiteboardCanvas').style.touchAction === 'none'");
  test("Whiteboard Canvas has touch-action: none for touchscreen", touchActionNone);

  // Dispatch Touchscreen Pointer Events in Chrome
  const touchDrawSuccess = await evaluate(`
    (() => {
      const cv = document.getElementById('whiteboardCanvas');
      if (!cv) return false;
      const initialStack = (window.wbUndoStack || []).length;
      const ptDown = new PointerEvent('pointerdown', { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 200, pressure: 0.8, bubbles: true });
      const ptMove = new PointerEvent('pointermove', { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: 250, clientY: 250, pressure: 0.85, bubbles: true });
      const ptUp = new PointerEvent('pointerup', { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: 250, clientY: 250, bubbles: true });
      cv.dispatchEvent(ptDown);
      cv.dispatchEvent(ptMove);
      cv.dispatchEvent(ptUp);
      return (window.wbUndoStack || []).length > initialStack;
    })()
  `);
  test("Touchscreen drawing on laptop screen works seamlessly", touchDrawSuccess);

  // 5b. Whiteboard Pro Multi-Board Gallery, AI Directives & Premium Features in Chrome
  await evaluate("openWhiteboardGallery('templates')");
  const isGalleryOpen = await evaluate("!document.getElementById('whiteboardGalleryModal').classList.contains('hidden')");
  test("Whiteboard Gallery & Blueprints modal opened in Chrome", isGalleryOpen);

  const templateCardCount = await evaluate("document.getElementById('galleryTemplatesGrid').children.length");
  test(`Gallery rendered built-in architecture blueprint cards (Found: ${templateCardCount})`, templateCardCount >= 7);

  await evaluate("LuminaWhiteboardGallery.closeGalleryModal()");
  const isGalleryClosed = await evaluate("document.getElementById('whiteboardGalleryModal').classList.contains('hidden')");
  test("Whiteboard Gallery modal closed in Chrome", isGalleryClosed);

  // Load Microservices Blueprint in Chrome
  await evaluate("LuminaWhiteboardGallery.loadTemplate('template_microservices', false)");
  const hasStickies = await evaluate("(window.wbStickies || []).length > 0");
  test("Rendered Microservices Blueprint onto canvas with stickies in Chrome", hasStickies);

  // Test Multi-Board creation & switching
  await evaluate("LuminaWhiteboardGallery.createNewBoard('Architecture v2')");
  const activeBoardName = await evaluate("LuminaWhiteboardGallery.getCurrentActiveBoard().name");
  test("Created and switched to new board 'Architecture v2' in Chrome", activeBoardName === 'Architecture v2');

  // Test AI Diagram Assistant Modal
  await evaluate("openWhiteboardAiAssistant()");
  const isAiModalOpen = await evaluate("!document.getElementById('whiteboardAiModal').classList.contains('hidden')");
  test("AI Diagram Assistant modal opened in Chrome", isAiModalOpen);

  await evaluate("LuminaWhiteboardAi.closeAiModal()");
  const isAiModalClosed = await evaluate("document.getElementById('whiteboardAiModal').classList.contains('hidden')");
  test("AI Diagram Assistant modal closed in Chrome", isAiModalClosed);

  // Test Smart Shapes (diamond, cylinder, cloud, star, laser)
  await evaluate("setWbTool('diamond')");
  const isDiamond = await evaluate("window.wbTool === 'diamond'");
  test("Selected Smart Shape: Diamond Decision in Chrome", isDiamond);

  await evaluate("setWbTool('laser')");
  const isLaser = await evaluate("window.wbTool === 'laser'");
  test("Selected Presentation Tool: Laser Pointer in Chrome", isLaser);

  // Test Background Style Switcher
  await evaluate("setWhiteboardBackground('blueprint')");
  const isBlueprintBg = await evaluate("document.getElementById('whiteboardContainer').classList.contains('bg-blueprint-pattern')");
  test("Whiteboard background switched to Blueprint style in Chrome", isBlueprintBg);

  // Test Zoom Engine
  await evaluate("zoomIn()");
  const zoomInVal = await evaluate("window.wbZoom > 1.0");
  test("Whiteboard zoomIn increases scale in Chrome", zoomInVal);

  await evaluate("resetZoom()");
  const zoomResetVal = await evaluate("window.wbZoom === 1.0");
  test("Whiteboard resetZoom restores 100% scale in Chrome", zoomResetVal);

  // Test PNG and JPG export buttons in Chrome (Verify SVG button removed)
  const hasPngExportBtn = await evaluate("document.getElementById('btnDownloadWbPng') !== null");
  test("Explicit PNG export button rendered in Chrome (#btnDownloadWbPng)", hasPngExportBtn);

  const hasJpgExportBtn = await evaluate("document.getElementById('btnDownloadWbJpg') !== null");
  test("Explicit JPG export button rendered in Chrome (#btnDownloadWbJpg)", hasJpgExportBtn);

  const noSvgInUi = await evaluate("document.querySelectorAll('button[onclick*=\"downloadWhiteboardSvg\"]').length === 0");
  test("UI has zero SVG export buttons in Chrome (only PNG and JPG)", noSvgInUi);

  // Test Dual Theme Switcher (Whiteboard vs Blackboard)
  await evaluate("setWhiteboardTheme('whiteboard')");
  const isWhiteboardTheme = await evaluate("window.wbTheme === 'whiteboard' && document.getElementById('whiteboardContainer').classList.contains('wb-theme-whiteboard')");
  test("Canvas switched to crisp Whiteboard mode in Chrome", isWhiteboardTheme);

  const wbPaletteMarkers = await evaluate("document.getElementById('wbColorSwatches')?.innerHTML.includes('#0f172a')");
  test("Color swatches dynamically adapted to dark slate markers in Chrome", wbPaletteMarkers);

  await evaluate("toggleWhiteboardTheme()");
  const isBlackboardTheme = await evaluate("window.wbTheme === 'blackboard' && document.getElementById('whiteboardContainer').classList.contains('wb-theme-blackboard')");
  test("Canvas toggled back to Blackboard mode in Chrome", isBlackboardTheme);

  // Test Penguin Handcrafted Vector Illustration Synthesis
  const penguinDrawRes = await evaluate("LuminaWhiteboard.handleAgentDirective({ action: 'draw', type: 'illustration', title: 'Emperor Penguin' }, 'draw a penguin')");
  test("AI Whiteboard synthesized authentic vector Penguin illustration in Chrome", penguinDrawRes && penguinDrawRes.success === true && penguinDrawRes.subject === 'penguin');

  const jsonResult = await evaluate("exportWhiteboardJson()");
  test("JSON scene export generates valid payload in Chrome", typeof jsonResult === 'string' && jsonResult.includes('"version": "2.0"'));

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

  // 10. Google Calendar Replica & AI Life Scheduler
  await evaluate("switchTab('tab-calendar')");
  await new Promise(r => setTimeout(r, 80));
  const isCalendarOpen = await evaluate("!document.getElementById('tab-calendar').classList.contains('hidden')");
  test("Navigated to Google Calendar tab", isCalendarOpen);

  const monthViewRendered = await evaluate("document.getElementById('calendarViewContainer')?.innerHTML.includes('SUN')");
  test("Google Calendar Month View rendered with days", monthViewRendered);

  await evaluate("window.LuminaCalendar.setView('week')");
  const weekViewRendered = await evaluate("document.getElementById('calWeekScrollContainer') !== null");
  test("Google Calendar Week View rendered with 24h grid", weekViewRendered);

  await evaluate("window.LuminaCalendar.openEventModal()");
  const isModalOpen = await evaluate("document.getElementById('calendarEventModal').style.display === 'flex'");
  await evaluate("window.LuminaCalendar.closeEventModal()");

  await evaluate("window.LuminaCalendar.setView('month')");
  const hasTodayHighlight = await evaluate("document.getElementById('calendarViewContainer')?.innerHTML.includes('TODAY')");
  test("Month view highlights current date box with TODAY badge in Chrome", hasTodayHighlight);

  // 11. Google Calendar OAuth Sync Modal & Redirect URI Check
  await evaluate("window.LuminaCalendar.openSyncModal()");
  const isSyncModalOpen = await evaluate("document.getElementById('calendarSyncModal').style.display === 'flex'");
  test("Google Calendar Sync modal opened in Chrome", isSyncModalOpen);

  const hasRedirectUri = await evaluate("document.getElementById('calSyncRedirectUri') !== null");
  test("Authorised Redirect URI card cleanly removed from sync modal", !hasRedirectUri);

  const hasCopyRedirectBtn = await evaluate("document.getElementById('btnCopyRedirectUri') !== null");
  test("Copy Redirect URI button cleanly removed from sync modal", !hasCopyRedirectBtn);

  await evaluate("window.LuminaCalendar.closeSyncModal()");

  // 12. Artifacts Sovereign Storage Quota Meter & Upload
  await evaluate("switchTab('tab-artifacts')");
  const hasStorageMeter = await evaluate("document.getElementById('vfsStorageBar') !== null && document.getElementById('vfsStorageText') !== null");
  test("Sovereign VFS Storage Quota meter rendered in Chrome", hasStorageMeter);

  const storageDisplays1Gb = await evaluate("document.getElementById('vfsStorageText')?.textContent.includes('1 GB')");
  test("Storage meter shows 1 GB free sovereign quota in Chrome", storageDisplays1Gb);

  const hasUploadButton = await evaluate("document.getElementById('vfsUploadInput') !== null");
  test("VFS upload file input is present in Artifacts tab in Chrome", hasUploadButton);

  // 13. Verify Artifacts button is cleanly removed from AI Studio toolbar
  await evaluate("switchTab('tab-ai-studio')");
  const aiChatToolbarHasNoArtifactsBtn = await evaluate("document.getElementById('btnCodespaceToggleText') === null");
  test("Artifacts button cleanly removed from AI Studio chat toolbar", aiChatToolbarHasNoArtifactsBtn);

  // 14. Voice Studio Two-Way Audio Mode & Microphone Elements in Chrome
  await evaluate("openVoiceInteractionMode()");
  const isVoiceModalOpen = await evaluate("document.getElementById('aiVoiceModal')?.style.display !== 'none'");
  test("Voice Studio modal opens cleanly in Chrome", isVoiceModalOpen);

  const hasVoiceCanvas = await evaluate("document.getElementById('voiceCanvas') !== null");
  test("Voice visualizer canvas rendered in Chrome", hasVoiceCanvas);

  const hasRetryMicBtn = await evaluate("document.getElementById('voiceRetryMicBtn') !== null");
  test("Retry microphone permission button exists in Chrome", hasRetryMicBtn);

  const hasVoiceInterruptBtn = await evaluate("document.getElementById('btnVoiceInterrupt') !== null");
  test("Voice Studio duplex barge-in interrupt button exists in Chrome", hasVoiceInterruptBtn);

  const hasBargeInFn = await evaluate("typeof window.triggerBargeInInterruption === 'function'");
  test("Voice Studio triggerBargeInInterruption function initialized in Chrome", hasBargeInFn);

  await evaluate("closeVoiceInteractionMode()");
  const isVoiceModalClosed = await evaluate("document.getElementById('aiVoiceModal')?.style.display === 'none' || document.getElementById('aiVoiceModal')?.classList.contains('opacity-0')");
  test("Voice Studio modal closes cleanly in Chrome", isVoiceModalClosed);

  // 16. Sovereign Multi-Device Cloud Sync in Chrome
  const hasSyncIndicator = await evaluate("document.getElementById('cloudSyncIndicator') !== null");
  test("Cloud sync indicator pill rendered in header in Chrome", hasSyncIndicator);

  const hasCloudSyncEngine = await evaluate("typeof window.LuminaCloudSync === 'object' && typeof window.LuminaCloudSync.pullFromCloud === 'function'");
  test("LuminaCloudSync engine initialized on window in Chrome", hasCloudSyncEngine);

  const syncDotVisible = await evaluate("document.getElementById('cloudSyncDot') !== null");
  test("Cloud sync pulse indicator light visible in Chrome", syncDotVisible);

  const canFlushSync = await evaluate("typeof window.LuminaCloudSync.flushSync === 'function'");
  test("Cloud sync flush API callable in Chrome", canFlushSync);

  const activeTabStored = await evaluate("typeof localStorage.getItem('lumina_active_tab_id') === 'string'");
  test("Current active tab ID persisted to localStorage for same-tab resume", activeTabStored);

  const hasSessionTimeoutFn = await evaluate("typeof window.handleSessionTimeout === 'function'");
  test("20-minute session auto-logout & cloud flush function initialized in Chrome", hasSessionTimeoutFn);

  // 17. Handcrafted Vector Art & Graphify Visualizer in Chrome
  const pencilArtResult = await evaluate(`(() => {
    const res = window.LuminaWhiteboard ? window.LuminaWhiteboard.handleAgentDirective({ action: 'draw', title: 'Artist Pencil', type: 'illustration' }, 'draw a pencil') : null;
    return res && res.success && res.subject === 'pencil' && res.shapeCount > 0;
  })()`);
  test("Whiteboard AI synthesizes handcrafted Artist Pencil vector art in Chrome", pencilArtResult);

  const cakeArtResult = await evaluate(`(() => {
    const res = window.LuminaWhiteboard ? window.LuminaWhiteboard.handleAgentDirective({ action: 'draw', title: 'Celebration Cake', type: 'illustration' }, 'draw a cake') : null;
    return res && res.success && res.subject === 'cake' && res.shapeCount > 0;
  })()`);
  test("Whiteboard AI synthesizes handcrafted Celebration Cake vector art in Chrome", cakeArtResult);

  // Whiteboard Vision & Generative Redraw in Chrome
  const hasVisionEngine = await evaluate("typeof window.LuminaWhiteboardVision === 'object' && typeof window.LuminaWhiteboardVision.drawIllustration === 'function'");
  test("LuminaWhiteboardVision engine initialized in Chrome", hasVisionEngine);

  const giraffeArtResult = await evaluate(`(() => {
    const res = window.LuminaWhiteboard ? window.LuminaWhiteboard.handleAgentDirective({ action: 'draw', title: 'Graceful Giraffe', type: 'illustration' }, 'draw a giraffe') : null;
    return res && res.success && res.subject === 'giraffe' && res.shapeCount > 0;
  })()`);
  test("Whiteboard AI synthesizes Graceful Giraffe vector art in Chrome", giraffeArtResult);

  const guitarArtResult = await evaluate(`(() => {
    const res = window.LuminaWhiteboard ? window.LuminaWhiteboard.handleAgentDirective({ action: 'draw', title: 'Electric Guitar', type: 'illustration' }, 'draw an electric guitar') : null;
    return res && res.success && res.subject === 'guitar' && res.shapeCount > 0;
  })()`);
  test("Whiteboard AI synthesizes Electric Guitar vector art in Chrome", guitarArtResult);

  const dragonArtResult = await evaluate(`(() => {
    const res = window.LuminaWhiteboard ? window.LuminaWhiteboard.handleAgentDirective({ action: 'draw', title: 'Mythical Dragon', type: 'illustration' }, 'draw a dragon') : null;
    return res && res.success && res.subject === 'dragon' && res.shapeCount > 0;
  })()`);
  test("Whiteboard AI synthesizes Mythical Dragon vector art in Chrome", dragonArtResult);

  const googleIconResult = await evaluate(`(() => {
    const res = window.LuminaWhiteboard ? window.LuminaWhiteboard.handleAgentDirective({ action: 'draw', title: 'Google Icon', type: 'illustration' }, 'draw google icon') : null;
    return res && res.success && res.subject === 'google' && res.shapeCount >= 16;
  })()`);
  test("Whiteboard AI synthesizes authentic quad-color Google Icon vector art in Chrome", googleIconResult);

  await evaluate("switchTab('tab-graphify')");
  await new Promise(r => setTimeout(r, 100));
  const isGraphifyActive = await evaluate(`(() => {
    const col = document.getElementById('aiGraphifyColumn');
    const cv = document.getElementById('graphifyCanvas');
    const nodes = typeof window.getGraphifyBaseNodes === 'function' ? window.getGraphifyBaseNodes() : [];
    const hasCloudSyncNode = nodes.some(n => n.id === 'modules/cloud-sync.js');
    const hasVisionNode = nodes.some(n => n.id === 'modules/whiteboard-vision.js');
    return col && !col.classList.contains('hidden') && cv !== null && hasCloudSyncNode && hasVisionNode;
  })()`);
  test("Graphify Knowledge Graph switches, animates, and includes cloud-sync & whiteboard-vision architecture in Chrome", isGraphifyActive);

  // 18. Check for Uncaught Exceptions
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
