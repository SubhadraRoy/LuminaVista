// tests/suite-adblock.cjs - Suite: ESP32 DNS Ad-Blocker & Zero-Trust Cloud Gateway Integration
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const crypto = require('crypto');

async function runAdblockSuite({ assert, window, document, rootDir }) {
  console.log("\n=================================================================");
  console.log("   LUMINAVISTA OS: ESP32 ADBLOCKER INTEGRATION TEST BATTERY     ");
  console.log("=================================================================");

  // SECTION 1: Layout, Navigation & DOM Hierarchy Audits
  console.log("\n[SECTION 1: Layout, Navigation & DOM Hierarchy]");

  const dashPath = path.join(rootDir, 'dashboard.html');
  const dashContent = fs.readFileSync(dashPath, 'utf8');
  const dashLines = dashContent.split('\n').length;
  assert(dashLines < 2000, `dashboard.html LOC is strictly under 2,000 lines (Actual: ${dashLines})`);

  const adblockBtn = document.getElementById('btn-tab-adblock');
  assert(adblockBtn !== null, "Sidebar contains #btn-tab-adblock button");

  const controlsBtn = document.getElementById('btn-tab-controls');
  const smartlockBtn = document.getElementById('btn-tab-smartlock');
  assert(controlsBtn !== null && smartlockBtn !== null, "Settings and Smart Door Lock buttons exist in sidebar");

  // Check ordering: controlsBtn -> adblockBtn -> smartlockBtn
  const navBtns = Array.from(document.querySelectorAll('aside nav .tab-btn'));
  const controlsIdx = navBtns.findIndex(b => b.id === 'btn-tab-controls');
  const adblockIdx = navBtns.findIndex(b => b.id === 'btn-tab-adblock');
  const smartlockIdx = navBtns.findIndex(b => b.id === 'btn-tab-smartlock');

  assert(adblockIdx === controlsIdx + 1, "ESP32 AdBlocker tab is placed immediately AFTER Settings (#btn-tab-controls)");
  assert(smartlockIdx === adblockIdx + 1, "ESP32 AdBlocker tab is placed immediately BEFORE Smart Door Lock (#btn-tab-smartlock)");

  const adblockSection = document.getElementById('tab-adblock');
  assert(adblockSection !== null, "#tab-adblock section container exists in main viewport");

  // Check script tag inclusion in dashboard.html
  assert(dashContent.includes('modules/adblock.js'), "dashboard.html includes script tag for modules/adblock.js");

  // SECTION 2: Client-Side Controller Mounting & Workstation Indicators
  console.log("\n[SECTION 2: Client-Side Controller & Workstation Mounting]");

  if (typeof window.fetch !== 'function') {
    window.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        state: {
          uptime: 3600,
          freeHeap: 104000,
          minHeap: 82000,
          totalBlocked: 420,
          totalAllowed: 1200,
          rebindBlocked: 5,
          rateLimited: 0,
          rulesCount: 245000,
          activeClients: 1,
          qps: 12,
          status: 'ONLINE',
          lastSeenMs: Date.now()
        },
        clients: [
          { ip: '192.168.0.63', name: 'Workstation', iface: 'lan', queries: 800, blocked: 200 }
        ],
        logs: [
          { domain: 'tracker.ad.test', ip: '192.168.0.63', cat: 'AD_SINKHOLE', ts: Date.now() }
        ],
        cmdQueue: [],
        serverTime: Math.floor(Date.now() / 1000)
      })
    });
  }

  if (typeof window.LuminaAdBlock !== 'object' || window.LuminaAdBlock === null) {
    const adblockScript = fs.readFileSync(path.join(rootDir, 'modules', 'adblock.js'), 'utf8');
    window.eval(adblockScript);
  }

  assert(typeof window.LuminaAdBlock === 'object' && window.LuminaAdBlock !== null, "window.LuminaAdBlock is mounted");
  window.LuminaAdBlock.init();

  const requiredIndicators = [
    'adblockConnBadge', 'adblockIpChip', 'adblockRttBadge', 'adblockQueueBadge', 'adblockBtnRefresh',
    'adblockStatBlocked', 'adblockStatPercent', 'adblockStatAllowed', 'adblockStatRules',
    'adblockStatClients', 'adblockStatRssi', 'adblockStatHeap', 'adblockUptimeText', 'adblockRebindText',
    'adblockThroughputCanvas', 'adblockThroughputOverlay',
    'adblockSubTabBtn-clients', 'adblockSubTabBtn-rules', 'adblockSubTabBtn-logs',
    'adblockSubTabBtn-system', 'adblockSubTabBtn-webview',
    'adblockPane-clients', 'adblockPane-rules', 'adblockPane-logs', 'adblockPane-system', 'adblockPane-webview',
    'adblockClientSearchInput', 'adblockClientsTableBody',
    'adblockCustomDomainInput', 'adblockCustomRulesList',
    'adblockLogSearchInput', 'adblockLogsTableBody'
  ];

  for (const id of requiredIndicators) {
    assert(document.getElementById(id) !== null, `Indicator/Element #${id} mounted in DOM`);
  }

  // Test sub-tab switching
  window.LuminaAdBlock.switchSubTab('rules');
  assert(!document.getElementById('adblockPane-rules').classList.contains('hidden'), "Switching to 'rules' reveals #adblockPane-rules");
  assert(document.getElementById('adblockPane-clients').classList.contains('hidden'), "Switching to 'rules' hides #adblockPane-clients");

  window.LuminaAdBlock.switchSubTab('clients');
  assert(!document.getElementById('adblockPane-clients').classList.contains('hidden'), "Switching back to 'clients' reveals #adblockPane-clients");

  // SECTION 3: Cryptographic IoT Gateway Security Suite (api/adblock.js)
  console.log("\n[SECTION 3: Zero-Trust Cryptographic Cloud Gateway Suite]");

  const adblockModuleUrl = pathToFileURL(path.join(rootDir, 'api', 'adblock.js')).href;
  const adblockMod = await import(adblockModuleUrl);

  const {
    computeDeviceSignature,
    signDeviceCommand,
    verifyDeviceRequest,
    applyPendingCommandsToState,
    normalizeStatus,
    sanitizeDomain,
    getDeviceSecret,
    KEY_STATE,
    KEY_CLIENTS,
    KEY_LOGS,
    KEY_CMDS,
    KEY_META,
    DEFAULT_DEVICE_ID
  } = adblockMod;

  const defaultHandler = adblockMod.default;

  assert(typeof computeDeviceSignature === 'function', "computeDeviceSignature exported");
  assert(typeof signDeviceCommand === 'function', "signDeviceCommand exported");
  assert(typeof verifyDeviceRequest === 'function', "verifyDeviceRequest exported");
  assert(typeof defaultHandler === 'function', "default HTTP handler exported");

  const storageModule = await import(pathToFileURL(path.join(rootDir, 'api', '_lib', 'redis.js')).href);
  const storage = storageModule.getSafeStorage();

  const secret = getDeviceSecret();
  assert(secret && secret.length >= 32, "Device HMAC secret resolved");

  // 3.1 Public Time Sync
  const timeReq = { method: 'GET', query: { action: 'time' }, headers: {} };
  let timeRespData = null;
  const timeRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { timeRespData = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(timeReq, timeRes);
  assert(timeRes.statusCode === 200, "GET ?action=time returns HTTP 200");
  assert(timeRespData && timeRespData.ok === true && Number.isFinite(timeRespData.time), "Time response includes valid unix epoch");

  // 3.2 Canonical Device Signature & Nonce Anti-Replay
  const nowSec = Math.floor(Date.now() / 1000);
  const nonce1 = crypto.randomBytes(16).toString('hex');
  const seq1 = 1;
  const testPayload = {
    uptime: 100,
    freeHeap: 104000,
    minHeap: 82000,
    totalBlocked: 420,
    totalAllowed: 1200,
    rebindBlocked: 5,
    rateLimited: 0,
    rulesCount: 245000,
    clients: [
      { ip: '192.168.0.63', name: 'Workstation', iface: 'lan', queries: 800, blocked: 200 }
    ],
    logs: [
      { domain: 'tracker.ad.test', ip: '192.168.0.63', cat: 'AD_SINKHOLE', ts: Date.now() }
    ]
  };
  const rawBodyStr = JSON.stringify(testPayload);
  const validSig = computeDeviceSignature(secret, DEFAULT_DEVICE_ID, String(nowSec), nonce1, String(seq1), rawBodyStr);

  const heartbeatReq = {
    method: 'POST',
    query: { action: 'heartbeat' },
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': nonce1,
      'x-lumina-seq': String(seq1),
      'x-lumina-signature': validSig
    },
    body: testPayload,
    rawBody: rawBodyStr
  };

  let hbRespData = null;
  const hbRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { hbRespData = d; return this; },
    setHeader() { return this; }
  };

  await defaultHandler(heartbeatReq, hbRes);
  assert(hbRes.statusCode === 200, "POST ?action=heartbeat with valid HMAC returns HTTP 200");
  assert(hbRespData && hbRespData.ok === true, "Heartbeat acknowledged successfully by cloud gateway");

  // Verify atomic pipelined persistence into storage
  const persistedState = JSON.parse(await storage.get(KEY_STATE));
  assert(persistedState.totalBlocked === 420, "Total blocked queries stored in cloud shadow");
  assert(persistedState.totalAllowed === 1200, "Total allowed queries stored in cloud shadow");

  const persistedClients = JSON.parse(await storage.get(KEY_CLIENTS));
  assert(Array.isArray(persistedClients) && persistedClients.length === 1, "Client list persisted in cloud shadow");
  assert(persistedClients[0].ip === '192.168.0.63', "Client IP verified");

  // 3.3 Replay Attack Gate (Duplicate Nonce)
  let replayRespData = null;
  const replayRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { replayRespData = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(heartbeatReq, replayRes);
  assert(replayRes.statusCode === 401, "Replay attack with duplicate nonce is strictly rejected with HTTP 401");

  // 3.4 Tampered Signature Gate
  const nonce2 = crypto.randomBytes(16).toString('hex');
  const tamperedReq = {
    method: 'POST',
    query: { action: 'heartbeat' },
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': nonce2,
      'x-lumina-seq': '2',
      'x-lumina-signature': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' // Bad HMAC
    },
    body: testPayload
  };
  let tamperedResp = null;
  const tRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { tamperedResp = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(tamperedReq, tRes);
  assert(tRes.statusCode === 401, "Tampered HMAC signature is rejected with HTTP 401");

  // 3.5 Timestamp Skew Gate (> 60s drift)
  const staleTs = nowSec - 120;
  const nonce3 = crypto.randomBytes(16).toString('hex');
  const staleSig = computeDeviceSignature(secret, DEFAULT_DEVICE_ID, String(staleTs), nonce3, '3', rawBodyStr);
  const staleReq = {
    method: 'POST',
    query: { action: 'heartbeat' },
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(staleTs),
      'x-lumina-nonce': nonce3,
      'x-lumina-seq': '3',
      'x-lumina-signature': staleSig
    },
    body: testPayload
  };
  let staleResp = null;
  const sRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { staleResp = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(staleReq, sRes);
  assert(sRes.statusCode === 401, "Stale timestamp (>60s drift) is rejected with HTTP 401");

  // 3.6 Unauthenticated Dashboard Access Gate
  const unauthDashReq = { method: 'GET', query: { action: 'dashboard' }, headers: { 'x-forwarded-for': '198.51.100.50' } };
  let unauthDashResp = null;
  const uDashRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { unauthDashResp = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(unauthDashReq, uDashRes);
  assert(uDashRes.statusCode === 401, "Unauthenticated GET ?action=dashboard rejected with HTTP 401 (Zero-Trust Privacy)");

  // 3.7 Authenticated Command Queuing & Downlink Mutual Signing
  const cmdReq = {
    method: 'POST',
    query: { action: 'command' },
    headers: { 'x-session-id': 'mock_adblock_admin_test_session' },
    body: { cmd: 'ban_client', param: '192.168.0.100' }
  };
  let cmdResp = null;
  const cRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { cmdResp = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(cmdReq, cRes);
  assert(cRes.statusCode === 200, "POST ?action=command queues command successfully (HTTP 200)");
  assert(cmdResp && cmdResp.ok === true && cmdResp.cmdId, "Command object created with unique cmdId");

  const cmdQueue = JSON.parse(await storage.get(KEY_CMDS));
  assert(Array.isArray(cmdQueue) && cmdQueue.length === 1, "Command queued in Redis");
  assert(cmdQueue[0].signature && cmdQueue[0].signature.length === 64, "Queued command includes mutual HMAC-SHA256 signature");

  // Authenticated GET ?action=dashboard Test
  const authDashReq = {
    method: 'GET',
    query: { action: 'dashboard' },
    headers: { 'x-session-id': 'mock_adblock_admin_test_session' }
  };
  let authDashResp = null;
  const aDashRes = {
    status(s) { this.statusCode = s; return this; },
    json(d) { authDashResp = d; return this; },
    setHeader() { return this; }
  };
  await defaultHandler(authDashReq, aDashRes);
  assert(aDashRes.statusCode === 200, "Authenticated GET ?action=dashboard returns HTTP 200");
  assert(authDashResp && authDashResp.ok === true, "Dashboard telemetry retrieved successfully");

  // 3.8 Optimistic State Projection
  const { state: projectedState, clients: projectedClients } = applyPendingCommandsToState(
    persistedState,
    persistedClients,
    cmdQueue
  );
  const bannedClient = projectedClients.find(c => c.ip === '192.168.0.100');
  assert(bannedClient && bannedClient.banned === true, "Optimistic projection reflects pending ban_client in dashboard state");

  // 3.9 Domain Input Sanitization
  assert(sanitizeDomain('MALWARE.TRACKER.COM') === 'malware.tracker.com', "sanitizeDomain lowercases hostname");
  assert(sanitizeDomain('../../etc/passwd') === '', "sanitizeDomain blocks directory traversal path");
  assert(sanitizeDomain('invalid_domain!@#.com') === '', "sanitizeDomain blocks illegal characters");
  assert(sanitizeDomain('safe-cdn.sub.example.com') === 'safe-cdn.sub.example.com', "sanitizeDomain allows valid subdomains");

  console.log("\n=================================================================");
  console.log("🎉 ALL ESP32 ADBLOCKER INTEGRATION TESTS PASSED WITH ZERO ERRORS!");
  console.log("=================================================================\n");
  return true;
}

// Standalone execution runner
if (require.main === module) {
  const rootDir = path.join(__dirname, '..');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8'), {
    url: 'https://lumina-vista-sigma.vercel.app/dashboard.html',
    runScripts: 'dangerously',
    resources: 'usable'
  });

  const { window } = dom;
  const { document } = window;

  // Polyfills
  window.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      state: {
        uptime: 3600,
        freeHeap: 104000,
        minHeap: 82000,
        totalBlocked: 420,
        totalAllowed: 1200,
        rebindBlocked: 5,
        rateLimited: 0,
        rulesCount: 245000,
        activeClients: 1,
        qps: 12,
        status: 'ONLINE',
        lastSeenMs: Date.now()
      },
      clients: [
        { ip: '192.168.0.63', name: 'Workstation', iface: 'lan', queries: 800, blocked: 200 }
      ],
      logs: [
        { domain: 'tracker.ad.test', ip: '192.168.0.63', cat: 'AD_SINKHOLE', ts: Date.now() }
      ],
      cmdQueue: [],
      serverTime: Math.floor(Date.now() / 1000)
    })
  });

  const adblockScript = fs.readFileSync(path.join(rootDir, 'modules', 'adblock.js'), 'utf8');
  window.eval(adblockScript);

  function assert(condition, message) {
    if (!condition) {
      console.error(`  ❌ FAIL: ${message}`);
      process.exit(1);
    }
    console.log(`  ✓ PASS: ${message}`);
  }

  runAdblockSuite({ assert, window, document, rootDir })
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Test Suite Exception:", err);
      process.exit(1);
    });
}

module.exports = runAdblockSuite;
