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
  'modules/ai-studio.js',
  'modules/codespace.js',
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
  assert(syncCode.includes("godx_session") && syncCode.includes("status(401)"), "api/sync.js enforces strict session authentication on state writes");

  const logoutCode = fs.readFileSync(path.join(rootDir, 'api/logout.js'), 'utf8');
  assert(logoutCode.includes("sameSite: 'strict'"), "api/logout.js uses hardened sameSite: strict cookie policy");

  const storageCode = fs.readFileSync(path.join(rootDir, 'api/storage.js'), 'utf8');
  assert(storageCode.includes("path.posix.normalize"), "api/storage.js uses strict path.posix.normalize sanitization against directory traversal");

  console.log(`\n=== TEST RESULTS: ${passed}/${total} ASSERTIONS PASSED ===\n`);
  if (passed === total) {
    console.log("🎉 ALL TESTS PASSED WITH ZERO ERRORS!");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!");
    process.exit(1);
  }
})();
