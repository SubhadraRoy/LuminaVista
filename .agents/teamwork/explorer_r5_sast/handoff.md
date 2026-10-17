# Static Application Security Testing (SAST) Audit Report

**Target**: LuminaVista OS  
**Auditor**: `explorer_r5_sast`  
**Date**: 2026-10-17  
**Scope**: `api/**/*.js`, `api/_lib/*.js`, `modules/**/*.js`, `dashboard.html`  
**Status**: Completed — Hard Handoff

---

## 1. Observation

### Summary Table of Findings

| ID | Category | Severity | File Path & Lines | Vulnerability Description |
|---|---|---|---|---|
| **SAST-01** | SSRF | **Critical** | `api/_lib/key-pool.js`: 254-269, 277-310 | IPv4-Compatible IPv6 SSRF Filter Bypass (`[::127.0.0.1]`, `[::169.254.169.254]`, `[::7f00:1]`, `[::a9fe:a9fe]`) |
| **SAST-02** | Injection / Sandboxing | **High** | `api/chat.js`: 682-722<br>`api/worker.js`: 322-358 | Missing Jev Command Safety Guardrail Screening on LLM Tool Execution (`[TOOL:EXEC]`) |
| **SAST-03** | Injection / Path Traversal | **Medium** | `api/chat.js`: 699-702<br>`api/worker.js`: 334-336 | Arbitrary MicroVM File Write / Path Traversal via Unsanitized VFS Artifact Filenames |
| **SAST-04** | Denial of Service / Crash | **High** | `modules/state.js`: 79, 80, 89, 96 | Unguarded `JSON.parse` of `localStorage` Keys During Synchronous App Boot |
| **SAST-05** | Denial of Service / Crash | **Medium** | `modules/cloud-sync.js`: 156<br>`modules/ai-tasks-sessions.js`: 56 | Unguarded `JSON.parse` in State Collection and Legacy Session Initialization |
| **SAST-06** | Denial of Service / Unhandled Rejections | **Medium** | `api/calendar.js`: 1097-1134<br>`api/chat.js`: 133-187<br>`api/compile.js`: 26-90<br>`api/terminal.js`: 31-89 | Missing Top-Level `try/catch` Error Handling in Serverless Edge Handlers |
| **SAST-07** | Authorization / Rate Limiting | **Medium** | `api/iot.js`: 6, 1059-1241 | `checkRateLimit` Imported but Never Invoked on IoT Gateway Routes |
| **SAST-08** | Session Management / Cookies | **Medium** | `api/auth.js`: 105-111 | Missing `Partitioned` (CHIPS) Cookie Attribute on Cross-Site Session Cookie |
| **SAST-09** | Prototype Lookup / Error Injection | **Low** | `api/compile.js`: 92 | Object Prototype Property Shadowing in Compiler Runner Dispatch (`RUNNERS[language]`) |

---

### Detailed Observations by Finding

#### Observation 1 (SAST-01): SSRF Bypass via IPv4-Compatible IPv6 Addresses
- **File**: `api/_lib/key-pool.js`, Lines 254–270:
```javascript
254:   // Normalize IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1, ::ffff:7f00:1) to standard IPv4
255:   if (hostname.startsWith('::ffff:') || hostname.startsWith('0:0:0:0:0:ffff:')) {
256:     const suffix = hostname.replace(/^(::ffff:|0:0:0:0:0:ffff:)/, '');
257:     if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(suffix)) {
258:       hostname = suffix;
259:     } else if (suffix.includes(':')) {
260:       const parts = suffix.split(':').map(h => parseInt(h, 16));
261:       if (parts.length === 2 && !parts.some(isNaN)) {
262:         hostname = [
263:           (parts[0] >> 8) & 0xff,
264:           parts[0] & 0xff,
265:           (parts[1] >> 8) & 0xff,
266:           parts[1] & 0xff
267:         ].join('.');
268:       }
269:     }
270:   }
```
- **File**: `api/_lib/key-pool.js`, Lines 313–322:
```javascript
313:   if (
314:     hostname === '::1' ||
315:     hostname === '0:0:0:0:0:0:0:1' ||
316:     hostname === '::' ||
317:     hostname.startsWith('fe80:') ||
318:     hostname.startsWith('fc') ||
319:     hostname.startsWith('fd')
320:   ) {
321:     return true;
322:   }
```
- **Empirical Execution**:
Running `node -e "import('./api/_lib/key-pool.js').then(m => { console.log('127.0.0.1:', m.isBlockedSsrfTarget('http://[::127.0.0.1]')); console.log('169.254:', m.isBlockedSsrfTarget('http://[::169.254.169.254]')); })"`:
Output:
```
127.0.0.1: false
169.254: false
```
`WHATWG URL` normalizes `http://[::127.0.0.1]` to hostname `"::7f00:1"` and `http://[::169.254.169.254]` to `"::a9fe:a9fe"`. Neither prefix matches `::ffff:`, neither matches IPv4 dotted quad regex, and neither matches lines 314–320. Therefore, `isBlockedSsrfTarget` returns `false`, allowing requests to loopback and cloud metadata.

