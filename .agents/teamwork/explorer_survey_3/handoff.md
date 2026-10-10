# Explorer Survey 3: Client Sandboxes, VFS Boundaries & Test Baselines Report

**Survey Lead**: Explorer 3  
**Target Surface**: Client execution sandboxes (`modules/codespace.js`, `modules/compiler.js`), VFS storage boundaries, repository-wide line count budget (< 2,000 lines), and test suite baseline verification.  
**Integrity Mode**: Read-only survey & defensive analysis.

---

## 1. Observation

### 1.1 Test Suite Initial Baselines
All 4 test verification suites were executed against the active repository:

1. **Unit Test Suite (`tests/features.test.cjs`)**:
   - Command: `node tests/features.test.cjs`
   - Output: `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===`
   - Status: **100% PASS** (1,102 passed, 0 failures).
2. **Task Recheck Suite (`tests/recheck-all-tasks.cjs`)**:
   - Command: `node tests/recheck-all-tasks.cjs`
   - Output: `🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!`
   - Status: **100% PASS** (42 passed, 0 failures).
3. **Syntax Linter Suite (`tests/lint.cjs`)**:
   - Command: `node tests/lint.cjs`
   - Output: `✓ All 40 JavaScript modules passed syntax validation.`
   - Status: **100% PASS** (40 JS modules validated, 0 errors).
4. **Automated Chrome CDP Browser Verification (`tests/browser-cdp-test.cjs`)**:
   - Command: `node tests/browser-cdp-test.cjs`
   - Output: `=== BROWSER TEST RESULTS: 122/122 PASSED === | 🎉 ALL REAL-BROWSER TESTS PASSED IN GOOGLE CHROME!`
   - Status: **100% PASS** (122 browser assertions passed, 0 uncaught exceptions).

### 1.2 Repository-Wide Line Count Audit (< 2,000 Line Budget)
Repository scan across all code and text files:
- **Total code/text files exceeding 2,000 lines**: **0**
- **Files approaching 2,000 lines (>= 1,800 lines)**:
  1. `tests/features.test.cjs`: **1,984 lines** (CRITICAL: exactly 16 lines under budget; any new tests will overflow the 2,000 line rule!)
  2. `dashboard.html`: **1,917 lines** (83 lines under budget)
  3. `modules/whiteboard-vision.js`: **1,888 lines** (112 lines under budget)
  4. `modules/personas/business-finance-legal.js`: **1,822 lines**
  5. `modules/personas/education-support.js`: **1,822 lines**
  6. `modules/personas/lifestyle-wellness.js`: **1,822 lines**
- **Target Files for Client Sandboxes & Execution**:
  - `modules/codespace.js`: **589 lines**
  - `modules/compiler.js`: **165 lines**
  - `modules/terminal.js`: **176 lines**
  - `modules/projects.js`: **142 lines**
  - `api/terminal.js`: **119 lines**
  - `api/compile.js`: **87 lines**
  - `api/storage.js`: **133 lines**

---

### 1.3 Vulnerability Observations Across Client Sandboxes & VFS

#### Obs 1: Missing `sandbox` attribute on Live HTML Compiler Preview Frame
- **File**: `dashboard.html:731`
- **Code**:
  ```html
  <iframe id="sandboxPreviewFrame" class="w-full h-full border-0 absolute inset-0"></iframe>
  ```
- **Execution in `modules/compiler.js:69-70`**:
  ```javascript
  const previewFrame = document.getElementById("sandboxPreviewFrame");
  if (previewFrame) previewFrame.srcdoc = code;
  ```
- **Finding**: Unlike `csPreviewFrame` (which defines `sandbox="allow-scripts allow-modals allow-forms"` at line 614), `sandboxPreviewFrame` has **no `sandbox` attribute at all**. Code supplied to `sandboxCodeInput` rendered via `srcdoc` executes in the same origin as the parent dashboard with full access to `window.parent.localStorage`, `document.cookie`, and DOM manipulation.

