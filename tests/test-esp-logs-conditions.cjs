// tests/test-esp-logs-conditions.cjs
// Comprehensive Stress & Condition Verification Suite for ESP32 Logs in LuminaVista OS
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

async function run() {
  console.log('================================================================');
  console.log('🔬 LUMINA VISTA OS: ESP32 LOGS COMPREHENSIVE CONDITION AUDIT');
  console.log('================================================================\n');

  const iotModuleUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'iot.js')).href;
  const iotMod = await import(iotModuleUrl);
  const {
    DEFAULT_DEVICE_ID,
    MAX_CLOUD_LOGS,
    MAX_CARD_HISTORY,
    MAX_CONN_HISTORY,
    KEY_LOGS,
    KEY_CONN_HISTORY,
    KEY_CARDS,
    KEY_META,
    KEY_STATE,
    getDeviceSecret,
    computeDeviceSignature,
    signDeviceCommand,
    default: iotHandler
  } = iotMod;

  const secret = getDeviceSecret();

  function createMockRes() {
    return {
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
  }

  let currentSeq = 1000;
  async function sendEspPush(bodyObj) {
    currentSeq++;
    const nowSec = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    const rawBody = JSON.stringify(bodyObj);
    const sig = computeDeviceSignature(secret, DEFAULT_DEVICE_ID, String(nowSec), nonce, String(currentSeq), rawBody);

    const res = createMockRes();
    await iotHandler({
      method: 'POST',
      url: '/api/iot',
      headers: {
        'x-lumina-device-id': DEFAULT_DEVICE_ID,
        'x-lumina-timestamp': String(nowSec),
        'x-lumina-nonce': nonce,
        'x-lumina-seq': String(currentSeq),
        'x-lumina-signature': sig
      },
      rawBody,
      body: bodyObj
    }, res);
    return res;
  }

  async function getDashboardData() {
    const res = createMockRes();
    await iotHandler({
      method: 'GET',
      url: '/api/iot?action=dashboard',
      headers: { 'x-session-id': 'sovereign_session' }
    }, res);
    return res;
  }

  // Clear existing test logs for clean baseline
  const clearRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { action: 'clear_logs' }
  }, clearRes);
  assert(clearRes.statusCode === 200, 'Baseline: clear_logs succeeds');

  const clearConnRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { action: 'clear_conn_history' }
  }, clearConnRes);
  assert(clearConnRes.statusCode === 200, 'Baseline: clear_conn_history succeeds');

  console.log('✅ Baseline initialized.\n');

  // --------------------------------------------------------------------------
  // CONDITION 1: Live Streaming Normal Operation
  // --------------------------------------------------------------------------
  console.log('--- CONDITION 1: Live Streaming Normal Operation ---');
  const liveLogs = [
    { seq: 1, ts: '2026-10-08 17:00:01', msg: 'System initialized @ boot', source: 'live' },
    { seq: 2, ts: '2026-10-08 17:00:05', msg: 'Wi-Fi Connected IP: 192.168.1.105 RSSI: -42', source: 'live' },
    { seq: 3, ts: '2026-10-08 17:00:10', msg: 'NFC Reader PN532 Initialized in SPI mode', source: 'live' }
  ];
  const push1 = await sendEspPush({ status: { lock: 'LOCKED', door: 'CLOSED' }, logs: liveLogs });
  assert(push1.statusCode === 200, 'Push 1 status 200 OK');
  assert(push1.body.ackedLogSeq === 3, 'Push 1 ackedLogSeq is 3');

  const dash1 = await getDashboardData();
  assert(dash1.body.logs.length >= 3, 'Dashboard holds live logs');
  // Check LAN protection
  const wifiLog = dash1.body.logs.find(l => l.msg && l.msg.includes('Wi-Fi Connected'));
  assert(wifiLog && wifiLog.msg.includes('[LAN-PROTECTED]'), 'Condition 1: LAN IP masked to [LAN-PROTECTED]');
  console.log(`  ✓ Successfully held ${liveLogs.length} live logs with IP sanitization & acked sequence #${push1.body.ackedLogSeq}`);

  // --------------------------------------------------------------------------
  // CONDITION 2: Offline Outage & Reconnect Batch Flush
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 2: Network Outage & Offline RAM Buffer Flush ---');
  // While offline, ESP32 buffered 10 events, then flushes them upon reconnect
  const offlineFlushBatch = [];
  for (let i = 4; i <= 15; i++) {
    offlineFlushBatch.push({
      seq: i,
      ts: `2026-10-08 17:01:${String(i).padStart(2, '0')}`,
      msg: `Offline Event #${i}: Door state change recorded in hardware RAM buffer`,
      source: 'offline_buffer'
    });
  }
  const push2 = await sendEspPush({
    status: { lock: 'LOCKED', door: 'OPEN' },
    logs: offlineFlushBatch,
    connEvents: [
      { seq: 1, type: 'OFFLINE', ts: '2026-10-08 17:00:45', reason: 'Wi-Fi AP Beacon Lost' },
      { seq: 2, type: 'ONLINE', ts: '2026-10-08 17:01:50', reason: 'Re-authenticated to SSID' }
    ]
  });
  assert(push2.statusCode === 200, 'Push 2 status 200 OK');
  assert(push2.body.ackedLogSeq === 15, 'Push 2 ackedLogSeq is 15');
  assert(push2.body.ackedConnSeq === 2, 'Push 2 ackedConnSeq is 2');

  const dash2 = await getDashboardData();
  const flushedLogs = dash2.body.logs.filter(l => l.source === 'offline_buffer');
  assert(flushedLogs.length === 12, `All 12 offline buffered logs held (Actual: ${flushedLogs.length})`);
  console.log(`  ✓ Successfully absorbed ${offlineFlushBatch.length} offline-buffered logs and ${push2.body.ackedConnSeq} connection transition events`);

  // --------------------------------------------------------------------------
  // CONDITION 3: Deduplication & Re-transmission Handling
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 3: Deduplication & Re-transmission Handling ---');
  // ESP32 re-sends logs 12..15 in case the ACK was dropped in transit
  const duplicateLogs = offlineFlushBatch.slice(-4);
  const beforeCount = dash2.body.logs.length;
  const push3 = await sendEspPush({ logs: duplicateLogs });
  assert(push3.statusCode === 200, 'Push 3 status 200 OK');
  const dash3 = await getDashboardData();
  assert(dash3.body.logs.length === beforeCount, `Duplicate logs deduplicated: log count remained ${beforeCount}`);
  console.log(`  ✓ Zero duplicate pollution: duplicate retransmissions cleanly deduplicated`);

  // --------------------------------------------------------------------------
  // CONDITION 4: ESP32 Hardware Reboot & boot+ Relative Timestamp Recovery
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 4: ESP32 Reboot & Relative boot+ Timestamp Recovery ---');
  const bootLogs = [
    { seq: 16, ts: 'boot+1200ms', msg: 'Cold boot reset cause: Power-On Reset (POR) @ boot+1200ms', source: 'live' },
    { seq: 17, ts: 'boot+3500ms', msg: 'SNTP synchronization acquired @ boot+3500ms', source: 'live' }
  ];
  const push4 = await sendEspPush({ logs: bootLogs });
  assert(push4.statusCode === 200, 'Push 4 status 200 OK');
  const dash4 = await getDashboardData();
  const b1 = dash4.body.logs.find(l => l.seq === 16);
  assert(b1 && !b1.ts.includes('boot+'), 'boot+ timestamp was resolved to real clock timestamp');
  console.log(`  ✓ Hardware boot+ relative timestamps successfully mapped to real-time clock: "${b1.ts}"`);

  // --------------------------------------------------------------------------
  // CONDITION 5: Additive NFC Card History Persistence Across RAM Purges
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 5: Additive NFC Card History Across RAM Purges ---');
  // Step 1: Card taps recorded
  const cardPush = await sendEspPush({
    cards: [
      {
        uid: 'E2A0114B',
        name: 'Master Pass',
        active: true,
        count: 5,
        last: '2026-10-08 17:05:00',
        history: ['2026-10-08 17:01:00', '2026-10-08 17:03:00', '2026-10-08 17:05:00']
      }
    ],
    logs: [
      { seq: 18, ts: '2026-10-08 17:05:00', msg: 'UNLOCK: NFC-MasterPass: E2A0114B', source: 'live' }
    ]
  });
  assert(cardPush.statusCode === 200, 'Card push status 200');

  // Step 2: ESP32 reboots and sends empty card history
  const ramWipedPush = await sendEspPush({
    cards: [
      { uid: 'E2A0114B', name: 'Master Pass', active: true, count: 0, last: '-', history: [] }
    ]
  });
  assert(ramWipedPush.statusCode === 200, 'RAM wiped card push status 200');

  const dash5 = await getDashboardData();
  const card = dash5.body.cards.find(c => c.uid === 'E2A0114B');
  assert(card && card.history.length === 3, `Cloud preserves all 3 card taps even after ESP32 RAM wipe (Actual: ${card?.history?.length})`);
  assert(card.count >= 5, `Cloud preserves usage count (Actual: ${card?.count})`);
  console.log(`  ✓ Card tap history 100% preserved after MCU RAM purge: ${card.history.length} taps, count: ${card.count}`);

  // --------------------------------------------------------------------------
  // CONDITION 6: Malformed, Extreme Length & Special Character Robustness
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 6: Special Character & Length Bounding Robustness ---');
  const extremeLogMsg = 'X'.repeat(500) + ' <script>alert("xss")</script> \x00\x1b[31mTerminal';
  const push6 = await sendEspPush({
    logs: [
      { seq: 19, ts: '2026-10-08 17:06:00', msg: extremeLogMsg, source: 'live' },
      '2026-10-08 17:06:05 | Raw string formatted log line without object wrapping'
    ]
  });
  assert(push6.statusCode === 200, 'Push 6 status 200');
  const dash6 = await getDashboardData();
  const boundedLog = dash6.body.logs.find(l => l.seq === 19);
  assert(boundedLog && boundedLog.msg.length <= 200, `Extreme log message bounded to <= 200 chars (Actual: ${boundedLog?.msg?.length})`);
  const rawStringLog = dash6.body.logs.find(l => l.msg && l.msg.includes('Raw string formatted'));
  assert(rawStringLog !== undefined, 'Raw string formatted log parsed correctly');
  console.log(`  ✓ 500-char extreme log safely bounded to ${boundedLog.msg.length} characters without crash`);

  // --------------------------------------------------------------------------
  // CONDITION 7: CAPACITY LIMITS & OVERFLOW VERIFICATION (MAX_CLOUD_LOGS = 2000)
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 7: Capacity Limit & FIFO Bounded Buffer Verification ---');
  console.log(`  Target Limit: MAX_CLOUD_LOGS = ${MAX_CLOUD_LOGS}`);

  // Push 2,500 logs in batches of 250 to test overflow and limit containment
  console.log('  Generating 2,500 logs to intentionally exceed the 2,000 capacity limit...');
  const totalToGenerate = 2500;
  const batchSize = 250;
  let runningSeq = 20;

  for (let batchStart = 0; batchStart < totalToGenerate; batchStart += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize; j++) {
      const s = runningSeq++;
      batch.push({
        seq: s,
        ts: `2026-10-08 17:10:${String(j % 60).padStart(2, '0')}`,
        msg: `High-frequency telemetry event seq #${s} [stress-test load]`,
        source: 'live'
      });
    }
    const res = await sendEspPush({ logs: batch });
    assert(res.statusCode === 200, `Batch at seq ${runningSeq} pushed successfully`);
  }

  const dashFinal = await getDashboardData();
  const finalLogCount = dashFinal.body.logs.length;
  console.log(`  ✓ Logs stored in Cloud: ${finalLogCount} (Strict Limit: ${MAX_CLOUD_LOGS})`);
  assert(finalLogCount <= MAX_CLOUD_LOGS, `Log count must NEVER exceed MAX_CLOUD_LOGS (Actual: ${finalLogCount})`);
  assert(finalLogCount === MAX_CLOUD_LOGS, `Log buffer must be exactly at max capacity ${MAX_CLOUD_LOGS}`);

  // Verify FIFO integrity: newest seq should be at the top, oldest should have rolled off
  const topSeq = dashFinal.body.logs[0].seq;
  const bottomSeq = dashFinal.body.logs[dashFinal.body.logs.length - 1].seq;
  console.log(`  ✓ FIFO Retention Check: Newest seq #${topSeq} -> Oldest retained seq #${bottomSeq}`);
  assert(topSeq === runningSeq - 1, `Newest seq must be highest generated (#${runningSeq - 1})`);
  assert(bottomSeq > 1, `Oldest logs < #${bottomSeq} safely rolled off according to FIFO ring buffer`);

  // --------------------------------------------------------------------------
  // CONDITION 8: CONNECTION TIMING CAPACITY LIMIT (MAX_CONN_HISTORY = 500)
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 8: Connection Timing Limit Verification (MAX_CONN_HISTORY = 500) ---');
  // Generate 600 connection events
  const connBatch1 = [];
  for (let c = 1; c <= 300; c++) {
    connBatch1.push({ seq: c * 2 - 1, type: 'OFFLINE', ts: `2026-10-08 17:20:${String(c % 60).padStart(2, '0')}`, reason: `Drop #${c}` });
    connBatch1.push({ seq: c * 2, type: 'ONLINE', ts: `2026-10-08 17:20:${String((c+1) % 60).padStart(2, '0')}`, reason: `Reconnect #${c}` });
  }
  const pushConn = await sendEspPush({ connEvents: connBatch1 });
  assert(pushConn.statusCode === 200, 'Push connEvents status 200');

  const dashConn = await getDashboardData();
  const finalConnCount = dashConn.body.connHistory.length;
  console.log(`  ✓ Connection events stored: ${finalConnCount} (Strict Limit: ${MAX_CONN_HISTORY})`);
  assert(finalConnCount <= MAX_CONN_HISTORY, `Connection history must NEVER exceed MAX_CONN_HISTORY (Actual: ${finalConnCount})`);
  assert(finalConnCount === MAX_CONN_HISTORY, `Connection history is bounded at ${MAX_CONN_HISTORY}`);

  // --------------------------------------------------------------------------
  // CONDITION 9: CARD TAP HISTORY CAPACITY LIMIT (MAX_CARD_HISTORY = 100)
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 9: Card Tap History Limit Verification (MAX_CARD_HISTORY = 100) ---');
  const manyTaps = [];
  for (let t = 1; t <= 150; t++) {
    manyTaps.push(`2026-10-08 17:30:${String(t % 60).padStart(2, '0')}.${String(t).padStart(3, '0')}`);
  }
  const pushTaps = await sendEspPush({
    cards: [
      { uid: 'E2A0114B', name: 'Master Pass', active: true, count: 150, last: manyTaps[0], history: manyTaps }
    ]
  });
  assert(pushTaps.statusCode === 200, 'Push taps status 200');

  const dashTaps = await getDashboardData();
  const testCard = dashTaps.body.cards.find(c => c.uid === 'E2A0114B');
  console.log(`  ✓ Card taps stored: ${testCard.history.length} (Strict Limit: ${MAX_CARD_HISTORY})`);
  assert(testCard.history.length <= MAX_CARD_HISTORY, `Card tap history must NEVER exceed ${MAX_CARD_HISTORY} (Actual: ${testCard.history.length})`);
  assert(testCard.history.length === MAX_CARD_HISTORY, `Card tap history is exactly bounded at ${MAX_CARD_HISTORY}`);

  // --------------------------------------------------------------------------
  // CONDITION 10: PAYLOAD OVERSIZE REJECTION (>250KB)
  // --------------------------------------------------------------------------
  console.log('\n--- CONDITION 10: Payload Oversize Rejection (>250KB) ---');
  const hugeBodyStr = JSON.stringify({ huge: 'A'.repeat(260000) });
  const hugeRes = createMockRes();
  await iotHandler({
    method: 'POST',
    url: '/api/iot',
    headers: {
      'x-lumina-signature': 'fakesig',
      'content-length': String(Buffer.byteLength(hugeBodyStr))
    },
    rawBody: hugeBodyStr,
    body: JSON.parse(hugeBodyStr)
  }, hugeRes);
  assert(hugeRes.statusCode === 413, `Oversized payload rejected with HTTP 413 (Actual: ${hugeRes.statusCode})`);
  console.log('  ✓ Oversized payload (>250KB) immediately blocked with HTTP 413 Payload Too Large');

  console.log('\n================================================================');
  console.log('🎉 AUDIT COMPLETE: ALL 10 CONDITIONS & LIMITS RIGOROUSLY VERIFIED!');
  console.log('================================================================');
}

run().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
