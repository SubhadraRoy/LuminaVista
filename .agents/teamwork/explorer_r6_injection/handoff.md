# Defensive Security Audit Report: Input Validation & Injection Security

**Auditor**: `explorer_r6_injection` (Teamwork Explorer)  
**Date**: 2026-10-17  
**Mission**: Comprehensive Defensive Security Audit of Input Validation and Injection Security across LuminaVista OS  
**Repository Root**: `c:/Users/roysu/LuminaVista`  
**Working Directory**: `c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_r6_injection`  
**Parent Orchestrator**: `orchestrator_r6` (Conversation ID: `8e2a6dd3-7ab0-4c08-84e9-557fd6782f75`)  
**Status**: Complete (Hard Handoff)

---

## Executive Summary

A full-surface defensive audit was conducted across LuminaVista OS, evaluating six critical input validation and injection vectors:
1. SQLi / NoSQL / Redis Injection
2. Cross-Site Scripting (XSS) — DOM-based and Stored
3. Server-Side Request Forgery (SSRF) — Loopback, IPv6, Cloud Metadata, and DNS FQDN resolution
4. CLI / Command Injection & VM Execution Sandboxing
5. Prototype Pollution in State Merging and Hydration
6. Insecure Deserialization & VFS Path Traversal

The audit identified **1 Critical**, **3 High**, **1 Medium**, and **1 Low/Informational** findings. Concrete, surgical, fail-closed remediation specifications and automated test criteria are documented below.

---

## Vulnerability Ledger & Summary Table

| Finding ID | Title | Target File & Line(s) | Severity | CWE / OWASP |
|---|---|---|---|---|
| **INJ-01** | SSRF Filter Bypass via DNS Trailing-Dot FQDN Normalization Failure | `api/_lib/key-pool.js:252, 293-305` | **Critical** | CWE-918 / OWASP API7:2023 |
| **INJ-02** | Stored DOM Cross-Site Scripting (XSS) in Whiteboard Sticky Notes & Scheduled Tasks | `modules/whiteboard.js:687-698`<br>`modules/ai-tasks-sessions.js:276, 522-528`<br>`modules/ai-chat-ui.js:259` | **High** | CWE-79 / OWASP A03:2021 |
| **INJ-03** | Command Safety Guardrail Bypass via Base64 Piped Shell Payloads | `modules/compiler.js:125-139`<br>`api/_lib/jev/jev-guardrails.js:11-94`<br>`api/terminal.js:73-83` | **High** | CWE-78 / OWASP API8:2023 |
| **INJ-04** | Incomplete Directory Traversal & Control Character Path Normalization in Sandboxes | `api/_lib/auth-guard.js:483-494`<br>`api/terminal.js:18-29`<br>`api/storage.js:33-50, 131`<br>`modules/codespace.js:15-23` | **High** | CWE-22 / OWASP API1:2023 |
| **INJ-05** | Unsanitized Session Key Ingestion & Injection Vectors in Redis Headers | `api/_lib/auth-guard.js:101-104, 185-188`<br>`api/logout.js:11-28`<br>`api/admin.js:173-195` | **Medium** | CWE-943 / OWASP API3:2023 |
| **INJ-06** | Missing Environment-Agnostic Cloud Metadata & Private CIDR Guard in Ollama Normalizer | `api/_lib/key-pool.js:356-363`<br>`api/worker.js:239-242` | **Low** | CWE-918 / OWASP API7:2023 |

---

## 1. Observation

### Observation 1 (INJ-01): SSRF Filter Bypass via DNS FQDN Trailing-Dot
- **File**: `api/_lib/key-pool.js`, Lines 252, 293–305:
```javascript
252:   let hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
...
293:   if (
294:     hostname === 'metadata.google.internal' ||
295:     hostname === 'metadata' ||
296:     hostname === 'instance-data' ||
297:     hostname === '169.254.169.254'
298:   ) {
299:     return true;
300:   }
301: 
302:   // 2. Loopback named hosts
303:   if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
304:     return true;
305:   }
```
- **Empirical Execution**:
Running Node.js test against `isBlockedSsrfTarget`:
```
http://metadata.google.internal. -> hostname: metadata.google.internal. blocked: false
http://localhost. -> hostname: localhost. blocked: false
http://metadata. -> hostname: metadata. blocked: false
http://instance-data. -> hostname: instance-data. blocked: false
```
`WHATWG URL` preserves the trailing dot in `hostname` according to RFC 1034/1035. Strict string equality fails, returning `false` for loopback and cloud metadata FQDNs.