---

#### Observation 2 (SAST-02): Unscreened Command Execution from Model Outputs
- **File**: `api/chat.js`, Lines 681–722:
```javascript
681:       // G. Execute Shell Commands in E2B MicroVM (Gated by allowTerminal)
682:       const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
683:       let xMatch;
684:       let cmdsToRun = [];
685:       while ((xMatch = execRegex.exec(aiReply)) !== null) {
686:         cmdsToRun.push(xMatch[1].trim());
687:       }
...
706:             for (const cmd of cmdsToRun) {
707:               terminalLogs.push(`➜ ${cmd}`);
708:               const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
```
- **File**: `api/worker.js`, Lines 321–343:
```javascript
321:   // Shell command execution in Firecracker MicroVM if available
322:   const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
323:   const execCommands = [];
324:   while ((match = execRegex.exec(aiReply)) !== null) {
325:     execCommands.push(match[1].trim());
326:   }
...
338:       for (const cmd of execCommands) {
339:         terminalLogs.push(`➜ ${cmd}`);
340:         const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
```
- **Comparison**: In `api/terminal.js` line 73:
```javascript
const jevSafety = inspectJevCommandSafety(command);
if (!jevSafety.safe) { return sendSecureJson(res, 403, ...); }
```
In `api/compile.js` line 65:
```javascript
const cmdSafety = inspectJevCommandSafety(code);
if (!cmdSafety.safe) { return sendSecureJson(res, 403, ...); }
```
Neither `api/chat.js` nor `api/worker.js` invokes `inspectJevCommandSafety(cmd)` before `sbx.commands.run(cmd)`. If an LLM generates a destructive command (e.g. `rm -rf /` or `/etc/shadow`), it is dispatched directly to the container.

---

#### Observation 3 (SAST-03): Arbitrary Container File Writes via VFS Path Traversal
- **File**: `api/chat.js`, Lines 699–701:
```javascript
699:             for (const [name, content] of Object.entries(currentVfs)) {
700:               await sbx.files.write(name, content);
701:             }
```
- **File**: `api/worker.js`, Lines 334–336:
```javascript
334:       for (const [name, content] of Object.entries(updatedVfs)) {
335:         await sbx.files.write(name, content);
336:       }
```
- **Comparison**: In `api/terminal.js` lines 98–101:
```javascript
const safeName = sanitizeFilePath(file.name);
if (safeName) {
  await sbx.files.write(safeName, String(file.content));
}
```
In `api/chat.js` and `api/worker.js`, `name` is written directly without calling `sanitizeFilePath(name)`. If a VFS entry is named `../../../../etc/shadow` or `../../../../root/.bashrc`, it can write outside the workspace directory in the container.

---

