// tests/suite-smart-lock.cjs - Suite 29: ESP32 Smart Door Lock & Ultra-Secure 5-Layer Cloud Gateway
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = async function runSmartLockSuite({ assert, window, document, rootDir }) {
  console.log("\n--- SUITE 29: ESP32 Smart Door Lock & Ultra-Secure Cloud Log Gateway ---");

  // 1. Verify dashboard.html line count < 2000 & Smart Lock tab is the last tab in sidebar
  const dashPath = path.join(rootDir, 'dashboard.html');
  const dashLines = fs.readFileSync(dashPath, 'utf8').split('\n').length;
  assert(dashLines < 2000, `dashboard.html LOC is strictly under 2,000 lines (Actual: ${dashLines})`);

  const navBtns = Array.from(document.querySelectorAll('aside nav .tab-btn'));
  assert(navBtns.length > 0, "Sidebar navigation buttons exist");
  const lastNavBtn = navBtns[navBtns.length - 1];
  assert(lastNavBtn && lastNavBtn.id === 'btn-tab-smartlock', "Smart Door Lock (#btn-tab-smartlock) is the last tab button in sidebar");
  assert(document.getElementById('tab-smartlock') !== null, "#tab-smartlock section exists in main viewport");

  // 2. Initialize LuminaSmartLock and verify all 22 indicators + 30 controls
  assert(typeof window.LuminaSmartLock === 'object' && window.LuminaSmartLock !== null, "window.LuminaSmartLock is initialized");
  window.LuminaSmartLock.init();

  const indicatorIds = [
    'slConnBadge', 'slIpChip', 'slLockStatus', 'slDoorStatus', 'slDoorOpenTime',
    'slAlarmStatus', 'slLastEvent', 'slLastDoorEvent', 'slLastAccessEvent',
    'slLastNfcEvent', 'slRelay3Status', 'slRelay3SchedBadge', 'slRelay4Status',
    'slRelay4SchedBadge', 'slCardsCount', 'slEnrollState', 'slWifiMode',
    'slWifiSignal', 'slCpuLoad', 'slHeapFree', 'slUptime', 'slLastOnline', 'slLastOffline',
    'slConnHistoryPanel', 'slConnDuration', 'slOfflineWatchdogBadge', 'slConnHistoryCountBadge', 'slConnHistoryList'
  ];
  for (const id of indicatorIds) {
    assert(document.getElementById(id) !== null, `Live status indicator #${id} mounted in DOM`);
  }

  const controlIds = [
    'slBtnUnlock', 'slBtnLock', 'slBtnClearAlarm', 'slBtnRestart',
    'slBtnForceRefresh', 'slBtnClearQueue',
    'slBtnRelay3Toggle', 'slBtnRelay3On', 'slBtnRelay3Off',
    'slRelay3SchedEnabled', 'slRelay3OnTime', 'slRelay3OffTime', 'slBtnRelay3SchedSave',
    'slBtnRelay4Toggle', 'slBtnRelay4On', 'slBtnRelay4Off',
    'slRelay4SchedEnabled', 'slRelay4OnTime', 'slRelay4OffTime', 'slBtnRelay4SchedSave',
    'slBtnEnroll', 'slBtnClearCards',
    'slBtnDownloadTxt', 'slBtnDownloadJson', 'slBtnDownloadCsv', 'slBtnClearLogs',
    'slBtnClearConnHistory',
    'slLogSearchInput', 'slBtnLogPause',
    'slLogFilterAll', 'slLogFilterAccess', 'slLogFilterAlarm',
    'slLogFilterDoor', 'slLogFilterRelay', 'slLogFilterSystem',
    'slCardHistoryModal', 'slHistoryTitle', 'slHistoryContent', 'slBtnCloseHistory'
  ];
  for (const id of controlIds) {
    assert(document.getElementById(id) !== null, `Interactive control #${id} mounted in DOM`);
  }

  // 3. Test Zero-Trust IoT Gateway (api/iot.js) 5-Layer Cryptographic Security
  const iotModuleUrl = pathToFileURL(path.join(rootDir, 'api', 'iot.js')).href;
  const iotMod = await import(iotModuleUrl);
  const {
    DEFAULT_DEVICE_ID,
    MAX_CLOUD_LOGS,
    MAX_CARD_HISTORY,
    MAX_CONN_HISTORY,
    getDeviceSecret,
    computeDeviceSignature,
    signDeviceCommand,
    verifyDeviceRequest,
    default: iotHandler
  } = iotMod;

  assert(typeof computeDeviceSignature === 'function', "computeDeviceSignature exported from api/iot.js");
  assert(typeof signDeviceCommand === 'function', "signDeviceCommand exported from api/iot.js");
  assert(typeof verifyDeviceRequest === 'function', "verifyDeviceRequest exported from api/iot.js");
  assert(MAX_CLOUD_LOGS === 2000, "MAX_CLOUD_LOGS is 2000");
  assert(MAX_CARD_HISTORY === 100, "MAX_CARD_HISTORY is 100");
  assert(MAX_CONN_HISTORY === 500, "MAX_CONN_HISTORY is 500");

  function createMockRes() {
    const resObj = {
      statusCode: 200,
      headers: {},
      body: null,
      rawText: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
      send(text) { this.rawText = text; return this; },
      end(text) { if (text !== undefined) this.rawText = text; return this; }
    };
    return resObj;
  }

  // 3A. Test Signed Time-Sync Bootstrap (GET /api/iot?action=time) & 24/7 Watchdog (GET /api/iot?action=watchdog)
  const timeRes = createMockRes();
  await iotHandler({ method: 'GET', url: '/api/iot?action=time&challenge=deadbeef01', headers: {} }, timeRes);
  assert(timeRes.statusCode === 200 && timeRes.body && timeRes.body.ok === true, "GET /api/iot?action=time returns 200 OK");
  assert(typeof timeRes.body.signature === 'string' && timeRes.body.signature.length === 64, "Time-sync response includes 64-char HMAC-SHA256 signature");

  const watchdogRes = createMockRes();
  await iotHandler({ method: 'GET', url: '/api/iot?action=watchdog', headers: {} }, watchdogRes);
  assert(watchdogRes.statusCode === 200 && watchdogRes.body && watchdogRes.body.ok === true, "GET /api/iot?action=watchdog returns 200 OK (zero-PII 24/7 liveness pulse)");

  // 3B. Test Valid ESP32 Signed Hardware Push (Online Logs + Cards + Status + connEvents)
  const secret = getDeviceSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const pushBodyObj = {
    status: {
      lock: 'LOCKED',
      door: 'CLOSED',
      alarm: false,
      relay3: true,
      relay4: false,
      wifi: 'STA',
      ip: 'LAN-PROTECTED',
      rssi: -49,
      cpu_load: 11,
      heap_free: 224100,
      uptime: 7265,
      lastEvent: 'UNLOCKED (15s) via NFC-MasterKey'
    },
    cards: [
      {
        uid: '04A1B2C3',
        name: 'MasterKey',
        active: true,
        color: '#10b981',
        last: '2026-10-06 22:55:10',
        count: 14,
        history: ['2026-10-06 22:55:10', '2026-10-06 18:12:04']
      }
    ],
    logs: [
      { seq: 101, ts: '2026-10-06 22:55:00', msg: 'Door CLOSED @ 2026-10-06 22:55:00', source: 'offline_buffer' },
      { seq: 102, ts: '2026-10-06 22:55:10', msg: 'UNLOCK: NFC-MasterKey: 04A1B2C3', source: 'live' }
    ],
    connEvents: [
      { seq: 7, type: 'OFFLINE', ts: '2026-10-06 22:50:00', reason: 'Wi-Fi Disconnected' },
      { seq: 8, type: 'ONLINE', ts: '2026-10-06 22:51:15', reason: 'ESP32 Reconnected to Cloud' }
    ],
    ackCmdIds: []
  };
  const rawPushBody = JSON.stringify(pushBodyObj);
  const validNonce = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const validSig = computeDeviceSignature(secret, DEFAULT_DEVICE_ID, String(nowSec), validNonce, '1', rawPushBody);

  const pushRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': validNonce,
      'x-lumina-seq': '1',
      'x-lumina-signature': validSig
    },
    rawBody: rawPushBody,
    body: pushBodyObj
  }, pushRes);

  assert(pushRes.statusCode === 200 && pushRes.body.ok === true, "Valid HMAC-signed ESP32 hardware push succeeds (200 OK)");
  assert(pushRes.body.ackedLogSeq === 102, "Gateway returns highest ackedLogSeq (102) so ESP32 can purge local offline buffer");
  assert(pushRes.body.ackedConnSeq === 8, "Gateway returns highest ackedConnSeq (8) so ESP32 can purge RTC connEvents buffer");

  // 3B-2. Verify Additive Card Tap History Merge when ESP32 purges its RAM on subsequent heartbeat
  const purgedCardBodyObj = {
    status: pushBodyObj.status,
    cards: [
      {
        uid: '04A1B2C3',
        name: 'MasterKey',
        active: true,
        color: '#10b981',
        last: '-',
        count: 0,
        history: []
      }
    ],
    logs: [],
    ackCmdIds: []
  };
  const rawPurgedBody = JSON.stringify(purgedCardBodyObj);
  const purgedNonce = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';
  const purgedSig = computeDeviceSignature(secret, DEFAULT_DEVICE_ID, String(nowSec), purgedNonce, '2', rawPurgedBody);
  const purgedRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': purgedNonce,
      'x-lumina-seq': '2',
      'x-lumina-signature': purgedSig
    },
    rawBody: rawPurgedBody,
    body: purgedCardBodyObj
  }, purgedRes);
  assert(purgedRes.statusCode === 200 && purgedRes.body.ok === true, "Subsequent ESP32 heartbeat with RAM-purged card history succeeds");

  // 3C. Test Anti-Replay Nonce Protection (Same nonce must be rejected with 401)
  const replayRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': validNonce,
      'x-lumina-seq': '2',
      'x-lumina-signature': computeDeviceSignature(secret, DEFAULT_DEVICE_ID, String(nowSec), validNonce, '2', rawPushBody)
    },
    rawBody: rawPushBody,
    body: pushBodyObj
  }, replayRes);
  assert(replayRes.statusCode === 401 && /Replay attack/i.test(replayRes.body.error), "Replay attack with duplicate nonce is blocked with HTTP 401");

  // 3D. Test Tampered Payload Rejection (Modified JSON body with original signature must fail 401)
  const tamperedBody = JSON.stringify({ ...pushBodyObj, status: { ...pushBodyObj.status, lock: 'UNLOCKED' } });
  const tamperRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': 'b2c3d4e5f60718293a4b5c6d7e8f9011',
      'x-lumina-seq': '3',
      'x-lumina-signature': validSig
    },
    rawBody: tamperedBody,
    body: JSON.parse(tamperedBody)
  }, tamperRes);
  assert(tamperRes.statusCode === 401, "Tampered payload with mismatched HMAC is rejected with HTTP 401");

  // 3E. Test Expired / Skewed Timestamp (>60s drift must fail 401)
  const staleTs = String(nowSec - 180);
  const staleNonce = 'c3d4e5f60718293a4b5c6d7e8f901122';
  const staleSig = computeDeviceSignature(secret, DEFAULT_DEVICE_ID, staleTs, staleNonce, '4', rawPushBody);
  const staleRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': staleTs,
      'x-lumina-nonce': staleNonce,
      'x-lumina-seq': '4',
      'x-lumina-signature': staleSig
    },
    rawBody: rawPushBody,
    body: pushBodyObj
  }, staleRes);
  assert(staleRes.statusCode === 401 && /timestamp/i.test(staleRes.body.error), "Stale timestamp (>60s drift) is rejected with HTTP 401");

  // 4. Test Dual-Tier Command Signing & TTLs (15s Physical vs 24h Admin)
  const unlockCmdRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { action: 'command', cmd: 'unlock' }
  }, unlockCmdRes);
  assert(unlockCmdRes.statusCode === 200 && unlockCmdRes.body.queued, "Admin unlock command queued successfully");
  const unlockTtl = unlockCmdRes.body.queued.expiresAt - unlockCmdRes.body.queued.issuedAt;
  assert(unlockTtl === 15, `Physical 'unlock' command enforces strict 15-second TTL (Actual: ${unlockTtl}s)`);
  assert(unlockCmdRes.body.queued.signature === signDeviceCommand(secret, unlockCmdRes.body.queued), "Queued command carries valid mutual HMAC-SHA256 signature");

  const schedCmdRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { action: 'command', cmd: 'relay3_schedule', enabled: true, on: '18:30', off: '06:15' }
  }, schedCmdRes);
  assert(schedCmdRes.statusCode === 200 && schedCmdRes.body.queued, "Admin relay3_schedule command queued");
  const schedTtl = schedCmdRes.body.queued.expiresAt - schedCmdRes.body.queued.issuedAt;
  assert(schedTtl === 86400, `Configuration 'relay3_schedule' command enforces 24-hour TTL (Actual: ${schedTtl}s)`);
  assert(schedCmdRes.body.queued.param === '1|18:30|06:15', "Schedule parameters encoded as '1|18:30|06:15'");

  // Verify identical ON/OFF schedule time is rejected with 400
  const badSchedRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { action: 'command', cmd: 'relay3_schedule', enabled: true, on: '12:00', off: '12:00' }
  }, badSchedRes);
  assert(badSchedRes.statusCode === 400, "Identical ON and OFF schedule times rejected with HTTP 400");

  // 5. Wire window.fetch to iotHandler and test all UI actions in LuminaSmartLock
  const origFetch = window.fetch;
  window.fetch = async (url, opts = {}) => {
    const mockRes = createMockRes();
    const bodyObj = opts.body ? JSON.parse(opts.body) : {};
    await iotHandler({
      method: opts.method || 'GET',
      url,
      headers: { 'x-session-id': 'sovereign_session' },
      body: bodyObj
    }, mockRes);
    return {
      ok: mockRes.statusCode >= 200 && mockRes.statusCode < 300,
      status: mockRes.statusCode,
      json: async () => mockRes.body
    };
  };

  try {
    await window.LuminaSmartLock.fetchDashboard();
    const st = window.LuminaSmartLock.getState();
    assert(st.online === true, "Dashboard detects ESP32 is ONLINE after recent heartbeat");
    assert(st.cards.length === 1 && st.cards[0].uid === '04A1B2C3', "NFC card list populated from cloud shadow");
    assert(st.cards[0].history.length === 2 && st.cards[0].count === 14, "Cloud preserves NFC card tap history & count even after ESP32 RAM purge");
    assert(st.logs.length >= 2, "Cloud logs populated from ESP32 online + offline batch");
    assert(Array.isArray(st.connHistory) && st.connHistory.length >= 2, "Cloud connHistory populated with ACTIVE (ONLINE) and OFF (OFFLINE) events");

    const connListHtml = document.getElementById('slConnHistoryList').innerHTML;
    assert(connListHtml.includes('ESP32 ACTIVE') && connListHtml.includes('ESP32 OFF'), "#slConnHistoryList renders both Green (ESP32 ACTIVE) and Red (ESP32 OFF) transition cards");

    // Verify per-card buttons rendered in #slCardsList
    assert(document.querySelector('.sl-btn-card-rename') !== null, "Per-card rename button (.sl-btn-card-rename) rendered");
    assert(document.querySelector('.sl-btn-card-toggle') !== null, "Per-card suspend/enable button (.sl-btn-card-toggle) rendered");
    assert(document.querySelector('.sl-btn-card-color') !== null, "Per-card color picker (.sl-btn-card-color) rendered");
    assert(document.querySelector('.sl-btn-card-history') !== null, "Per-card history button (.sl-btn-card-history) rendered");
    assert(document.querySelector('.sl-btn-card-remove') !== null, "Per-card delete button (.sl-btn-card-remove) rendered");

    // Test Card 100-use Cloud History Modal
    window.LuminaSmartLock.openCardHistory('04A1B2C3');
    const histModal = document.getElementById('slCardHistoryModal');
    assert(histModal.style.display === 'flex', "openCardHistory opens #slCardHistoryModal");
    assert(document.getElementById('slHistoryContent').textContent.includes('2026-10-06 22:55:10'), "History modal renders card tap timestamps");
    window.LuminaSmartLock.closeCardHistory();
    assert(histModal.style.display === 'none', "closeCardHistory closes #slCardHistoryModal");

    // Test Card Rename, Toggle, Color
    await window.LuminaSmartLock.renameCard('04A1B2C3', 'Executive Key');
    assert(window.LuminaSmartLock.getState().cards[0].name === 'Executive Key', "renameCard updates card name to 'Executive Key'");

    await window.LuminaSmartLock.toggleCard('04A1B2C3');
    assert(window.LuminaSmartLock.getState().cards[0].active === false, "toggleCard suspends active card");

    await window.LuminaSmartLock.setCardColor('04A1B2C3', '#f43f5e');
    assert(window.LuminaSmartLock.getState().cards[0].color === '#f43f5e', "setCardColor updates card color to #f43f5e");

    // Test Lock, Unlock, Alarm Clear, Relay 3/4, Enrollment
    await window.LuminaSmartLock.unlockDoor();
    assert(document.getElementById('slLockStatus').textContent === 'UNLOCKED', "unlockDoor updates #slLockStatus to UNLOCKED");

    await window.LuminaSmartLock.lockDoor();
    assert(document.getElementById('slLockStatus').textContent === 'LOCKED', "lockDoor updates #slLockStatus to LOCKED");

    await window.LuminaSmartLock.setRelay(4, 'on');
    assert(document.getElementById('slRelay4Status').textContent === 'ON', "setRelay(4, 'on') updates #slRelay4Status to ON");

    await window.LuminaSmartLock.toggleEnrollment();
    assert(window.LuminaSmartLock.getState().status.enroll === true, "toggleEnrollment arms NFC enrollment mode");

    // Test Log Search, Category Filter & Export
    window.LuminaSmartLock.setLogFilter('access');
    assert(window.LuminaSmartLock.getState().logFilter === 'access', "setLogFilter('access') filters access events");
    window.LuminaSmartLock.setLogFilter('all');

    window.LuminaSmartLock.setLogSearch('04A1B2C3');
    assert(document.getElementById('slLogsList').textContent.includes('04A1B2C3'), "setLogSearch filters logs by UID");
    window.LuminaSmartLock.setLogSearch('');

    const txtExport = window.LuminaSmartLock.exportLogs('txt');
    assert(txtExport.includes('04A1B2C3'), "exportLogs('txt') exports formatted log text");
    const csvExport = window.LuminaSmartLock.exportLogs('csv');
    assert(csvExport.includes('"Sequence","Timestamp","Source","Event"'), "exportLogs('csv') exports CSV header and rows");

    await window.LuminaSmartLock.clearConnHistory();
    assert(window.LuminaSmartLock.getState().connHistory.length === 0, "clearConnHistory clears connection timing history");

    await window.LuminaSmartLock.clearCommandQueue();
    assert(window.LuminaSmartLock.getState().pendingCommands.length === 0, "clearCommandQueue empties pending command queue");
  } finally {
    window.fetch = origFetch;
  }

  console.log("✓ ESP32 Smart Door Lock & Ultra-Secure Cloud Log Gateway sub-suite completed successfully!");
};