#### Obs 2: Dangerous `allow-same-origin` on Project & Split-View Iframes
- **Files**: `dashboard.html:683, 897, 898`, `modules/telemetry-theme.js:99`
- **Code**:
  `dashboard.html:683`:
  ```html
  <iframe id="previewIframe" src="about:blank" sandbox="allow-scripts allow-same-origin allow-popups allow-modals" class="w-full h-full border-0 bg-white"></iframe>
  ```
  `dashboard.html:897-898`:
  ```html
  <iframe id="splitLeftFrame" sandbox="allow-scripts allow-same-origin" class="w-full flex-1 border-0"></iframe>
  <iframe id="splitRightFrame" sandbox="allow-scripts allow-same-origin" class="w-full flex-1 border-0"></iframe>
  ```
  `modules/telemetry-theme.js:99`:
  ```javascript
  frame.setAttribute("sandbox", allow ? "allow-scripts allow-same-origin allow-popups allow-modals allow-forms" : "");
  ```
- **Finding**: W3C HTML5 and MDN security standards state that combining `allow-scripts` with `allow-same-origin` allows embedded scripts to break out of sandboxing and access the embedding parent's origin directly. Any project loaded from `EXM/` or via custom user URL can read `parent.localStorage` and steal admin tokens.

#### Obs 3: Same-Origin Token Leakage via `openCodespacePopout()`
- **File**: `modules/codespace.js:439-442`
- **Code**:
  ```javascript
  function openCodespacePopout() {
    const blob = new Blob([bundleCodespaceHTML()], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  }
  ```
- **Finding**: A `blob:` URL created on the main window inherits the origin (`window.origin`). When opened in a new window/tab, any script in the VFS bundle executes with same-origin privileges, granting access to `window.localStorage` and `window.opener`.

#### Obs 4: DOM XSS in Codespace File Tree & Tabs via Unescaped VFS Keys
- **File**: `modules/codespace.js:78, 103, 125, 160`
- **Code**:
  ```javascript
  // Line 78:
  item.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}"></i><span class="truncate">${key}</span>`;

  // Line 103:
  <span class="truncate">${folder}/</span>

  // Line 125:
  item.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}"></i><span class="truncate">${subFile}</span>`;

  // Line 160:
  tab.innerHTML = `<span>${file.split('/').pop()}</span><button onclick="event.stopPropagation(); removeSpecificTab('${file}')" class="hover:text-rose-400 text-[10px]">×</button>`;
  ```
- **Finding**: Although `escapeHtml()` is declared at line 6, it is omitted when interpolating `${key}`, `${folder}`, `${subFile}`, and `${file}` into DOM elements. If a file or folder contains HTML tags or double/single quotes (e.g., `"><svg onload=alert(1)>`), it causes immediate DOM XSS upon rendering the file tree or tab bar.

#### Obs 5: MicroVM-to-Browser Stored XSS via Workspace File Sync
- **Files**: `modules/codespace.js:480-485`, `modules/terminal.js:152-157`
- **Code**:
  ```javascript
  if (Array.isArray(d.workspaceFiles)) {
    d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
    localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
    if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
  }
  ```
- **Finding**: When commands execute in the microVM (via `/api/terminal`), newly generated files are returned in `workspaceFiles`. Their names `f.name` are inserted into `vfs` and immediately passed to `renderCodespaceFileTree()`. If a command or build script creates a file with HTML entities in its filename (e.g. `touch '<img src=x onerror=alert(1)>'`), the browser executes it as script upon returning from the microVM.

#### Obs 6: Command Injection via Unsanitized Filename in `runActiveFile()`
- **File**: `modules/codespace.js:346-350`
- **Code**:
  ```javascript
  let cmd = `python3 "${window.csActiveFile}"`;
  if (window.csActiveFile.endsWith('.js')) cmd = `node "${window.csActiveFile}"`;
  if (window.csActiveFile.endsWith('.sh')) cmd = `bash "${window.csActiveFile}"`;
  if (window.csActiveFile.endsWith('.cpp')) cmd = `g++ -O2 "${window.csActiveFile}" -o out && ./out`;
  if (window.csActiveFile.endsWith('.java')) cmd = `javac "${window.csActiveFile}" && java Main`;
  ```