#### Observation 4 (SAST-04): Unguarded `JSON.parse` During Dashboard Startup
- **File**: `modules/state.js`, Lines 79–96:
```javascript
79:   window.aiConversation = JSON.parse(localStorage.getItem("lumina_ai_history") || "[]");
80:   window.vaultNotes = JSON.parse(localStorage.getItem("lumina_godx_multi_notes") || JSON.stringify([
81:     { id: "note_1", title: "Workspace Checklist", content: "# LuminaVista Cloud Workspace\n- [x] Initialized virtual disk\n- [ ] Deploy microVM functions" }
82:   ]));
83:   window.activeNoteId = window.vaultNotes[0] ? window.vaultNotes[0].id : "note_1";
84:   window.isMarkdownPreviewActive = false;
85:   window.termHistory = [];
86:   window.termHistoryIdx = -1;
87: 
88:   // Virtual File System (VFS)
89:   window.vfs = JSON.parse(localStorage.getItem("lumina_codespace_vfs") || JSON.stringify({
90:     "index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <div class=\"card\">\n    <h1>ai-llm Sovereign Codespace</h1>\n    <p>AI creates, edits, and executes files live in this workspace.</p>\n    <button id=\"btnAction\">Run Trigger</button>\n  </div>\n  <script src=\"script.js\"><\/script>\n</body>\n</html>",
91:     "style.css": "body { margin: 0; padding: 40px; background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; justify-content: center; }\n.card { background: #111827; padding: 30px; border-radius: 16px; border: 1px solid #1f2937; text-align: center; }\nh1 { color: #00f2fe; margin-top: 0; }\nbutton { background: #00f2fe; color: #000; border: 0; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; }",
92:     "script.js": "document.getElementById('btnAction').addEventListener('click', () => {\n  alert('Artifact logic functioning in real-time!');\n});"
93:   }));
94: 
95:   // Codespace & Artifact Tab State
96:   window.codespaceOpenTabs = JSON.parse(localStorage.getItem("lumina_open_tabs") || '["index.html"]');
```
While line 72 (`savedProjects`) is enclosed in a `try/catch` block, lines 79, 80, 89, and 96 are executed bare. If any key in `localStorage` contains invalid JSON, a `SyntaxError` halts JavaScript execution entirely upon page load.

---

#### Observation 5 (SAST-05): Unguarded `JSON.parse` in Auxiliary Modules
- **File**: `modules/cloud-sync.js`, Line 156:
```javascript
156:       admin_passwords: JSON.parse(localStorage.getItem('lumina_temp_vault') || '[]'),
```
Lines 80–135 in `gatherLocalState()` wrap all other storage reads in `try/catch`. Line 156 is outside any `try/catch`.
- **File**: `modules/ai-tasks-sessions.js`, Line 56:
```javascript
56:       const legacyHistory = sanitizeSessionMessages(JSON.parse(localStorage.getItem("lumina_ai_history") || "[]"));
```
Executed outside the initial `try/catch` block when `aiSessions` is empty.

---

#### Observation 6 (SAST-06): Top-Level Handler Exceptions in Serverless Routes
- **File**: `api/calendar.js`, Lines 1097–1134:
```javascript
1097: export default async function handler(req, res) {
1098:   setCorsHeaders(req, res);
1099:   if (req.method === 'OPTIONS') return res.status(204).end();
...
1114:   if (action === 'auth') {
1115:     return handleAuth(req, res);
1116:   }
1117:   if (action === 'callback') {
1118:     return handleCallback(req, res);
1119:   }
...
```
No `try/catch` surrounds `handler(req, res)`. If an unexpected error occurs during pre-dispatch or inside any sub-handler without an internal catch, the serverless function crashes.
- **File**: `api/compile.js`, Lines 37–90:
`validateSession`, `checkRateLimit`, and `inspectJevCommandSafety` are located outside the `try` block.
- **File**: `api/terminal.js`, Lines 45–89:
`validateSession`, `checkRateLimit`, and `inspectJevCommandSafety` are located outside the `try` block.
- **File**: `api/chat.js`, Lines 139–187:
The `telemetry` route and initial session/rate limit checks are outside the `try` block.

---

#### Observation 7 (SAST-07): Missing Rate-Limiting on `api/iot.js`
- **File**: `api/iot.js`, Line 6:
```javascript
6: import {
7:   validateSession,
8:   checkRateLimit,
9:   sendSecureJson,
10:   setSecurityHeaders,
11:   enforcePayloadLimit,
12:   getClientIp,
13:   auditLog
14: } from './_lib/auth-guard.js';
```
`checkRateLimit` is imported, but grep search across `api/iot.js` confirms zero occurrences of `checkRateLimit(`. Neither physical command queueing (`action === 'command'`) nor status reads are rate-limited.

---

