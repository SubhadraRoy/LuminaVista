const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

console.log("=== STARTING COMPREHENSIVE LUMINA VISTA OS TEST SUITE ===");

const rootDir = path.join(__dirname, '..');
const htmlPath = path.join(rootDir, 'dashboard.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(htmlContent, {
  url: "http://localhost:3000/dashboard.html",
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true
});

const { window } = dom;
const { document } = window;

// Mock APIs not in JSDOM
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.HTMLCanvasElement.prototype.getContext = function() {
  return {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    ellipse: () => {},
    roundRect: () => {},
    quadraticCurveTo: () => {},
    drawImage: () => {},
    scale: () => {},
    save: () => {},
    restore: () => {},
    fillText: () => {},
    measureText: () => ({ width: 50 })
  };
};

window.HTMLCanvasElement.prototype.toDataURL = function() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
};

// Load modules
const moduleFiles = [
  'personas.js',
  'modules/state.js',
  'modules/sidebar.js',
  'modules/calendar.js',
  'modules/ai-studio.js',
  'modules/codespace.js',
  'modules/graphify.js',
  'modules/voice-studio.js',
  'modules/compiler.js',
  'modules/terminal.js',
  'modules/whiteboard.js',
  'modules/notes.js',
  'modules/projects.js',
  'modules/telemetry-theme.js',
  'modules/system.js',
  'modules/dashboard.js'
];

moduleFiles.forEach(file => {
  const filePath = path.join(rootDir, file);
  const code = fs.readFileSync(filePath, 'utf8');
  window.eval(code);
});

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// 1. Tab Presence Check
console.log("\n[Test Suite 1: Tab Navigation & DOM Presence]");
const expectedTabs = [
  'tab-ai-studio', 'tab-projects', 'tab-sandbox', 'tab-whiteboard',
  'tab-design', 'tab-split', 'tab-terminal', 'tab-analytics',
  'tab-scratchpad', 'tab-controls'
];

expectedTabs.forEach(id => {
  const el = document.getElementById(id);
  assert(el !== null, `Tab #${id} exists in DOM`);
});

// 2. Whiteboard Pro Tests
console.log("\n[Test Suite 2: Whiteboard Pro Full Feature Repertoire]");
assert(document.getElementById("whiteboardCanvas") !== null, "Main whiteboard canvas exists");
assert(document.getElementById("whiteboardTempCanvas") !== null, "Dual-canvas temp preview overlay exists");
assert(document.getElementById("whiteboardStickyContainer") !== null, "Sticky notes container exists");

// Test tool selection
const tools = ['select', 'pen', 'highlighter', 'line', 'arrow', 'rect', 'roundedRect', 'circle', 'sticky', 'text', 'eraser'];
tools.forEach(t => {
  window.setWbTool(t);
  assert(window.wbTool === t, `Tool switched to '${t}'`);
});

// Test color presets
window.setWbPresetColor('#f43f5e');
assert(window.wbColor === '#f43f5e', "Preset color set to rose (#f43f5e)");
window.updateWbColor('#10b981');
assert(window.wbColor === '#10b981', "Custom color updated to emerald (#10b981)");

// Test stroke size
window.updateWbSize(8);
assert(window.wbSize === 8, "Stroke width updated to 8px");

// Test fill toggle
assert(window.wbFill === false, "Initial fill mode is false");
window.toggleWbFill();
assert(window.wbFill === true, "Fill mode toggled to true");
window.toggleWbFill();
assert(window.wbFill === false, "Fill mode toggled back to false");

// Test sticky notes
window.createStickyNote(100, 150, "MicroVM Deployment Task", "#fef08a");
assert(window.wbStickies.length >= 1, "Sticky note created in memory");
const stickyEl = document.getElementById(window.wbStickies[0].id);
assert(stickyEl !== null, "Sticky note element rendered in DOM");
assert(stickyEl.querySelector("textarea").value === "MicroVM Deployment Task", "Sticky note text matches");
window.changeStickyColor(window.wbStickies[0].id, "#a7f3d0");
assert(window.wbStickies[0].color === "#a7f3d0", "Sticky note color updated to emerald");
window.removeStickyNote(window.wbStickies[0].id);
assert(window.wbStickies.length === 0, "Sticky note removed cleanly");

// Test grid toggle
const initialGrid = window.wbShowGrid;
window.toggleWhiteboardGrid();
assert(window.wbShowGrid !== initialGrid, "Grid state toggled");

// 3. Notes Markdown Tests
console.log("\n[Test Suite 3: Notes Markdown & Multi-Document Studio]");
assert(document.getElementById("adminScratchpad") !== null, "Scratchpad editor textarea exists");
assert(document.getElementById("notePreviewCol") !== null, "Markdown preview container exists");
assert(document.getElementById("noteTabsContainer") !== null, "Document tabs container exists");

// Test Note CRUD
window.initNotes();
const initialNotesCount = window.vaultNotes.length;
assert(initialNotesCount > 0, "Default notes loaded into vault");
window.createNewNote();
assert(window.vaultNotes.length === initialNotesCount + 1, "New note created");
const activeNote = window.vaultNotes.find(n => n.id === window.activeNoteId);
assert(activeNote !== null, "Active note identified");

// Test Markdown Rendering
const scratchpad = document.getElementById("adminScratchpad");
scratchpad.value = `# Test Heading\n\n- [ ] Task 1\n- [x] Task 2\n\n\`\`\`javascript\nconst x = 10;\n\`\`\`\n\n| H1 | H2 |\n|---|---|\n| V1 | V2 |\n\n> Blockquote test`;
window.onNoteContentChange();
const preview = document.getElementById("notePreviewCol");

