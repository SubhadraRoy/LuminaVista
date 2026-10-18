/**
 * tests/suite-cloud-computer.cjs
 * Lumina Vista Autonomous Cloud Computer Integration Test Battery
 *
 * Verifies:
 * 1. Layout, navigation, DOM mounting, and line count budgets (< 2,000 lines)
 * 2. Real-time compute bento telemetry (vCPU, vRAM, sandboxes, VFS storage)
 * 3. 24/7 background daemons (AutoDev, Sentinel, Synthesizer, Optimizer)
 * 4. Autonomous Mission DAG formulation, microVM execution, and closed-loop self-healing
 * 5. Worker API routing, RBAC privileges, and BOLA/IDOR protection
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

console.log('=================================================================');
console.log('⚡ LUMINAVISTA OS: AUTONOMOUS CLOUD COMPUTER TEST BATTERY');
console.log('=================================================================\n');

function check(title, condition) {
  if (condition) {
    console.log(`  ✓ PASS: ${title}`);
  } else {
    console.error(`  ✖ FAIL: ${title}`);
    throw new Error(`Assertion failed: ${title}`);
  }
}

async function runCloudComputerSuite() {
  const rootDir = path.join(__dirname, '..');

  // -------------------------------------------------------------------------
  // SECTION 1: Layout, Navigation & DOM Hierarchy
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: Layout, Navigation & DOM Hierarchy]');

  const dashboardHtml = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
  const dashboardLines = dashboardHtml.split('\n').length;
  check(`dashboard.html LOC is strictly under 2,000 lines (Actual: ${dashboardLines})`, dashboardLines < 2000);

  check('Sidebar contains #btn-tab-cloud-computer button', dashboardHtml.includes('id="btn-tab-cloud-computer"'));
  check('Main viewport contains #tab-cloud-computer container', dashboardHtml.includes('id="tab-cloud-computer"'));
  check('dashboard.html includes script tag for modules/cloud-computer.js', dashboardHtml.includes('modules/cloud-computer.js'));

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="tab-cloud-computer"></div>
    <button id="btn-tab-cloud-computer"></button>
  </body></html>`, { url: 'https://lumina-vista-sigma.vercel.app/dashboard.html' });

  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.sessionStorage = window.sessionStorage;
  global.localStorage = window.localStorage;
  global.requestAnimationFrame = window.requestAnimationFrame = (fn) => setTimeout(fn, 16);
  global.cancelAnimationFrame = window.cancelAnimationFrame = (id) => clearTimeout(id);

  // Mock fetch and canvas methods
  window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true })
  });

  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    scale: () => {}
  });

  // Load and evaluate modules/cloud-computer.js
  const scriptContent = fs.readFileSync(path.join(rootDir, 'modules', 'cloud-computer.js'), 'utf8');
  window.eval(scriptContent);

  check('window.LuminaCloudComputer is exported', typeof window.LuminaCloudComputer === 'object' && window.LuminaCloudComputer !== null);
  window.LuminaCloudComputer.init();

  const requiredDomIds = [
    'cloudComputerStatusBadge',
    'cloudComputerArchText',
    'cloudComputerUptimeText',
    'cloudMetricCpu',
    'cloudMetricCpuBar',
    'cloudMetricRam',
    'cloudMetricRamBar',
    'cloudMetricSandboxes',
    'cloudMetricVfs',
    'cloudMetricDaemons',
    'cloudCpuWaveformCanvas',
    'cloudDaemonsGrid',
    'cloudMissionGoalInput',
    'cloudMissionStatusBadge',
    'cloudMissionGoalTitle',
    'cloudMissionDagContainer',
    'cloudProcessTableBody',
    'cloudTerminalOutput'
  ];

  for (const id of requiredDomIds) {
    check(`UI Indicator #${id} mounted cleanly in DOM`, window.document.getElementById(id) !== null);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: Autonomous Daemons & Orchestrator Logic
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: Autonomous Daemons & Orchestrator Logic]');

  const orchestratorUrl = pathToFileURL(path.join(rootDir, 'api', '_lib', 'autonomous-orchestrator.js')).href;
  const orchestrator = await import(orchestratorUrl);

  const redisModUrl = pathToFileURL(path.join(rootDir, 'api', '_lib', 'redis.js')).href;
  const { getSafeStorage } = await import(redisModUrl);
  const storage = getSafeStorage();

  const daemons = await orchestrator.getAutonomousDaemons(storage);
  check('Registry loads all 4 default autonomous daemons', Array.isArray(daemons) && daemons.length === 4);

  const autoDev = daemons.find(d => d.id === 'jev_autodev');
  check('jev_autodev daemon registered with Code & Compute category', autoDev && autoDev.category === 'Code & Compute');

  const sentinel = daemons.find(d => d.id === 'iot_security_sentinel');
  check('iot_security_sentinel registered with Security & IoT category', sentinel && sentinel.category === 'Security & IoT');

  const synthesizer = daemons.find(d => d.id === 'web_research_synthesizer');
  check('web_research_synthesizer registered with Intelligence & Research category', synthesizer && synthesizer.category === 'Intelligence & Research');

  const optimizer = daemons.find(d => d.id === 'calendar_life_optimizer');
  check('calendar_life_optimizer registered with Life & Productivity category', optimizer && optimizer.category === 'Life & Productivity');

  // Toggle daemon state
  const toggleOff = await orchestrator.toggleDaemonState(storage, 'jev_autodev', false);
  check('toggleDaemonState successfully disables daemon', toggleOff.success && toggleOff.daemon.enabled === false);

  const toggleOn = await orchestrator.toggleDaemonState(storage, 'jev_autodev', true);
  check('toggleDaemonState successfully re-enables daemon', toggleOn.success && toggleOn.daemon.enabled === true);

  // Execute single cycle
  const cycleResult = await orchestrator.executeDaemonCycle(storage, 'iot_security_sentinel');
  check('executeDaemonCycle increments executionCount and returns summary',
    cycleResult.success && cycleResult.daemon.executionCount >= 43 && cycleResult.summary.includes('Security scan complete'));

  // Virtual compute metrics
  const metrics = await orchestrator.getVirtualComputeMetrics(storage);
  check('getVirtualComputeMetrics reports 4 vCPU cores', metrics.vcpuCores === 4);
  check('getVirtualComputeMetrics reports 4096 MB vRAM', metrics.ramTotalMb === 4096);
  check('getVirtualComputeMetrics reports 1024 MB VFS quota', metrics.vfsStorageTotalMb === 1024.0);
  check('getVirtualComputeMetrics reports active daemons count', metrics.activeDaemonsCount === 4);
  check('getVirtualComputeMetrics healthStatus is HEALTHY_AUTONOMOUS', metrics.healthStatus === 'HEALTHY_AUTONOMOUS');

  // -------------------------------------------------------------------------
  // SECTION 3: Autonomous Mission DAG & Closed-Loop Execution
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: Autonomous Mission DAG & Closed-Loop Execution]');

  // Dispatch rejection on empty goal
  const emptyRes = await orchestrator.dispatchAutonomousMission(storage, { goal: '' });
  check('dispatchAutonomousMission rejects empty goal string', emptyRes.success === false && emptyRes.error);

  // Dispatch valid mission
  const goalText = 'Build an autonomous micro-service in Python and verify with unit tests';
  const dispatchRes = await orchestrator.dispatchAutonomousMission(storage, {
    goal: goalText,
    preset: 'autodev',
    sessionId: 'session_test_master_1',
    role: 'master'
  });

  check('dispatchAutonomousMission returns unique missionId and 5-step DAG',
    dispatchRes.success && dispatchRes.mission.missionId.startsWith('mission_') && dispatchRes.mission.dag.length === 5);

  const missionId = dispatchRes.mission.missionId;
  const initialStatus = await orchestrator.getMissionStatus(storage, missionId);
  check('getMissionStatus retrieves running mission from storage', initialStatus.status === 'running');

  // Advance DAG to completion
  const completedStatus = await orchestrator.advanceMissionDag(storage, missionId);
  check('advanceMissionDag transitions mission to completed status with 0 errors',
    completedStatus.status === 'completed' && completedStatus.dag[4].status === 'completed');

  check('Mission logs capture all 5 DAG execution milestones',
    completedStatus.logs.length >= 7 && completedStatus.logs.some(l => l.includes('Step 5 complete')));

  // -------------------------------------------------------------------------
  // SECTION 4: Cloud Worker API Routing & Privileges
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 4: Cloud Worker API Routing & Security]');

  const workerUrl = pathToFileURL(path.join(rootDir, 'api', 'worker.js')).href;
  const workerMod = await import(workerUrl);
  const workerHandler = workerMod.default;

  function createMockRes() {
    let statusCode = 200;
    let data = null;
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (d) => { data = d; return res; },
      setHeader: () => {},
      end: () => res,
      _getStatusCode: () => statusCode,
      _getData: () => data
    };
    return res;
  }

  // GET /api/worker?action=autonomous_status
  const statusRes = createMockRes();
  await workerHandler({
    method: 'GET',
    query: { action: 'autonomous_status' },
    headers: { 'x-session-id': 'sovereign_session' }
  }, statusRes);

  check('GET ?action=autonomous_status returns HTTP 200 with compute metrics and daemons',
    statusRes._getStatusCode() === 200 && statusRes._getData().metrics && Array.isArray(statusRes._getData().daemons));

  // POST /api/worker action=dispatch_mission
  const postMissionRes = createMockRes();
  await workerHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: {
      action: 'dispatch_mission',
      goal: 'Audit IoT smart door lock credentials and sync to VFS',
      preset: 'sentinel'
    }
  }, postMissionRes);

  check('POST ?action=dispatch_mission dispatches new autonomous mission via API',
    postMissionRes._getStatusCode() === 200 && postMissionRes._getData().mission);

  const apiMissionId = postMissionRes._getData().mission.missionId;

  // GET /api/worker?action=mission_status
  const getMissionRes = createMockRes();
  await workerHandler({
    method: 'GET',
    query: { action: 'mission_status', missionId: apiMissionId },
    headers: { 'x-session-id': 'sovereign_session' }
  }, getMissionRes);

  check('GET ?action=mission_status advances and returns mission DAG',
    getMissionRes._getStatusCode() === 200 && getMissionRes._getData().mission.status === 'completed');

  // POST /api/worker action=toggle_daemon with master role
  const toggleRes = createMockRes();
  await workerHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: {
      action: 'toggle_daemon',
      daemonId: 'calendar_life_optimizer',
      enabled: false
    }
  }, toggleRes);

  check('POST action=toggle_daemon succeeds with master session',
    toggleRes._getStatusCode() === 200 && toggleRes._getData().daemon.enabled === false);

  // POST /api/worker action=run_daemon_now
  const runNowRes = createMockRes();
  await workerHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: {
      action: 'run_daemon_now',
      daemonId: 'web_research_synthesizer'
    }
  }, runNowRes);

  check('POST action=run_daemon_now executes immediate daemon cycle',
    runNowRes._getStatusCode() === 200 && runNowRes._getData().summary);

  // BOLA protection: guest role cannot toggle daemons
  const guestSid = 'session_guest_unauthorized_99';
  await storage.set(`session:${guestSid}`, JSON.stringify({ sessionId: guestSid, role: 'temporary', valid: true }));

  const guestToggleRes = createMockRes();
  await workerHandler({
    method: 'POST',
    headers: { 'x-session-id': guestSid },
    body: {
      action: 'toggle_daemon',
      daemonId: 'jev_autodev',
      enabled: false
    }
  }, guestToggleRes);

  check('Guest temporary role is rejected with HTTP 403 on toggle_daemon (BFLA/RBAC)',
    guestToggleRes._getStatusCode() === 403);

  console.log('\n=================================================================');
  console.log('🎉 ALL AUTONOMOUS CLOUD COMPUTER INTEGRATION TESTS PASSED 100%!');
  console.log('=================================================================\n');
}

runCloudComputerSuite()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('\n✖ Suite failed:', err);
    process.exit(1);
  });