#### Observation 8 (SAST-08): Missing CHIPS `Partitioned` Attribute in `api/auth.js`
- **File**: `api/auth.js`, Lines 105–111:
```javascript
105:       res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
106:         httpOnly: true,
107:         secure: isCrossSite ? true : isHttps,
108:         sameSite: isCrossSite ? 'none' : 'lax',
109:         maxAge: sessionTtl,
110:         path: '/'
111:       }));
```
- **Comparison**: In `api/calendar.js` line 130:
```javascript
partitioned: isHttps,
```
`partitioned: isCrossSite || isHttps` is missing from `api/auth.js`. Modern browsers (Chrome 118+) dropping third-party cookies reject cross-site `Set-Cookie` headers lacking `Partitioned`.

---

#### Observation 9 (SAST-09): Object Prototype Shadowing in `RUNNERS[language]`
- **File**: `api/compile.js`, Line 92:
```javascript
92:   const runner = RUNNERS[language ? language.toLowerCase() : 'python'] || RUNNERS.python;
```
If `language` is `"constructor"`, `RUNNERS['constructor']` returns `Object`, which is truthy. In lines 97–99, `runner.file` and `runner.cmd` evaluate to `undefined`.

---

## 2. Logic Chain

1. **SAST-01 (SSRF)**:
   - `isBlockedSsrfTarget` validates URLs against SSRF targets using `parsed.hostname`.
   - The IPv6-mapped IPv4 check specifically tests `hostname.startsWith('::ffff:') || hostname.startsWith('0:0:0:0:0:ffff:')`.
   - Deprecated IPv4-compatible IPv6 addresses (`::127.0.0.1`, `::169.254.169.254`) normalize under the WHATWG URL parser to `::7f00:1` and `::a9fe:a9fe`.
   - Because they do not have the `ffff` prefix, they bypass the normalization block.
   - Because they are not dotted-quad IPv4 strings, they bypass the IPv4 block.
   - Because they do not match `::1`, `fe80:`, `fc`, or `fd`, they bypass the IPv6 block.
   - Therefore, `isBlockedSsrfTarget` returns `false`.
   - In `api/chat.js` line 363, `customEndpoint` is validated with `isBlockedSsrfTarget(customEndpoint)`. Because it returns `false`, `fetch(configuredEndpoint)` sends an HTTP request to the internal address.

2. **SAST-02 & SAST-03 (MicroVM Injection and Traversal)**:
   - `api/terminal.js` and `api/compile.js` enforce both `inspectJevCommandSafety()` on commands and `sanitizeFilePath()` on filenames.
   - `api/chat.js` and `api/worker.js` implement tool extraction (`[TOOL:EXEC]` and `[TOOL:WRITE_FILE]`), but dispatch the resulting commands directly to `sbx.commands.run(cmd)` and files directly to `sbx.files.write(name, content)`.
   - Consequently, any adversarial command emitted by the model executes inside the microVM without System-1 safety gating, and any filename containing `../` writes outside the sandbox workspace directory.

3. **SAST-04 & SAST-05 (Client Denial of Service via Storage Corruption)**:
   - `modules/state.js` executes immediately upon script load.
   - Bare `JSON.parse` invocations on lines 79, 80, 89, and 96 do not have `try/catch` protection.
   - If an unexpected value, truncated string, or unparseable payload is present in `localStorage`, a synchronous unhandled `SyntaxError` aborts script execution, leaving the dashboard in a blank/frozen state.

4. **SAST-06 (Serverless Crash Vectors)**:
   - Edge handlers without enclosing `try/catch` rely on platform runtime crash handling.
   - In `api/calendar.js`, uncaught rejections in sub-handlers propagate to the edge runtime, resulting in generic 500 error pages without CORS headers, preventing the client from understanding the failure.

5. **SAST-07 (IoT Rate Limiting)**:
   - `api/iot.js` imports `checkRateLimit` from `auth-guard.js`.
   - Neither telemetry submission nor command queuing calls `checkRateLimit`.
   - This violates the system requirement for rate-limiting enforcement on IoT endpoints.

---

## 3. Caveats

1. **Sandbox Containment**:
   - MicroVM command execution occurs inside an isolated E2B / Firecracker MicroVM rather than on the host serverless Node.js container. However, lack of command filtering allows malicious commands to compromise the ephemeral VM or perform egress traffic from the VM network.