### Observation 2 (INJ-02): Unescaped Sticky Note Text & Inline Attribute Injection
- **File**: `modules/whiteboard.js`, Lines 687–698:
```javascript
687:     el.innerHTML = `
688:       <div class="sticky-handle flex items-center justify-between cursor-move pb-1 border-b border-black/10">
689:         <div class="flex items-center gap-1">
690:           <span class="w-2.5 h-2.5 rounded-full bg-amber-400 border border-black/20 cursor-pointer" onclick="changeStickyColor('${sticky.id}', '#fef08a')"></span>
...
695:         <button onclick="removeStickyNote('${sticky.id}')" class="text-black/50 hover:text-black text-xs font-bold p-0.5 cursor-pointer">✕</button>
696:       </div>
697:       <textarea class="..." rows="4" placeholder="Type sticky note...">${sticky.text || ''}</textarea>
698:     `;
```
Line 697 embeds `sticky.text` unescaped into `<textarea>`. In HTML parsing, `</textarea><img src=x onerror=...>` escapes the textarea immediately. Line 690 and 695 interpolate unescaped `sticky.id` inside single-quoted inline JavaScript `onclick="removeStickyNote('${sticky.id}')"`.
- **File**: `modules/ai-tasks-sessions.js`, Lines 276, 522–528:
```javascript
276: <button onclick="renameChatSession('${s.id}', event)" ...>
522: <button onclick="runScheduledTaskNow('${t.id}')" ...>
525: <button onclick="toggleScheduledTask('${t.id}')" ...>
528: <button onclick="deleteScheduledTask('${t.id}')" ...>
```
Unescaped string interpolation into inline event handlers without HTML attribute entity escaping or `data-*` binding.
- **File**: `modules/ai-chat-ui.js`, Line 259:
```javascript
259: <button onclick="window.switchAiSubTab('artifacts'); window.switchAndOpenFile('${escapeHtml(f)}');" ...>
```
In inline HTML event attributes, `escapeHtml(f)` encodes `'` as `&#039;`. The browser HTML parser decodes `&#039;` back to `'` before executing the JavaScript handler, causing syntax crashes or arbitrary script execution when filenames contain quotes.

### Observation 3 (INJ-03): Jev Command Screening Evaded by Base64 Fallback
- **File**: `modules/compiler.js`, Lines 125–139:
```javascript
125:     let safeCode = "";
126:     try {
127:       safeCode = btoa(encodeURIComponent(code).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
128:     } catch (e) {
129:       safeCode = btoa(unescape(encodeURIComponent(code)));
130:     }
131:     let filename = ext === 'java' ? 'Main.java' : `sbx.${ext}`;
132:     const fullCmd = `echo "${safeCode}" | base64 -d > /tmp/${filename} && ${cmd}`;
133: 
134:     try {
135:       const res = await fetch("/api/terminal", {
136:         method: "POST",
137:         headers: { "Content-Type": "application/json" },
138:         body: JSON.stringify({ command: fullCmd, files: [] })
139:       });
```
- **File**: `api/terminal.js`, Lines 73–83:
```javascript
74:   const jevSafety = inspectJevCommandSafety(command);
75:   if (!jevSafety.safe) { ... }
```
- **File**: `api/_lib/jev/jev-guardrails.js`, Lines 11–26:
```javascript
16:   const isDestructiveFs =
17:     /rm\s+(-[rfRF]{1,4}\s+[/~*]|--no-preserve-root)/i.test(cLower) ||
18:     cLower.includes('rm -rf /') || ...
```
`fullCmd` sends `echo "cm0gLXJmIC8=" | base64 -d > /tmp/sbx.sh && bash /tmp/sbx.sh`. `inspectJevCommandSafety` checks literal substrings on `cLower`, never decodes Base64 payloads, evaluates `safe: true`, and executes the payload inside the microVM.

