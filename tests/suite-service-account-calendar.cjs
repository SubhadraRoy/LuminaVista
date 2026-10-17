// tests/suite-service-account-calendar.cjs
// Comprehensive Integration & Unit Test Suite for Google Service Account (RS256 JWT) Architecture

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

console.log('\n=================================================================');
console.log('   LUMINAVISTA OS: SERVICE ACCOUNT CALENDAR VERIFICATION SUITE   ');
console.log('=================================================================\n');

async function runTests() {
  const {
    base64UrlEncode,
    sanitizePrivateKey,
    getServiceAccountCredentials,
    createServiceAccountJwt,
    getServiceAccountAccessToken,
    invalidateServiceAccountToken
  } = await import('../api/_lib/google-service-auth.js');

  const { getTargetCalendarId } = await import('../api/calendar.js');

  // Generate synthetic RSA key pair for cryptographic testing
  console.log('[SECTION 1: Native RS256 JWT Cryptographic Engine]');
  const { privateKey: testPrivateKey, publicKey: testPublicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // 1. base64UrlEncode tests
  const testStr = 'Lumina Vista 2026';
  const encoded = base64UrlEncode(testStr);
  assert(!encoded.includes('='), 'base64url must not contain padding =');
  assert(!encoded.includes('+'), 'base64url must not contain +');
  assert(!encoded.includes('/'), 'base64url must not contain /');
  console.log('  ✓ PASS: base64UrlEncode produces compliant RFC 7515 URL-safe string');

  // 2. sanitizePrivateKey tests
  const rawKeyWithEscapedNewlines = '"-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk...\\n-----END PRIVATE KEY-----\\n"';
  const sanitized = sanitizePrivateKey(rawKeyWithEscapedNewlines);
  assert(!sanitized.startsWith('"') && !sanitized.endsWith('"'), 'Quotes must be stripped');
  assert(sanitized.includes('\n') && !sanitized.includes('\\n'), 'Escaped newlines must be transformed into real newlines');
  console.log('  ✓ PASS: sanitizePrivateKey strips enclosing quotes and transforms \\n to real newlines');

  // 3. Build-Time Safety test
  const origEnvEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const origEnvKey = process.env.GOOGLE_PRIVATE_KEY;
  const origEnvCalId = process.env.GOOGLE_CALENDAR_ID;

  delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  delete process.env.GOOGLE_PRIVATE_KEY;
  delete process.env.GOOGLE_CALENDAR_ID;

  const buildTimeCreds = getServiceAccountCredentials();
  assert.strictEqual(buildTimeCreds.isConfigured, false, 'Should be unconfigured when env vars are absent');
  assert.strictEqual(buildTimeCreds.email, '', 'Email should be empty string');
  assert.strictEqual(buildTimeCreds.privateKey, '', 'PrivateKey should be empty string');
  console.log('  ✓ PASS: Build-time safety: module evaluation does not throw when env vars are absent');

  // 4. JWT Structure and Verification
  const testEmail = 'lumina-bot@lumina-vista-test.iam.gserviceaccount.com';
  const jwt = createServiceAccountJwt(testEmail, testPrivateKey);
  const [headerB64, claimsB64, sigB64] = jwt.split('.');
  assert(headerB64 && claimsB64 && sigB64, 'JWT must contain 3 dot-separated segments');

  const parsedHeader = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8'));
  assert.strictEqual(parsedHeader.alg, 'RS256', 'Header alg must be RS256');
  assert.strictEqual(parsedHeader.typ, 'JWT', 'Header typ must be JWT');

  const parsedClaims = JSON.parse(Buffer.from(claimsB64, 'base64').toString('utf8'));
  assert.strictEqual(parsedClaims.iss, testEmail, 'Claim iss must match service account email');
  assert.strictEqual(parsedClaims.aud, 'https://oauth2.googleapis.com/token', 'Claim aud must match Google token endpoint');
  assert(parsedClaims.scope.includes('https://www.googleapis.com/auth/calendar'), 'Claim scope must request calendar permissions');
  assert(parsedClaims.exp > parsedClaims.iat, 'Token expiration must be in the future');

  // Cryptographically verify RS256 signature using testPublicKey
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${claimsB64}`);
  verifier.end();
  // Decode base64url signature back to raw buffer
  let sigBase64 = sigB64.replace(/-/g, '+').replace(/_/g, '/');
  while (sigBase64.length % 4) sigBase64 += '=';
  const sigBuffer = Buffer.from(sigBase64, 'base64');
  const isValidSignature = verifier.verify(testPublicKey, sigBuffer);
  assert.strictEqual(isValidSignature, true, 'RS256 signature must be mathematically valid against RSA public key');
  console.log('  ✓ PASS: RS256 JWT generated and cryptographically verified against public key');

  // SECTION 2: Dynamic Calendar ID Routing
  console.log('\n[SECTION 2: Dynamic Target Calendar ID Routing]');
  // Case A: Default when no env or request
  const defaultCalId = getTargetCalendarId();
  assert.strictEqual(defaultCalId, 'primary', 'Default should fallback to primary');
  console.log('  ✓ PASS: getTargetCalendarId defaults to primary when unconfigured');

  // Case B: Request query parameter
  const queryCalId = getTargetCalendarId({ query: { calendarId: 'user_shared@gmail.com' } });
  assert.strictEqual(queryCalId, 'user_shared@gmail.com', 'Should read from req.query.calendarId');
  console.log('  ✓ PASS: getTargetCalendarId resolves from query.calendarId');

  // Case C: Request body parameter
  const bodyCalId = getTargetCalendarId({ body: { calendarId: 'custom_cal_123' } });
  assert.strictEqual(bodyCalId, 'custom_cal_123', 'Should read from req.body.calendarId');
  console.log('  ✓ PASS: getTargetCalendarId resolves from body.calendarId');

  // Case D: GOOGLE_CALENDAR_ID in process.env takes precedence
  process.env.GOOGLE_CALENDAR_ID = 'sovereign_personal@gmail.com';
  const envCalId = getTargetCalendarId({ query: { calendarId: 'override_attempt' } });
  assert.strictEqual(envCalId, 'sovereign_personal@gmail.com', 'process.env.GOOGLE_CALENDAR_ID must take precedence');
  console.log('  ✓ PASS: process.env.GOOGLE_CALENDAR_ID takes authoritative precedence');

  // SECTION 3: Token Exchange Mock & In-Memory Caching
  console.log('\n[SECTION 3: Token Exchange Mock & In-Memory Caching]');
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = testEmail;
  process.env.GOOGLE_PRIVATE_KEY = testPrivateKey;

  // Intercept fetch for token exchange testing
  const originalFetch = global.fetch;
  let fetchCallCount = 0;
  global.fetch = async (url, opts) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      fetchCallCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `mock_sa_access_token_${fetchCallCount}`,
          token_type: 'Bearer',
          expires_in: 3600
        }),
        text: async () => JSON.stringify({ access_token: 'mock' })
      };
    }
    return originalFetch(url, opts);
  };

  try {
    invalidateServiceAccountToken();
    const token1 = await getServiceAccountAccessToken();
    assert.strictEqual(token1.ok, true, 'First token fetch must succeed');
    assert.strictEqual(token1.cached, false, 'First token fetch must not be cached');
    assert.strictEqual(token1.accessToken, 'mock_sa_access_token_1');
    assert.strictEqual(fetchCallCount, 1, 'Should invoke fetch once');

    // Immediate second call should hit in-memory cache
    const token2 = await getServiceAccountAccessToken();
    assert.strictEqual(token2.ok, true, 'Second token fetch must succeed');
    assert.strictEqual(token2.cached, true, 'Second token fetch must hit in-memory cache');
    assert.strictEqual(token2.accessToken, 'mock_sa_access_token_1', 'Must return cached token value');
    assert.strictEqual(fetchCallCount, 1, 'Cache hit must not invoke network fetch');
    console.log('  ✓ PASS: In-memory token caching prevents redundant token network exchanges');

    // Invalidation clears cache and forces re-exchange
    invalidateServiceAccountToken();
    const token3 = await getServiceAccountAccessToken();
    assert.strictEqual(token3.ok, true);
    assert.strictEqual(token3.cached, false, 'After invalidation, should re-fetch fresh token');
    assert.strictEqual(token3.accessToken, 'mock_sa_access_token_2');
    assert.strictEqual(fetchCallCount, 2, 'Should invoke fetch after invalidation');
    console.log('  ✓ PASS: invalidateServiceAccountToken() cleanly purges expired/401 tokens');
  } finally {
    global.fetch = originalFetch;
    invalidateServiceAccountToken();
  }

  // Restore environment variables
  if (origEnvEmail !== undefined) process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEnvEmail;
  else delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (origEnvKey !== undefined) process.env.GOOGLE_PRIVATE_KEY = origEnvKey;
  else delete process.env.GOOGLE_PRIVATE_KEY;
  if (origEnvCalId !== undefined) process.env.GOOGLE_CALENDAR_ID = origEnvCalId;
  else delete process.env.GOOGLE_CALENDAR_ID;

  console.log('\n=================================================================');
  console.log('🎉 ALL SERVICE ACCOUNT VERIFICATION TESTS PASSED CLEANLY (100%)!');
  console.log('=================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