2. **DNS Rebinding**:
   - `isBlockedSsrfTarget` performs syntactic URL validation without resolving hostnames via DNS lookup. Public domain names resolving to `127.0.0.1` (e.g. `127.0.0.1.nip.io`) would pass hostname regex checks unless DNS resolution is enforced before request dispatch.
3. **Firmware Invariant**:
   - All proposed IoT gateway remediations strictly preserve the requirement that ESP32 physical firmware files (`firmware/**`) remain 100% untouched.

---

## 4. Conclusion

The codebase demonstrates substantial defense-in-depth engineering (strict HMAC-SHA256 signature verification, constant-time `crypto.timingSafeEqual` evaluations, monotonic sequence tracking, zero-trust session validation, and prototype pollution sanitizers).

However, static analysis identified 9 specific defects:
1. Critical SSRF filter bypass on IPv4-compatible IPv6 addresses (`::a9fe:a9fe`, `::7f00:1`).
2. High-severity command safety bypass on `[TOOL:EXEC]` directives in `api/chat.js` and `api/worker.js`.
3. High-severity frontend crash vectors from unguarded `JSON.parse` in `modules/state.js`.
4. Medium-severity missing rate limiting in `api/iot.js`.
5. Medium-severity missing `Partitioned` cookie flag in `api/auth.js`.
6. Medium-severity unhandled exception exposure in serverless handler outer scopes.

---

## 5. Verification Method & Exact Mitigations

### Independent Verification Commands
Run the automated verification test suites:
```bash
# 1. Syntax validation across all 40 modules
node tests/lint.cjs

# 2. Comprehensive 42-assertion recheck audit
node tests/recheck-all-tasks.cjs

# 3. 141-assertion adversarial penetration challenge
node tests/challenger-r4-empirical.cjs

# 4. 109-probe calendar adversarial harness
node tests/adversarial-calendar.test.cjs

# 5. 63-assertion challenger calendar empirical harness
node tests/challenger-calendar-empirical.cjs

# 6. 25-assertion suite calendar adversarial
node tests/suite-calendar-adversarial.cjs

# 7. 1,102-assertion unit test suite
node tests/features.test.cjs
```

---

### Recommended Defensive Mitigations

#### 1. Fix SSRF Filter Bypass (`api/_lib/key-pool.js`)
**Lines 254–270**: Expand normalization to handle IPv4-compatible IPv6 (without `ffff`), and explicitly block hex segments `7f00:` (127.0.0.0/8), `a9fe:` (169.254.0.0/16), `0a00:` (10.0.0.0/8), `ac10:` through `ac1f:` (172.16.0.0/12), and `c0a8:` (192.168.0.0/16):
```javascript
  // Normalize IPv6-mapped & IPv4-compatible IPv6 addresses to standard IPv4
  const isIpv4Mapped = hostname.startsWith('::ffff:') || hostname.startsWith('0:0:0:0:0:ffff:');
  const isIpv4Compat = hostname.startsWith('::') && !hostname.startsWith('::1') && hostname.includes(':');
  if (isIpv4Mapped || isIpv4Compat) {
    const suffix = hostname.replace(/^(::ffff:|0:0:0:0:0:ffff:|::)/, '');
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(suffix)) {
      hostname = suffix;
    } else if (suffix.includes(':')) {
      const parts = suffix.split(':').map(h => parseInt(h, 16));
      if (parts.length === 2 && !parts.some(isNaN)) {
        hostname = [
          (parts[0] >> 8) & 0xff,
          parts[0] & 0xff,
          (parts[1] >> 8) & 0xff,
          parts[1] & 0xff
        ].join('.');
      }
    }
  }

  // Also block hex representations of private/metadata IPs in IPv6 hextets
  if (
    hostname.includes('7f00:') ||
    hostname.includes('a9fe:') ||
    hostname.includes('0a00:') ||
    hostname.includes('c0a8:') ||
    hostname === '::7f00:1' ||
    hostname === '::a9fe:a9fe'
  ) {
    return true;
  }
```