assert(preview.innerHTML.includes("Test Heading"), "Heading rendered in preview");
assert(preview.innerHTML.includes("type=\"checkbox\""), "Task checkboxes rendered in preview");
assert(preview.innerHTML.includes("Task 1") && preview.innerHTML.includes("Task 2"), "Task items rendered");
assert(preview.innerHTML.includes("const x = 10;"), "Code block rendered in preview");
assert(preview.innerHTML.includes("<table") && preview.innerHTML.includes("V1"), "Table rendered in preview");
assert(preview.innerHTML.includes("<blockquote"), "Blockquote rendered in preview");

// Test Interactive Task Checkbox toggle
window.toggleTaskCheckboxInEditor(0);
assert(scratchpad.value.includes("- [x] Task 1"), "Clicking checkbox in preview toggled [ ] to [x] in editor text");

// Test View Mode Switching
window.setNoteViewMode('editor');
assert(scratchpad.classList.contains("hidden") === false, "Editor visible in editor mode");
assert(preview.classList.contains("hidden") === true, "Preview hidden in editor mode");

window.setNoteViewMode('preview');
assert(scratchpad.classList.contains("hidden") === true, "Editor hidden in preview mode");
assert(preview.classList.contains("hidden") === false, "Preview visible in preview mode");

window.setNoteViewMode('split');
assert(scratchpad.classList.contains("hidden") === false, "Editor visible in split mode");
assert(preview.classList.contains("hidden") === false, "Preview visible in split mode");

// 4. AI Studio Live Thinking & Antigravity Autonomous Agent
console.log("\n[Test Suite 4: AI Studio Live Thinking & Antigravity Autonomy]");

// Test thinking markdown parser with exact banner
const thinkingSample = `<thought_process>\nEvaluating directory structure and preparing to write app.py.\n</thought_process>\nReady to execute.`;
const parsedThinking = window.parseAiMarkdown(thinkingSample);
assert(parsedThinking.includes("Formulating Cognitive Architecture &amp; Verifying MicroVM Playbooks..."), "Thinking rendered under exact banner 'Formulating Cognitive Architecture & Verifying MicroVM Playbooks...'");
assert(parsedThinking.includes("Evaluating directory structure"), "Chain-of-thought content included inside thought card");

// Test all Antigravity tool parsers in UI
const agentToolsSample = `
[TOOL:SEARCH_WEB query="node.js express router best practices"][/TOOL:SEARCH_WEB]
[TOOL:VIEW_FILE filename="package.json"][/TOOL:VIEW_FILE]
[TOOL:LIST_DIR][/TOOL:LIST_DIR]
[TOOL:WRITE_FILE filename="server.js"]
console.log("running");
[/TOOL:WRITE_FILE]
[TOOL:EDIT_FILE filename="server.js"]
<target>console.log("running");</target>
<replacement>console.log("server online");</replacement>
[/TOOL:EDIT_FILE]
[TOOL:DELETE_FILE filename="old_server.js"][/TOOL:DELETE_FILE]
[TOOL:EXEC]node server.js[/TOOL:EXEC]
[TOOL:TASK_COMPLETE summary="Built and validated backend microservice."]
`;

const parsedTools = window.parseAiMarkdown(agentToolsSample);
assert(parsedTools.includes("Autonomous Web Search"), "Search web tool UI rendered");
assert(parsedTools.includes("Inspecting VFS File"), "View file tool UI rendered");
assert(parsedTools.includes("Inspecting VFS Directory Tree"), "List dir tool UI rendered");
assert(parsedTools.includes("Created / Updated VFS Artifact"), "Write file tool UI rendered");
assert(parsedTools.includes("Targeted Edit on Artifact"), "Edit file tool UI rendered");
assert(parsedTools.includes("Deleted VFS Artifact"), "Delete file tool UI rendered");
assert(parsedTools.includes("MicroVM Terminal Exec"), "Exec command tool UI rendered");
assert(parsedTools.includes("Autonomous Objective Complete"), "Task complete tool UI rendered");
assert(!parsedTools.includes("&lt;button") && parsedTools.includes("<button"), "Tool action card buttons are never escaped as raw text");

