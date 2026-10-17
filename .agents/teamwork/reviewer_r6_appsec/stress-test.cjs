// Independent Adversarial Stress Test Script
const assert = require('assert');

(async () => {
  const keyPool = await import('../../../api/_lib/key-pool.js');
  const authGuard = await import('../../../api/_lib/auth-guard.js');
  const jev = await import('../../../api/_lib/jev/jev-guardrails.js');
  const workerHandler = (await import('../../../api/worker.js')).default;
  const adminHandler = (await import('../../../api/admin.js')).default;
  const syncHandler = (await import('../../../api/sync.js')).default;
  const storageHandler = (await import('../../../api/storage.js')).default;
  const redisModule = await import('../../../api/_lib/redis.js');
  const storage = redisModule.getSafeStorage();

  console.log('[PROBE 1: SSRF Edge Cases]');
  assert.strictEqual(keyPool.isBlockedSsrfTarget('http://metadata.google.internal.'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('http://metadata.google.internal..'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('http://169.254.169.254.'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('http://169.254.169.254..'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('http://[::ffff:169.254.169.254]'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('http://[::ffff:127.0.0.1]'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('gopher://127.0.0.1:6379/'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('file:///etc/passwd'), true);
  assert.strictEqual(keyPool.isBlockedSsrfTarget('dict://locahost:11211/'), true);
  console.log('✓ Probe 1 passed: All SSRF targets blocked.');

  console.log('[PROBE 2: Traversal & Path Injection]');
  assert.strictEqual(authGuard.sanitizeFilePath('..%2f..%2fpasswd'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('%252e%252e%252f'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('foo/bar/../../etc'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('test\x00.txt'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('test\x1f.txt'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('test?query=1'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('test#hash'), '');
  assert.strictEqual(authGuard.sanitizeFilePath('normal/path/file.json'), 'normal/path/file.json');
  console.log('✓ Probe 2 passed: All traversal/control char variants blocked.');

  console.log('[PROBE 3: Jev Command Shell Piping & Base64]');
  assert.strictEqual(jev.inspectJevCommandSafety('echo rm -rf / | sh').safe, false);
  assert.strictEqual(jev.inspectJevCommandSafety('echo cm0gLXJmIC8= | base64 -d | bash').safe, false);
  assert.strictEqual(jev.inspectJevCommandSafety('eval $(echo cm0gLXJmIC8= | base64 -d)').safe, false);
  assert.strictEqual(jev.inspectJevCommandSafety('echo "hello world"').safe, true);
  console.log('✓ Probe 3 passed: Dangerous piping and Base64 execution caught.');

  console.log('[PROBE 4: Fail-closed unauthenticated requests to worker, admin, sync, storage]');
  function mockReqRes(method, url, headers = {}, body = {}) {
    let statusCode = 200;
    let data = null;
    const res = {
      statusCode: 200,
      setHeader: () => {},
      status: (c) => { statusCode = c; res.statusCode = c; return res; },
      json: (d) => { data = d; return res; },
      end: () => {},
      _getStatus: () => statusCode,
      _getData: () => data
    };
    return {
      req: { method, url, headers, body, query: {} },
      res
    };
  }

  // Set production env
  process.env.VERCEL = '1';

  // Worker unauthenticated
  const r1 = mockReqRes('GET', '/api/worker?jobId=123');
  await workerHandler(r1.req, r1.res);
  assert.strictEqual(r1.res._getStatus(), 401, 'Worker without auth must return 401');

  // Admin unauthenticated
  const r2 = mockReqRes('GET', '/api/admin');
  await adminHandler(r2.req, r2.res);
  assert.strictEqual(r2.res._getStatus(), 401, 'Admin without auth must return 401');

  // Sync POST unauthenticated
  const r3 = mockReqRes('POST', '/api/sync', {}, { test: 1 });
  await syncHandler(r3.req, r3.res);
  assert.strictEqual(r3.res._getStatus(), 401, 'Sync POST without auth must return 401');

  // Storage delete unauthenticated
  const r4 = mockReqRes('POST', '/api/storage', {}, { action: 'delete', path: 'test.txt' });
  await storageHandler(r4.req, r4.res);
  assert.strictEqual(r4.res._getStatus(), 401, 'Storage delete without auth must return 401');

  console.log('✓ Probe 4 passed: All endpoints fail closed on unauthenticated requests.');

  console.log('\nALL INDEPENDENT ADVERSARIAL PROBES PASSED 100%!');
})().catch(err => {
  console.error('PROBE FAILURE:', err);
  process.exit(1);
});
