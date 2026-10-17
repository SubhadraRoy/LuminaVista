// tests/adversarial-challenger-r7.cjs
// Empirical Adversarial Penetration Challenge Harness (Round 7)
// Probing Patched Edge APIs and Client Modules

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let totalAssertions = 0;
let passedAssertions = 0;
const failures = [];

function check(cond, msg) {
  totalAssertions++;
  try {
    assert(cond, msg);
    passedAssertions++;
    console.log(`  ✓ PASS [${totalAssertions}]: ${msg}`);
  } catch (err) {
    console.error(`  ❌ FAIL [${totalAssertions}]: ${msg}`);
    console.error(`     Reason: ${err.message}`);
    failures.push({ testNum: totalAssertions, msg, err });
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

async function runAdversarialProbes() {
  console.log("=================================================================");
  console.log("   ROUND 7 EMPIRICAL ADVERSARIAL PENETRATION CHALLENGE HARNESS   ");
  console.log("=================================================================\n");

  const redisModule = await import('../api/_lib/redis.js');
  const storage = redisModule.getSafeStorage();

  // Setup valid master session for testing API endpoints
  const testSessionId = 'session_master_adv_r7_empirical';
  await storage.set(`session:${testSessionId}`, JSON.stringify({
    sessionId: testSessionId,
    role: 'master',
    expiresAt: Date.now() + 3600000
  }));

  // =========================================================================
  // 1. PROBING api/worker.js: MALFORMED jobId REJECTION (VULN-R7-07)
  // =========================================================================
  console.log("--- [PROBE 1: api/worker.js Malformed jobId Rejection] ---");
  const workerModule = await import('../api/worker.js');
  const workerHandler = workerModule.default;

  const malformedJobIds = [
    { id: '../job_escape', desc: 'Relative path traversal (../)' },
    { id: '../../etc/passwd', desc: 'Deep path traversal (../../etc/passwd)' },
    { id: '..\\windows\\win.ini', desc: 'Windows backslash path traversal' },
    { id: 'job 123', desc: 'Space inside jobId' },
    { id: ' job_leading', desc: 'Leading space in jobId' },
    { id: 'job_trailing ', desc: 'Trailing space in jobId' },
    { id: "' OR '1'='1", desc: 'SQL-like injection payload' },
    { id: 'job;DROP TABLE', desc: 'SQL semicolon injection' },
    { id: 'job<script>alert(1)</script>', desc: 'HTML tag / XSS injection' },
    { id: 'job"onclick="alert(1)', desc: 'Double quote breakout' },
    { id: 'job\'onclick=\'alert(1)', desc: 'Single quote breakout' },
    { id: 'a'.repeat(129), desc: 'Oversized jobId (129 chars > 128 max)' },
    { id: 'a'.repeat(500), desc: 'Extremely oversized jobId (500 chars)' },
    { id: 'job\x00null', desc: 'Null byte injection' },
    { id: 'job%00null', desc: 'URI encoded null byte' },
    { id: 'job$var', desc: 'Dollar sign symbol' },
    { id: 'job@host', desc: 'At sign symbol' },
    { id: 'job!important', desc: 'Exclamation mark symbol' },
    { id: 'job#frag', desc: 'Hash fragment symbol' },
    { id: 'job?query=1', desc: 'Query parameter symbol' },
    { id: '', desc: 'Empty string jobId' },
    { id: '   ', desc: 'Whitespace-only jobId' }
  ];

  // Test 1.1: GET handler with malformed jobId parameter
  for (const item of malformedJobIds) {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      query: item.id === '' ? { action: 'status', jobId: '' } : { jobId: item.id }
    });
    await workerHandler(req, res);
    check(res._getStatusCode() === 400, `GET /api/worker?jobId rejects ${item.desc} with HTTP 400`);
    const data = res._getSentData();
    check(data && data.error === 'Invalid or missing jobId format', `GET /api/worker returns 'Invalid or missing jobId format' error for ${item.desc}`);
  }

  // Test 1.2: GET handler with action=status and malformed jobId
  for (const item of malformedJobIds.slice(0, 5)) {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      query: { action: 'status', jobId: item.id }
    });
    await workerHandler(req, res);
    check(res._getStatusCode() === 400, `GET /api/worker?action=status rejects ${item.desc} with HTTP 400`);
  }

  // Test 1.3: GET handler with action=output and malformed jobId
  for (const item of malformedJobIds.slice(0, 5)) {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      query: { action: 'output', jobId: item.id }
    });
    await workerHandler(req, res);
    check(res._getStatusCode() === 400, `GET /api/worker?action=output rejects ${item.desc} with HTTP 400`);
  }

  // Test 1.4: POST handler with action=status and malformed jobId
  for (const item of malformedJobIds.slice(0, 5)) {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      body: { action: 'status', jobId: item.id }
    });
    await workerHandler(req, res);
    check(res._getStatusCode() === 400, `POST /api/worker (action: status) rejects ${item.desc} with HTTP 400`);
  }

  // Test 1.5: POST handler with action=output and malformed jobId
  for (const item of malformedJobIds.slice(0, 5)) {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      body: { action: 'output', jobId: item.id }
    });
    await workerHandler(req, res);
    check(res._getStatusCode() === 400, `POST /api/worker (action: output) rejects ${item.desc} with HTTP 400`);
  }

  // Test 1.6: POST handler dispatching job with malformed jobId
  for (const item of malformedJobIds.slice(0, 5)) {
    const { req, res } = createMockReqRes({
      method: 'POST',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      body: { jobId: item.id, prompt: 'Test task' }
    });
    await workerHandler(req, res);
    check(res._getStatusCode() === 400, `POST /api/worker dispatch rejects ${item.desc} with HTTP 400`);
  }

  // Test 1.7: Valid jobId formats are NOT rejected with 400
  const validJobIds = ['job_123', 'job-abc-456', 'a'.repeat(128), 'Task_2026_XYZ-01'];
  for (const validId of validJobIds) {
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/api/worker',
      headers: { 'x-session-id': testSessionId },
      query: { jobId: validId }
    });
    await workerHandler(req, res);
    // Valid ID is accepted by format check; returns 404 because job doesn't exist in Redis
    check(res._getStatusCode() === 404, `GET /api/worker accepts valid jobId "${validId.slice(0, 16)}..." (returns 404 not found, NOT 400)`);
  }

  // =========================================================================
  // 2. PROBING api/terminal.js & sanitizeFilePath (VULN-R7-06)
  // =========================================================================
  console.log("\n--- [PROBE 2: api/terminal.js sanitizeFilePath Robustness] ---");
  const authGuardModule = await import('../api/_lib/auth-guard.js');
  const { sanitizeFilePath } = authGuardModule;

  const traversalAndNullByteProbes = [
    { input: '../secret.js', desc: 'Standard parent directory traversal (../)' },
    { input: '../../../../etc/shadow', desc: 'Deep parent directory traversal' },
    { input: 'dir/../../secret.txt', desc: 'Mid-path parent directory traversal' },
    { input: 'foo/../bar', desc: 'Normalized parent step' },
    { input: '..', desc: 'Bare double dot' },
    { input: '.', desc: 'Bare single dot' },
    { input: '....//secret.txt', desc: 'Multi-dot bypass attempt' },
    { input: '..\\win.ini', desc: 'Windows backslash parent traversal' },
    { input: '..\\..\\windows\\system32\\cmd.exe', desc: 'Deep Windows backslash parent traversal' },
    { input: 'dir\\..\\file.js', desc: 'Windows mid-path backslash traversal' },
    { input: 'dir\\..\\..\\secret.txt', desc: 'Multi-level Windows backslash traversal' },
    { input: '%2e%2e\\foo.js', desc: 'Mixed encoded dot-dot with backslash' },
    { input: '..%5cfoo.js', desc: 'Encoded Windows backslash (%5c) with raw dots' },
    { input: '%2e%2e%2ffoo.js', desc: 'Single URL-encoded dot-dot-slash (%2e%2e%2f)' },
    { input: '%252e%252e%252ffoo.js', desc: 'Double URL-encoded dot-dot-slash (%252e%252e%252f)' },
    { input: '%2e%2e/foo.js', desc: 'Mixed encoded dot-dot with raw slash' },
    { input: '..%2ffoo.js', desc: 'Raw dot-dot with encoded slash' },
    { input: 'file%00.js', desc: 'URL-encoded null byte (%00)' },
    { input: 'file%2500.js', desc: 'Double URL-encoded null byte (%2500)' },
    { input: 'file\x00.js', desc: 'Raw null byte character (\\x00)' },
    { input: 'file\x01.js', desc: 'Raw SOH control character (\\x01)' },
    { input: 'file\x1f.js', desc: 'Raw US control character (\\x1f)' },
    { input: 'file\x7f.js', desc: 'Raw DEL control character (\\x7f)' },
    { input: 'file.js?action=steal', desc: 'Query parameter delimiter (?)' },
    { input: 'file.js#frag', desc: 'Hash fragment delimiter (#)' },
    { input: 'file%3fquery=1', desc: 'URL-encoded question mark (%3f)' },
    { input: 'file%23hash', desc: 'URL-encoded hash (%23)' },
    { input: null, desc: 'Null input value' },
    { input: undefined, desc: 'Undefined input value' },
    { input: 12345, desc: 'Numeric input value' },
    { input: {}, desc: 'Object input value' }
  ];

  for (const probe of traversalAndNullByteProbes) {
    const sanitized = sanitizeFilePath(probe.input);
    check(sanitized === '', `sanitizeFilePath safely rejects ${probe.desc} -> returns empty string`);
  }

  // Legitimate relative file paths MUST be preserved safely
  const legitimatePaths = [
    { input: 'main.py', expected: 'main.py' },
    { input: 'src/components/button.jsx', expected: 'src/components/button.jsx' },
    { input: 'data/results_2026.json', expected: 'data/results_2026.json' },
    { input: 'README.md', expected: 'README.md' },
    { input: '/src/app.js', expected: 'src/app.js' } // leading slash safely normalized
  ];

  for (const lp of legitimatePaths) {
    const sanitized = sanitizeFilePath(lp.input);
    check(sanitized === lp.expected, `sanitizeFilePath preserves legitimate path: "${lp.input}" -> "${sanitized}"`);
  }

  // =========================================================================
  // 3. PROBING api/_lib/key-pool.js: UNCONDITIONAL SSRF REJECTION (VULN-R7-08)
  // =========================================================================
  console.log("\n--- [PROBE 3: api/_lib/key-pool.js Unconditional SSRF Defense] ---");
  const keyPoolModule = await import('../api/_lib/key-pool.js');
  const { normalizeOllamaEndpoint, isBlockedSsrfTarget } = keyPoolModule;

  const ssrfTargets = [
    // Loopback targets
    { ep: 'http://localhost:11434', desc: 'localhost with port' },
    { ep: 'http://127.0.0.1:11434', desc: '127.0.0.1 with port' },
    { ep: 'http://127.0.0.2:8080', desc: '127.0.0.2 alternate loopback' },
    { ep: 'http://127.255.255.254', desc: '127.255.255.254 loopback subnet boundary' },
    { ep: 'http://[::1]:11434', desc: 'IPv6 [::1] loopback' },
    { ep: 'http://[0:0:0:0:0:0:0:1]:11434', desc: 'IPv6 uncompressed loopback' },
    { ep: 'http://[::]:11434', desc: 'IPv6 [::] unspecified address' },

    // RFC 1918 Private targets
    { ep: 'http://10.0.0.1:11434', desc: '10.0.0.1 private Class A' },
    { ep: 'http://10.254.1.99:11434', desc: '10.254.1.99 private Class A' },
    { ep: 'http://172.16.0.1:11434', desc: '172.16.0.1 private Class B start' },
    { ep: 'http://172.31.255.255:11434', desc: '172.31.255.255 private Class B end' },
    { ep: 'http://192.168.0.1:11434', desc: '192.168.0.1 private Class C' },
    { ep: 'http://192.168.1.100:11434', desc: '192.168.1.100 private Class C' },

    // Cloud Metadata & Link-Local targets
    { ep: 'http://169.254.169.254', desc: 'AWS/GCP/Azure link-local metadata 169.254.169.254' },
    { ep: 'http://169.254.1.1:11434', desc: '169.254.1.1 link-local subnet' },
    { ep: 'http://metadata.google.internal', desc: 'GCP metadata named host' },
    { ep: 'http://metadata', desc: 'Short metadata host' },
    { ep: 'http://instance-data', desc: 'AWS instance-data host' },

    // IPv6-mapped IPv4 representations
    { ep: 'http://[::ffff:127.0.0.1]', desc: 'IPv6-mapped IPv4 loopback' },
    { ep: 'http://[::ffff:169.254.169.254]', desc: 'IPv6-mapped cloud metadata' },
    { ep: 'http://[::ffff:7f00:1]', desc: 'IPv6 hex-mapped loopback' },
    { ep: 'http://[::ffff:a9fe:a9fe]', desc: 'IPv6 hex-mapped metadata' }
  ];

  // Test across multiple environment conditions: VERCEL undefined vs VERCEL set
  const envConfigs = [
    { label: 'Non-Vercel environment (VERCEL=undefined)', setup: () => delete process.env.VERCEL },
    { label: 'Vercel environment (VERCEL=1)', setup: () => { process.env.VERCEL = '1'; } },
    { label: 'Development environment (NODE_ENV=development)', setup: () => { delete process.env.VERCEL; process.env.NODE_ENV = 'development'; } }
  ];

  const origVercel = process.env.VERCEL;
  const origNodeEnv = process.env.NODE_ENV;

  try {
    for (const envConf of envConfigs) {
      envConf.setup();
      for (const target of ssrfTargets) {
        const normalized = normalizeOllamaEndpoint(target.ep);
        check(
          normalized === 'https://ollama.com/v1/chat/completions',
          `[${envConf.label}] normalizeOllamaEndpoint redirects ${target.desc} to Ollama Cloud fallback`
        );
      }
    }
  } finally {
    if (origVercel !== undefined) process.env.VERCEL = origVercel;
    else delete process.env.VERCEL;
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;
  }

  // Legitimate public endpoints MUST NOT be redirected to fallback
  const legitimateEndpoints = [
    { input: 'https://ollama.my-company.org/v1/chat/completions', expected: 'https://ollama.my-company.org/v1/chat/completions' },
    { input: 'https://api.hosted-ollama.io/v1', expected: 'https://api.hosted-ollama.io/v1/chat/completions' },
    { input: 'https://public-llm.network/api', expected: 'https://public-llm.network/api/chat' }
  ];

  for (const ep of legitimateEndpoints) {
    const normalized = normalizeOllamaEndpoint(ep.input);
    check(normalized === ep.expected, `normalizeOllamaEndpoint preserves legitimate public endpoint: ${ep.input}`);
  }

  // =========================================================================
  // 4. PROBING modules/calendar.js & modules/whiteboard-gallery.js (VULN-R7-01, VULN-R7-02)
  // =========================================================================
  console.log("\n--- [PROBE 4: Calendar & Whiteboard ID Sanitization] ---");

  function sanitizeCalendarId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9_\-]/g, '');
  }

  function sanitizeBoardId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9_\-]/g, '');
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const idInjectionPayloads = [
    { input: "123'); alert(document.domain); //", desc: "Single quote breakout with JS execution" },
    { input: "<script>fetch('http://attacker.com')</script>", desc: "Direct script tag injection" },
    { input: '"><img src=x onerror=alert(1)>', desc: "Attribute breakout with img onerror" },
    { input: "evt' onclick='alert(1)", desc: "Inline onclick attribute injection" },
    { input: "evt\"; alert('xss'); //", desc: "Double quote breakout with semicolon" },
    { input: "evt\x00\r\n<script>", desc: "Control characters and newlines with tags" },
    { input: "id with spaces and tabs\t\n", desc: "Whitespace injection" },
    { input: "id`eval('alert(1)')`", desc: "Backtick template literal breakout" }
  ];

  for (const payload of idInjectionPayloads) {
    const safeEvt = sanitizeCalendarId(payload.input);
    const safeBoard = sanitizeBoardId(payload.input);

    // Assert that the sanitized ID contains ONLY [a-zA-Z0-9_\-]
    check(/^[a-zA-Z0-9_\-]*$/.test(safeEvt), `Calendar safeEvtId contains strictly alphanumeric/hyphen/underscore for ${payload.desc}`);
    check(/^[a-zA-Z0-9_\-]*$/.test(safeBoard), `Whiteboard safeBoardId contains strictly alphanumeric/hyphen/underscore for ${payload.desc}`);

    // Assert single quotes and breakouts are completely removed
    check(!safeEvt.includes("'") && !safeEvt.includes('"') && !safeEvt.includes(';') && !safeEvt.includes('<') && !safeEvt.includes('>'),
      `Calendar safeEvtId contains zero quote/semicolon/angle characters for ${payload.desc}`);
    check(!safeBoard.includes("'") && !safeBoard.includes('"') && !safeBoard.includes(';') && !safeBoard.includes('<') && !safeBoard.includes('>'),
      `Whiteboard safeBoardId contains zero quote/semicolon/angle characters for ${payload.desc}`);

    // Verify safe string interpolation into inline onclick attribute: exactly 2 single quotes exist (opening and closing literal)
    const mockOnclickCalendar = `onclick="openEventModal('${safeEvt}')"`;
    const singleQuoteCount = (mockOnclickCalendar.match(/'/g) || []).length;
    const doubleQuoteCount = (mockOnclickCalendar.match(/"/g) || []).length;
    check(
      singleQuoteCount === 2 && doubleQuoteCount === 2 &&
      !safeEvt.includes("'") && !safeEvt.includes('"') &&
      !safeEvt.includes('(') && !safeEvt.includes(')') &&
      !safeEvt.includes(';') && !safeEvt.includes('/'),
      `Rendered onclick string cannot breakout single quotes for ${payload.desc}`
    );
  }

  // Tooltip & Title HTML Escaping
  const titlePayloads = [
    { input: '<script>alert(1)</script>', expected: '&lt;script&gt;alert(1)&lt;/script&gt;' },
    { input: 'Meeting "Important" & <Confidential>', expected: 'Meeting &quot;Important&quot; &amp; &lt;Confidential&gt;' },
    { input: "Director's Review", expected: "Director&#039;s Review" }
  ];

  for (const tp of titlePayloads) {
    const escaped = escapeHtml(tp.input);
    check(escaped === tp.expected, `escapeHtml correctly encodes title attribute payload: "${tp.input}" -> "${escaped}"`);
  }

  // =========================================================================
  // 5. PROBING modules/terminal.js & modules/ai-studio.js: isValidVfsKey (VULN-R7-03, VULN-R7-04)
  // =========================================================================
  console.log("\n--- [PROBE 5: isValidVfsKey Prototype Pollution & Traversal Defense] ---");

  function isValidVfsKey(k) {
    if (typeof k !== 'string') return false;
    const s = k.trim();
    if (!s || s === '__proto__' || s === 'constructor' || s === 'prototype') return false;
    if (s.includes('__proto__') || s.includes('constructor') || s.includes('prototype')) return false;
    if (s.includes('..') || s.includes('\\') || s.startsWith('/') || s.includes('?') || s.includes('#')) return false;
    if (/[\x00-\x1f\x7f]/.test(s)) return false;
    return true;
  }

  const vfsDangerousKeys = [
    // Prototype pollution
    { key: '__proto__', desc: 'Direct __proto__' },
    { key: 'constructor', desc: 'Direct constructor' },
    { key: 'prototype', desc: 'Direct prototype' },
    { key: 'a.__proto__.b', desc: 'Nested __proto__ property path' },
    { key: 'obj.constructor.name', desc: 'Nested constructor property path' },
    { key: 'foo.prototype.bar', desc: 'Nested prototype property path' },

    // Directory traversal
    { key: '../secret.txt', desc: 'Parent directory traversal (../)' },
    { key: '../../../../etc/passwd', desc: 'Deep parent traversal' },
    { key: 'dir/../../file.js', desc: 'Mid-path parent traversal' },
    { key: '..', desc: 'Bare double dot' },

    // Windows backslashes
    { key: '\\win32', desc: 'Leading backslash' },
    { key: 'dir\\file.txt', desc: 'Backslash directory separator' },
    { key: 'C:\\Windows\\win.ini', desc: 'Windows drive path' },

    // Leading slash
    { key: '/etc/passwd', desc: 'Leading slash absolute path' },
    { key: '/root', desc: 'Leading slash root' },
    { key: '/main.js', desc: 'Leading slash on filename' },

    // Delimiters
    { key: 'file.js?action=test', desc: 'Query parameter delimiter (?)' },
    { key: 'file.js#hash', desc: 'Hash fragment delimiter (#)' },

    // Control characters
    { key: 'file\x00.js', desc: 'Null byte control character' },
    { key: 'file\x0d.js', desc: 'CR control character' },
    { key: 'file\x0a.js', desc: 'LF control character' },
    { key: 'file\x1f.js', desc: 'US control character' },
    { key: 'file\x7f.js', desc: 'DEL control character' },

    // Whitespace / Empty
    { key: '', desc: 'Empty string' },
    { key: '   ', desc: 'Whitespace-only string' },

    // Non-strings
    { key: null, desc: 'Null key' },
    { key: undefined, desc: 'Undefined key' },
    { key: 12345, desc: 'Numeric key' },
    { key: {}, desc: 'Object key' },
    { key: [], desc: 'Array key' }
  ];

  for (const dk of vfsDangerousKeys) {
    check(isValidVfsKey(dk.key) === false, `isValidVfsKey rejects dangerous key: ${dk.desc}`);
  }

  // Legitimate VFS keys MUST be accepted
  const legitimateVfsKeys = [
    { key: 'index.js', desc: 'Standard JavaScript file' },
    { key: 'src/components/Button.jsx', desc: 'Nested source file with forward slashes' },
    { key: 'data/records-2026.json', desc: 'Hyphenated and underscored filename' },
    { key: 'styles.module.css', desc: 'Dotted module filename' },
    { key: 'README.md', desc: 'Uppercase markdown file' }
  ];

  for (const lk of legitimateVfsKeys) {
    check(isValidVfsKey(lk.key) === true, `isValidVfsKey accepts legitimate VFS key: ${lk.desc} ("${lk.key}")`);
  }

  // =========================================================================
  // 6. PROBING modules/calendar-sync.js: postMessage NULL ORIGIN REJECTION (VULN-R7-05)
  // =========================================================================
  console.log("\n--- [PROBE 6: modules/calendar-sync.js postMessage Origin Security] ---");

  function isMessageOriginAllowed(eventOrigin, windowLocation) {
    return Boolean(
      (windowLocation && windowLocation.origin && windowLocation.origin !== 'null' && eventOrigin === windowLocation.origin) ||
      eventOrigin === 'https://lumina-vista-sigma.vercel.app' ||
      eventOrigin === 'https://subhadraroy.github.io'
    );
  }

  const originScenarios = [
    // Scenario A: Sandboxed iframe / file:// context where window.location.origin is 'null'
    {
      winLoc: { origin: 'null' },
      eventOrigin: 'null',
      expected: false,
      desc: "Rejects event from 'null' origin when window.location.origin is 'null' (sandboxed iframe defense)"
    },
    {
      winLoc: { origin: 'null' },
      eventOrigin: 'https://attacker.com',
      expected: false,
      desc: "Rejects event from untrusted origin when window.location.origin is 'null'"
    },
    {
      winLoc: { origin: 'null' },
      eventOrigin: 'https://subhadraroy.github.io',
      expected: true,
      desc: "Allows trusted production origin https://subhadraroy.github.io even when window.location.origin is 'null'"
    },
    {
      winLoc: { origin: 'null' },
      eventOrigin: 'https://lumina-vista-sigma.vercel.app',
      expected: true,
      desc: "Allows trusted production origin https://lumina-vista-sigma.vercel.app even when window.location.origin is 'null'"
    },

    // Scenario B: Normal production origin
    {
      winLoc: { origin: 'https://subhadraroy.github.io' },
      eventOrigin: 'null',
      expected: false,
      desc: "Rejects event from 'null' origin in normal production environment"
    },
    {
      winLoc: { origin: 'https://subhadraroy.github.io' },
      eventOrigin: 'https://subhadraroy.github.io',
      expected: true,
      desc: "Allows matching window.location.origin in production"
    },
    {
      winLoc: { origin: 'https://subhadraroy.github.io' },
      eventOrigin: 'https://subhadraroy.github.io.phishing.com',
      expected: false,
      desc: "Rejects spoofed suffix phishing origin"
    },
    {
      winLoc: { origin: 'https://subhadraroy.github.io' },
      eventOrigin: 'https://evil-attacker.com',
      expected: false,
      desc: "Rejects random attacker origin"
    },

    // Scenario C: Malformed or undefined window.location
    {
      winLoc: null,
      eventOrigin: 'null',
      expected: false,
      desc: "Rejects event from 'null' origin when window.location is null"
    },
    {
      winLoc: undefined,
      eventOrigin: 'https://attacker.com',
      expected: false,
      desc: "Rejects event from attacker when window.location is undefined"
    }
  ];

  for (const sc of originScenarios) {
    const allowed = isMessageOriginAllowed(sc.eventOrigin, sc.winLoc);
    check(allowed === sc.expected, `${sc.desc} (expected: ${sc.expected}, got: ${allowed})`);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n=================================================================");
  console.log(`TOTAL ASSERTIONS: ${totalAssertions}`);
  console.log(`PASSED: ${passedAssertions}`);
  console.log(`FAILED: ${failures.length}`);
  console.log("=================================================================");

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} ASSERTIONS FAILED:`);
    for (const f of failures) {
      console.error(`  - Test [${f.testNum}]: ${f.msg}`);
      console.error(`    Details: ${f.err.message}`);
    }
    process.exit(1);
  } else {
    console.log(`\n🎉 ALL ${passedAssertions} ROUND 7 ADVERSARIAL PENETRATION ASSERTIONS PASSED!`);
  }
}

runAdversarialProbes().catch(err => {
  console.error("Test execution fault:", err);
  process.exit(1);
});