### Observation 4 (INJ-04): Incomplete Path Sanitization in `sanitizeFilePath` and `isValidVfsKey`
- **File**: `api/_lib/auth-guard.js`, Lines 483–494:
```javascript
483: export function sanitizeFilePath(userPath) {
484:   if (!userPath || typeof userPath !== 'string') return '';
485:   const clean = userPath
486:     .replace(/\0/g, '')
487:     .replace(/\\/g, '/')
488:     .trim();
489:   const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
490:   if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
491:     return '';
492:   }
493:   return normalized;
494: }
```
1. `sanitizeFilePath('.')` or `sanitizeFilePath('./')`: `path.posix.normalize('.')` is `'.'`. Line 490 checks `'..'` but NOT `'.'`. Returns `'.'`. Writing to `.` throws `EISDIR` or corrupts the container directory table.
2. `userPath = '%2e%2e/etc/passwd'`: `api/_lib/auth-guard.js:sanitizeFilePath` lacks `decodeURIComponent`, returning `%2e%2e/etc/passwd`.
3. Control characters (`\r`, `\n`) are not stripped (`replace(/\0/g, '')` only strips null bytes).
4. `api/storage.js:131`:
```javascript
131: const baseUrl = `https://api.github.com/repos/${repo}/contents/${targetPath}`;
```
`cleanPath` in `api/storage.js` does not reject query parameters (`?`) or URL fragments (`#`). If `rawPath` has `test.txt?ref=malicious` or `#anchor`, it mutates GitHub API query strings.
5. In `modules/codespace.js:15-23` & `modules/ai-studio.js:36-44`:
`isValidVfsKey` returns `true` for absolute paths like `/etc/passwd` because it only checks for `..` and prototype keys.

### Observation 5 (INJ-05): Unsanitized Session Key Ingestion in Headers & Admin Deletion
- **File**: `api/_lib/auth-guard.js`, Lines 101–104, 185–188:
```javascript
101:   const match = cookieHeader.match(/godx_session=([a-zA-Z0-9_-]+)/);
102:   const headerSessionId = req?.headers?.['x-session-id'] || req?.headers?.authorization?.replace(/^Bearer\s+/i, '') || req?.body?.userSession || '';
103:   const sessionId = match ? match[1] : headerSessionId;
...
187:       redis.get(`session:${sessionId}`),
188:       redis.expire(`session:${sessionId}`, 1200).catch(() => {})
```
Cookie extraction regex strictly enforces `[a-zA-Z0-9_-]+`. However, `headerSessionId` is ingested raw. In Upstash Redis REST requests (`GET /get/session:${sessionId}`), unvalidated characters (whitespace, query characters, newlines) can alter the HTTP request format.
- **File**: `api/logout.js`, Lines 11–17:
`const sid = (match && match[1]) || req.headers?.['x-session-id'] || '';`
`await redis.del('session:${sid}');`
`sid` from header is unvalidated.
- **File**: `api/admin.js`, Line 173–194:
`if (action === 'delete') { if (!id || typeof id !== 'string') ... }`
`await storage.set('admin:revoked_key:' + id, ...)`
`id` is not validated with regex `^[a-zA-Z0-9_-]{1,64}$`.

### Observation 6 (INJ-06): Missing Environment-Agnostic Cloud Metadata & Private CIDR Guard
- **File**: `api/_lib/key-pool.js`, Lines 356–363:
```javascript
357:   if (process.env.VERCEL && isBlockedSsrfTarget(ep)) {
358:     return 'https://ollama.com/v1/chat/completions';
359:   }
360:   // Cloud metadata is strictly forbidden in all environments
361:   if (/169\.254\.169\.254|metadata\.google\.internal|metadata|instance-data/i.test(ep)) {
362:     return 'https://ollama.com/v1/chat/completions';
363:   }
```
If deployed outside Vercel (e.g., Node container, AWS, self-hosted), private IP targets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, loopback `127.0.0.1`) are not redirected to fallback in `normalizeOllamaEndpoint`. `api/worker.js:239` calls `normalizeOllamaEndpoint` without an explicit second `isBlockedSsrfTarget` call.

---

## 2. Logic Chain

