// tests/suite-overview-dashboard.cjs
// Verification suite for LuminaVista OS Executive Mission Control Dashboard

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

console.log('\n=================================================================');
console.log('   LUMINAVISTA OS: EXECUTIVE MISSION CONTROL DASHBOARD SUITE     ');
console.log('=================================================================\n');

// 1. Static markup verification in dashboard.html
console.log('[SECTION 1: Static Layout & Navigation Integrity]');
const htmlPath = path.join(__dirname, '..', 'dashboard.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert(htmlContent.includes('id="btn-tab-overview"'), '#btn-tab-overview button mounted in sidebar navigation');
assert(htmlContent.includes('id="tab-overview"'), '#tab-overview section mounted in dashboard main viewport');
assert(htmlContent.includes('modules/overview.js'), 'modules/overview.js script tag included in dashboard.html');
assert(htmlContent.indexOf('id="btn-tab-overview"') < htmlContent.indexOf('id="btn-tab-ai-studio"'), '#btn-tab-overview placed first in navigation hierarchy');

// 2. Line count budget enforcement (< 2,000 lines)
console.log('\n[SECTION 2: Strict Modularity & Line-Count Budget]');
const filesToCheck = [
  'dashboard.html',
  'modules/overview.js',
  'modules/dashboard.js',
  'modules/system.js'
];

filesToCheck.forEach(f => {
  const fp = path.join(__dirname, '..', f);
  const lines = fs.readFileSync(fp, 'utf8').split('\n').length;
  assert(lines < 2000, `${f} is strictly < 2,000 lines (${lines} lines)`);
});

// 3. Functional Evaluation & Mock DOM Mounting
console.log('\n[SECTION 3: Controller Functionality & Telemetry Engine]');
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="tab-overview"></div>
  <button id="btn-tab-overview"></button>
</body></html>`, { url: 'https://lumina-vista-sigma.vercel.app/dashboard.html' });

const { window } = dom;
global.window = window;
global.document = window.document;
global.sessionStorage = window.sessionStorage;
global.localStorage = window.localStorage;

// Mock subsystem state
window.vfs = {
  'index.html': '<html><body>Hello Lumina</body></html>',
  'main.py': 'print("Hello Python")',
  'config.json': '{"theme":"cyan"}'
};
window.csActiveFile = 'main.py';

window.luminaEvents = [
  { id: '1', title: 'Systems Architecture Sync', start: new Date().toISOString().slice(0, 10) + 'T10:00:00', end: new Date().toISOString().slice(0, 10) + 'T11:00:00', category: 'work' },
  { id: '2', title: 'Future Milestone Review', start: '2026-11-01T15:00:00', end: '2026-11-01T16:00:00', category: 'focus' }
];

localStorage.setItem('lumina_ai_model', 'llama-3.3-70b-versatile');
localStorage.setItem('lumina_ai_provider', 'hybrid_pool');
localStorage.setItem('lumina_adblock_shadow', JSON.stringify({
  totalQueries: 45200,
  totalBlocked: 11400,
  blockPercent: '25.2%',
  rulesCount: 73200,
  freeHeap: 76500
}));

// Load overview.js
const overviewScript = fs.readFileSync(path.join(__dirname, '..', 'modules', 'overview.js'), 'utf8');
window.eval(overviewScript);

assert(typeof window.LuminaOverview === 'object', 'window.LuminaOverview is mounted successfully');
assert(typeof window.LuminaOverview.init === 'function', 'LuminaOverview.init is callable');
assert(typeof window.LuminaOverview.render === 'function', 'LuminaOverview.render is callable');
assert(typeof window.LuminaOverview.refresh === 'function', 'LuminaOverview.refresh is callable');
assert(typeof window.LuminaOverview.setFilter === 'function', 'LuminaOverview.setFilter is callable');

// Test VFS metrics calculation
const vfsStats = window.LuminaOverview.getVfsStats();
assert(vfsStats.count === 3, 'VFS stats calculates exact 3 files');
assert(vfsStats.activeFile === 'main.py', 'VFS stats correctly identifies active file');

// Test Calendar metrics calculation
const calStats = window.LuminaOverview.getCalendarStats();
assert(calStats.total === 2, 'Calendar stats calculates 2 total events');
assert(calStats.todayCount === 1, 'Calendar stats correctly identifies 1 event today');
assert(calStats.nextEventTitle === 'Systems Architecture Sync' || calStats.nextEventTitle === 'Future Milestone Review', 'Calendar stats identifies upcoming event');

// Test AdBlock metrics calculation
const adbStats = window.LuminaOverview.getAdblockStats();
assert(adbStats.totalQueries === 45200, 'AdBlock stats retrieves total queries');
assert(adbStats.blockPercent === '25.2%', 'AdBlock stats retrieves block percentage');

// Test AI metrics calculation
const aiStats = window.LuminaOverview.getAiStats();
assert(aiStats.model === 'llama-3.3-70b-versatile', 'AI stats identifies active model');
assert(aiStats.providerName === 'Universal Hybrid Pool', 'AI stats resolves provider pool name');

// 4. Test DOM Rendering & Bento Cards
console.log('\n[SECTION 4: Bento Grid & Subsystems DOM Verification]');
window.LuminaOverview.render();

const container = window.document.getElementById('tab-overview');
const html = container.innerHTML;

assert(html.includes('Mission Control'), 'Mission Control hero title rendered');
assert(html.includes('AI Studio &amp; Jev Engine'), 'Subsystem 1 (AI Studio) bento card rendered');
assert(html.includes('VFS Workspace'), 'Subsystem 2 (VFS) bento card rendered');
assert(html.includes('Calendar Engine'), 'Subsystem 3 (Calendar) bento card rendered');
assert(html.includes('ESP32 AdBlocker'), 'Subsystem 4 (ESP32 AdBlocker) bento card rendered');
assert(html.includes('Smart Door Lock'), 'Subsystem 5 (Smart Door Lock) bento card rendered');
assert(html.includes('Cloud Compilers &amp; SQL'), 'Subsystem 6 (Compilers) bento card rendered');
assert(html.includes('Whiteboard Pro'), 'Subsystem 7 (Whiteboard) bento card rendered');
assert(html.includes('Consolidated OS Activity Stream'), 'Activity stream container rendered');

// 5. Activity Filtering & Dynamism
console.log('\n[SECTION 5: Activity Feed & Filter Operations]');
window.LuminaOverview.setFilter('security');
let feedHtml = window.document.getElementById('overviewActivityList').innerHTML;
assert(feedHtml.includes('Zero-Trust Node Initialized'), 'Security activity filter displays security event');

window.LuminaOverview.addActivity({
  type: 'network',
  icon: 'wifi',
  color: 'cyan',
  title: 'Direct Cloud Heartbeat Received',
  desc: 'ESP32 sent authenticated heartbeat via HMAC-SHA256.'
});

window.LuminaOverview.setFilter('network');
feedHtml = window.document.getElementById('overviewActivityList').innerHTML;
assert(feedHtml.includes('Direct Cloud Heartbeat Received'), 'Newly added activity dynamically renders under network filter');

// Teardown
window.LuminaOverview.destroy();

console.log(`\n=================================================================`);
console.log(`🎉 OVERVIEW DASHBOARD VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED CLEANLY!`);
console.log(`=================================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
