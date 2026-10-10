// tests/suite-calendar-adversarial.cjs
// Adversarial test harness for api/calendar.js
// Probing: Authentication decoupling, Guest session support, Token persistence,
// Cookie serialization (CHIPS), and Cache fallback.

const assert = require('assert');
const crypto = require('crypto');
const cookie = require('cookie');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
const failures = [];

function it(description, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passedTests++;
        console.log(`  ✓ PASS: ${description}`);
      }).catch(err => {
        console.error(`  ❌ FAIL: ${description}`);
        console.error(`     Reason: ${err.message}`);
        failures.push({ description, error: err });
      });
    } else {
      passedTests++;
      console.log(`  ✓ PASS: ${description}`);
    }
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Reason: ${err.message}`);
    failures.push({ description, error: err });
  }
}

// Helper to create mock req / res
function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/api/calendar/status',
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

async function runAdversarialCalendarSuite() {
  console.log('\n=================================================================');
  console.log('   LUMINAVISTA ADVERSARIAL CALENDAR CONTROLLER PROBE');
  console.log('=================================================================\n');

  // Enforce Vercel production mode to ensure auth-guard fails closed on admin endpoints
  process.env.VERCEL = '1';
  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret_xyz';
  process.env.ADMIN_PASSWORD = 'test_admin_sovereign_password_123';

  const {
    default: calendarHandler,
    getProto,
    serializeGcalCookie,
    resolveRedirectUri,
    PRODUCTION_REDIRECT_URI
  } = await import('../api/calendar.js');

  const { getSafeStorage } = await import('../api/_lib/redis.js');
  const storage = getSafeStorage();

  // Clean redis state before suite
  await storage.del('gcal:master_tokens');
  await storage.del('master_workspace_state');

  // -------------------------------------------------------------------------
  // SECTION 1: PUBLIC ACCESS & DECOUPLED AUTHENTICATION (SOVEREIGN GUEST)
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: Public Sovereign Guest Access]');

  await it('GET /api/calendar/status: sovereign guest without cookies or headers receives HTTP 200 without admin lock', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200, 'Must return HTTP 200');
    const data = res._getSentData();
    assert.strictEqual(data.configured, true, 'Should report configured: true');
    assert.strictEqual(data.connected, false, 'Should report connected: false when no token');
    assert.strictEqual(data.hasClientId, true, 'hasClientId is true');
  });

  await it('GET /api/calendar/status: guest with forged/tampered admin session header is NOT rejected with 401/403', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' },
      headers: {
        'x-session-id': 'forged_admin_session_payload_attacker',
        cookie: 'godx_session=malicious_fake_token; admin_token=invalid'
      }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200, 'Must return HTTP 200 regardless of invalid admin headers');
    const data = res._getSentData();
    assert.strictEqual(data.configured, true);
  });

  await it('GET /api/calendar/auth: sovereign guest receives HTTP 200 with valid Google OAuth URL and state', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/auth',
      query: { action: 'auth' }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200, 'Must return HTTP 200');
    const data = res._getSentData();
    assert.strictEqual(data.configured, true, 'configured is true');
    assert.ok(data.authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'Valid Google OAuth URL');
    assert.ok(data.authUrl.includes('client_id='), 'Contains client_id parameter');
    assert.ok(data.authUrl.includes('state='), 'Contains encoded state');
    assert.strictEqual(data.redirectUri, PRODUCTION_REDIRECT_URI, 'Uses production redirect URI by default');
  });

  await it('GET /api/calendar/auth: graceful public response when GOOGLE_CLIENT_ID is unconfigured', async () => {
    const origId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/auth',
        query: { action: 'auth' }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200, 'Must return HTTP 200 with configured: false');
      const data = res._getSentData();
      assert.strictEqual(data.configured, false);
      assert.ok(data.error.includes('GOOGLE_CLIENT_ID is not configured'));
    } finally {
      process.env.GOOGLE_CLIENT_ID = origId;
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 2: CORS & PREFLIGHT SECURITY PROBING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: CORS & Preflight Compliance]');

  await it('OPTIONS on all calendar actions returns HTTP 204 with credentials and methods', async () => {
    const actions = ['status', 'auth', 'sync', 'disconnect'];
    for (const action of actions) {
      const { req, res } = createMockReqRes({
        method: 'OPTIONS',
        url: `/api/calendar/${action}`,
        query: { action },
        headers: { origin: 'https://subhadraroy.github.io' }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 204, `OPTIONS /api/calendar/${action} must return 204`);
      const h = res._getSentHeaders();
      assert.strictEqual(h['access-control-allow-origin'], 'https://subhadraroy.github.io');
      assert.strictEqual(h['access-control-allow-credentials'], 'true');
      assert.ok(h['access-control-allow-methods'].includes('DELETE'), 'Includes DELETE');
      assert.ok(h['access-control-allow-methods'].includes('OPTIONS'), 'Includes OPTIONS');
    }
  });

  await it('CORS preflight (OPTIONS) dynamically allows .github.io, .vercel.app, and localhost origins', async () => {
    const testOrigins = [
      'https://subhadraroy.github.io',
      'https://custom-preview-branch.vercel.app',
      'http://localhost:3000',
      'http://127.0.0.1:8080'
    ];
    for (const origin of testOrigins) {
      const { req, res } = createMockReqRes({
        method: 'OPTIONS',
        url: '/api/calendar/status',
        query: { action: 'status' },
        headers: { origin }
      });
      await calendarHandler(req, res);
      const h = res._getSentHeaders();
      assert.strictEqual(h['access-control-allow-origin'], origin, `OPTIONS Origin ${origin} should be reflected`);
      assert.strictEqual(h['access-control-allow-credentials'], 'true');
    }
  });

  await it('CORS on JSON responses reflects allowed origin https://subhadraroy.github.io', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' },
      headers: { origin: 'https://subhadraroy.github.io' }
    });
    await calendarHandler(req, res);
    const h = res._getSentHeaders();
    assert.strictEqual(h['access-control-allow-origin'], 'https://subhadraroy.github.io');
    assert.strictEqual(h['access-control-allow-credentials'], 'true');
  });

  await it('CORS on JSON responses dynamically preserves preview branch origin https://custom-preview-branch.vercel.app', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' },
      headers: { origin: 'https://custom-preview-branch.vercel.app' }
    });
    await calendarHandler(req, res);
    const h = res._getSentHeaders();
    assert.strictEqual(h['access-control-allow-origin'], 'https://custom-preview-branch.vercel.app');
  });

  await it('CORS safely falls back to production origin when untrusted external origin is supplied', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' },
      headers: { origin: 'https://malicious-phishing-site.com' }
    });
    await calendarHandler(req, res);
    const h = res._getSentHeaders();
    assert.strictEqual(h['access-control-allow-origin'], 'https://lumina-vista-sigma.vercel.app', 'Must fallback to production origin');
  });

  // -------------------------------------------------------------------------
  // SECTION 3: REDIRECT URI RESOLUTION ADVERSARIAL STRESS-TESTING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: Redirect URI Resolution]');

  await it('resolveRedirectUri rewrites any github.io client query to PRODUCTION_REDIRECT_URI', () => {
    const req = { query: { redirect_uri: 'https://attacker.github.io/some/path' } };
    assert.strictEqual(resolveRedirectUri(req), PRODUCTION_REDIRECT_URI);
  });

  await it('resolveRedirectUri preserves legitimate custom domain redirect URIs', () => {
    const req = {
      query: { redirect_uri: 'https://luminavista.example.com/api/calendar/callback' },
      headers: { host: 'luminavista.example.com' }
    };
    assert.strictEqual(resolveRedirectUri(req), 'https://luminavista.example.com/api/calendar/callback');
  });

  await it('resolveRedirectUri supports localhost development ports', () => {
    const req = {
      headers: {
        host: 'localhost:5173',
        'x-forwarded-proto': 'http'
      }
    };
    assert.strictEqual(resolveRedirectUri(req), 'http://localhost:5173/api/calendar/callback');
  });

  // -------------------------------------------------------------------------
  // SECTION 4: COOKIE SERIALIZATION & CHIPS PARTITIONING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 4: Cookie Serialization & CHIPS Partitioning]');

  await it('serializeGcalCookie enforces Partitioned, SameSite=None, Secure, HttpOnly on HTTPS', () => {
    const tokenData = {
      access_token: 'mock_token_abc',
      refresh_token: 'mock_refresh_xyz',
      expires_at: Date.now() + 3600000,
      email: 'user@example.com'
    };
    const serialized = serializeGcalCookie(tokenData, 'https');
    assert.ok(serialized.includes('HttpOnly'), 'Must have HttpOnly');
    assert.ok(serialized.includes('Secure'), 'Must have Secure');
    assert.ok(serialized.includes('SameSite=None'), 'Must have SameSite=None');
    assert.ok(serialized.includes('Partitioned'), 'Must have Partitioned attribute for CHIPS');
    assert.ok(serialized.includes('Path=/'), 'Must have Path=/');

    // Verify token can be decoded back
    const parsedCookie = cookie.parse(serialized);
    const decoded = JSON.parse(Buffer.from(parsedCookie.gcal_token, 'base64').toString('utf8'));
    assert.strictEqual(decoded.access_token, 'mock_token_abc');
    assert.strictEqual(decoded.email, 'user@example.com');
  });

  await it('serializeGcalCookie with maxAge 0 produces valid clearing cookie with Partitioned', () => {
    const serialized = serializeGcalCookie(null, 'https', 0);
    assert.ok(serialized.includes('Max-Age=0'), 'Must include Max-Age=0');
    assert.ok(serialized.includes('Partitioned'), 'Clearing cookie must also be Partitioned');
    assert.ok(serialized.includes('gcal_token=;'), 'Token value should be empty');
  });

  await it('serializeGcalCookie on HTTP falls back to SameSite=Lax without Secure or Partitioned', () => {
    const serialized = serializeGcalCookie({ a: 1 }, 'http');
    assert.ok(serialized.includes('SameSite=Lax'), 'HTTP uses SameSite=Lax');
    assert.ok(!serialized.includes('Secure'), 'HTTP does not have Secure');
    assert.ok(!serialized.includes('Partitioned'), 'HTTP does not have Partitioned');
  });

  // -------------------------------------------------------------------------
  // SECTION 5: /api/calendar/sync ADVERSARIAL TOKEN & CACHE FALLBACK PROBING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 5: /api/calendar/sync Token Validation & Cache Fallback]');

  // Clean redis before sync testing
  await storage.del('gcal:master_tokens');
  await storage.del('master_workspace_state');

  await it('GET /api/calendar/sync without token and without cached events returns HTTP 401', async () => {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/sync',
      query: { action: 'sync' }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401, 'Must return HTTP 401');
    const data = res._getSentData();
    assert.strictEqual(data.connected, false);
    assert.ok(data.error.includes('Not connected to Google Calendar'));
  });

  await it('GET /api/calendar/sync fallback: returns cached events from Redis when unauthenticated (sovereign cache)', async () => {
    // Seed master_workspace_state with cached events
    const cachedWorkspace = {
      calendar: [
        {
          id: 'gcal_event_alpha_01',
          googleEventId: 'event_alpha_01',
          title: 'Quarterly Executive Review',
          description: 'Strategic planning',
          location: 'HQ Boardroom',
          start: '2026-10-25T10:00:00Z',
          end: '2026-10-25T11:00:00Z',
          allDay: false
        },
        {
          id: 'gcal_event_all_day_02',
          googleEventId: 'event_all_day_02',
          title: 'Product Launch Day',
          start: '2026-11-01',
          end: '2026-11-02',
          allDay: true
        }
      ]
    };
    await storage.set('master_workspace_state', JSON.stringify(cachedWorkspace));

    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/sync',
      query: { action: 'sync' }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200, 'Must return HTTP 200 on cached fallback');
    const data = res._getSentData();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.cached, true, 'Response must identify cached: true');
    assert.strictEqual(data.items.length, 2, 'Must return all 2 cached events');
    assert.strictEqual(data.items[0].summary, 'Quarterly Executive Review');
    assert.strictEqual(data.items[1].start.date, '2026-11-01', 'Preserves start.date for all-day');
  });

  await it('GET /api/calendar/sync with valid token in cookie pulls events from Google and caches to Redis', async () => {
    // Setup fresh token in cookie
    const freshTokenPayload = {
      access_token: 'valid_mock_access_token_123',
      refresh_token: 'valid_refresh_token_456',
      expires_at: Date.now() + 3600000,
      email: 'executive@luminavista.com'
    };
    const cookieHeader = serializeGcalCookie(freshTokenPayload, 'https');

    // Mock global fetch for Google Calendar API
    const origFetch = global.fetch;
    let googleFetchCalled = false;
    let authHeaderSeen = '';
    global.fetch = async (url, opts = {}) => {
      if (url.includes('googleapis.com/calendar/v3/calendars/primary/events')) {
        googleFetchCalled = true;
        authHeaderSeen = opts.headers?.Authorization;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: 'remote_event_99',
                summary: 'Synched Google Keynote',
                description: 'Live broadcast',
                start: { dateTime: '2026-10-30T14:00:00Z' },
                end: { dateTime: '2026-10-30T15:00:00Z' }
              }
            ]
          })
        };
      }
      return origFetch(url, opts);
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/sync',
        query: { action: 'sync' },
        headers: { cookie: cookieHeader }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);
      assert.strictEqual(googleFetchCalled, true, 'Google API fetch should have been invoked');
      assert.strictEqual(authHeaderSeen, 'Bearer valid_mock_access_token_123');
      const data = res._getSentData();
      assert.strictEqual(data.items[0].id, 'remote_event_99');

      // Verify event was cached into master_workspace_state in Redis
      const rawWb = await storage.get('master_workspace_state');
      const wb = JSON.parse(rawWb);
      const cachedItem = wb.calendar.find(e => e.googleEventId === 'remote_event_99');
      assert.ok(cachedItem, 'New Google event must be cached in Redis workspace state');
      assert.strictEqual(cachedItem.title, 'Synched Google Keynote');
    } finally {
      global.fetch = origFetch;
    }
  });

  await it('GET /api/calendar/sync with expired access token automatically refreshes token via Google OAuth', async () => {
    // Expired token (> 60s ago)
    const expiredTokenPayload = {
      access_token: 'expired_access_token_000',
      refresh_token: 'live_refresh_token_777',
      expires_at: Date.now() - 500000,
      email: 'user@example.com'
    };
    const cookieHeader = serializeGcalCookie(expiredTokenPayload, 'https');

    const origFetch = global.fetch;
    let refreshEndpointCalled = false;
    let calendarCalledWithNewToken = false;

    global.fetch = async (url, opts = {}) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        refreshEndpointCalled = true;
        assert.ok(opts.body.includes('grant_type=refresh_token'), 'Refresh request grant type');
        assert.ok(opts.body.includes('live_refresh_token_777'), 'Uses stored refresh token');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'brand_new_access_token_888',
            expires_in: 3600
          })
        };
      }
      if (url.includes('googleapis.com/calendar/v3/calendars/primary/events')) {
        if (opts.headers?.Authorization === 'Bearer brand_new_access_token_888') {
          calendarCalledWithNewToken = true;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [] })
        };
      }
      return origFetch(url, opts);
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/sync',
        query: { action: 'sync' },
        headers: { cookie: cookieHeader }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);
      assert.strictEqual(refreshEndpointCalled, true, 'Refresh endpoint must be called');
      assert.strictEqual(calendarCalledWithNewToken, true, 'Calendar called with fresh access token');

      // Verify response set refreshed cookie with Partitioned
      const setCookie = res._getSentHeaders()['set-cookie'];
      assert.ok(setCookie.includes('Partitioned'), 'Refreshed cookie must have Partitioned');
      assert.ok(setCookie.includes('HttpOnly'));

      // Verify Redis gcal:master_tokens was updated with fresh access token
      const rawRedis = await storage.get('gcal:master_tokens');
      const redisTokens = JSON.parse(rawRedis);
      assert.strictEqual(redisTokens.access_token, 'brand_new_access_token_888');
    } finally {
      global.fetch = origFetch;
    }
  });

  await it('GET /api/calendar/sync with revoked refresh token (invalid_grant) purges Redis tokens and falls back to cache', async () => {
    // Expired token with revoked refresh_token
    const revokedTokenPayload = {
      access_token: 'stale_token_111',
      refresh_token: 'revoked_refresh_token_999',
      expires_at: Date.now() - 500000,
      email: 'user@example.com'
    };
    await storage.set('gcal:master_tokens', JSON.stringify(revokedTokenPayload));

    // Ensure cache has events
    await storage.set('master_workspace_state', JSON.stringify({
      calendar: [{ id: 'cached_fallback_1', title: 'Offline Fallback Event', start: '2026-10-20T00:00:00Z', end: '2026-10-20T01:00:00Z' }]
    }));

    const origFetch = global.fetch;
    global.fetch = async (url, opts = {}) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return {
          ok: false,
          status: 400,
          text: async () => '{"error":"invalid_grant","error_description":"Token has been expired or revoked."}'
        };
      }
      return origFetch(url, opts);
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/sync',
        query: { action: 'sync' }
      });
      await calendarHandler(req, res);
      // Because refresh failed and tokens were purged, it falls back to cached events in Redis!
      assert.strictEqual(res._getStatusCode(), 200, 'Falls back to cached Redis events');
      const data = res._getSentData();
      assert.strictEqual(data.cached, true);
      assert.strictEqual(data.items[0].summary, 'Offline Fallback Event');

      // Verify dead tokens were purged from Redis
      const remainingRedis = await storage.get('gcal:master_tokens');
      assert.strictEqual(remainingRedis, null, 'Dead Redis token key must be deleted on invalid_grant');
    } finally {
      global.fetch = origFetch;
    }
  });

  await it('POST /api/calendar/sync computes strictly exclusive end.date for single-day all-day events', async () => {
    const validToken = {
      access_token: 'valid_push_token_333',
      expires_at: Date.now() + 3600000
    };
    await storage.set('gcal:master_tokens', JSON.stringify(validToken));

    const origFetch = global.fetch;
    let pushedPayload = null;

    global.fetch = async (url, opts = {}) => {
      if (url.includes('googleapis.com/calendar/v3/calendars/primary/events')) {
        pushedPayload = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'new_gcal_id_555', ...pushedPayload })
        };
      }
      return origFetch(url, opts);
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'POST',
        url: '/api/calendar/sync',
        query: { action: 'sync' },
        body: {
          title: 'Whole Day Strategic Offsite',
          allDay: true,
          start: { date: '2026-10-28' },
          end: { date: '2026-10-28' } // User passed same day for end
        }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);
      assert.ok(pushedPayload, 'Must push payload');
      assert.strictEqual(pushedPayload.start.date, '2026-10-28');
      assert.strictEqual(pushedPayload.end.date, '2026-10-29', 'end.date must be start.date + 1 day (exclusive)');
    } finally {
      global.fetch = origFetch;
    }
  });

  await it('DELETE /api/calendar/sync strips gcal_ prefix from eventId before calling Google API', async () => {
    const validToken = {
      access_token: 'valid_delete_token_444',
      expires_at: Date.now() + 3600000
    };
    await storage.set('gcal:master_tokens', JSON.stringify(validToken));

    const origFetch = global.fetch;
    let targetUrlCalled = '';

    global.fetch = async (url, opts = {}) => {
      if (url.includes('googleapis.com/calendar/v3/calendars/primary/events')) {
        targetUrlCalled = url;
        return {
          ok: true,
          status: 200,
          text: async () => ''
        };
      }
      return origFetch(url, opts);
    };

    try {
      const { req, res } = createMockReqRes({
        method: 'DELETE',
        url: '/api/calendar/sync?eventId=gcal_sample_event_id_777',
        query: { action: 'sync', eventId: 'gcal_sample_event_id_777' }
      });
      await calendarHandler(req, res);
      assert.strictEqual(res._getStatusCode(), 200);
      assert.ok(targetUrlCalled.endsWith('/sample_event_id_777'), 'Must strip gcal_ prefix in Google API call');
      const data = res._getSentData();
      assert.strictEqual(data.deletedEventId, 'sample_event_id_777');
    } finally {
      global.fetch = origFetch;
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 6: DISCONNECT ENDPOINT ADVERSARIAL VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 6: Disconnect Endpoint & Complete Teardown]');

  await it('/api/calendar/disconnect: purges Redis tokens, updates workspace state, and clears cookies', async () => {
    // 1. Setup active connection in Redis
    await storage.set('gcal:master_tokens', JSON.stringify({
      access_token: 'token_to_purge',
      refresh_token: 'refresh_to_purge',
      email: 'purge_me@example.com'
    }));

    await storage.set('master_workspace_state', JSON.stringify({
      calendarSettings: {
        googleCalendarConnected: true,
        googleAccountEmail: 'purge_me@example.com'
      }
    }));

    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/calendar/disconnect',
      query: { action: 'disconnect' }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);
    const data = res._getSentData();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.connected, false);

    // 2. Verify Redis token is deleted
    const tokenInRedis = await storage.get('gcal:master_tokens');
    assert.strictEqual(tokenInRedis, null, 'gcal:master_tokens must be deleted from Redis');

    // 3. Verify workspace state updated
    const rawWb = await storage.get('master_workspace_state');
    const wb = JSON.parse(rawWb);
    assert.strictEqual(wb.calendarSettings.googleCalendarConnected, false);
    assert.strictEqual(wb.calendarSettings.googleAccountEmail, undefined);

    // 4. Verify cookie cleared with Max-Age=0 and Partitioned
    const setCookie = res._getSentHeaders()['set-cookie'];
    assert.ok(setCookie.includes('Max-Age=0'), 'Set-Cookie must clear with Max-Age=0');
    assert.ok(setCookie.includes('Partitioned'), 'Clearing cookie must be Partitioned');

    // 5. Verify subsequent /status returns connected: false
    const { req: sReq, res: sRes } = createMockReqRes({
      method: 'GET',
      url: '/api/calendar/status',
      query: { action: 'status' }
    });
    await calendarHandler(sReq, sRes);
    assert.strictEqual(sRes._getStatusCode(), 200);
    assert.strictEqual(sRes._getSentData().connected, false, 'Status must report connected: false');
  });

  // -------------------------------------------------------------------------
  // SECTION 7: OAUTH STATE CSRF & TAMPERING INTEGRITY
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 7: OAuth State CSRF & Tampering Resistance]');

  await it('handleCallback rejects tampered state HMAC with HTTP 400', async () => {
    const tamperedState = Buffer.from(JSON.stringify({
      redirect_uri: PRODUCTION_REDIRECT_URI,
      nonce: 'random_nonce_123',
      ts: Date.now(),
      sig: 'deadbeef_forged_signature_00000000000000000000000000000000000000000000'
    })).toString('base64');

    const { req, res } = createMockReqRes({
      method: 'GET',
      url: `/api/calendar/callback?code=mock_code&state=${tamperedState}`,
      query: { action: 'callback', code: 'mock_code', state: tamperedState }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 400, 'Tampered HMAC signature must return 400');
  });

  await it('handleCallback rejects expired OAuth state (>15 min) with HTTP 400', async () => {
    const tsExpired = Date.now() - (16 * 60 * 1000); // 16 mins ago
    const nonce = 'expired_nonce_999';
    const redirectUri = PRODUCTION_REDIRECT_URI;
    const oauthSecret = process.env.ADMIN_PASSWORD;
    const sig = crypto.createHmac('sha256', oauthSecret).update(`${nonce}:${redirectUri}:${tsExpired}`).digest('hex');

    const expiredState = Buffer.from(JSON.stringify({
      redirect_uri: redirectUri,
      nonce,
      ts: tsExpired,
      sig
    })).toString('base64');

    const { req, res } = createMockReqRes({
      method: 'GET',
      url: `/api/calendar/callback?code=mock_code&state=${expiredState}`,
      query: { action: 'callback', code: 'mock_code', state: expiredState }
    });
    await calendarHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 400, 'Expired state must return 400');
  });

  // Summary
  console.log('\n=================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  if (failures.length > 0) {
    console.log(`❌ ${failures.length} ADVERSARIAL FAILURE(S) DETECTED:`);
    failures.forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.description}`);
      console.log(`     Error: ${f.error.message}`);
    });
  } else {
    console.log(`🎉 ALL ${passedTests} ADVERSARIAL TESTS PASSED!`);
  }
  console.log('=================================================================\n');

  if (failures.length > 0) {
    process.exit(1);
  }
}

runAdversarialCalendarSuite().catch(err => {
  console.error('\n❌ UNHANDLED SUITE ERROR:', err);
  process.exit(1);
});