- **Finding**: Filenames are enclosed in double quotes without escaping quotes or shell metacharacters. A filename such as `app.py"; id; echo "` results in `cmd = 'python3 "app.py"; id; echo ""'`, injecting arbitrary shell commands before transmission to `/api/terminal`.

#### Obs 7: Prototype Collision & UI Crash (DoS) in `renderCodespaceFileTree()`
- **File**: `modules/codespace.js:45-55`
- **Code**:
  ```javascript
  const tree = {};
  filenames.forEach(file => {
    const parts = file.split('/');
    if (parts.length === 1) {
      tree[parts[0]] = '__FILE__';
    } else {
      const folder = parts[0];
      if (!tree[folder]) tree[folder] = [];
      tree[folder].push(parts.slice(1).join('/'));
    }
  });
  ```
- **Verified Execution**: Running this code with `folder = 'toString'` throws:
  `TypeError: tree[folder].push is not a function`
- **Finding**: Because `tree` inherits from `Object.prototype`, standard prototype properties (`toString`, `valueOf`, `constructor`) exist and evaluate to functions. The check `if (!tree[folder])` evaluates to false, causing `tree[folder].push(...)` to throw an uncaught TypeError, crashing the file tree render cycle.

#### Obs 8: Prototype Pollution in VFS Writes
- **Files**:
  - `modules/codespace.js:388, 402, 414, 508`
  - `modules/ai-studio.js:741, 759, 777`
  - `modules/cloud-sync.js:362`
- **Finding**: Setting `window.vfs[key] = content` without filtering `__proto__`, `prototype`, or `constructor` permits prototype modification when importing external workspace files or cloud states.

#### Obs 9: Flawed Path Traversal Sanitization in `api/terminal.js`
- **File**: `api/terminal.js:83`
- **Code**:
  ```javascript
  const safeName = file.name.replace(/\.\.+[/\\]/g, '').replace(/^\/+/, '');
  ```
- **Finding**:
  Unlike `api/storage.js:15-27` which correctly uses `path.posix.normalize` and strips null bytes, `api/terminal.js` uses a single-pass regex. For input `..\windows\win.ini`, `.replace(/^\/+/, '')` only targets forward slashes, leaving leading backslashes `\windows\win.ini`.

#### Obs 10: Missing Server-Side Jev Guardrail in `/api/compile`
- **File**: `api/compile.js:24-86`
- **Finding**: While `api/terminal.js` executes `const jevSafety = inspectJevCommandSafety(command);` (line 58), `api/compile.js` contains **no server-side guardrail check**. The client-side screening in `modules/compiler.js:76` can be bypassed by an attacker dispatching directly to `POST /api/compile`.

#### Obs 11: Unvalidated `e.origin` in `postMessage` Listener
- **File**: `modules/calendar-sync.js:665-671`
- **Code**:
  ```javascript
  window.addEventListener('message', async (e) => {
    if (e.data && e.data.type === 'GCAL_AUTH_SUCCESS') {
      setSettings({ googleCalendarConnected: true });
      updateSyncStatusBadge();
      await syncGoogleCalendar();
    }
  });
  ```
- **Finding**: The listener performs zero origin validation (`e.origin`). Any cross-origin window or iframe can broadcast `{ type: 'GCAL_AUTH_SUCCESS' }` to trigger synchronization loops or state changes.