#### 2. Screen Model Tool Directives with `inspectJevCommandSafety` (`api/chat.js` & `api/worker.js`)
In `api/chat.js` (line 706) and `api/worker.js` (line 338), screen each `cmd` prior to execution:
```javascript
import { inspectJevCommandSafety } from './_lib/jev-engine.js';
...
for (const cmd of cmdsToRun) {
  const safety = inspectJevCommandSafety(cmd);
  if (!safety.safe) {
    terminalLogs.push(`🛡️ [Jev Guardrail]: Blocked destructive command: ${cmd} (${safety.threatCategory})`);
    commandOutputCombined += `[JEV SAFETY BLOCKED]: ${safety.reason}\n`;
    continue;
  }
  terminalLogs.push(`➜ ${cmd}`);
  const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });
...
```

#### 3. Sanitize MicroVM VFS Filenames (`api/chat.js` & `api/worker.js`)
In `api/chat.js` (line 700) and `api/worker.js` (line 335):
```javascript
function sanitizeFilePath(userPath) {
  if (!userPath || typeof userPath !== 'string') return '';
  const clean = userPath.replace(/\0/g, '').replace(/\\/g, '/').trim();
  const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return '';
  return normalized;
}

for (const [name, content] of Object.entries(currentVfs)) {
  const safeName = sanitizeFilePath(name);
  if (safeName) {
    await sbx.files.write(safeName, content);
  }
}
```

#### 4. Guard All `JSON.parse` in `modules/state.js`
In `modules/state.js`, wrap storage parses in safe helper:
```javascript
function safeJsonParse(val, fallback) {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch (_) { return fallback; }
}

window.aiConversation = safeJsonParse(localStorage.getItem("lumina_ai_history"), []);
window.vaultNotes = safeJsonParse(localStorage.getItem("lumina_godx_multi_notes"), [...]);
window.vfs = safeJsonParse(localStorage.getItem("lumina_codespace_vfs"), {...});
window.codespaceOpenTabs = safeJsonParse(localStorage.getItem("lumina_open_tabs"), ["index.html"]);
```

#### 5. Guard `JSON.parse` in `modules/cloud-sync.js` and `modules/ai-tasks-sessions.js`
- `modules/cloud-sync.js` line 156:
```javascript
let adminVault = [];
try { adminVault = JSON.parse(localStorage.getItem('lumina_temp_vault') || '[]'); } catch (_) {}
...
admin_passwords: Array.isArray(adminVault) ? adminVault : [],
```
- `modules/ai-tasks-sessions.js` line 56:
```javascript
let legacyHistory = [];
try { legacyHistory = sanitizeSessionMessages(JSON.parse(localStorage.getItem("lumina_ai_history") || "[]")); } catch (_) {}
```

#### 6. Wrap Serverless Dispatchers in Top-Level `try/catch`
- In `api/calendar.js`:
```javascript
export default async function handler(req, res) {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    ...
  } catch (error) {
    return sendSecureJson(res, 500, { error: 'Internal calendar controller error: ' + error.message }, req);
  }
}
```
- Wrap pre-try blocks in `api/compile.js`, `api/terminal.js`, and `api/chat.js` so unhandled promise rejections are converted to HTTP 500 JSON responses.

#### 7. Add Rate Limiting to `api/iot.js`
In `api/iot.js` handler (around line 1045):
```javascript
// Rate limiting (60 hardware commands / 60 seconds)
const rate = await checkRateLimit(req, storage, 'iot', 60, 60);
if (!rate.allowed) {
  auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/iot');
  return sendSecureJson(res, rate.status, { error: rate.error });
}
```

#### 8. Add `partitioned` Flag in `api/auth.js`
In `api/auth.js` line 105:
```javascript
res.setHeader('Set-Cookie', serialize('godx_session', sessionId, {
  httpOnly: true,
  secure: isCrossSite ? true : isHttps,
  sameSite: isCrossSite ? 'none' : 'lax',
  partitioned: isCrossSite || isHttps,
  maxAge: sessionTtl,
  path: '/'
}));
```

#### 9. Prevent Prototype Property Lookup in `api/compile.js`
In `api/compile.js` line 92:
```javascript
const langKey = language && typeof language === 'string' ? language.toLowerCase().trim() : 'python';
const runner = Object.prototype.hasOwnProperty.call(RUNNERS, langKey) ? RUNNERS[langKey] : RUNNERS.python;
```