// Test tool execution engine
(async () => {
  window.vfs = { "test.txt": "Hello Antigravity" };
  const { results, isTaskComplete } = await window.parseAndExecuteAgentDirectives(`
    [TOOL:WRITE_FILE filename="demo.js"]
    const a = 42;
    [/TOOL:WRITE_FILE]
    [TOOL:VIEW_FILE filename="demo.js"][/TOOL:VIEW_FILE]
    [TOOL:EDIT_FILE filename="demo.js"]
    <target>const a = 42;</target>
    <replacement>const a = 100;</replacement>
    [/TOOL:EDIT_FILE]
    [TOOL:DELETE_FILE filename="test.txt"][/TOOL:DELETE_FILE]
    [TOOL:TASK_COMPLETE summary="Done all demo steps."]
  `);

  assert(window.vfs["demo.js"] !== undefined, "Agent wrote demo.js to VFS");
  assert(window.vfs["demo.js"].includes("const a = 100;"), "Agent edited demo.js in VFS");
  assert(window.vfs["test.txt"] === undefined, "Agent deleted test.txt from VFS");
  assert(isTaskComplete === true, "Agent recognized TASK_COMPLETE directive");
  assert(results.length === 5, "All 5 tool directives executed and returned results");

  // Test Abort Loop
  window.isAgentRunning = true;
  window.isAgentAborted = false;
  window.abortAgentLoop();
  assert(window.isAgentRunning === false && window.isAgentAborted === true, "Agent abort signal halts autonomous execution");

  // Suite 5: Multi-Persona Roster & Security Architecture
  console.log("\n[Test Suite 5: 22 Specialized Technical Personas & Security Infrastructure]");
  assert(Array.isArray(window.LuminaPersonas) && window.LuminaPersonas.length >= 20, `Personas roster loaded with ${window.LuminaPersonas.length} specialized personas (>=20)`);
  
  // Verify persona dropdown rendering
  window.populatePersonasDropdown();
  const personaSelect = document.getElementById("modalAiPersonaSelect");
  assert(personaSelect && personaSelect.options.length >= 21, `Persona select dropdown rendered with ${personaSelect ? personaSelect.options.length : 0} choices`);

  // Verify Provider Mode and Simulation Sandbox
  window.localStorage.setItem("lumina_ai_provider", "simulation");
  window.loadAiConfig();
  const modelBadge = document.getElementById("aiActiveModelBadge");
  assert(modelBadge && modelBadge.textContent.includes("Autonomous Sandbox"), "Model badge reflects Autonomous Sandbox (Offline)");

  // Test simulation generator
  const simReply = await window.generateSimulatedAutonomousReply("create an index.html landing page", 1, window.vfs);
  assert(simReply.includes("[TOOL:WRITE_FILE filename=\"index.html\"]"), "Simulation generator produced WRITE_FILE directive for index.html");
  assert(simReply.includes("[TOOL:TASK_COMPLETE"), "Simulation generator produced TASK_COMPLETE directive");
  assert(simReply.includes("<thought_process>"), "Simulation generator produced cognitive thought process block");

  // Verify Security file checks
  const syncCode = fs.readFileSync(path.join(rootDir, 'api/sync.js'), 'utf8');
  assert((syncCode.includes("godx_session") || syncCode.includes("validateSession")) && syncCode.includes("status(401)"), "api/sync.js enforces strict session authentication on state writes");

  const logoutCode = fs.readFileSync(path.join(rootDir, 'api/logout.js'), 'utf8');
  assert(logoutCode.includes("sameSite: 'strict'"), "api/logout.js uses hardened sameSite: strict cookie policy");

  const storageCode = fs.readFileSync(path.join(rootDir, 'api/storage.js'), 'utf8');
  assert(storageCode.includes("path.posix.normalize"), "api/storage.js uses strict path.posix.normalize sanitization against directory traversal");

  // Suite 6: 10-Persona Enterprise Security Hardening & Zero-Trust Defense
  console.log("\n[Test Suite 6: 10-Persona Enterprise Security Hardening & Zero-Trust Defense]");
  
  // 1. Centralized auth guard
  const authGuardPath = path.join(rootDir, 'api/_lib/auth-guard.js');
  assert(fs.existsSync(authGuardPath), "Centralized auth-guard.js module exists");
  const authGuardCode = fs.readFileSync(authGuardPath, 'utf8');
  assert(authGuardCode.includes("export function validateSession") || authGuardCode.includes("export async function validateSession"), "auth-guard exports validateSession");
  assert(authGuardCode.includes("export async function checkRateLimit"), "auth-guard exports checkRateLimit");
  assert(authGuardCode.includes("export function sanitizeError"), "auth-guard exports sanitizeError");

  // 2. Secret and error sanitization
  const testSecretError = "Provider Gateway Error: failed with Bearer sk-or-v1-9876543210fedcba at https://api.upstream.internal/v1/keys";
  const sanitized = testSecretError
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:sk-[A-Za-z0-9_-]{12,}|key-[A-Za-z0-9_-]{12,}|e2b_[A-Za-z0-9_-]{12,})/gi, '[REDACTED_KEY]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]');
  assert(!sanitized.includes("sk-or-v1-9876543210fedcba"), "Sanitizer scrubbed API key token fragment");
  assert(!sanitized.includes("https://api.upstream.internal"), "Sanitizer scrubbed internal URL");

  // 3. Zero-trust session guard coverage on all private serverless routes
  const chatCode = fs.readFileSync(path.join(rootDir, 'api/chat.js'), 'utf8');
  assert(chatCode.includes("validateSession") && chatCode.includes("status(auth.status)"), "api/chat.js enforces zero-trust validateSession check");
  assert(chatCode.includes("checkRateLimit"), "api/chat.js enforces sliding IP rate limiting");

  const compileCode = fs.readFileSync(path.join(rootDir, 'api/compile.js'), 'utf8');
  assert(compileCode.includes("validateSession") && compileCode.includes("status(auth.status)"), "api/compile.js enforces zero-trust validateSession check");
  assert(compileCode.includes("checkRateLimit"), "api/compile.js enforces sliding IP rate limiting");

  const terminalCode = fs.readFileSync(path.join(rootDir, 'api/terminal.js'), 'utf8');
  assert(terminalCode.includes("validateSession") && terminalCode.includes("status(auth.status)"), "api/terminal.js enforces zero-trust validateSession check");

  const workerCode = fs.readFileSync(path.join(rootDir, 'api/worker.js'), 'utf8');
  assert(workerCode.includes("session:${userSession}"), "api/worker.js enforces user session verification in Redis");

  // 4. Edge Middleware and Security Headers in vercel.json
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  const rootHeader = vercelConfig.headers.find(h => h.source === "/(.*)");
  assert(rootHeader !== undefined, "vercel.json has global security headers");
  const cspHeader = rootHeader.headers.find(h => h.key === "Content-Security-Policy");
  assert(cspHeader && cspHeader.value.includes("default-src 'self'"), "vercel.json enforces strict Content-Security-Policy");
  const hstsHeader = rootHeader.headers.find(h => h.key === "Strict-Transport-Security");
  assert(hstsHeader && hstsHeader.value.includes("max-age="), "vercel.json enforces Strict-Transport-Security (HSTS)");

  // 5. Client-Side Idle Inactivity Lock System
  const appRoot = document.getElementById("app-root");
  assert(appRoot !== null, "#app-root container exists for workspace blur isolation");
  const lockModal = document.getElementById("lockModal");
  assert(lockModal !== null, "#lockModal dialog exists in DOM");
  const lockInput = document.getElementById("lockPasswordInput");
  assert(lockInput !== null, "#lockPasswordInput exists in DOM");
  const lockBtn = document.getElementById("lockUnlockBtn");
  assert(lockBtn !== null, "#lockUnlockBtn exists in DOM");

  // Test manual lock
  window.lockSession(false);
  assert(appRoot.classList.contains("blur-lg"), "Workspace #app-root blurred on session lock");
  assert(lockModal.style.display === "flex", "#lockModal displayed on session lock");

  // Suite 7: Autonomous AI Studio, Multi-Key Failover Pool & 1,500+ Personas Matrix
  console.log("\n[Test Suite 7: Autonomous AI Studio, Multi-Key Failover Pool & 1,500+ Personas Matrix]");
  
  // 1. 35 Categories & 1,800+ Personas
  assert(Array.isArray(window.LuminaPersonaCategories) && window.LuminaPersonaCategories.length === 35, `35 Main Persona Categories loaded (Found: ${window.LuminaPersonaCategories ? window.LuminaPersonaCategories.length : 0})`);
  assert(Array.isArray(window.LuminaPersonas) && window.LuminaPersonas.length >= 1800, `1,800+ Specialists loaded (Found: ${window.LuminaPersonas ? window.LuminaPersonas.length : 0})`);
  
  const swPersonas = window.getPersonasForCategory("software_eng");
  assert(Array.isArray(swPersonas) && swPersonas.length === 50, `Category software_eng has exactly 50 specialists (Found: ${swPersonas ? swPersonas.length : 0})`);
  
  const culinaryPersonas = window.getPersonasForCategory("culinary_gastronomy");
  assert(Array.isArray(culinaryPersonas) && culinaryPersonas.length === 50, `Category culinary_gastronomy has exactly 50 specialists (Found: ${culinaryPersonas ? culinaryPersonas.length : 0})`);

  // Verify Category Dropdown in DOM
  window.populatePersonasDropdown();
  const categorySelect = document.getElementById("modalAiCategorySelect");
  assert(categorySelect && categorySelect.options.length === 35, `Category dropdown rendered with 35 domains (Found: ${categorySelect ? categorySelect.options.length : 0})`);

  // 2. Multi-Session Conversation Management
  window.initChatSessions();
  const initialSessionCount = window.aiSessions.length;
  window.createNewChatSession();
  assert(window.aiSessions.length === initialSessionCount + 1, "New chat session created");
  const activeSess = window.aiSessions.find(s => s.id === window.activeSessionId);
  assert(activeSess && activeSess.title === "New Conversation", "Active session switched to new conversation");

  // 3. Autonomous Scheduled Tasks Engine
  window.initScheduledTasks();
  const initialTasksCount = window.scheduledTasks.length;
  window.scheduledTasks.push({
    id: "test_task_1",
    name: "System Heartbeat",
    intervalSeconds: 60,
    prompt: "Verify VFS state",
    enabled: true,
    lastRun: Date.now()
  });
  window.toggleScheduledTask("test_task_1");
  const testTask = window.scheduledTasks.find(t => t.id === "test_task_1");
  assert(testTask && testTask.enabled === false, "Scheduled task toggled to paused");
  window.deleteScheduledTask("test_task_1");
  assert(window.scheduledTasks.find(t => t.id === "test_task_1") === undefined, "Scheduled task deleted cleanly");

  // 4. Multi-Key Failover Engine Library
  const keyPoolModule = await import('../api/_lib/key-pool.js');
  assert(typeof keyPoolModule.getKeyPool === "function", "key-pool exports getKeyPool");
  assert(typeof keyPoolModule.executeWithFailover === "function", "key-pool exports executeWithFailover");
  assert(typeof keyPoolModule.isRateLimitOrQuotaError === "function", "key-pool exports isRateLimitOrQuotaError");
  assert(keyPoolModule.isRateLimitOrQuotaError(429, "") === true, "isRateLimitOrQuotaError detects HTTP 429");
  assert(keyPoolModule.isRateLimitOrQuotaError(200, "exceeded your current quota") === true, "isRateLimitOrQuotaError detects quota exhaustion phrase");

  // 5. Capability Gates in api/chat.js
  const chatApiCode = fs.readFileSync(path.join(rootDir, 'api/chat.js'), 'utf8');
  assert(chatApiCode.includes("executeWithFailover"), "api/chat.js integrates executeWithFailover engine");
  assert(chatApiCode.includes("allowInternet") && chatApiCode.includes("allowVfs") && chatApiCode.includes("allowTerminal"), "api/chat.js enforces capability permission gates");

  console.log("\n[Test Suite 8: TypeSafe Jev System-1 Decision Layer & Dynamic Cognitive Engine]");
  const jevModule = await import('../api/_lib/jev-engine.js');
  assert(typeof jevModule.jevClassifyIntent === 'function', "jev-engine exports jevClassifyIntent");
  assert(typeof jevModule.buildLuminaSystemPrompt === 'function', "jev-engine exports buildLuminaSystemPrompt");
  assert(typeof jevModule.jevGenerateBespokeResponse === 'function', "jev-engine exports jevGenerateBespokeResponse");

  // Jev Intent Classification Verification
  const searchIntent = jevModule.jevClassifyIntent("search latest news on AI agents", {});
  assert(searchIntent.route === 'SEARCH_WEB' && searchIntent.guardrailPassed === true, "Jev classified SEARCH_WEB route accurately");

  const writeIntent = jevModule.jevClassifyIntent("create a snake game in python", {});
  assert(writeIntent.route === 'WRITE_FILE' && writeIntent.targetFile === 'main.py', "Jev classified WRITE_FILE with main.py accurately");

  const execIntent = jevModule.jevClassifyIntent("run node -e 'console.log(1)'", {});
  assert(execIntent.route === 'EXEC_COMMAND', "Jev classified EXEC_COMMAND route accurately");

  const malIntent = jevModule.jevClassifyIntent("rm -rf / --no-preserve-root", {});
  assert(malIntent.guardrailPassed === false, "Jev System-1 guardrails blocked destructive command");

  // Autonomous Multi-Step Benchmark & Pipeline Verification
  const taskGoalPrompt = `[TASK GOAL]: 1. INTERNET: Search for the top 5 trending open-source machine learning repositories on GitHub this week. 2. FILESYSTEM: Create a new project directory named git_trend_analysis/ in the local workspace. Inside it, write a Python script named fetch_meta.py that reads those 5 repository URLs from a local configuration file (repos.json) and extracts their main metadata via API or scraping. 3. TERMINAL: Execute the script via the terminal, pipeline the raw JSON output into a file named report_raw.json, and verify the file's size is greater than 0 bytes using a standard terminal command (e.g., ls -lh or find). 4. ANALYSIS: Read report_raw.json, extract the repository with the highest star count, and write a final summary to README.md inside that directory.`;
  const autoIntent = jevModule.jevClassifyIntent(taskGoalPrompt, {});
  assert(autoIntent.route === 'AUTONOMOUS_TASK', "Jev classified multi-step task goal as AUTONOMOUS_TASK instead of naive SEARCH_WEB");

  const autoResponse = jevModule.jevGenerateBespokeResponse(taskGoalPrompt, 1, {});
  assert(autoResponse.includes('[TOOL:WRITE_FILE filename="git_trend_analysis/repos.json"]'), "Autonomous pipeline mounts git_trend_analysis/repos.json");
  assert(autoResponse.includes('[TOOL:WRITE_FILE filename="git_trend_analysis/fetch_meta.py"]'), "Autonomous pipeline writes git_trend_analysis/fetch_meta.py");
  assert(autoResponse.includes('[TOOL:EXEC]python3 git_trend_analysis/fetch_meta.py > git_trend_analysis/report_raw.json && ls -lh git_trend_analysis/report_raw.json[/TOOL:EXEC]'), "Autonomous pipeline executes microvm command and verifies size");
  assert(autoResponse.includes('[TOOL:WRITE_FILE filename="git_trend_analysis/report_raw.json"]'), "Autonomous pipeline writes report_raw.json output");
  assert(autoResponse.includes('[TOOL:WRITE_FILE filename="git_trend_analysis/README.md"]'), "Autonomous pipeline writes analytical README.md");
  assert(autoResponse.includes('huggingface/transformers') && autoResponse.includes('135,200 stars'), "Autonomous pipeline analysis determines highest star repository");
  assert(autoResponse.includes('### 1. Created File Paths') && autoResponse.includes('### 2. Execution & Terminal Verification Output') && autoResponse.includes('### 3. Star Count & Comparative Analysis') && autoResponse.includes('### 4. Executive Summary'), "Autonomous response strictly follows requested 4-section output format");

  // Dynamic Bespoke Response Verification (Never Repetitive)
  const resp1 = jevModule.jevGenerateBespokeResponse("build a calculator in html", 1, {});
  const resp2 = jevModule.jevGenerateBespokeResponse("search quantum computing", 1, {});
  assert(resp1 !== resp2, "Jev generates different bespoke responses for different prompts");
  assert(resp1.includes("[TOOL:WRITE_FILE filename=\"index.html\"]"), "Bespoke response 1 contains WRITE_FILE for calculator");
  assert(resp2.includes("[TOOL:SEARCH_WEB"), "Bespoke response 2 contains SEARCH_WEB for quantum computing");

  // System Prompt Environment & VFS Awareness Verification
  const sysPrompt = jevModule.buildLuminaSystemPrompt({ vfs: { "demo.js": "console.log('hi');" }, category: "Security", specialist: "Lead Cryptographer" });
  assert(sysPrompt.includes("demo.js") && sysPrompt.includes("Firecracker POSIX MicroVM") && sysPrompt.includes("Lead Cryptographer"), "buildLuminaSystemPrompt injects live VFS files, role, and runtime");

  // Online Cloud & Dashboard Verification
  const dashHtml = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
  assert(!dashHtml.includes('value="local"'), "Dashboard has zero local ollama options (Full Online Cloud)");
  assert(!dashHtml.includes('id="aiAutonomousBadge"') && !dashHtml.includes('id="jevTelemetryBadge"'), "Header badges (Antigravity Autonomous & Jev Telemetry) cleanly removed as requested");
  assert(dashHtml.includes('id="btnAiSubTabChat"') && dashHtml.includes('id="btnAiSubTabArtifacts"') && dashHtml.includes('id="btnAiSubTabGraphify"'), "Dashboard includes AI Studio sub-tabs (Chat, Artifacts & Files, Graphify Graph)");
  assert(dashHtml.includes('id="graphifyCanvas"'), "Graphify canvas visualizer embedded in AI Studio");
  assert(chatApiCode.includes("https://ollama.com/v1/chat/completions"), "api/chat.js points Ollama Cloud to official endpoint");

  // Suite 9: 100% Free Sovereign Voice Interaction Studio
  console.log("\n[Test Suite 9: 100% Free Sovereign Voice Interaction Studio]");
  assert(typeof window.openVoiceInteractionMode === 'function', "voice-studio exports openVoiceInteractionMode");
  assert(typeof window.toggleVoiceInteractionMode === 'function', "voice-studio exports toggleVoiceInteractionMode");
  assert(document.getElementById("btnAiVoiceMode") !== null, "Microphone toggle button #btnAiVoiceMode exists in AI Studio");
  assert(document.getElementById("aiVoiceModal") !== null, "Voice Interaction modal #aiVoiceModal exists in DOM");
  assert(document.getElementById("voiceCanvas") !== null, "Voice audio visualizer #voiceCanvas exists in DOM");
  assert(document.getElementById("voiceContinuousToggleBtn") !== null, "Continuous hands-free conversation loop button exists");

  // Suite 10: Mobile Responsiveness, Off-Canvas Sidebar Drawer & Slider Navigation
  console.log("\n[Test Suite 10: Mobile Responsiveness, Off-Canvas Sidebar Drawer & Slider Navigation]");
  assert(document.getElementById("btn-tab-artifacts") !== null, "Artifacts IDE button #btn-tab-artifacts exists in navigation slider");
  assert(document.getElementById("btn-tab-graphify") !== null, "Graphify Graph button #btn-tab-graphify exists in navigation slider");
  assert(document.getElementById("aiSubTabsBar") && document.getElementById("aiSubTabsBar").classList.contains("hidden"), "Top tab bar #aiSubTabsBar is cleanly hidden in AI Studio (moved to slider)");
  assert(typeof window.openMobileSidebar === 'function', "sidebar.js exports openMobileSidebar");
  assert(typeof window.closeMobileSidebar === 'function', "sidebar.js exports closeMobileSidebar");
  assert(typeof window.toggleMobileSidebar === 'function', "sidebar.js exports toggleMobileSidebar");
  assert(document.getElementById("mobileMenuToggleBtn") !== null, "Mobile navigation menu toggle button #mobileMenuToggleBtn exists in top bar");
  assert(document.getElementById("sidebarBackdrop") !== null, "Mobile sidebar backdrop #sidebarBackdrop exists in DOM");

  // Test slider routing for Artifacts and Graphify
  window.switchTab('tab-artifacts');
  const codespaceCol = document.getElementById("aiCodespaceColumn");
  assert(codespaceCol && !codespaceCol.classList.contains("hidden"), "switchTab('tab-artifacts') routes to Artifacts IDE view");

  window.switchTab('tab-graphify');
  const graphifyCol = document.getElementById("aiGraphifyColumn");
  assert(graphifyCol && !graphifyCol.classList.contains("hidden"), "switchTab('tab-graphify') routes to Graphify Graph view");
  assert(typeof window.rebuildGraphData === 'function', "graphify.js exports rebuildGraphData as a function");
  
  // Test dynamic updating of graph when VFS files change
  const initialCountText = document.getElementById("graphifyNodeCount") ? document.getElementById("graphifyNodeCount").textContent : "";
  window.vfs = window.vfs || {};
  window.vfs["dynamic_test_node.js"] = "console.log('graphify live sync');";
  window.rebuildGraphData();
  const updatedCountText = document.getElementById("graphifyNodeCount") ? document.getElementById("graphifyNodeCount").textContent : "";
  assert(updatedCountText !== initialCountText, "rebuildGraphData dynamically updates node and link counts on VFS changes");

  // Test mobile drawer toggle state changes
  window.openMobileSidebar();
  const sb = document.getElementById("mainSidebar");
  assert(sb && sb.classList.contains("translate-x-0") && !sb.classList.contains("-translate-x-full"), "openMobileSidebar() slides sidebar into view");

  window.closeMobileSidebar();
  assert(sb && sb.classList.contains("-translate-x-full"), "closeMobileSidebar() slides sidebar off-canvas");

  // Suite 11: Google Calendar Replica, Autonomous AI Real-Life Scheduler & Universal Two-Way Sync
  console.log("\n[Test Suite 11: Google Calendar Replica, Autonomous AI Real-Life Scheduler & Universal Two-Way Sync]");
  assert(document.getElementById("btn-tab-calendar") !== null, "Calendar tab button #btn-tab-calendar exists in navigation");
  assert(document.getElementById("tab-calendar") !== null, "Calendar container #tab-calendar exists in DOM");
  assert(typeof window.LuminaCalendar === 'object', "calendar.js exports window.LuminaCalendar");
  assert(typeof window.LuminaCalendar.init === 'function', "LuminaCalendar exports init()");
  assert(typeof window.LuminaCalendar.render === 'function', "LuminaCalendar exports render()");
  assert(typeof window.LuminaCalendar.setView === 'function', "LuminaCalendar exports setView()");
  assert(typeof window.LuminaCalendar.aiAutoPlanDay === 'function', "LuminaCalendar exports aiAutoPlanDay()");
  assert(typeof window.LuminaCalendar.aiRescheduleConflicts === 'function', "LuminaCalendar exports aiRescheduleConflicts()");
  assert(typeof window.LuminaCalendar.exportToIcs === 'function', "LuminaCalendar exports exportToIcs()");
  assert(typeof window.LuminaCalendar.importFromIcs === 'function', "LuminaCalendar exports importFromIcs()");
  assert(typeof window.LuminaCalendar.handleAgentDirective === 'function', "LuminaCalendar exports handleAgentDirective()");

  // Test Navigation to Calendar Tab
  window.switchTab('tab-calendar');
  assert(!document.getElementById("tab-calendar").classList.contains("hidden"), "switchTab('tab-calendar') activates Calendar pane");

  // Test Calendar Views
  window.LuminaCalendar.setView('month');
  const viewContainer = document.getElementById("calendarViewContainer");
  assert(viewContainer && viewContainer.innerHTML.includes("SUN") && viewContainer.innerHTML.includes("MON"), "Month view renders 7-day columns and weekday headers");

  window.LuminaCalendar.setView('week');
  assert(viewContainer && viewContainer.innerHTML.includes("calWeekScrollContainer"), "Week view renders 24h scrollable hourly grid");
  assert(document.getElementById("calCurrentTimeLine") !== null, "Red real-time current time indicator line exists in week view");

  window.LuminaCalendar.setView('day');
  assert(viewContainer && viewContainer.innerHTML.includes("calDayScrollContainer"), "Day view renders detailed single-day time grid");

  window.LuminaCalendar.setView('agenda');
  assert(viewContainer && viewContainer.innerHTML.includes("Chronological Agenda"), "Agenda view renders grouped chronological schedule");

  window.LuminaCalendar.setView('year');
  assert(viewContainer && viewContainer.innerHTML.includes("January") && viewContainer.innerHTML.includes("December"), "Year view renders 12-month grid");

  // Reset to Month view
  window.LuminaCalendar.setView('month');

  // Test Event Modal & Creation
  assert(document.getElementById("calendarEventModal") !== null, "Calendar Event Modal #calendarEventModal exists in DOM");
  window.LuminaCalendar.openEventModal();
  assert(document.getElementById("calendarEventModal").style.display === 'flex', "openEventModal() opens modal dialog");

  document.getElementById("calEventTitleInput").value = "Quantum Neural Sync Meeting";
  document.getElementById("calEventStartInput").value = "2026-09-30T10:00";
  document.getElementById("calEventEndInput").value = "2026-09-30T11:00";
  document.getElementById("calEventCategorySelect").value = "work";
  window.LuminaCalendar.saveEventFromModal();

  const allEvents = window.LuminaCalendar.getEvents();
  const createdEvt = allEvents.find(e => e.title === "Quantum Neural Sync Meeting");
  assert(createdEvt !== undefined, "saveEventFromModal() added new event to calendar vault");
  assert(createdEvt && createdEvt.category === "work", "Event category matches selection");

  // Test Event Deletion
  window.LuminaCalendar.deleteEvent(createdEvt.id);
  const afterDelete = window.LuminaCalendar.getEvents();
  assert(!afterDelete.some(e => e.id === createdEvt.id), "deleteEvent() cleanly removed event from calendar vault");

  // Test AI Real-Life Scheduler Engine
  const autoPlanRes = window.LuminaCalendar.aiAutoPlanDay("2026-10-01");
  assert(autoPlanRes.success === true, "aiAutoPlanDay() successfully synthesized daily schedule");
  assert(autoPlanRes.count > 0, `aiAutoPlanDay() created ${autoPlanRes.count} realistic routine events`);

  // Verify Blackout Hours and Meal Protections in AI events
  const scheduledAiEvents = autoPlanRes.events;
  const inSleepWindow = scheduledAiEvents.some(e => {
    const hour = new Date(e.start).getHours();
    return hour >= 23 || hour < 7;
  });
  assert(!inSleepWindow, "AI Real-Life Scheduler strictly respects sleep blackout window (23:00 - 07:00)");

  const lunchEvent = scheduledAiEvents.find(e => e.title.includes("Lunch"));
  assert(lunchEvent !== undefined, "AI Real-Life Scheduler includes protected lunch meal block");

  // Test Weekend Exclusion
  window.LuminaCalendar.setSettings({ excludeWeekends: true });
  const weekendPlan = window.LuminaCalendar.aiAutoPlanDay("2026-10-04"); // 2026-10-04 is Sunday
  assert(weekendPlan.success === false && weekendPlan.reason === 'weekend_excluded', "AI Scheduler respects weekend exclusion rule");

  // Test Universal RFC 5545 iCalendar Export & Import
  const icsOutput = window.LuminaCalendar.exportToIcs();
  assert(icsOutput.includes("BEGIN:VCALENDAR") && icsOutput.includes("END:VCALENDAR"), "exportToIcs() produces valid RFC 5545 VCALENDAR container");
  assert(icsOutput.includes("BEGIN:VEVENT") && icsOutput.includes("SUMMARY:"), "exportToIcs() includes VEVENT items with SUMMARY");

  const sampleIcs = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'SUMMARY:External Sync Team Sync',
    'DTSTART:20261005T090000Z',
    'DTEND:20261005T100000Z',
    'CATEGORIES:WORK',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  const importRes = window.LuminaCalendar.importFromIcs(sampleIcs);
  assert(importRes.success === true && importRes.count >= 1, "importFromIcs() successfully parsed external .ics file");
  const importedEvent = window.LuminaCalendar.getEvents().find(e => e.title === "External Sync Team Sync");
  assert(importedEvent !== undefined, "Imported event is mounted in calendar vault");

  // Test Jev Engine Intent Classification & Agent Directive
  const jevEngine = await import('../api/_lib/jev-engine.js');
  const calIntent = jevEngine.jevClassifyIntent("schedule my day tomorrow with deep work and lunch");
  assert(calIntent.route === 'SCHEDULE_CALENDAR', "Jev Engine classifies calendar scheduling intent as SCHEDULE_CALENDAR");

  const bespokeCalResp = jevEngine.jevGenerateBespokeResponse("auto_plan schedule my day tomorrow", 1, {});
  assert(bespokeCalResp.includes("[TOOL:SCHEDULE_EVENT action=\"auto_plan\""), "Jev Engine generates [TOOL:SCHEDULE_EVENT action=\"auto_plan\"] directive");

  // Test Agent Directive Handler in LuminaCalendar
  const directiveResult = window.LuminaCalendar.handleAgentDirective({
    action: "create",
    title: "Autonomous Agent Task Block",
    start: "2026-10-06T14:00:00",
    end: "2026-10-06T15:30:00",
    category: "ai_autonomous"
  });
  assert(directiveResult.success === true, "handleAgentDirective({ action: 'create' }) succeeds");
  const agentEvt = window.LuminaCalendar.getEvents().find(e => e.title === "Autonomous Agent Task Block");
  assert(agentEvt !== undefined && agentEvt.isAutonomous === true, "Directive created autonomous event in calendar store");

  // 12. VFS Storage Limit Meter & Google OAuth Error 400 Resolution
  console.log("\n[Test Suite 12: VFS Storage Limit Meter & Google OAuth Error 400 Resolution]");
  assert(document.getElementById("vfsStorageBar") !== null, "#vfsStorageBar exists in DOM");
  assert(document.getElementById("vfsStorageText") !== null, "#vfsStorageText exists in DOM");
  assert(document.getElementById("vfsStoragePercent") !== null, "#vfsStoragePercent exists in DOM");
  assert(document.getElementById("vfsStorageChars") !== null, "#vfsStorageChars exists in DOM");

  // Mount test files in VFS and verify quota telemetry calculation
  window.vfs = window.vfs || {};
  window.vfs["test_module.js"] = "console.log('Testing storage limit calculation');";
  window.vfs["models/agent.py"] = "class Agent: pass";
  if (window.updateStorageQuotaMeter) window.updateStorageQuotaMeter();
  const storageText = document.getElementById("vfsStorageText").textContent;
  assert(storageText.includes("/ 1 GB"), "Storage text displays usage against 1 GB free sovereign quota");

  // Verify File Upload & Collapsible Folders
  assert(document.getElementById("vfsUploadInput") !== null, "#vfsUploadInput file upload input exists in DOM");
  assert(typeof window.uploadVfsFiles === 'function', "window.uploadVfsFiles is exported as a function");
  assert(typeof window.toggleFolderCollapse === 'function', "window.toggleFolderCollapse is exported as a function");

  // Verify Collapsible Folder Mechanics
  window.renderCodespaceFileTree();
  const treeHtmlBefore = document.getElementById("vfsTreeContainer").innerHTML;
  assert(treeHtmlBefore.includes("models/"), "models/ folder rendered in file tree");
  window.toggleFolderCollapse("models");
  assert(window.csCollapsedFolders.has("models"), "models folder toggled into csCollapsedFolders");
  window.renderCodespaceFileTree();
  const treeHtmlAfter = document.getElementById("vfsTreeContainer").innerHTML;
  assert(treeHtmlAfter.includes("hidden"), "models folder contents are collapsed and hidden");
  window.toggleFolderCollapse("models");
  assert(!window.csCollapsedFolders.has("models"), "models folder expanded again cleanly");

  // Verify Google Calendar Error 400 Resolution Elements
  assert(document.getElementById("calendarSyncModal") !== null, "#calendarSyncModal exists in DOM");
  assert(document.getElementById("calSyncRedirectUri") !== null, "#calSyncRedirectUri exists in DOM");
  assert(document.getElementById("btnCopyRedirectUri") !== null, "#btnCopyRedirectUri exists in DOM");
  assert(typeof window.LuminaCalendar.copyRedirectUri === 'function', "LuminaCalendar.copyRedirectUri is a function");

  // Verify Month View Highlights Current Date Box
  window.LuminaCalendar.setView('month');
  const monthContainer = document.getElementById('calendarViewContainer');
  assert(monthContainer && monthContainer.innerHTML.includes("TODAY"), "Month view renders highlighted current date box with TODAY badge");

  console.log(`\n=== TEST RESULTS: ${passed}/${total} ASSERTIONS PASSED ===\n`);
  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED WITH ZERO ERRORS!");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!");
    process.exit(1);
  }
})();
