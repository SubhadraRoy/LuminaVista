// tests/suite-nano-audit.cjs
// Nano-Detail Logic & Invariant Chaos Audit for Lumina Vista Sovereign Cloud OS
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

async function runNanoAudit() {
  console.log('=================================================================');
  console.log('🔬 LUMINA VISTA OS: NANO-DETAIL INVARIANT & CHAOS AUDIT HARNESS');
  console.log('=================================================================\n');

  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test_master_password_123';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_ultra_secure_12345';
  process.env.DEVICE_SECRET = process.env.DEVICE_SECRET || 'test_device_secret_ultra_secure_12345';

  let passed = 0;
  function check(desc, cond) {
    assert(cond, desc);
    passed++;
    console.log(`  ✓ PASS [NANO-${String(passed).padStart(2, '0')}]: ${desc}`);
  }

  function createMockRes() {
    return {
      statusCode: 200,
      headers: {},
      body: null,
      rawText: null,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
      send(text) { this.rawText = text; return this; },
      end(text) { if (text !== undefined) this.rawText = text; return this; }
    };
  }

  // Import API Handlers
  const authUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'auth.js')).href;
  const authMod = await import(authUrl);
  const authHandler = authMod.default;
  const { verifyCredentials } = authMod;

  const logoutUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'logout.js')).href;
  const logoutMod = await import(logoutUrl);
  const logoutHandler = logoutMod.default;

  const storageUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'storage.js')).href;
  const storageMod = await import(storageUrl);
  const storageHandler = storageMod.default;

  const syncUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'sync.js')).href;
  const syncMod = await import(syncUrl);
  const syncHandler = syncMod.default;

  const compileUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'compile.js')).href;
  const compileMod = await import(compileUrl);
  const compileHandler = compileMod.default;

  const terminalUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'terminal.js')).href;
  const terminalMod = await import(terminalUrl);
  const terminalHandler = terminalMod.default;

  const workerUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'worker.js')).href;
  const workerMod = await import(workerUrl);
  const workerHandler = workerMod.default;

  const iotUrl = pathToFileURL(path.join(__dirname, '..', 'api', 'iot.js')).href;
  const iotMod = await import(iotUrl);
  const iotHandler = iotMod.default;
  const { computeDeviceSignature, DEFAULT_DEVICE_ID, getDeviceSecret } = iotMod;

  const adblockModUrl = pathToFileURL(path.join(__dirname, '..', 'api', '_lib', 'adblock-gateway.js')).href;
  const adblockMod = await import(adblockModUrl);
  const { isValidIpv4, sanitizeClientAlias, sanitizeDomain } = adblockMod;

  const jevUrl = pathToFileURL(path.join(__dirname, '..', 'api', '_lib', 'jev-engine.js')).href;
  const jevMod = await import(jevUrl);
  const { jevClassifyIntent, jevAsk } = jevMod;

  const redisUrl = pathToFileURL(path.join(__dirname, '..', 'api', '_lib', 'redis.js')).href;
  const redisMod = await import(redisUrl);
  const { getSafeStorage } = redisMod;
  const storage = getSafeStorage();

  const authGuardUrl = pathToFileURL(path.join(__dirname, '..', 'api', '_lib', 'auth-guard.js')).href;
  const authGuardMod = await import(authGuardUrl);
  const { generateSovereignSessionToken } = authGuardMod;

  // -------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & CREDENTIAL VERIFICATION LOGIC
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: Auth & Session Micro-Logic ---');

  // Verify empty, null, and non-string password handling
  const emptyRes1 = await verifyCredentials('');
  check('Empty password returns authenticated: false', emptyRes1.authenticated === false);

  const nullRes = await verifyCredentials(null);
  check('Null password returns authenticated: false', nullRes.authenticated === false);

  const numRes = await verifyCredentials(123456);
  check('Non-string password returns authenticated: false', numRes.authenticated === false);

  // POST /api/auth with invalid body
  const badAuthRes = createMockRes();
  await authHandler({ method: 'POST', body: { password: 'wrong_password_xyz_99' } }, badAuthRes);
  check('Bad credentials rejected with HTTP 401', badAuthRes.statusCode === 401);

  // POST /api/logout
  const logoutRes = createMockRes();
  await logoutHandler({ method: 'POST', headers: { 'x-session-id': 'session_to_kill' } }, logoutRes);
  check('Logout returns HTTP 200 and tombstones session', logoutRes.statusCode === 200 && logoutRes.body.success === true);

  // -------------------------------------------------------------------------
  // SECTION 2: STORAGE & VFS INPUT SANITIZATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Storage & VFS Micro-Logic ---');

  const traversalPaths = [
    '..',
    '../test.js',
    '..\\test.js',
    'subdir/../../../secret',
    'foo/bar/../../../../etc/passwd',
    'test%2e%2e%2f',
    'test\0.txt',
    'test\r\n.txt',
    '.git/config',
    'node_modules/evil.js',
    'package.json',
    'dashboard.html',
    'api/auth.js',
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'LPT1'
  ];

  for (const p of traversalPaths) {
    const res = createMockRes();
    await storageHandler({
      method: 'POST',
      headers: { 'x-session-id': 'sovereign_session' },
      body: { action: 'read', path: p }
    }, res);
    check(`Path traversal probe '${p}' blocked with HTTP 400`, res.statusCode === 400);
  }

  // Storage payload size bounding on POST
  const hugeStorageRes = createMockRes();
  await storageHandler({
    method: 'POST',
    url: '/api/storage',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { path: 'valid_test.txt', content: 'X'.repeat(5500000) } // > 5MB limit
  }, hugeStorageRes);
  check('Oversized storage payload (>5MB) rejected with HTTP 400 or 413',
    hugeStorageRes.statusCode === 400 || hugeStorageRes.statusCode === 413);

  // -------------------------------------------------------------------------
  // SECTION 3: WORKSPACE STATE SYNC & ACCESS BOUNDARIES
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Workspace State Sync Micro-Logic ---');

  // GET /api/sync with valid session returns state
  const syncGetRes = createMockRes();
  await syncHandler({ method: 'GET', headers: { 'x-session-id': 'sovereign_session' } }, syncGetRes);
  check('Sync GET returns HTTP 200 and valid JSON state', syncGetRes.statusCode === 200 && syncGetRes.body.success === true);

  // POST /api/sync with temporary role session is blocked
  const tempToken = generateSovereignSessionToken('temporary');
  await storage.set(`session:${tempToken}`, JSON.stringify({ sessionId: tempToken, role: 'temporary', status: 'active' }));
  const tempSyncRes = createMockRes();
  await syncHandler({
    method: 'POST',
    headers: { 'x-session-id': tempToken },
    body: { workspace: { activeTab: 'hacked' } }
  }, tempSyncRes);
  check('Temporary session mutating shared sync state blocked with HTTP 403', tempSyncRes.statusCode === 403);

  // -------------------------------------------------------------------------
  // SECTION 4: CODE COMPILER & TERMINAL EXECUTION SANDBOX
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Compiler & Terminal Execution Sandbox ---');

  // POST /api/compile without session returns 401
  const compNoAuthRes = createMockRes();
  await compileHandler({
    method: 'POST',
    headers: { 'x-unauthenticated': 'true' },
    body: { language: 'javascript', code: 'console.log(1);' }
  }, compNoAuthRes);
  check('Compiler rejects unauthenticated requests with HTTP 401', compNoAuthRes.statusCode === 401);

  // POST /api/compile with dangerous code triggers Jev Guardrails (HTTP 403)
  const compDangerRes = createMockRes();
  await compileHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { language: 'bash', code: 'rm -rf / --no-preserve-root' }
  }, compDangerRes);
  check('Compiler blocks dangerous payloads via Jev System-1 Guardrails with HTTP 403', compDangerRes.statusCode === 403);

  // POST /api/compile with oversized code (>100KB)
  const compHugeRes = createMockRes();
  await compileHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { language: 'javascript', code: 'x'.repeat(120000) }
  }, compHugeRes);
  check('Compiler blocks oversized code (>100KB) with HTTP 413', compHugeRes.statusCode === 413);

  // POST /api/compile without E2B_API_KEY returns graceful 500 error
  const compGracefulRes = createMockRes();
  await compileHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { language: 'javascript', code: 'console.log(42);' }
  }, compGracefulRes);
  check('Compiler handles missing cloud execution key gracefully with HTTP 500 without crashing',
    compGracefulRes.statusCode === 500 && compGracefulRes.body.error);

  // POST /api/terminal unauthenticated check
  const termNoAuthRes = createMockRes();
  await terminalHandler({
    method: 'POST',
    headers: { 'x-unauthenticated': 'true' },
    body: { command: 'echo test' }
  }, termNoAuthRes);
  check('Terminal rejects unauthenticated requests with HTTP 401', termNoAuthRes.statusCode === 401);

  // POST /api/terminal dangerous command blocked by Jev Guardrail
  const termDangerRes = createMockRes();
  await terminalHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { command: 'mkfs.ext4 /dev/sda1' }
  }, termDangerRes);
  check('Terminal blocks dangerous disk format commands via Jev Guardrails with HTTP 403', termDangerRes.statusCode === 403);

  // POST /api/terminal safe command handles missing E2B_API_KEY gracefully
  const termRes = createMockRes();
  await terminalHandler({
    method: 'POST',
    headers: { 'x-session-id': 'sovereign_session' },
    body: { command: 'echo lumina_terminal_test' }
  }, termRes);
  check('Terminal handles missing cloud execution key gracefully with HTTP 500 without crashing',
    termRes.statusCode === 500 && termRes.body.error);

  // -------------------------------------------------------------------------
  // SECTION 5: WORKER QUEUE BOLA/IDOR ACCESS CONTROL
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Worker Queue BOLA/IDOR Security ---');

  const ownerSid = 'session_worker_owner_01';
  await storage.set(`session:${ownerSid}`, JSON.stringify({ sessionId: ownerSid, role: 'master', status: 'active' }));
  const attackerSid = 'session_worker_attacker_02';
  await storage.set(`session:${attackerSid}`, JSON.stringify({ sessionId: attackerSid, role: 'temporary', status: 'active' }));

  // Missing jobId rejected with HTTP 400
  const noJobIdRes = createMockRes();
  await workerHandler({
    method: 'POST',
    headers: { 'x-session-id': ownerSid },
    body: { prompt: 'do work' }
  }, noJobIdRes);
  check('Worker rejects missing jobId with HTTP 400', noJobIdRes.statusCode === 400);

  // Seed job in storage owned by ownerSid
  const targetJobId = 'job_nano_owner_101';
  await storage.set(`job_state:${targetJobId}`, JSON.stringify({
    id: targetJobId,
    ownerSessionId: ownerSid,
    ownerRole: 'master',
    status: 'completed',
    reply: 'SECRET_CONFIDENTIAL_OUTPUT'
  }));

  // Session B attempts to read Session A's job status (BOLA)
  const bolaRes = createMockRes();
  await workerHandler({
    method: 'GET',
    url: `/api/worker?action=status&jobId=${targetJobId}`,
    query: { action: 'status', jobId: targetJobId },
    headers: { 'x-session-id': attackerSid }
  }, bolaRes);
  check('Cross-session job inspection rejected with HTTP 403 (BOLA prevention)',
    bolaRes.statusCode === 403);

  // -------------------------------------------------------------------------
  // SECTION 6: IOT SMART LOCK & TELEMETRY PROTOCOL HARMONY
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 6: IoT Door Lock Protocol Harmony ---');

  const secret = getDeviceSecret();
  const nowSec = Math.floor(Date.now() / 1000);

  // Malformed signature length checks (63 chars and 65 chars)
  const shortSigRes = createMockRes();
  await iotHandler({
    method: 'POST',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': crypto.randomBytes(16).toString('hex'),
      'x-lumina-seq': '5000',
      'x-lumina-signature': 'a'.repeat(63) // Malformed length
    },
    rawBody: '{}',
    body: {}
  }, shortSigRes);
  check('Short signature (63 chars) rejected with HTTP 401', shortSigRes.statusCode === 401);

  const longSigRes = createMockRes();
  await iotHandler({
    method: 'POST',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': crypto.randomBytes(16).toString('hex'),
      'x-lumina-seq': '5001',
      'x-lumina-signature': 'a'.repeat(65) // Malformed length
    },
    rawBody: '{}',
    body: {}
  }, longSigRes);
  check('Long signature (65 chars) rejected with HTTP 401', longSigRes.statusCode === 401);

  // Nonce with illegal characters
  const badNonceRes = createMockRes();
  await iotHandler({
    method: 'POST',
    headers: {
      'x-lumina-device-id': DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': 'illegal_nonce_@#$!',
      'x-lumina-seq': '5002',
      'x-lumina-signature': '0'.repeat(64)
    },
    rawBody: '{}',
    body: {}
  }, badNonceRes);
  check('Illegal nonce format rejected with HTTP 401', badNonceRes.statusCode === 401);

  // -------------------------------------------------------------------------
  // SECTION 7: ESP32 ADBLOCKER MICRO-VALIDATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 7: ESP32 AdBlocker Gateway Micro-Validation ---');

  // Domain sanitization boundaries
  check('sanitizeDomain strips protocol prefix', sanitizeDomain('https://adservice.google.com/') === 'adservice.google.com');
  check('sanitizeDomain strips trailing slashes and paths', sanitizeDomain('tracker.com/track/pixel') === 'tracker.com');
  check('sanitizeDomain removes port numbers', sanitizeDomain('ads.example.com:8080') === 'ads.example.com');
  check('sanitizeDomain blocks directory traversal', sanitizeDomain('../../../evil.com') === '');
  check('sanitizeDomain blocks invalid chars', sanitizeDomain('evil;drop table;com') === '');

  // IPv4 validation edge cases
  check('isValidIpv4 accepts 0.0.0.0 (DNS sinkhole IP)', isValidIpv4('0.0.0.0') === true);
  check('isValidIpv4 accepts 1.1.1.1', isValidIpv4('1.1.1.1') === true);
  check('isValidIpv4 accepts 192.168.1.1', isValidIpv4('192.168.1.1') === true);
  check('isValidIpv4 rejects 192.168.1.256', isValidIpv4('192.168.1.256') === false);
  check('isValidIpv4 rejects 192.168.01.1', isValidIpv4('192.168.01.1') === false);
  check('isValidIpv4 rejects leading spaces', isValidIpv4(' 192.168.1.1') === false);
  check('isValidIpv4 rejects trailing newline', isValidIpv4('192.168.1.1\n') === false);

  // Client alias sanitization
  check('sanitizeClientAlias preserves clean alphanumeric with spaces and dashes',
    sanitizeClientAlias('Living-Room Smart TV') === 'Living-Room Smart TV');
  check('sanitizeClientAlias removes <script> tags and non-alphanumeric punctuation',
    sanitizeClientAlias('<script>alert(1)</script>TV') === 'scriptalert1scriptTV');
  check('sanitizeClientAlias clamps to 31 chars',
    sanitizeClientAlias('A'.repeat(50)).length === 31);

  // -------------------------------------------------------------------------
  // SECTION 8: JEV COGNITIVE ENGINE PERFORMANCE & CACHE SANITY
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 8: JEV Engine Micro-Logic & Performance ---');

  // Warm up JIT compiler
  for (let i = 0; i < 10; i++) {
    jevClassifyIntent('warmup query ' + i);
    jevClassifyIntent('create event meeting tomorrow ' + i);
  }

  const jevT0 = performance.now();
  const jevRes1 = jevClassifyIntent('reschedule architecture sync to tomorrow 4pm');
  const jevLatency = performance.now() - jevT0;
  check(`JEV intent classification completes in < 15ms (Actual: ${jevLatency.toFixed(3)}ms)`, jevLatency < 15.0);
  check('JEV identifies SCHEDULE_CALENDAR intent route',
    jevRes1 && jevRes1.route === 'SCHEDULE_CALENDAR');

  const jevT1 = performance.now();
  const jevRes2 = jevClassifyIntent('reschedule architecture sync to tomorrow 4pm');
  const jevCacheLatency = performance.now() - jevT1;
  check(`JEV L0 cache hit latency < 0.5ms (Actual: ${jevCacheLatency.toFixed(3)}ms)`, jevCacheLatency < 0.5);
  check('JEV returns cached: true on duplicate query', jevRes2.cached === true);

  console.log('\n=================================================================');
  console.log(`🎉 NANO-AUDIT COMPLETE: ${passed}/${passed} ASSERTIONS PASSED WITH ZERO ERRORS!`);
  console.log('=================================================================\n');
}

runNanoAudit().catch(err => {
  console.error('\n❌ NANO-AUDIT FAILED:', err);
  process.exit(1);
});