1. **SSRF Logic Chain (INJ-01)**:
   - Observation: `isBlockedSsrfTarget` compares `hostname === 'metadata.google.internal'`, `hostname === 'localhost'`.
   - Tool Run: `http://metadata.google.internal.` produces `hostname: "metadata.google.internal."` and `isBlockedSsrfTarget` returns `false`.
   - In RFC 1034/1035, DNS FQDNs ending with a trailing dot are treated as root-anchored domains. The HTTP client / OS resolver strips the dot or queries DNS directly, resolving `metadata.google.internal.` to `169.254.169.254`.
   - Conclusion: An attacker can bypass SSRF filters in `/api/chat` and `/api/worker` by appending a trailing dot to cloud metadata hostnames (`metadata.google.internal.`), accessing internal metadata endpoints.

2. **XSS Logic Chain (INJ-02)**:
   - Observation: `modules/whiteboard.js:697` injects `${sticky.text || ''}` into `el.innerHTML` inside a `<textarea>` without `escapeHtml()`.
   - In HTML spec (HTML5 8.2.4.40 RCDATA state), `<textarea>` content is parsed for `</textarea>`. A string containing `</textarea><img src=x onerror=alert(1)>` switches the parser back to Data state, executing the tag immediately.
   - Observation: Whiteboard stickies are synchronized across devices via `api/sync.js`.
   - Conclusion: An attacker with access to sync payloads can inject stored XSS that executes across any connected user device opening the Whiteboard.

3. **Command Injection & Guardrail Bypass Logic Chain (INJ-03)**:
   - Observation: `modules/compiler.js` falls back to `echo "${safeCode}" | base64 -d > /tmp/${filename} && ${cmd}` when calling `/api/terminal`.
   - Observation: `api/terminal.js` checks `inspectJevCommandSafety(command)` before dispatching to E2B Firecracker microVM.
   - Observation: `inspectJevCommandSafety` checks literal substrings (`rm -rf /`, `/etc/shadow`, etc.) on `command.toLowerCase()`.
   - Because `safeCode` is Base64 encoded, the payload contains zero blacklisted substrings.
   - Conclusion: The command safety guardrail is completely bypassed by Base64 encoding in the compiler fallback path and any direct caller executing piped Base64 payloads.

4. **Path Traversal Logic Chain (INJ-04)**:
   - Observation: `api/_lib/auth-guard.js:sanitizeFilePath` normalizes `.` to `.`, does not decode URI components, and allows control characters.
   - Observation: `api/storage.js` concatenates `targetPath` into `https://api.github.com/repos/${repo}/contents/${targetPath}` without checking for `?` or `#`.
   - Observation: `modules/codespace.js:isValidVfsKey` accepts `/etc/passwd` because it only checks for `..` and prototype keys.
   - Conclusion: Insecure normalization allows directory write collisions on `.`, URL query parameter injection into GitHub storage proxies, and unvalidated absolute paths in client VFS keys.

5. **Redis Injection & Key Ingestion Logic Chain (INJ-05)**:
   - Observation: In `api/_lib/auth-guard.js`, session IDs from `x-session-id` headers are passed into `redis.get('session:${sessionId}')` without regex validation.
   - In `@upstash/redis` REST client, unencoded URL special characters can alter the REST URL path or parameters.
   - Conclusion: Unvalidated header ingestion allows key format injection and potential cache key manipulation.

---

## 3. Caveats

1. **Hardware Gateway Boundary**:
   ESP32 hardware telemetry firmware in `firmware/**` was not modified and was inspected strictly from the gateway interface perspective (`api/iot.js` and `modules/smart-lock.js`). All gateway interfaces enforce 5-layer HMAC-SHA256, anti-replay nonces, and monotonic sequence checking.
2. **Third-Party Container Isolation**:
   E2B Firecracker sandboxes run in external microVMs. While the microVM container boundaries prevent host server escape, executing unscreened commands inside the microVM allows destruction of mounted VFS workspace files and denial of service for the tenant session.
3. **DNS Rebinding**:
   `isBlockedSsrfTarget` operates at the URL parsing stage before DNS resolution. To defend completely against time-of-check-time-of-use (TOCTOU) DNS rebinding on public domains resolving to `127.0.0.1` (e.g. `*.nip.io`), serverless environments must either resolve DNS prior to HTTP dispatch or pin IP socket connections.

---

## 4. Conclusion & Defensive Remediation Recommendations

