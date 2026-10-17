// .agents/teamwork/reviewer_r6_infra/adversarial-infra-test.cjs
// Independent Adversarial Infrastructure & Cloud/Edge Security Verification Harness

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '../../..');

let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${desc}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${desc}`);
  }
}

async function runAdversarialInfraSuite() {
  console.log('\n============================================================');
  console.log('   ADVERSARIAL INFRASTRUCTURE & CLOUD/EDGE VERIFICATION');
  console.log('============================================================\n');

  // Load modules
  const authGuard = await import(pathToFileURL(path.join(repoRoot, 'api/_lib/auth-guard.js')).href);
  const keyPool = await import(pathToFileURL(path.join(repoRoot, 'api/_lib/key-pool.js')).href);
  const redisModule = await import(pathToFileURL(path.join(repoRoot, 'api/_lib/redis.js')).href);
  const calendarModule = await import(pathToFileURL(path.join(repoRoot, 'api/calendar.js')).href);
  const calendarHandler = calendarModule.default;

  // -------------------------------------------------------------
  // 1. CORS ORIGIN ADVERSARIAL STRESS TEST
  // -------------------------------------------------------------
  console.log('[Test Group 1: Strict CORS Origin Validation & Reflection Defense]');

  function testCalendarCors(origin) {
    const headersSent = {};
    const res = {
      setHeader: (k, v) => { headersSent[k.toLowerCase()] = v; },
      getHeader: (k) => headersSent[k.toLowerCase()],
      status: () => res,
      json: () => res,
      end: () => res
    };
    const req = {
      method: 'OPTIONS',
      url: '/api/calendar/status',
      headers: { origin }
    };
    calendarHandler(req, res);
    return res.getHeader('access-control-allow-origin');
  }

  // Hostile / unapproved subdomains on github.io
  check('Hostile subdomain https://evil.github.io is NOT reflected',
    testCalendarCors('https://evil.github.io') === 'https://lumina-vista-sigma.vercel.app');
  check('Hostile subdomain https://attacker.github.io is NOT reflected',
    testCalendarCors('https://attacker.github.io') === 'https://lumina-vista-sigma.vercel.app');
  check('Arbitrary subdomain https://random-user.github.io is NOT reflected',
    testCalendarCors('https://random-user.github.io') === 'https://lumina-vista-sigma.vercel.app');
  check('Bare domain https://github.io is NOT reflected',
    testCalendarCors('https://github.io') === 'https://lumina-vista-sigma.vercel.app');

  // Hostile / spoofed domains on vercel.app
  check('Hostile subdomain https://evil.vercel.app is NOT reflected',
    testCalendarCors('https://evil.vercel.app') === 'https://lumina-vista-sigma.vercel.app');
  check('Hostile subdomain https://attacker.vercel.app is NOT reflected',
    testCalendarCors('https://attacker.vercel.app') === 'https://lumina-vista-sigma.vercel.app');
  check('Pattern-matched but malicious preview https://preview-evil.vercel.app is NOT reflected',
    testCalendarCors('https://preview-evil.vercel.app') === 'https://lumina-vista-sigma.vercel.app');
  check('Pattern-matched but malicious preview https://lumina-vista-phishing.vercel.app is NOT reflected',
    testCalendarCors('https://lumina-vista-phishing.vercel.app') === 'https://lumina-vista-sigma.vercel.app');
  check('Pattern-matched but malicious preview https://custom-attacker-app.vercel.app is NOT reflected',
    testCalendarCors('https://custom-attacker-app.vercel.app') === 'https://lumina-vista-sigma.vercel.app');

  // Domain prefix/suffix bypass attempts
  check('Domain suffix spoof https://subhadraroy.github.io.attacker.com is NOT reflected',
    testCalendarCors('https://subhadraroy.github.io.attacker.com') === 'https://lumina-vista-sigma.vercel.app');
  check('Domain suffix spoof https://lumina-vista-sigma.vercel.app.evil.com is NOT reflected',
    testCalendarCors('https://lumina-vista-sigma.vercel.app.evil.com') === 'https://lumina-vista-sigma.vercel.app');

  // Legitimate whitelisted origins
  check('Whitelisted origin https://subhadraroy.github.io is reflected',
    testCalendarCors('https://subhadraroy.github.io') === 'https://subhadraroy.github.io');
  check('Whitelisted origin https://lumina-vista-sigma.vercel.app is reflected',
    testCalendarCors('https://lumina-vista-sigma.vercel.app') === 'https://lumina-vista-sigma.vercel.app');
  check('Whitelisted preview https://preview-feat-branch.vercel.app is reflected',
    testCalendarCors('https://preview-feat-branch.vercel.app') === 'https://preview-feat-branch.vercel.app');
  check('Whitelisted preview https://custom-preview-branch.vercel.app is reflected',
    testCalendarCors('https://custom-preview-branch.vercel.app') === 'https://custom-preview-branch.vercel.app');
  check('Localhost dev origin http://localhost:3000 is reflected',
    testCalendarCors('http://localhost:3000') === 'http://localhost:3000');
  check('Localhost dev origin http://127.0.0.1:8080 is reflected',
    testCalendarCors('http://127.0.0.1:8080') === 'http://127.0.0.1:8080');

  // Test setSecurityHeaders in auth-guard.js
  function testAuthGuardCors(origin) {
    const headersSent = {};
    const res = {
      setHeader: (k, v) => { headersSent[k.toLowerCase()] = v; }
    };
    const req = { headers: { origin } };
    authGuard.setSecurityHeaders(res, req);
    return headersSent['access-control-allow-origin'];
  }

  check('auth-guard rejects untrusted https://hacker.com',
    testAuthGuardCors('https://hacker.com') === 'https://lumina-vista-sigma.vercel.app');
  check('auth-guard rejects untrusted https://random.github.io',
    testAuthGuardCors('https://random.github.io') === 'https://lumina-vista-sigma.vercel.app');
  check('auth-guard reflects whitelisted https://subhadraroy.github.io',
    testAuthGuardCors('https://subhadraroy.github.io') === 'https://subhadraroy.github.io');

  // -------------------------------------------------------------
  // 2. SSRF PROTECTION ADVERSARIAL STRESS TEST
  // -------------------------------------------------------------
  console.log('\n[Test Group 2: SSRF Protection & FQDN Trailing-Dot Bypasses]');

  // Metadata service variants
  check('SSRF: metadata.google.internal is blocked',
    keyPool.isBlockedSsrfTarget('http://metadata.google.internal/computeMetadata/v1/'));
  check('SSRF: metadata.google.internal. (trailing dot) is blocked',
    keyPool.isBlockedSsrfTarget('http://metadata.google.internal./computeMetadata/v1/'));
  check('SSRF: metadata.google.internal... (multiple trailing dots) is blocked',
    keyPool.isBlockedSsrfTarget('http://metadata.google.internal.../computeMetadata/v1/'));
  check('SSRF: 169.254.169.254 is blocked',
    keyPool.isBlockedSsrfTarget('http://169.254.169.254/latest/meta-data/'));
  check('SSRF: 169.254.169.254. (trailing dot) is blocked',
    keyPool.isBlockedSsrfTarget('http://169.254.169.254./latest/meta-data/'));
  check('SSRF: instance-data is blocked',
    keyPool.isBlockedSsrfTarget('http://instance-data/latest/meta-data/'));
  check('SSRF: metadata is blocked',
    keyPool.isBlockedSsrfTarget('http://metadata/'));

  // Loopback variants
  check('SSRF: 127.0.0.1 is blocked',
    keyPool.isBlockedSsrfTarget('http://127.0.0.1/admin'));
  check('SSRF: 127.0.0.1. (trailing dot) is blocked',
    keyPool.isBlockedSsrfTarget('http://127.0.0.1./admin'));
  check('SSRF: localhost is blocked',
    keyPool.isBlockedSsrfTarget('http://localhost:8080/'));
  check('SSRF: foo.localhost is blocked',
    keyPool.isBlockedSsrfTarget('http://foo.localhost/'));
  check('SSRF: 127.127.127.127 is blocked',
    keyPool.isBlockedSsrfTarget('http://127.127.127.127/'));
  check('SSRF: 0.0.0.0 is blocked',
    keyPool.isBlockedSsrfTarget('http://0.0.0.0:8000/'));

  // Private RFC 1918 ranges
  check('SSRF: 10.0.0.1 is blocked',
    keyPool.isBlockedSsrfTarget('http://10.0.0.1/'));
  check('SSRF: 172.16.0.1 is blocked',
    keyPool.isBlockedSsrfTarget('http://172.16.0.1/'));
  check('SSRF: 172.31.255.255 is blocked',
    keyPool.isBlockedSsrfTarget('http://172.31.255.255/'));
  check('SSRF: 192.168.1.1 is blocked',
    keyPool.isBlockedSsrfTarget('http://192.168.1.1/'));
  check('SSRF: 100.64.0.1 (CGNAT) is blocked',
    keyPool.isBlockedSsrfTarget('http://100.64.0.1/'));

  // IPv6 & IPv6-mapped IPv4 bypasses
  check('SSRF: [::1] is blocked',
    keyPool.isBlockedSsrfTarget('http://[::1]/'));
  check('SSRF: [::ffff:127.0.0.1] is blocked',
    keyPool.isBlockedSsrfTarget('http://[::ffff:127.0.0.1]/'));
  check('SSRF: [::ffff:169.254.169.254] is blocked',
    keyPool.isBlockedSsrfTarget('http://[::ffff:169.254.169.254]/'));
  check('SSRF: [::7f00:1] (hex 127.0.0.1) is blocked',
    keyPool.isBlockedSsrfTarget('http://[::7f00:1]/'));
  check('SSRF: [::a9fe:a9fe] (hex 169.254.169.254) is blocked',
    keyPool.isBlockedSsrfTarget('http://[::a9fe:a9fe]/'));

  // Non-HTTP protocols
  check('SSRF: file:///etc/passwd is blocked',
    keyPool.isBlockedSsrfTarget('file:///etc/passwd'));
  check('SSRF: gopher://127.0.0.1:6379/_... is blocked',
    keyPool.isBlockedSsrfTarget('gopher://127.0.0.1:6379/_'));
  check('SSRF: dict://127.0.0.1:11211/ is blocked',
    keyPool.isBlockedSsrfTarget('dict://127.0.0.1:11211/'));

  // Legitimate cloud endpoints
  check('SSRF: https://api.groq.com/openai/v1 is allowed',
    !keyPool.isBlockedSsrfTarget('https://api.groq.com/openai/v1'));
  check('SSRF: https://api.openai.com/v1/chat/completions is allowed',
    !keyPool.isBlockedSsrfTarget('https://api.openai.com/v1/chat/completions'));

  // normalizeOllamaEndpoint fallback verification
  check('normalizeOllamaEndpoint falls back to cloud on metadata.google.internal.',
    keyPool.normalizeOllamaEndpoint('http://metadata.google.internal./computeMetadata/v1') === 'https://ollama.com/v1/chat/completions');
  check('normalizeOllamaEndpoint falls back to cloud on 169.254.169.254',
    keyPool.normalizeOllamaEndpoint('http://169.254.169.254/latest/meta-data') === 'https://ollama.com/v1/chat/completions');

  // -------------------------------------------------------------
  // 3. CONTENT SECURITY POLICY (CSP) VERIFICATION
  // -------------------------------------------------------------
  console.log('\n[Test Group 3: Strict CSP Directives & Protocol Hygiene]');

  const htmlFiles = ['dashboard.html', 'index.html', '404.html'];
  for (const hf of htmlFiles) {
    const content = fs.readFileSync(path.join(repoRoot, hf), 'utf8');
    const cspMatch = content.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])(.*?)\1/is);
    check(`${hf} contains Content-Security-Policy meta tag`, Boolean(cspMatch));
    if (cspMatch) {
      const val = cspMatch[2];
      check(`${hf} connect-src contains 'self' https: wss:;`, val.includes("connect-src 'self' https: wss:;"));
      check(`${hf} connect-src has zero cleartext http:`, !val.includes('connect-src') || !val.match(/connect-src[^;]*\bhttp:\b/));
      check(`${hf} connect-src has zero cleartext ws:`, !val.includes('connect-src') || !val.match(/connect-src[^;]*\bws:\b/));
      check(`${hf} object-src is 'none'`, val.includes("object-src 'none'"));
      check(`${hf} base-uri is 'self'`, val.includes("base-uri 'self'"));
    }
  }

  // vercel.json headers
  const vercelCfg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  const rootHeaderBlock = vercelCfg.headers.find(h => h.source === '/(.*)');
  check('vercel.json specifies root security headers', Boolean(rootHeaderBlock));
  const cspHeader = rootHeaderBlock?.headers.find(hdr => hdr.key === 'Content-Security-Policy')?.value || '';
  check('vercel.json CSP connect-src uses strictly https: and wss:', cspHeader.includes("connect-src 'self' https: wss:;"));
  check('vercel.json CSP has zero cleartext http:', !cspHeader.match(/connect-src[^;]*\bhttp:\b/));
  check('vercel.json CSP has zero cleartext ws:', !cspHeader.match(/connect-src[^;]*\bws:\b/));

  // -------------------------------------------------------------
  // 4. ENVIRONMENT VARIABLE HANDLING & REDIS ISOLATION
  // -------------------------------------------------------------
  console.log('\n[Test Group 4: Env Variable Fallback & Redis Isolation]');

  const redisCode = fs.readFileSync(path.join(repoRoot, 'api/_lib/redis.js'), 'utf8');
  check('redis.js checks UPSTASH_REDIS_REST_URL, KV_REST_API_URL, REDIS_URL, KV_URL, STORAGE_REDIS_URL',
    redisCode.includes('UPSTASH_REDIS_REST_URL') &&
    redisCode.includes('KV_REST_API_URL') &&
    redisCode.includes('REDIS_URL') &&
    redisCode.includes('KV_URL') &&
    redisCode.includes('STORAGE_REDIS_URL'));

  check('redis.js checks UPSTASH_REDIS_REST_TOKEN, KV_REST_API_TOKEN, REDIS_TOKEN, KV_TOKEN',
    redisCode.includes('UPSTASH_REDIS_REST_TOKEN') &&
    redisCode.includes('KV_REST_API_TOKEN') &&
    redisCode.includes('REDIS_TOKEN') &&
    redisCode.includes('KV_TOKEN'));

  check('redis.js enforces url.startsWith("http")',
    redisCode.includes("url.startsWith('http')"));

  check('redis.js scrubs secrets on errors',
    redisCode.includes('scrubSecrets(rawMsg)'));

  // Test ResilientFallbackStorage memory isolation
  const storage1 = redisModule.getSafeStorage();
  await storage1.set('test_isolation_key', 'isolated_val_42', { ex: 10 });
  const retrieved = await storage1.get('test_isolation_key');
  check('SafeStorage fallback correctly stores and retrieves keys in memory', retrieved === 'isolated_val_42');

  const authCode = fs.readFileSync(path.join(repoRoot, 'api/auth.js'), 'utf8');
  check('auth.js aliases ADMIN_PASSWORD and ADMIN_MASTER_PASSWORD',
    authCode.includes('ADMIN_PASSWORD') && authCode.includes('ADMIN_MASTER_PASSWORD'));
  check('auth.js fails closed if no admin password configured',
    authCode.includes('AUTH_MISCONFIG') && authCode.includes('500'));

  const calCode = fs.readFileSync(path.join(repoRoot, 'api/calendar.js'), 'utf8');
  check('calendar.js aliases GOOGLE_CLIENT_SECRET and GCAL_CLIENT_SECRET',
    calCode.includes('GOOGLE_CLIENT_SECRET') && calCode.includes('GCAL_CLIENT_SECRET'));

  console.log('\n============================================================');
  console.log(`TOTAL ADVERSARIAL CHECKS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialInfraSuite().catch(err => {
  console.error('Adversarial test harness crashed:', err);
  process.exit(1);
});
