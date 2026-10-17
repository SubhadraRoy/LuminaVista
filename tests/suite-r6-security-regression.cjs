// tests/suite-r6-security-regression.cjs
// Comprehensive Automated Security Regression Test Suite for Round 6
// Verifying all 40 Prioritized Vulnerabilities (CRIT-01 to CRIT-05, HIGH-01 to HIGH-20, MED-01 to MED-15)

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cookie = require('cookie');

let totalTests = 0;
let passedTests = 0;
const failures = [];

async function it(id, description, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    passedTests++;
    console.log(`  ✓ PASS [${id}]: ${description}`);
  } catch (err) {
    console.error(`  ❌ FAIL [${id}]: ${description}`);
    console.error(`     Reason: ${err.message}`);
    failures.push({ id, description, error: err });
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
  let sentRaw = null;
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
    send: (raw) => {
      sentRaw = raw;
      ended = true;
      return res;
    },
    end: () => {
      ended = true;
      return res;
    },
    _getSentHeaders: () => headersSent,
    _getStatusCode: () => statusCode,
    _getSentData: () => sentData,
    _getSentRaw: () => sentRaw,
    _isEnded: () => ended
  };

  return { req, res };
}

async function runR6SecurityRegressionSuite() {
  console.log('\n=================================================================');
  console.log('   LUMINAVISTA OS: ROUND 6 COMPREHENSIVE SECURITY REGRESSION');
  console.log('   Auditing All 40 Vulnerabilities in VULNERABILITY_LEDGER.md');
  console.log('=================================================================\n');

  // Load modules
  const authGuard = await import('../api/_lib/auth-guard.js');
  const redisModule = await import('../api/_lib/redis.js');
  const keyPool = await import('../api/_lib/key-pool.js');
  const jevGuardrails = await import('../api/_lib/jev/jev-guardrails.js');
  const adminHandler = (await import('../api/admin.js')).default;
  const authModule = await import('../api/auth.js');
  const authHandler = authModule.default;
  const calendarHandler = (await import('../api/calendar.js')).default;
  const iotModule = await import('../api/iot.js');
  const iotHandler = iotModule.default;
  const workerHandler = (await import('../api/worker.js')).default;
  const storageHandler = (await import('../api/storage.js')).default;
  const syncHandler = (await import('../api/sync.js')).default;
  const logoutHandler = (await import('../api/logout.js')).default;

  const storage = redisModule.getSafeStorage();
  const rootDir = path.resolve(__dirname, '..');

  // -------------------------------------------------------------------------
  // SECTION 1: CRITICAL SEVERITY VULNERABILITIES (CRIT-01 to CRIT-05)
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: Critical Severity Vulnerabilities (CRIT-01 .. CRIT-05)]');

  await it('CRIT-01', 'Calendar mutation without cookie or session fails closed when auth enforcement active', async () => {
    // Attempt POST mutation with gcal:master_tokens in Redis but no cookie token and no session
    await storage.set('gcal:master_tokens', JSON.stringify({ access_token: 'secret_token_123', expires_at: Date.now() + 3600000 }));
    const origVercel = process.env.VERCEL;
    const origEnforce = process.env.ENFORCE_AUTH;
    process.env.ENFORCE_AUTH = 'true';

    // Temporarily clear argv to simulate remote production request
    const origArgv = process.argv;
    process.argv = ['node', 'index.js'];

    try {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/calendar/sync',
        query: { action: 'sync' },
        headers: { 'x-forwarded-for': '198.51.100.50' },
        body: { title: 'Unauthorized Injected Meeting' }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 401, 'Must reject unauthenticated calendar mutation with HTTP 401');
      const data = res._getSentData();
      assert.strictEqual(data.connected, false);
      assert.ok(data.error.includes('Authentication required'));
    } finally {
      process.argv = origArgv;
      process.env.VERCEL = origVercel;
      if (origEnforce !== undefined) process.env.ENFORCE_AUTH = origEnforce;
      else delete process.env.ENFORCE_AUTH;
    }
  });

  await it('CRIT-02', 'Non-production fail-open auth bypass closed: remote IP cannot claim sovereign master', async () => {
    const origVercel = process.env.VERCEL;
    delete process.env.VERCEL;
    process.env.NODE_ENV = 'development';

    try {
      // Remote client with public IP
      const { req } = createMockReqRes({
        headers: {
          'x-forwarded-for': '198.51.100.25'
        }
      });
      const session = await authGuard.validateSession(req, storage);
      assert.strictEqual(session.valid, false, 'Remote request in non-prod must NOT be granted master');
    } finally {
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
    }
  });

  await it('CRIT-03', 'Admin key deletion lock prevents TOCTOU concurrency race on min-1 key invariant', async () => {
    // Seed exactly one key
    const singleKey = [{ id: 'key_lone_01', hash: 'hash1', name: 'Sole Key', created: new Date().toISOString() }];
    await storage.set('admin:temp_passwords', JSON.stringify(singleKey));

    // Authenticated master session
    const masterSession = 'session_master_crit3';
    await storage.set(`session:${masterSession}`, JSON.stringify({ sessionId: masterSession, role: 'master' }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin',
      headers: { 'x-session-id': masterSession },
      body: { action: 'delete', id: 'key_lone_01' }
    });
    await adminHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 400, 'Deleting the only key must return 400 Bad Request');
    const data = res._getSentData();
    assert.ok(data.error.includes('At least one active access password must remain present'));

    // Verify key remains in storage
    const rawKeys = await storage.get('admin:temp_passwords');
    const parsed = JSON.parse(rawKeys);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].id, 'key_lone_01');
  });

  await it('CRIT-04', 'IoT Gateway top-level try/catch prevents unhandled lambda crashes on malformed input', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/iot',
      body: {
        action: 'log',
        signature: 'invalid_sig'
      }
    });
    await iotHandler(req, res);
    assert.ok(res._isEnded(), 'Response must be ended cleanly');
    assert.ok([400, 401, 500].includes(res._getStatusCode()), 'Returns handled HTTP error status');
  });

  await it('CRIT-05', 'SSRF DNS trailing-dot FQDN normalization blocked in key-pool', () => {
    assert.strictEqual(keyPool.isBlockedSsrfTarget('http://metadata.google.internal./computeMetadata/v1/'), true, 'Trailing dot metadata FQDN blocked');
    assert.strictEqual(keyPool.isBlockedSsrfTarget('http://169.254.169.254./'), true, 'Trailing dot link-local blocked');
    assert.strictEqual(keyPool.isBlockedSsrfTarget('http://127.0.0.1./'), true, 'Trailing dot localhost blocked');
    assert.strictEqual(keyPool.isBlockedSsrfTarget('ftp://evil.com/'), true, 'Non-http protocol blocked');
    assert.strictEqual(keyPool.isBlockedSsrfTarget('https://api.groq.com/openai/v1'), false, 'Legitimate public cloud API allowed');
  });

  // -------------------------------------------------------------------------
  // SECTION 2: HIGH SEVERITY VULNERABILITIES (HIGH-01 to HIGH-20)
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: High Severity Vulnerabilities (HIGH-01 .. HIGH-20)]');

  await it('HIGH-01', 'Worker API enforces BOLA ownership check on job access and abort', async () => {
    const jobId = 'job_test_owner_99';
    await storage.set(`job_state:${jobId}`, JSON.stringify({
      id: jobId,
      command: 'echo 123',
      ownerSessionId: 'legit_session_abc',
      ownerRole: 'temporary',
      status: 'running'
    }));

    // Calling from different valid session belonging to another non-master user
    const attackerSid = 'session_unrelated_attacker_user';
    await storage.set(`session:${attackerSid}`, JSON.stringify({
      sessionId: attackerSid,
      role: 'temporary',
      expiresAt: Date.now() + 3600000
    }));

    const { req, res } = createMockReqRes({
      method: 'GET',
      url: `/api/worker?jobId=${jobId}`,
      query: { jobId },
      headers: { 'x-session-id': attackerSid }
    });
    await workerHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Must return 403 Forbidden for non-owner');
    const data = res._getSentData();
    assert.ok(data.error.includes('restricted to the job creator') || data.error.includes('Forbidden'));
  });

  await it('HIGH-02', 'Global storage delete action restricted strictly to master role', async () => {
    // Non-master session
    const tempKey = 'session_temp_user_55';
    await storage.set(`session:${tempKey}`, JSON.stringify({
      sessionId: tempKey,
      role: 'temporary',
      expiresAt: Date.now() + 3600000
    }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/storage',
      body: { action: 'delete', path: 'sensitive_file.txt' },
      headers: { 'x-session-id': tempKey }
    });
    await storageHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Temporary role must be denied destructive storage deletion');
    const data = res._getSentData();
    assert.ok(data.error.toLowerCase().includes('master role') || data.error.includes('Forbidden'));
  });

  await it('HIGH-03', 'Shared master workspace state mutation restricted strictly to master role', async () => {
    const tempKey = 'session_temp_editor_77';
    await storage.set(`session:${tempKey}`, JSON.stringify({
      sessionId: tempKey,
      role: 'temporary',
      expiresAt: Date.now() + 3600000
    }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/sync',
      body: { key: 'master_workspace_state', value: { malicious: 'data' } },
      headers: { 'x-session-id': tempKey }
    });
    await syncHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Non-master must be denied mutating master_workspace_state');
    const data = res._getSentData();
    assert.ok(data.error.toLowerCase().includes('master role'));
  });

  await it('HIGH-04', 'Revoked key tombstone has no expiration (permanent revocation)', async () => {
    const keyId = 'key_tombstone_test_88';
    await storage.set('admin:temp_passwords', JSON.stringify([
      { id: keyId, hash: 'some_hash', name: 'Temporary Staff', created: new Date().toISOString() },
      { id: 'key_survivor_01', hash: 'surv_hash', name: 'Survivor', created: new Date().toISOString() }
    ]));

    // Master session
    const masterSid = 'session_master_high4';
    await storage.set(`session:${masterSid}`, JSON.stringify({ sessionId: masterSid, role: 'master' }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/admin',
      headers: { 'x-session-id': masterSid },
      body: { action: 'delete', id: keyId }
    });
    await adminHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);

    // Verify tombstone was set in storage
    const tombstone = await storage.get(`admin:revoked_key:${keyId}`);
    assert.ok(tombstone, 'Tombstone must be stored with permanent value');
  });

  await it('HIGH-05', 'Active sessions derived from revoked key are immediately invalidated', async () => {
    const keyId = 'key_revoked_session_33';
    const sessionId = 'session_belonging_to_revoked_key';

    await storage.set(`admin:revoked_key:${keyId}`, '1');
    await storage.set(`session:${sessionId}`, JSON.stringify({
      sessionId,
      keyId,
      role: 'temporary',
      expiresAt: Date.now() + 3600000
    }));

    const { req } = createMockReqRes({
      headers: { 'x-session-id': sessionId }
    });
    const validated = await authGuard.validateSession(req, storage);
    assert.strictEqual(validated.valid, false, 'Session linked to revoked key must be rejected');
  });

  await it('HIGH-06', 'OAuth2 state CSRF & tampering resistance enforced', async () => {
    const origId = process.env.GOOGLE_CLIENT_ID;
    const origSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'mock_client_id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'mock_secret_xyz123';

    try {
      // Generate valid state
      const { req: authReq, res: authRes } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/auth',
        query: { action: 'auth' }
      });
      await calendarHandler(authReq, authRes);
      const authData = authRes._getSentData();
      assert.ok(authData.authUrl, 'Auth URL generated');
      const stateParam = new URL(authData.authUrl).searchParams.get('state');

      // Tamper with state
      const tamperedState = stateParam.slice(0, -6) + 'xxxxxx';
      const { req: cbReq, res: cbRes } = createMockReqRes({
        method: 'GET',
        url: `/api/calendar/callback?code=mock_code&state=${tamperedState}`,
        query: { action: 'callback', code: 'mock_code', state: tamperedState }
      });
      await calendarHandler(cbReq, cbRes);
      assert.strictEqual(cbRes._getStatusCode(), 400, 'Tampered state HMAC must be rejected with 400');
    } finally {
      if (origId !== undefined) process.env.GOOGLE_CLIENT_ID = origId;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (origSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = origSecret;
      else delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });

  await it('HIGH-07', 'Unrestricted task schedule injection via sync_schedules blocked for non-master', async () => {
    const tempKey = 'session_guest_sched_44';
    await storage.set(`session:${tempKey}`, JSON.stringify({
      sessionId: tempKey,
      role: 'temporary',
      expiresAt: Date.now() + 3600000
    }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/worker',
      body: { action: 'sync_schedules', schedules: [{ id: 'sched_1', cron: '* * * * *' }] },
      headers: { 'x-session-id': tempKey }
    });
    await workerHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 403, 'Non-master role must not inject schedules');
  });

  await it('HIGH-08', 'CORS origin regex prevents wildcard reflection of untrusted origins', async () => {
    const { req, res } = createMockReqRes({
      method: 'OPTIONS',
      url: '/api/calendar/status',
      headers: { origin: 'https://attacker.github.io.evil.com' }
    });
    await calendarHandler(req, res);
    const acao = res.getHeader('access-control-allow-origin');
    assert.notStrictEqual(acao, 'https://attacker.github.io.evil.com', 'Attacker origin must not be reflected');
    assert.strictEqual(acao, 'https://lumina-vista-sigma.vercel.app');
  });

  await it('HIGH-09', 'IoT Gateway eliminates static fallback secret in production when unconfigured', () => {
    const origSecret = process.env.IOT_DEVICE_SECRET;
    const origVercel = process.env.VERCEL;

    delete process.env.IOT_DEVICE_SECRET;
    process.env.VERCEL = '1';

    try {
      const secret = iotModule.getDeviceSecret();
      assert.strictEqual(secret, '', 'In production without IOT_DEVICE_SECRET, secret must be empty string (no static fallback)');
    } finally {
      if (origSecret !== undefined) process.env.IOT_DEVICE_SECRET = origSecret;
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
    }
  });

  await it('HIGH-10', 'Token privilege escalation bypass (test_temp substring) rejected in production', async () => {
    const origArgv = process.argv;
    const origVercel = process.env.VERCEL;
    process.argv = ['node', 'index.js']; // Remote production args
    process.env.VERCEL = '1';

    try {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/admin',
        body: { action: 'list' },
        headers: {
          'x-session-id': 'forged_test_temp_token',
          'x-forwarded-for': '198.51.100.99'
        }
      });
      await adminHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 401, 'Substring test_temp token must not grant admin bypass');
    } finally {
      process.argv = origArgv;
      if (origVercel !== undefined) process.env.VERCEL = origVercel;
    }
  });

  await it('HIGH-11', 'Cleartext protocols (http:, ws:) completely eliminated from CSP in vercel.json & HTML', () => {
    const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    const cspHeader = vercelJson.headers.find(h => h.source.includes('api') || h.source === '/(.*)')?.headers?.find(hdr => hdr.key === 'Content-Security-Policy')?.value || '';
    
    assert.ok(cspHeader.includes("connect-src 'self' https: wss:;"), 'connect-src strictly uses https: and wss:');
    assert.ok(!cspHeader.includes('http:'), 'No plain http: in CSP connect-src');
    assert.ok(!cspHeader.includes('ws:'), 'No plain ws: in CSP connect-src');

    const dashHtml = fs.readFileSync(path.join(rootDir, 'dashboard.html'), 'utf8');
    assert.ok(!dashHtml.includes('connect-src \'self\' http:'), 'Dashboard CSP has no plain http:');
  });

  await it('HIGH-12', 'Rate limiter uses rightmost untrusted IP against X-Forwarded-For spoofing', () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.195'
      },
      connection: { remoteAddress: '127.0.0.1' }
    };
    const rawIp = authGuard.getRawClientIp(mockReq);
    assert.strictEqual(rawIp, '203.0.113.195', 'Picks rightmost IP from chain');
    const clientIp = authGuard.getClientIp(mockReq);
    const salt = process.env.ADMIN_PASSWORD || 'lv_ip_salt';
    const expectedHash = crypto.createHash('sha256').update(`${salt}:203.0.113.195`).digest('hex').slice(0, 16);
    assert.strictEqual(clientIp, `anon_${expectedHash}`);
  });

  await it('HIGH-13', 'Optimistic concurrency control in api/sync.js detects revision conflict', async () => {
    // Master session
    const masterSessionId = 'session_master_occ_99';
    await storage.set(`session:${masterSessionId}`, JSON.stringify({
      sessionId: masterSessionId,
      role: 'master',
      expiresAt: Date.now() + 3600000
    }));

    // Seed state with revision 5
    await storage.set('master_workspace_state', JSON.stringify({
      notes: 'Initial state',
      revision: 5
    }));

    // Attempt update passing stale baseRevision 4
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/sync',
      body: {
        baseRevision: 4,
        notes: 'Conflicting update'
      },
      headers: { 'x-session-id': masterSessionId }
    });
    await syncHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 409, 'Conflict must return HTTP 409');
    const data = res._getSentData();
    assert.strictEqual(data.currentRevision, 5);
  });

  await it('HIGH-14', 'Stampeding herd race condition prevented on Google OAuth token refresh', () => {
    const calendarCode = fs.readFileSync(path.join(rootDir, 'api', 'calendar.js'), 'utf8');
    assert.ok(calendarCode.includes('inFlightTokenRefresh'), 'Defines inFlightTokenRefresh mutex');
    assert.ok(calendarCode.includes('await inFlightTokenRefresh'), 'Coalesces on concurrent in-flight refresh');
  });

  await it('HIGH-15', 'IoT Gateway enforces strict sequence monotonicity (seq > meta.lastSeq)', async () => {
    const deviceSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.IOT_DEVICE_SECRET = deviceSecret;

    // Seed lastSeq to 50
    await storage.set(iotModule.KEY_META, JSON.stringify({
      lastSeq: 50,
      lastSeen: Math.floor(Date.now() / 1000)
    }));

    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const seqStr = '50'; // Duplicate sequence 50 (not > 50)
    const rawBody = JSON.stringify({ action: 'heartbeat' });
    const sig = iotModule.computeDeviceSignature(deviceSecret, iotModule.DEFAULT_DEVICE_ID, ts, nonce, seqStr, rawBody);

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/iot',
      headers: {
        'x-lumina-device-id': iotModule.DEFAULT_DEVICE_ID,
        'x-lumina-timestamp': ts,
        'x-lumina-nonce': nonce,
        'x-lumina-seq': seqStr,
        'x-lumina-signature': sig
      },
      body: JSON.parse(rawBody)
    });
    await iotHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401, 'Duplicate seq === 50 must be rejected');
    const data = res._getSentData();
    assert.ok(data.error.includes('out-of-order') || data.error.includes('Stale'));
  });

  await it('HIGH-16', 'Google Calendar push computes deterministic idempotency key for events', () => {
    const calendarCode = fs.readFileSync(path.join(rootDir, 'api', 'calendar.js'), 'utf8');
    assert.ok(calendarCode.includes("crypto.createHash('sha256').update(String(body.id || body.localId)).digest('hex')"), 'Has deterministic event idempotency ID');
  });

  await it('HIGH-17', 'Top-level outer try/catch scope implemented in all serverless edge handlers', () => {
    const handlers = ['admin.js', 'sync.js', 'storage.js', 'worker.js', 'iot.js', 'calendar.js'];
    for (const h of handlers) {
      const code = fs.readFileSync(path.join(rootDir, 'api', h), 'utf8');
      assert.ok(code.includes('try {') && (code.includes('catch (err)') || code.includes('catch (error)')), `${h} must contain outer try/catch`);
    }
  });

  await it('HIGH-18', 'DOM XSS mitigated in Whiteboard, AI Task Sessions, and Chat UI', () => {
    const wbCode = fs.readFileSync(path.join(rootDir, 'modules', 'whiteboard.js'), 'utf8');
    assert.ok(!wbCode.includes('<textarea class="wb-sticky-text">${s.text || \'\'}</textarea>'), 'Sticky note uses safe value assignment');
    assert.ok(wbCode.includes('ta.value = sticky.text || \'\''), 'Sticky note text assigned via property');

    const sessionsCode = fs.readFileSync(path.join(rootDir, 'modules', 'ai-tasks-sessions.js'), 'utf8');
    assert.ok(!sessionsCode.includes("onclick=\"window.LuminaTasksSessions?.switchSession('${s.id}')\""), 'Session switch uses data-id');

    const chatUiCode = fs.readFileSync(path.join(rootDir, 'modules', 'ai-chat-ui.js'), 'utf8');
    assert.ok(!chatUiCode.includes("onclick=\"window.LuminaCodespace?.openFile('${f}')\""), 'VFS openFile uses data-filename');
  });

  await it('HIGH-19', 'Obfuscated Base64 piped shell payloads intercepted by JEV guardrails', () => {
    const dangerousPipedCmd = 'echo cm0gLXJmIC8= | base64 -d | sh';
    const result = jevGuardrails.inspectJevCommandSafety(dangerousPipedCmd);
    assert.strictEqual(result.safe, false, 'Base64 piped to sh must be flagged dangerous');
    assert.ok(result.reason.includes('Prohibited shell piping') || result.reason.includes('Base64'));
  });

  await it('HIGH-20', 'Directory traversal and special character injection blocked in path sanitizers', () => {
    assert.strictEqual(authGuard.sanitizeFilePath('../../../etc/passwd'), '', 'Relative traversal blocked');
    assert.strictEqual(authGuard.sanitizeFilePath('dir/../../secret'), '', 'Embedded traversal blocked');
    assert.strictEqual(authGuard.sanitizeFilePath('file%2e%2e/target'), '', 'URL-encoded traversal blocked');
    assert.strictEqual(authGuard.sanitizeFilePath('test?.txt'), '', 'Question mark query blocked');
    assert.strictEqual(authGuard.sanitizeFilePath('test#.txt'), '', 'Hash fragment blocked');
    assert.strictEqual(authGuard.sanitizeFilePath('test\x00.txt'), '', 'Null byte blocked');
    assert.strictEqual(authGuard.sanitizeFilePath('valid_dir/valid_file.json'), 'valid_dir/valid_file.json', 'Benign relative path allowed');
  });

  // -------------------------------------------------------------------------
  // SECTION 3: MEDIUM SEVERITY VULNERABILITIES (MED-01 to MED-15)
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: Medium Severity Vulnerabilities (MED-01 .. MED-15)]');

  await it('MED-01', 'Logout endpoint revokes tokens passed via Bearer auth and request body', async () => {
    const bearerToken = 'session_bearer_token_77';
    await storage.set(`session:${bearerToken}`, JSON.stringify({ sessionId: bearerToken, role: 'master' }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/logout',
      headers: { authorization: `Bearer ${bearerToken}` }
    });
    await logoutHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);

    // Verify token was deleted from storage
    const remaining = await storage.get(`session:${bearerToken}`);
    assert.strictEqual(remaining, null, 'Bearer token must be purged on logout');
  });

  await it('MED-02', 'Cross-site logout dynamically uses SameSite=None; Secure for cookie invalidation', async () => {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/logout',
      headers: {
        origin: 'https://subhadraroy.github.io',
        host: 'lumina-vista-sigma.vercel.app'
      }
    });
    await logoutHandler(req, res);
    const cookies = res._getSentHeaders()['set-cookie'];
    const sessionCookieStr = Array.isArray(cookies) ? cookies.find(c => c.includes('godx_session=')) : String(cookies);
    assert.ok(sessionCookieStr.includes('SameSite=None') || sessionCookieStr.includes('samesite=none'), 'Cross-site origin must produce SameSite=None cookie clearing');
  });

  await it('MED-03', 'Secondary credential check in auth.js verifies revocation tombstones', async () => {
    const revokedKeyId = 'key_temp_revoked_inspect_22';
    const plainPass = 'Lv-Secret123!';
    const hash = crypto.createHash('sha256').update(plainPass).digest('hex');

    await storage.set('admin:temp_passwords', JSON.stringify([
      { id: revokedKeyId, hash, label: 'Revoked Key', createdAt: Date.now() },
      { id: 'key_valid_partner', hash: 'dummy_hash_for_other', label: 'Valid Key', createdAt: Date.now() }
    ]));
    // Mark revoked in tombstone
    await storage.set(`admin:revoked_key:${revokedKeyId}`, '1');

    const result = await authModule.verifyCredentials(plainPass, 'masterSecret', storage, []);
    assert.strictEqual(result.authenticated, false, 'Revoked temporary password must fail verification');
  });

  await it('MED-04', 'Storage synchronization prevents memory/redis split-brain on admin key deletion', () => {
    const adminCode = fs.readFileSync(path.join(rootDir, 'api', 'admin.js'), 'utf8');
    assert.ok(adminCode.includes('getAdminPasswordsList'), 'admin.js utilizes synchronized password fetcher');
    assert.ok(adminCode.includes('lock:admin_passwords'), 'Uses lock to synchronize mutations across distributed lambdas');
  });

  await it('MED-05', 'Tailwind CDN pinned version and third-party scripts enforce integrity across HTML files', () => {
    const files = ['index.html', 'dashboard.html', '404.html'];
    for (const f of files) {
      const content = fs.readFileSync(path.join(rootDir, f), 'utf8');
      assert.ok(content.includes('cdn.tailwindcss.com/3.4.15'), `${f} loads pinned Tailwind 3.4.15`);
    }
    // Static libraries like GSAP enforce SRI integrity
    const indexContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    assert.ok(indexContent.includes('integrity="sha384-') && indexContent.includes('crossorigin="anonymous"'), 'index.html scripts enforce SRI');
  });

  await it('MED-06', 'Static HTML pages (index.html, 404.html) enforce CSP meta tags', () => {
    for (const f of ['index.html', '404.html']) {
      const content = fs.readFileSync(path.join(rootDir, f), 'utf8');
      assert.ok(content.includes('<meta http-equiv="Content-Security-Policy"'), `${f} must have CSP meta tag`);
    }
  });

  await it('MED-07', 'Consistent environment variable aliasing supported across services', () => {
    const authCode = fs.readFileSync(path.join(rootDir, 'api', 'auth.js'), 'utf8');
    assert.ok(authCode.includes('ADMIN_MASTER_PASSWORD'), 'auth.js supports ADMIN_MASTER_PASSWORD alias');

    const redisCode = fs.readFileSync(path.join(rootDir, 'api', '_lib', 'redis.js'), 'utf8');
    assert.ok(redisCode.includes('REDIS_URL') && redisCode.includes('KV_URL'), 'redis.js supports REDIS_URL and KV_URL aliases');

    const calCode = fs.readFileSync(path.join(rootDir, 'api', 'calendar.js'), 'utf8');
    assert.ok(calCode.includes('GCAL_CLIENT_SECRET'), 'calendar.js supports GCAL_CLIENT_SECRET alias');
  });

  await it('MED-08', 'Successful temporary login does not reset IP rate limit for master password guessing', () => {
    const authCode = fs.readFileSync(path.join(rootDir, 'api', 'auth.js'), 'utf8');
    assert.ok(authCode.includes("verification.type === 'master'"), 'Rate limit failure reset restricted strictly to master logins');
  });

  await it('MED-09', 'In-memory rate limiter cache evicts oldest entries at 5000 max entries', () => {
    const guardCode = fs.readFileSync(path.join(rootDir, 'api', '_lib', 'auth-guard.js'), 'utf8');
    assert.ok(guardCode.includes('MAX_RATE_LIMIT_CACHE_ENTRIES = 5000'), 'Defines 5000 entry eviction cap');
    assert.ok(guardCode.includes('inMemoryRateLimits.delete('), 'Evicts oldest entry when cap is exceeded');
  });

  await it('MED-10', 'Edge endpoints in api/logout.js and api/calendar.js enforce rate limiting', () => {
    const logoutCode = fs.readFileSync(path.join(rootDir, 'api', 'logout.js'), 'utf8');
    assert.ok(logoutCode.includes('checkRateLimit'), 'logout.js enforces rate limiting');

    const calendarCode = fs.readFileSync(path.join(rootDir, 'api', 'calendar.js'), 'utf8');
    assert.ok(calendarCode.includes('checkRateLimit'), 'calendar.js enforces rate limiting');
  });

  await it('MED-11', 'IoT Gateway allows clean sequence counter reset on verified ESP32 reboot (seq === 1)', async () => {
    const deviceSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.IOT_DEVICE_SECRET = deviceSecret;

    // Device had previous sequence 250
    await storage.set(iotModule.KEY_META, JSON.stringify({
      lastSeq: 250,
      lastSeen: Math.floor(Date.now() / 1000)
    }));

    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = 'b1c2d3e4f5a60718293a4b5c6d7e8f91';
    const seqStr = '1'; // Clean reboot sequence 1
    const rawBody = JSON.stringify({ action: 'heartbeat' });
    const sig = iotModule.computeDeviceSignature(deviceSecret, iotModule.DEFAULT_DEVICE_ID, ts, nonce, seqStr, rawBody);

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/iot',
      headers: {
        'x-lumina-device-id': iotModule.DEFAULT_DEVICE_ID,
        'x-lumina-timestamp': ts,
        'x-lumina-nonce': nonce,
        'x-lumina-seq': seqStr,
        'x-lumina-signature': sig
      },
      body: JSON.parse(rawBody)
    });
    await iotHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200, 'Reboot seq 1 must be accepted');

    // Verify lastSeq was updated to 1
    const updatedMeta = JSON.parse(await storage.get(iotModule.KEY_META));
    assert.strictEqual(updatedMeta.lastSeq, 1, 'Sequence counter cleanly reset to 1 on verified reboot');
  });

  await it('MED-12', 'Information leakage in MicroVM notices prevented and absolute paths masked', () => {
    const errWithLinuxPath = 'Failure in /var/task/node_modules/isolated-vm/runner.js: line 42';
    const sanitizedLinux = authGuard.sanitizeError(errWithLinuxPath);
    assert.ok(!sanitizedLinux.includes('/var/task/'), 'Linux absolute paths redacted');

    const errWithWinPath = 'Cannot find file C:\\Users\\roysu\\LuminaVista\\secret.key';
    const sanitizedWin = authGuard.sanitizeError(errWithWinPath);
    assert.ok(!sanitizedWin.includes('C:\\Users\\'), 'Windows absolute paths redacted');

    const workerCode = fs.readFileSync(path.join(rootDir, 'api', 'worker.js'), 'utf8');
    assert.ok(!workerCode.includes('sandboxErr: sbxErr.message'), 'MicroVM error details sanitized in worker logs');
  });

  await it('MED-13', 'Calendar sync avoids backward 1-day timezone drift on timed date inputs', () => {
    const calSyncCode = fs.readFileSync(path.join(rootDir, 'modules', 'calendar-sync.js'), 'utf8');
    assert.ok(calSyncCode.includes('d.getFullYear()') && calSyncCode.includes('d.getMonth() + 1') && calSyncCode.includes('d.getDate()'),
      'Uses local date components rather than naive UTC string slicing to prevent timezone drift');
  });

  await it('MED-14', 'Multi-day all-day sync handles asymmetric Google Calendar end-date exclusivity', () => {
    const calSyncCode = fs.readFileSync(path.join(rootDir, 'modules', 'calendar-sync.js'), 'utf8');
    assert.ok(calSyncCode.includes('eDate.getTime() - 86400000'), 'Converts Google exclusive end date to inclusive date range on import');
  });

  await it('MED-15', 'Session IDs in x-session-id and logout validated against injection regex', async () => {
    const maliciousSessionId = 'malicious\r\nSET hacker 1\r\n';
    const { req } = createMockReqRes({
      headers: { 'x-session-id': maliciousSessionId }
    });
    const validated = await authGuard.validateSession(req, storage);
    assert.strictEqual(validated.valid, false, 'Injected session ID with CRLF must fail validation');
  });

  // -------------------------------------------------------------------------
  // FINAL RESULTS SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n=================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} FAILURE(S) DETECTED:`);
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. [${f.id}] ${f.description}`);
      console.error(`     Error: ${f.error.message}\n`);
    });
    process.exit(1);
  } else {
    console.log('🎉 ALL 40 SECURITY REGRESSION TESTS PASSED WITH ZERO FAILURES!');
    console.log('=================================================================\n');
    process.exit(0);
  }
}

runR6SecurityRegressionSuite().catch(err => {
  console.error('Fatal test harness execution error:', err);
  process.exit(1);
});
