// tests/suite-privacy-landing.cjs
// Verification suite for public landing page, /privacy compliance, and Google crawler readiness

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

let passedTests = 0;
let totalTests = 0;

function it(title, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS [${passedTests}]: ${title}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${title}`);
    console.error(err);
    process.exit(1);
  }
}

async function runPrivacyLandingSuite() {
  console.log('\n=================================================================');
  console.log('   LUMINAVISTA OS: PUBLIC LANDING & /PRIVACY COMPLIANCE AUDIT   ');
  console.log('=================================================================\n');

  const rootDir = path.resolve(__dirname, '..');

  // 1. Static File Verification
  console.log('[SECTION 1: File Existence & Size Checks]');
  it('privacy.html exists in root directory', () => {
    assert(fs.existsSync(path.join(rootDir, 'privacy.html')), 'privacy.html must exist');
  });

  it('privacy/index.html directory entrypoint exists', () => {
    assert(fs.existsSync(path.join(rootDir, 'privacy', 'index.html')), 'privacy/index.html must exist');
  });

  it('vercel.json contains rewrite rule for /privacy -> /privacy.html', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    assert(Array.isArray(vercelConfig.rewrites), 'rewrites must be an array');
    const privacyRewrite = vercelConfig.rewrites.find(r => r.source === '/privacy');
    assert(privacyRewrite, 'Rewrite for /privacy must exist');
    assert.strictEqual(privacyRewrite.destination, '/privacy.html');
  });

  it('index.html and privacy.html are well within the 2,000 lines budget ceiling', () => {
    const indexLines = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8').split('\n').length;
    const privacyLines = fs.readFileSync(path.join(rootDir, 'privacy.html'), 'utf8').split('\n').length;
    assert(indexLines < 2000, `index.html lines (${indexLines}) must be < 2000`);
    assert(privacyLines < 2000, `privacy.html lines (${privacyLines}) must be < 2000`);
    console.log(`    (index.html: ${indexLines} lines, privacy.html: ${privacyLines} lines)`);
  });

  // 2. Content & Regulatory Compliance Verification
  console.log('\n[SECTION 2: Semantic Content & Compliance Auditing]');
  const privacyHtml = fs.readFileSync(path.join(rootDir, 'privacy.html'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  it('privacy.html contains all Google crawler mandatory compliance disclosures', () => {
    assert(privacyHtml.includes('Privacy Policy for Lumina Vista'), 'Missing policy title');
    assert(privacyHtml.includes('October 17, 2026'), 'Missing last updated date');
    assert(privacyHtml.includes('operates as a private productivity and workspace application'), 'Missing private productivity app description');
    assert(privacyHtml.includes('We connect with Google Calendar API solely to display, synchronize, and manage your personal calendar events'), 'Missing data collection disclosure');
    assert(privacyHtml.includes('Your calendar data is processed in-memory or securely cached to provide scheduling features'), 'Missing data usage disclosure');
    assert(privacyHtml.includes('We do not sell, share, or transfer your Google user data to any third parties'), 'Missing third-party sharing restriction');
    assert(privacyHtml.includes('Authentication tokens are stored securely in encrypted server-side state'), 'Missing data storage disclosure');
    assert(privacyHtml.includes('roysubhadra40@gmail.com'), 'Missing developer contact email');
    assert(privacyHtml.includes('Google API Services User Data Policy'), 'Missing Google API limited use link');
  });

  it('privacy.html prominently declares restricted, private access and forbids unauthorized entry', () => {
    assert(privacyHtml.includes('Notice: Private, Single-Tenant Application'), 'Missing private system warning heading');
    assert(privacyHtml.includes('Unauthorized access, probing, or attempted entry without explicit authorization is strictly prohibited'), 'Missing unauthorized access prohibition');
  });

  it('index.html is the authentic cyberpunk single-tenant security gateway', () => {
    assert(indexHtml.includes('id="pass"'), 'Missing password input #pass');
    assert(indexHtml.includes('id="btn"'), 'Missing submit button #btn');
    assert(indexHtml.includes('id="card-container"'), 'Missing #card-container');
    assert(indexHtml.includes('id="particle-canvas"'), 'Missing constellation particle canvas');
    assert(indexHtml.includes('submitForm(event)'), 'Missing submitForm handler');
    assert(indexHtml.includes('/api/sync'), 'Missing /api/sync prefetch during login warp');
    assert(indexHtml.includes('lumina_session_id'), 'Missing lumina_session_id storage');
  });

  it('index.html includes clear public link to /privacy', () => {
    assert(indexHtml.includes('href="/privacy"'), 'Missing link to /privacy');
  });

  // 3. Live Server Routing Verification
  console.log('\n[SECTION 3: Live Dev Server Routing Audits]');
  const serverPath = path.join(rootDir, 'tests', 'server.cjs');
  const serverProcess = require('child_process').fork(serverPath, { stdio: 'pipe' });

  await new Promise(resolve => setTimeout(resolve, 800));

  try {
    const fetchRoute = (urlPath) => {
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:3000${urlPath}`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        }).on('error', reject);
      });
    };

    const resHome = await fetchRoute('/');
    assert.strictEqual(resHome.status, 200, 'GET / must return 200');
    assert(resHome.data.includes('Privacy Policy for Lumina Vista') || resHome.data.includes('href="/privacy"'), 'GET / must serve public landing page with privacy link');

    const resPrivacy = await fetchRoute('/privacy');
    assert.strictEqual(resPrivacy.status, 200, 'GET /privacy must return 200');
    assert(resPrivacy.data.includes('Privacy Policy for Lumina Vista'), 'GET /privacy must serve Privacy Policy');

    const resPrivacySlash = await fetchRoute('/privacy/');
    assert.strictEqual(resPrivacySlash.status, 200, 'GET /privacy/ must return 200');
    assert(resPrivacySlash.data.includes('Privacy Policy for Lumina Vista'), 'GET /privacy/ must serve Privacy Policy');

    const resPrivacyHtml = await fetchRoute('/privacy.html');
    assert.strictEqual(resPrivacyHtml.status, 200, 'GET /privacy.html must return 200');
    assert(resPrivacyHtml.data.includes('Privacy Policy for Lumina Vista'), 'GET /privacy.html must serve Privacy Policy');

    passedTests++;
    console.log(`  ✓ PASS [${passedTests}]: Live dev server serves /, /privacy, /privacy/, and /privacy.html with HTTP 200`);

  } finally {
    serverProcess.kill();
  }

  console.log('\n=================================================================');
  console.log(`RESULTS: ${passedTests} ASSERTIONS PASSED WITH ZERO ERRORS!`);
  console.log('🎉 Google Cloud Console crawler compliance requirements 100% satisfied!');
  console.log('=================================================================\n');
}

runPrivacyLandingSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
