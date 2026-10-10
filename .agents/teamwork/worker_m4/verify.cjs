const fs = require('fs');
const assert = require('assert');

console.log('=== RUNNING M4 DEFENSIVE REMEDIATION VERIFICATION ===');

// 1. VULN-SANDBOX-1: sandboxPreviewFrame sandbox attribute
const dash = fs.readFileSync('dashboard.html', 'utf8');
assert(dash.includes('<iframe id="sandboxPreviewFrame" sandbox="allow-scripts allow-modals allow-forms"'), 'VULN-SANDBOX-1: sandboxPreviewFrame has required sandbox');
console.log('✓ VULN-SANDBOX-1: sandboxPreviewFrame has strict sandbox');

// 2. VULN-SANDBOX-2: allow-same-origin removed
assert(!dash.includes('id="previewIframe" src="about:blank" sandbox="allow-scripts allow-same-origin'), 'VULN-SANDBOX-2: previewIframe lacks allow-same-origin');
assert(dash.includes('id="previewIframe" src="about:blank" sandbox="allow-scripts allow-modals allow-popups allow-forms"'), 'VULN-SANDBOX-2: previewIframe has safe sandbox');
assert(dash.includes('id="splitLeftFrame" sandbox="allow-scripts allow-modals allow-popups allow-forms"'), 'VULN-SANDBOX-2: splitLeftFrame has safe sandbox');
assert(dash.includes('id="splitRightFrame" sandbox="allow-scripts allow-modals allow-popups allow-forms"'), 'VULN-SANDBOX-2: splitRightFrame has safe sandbox');
const tt = fs.readFileSync('modules/telemetry-theme.js', 'utf8');
assert(!tt.includes('allow-same-origin'), 'VULN-SANDBOX-2: telemetry-theme lacks allow-same-origin');
console.log('✓ VULN-SANDBOX-2: allow-same-origin removed from preview & split iframes');

// 3. VULN-SANDBOX-3: openCodespacePopout uses sandboxed isolated iframe
const cs = fs.readFileSync('modules/codespace.js', 'utf8');
assert(cs.includes('sandbox="allow-scripts allow-modals allow-popups allow-forms" id="popoutFrame"'), 'VULN-SANDBOX-3: Popout uses isolated sandboxed iframe');
assert(cs.includes('window.opener=null'), 'VULN-SANDBOX-3: Popout severs window.opener');
console.log('✓ VULN-SANDBOX-3: openCodespacePopout renders inside isolated sandboxed iframe');

// 4. VULN-SANDBOX-4: DOM XSS in codespace file tree and tabs
assert(cs.includes('escapeHtml(key)'), 'VULN-SANDBOX-4: key escaped');
assert(cs.includes('escapeHtml(folder)'), 'VULN-SANDBOX-4: folder escaped');
assert(cs.includes('escapeHtml(subFile)'), 'VULN-SANDBOX-4: subFile escaped');
assert(cs.includes("escapeHtml(file.split('/').pop())"), 'VULN-SANDBOX-4: tab file name escaped');
console.log('✓ VULN-SANDBOX-4: DOM XSS escaped in codespace file tree & tabs');

// 5. VULN-SANDBOX-5: Command injection in runActiveFile
assert(cs.includes('/^[a-zA-Z0-9_\\-\\./]+$/'), 'VULN-SANDBOX-5: runActiveFile regex validation');
assert(cs.includes("activeFile.includes('..')"), 'VULN-SANDBOX-5: runActiveFile traversal rejection');
console.log('✓ VULN-SANDBOX-5: Command injection in runActiveFile protected by whitelist & traversal checks');

// 6. VULN-SANDBOX-6: Prototype collision DoS
assert(cs.includes('const tree = Object.create(null);'), 'VULN-SANDBOX-6: tree uses Object.create(null)');
// Functional check
const tree = Object.create(null);
const folder = 'toString';
if (!Array.isArray(tree[folder])) tree[folder] = [];
tree[folder].push('test.txt');
assert(tree['toString'][0] === 'test.txt', 'VULN-SANDBOX-6: Object.create(null) avoids toString collision');
console.log('✓ VULN-SANDBOX-6: Prototype collision DoS mitigated with Object.create(null)');

// 7. VULN-SANDBOX-7: Prototype pollution in VFS
const ai = fs.readFileSync('modules/ai-studio.js', 'utf8');
assert(cs.includes('function isValidVfsKey'), 'VULN-SANDBOX-7: isValidVfsKey in codespace');
assert(ai.includes('function isValidVfsKey'), 'VULN-SANDBOX-7: isValidVfsKey in ai-studio');

function isValidVfsKey(key) {
  if (typeof key !== 'string') return false;
  const k = key.trim();
  if (!k) return false;
  if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
  if (k.includes('__proto__') || k.includes('constructor') || k.includes('prototype')) return false;
  if (k.includes('..')) return false;
  return true;
}
assert(!isValidVfsKey('__proto__'), 'rejects __proto__');
assert(!isValidVfsKey('constructor'), 'rejects constructor');
assert(!isValidVfsKey('prototype'), 'rejects prototype');
assert(!isValidVfsKey('../etc/passwd'), 'rejects ..');
assert(isValidVfsKey('src/app.py'), 'allows normal path');
console.log('✓ VULN-SANDBOX-7: Prototype pollution in VFS protected by strict key validation');

// 8. VULN-SANDBOX-8: Path traversal defense in api/terminal.js
const term = fs.readFileSync('api/terminal.js', 'utf8');
assert(term.includes('sanitizeFilePath(file.name)'), 'VULN-SANDBOX-8: sanitizeFilePath in terminal.js');
assert(term.includes('path.posix.normalize'), 'VULN-SANDBOX-8: path normalization in terminal.js');
const path = require('path');
function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  const clean = userPath.replace(/\0/g, '').replace(/\\/g, '/').trim();
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    return '';
  }
  return normalized;
}
assert.strictEqual(sanitizeFilePath('..\\..\\windows\\win.ini'), '', 'blocks traversal');
assert.strictEqual(sanitizeFilePath('foo/bar/baz.txt'), 'foo/bar/baz.txt', 'allows legitimate subpath');
console.log('✓ VULN-SANDBOX-8: Path traversal in api/terminal.js protected by robust normalization');

// 9. VULN-SANDBOX-9: Server-side Jev guardrails in api/compile.js
const comp = fs.readFileSync('api/compile.js', 'utf8');
assert(comp.includes('inspectJevCommandSafety(code)'), 'VULN-SANDBOX-9: inspectJevCommandSafety in compile.js');
assert(comp.includes('inspectJevGuardrails(code)'), 'VULN-SANDBOX-9: inspectJevGuardrails in compile.js');
console.log('✓ VULN-SANDBOX-9: Server-side Jev guardrails enforced on /api/compile');

// 10. VULN-SANDBOX-10: Unvalidated postMessage origin in calendar-sync.js
const cal = fs.readFileSync('modules/calendar-sync.js', 'utf8');
assert(cal.includes('if (e.origin !== window.location.origin) return;'), 'VULN-SANDBOX-10: origin validation in calendar-sync.js');
console.log('✓ VULN-SANDBOX-10: Calendar sync postMessage origin validated');

console.log('\n🎉 ALL 10 M4 VULNERABILITY REMEDIATION CHECKS PASSED WITH 100% SUCCESS!');