### Detailed Remediation Blueprints

#### Remediation 1 (for INJ-01: SSRF FQDN Bypass in `api/_lib/key-pool.js`)
In `api/_lib/key-pool.js:252`:
```javascript
// Strip leading/trailing brackets AND trailing dots (DNS FQDN absolute root)
let hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
```
And enforce protocol whitelist:
```javascript
if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
  return true; // Block file:, gopher:, dict:, ftp:, etc.
}
```

#### Remediation 2 (for INJ-02: Stored DOM XSS in `modules/whiteboard.js` and `modules/ai-tasks-sessions.js`)
1. In `modules/whiteboard.js:687-698`:
```javascript
el.innerHTML = `
  <div class="sticky-handle flex items-center justify-between cursor-move pb-1 border-b border-black/10">
    <div class="flex items-center gap-1">
      <span class="w-2.5 h-2.5 rounded-full bg-amber-400 border border-black/20 cursor-pointer" data-id="${escapeHtml(sticky.id)}" onclick="changeStickyColor(this.dataset.id, '#fef08a')"></span>
      <span class="w-2.5 h-2.5 rounded-full bg-cyan-300 border border-black/20 cursor-pointer" data-id="${escapeHtml(sticky.id)}" onclick="changeStickyColor(this.dataset.id, '#a5f3fc')"></span>
      <span class="w-2.5 h-2.5 rounded-full bg-emerald-300 border border-black/20 cursor-pointer" data-id="${escapeHtml(sticky.id)}" onclick="changeStickyColor(this.dataset.id, '#a7f3d0')"></span>
      <span class="w-2.5 h-2.5 rounded-full bg-rose-300 border border-black/20 cursor-pointer" data-id="${escapeHtml(sticky.id)}" onclick="changeStickyColor(this.dataset.id, '#fecdd3')"></span>
    </div>
    <button data-id="${escapeHtml(sticky.id)}" onclick="removeStickyNote(this.dataset.id)" class="text-black/50 hover:text-black text-xs font-bold p-0.5 cursor-pointer">✕</button>
  </div>
  <textarea class="w-full bg-transparent border-0 outline-none resize-none text-xs font-sans text-slate-800 leading-snug custom-scrollbar placeholder:text-slate-500" rows="4" placeholder="Type sticky note...">${escapeHtml(sticky.text || '')}</textarea>
`;
```
2. In `modules/ai-tasks-sessions.js`:
Use `data-id="${escapeHtml(t.id)}"` and `onclick="runScheduledTaskNow(this.dataset.id)"`.
3. In `modules/ai-chat-ui.js:259`:
Use `data-filename="${escapeHtml(f)}"` and `onclick="window.switchAiSubTab('artifacts'); window.switchAndOpenFile(this.dataset.filename);"`.

#### Remediation 3 (for INJ-03: Command Guardrail Bypass in `api/_lib/jev/jev-guardrails.js` & `modules/compiler.js`)
1. In `api/_lib/jev/jev-guardrails.js`:
Add inspection of decoded base64 command pipelines:
```javascript
const b64Match = cLower.match(/(?:echo\s+["']?([A-Za-z0-9+/=]{4,})["']?\s*\|\s*base64\s+(-d|--decode))/i);
if (b64Match) {
  try {
    const decoded = Buffer.from(b64Match[1], 'base64').toString('utf-8');
    const innerSafety = inspectJevCommandSafety(decoded);
    if (!innerSafety.safe) {
      return {
        safe: false,
        p: 0.01,
        threatCategory: 'obfuscated_destructive_command',
        reason: `Obfuscated command contains forbidden payload: ${innerSafety.reason}`
      };
    }
  } catch (_) {}
}
// Block direct uninspected shell execution pipes
if (/\|\s*(ba|z)?sh\b/i.test(cLower) && /base64\s+(-d|--decode)/i.test(cLower)) {
  return {
    safe: false,
    p: 0.01,
    threatCategory: 'obfuscated_shell_pipe',
    reason: 'Piping decoded payloads directly into shell interpreters is prohibited.'
  };
}
```
2. In `modules/compiler.js`:
Avoid piping Base64 in fallback commands. Send source code in the `files: [{ name: filename, content: code }]` payload and invoke `python3 /tmp/${filename}` or `bash /tmp/${filename}` directly.