#### Obs 12: Silent `QuotaExceededError` Risk in LocalStorage VFS
- **File**: `modules/codespace.js:229-254, 520-524`
- **Finding**: `updateStorageQuotaMeter()` displays a "1 GB Free Sovereign Tier" (`MAX_STORAGE_BYTES = 1024 * 1024 * 1024`), yet the VFS is persisted to `localStorage` (capped at ~5MB). Uploading more than 5MB triggers `QuotaExceededError` inside a silent `try...catch`, leading to silent data desynchronization.

---

## 2. Logic Chain

1. **Premise**: Client execution sandboxes are intended to provide safe previews and execution of untrusted user-supplied code without compromising the hosting LuminaVista dashboard.
2. **Step 1**: In `dashboard.html:731`, `#sandboxPreviewFrame` lacks a `sandbox` attribute. When HTML is selected in Compiler Studio, `previewFrame.srcdoc = code` runs with parent origin access. An attacker or payload can synchronously access `window.parent.localStorage` and steal credentials.
3. **Step 2**: In `dashboard.html:683, 897, 898`, `#previewIframe` and `#splitLeftFrame` / `#splitRightFrame` include `allow-same-origin` alongside `allow-scripts`. Under standard browser security models, this permits embedded scripts to access `window.parent` and bypass the iframe boundary.
4. **Step 3**: In `modules/codespace.js:78, 103, 125, 160`, VFS filenames and folder names are concatenated directly into HTML template strings without `escapeHtml()`. When file tree nodes or tabs render, arbitrary HTML/script in filenames executes in the parent context.
5. **Step 4**: When `api/terminal.js` syncs files created in the microVM back to the browser VFS, these untrusted names flow directly into `renderCodespaceFileTree()`, resulting in a MicroVM-to-Browser Stored XSS path.
6. **Step 5**: In `modules/codespace.js:45-55`, `tree` is an empty object inheriting from `Object.prototype`. If a folder name matches an Object method (e.g. `toString`), `tree[folder].push` throws a TypeError, causing complete denial of service in the UI.
7. **Step 6**: In `modules/codespace.js:346-350`, `window.csActiveFile` is directly interpolated into a command line string without shell escaping, leading to command injection when executed in the microVM.
8. **Step 7**: In `api/terminal.js:83`, the regex used for path traversal does not sanitize backslashes or normalize paths, contrasting with `api/storage.js:15-27`.
9. **Step 8**: In `api/compile.js`, no server-side Jev guardrails are enforced, allowing direct API callers to run uninspected code in the E2B sandbox.
10. **Conclusion**: The client-side sandbox and VFS boundary contain multiple high-severity vulnerabilities (sandbox escapes, DOM injection, prototype collision, command injection, path traversal) that must be mitigated defensively without breaking existing tests or exceeding line budgets.

---

## 3. Caveats

- **Assumption on MicroVM Access**: MicroVM executions via `/api/terminal` and `/api/compile` depend on `E2B_API_KEY`. When the key is unconfigured, the endpoints fail closed with HTTP 500/502.
- **Line Count Margin on `tests/features.test.cjs`**: `tests/features.test.cjs` currently stands at **1,984 lines**. Any new test assertions added during remediation MUST be either added to a separate test file (e.g. `tests/sandbox-vfs-security.test.cjs`) or budgeted with extreme care to avoid violating the strict `< 2,000 lines` invariant.
- **Binary Files in `EXM/`**: Binary files (such as PNGs/JPGs in `EXM/Car Slider Animation/images/img-3.png`) have large line counts when treated as raw text lines, but are excluded from JavaScript/HTML code budget limits.
- No other areas were assumed; all claims were verified via direct code inspection and script execution.

---

## 4. Conclusion & Recommended Defensive Remediations

The client execution sandbox and VFS attack surfaces require targeted, surgical defensive remediation across the following files:

