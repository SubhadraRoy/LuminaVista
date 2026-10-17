// tests/suite-calendar-sync-forensic.cjs
// Forensic integration & adversarial verification suite for Google Calendar synchronization
// Validates:
// 1. Fetching events with valid token
// 2. 401 Expired Token -> automatic token refresh via refresh_token -> storage/cookie update -> retry & success
// 3. 410 Gone Invalid SyncToken -> clear syncToken -> full re-sync recovery
// 4. Hard cache-bypass (Cache-Control: no-cache) preventing stale cached fallback
// 5. Zero silent error swallowing: structured HTTP status & Google API error details surfaced
// 6. Frontend UI state: accurate badge rendering and error indication

const assert = require('assert');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

async function it(title, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ PASS [${passedTests}]: ${title}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${title}`);
    console.error(err);
    process.exit(1);
  }
}

// Mock Request / Response helper
function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/api/calendar/sync',
    headers: Object.assign({
      host: 'lumina-vista-sigma.vercel.app',
      'x-forwarded-proto': 'https'
    }, options.headers || {}),
    query: options.query || {},
    body: options.body || {}
  };

  const headersSent = {};
  let statusCode = 200;
  let sentData = null;

  const res = {
    _headers: headersSent,
    setHeader(key, val) {
      headersSent[key.toLowerCase()] = val;
    },
    getHeader(key) {
      return headersSent[key.toLowerCase()];
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      sentData = data;
      return res;
    },
    send(data) {
      sentData = data;
      return res;
    },
    end() {
      return res;
    },
    _getStatusCode() {
      return statusCode;
    },
    _getSentData() {
      return sentData;
    }
  };

  return { req, res };
}

async function runForensicSuite() {
  console.log('\n=================================================================');
  console.log('   LUMINAVISTA OS: FORENSIC GOOGLE CALENDAR SYNC VERIFICATION   ');
  console.log('=================================================================\n');

  // Import target modules
  const {
    getGoogleOAuthCredentials,
    resolveRedirectUri,
    executeGoogleCalendarApi,
    default: calendarHandler
  } = await import('../api/calendar.js');
  const { getSafeStorage } = await import('../api/_lib/redis.js');
  const storage = getSafeStorage();

  // -------------------------------------------------------------------------
  // SECTION 1: Environment & Credential Aliases Resolution
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: OAuth2 Credentials & Environment Aliasing]');

  await it('getGoogleOAuthCredentials resolves standard GOOGLE_ and fallback GCAL_ aliases', () => {
    const origId = process.env.GOOGLE_CLIENT_ID;
    const origSec = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    process.env.GCAL_CLIENT_ID = 'mock-gcal-id-123.apps.googleusercontent.com';
    process.env.GCAL_CLIENT_SECRET = 'mock-gcal-secret-456';

    const creds = getGoogleOAuthCredentials();
    assert.strictEqual(creds.clientId, 'mock-gcal-id-123.apps.googleusercontent.com');
    assert.strictEqual(creds.clientSecret, 'mock-gcal-secret-456');

    // Restore
    if (origId) process.env.GOOGLE_CLIENT_ID = origId;
    if (origSec) process.env.GOOGLE_CLIENT_SECRET = origSec;
    delete process.env.GCAL_CLIENT_ID;
    delete process.env.GCAL_CLIENT_SECRET;
  });

  // -------------------------------------------------------------------------
  // SECTION 2: Live Mock Google API Server Simulation
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: Live Mock API Simulation (401 Refresh & 410 SyncToken)]');

  let oauthTokenRequests = 0;
  let primaryEventRequests = 0;
  let syncTokenSimState = 'initial'; // 'initial', 'expired', 'recovered'
  let tokenValidityState = 'valid'; // 'valid', 'expired_once', 'refreshed'

  // Spin up an authentic HTTP mock server simulating Google OAuth & Calendar v3 REST endpoints
  const mockServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // A. Google OAuth2 Token Endpoint: https://oauth2.googleapis.com/token
    if (url.pathname === '/token') {
      oauthTokenRequests++;
      let bodyStr = '';
      req.on('data', chunk => { bodyStr += chunk; });
      req.on('end', () => {
        const params = new URLSearchParams(bodyStr);
        const grantType = params.get('grant_type');
        const refreshToken = params.get('refresh_token');

        if (grantType === 'refresh_token' && refreshToken === 'valid_test_refresh_token_999') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_type: 'offline',
            access_token: 'fresh_refreshed_access_token_888',
            expires_in: 3600,
            token_type: 'Bearer'
          }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.'
          }));
        }
      });
      return;
    }

    // B. Google Calendar Events Endpoint: /calendar/v3/calendars/primary/events
    if (url.pathname.includes('/calendars/primary/events')) {
      primaryEventRequests++;
      const authHeader = req.headers['authorization'] || '';

      // Test Case B: Simulate 401 on expired token, success on fresh token
      if (tokenValidityState === 'expired_once') {
        if (authHeader !== 'Bearer fresh_refreshed_access_token_888') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: {
              code: 401,
              message: 'Invalid Credentials: token expired',
              status: 'UNAUTHENTICATED'
            }
          }));
          return;
        }
      }

      // Test Case C: Simulate 410 Gone when syncToken is expired
      const syncToken = url.searchParams.get('syncToken');
      if (syncToken === 'expired_sync_token_410') {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            code: 410,
            message: 'Sync token is no longer valid, a full sync is required.',
            status: 'GONE'
          }
        }));
        return;
      }

      // Return legitimate Google Calendar event items
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        kind: 'calendar#events',
        items: [
          {
            id: 'mock_live_event_001',
            summary: 'Executive Architecture Sync',
            description: 'Live synced from Google API',
            start: { dateTime: '2026-10-18T10:00:00Z' },
            end: { dateTime: '2026-10-18T11:00:00Z' }
          }
        ],
        nextSyncToken: 'new_valid_sync_token_555'
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockBase = `http://127.0.0.1:${port}`;

  // Patch global fetch or endpoint URL to redirect Google OAuth and Calendar calls to our mock server
  const origFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    let url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      url = `${mockBase}/token`;
    } else if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/primary/events')) {
      const rest = url.replace('https://www.googleapis.com/calendar/v3', '');
      url = `${mockBase}${rest}`;
    }
    return origFetch(url, init);
  };

  try {
    // -----------------------------------------------------------------------
    // TEST (a): Fetching events with a valid access token
    // -----------------------------------------------------------------------
    await it('(a) executeGoogleCalendarApi fetches events successfully with a valid access token', async () => {
      tokenValidityState = 'valid';
      const result = await executeGoogleCalendarApi(`${mockBase}/calendars/primary/events`, {
        method: 'GET',
        accessToken: 'valid_live_token_111'
      });

      assert.strictEqual(result.ok, true, 'Result must be ok: true');
      assert.strictEqual(result.status, 200, 'Status must be HTTP 200');
      assert(Array.isArray(result.data.items), 'Must return items array');
      assert.strictEqual(result.data.items[0].summary, 'Executive Architecture Sync');
      assert.strictEqual(result.data.items[0].id, 'mock_live_event_001');
    });

    // -----------------------------------------------------------------------
    // TEST (b): 401 Expired Token -> Automatic Token Refresh -> Retry -> Success
    // -----------------------------------------------------------------------
    await it('(b) executeGoogleCalendarApi handles 401 Expired Token by automatically refreshing token, updating Redis, and succeeding on retry', async () => {
      tokenValidityState = 'expired_once';
      oauthTokenRequests = 0;

      // Seed expired token with valid refresh_token in Redis
      const expiredPayload = {
        access_token: 'stale_expired_token_000',
        refresh_token: 'valid_test_refresh_token_999',
        expires_at: Date.now() - 100000,
        email: 'roysubhadra40@gmail.com'
      };
      await storage.set('gcal:master_tokens', JSON.stringify(expiredPayload));
      process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-xyz';

      const { req, res } = createMockReqRes({
        headers: {
          cookie: `gcal_token=${Buffer.from(JSON.stringify(expiredPayload)).toString('base64')}`
        }
      });

      const result = await executeGoogleCalendarApi(`${mockBase}/calendars/primary/events`, {
        method: 'GET'
      }, req, res);

      assert.strictEqual(result.ok, true, 'Retry must succeed with ok: true');
      assert.strictEqual(result.status, 200, 'Final response status must be HTTP 200');
      assert.strictEqual(oauthTokenRequests, 1, 'Must have called Google OAuth /token endpoint to refresh');
      assert.strictEqual(result.data.items[0].summary, 'Executive Architecture Sync');

      // Verify that Redis was updated with the fresh access token
      const updatedRedisRaw = await storage.get('gcal:master_tokens');
      const updatedRedis = typeof updatedRedisRaw === 'string' ? JSON.parse(updatedRedisRaw) : updatedRedisRaw;
      assert.strictEqual(updatedRedis.access_token, 'fresh_refreshed_access_token_888', 'Redis master tokens must be updated with refreshed access token');

      // Verify that response Set-Cookie was issued
      const cookieHeader = res.getHeader('set-cookie');
      assert(cookieHeader && cookieHeader.includes('gcal_token='), 'Must set updated gcal_token cookie on response');
    });

    // -----------------------------------------------------------------------
    // TEST (c): 410 Gone (Invalid SyncToken) -> Clear syncToken -> Full Resync
    // -----------------------------------------------------------------------
    await it('(c) executeGoogleCalendarApi handles 410 Gone (expired syncToken) by clearing syncToken and recovering via full sync', async () => {
      tokenValidityState = 'valid';

      const result = await executeGoogleCalendarApi(`${mockBase}/calendars/primary/events`, {
        method: 'GET',
        syncToken: 'expired_sync_token_410',
        accessToken: 'fresh_refreshed_access_token_888'
      });

      assert.strictEqual(result.ok, true, 'Recovery call must succeed with ok: true');
      assert.strictEqual(result.status, 200, 'Status must be HTTP 200 after recovery');
      assert.strictEqual(result.data.items[0].id, 'mock_live_event_001');
      assert.strictEqual(result.data.nextSyncToken, 'new_valid_sync_token_555');
    });

    // -----------------------------------------------------------------------
    // TEST (d): Hard Cache-Bypass (Cache-Control: no-cache)
    // -----------------------------------------------------------------------
    await it('(d) /api/calendar/sync respects Cache-Control: no-cache and NEVER returns stale cached events when unauthenticated', async () => {
      // Clear all active tokens from Redis
      await storage.del('gcal:master_tokens');

      // Seed stale events into master_workspace_state
      const staleWorkspace = {
        calendar: [
          {
            id: 'gcal_stale_ghost_event',
            title: 'Stale Ghost Event That Should Be Bypassed',
            start: '2026-10-01',
            end: '2026-10-02',
            allDay: true
          }
        ]
      };
      await storage.set('master_workspace_state', JSON.stringify(staleWorkspace));

      // Request 1: Without cache bypass, should return cached fallback (for offline sovereignty)
      const { req: req1, res: res1 } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/sync',
        query: { action: 'sync' }
      });
      await calendarHandler(req1, res1);
      assert.strictEqual(res1._getStatusCode(), 200, 'Default request falls back to cached events');
      assert.strictEqual(res1._getSentData().cached, true, 'Default response identifies cached: true');

      // Request 2: With hard cache bypass (Cache-Control: no-cache), MUST return HTTP 401 Unauthenticated
      const { req: req2, res: res2 } = createMockReqRes({
        method: 'GET',
        url: '/api/calendar/sync',
        query: { action: 'sync' },
        headers: {
          'cache-control': 'no-cache',
          'pragma': 'no-cache'
        }
      });
      await calendarHandler(req2, res2);
      assert.strictEqual(res2._getStatusCode(), 401, 'Cache-bypass request MUST return HTTP 401 when unauthenticated');
      const data2 = res2._getSentData();
      assert.strictEqual(data2.connected, false);
      assert.strictEqual(data2.needsReauth, true);
      assert(data2.error.includes('Not connected to Google Calendar'), 'Must explain authentication requirement');
    });

    // -----------------------------------------------------------------------
    // TEST (e): Zero Silent Error Swallowing: Non-retryable errors surface structured details
    // -----------------------------------------------------------------------
    await it('(e) executeGoogleCalendarApi surfaces structured error details without silent swallowing on non-retryable errors', async () => {
      // Direct call to nonexistent endpoint returning 404
      const result = await executeGoogleCalendarApi(`${mockBase}/nonexistent/endpoint`, {
        method: 'GET',
        accessToken: 'fresh_refreshed_access_token_888'
      });

      assert.strictEqual(result.ok, false, 'Must return ok: false on error');
      assert.strictEqual(result.status, 404, 'Must return exact HTTP status code 404');
      assert(result.error !== undefined, 'Must expose error message');
      assert(result.googleError !== undefined, 'Must expose googleError object');
    });

  } finally {
    global.fetch = origFetch;
    mockServer.close();
  }

  // -------------------------------------------------------------------------
  // SECTION 3: Frontend Client Integration & Badge State
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: Frontend Client State & Badge Guardrails]');

  await it('Client syncGoogleCalendar dispatches Cache-Control: no-cache on manual sync and updates error state on failure', async () => {
    // Emulate DOM window environment
    const fakeWindow = {
      location: { hostname: 'localhost', protocol: 'http:' },
      addEventListener: () => {},
      removeEventListener: () => {},
      localStorage: {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); }
      }
    };

    let fetchHeaders = null;
    fakeWindow.fetch = async (url, opts) => {
      fetchHeaders = opts.headers;
      return {
        ok: false,
        status: 401,
        json: async () => ({
          connected: false,
          needsReauth: false,
          error: 'Google Calendar sync failed. Service Account credentials required.'
        })
      };
    };

    // Load and evaluate modules/calendar-sync.js in sandbox
    const fs = require('fs');
    const syncCode = fs.readFileSync('./modules/calendar-sync.js', 'utf8');
    const vm = require('vm');
    const ctx = vm.createContext({
      window: fakeWindow,
      document: {
        getElementById: () => null,
        readyState: 'complete',
        addEventListener: () => {}
      },
      localStorage: fakeWindow.localStorage,
      fetch: fakeWindow.fetch,
      console,
      setInterval: () => {},
      setTimeout: () => {}
    });
    vm.runInContext(syncCode, ctx);

    // Trigger manual sync
    await ctx.window.LuminaCalendarSync.syncGoogleCalendar(true);

    assert(fetchHeaders !== null, 'Fetch must have been called');
    assert.strictEqual(fetchHeaders['Cache-Control'], 'no-cache', 'Manual sync MUST pass Cache-Control: no-cache');
    assert.strictEqual(fetchHeaders['Pragma'], 'no-cache', 'Manual sync MUST pass Pragma: no-cache');

    const settings = JSON.parse(fakeWindow.localStorage.getItem('luminavista_calendar_settings_v1') || '{}');
    assert.strictEqual(settings.googleCalendarConnected, false, 'googleCalendarConnected must be false on 401');
    assert(settings.lastSyncError && settings.lastSyncError.includes('Google Calendar sync failed'), 'lastSyncError must be recorded in settings');
  });

  console.log('\n=================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('🎉 ALL FORENSIC GOOGLE CALENDAR SYNC INTEGRATION TESTS PASSED!');
  console.log('=================================================================\n');
}

runForensicSuite().catch(err => {
  console.error('Forensic test runner uncaught exception:', err);
  process.exit(1);
});
