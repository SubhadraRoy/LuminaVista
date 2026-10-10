// tests/adversarial-calendar.test.cjs - Adversarial Challenge Harness for api/calendar.js
// Probes OAuth redirect URI resolution, CORS preflight/origin verification, and crash resilience.

const assert = require('assert');
const crypto = require('crypto');

function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let body = null;
  let ended = false;

  const res = {
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
      return res;
    },
    getHeader(key) {
      return headers[key.toLowerCase()];
    },
    getHeaders() {
      return { ...headers };
    },
    status(code) {
      statusCode = code;
      return res;
    },
    getStatusCode() {
      return statusCode;
    },
    json(data) {
      body = data;
      ended = true;
      return res;
    },
    send(data) {
      body = data;
      ended = true;
      return res;
    },
    end() {
      ended = true;
      return res;
    },
    getBody() {
      return body;
    },
    isEnded() {
      return ended;
    }
  };
  return res;
}

async function runAdversarialProbes() {
  console.log('======================================================================');
  console.log('  LUMINAVISTA OS ADVERSARIAL CHALLENGE HARNESS: api/calendar.js       ');
  console.log('======================================================================\n');

  let passed = 0;
  function probeAssert(condition, message) {
    assert(condition, message);
    passed++;
    console.log(`  ✓ PROBE PASS: ${message}`);
  }

  // 1. Dynamic import of target module
  const calendarMod = await import('../api/calendar.js');
  const {
    default: calendarHandler,
    resolveRedirectUri,
    serializeGcalCookie,
    getProto,
    PRODUCTION_REDIRECT_URI
  } = calendarMod;

  assert(typeof calendarHandler === 'function', 'calendarHandler is exported as default function');
  assert(typeof resolveRedirectUri === 'function', 'resolveRedirectUri is exported');
  assert(typeof serializeGcalCookie === 'function', 'serializeGcalCookie is exported');
  assert(typeof PRODUCTION_REDIRECT_URI === 'string', 'PRODUCTION_REDIRECT_URI is exported');

  // =========================================================================
  // SECTION 1: resolveRedirectUri ADVERSARIAL STRESS TESTING
  // =========================================================================
  console.log('\n[SECTION 1: OAuth Redirect URI Resolution & redirect_uri_mismatch Defense]');

  // Ensure env var override does not mask lower-level resolution during basic tests
  const savedGoogleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
  delete process.env.GOOGLE_REDIRECT_URI;

  try {
    // 1A. GitHub Pages query redirect URIs -> MUST force PRODUCTION_REDIRECT_URI
    const githubPagesTestCases = [
      'https://subhadraroy.github.io/LuminaVista/callback',
      'https://subhadraroy.github.io/api/calendar/callback',
      'https://some-fork.github.io/callback',
      'http://attacker.github.io/steal-code',
      'https://foo.bar.github.io/callback',
      'https://github.io/something'
    ];

    for (const ghUri of githubPagesTestCases) {
      const resolved = resolveRedirectUri({ query: { redirect_uri: ghUri } });
      probeAssert(
        resolved === PRODUCTION_REDIRECT_URI,
        `GitHub Pages URI "${ghUri}" rewritten to production URI to prevent redirect_uri_mismatch`
      );
    }

    // 1B. Vercel Preview Deployments (Host / x-forwarded-host) -> MUST fallback to PRODUCTION_REDIRECT_URI
    const vercelPreviewCases = [
      { headers: { host: 'lumina-vista-git-preview-feat.vercel.app' } },
      { headers: { 'x-forwarded-host': 'lumina-vista-sigma-subhadraroy.vercel.app' } },
      { headers: { host: 'custom-pr-12.vercel.app' } }
    ];

    for (const req of vercelPreviewCases) {
      const resolved = resolveRedirectUri(req);
      probeAssert(
        resolved === PRODUCTION_REDIRECT_URI,
        `Vercel preview deployment (${req.headers.host || req.headers['x-forwarded-host']}) resolves to production callback URI`
      );
    }

    // 1C. Preserves custom test URIs (e.g. luminavista.example.com or custom query)
    const customUri = 'https://luminavista.example.com/api/calendar/callback';
    const resolvedCustomQuery = resolveRedirectUri({ query: { redirect_uri: customUri } });
    probeAssert(
      resolvedCustomQuery === customUri,
      `Custom test redirect_uri in query preserved: ${customUri}`
    );

    const resolvedCustomHost = resolveRedirectUri({ headers: { host: 'luminavista.example.com', 'x-forwarded-proto': 'https' } });
    probeAssert(
      resolvedCustomHost === customUri,
      `Host header 'luminavista.example.com' preserves custom callback URL`
    );

    // 1D. Localhost development environments
    const localReq1 = { headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' } };
    probeAssert(
      resolveRedirectUri(localReq1) === 'http://localhost:3000/api/calendar/callback',
      'Localhost:3000 development callback preserved'
    );

    const localReq2 = { headers: { host: '127.0.0.1:8080', 'x-forwarded-proto': 'https' } };
    probeAssert(
      resolveRedirectUri(localReq2) === 'https://127.0.0.1:8080/api/calendar/callback',
      '127.0.0.1:8080 development callback preserved'
    );

    // 1E. Priority hierarchy: redirectUriFromState overrides everything
    const stateUri = 'https://verified-state.domain.org/callback';
    const resolvedFromState = resolveRedirectUri(
      { query: { redirect_uri: 'https://ignored-query.com' }, headers: { host: 'localhost:3000' } },
      stateUri
    );
    probeAssert(
      resolvedFromState === stateUri,
      'redirectUriFromState parameter takes absolute highest priority'
    );

    // 1F. Priority hierarchy: process.env.GOOGLE_REDIRECT_URI override
    process.env.GOOGLE_REDIRECT_URI = 'https://server-override.env.example.com/callback';
    const resolvedEnvOverride = resolveRedirectUri({ query: { redirect_uri: 'https://ignored.com' } });
    probeAssert(
      resolvedEnvOverride === 'https://server-override.env.example.com/callback',
      'process.env.GOOGLE_REDIRECT_URI overrides query when present'
    );
    delete process.env.GOOGLE_REDIRECT_URI;

    // 1G. Adversarial / Malicious / Malformed inputs to resolveRedirectUri (Crash resilience)
    const malformedInputs = [
      null,
      undefined,
      {},
      { query: null },
      { query: { redirect_uri: null } },
      { query: { redirect_uri: undefined } },
      { query: { redirect_uri: '' } },
      { query: { redirect_uri: '   ' } },
      { query: { redirect_uri: 12345 } },
      { query: { redirect_uri: false } },
      { query: { redirect_uri: ['https://attacker.com'] } },
      { query: { redirect_uri: { evil: 'payload' } } },
      { headers: null },
      { headers: { host: null } },
      { headers: { host: 1234 } },
      { headers: { 'x-forwarded-host': 'host1.com, host2.com' } }
    ];

    for (const badReq of malformedInputs) {
      assert.doesNotThrow(() => {
        const result = resolveRedirectUri(badReq);
        assert(typeof result === 'string' && result.length > 0);
      }, `resolveRedirectUri must never throw on malformed/adversarial input: ${JSON.stringify(badReq)}`);
    }
    probeAssert(true, 'resolveRedirectUri survives all 16 malformed/adversarial inputs without throwing');

  } finally {
    if (savedGoogleRedirectUri) {
      process.env.GOOGLE_REDIRECT_URI = savedGoogleRedirectUri;
    } else {
      delete process.env.GOOGLE_REDIRECT_URI;
    }
  }

  // =========================================================================
  // SECTION 2: CORS PREFLIGHT & ORIGIN VERIFICATION ADVERSARIAL PROBES
  // =========================================================================
  console.log('\n[SECTION 2: CORS Preflight (OPTIONS 204) & Origin Verification]');

  const testEndpoints = [
    { name: 'Root controller', url: '/api/calendar' },
    { name: 'Auth initiation', url: '/api/calendar/auth' },
    { name: 'Callback code exchange', url: '/api/calendar/callback' },
    { name: 'Status check', url: '/api/calendar/status' },
    { name: 'Sync route', url: '/api/calendar/sync' },
    { name: 'Disconnect route', url: '/api/calendar/disconnect' },
    { name: 'Query action=auth', url: '/api/calendar?action=auth', query: { action: 'auth' } },
    { name: 'Query action=status', url: '/api/calendar?action=status', query: { action: 'status' } },
    { name: 'Query action=sync', url: '/api/calendar?action=sync', query: { action: 'sync' } },
    { name: 'Query action=disconnect', url: '/api/calendar?action=disconnect', query: { action: 'disconnect' } }
  ];

  // 2A. OPTIONS preflight on ALL endpoints MUST return HTTP 204 with complete CORS headers
  for (const ep of testEndpoints) {
    const mockRes = createMockRes();
    const mockReq = {
      method: 'OPTIONS',
      url: ep.url,
      query: ep.query || {},
      headers: {
        origin: 'https://subhadraroy.github.io'
      }
    };

    await calendarHandler(mockReq, mockRes);

    probeAssert(
      mockRes.getStatusCode() === 204,
      `OPTIONS preflight on ${ep.name} (${ep.url}) returns HTTP 204`
    );
    probeAssert(
      mockRes.getHeader('access-control-allow-origin') === 'https://subhadraroy.github.io',
      `OPTIONS preflight on ${ep.name} returns matching Access-Control-Allow-Origin`
    );
    probeAssert(
      mockRes.getHeader('access-control-allow-credentials') === 'true',
      `OPTIONS preflight on ${ep.name} has Access-Control-Allow-Credentials: true`
    );
    const allowMethods = mockRes.getHeader('access-control-allow-methods') || '';
    probeAssert(
      allowMethods.includes('OPTIONS') && allowMethods.includes('GET') && allowMethods.includes('POST'),
      `OPTIONS preflight on ${ep.name} includes required HTTP methods`
    );
  }

  // 2B. Test origin whitelist verification
  const originsToTest = [
    // Allowed GitHub Pages origins
    { origin: 'https://subhadraroy.github.io', allowed: true },
    { origin: 'https://community-fork.github.io', allowed: true },
    { origin: 'https://org-name.github.io', allowed: true },

    // Allowed Vercel deployments
    { origin: 'https://lumina-vista-sigma.vercel.app', allowed: true },
    { origin: 'https://preview-feat-branch.vercel.app', allowed: true },
    { origin: 'https://lumina-vista-abc123-preview.vercel.app', allowed: true },

    // Allowed localhost / 127.0.0.1
    { origin: 'http://localhost:3000', allowed: true },
    { origin: 'http://localhost', allowed: true },
    { origin: 'http://127.0.0.1:8080', allowed: true },
    { origin: 'https://localhost:5173', allowed: true },

    // Whitelisted explicit domain
    { origin: 'https://luminavista.example.com', allowed: true },

    // Malicious / Unwhitelisted origins -> MUST NOT be reflected in Access-Control-Allow-Origin
    { origin: 'https://evil-attacker.com', allowed: false },
    { origin: 'https://attacker.github.io.evil.com', allowed: false },
    { origin: 'https://evilvercel.app.org', allowed: false },
    { origin: 'https://not-localhost.attacker.com', allowed: false },
    { origin: 'https://subhadraroy.github.io.phishing.com', allowed: false },
    { origin: 'null', allowed: false }
  ];

  for (const item of originsToTest) {
    const mockRes = createMockRes();
    const mockReq = {
      method: 'OPTIONS',
      url: '/api/calendar/status',
      headers: {
        origin: item.origin
      }
    };

    await calendarHandler(mockReq, mockRes);
    const returnedOrigin = mockRes.getHeader('access-control-allow-origin');

    if (item.allowed) {
      probeAssert(
        returnedOrigin === item.origin,
        `Whitelisted origin permitted: ${item.origin}`
      );
    } else {
      probeAssert(
        returnedOrigin === 'https://lumina-vista-sigma.vercel.app',
        `Unwhitelisted/adversarial origin "${item.origin}" denied and not reflected (fell back to safe default)`
      );
    }
  }

  // 2C. Non-OPTIONS endpoints (GET /api/calendar/status, GET /api/calendar/auth) origin and methods preservation
  const nonOptionsOrigins = [
    'https://subhadraroy.github.io',
    'https://community-fork.github.io',
    'https://custom-preview-branch.vercel.app',
    'http://localhost:3000'
  ];

  for (const origin of nonOptionsOrigins) {
    const mockRes = createMockRes();
    const mockReq = {
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' },
      headers: { origin }
    };

    await calendarHandler(mockReq, mockRes);
    const returnedOrigin = mockRes.getHeader('access-control-allow-origin');
    const allowMethods = mockRes.getHeader('access-control-allow-methods') || '';

    if (returnedOrigin !== origin) {
      console.error(`  ❌ VULNERABILITY DETECTED in GET /api/calendar/status: Origin ${origin} was overwritten to "${returnedOrigin}" by sendSecureJson/setSecurityHeaders`);
      throw new Error(`CORS origin regression: ${origin} was overwritten to ${returnedOrigin}`);
    } else {
      probeAssert(true, `Non-OPTIONS GET /api/calendar/status reflects allowed origin: ${origin}`);
    }

    if (!allowMethods.includes('PATCH')) {
      console.error(`  ❌ VULNERABILITY DETECTED: Access-Control-Allow-Methods "${allowMethods}" missing PATCH`);
      throw new Error(`CORS methods regression: missing PATCH in ${allowMethods}`);
    } else {
      probeAssert(true, `Non-OPTIONS GET /api/calendar/status preserves complete methods list (includes PATCH)`);
    }
  }

  // =========================================================================
  // SECTION 3: COOKIE ATTRIBUTES & MODERN CHIPS PARTITIONED COMPLIANCE
  // =========================================================================
  console.log('\n[SECTION 3: Cookie Partitioning (CHIPS) & Cross-Domain Security]');

  const testTokenData = {
    access_token: 'mock_access_token_123',
    refresh_token: 'mock_refresh_token_456',
    email: 'test@example.com'
  };

  // HTTPS: Must enforce Partitioned, SameSite=None, Secure, HttpOnly
  const httpsCookie = serializeGcalCookie(testTokenData, 'https');
  probeAssert(httpsCookie.includes('Partitioned'), 'HTTPS cookie includes Partitioned attribute (CHIPS compliance)');
  probeAssert(httpsCookie.includes('SameSite=None'), 'HTTPS cookie includes SameSite=None for cross-site fetch');
  probeAssert(httpsCookie.includes('Secure'), 'HTTPS cookie includes Secure attribute');
  probeAssert(httpsCookie.includes('HttpOnly'), 'HTTPS cookie includes HttpOnly attribute');

  // HTTP (localhost): SameSite=Lax, no Secure or Partitioned
  const httpCookie = serializeGcalCookie(testTokenData, 'http');
  probeAssert(!httpCookie.includes('Partitioned'), 'HTTP localhost cookie omits Partitioned');
  probeAssert(httpCookie.includes('SameSite=Lax'), 'HTTP localhost cookie uses SameSite=Lax');
  probeAssert(!httpCookie.includes('Secure'), 'HTTP localhost cookie omits Secure');
  probeAssert(httpCookie.includes('HttpOnly'), 'HTTP localhost cookie retains HttpOnly');

  // =========================================================================
  // SECTION 4: PROTOCOL RESOLUTION ADVERSARIAL CHECKS
  // =========================================================================
  console.log('\n[SECTION 4: Protocol Resolution]');

  probeAssert(getProto({ headers: { host: 'localhost:3000' } }) === 'http', 'localhost host resolves to http');
  probeAssert(getProto({ headers: { host: '127.0.0.1:8080' } }) === 'http', '127.0.0.1 host resolves to http');
  probeAssert(
    getProto({ headers: { host: 'subhadraroy.github.io', 'x-forwarded-proto': 'https' } }) === 'https',
    'remote host respects x-forwarded-proto'
  );
  probeAssert(getProto(null) === 'https', 'null req safely defaults to https');
  probeAssert(getProto({}) === 'https', 'empty req safely defaults to https');

  // =========================================================================
  // SECTION 5: PUBLIC ACCESS DECOUPLING & SOVEREIGN GUEST RESILIENCE
  // =========================================================================
  console.log('\n[SECTION 5: Sovereign Guest Public Access Decoupling]');

  // In production (VERCEL='1'), status and auth must be accessible WITHOUT godx_session
  const originalVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  process.env.GOOGLE_CLIENT_ID = 'mock_client_id.apps.googleusercontent.com';
  process.env.ADMIN_PASSWORD = 'adversarial_test_secret_password';

  try {
    // 5A. Status endpoint without session credentials
    const statusRes = createMockRes();
    const statusReq = {
      method: 'GET',
      url: '/api/calendar/status',
      headers: { host: 'lumina-vista-sigma.vercel.app' }
    };
    await calendarHandler(statusReq, statusRes);
    probeAssert(statusRes.getStatusCode() === 200, '/api/calendar/status returns HTTP 200 without admin session');
    const statusBody = statusRes.getBody();
    probeAssert(typeof statusBody === 'object' && statusBody.hasClientId === true, 'Status response contains public calendar config');

    // 5B. Auth endpoint without session credentials
    const authRes = createMockRes();
    const authReq = {
      method: 'GET',
      url: '/api/calendar/auth',
      headers: { host: 'lumina-vista-sigma.vercel.app' }
    };
    await calendarHandler(authReq, authRes);
    probeAssert(authRes.getStatusCode() === 200, '/api/calendar/auth returns HTTP 200 without admin session');
    const authBody = authRes.getBody();
    probeAssert(authBody.configured === true && typeof authBody.authUrl === 'string', 'Auth response returns valid OAuth URL');
    probeAssert(authBody.redirectUri === PRODUCTION_REDIRECT_URI, 'Auth response returns production redirect URI');

  } finally {
    if (originalVercel !== undefined) {
      process.env.VERCEL = originalVercel;
    } else {
      delete process.env.VERCEL;
    }
  }

  // =========================================================================
  // SECTION 6: STATE PARAMETER TAMPERING, EXPIRATION, & REPLAY PROTECTION
  // =========================================================================
  console.log('\n[SECTION 6: OAuth State Parameter Integrity]');

  process.env.GOOGLE_CLIENT_ID = 'mock_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'mock_client_secret';
  process.env.ADMIN_PASSWORD = 'adversarial_test_secret_password';

  // 6A. Tampered signature in OAuth callback
  const validNonce = crypto.randomBytes(16).toString('hex');
  const validTs = Date.now();
  const validRedirectUri = PRODUCTION_REDIRECT_URI;
  const validSig = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD)
    .update(`${validNonce}:${validRedirectUri}:${validTs}`)
    .digest('hex');

  // Corrupted signature
  const tamperedSig = 'f' + validSig.slice(1);
  const tamperedStateObj = { redirect_uri: validRedirectUri, nonce: validNonce, ts: validTs, sig: tamperedSig };
  const tamperedState = Buffer.from(JSON.stringify(tamperedStateObj)).toString('base64');

  const callbackResTampered = createMockRes();
  const callbackReqTampered = {
    method: 'GET',
    url: `/api/calendar/callback?code=mock_auth_code&state=${tamperedState}`,
    query: { code: 'mock_auth_code', state: tamperedState },
    headers: {}
  };
  await calendarHandler(callbackReqTampered, callbackResTampered);
  probeAssert(
    callbackResTampered.getStatusCode() === 400,
    'Tampered OAuth state signature rejected with HTTP 400 Bad Request'
  );

  // 6B. Expired state (> 15 minutes old)
  const expiredTs = Date.now() - (16 * 60 * 1000);
  const expiredSig = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD)
    .update(`${validNonce}:${validRedirectUri}:${expiredTs}`)
    .digest('hex');
  const expiredStateObj = { redirect_uri: validRedirectUri, nonce: validNonce, ts: expiredTs, sig: expiredSig };
  const expiredState = Buffer.from(JSON.stringify(expiredStateObj)).toString('base64');

  const callbackResExpired = createMockRes();
  const callbackReqExpired = {
    method: 'GET',
    url: `/api/calendar/callback?code=mock_auth_code&state=${expiredState}`,
    query: { code: 'mock_auth_code', state: expiredState },
    headers: {}
  };
  await calendarHandler(callbackReqExpired, callbackResExpired);
  probeAssert(
    callbackResExpired.getStatusCode() === 400,
    'Expired OAuth state (>15 min) rejected with HTTP 400 Bad Request'
  );

  // 6C. Corrupted base64 / invalid JSON state
  const corruptStateCases = ['not_base64_json!@#$', 'e30=', 'invalid_state'];
  for (const cs of corruptStateCases) {
    const cbRes = createMockRes();
    const cbReq = {
      method: 'GET',
      url: `/api/calendar/callback?code=mock_code&state=${cs}`,
      query: { code: 'mock_code', state: cs },
      headers: {}
    };
    await calendarHandler(cbReq, cbRes);
    probeAssert(
      cbRes.getStatusCode() === 400,
      `Corrupted OAuth state "${cs}" rejected with HTTP 400 without crashing`
    );
  }

  // =========================================================================
  // SECTION 7: HARNESS RESILIENCE UNDER EXTREME ABNORMAL INPUTS
  // =========================================================================
  console.log('\n[SECTION 7: Serverless Handler Crash Resilience]');

  const abnormalReqs = [
    { method: 'POST', url: '/api/calendar/sync', body: null },
    { method: 'POST', url: '/api/calendar/sync', body: { allDay: true, start: null, end: null } },
    { method: 'DELETE', url: '/api/calendar/sync', query: {} },
    { method: 'UNKNOWN_VERB', url: '/api/calendar' },
    { method: 'GET', url: '/api/calendar/random_nonexistent_action' }
  ];

  for (const abReq of abnormalReqs) {
    const res = createMockRes();
    await calendarHandler(abReq, res);
    probeAssert(
      res.isEnded() || res.getStatusCode() !== undefined,
      `Abnormal request [${abReq.method} ${abReq.url}] handled gracefully without unhandled exception`
    );
  }

  console.log('\n======================================================================');
  console.log(`  🎉 ALL ${passed} ADVERSARIAL PROBES PASSED WITH ZERO FAILURES!`);
  console.log('======================================================================\n');
}

runAdversarialProbes().catch(err => {
  console.error('❌ ADVERSARIAL HARNESS CRASHED:', err);
  process.exit(1);
});