| # | Vulnerability | Target File(s) | Recommended Defensive Fix |
|---|---|---|---|
| 1 | Missing sandbox on `#sandboxPreviewFrame` | `dashboard.html:731` | Add `sandbox="allow-scripts allow-modals allow-forms"` to `#sandboxPreviewFrame`. |
| 2 | Insecure `allow-same-origin` on preview & split iframes | `dashboard.html:683, 897, 898`, `modules/telemetry-theme.js:99` | Remove `allow-same-origin` from all sandboxed iframes. Use `sandbox="allow-scripts allow-modals allow-popups allow-forms"`. |
| 3 | DOM XSS in Codespace Tree & Tabs | `modules/codespace.js:78, 103, 125, 160` | Apply `escapeHtml()` to `key`, `folder`, `subFile`, and `file.split('/').pop()`. Replace inline `onclick="removeSpecificTab('${file}')"` with programmatic event listeners. |
| 4 | Command injection in `runActiveFile()` | `modules/codespace.js:346-350` | Validate `window.csActiveFile` against `^[a-zA-Z0-9_\-\./]+$`. Reject quotes, semicolons, backticks, newlines, and metacharacters. |
| 5 | Prototype collision DoS on `renderCodespaceFileTree` | `modules/codespace.js:45-55` | Use `Object.create(null)` for `tree`, or validate `folder !== '__proto__' && folder !== 'constructor' && folder !== 'prototype' && !Object.prototype.hasOwnProperty(folder)`. |
| 6 | Prototype pollution in VFS mutations | `modules/codespace.js`, `modules/ai-studio.js` | Enforce a strict VFS key validator that rejects `__proto__`, `prototype`, `constructor`, and traversal characters (`..`). |
| 7 | Path traversal in `api/terminal.js` | `api/terminal.js:83` | Replace single-pass regex with the robust `sanitizeFilePath()` logic from `api/storage.js`. |
| 8 | Missing Jev guardrails on `/api/compile` | `api/compile.js` | Import and enforce `inspectJevCommandSafety` / `inspectJevGuardrails` before creating E2B sandbox. |
| 9 | Unvalidated `postMessage` origin | `modules/calendar-sync.js:665` | Verify `e.origin === window.location.origin` or trusted origin whitelist before processing `GCAL_AUTH_SUCCESS`. |
| 10 | Line budget constraint preservation | Repository-wide | Ensure `tests/features.test.cjs` does not exceed 1,999 lines; place new defensive unit tests in dedicated co-located or modular test files if needed. |

---

## 5. Verification Method

To independently verify all findings and test suite baselines:

1. **Run Unit Test Suite**:
   ```bash
   node tests/features.test.cjs
   ```
   *Expected*: Exactly 1,102 passed assertions, 0 errors.

2. **Run Task Recheck Suite**:
   ```bash
   node tests/recheck-all-tasks.cjs
   ```
   *Expected*: Exactly 42 passed assertions, 0 errors.

3. **Run Syntax Linter**:
   ```bash
   node tests/lint.cjs
   ```
   *Expected*: 40 JavaScript modules validated, 0 errors.

4. **Run Chrome CDP Browser Suite**:
   ```bash
   node tests/browser-cdp-test.cjs
   ```
   *Expected*: Exactly 122 browser tests passed in Chrome, 0 uncaught exceptions.

5. **Verify Line Count Budget (< 2,000 lines)**:
   ```bash
   node -e "const fs = require('fs'), path = require('path'); const exts = new Set(['.js','.cjs','.mjs','.html','.css','.json']); function check(d) { for (const f of fs.readdirSync(d, {withFileTypes:true})) { if (['node_modules','.git'].includes(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) check(p); else if (exts.has(path.extname(f.name).toLowerCase())) { const l = fs.readFileSync(p,'utf8').split('\n').length; if (l >= 2000) console.log('OVER BUDGET:', p, l); } } } check('.');"
   ```
   *Expected*: No files printed (0 files >= 2,000 lines).

6. **Verify Prototype Collision Crash**:
   ```bash
   node -e "const tree = {}; const folder = 'toString'; if (!tree[folder]) tree[folder] = []; tree[folder].push('test');"
   ```
   *Expected*: Reproduces `TypeError: tree[folder].push is not a function`.