#### Remediation 4 (for INJ-04: Path Sanitization in `api/_lib/auth-guard.js`, `api/storage.js`, and `modules/codespace.js`)
1. In `api/_lib/auth-guard.js:483-494`:
```javascript
export function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  let decoded = userPath;
  try { decoded = decodeURIComponent(userPath); } catch (_) { return ''; }
  while (decoded.includes('%')) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (_) { break; }
  }
  const clean = decoded
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\\/g, '/')
    .trim();
  if (clean.includes('..') || clean.includes('?') || clean.includes('#')) return '';
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    normalized.split('/').includes('..')
  ) {
    return '';
  }
  return normalized;
}
```
2. In `modules/codespace.js:15-23`:
```javascript
function isValidVfsKey(key) {
  if (typeof key !== 'string') return false;
  const k = key.trim();
  if (!k) return false;
  if (k.startsWith('/') || k.includes('\\') || k.includes('\0')) return false;
  if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
  if (k.includes('__proto__') || k.includes('constructor') || k.includes('prototype')) return false;
  if (k.includes('..')) return false;
  return /^[a-zA-Z0-9_\-\./]+$/.test(k);
}
```

#### Remediation 5 (for INJ-05: Strict Regex on Session Headers & Key IDs)
1. In `api/_lib/auth-guard.js:101-104`:
```javascript
const rawHeaderSessionId = req?.headers?.['x-session-id'] || req?.headers?.authorization?.replace(/^Bearer\s+/i, '') || req?.body?.userSession || '';
const cleanHeaderSessionId = (typeof rawHeaderSessionId === 'string' && /^[a-zA-Z0-9_\-]{1,128}$/.test(rawHeaderSessionId)) ? rawHeaderSessionId : '';
const sessionId = match ? match[1] : cleanHeaderSessionId;
```
2. In `api/admin.js:173`:
```javascript
if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_\-]{1,64}$/.test(id)) {
  return sendSecureJson(res, 400, { error: 'Valid alphanumeric key ID required.' }, req);
}
```

---

## 5. Verification Method

To independently reproduce, audit, and verify the findings and fixes:

1. **Verify SSRF FQDN Filter**:
   ```bash
   node -e "import('./api/_lib/key-pool.js').then(m => {
     const cases = [
       'http://metadata.google.internal.',
       'http://metadata.',
       'http://instance-data.',
       'http://localhost.',
       'http://test.localhost.'
     ];
     for (const c of cases) {
       console.log(c, '-> blocked:', m.isBlockedSsrfTarget(c));
     }
   })"
   ```
   *Expected behavior*: All cases must output `blocked: true`.

2. **Verify Jev Base64 Command Screening**:
   ```bash
   node -e "import('./api/_lib/jev/jev-guardrails.js').then(m => {
     const cmd1 = 'echo \"cm0gLXJmIC8=\" | base64 -d | bash';
     const cmd2 = 'echo \"Y2F0IC9ldGMvcGFzc3dk\" | base64 -d | sh';
     console.log('cmd1 safe:', m.inspectJevCommandSafety(cmd1).safe);
     console.log('cmd2 safe:', m.inspectJevCommandSafety(cmd2).safe);
   })"
   ```
   *Expected behavior*: Both cases must output `safe: false`.

3. **Verify Full Automated System Test Suites**:
   - `node tests/features.test.cjs` (1,102 unit assertions)
   - `node tests/browser-cdp-test.cjs` (122 Chrome CDP tests)
   - `node tests/recheck-all-tasks.cjs` (42 assertions)
   - `node tests/lint.cjs` (40 JS syntax modules)
   - `node tests/challenger-calendar-empirical.cjs` (63 assertions)
   - `node tests/challenger-r4-empirical.cjs` (141 assertions)
   - `node tests/adversarial-calendar.test.cjs` (109 probes)
   - `node tests/suite-calendar-adversarial.cjs` (25 tests)

4. **Verify Invariants**:
   - Zero files exceeding 2,000 lines: verify line counts with `git ls-files | ForEach-Object { (Get-Content $_).Count }`.
   - Firmware immutability: `git diff --name-only firmware/` must produce empty output.
