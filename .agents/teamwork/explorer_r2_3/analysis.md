# Surface 4 Security & Sandboxing Audit: Client Execution Sandboxes & VFS Boundaries

**Auditor**: Explorer R2-3 (Senior Client Security & Virtual Sandbox Specialist)  
**Date**: 2026-10-16  
**Scope**: Surface 4 — Client Execution Sandboxes, Virtual Filesystem (VFS), Preview Iframes, Compiler Bridges, and PostMessage Origins.  
**Files Audited**:
- `dashboard.html`
- `modules/codespace.js`
- `modules/compiler.js`
- `modules/ai-studio.js`
- `api/terminal.js`
- `api/compile.js`
- `modules/calendar-sync.js`
- `modules/telemetry-theme.js`

---

## Executive Summary

A comprehensive, read-only adversarial audit of Surface 4 was conducted across all iframe execution environments, DOM rendering sinks, VFS mutation paths, serverless terminal/compiler execution bridges, and cross-window communication channels.

**Verdict: ALL SANDBOX AND VFS BOUNDARIES ARE WATERTIGHT.**
Zero sandbox escapes, zero DOM XSS vulnerabilities, zero prototype pollution injection vectors, and zero command injection flaws were found. All line count budgets strictly adhere to the project constraint of $< 2,000$ lines.

---

## 1. Iframe Sandbox Attributes & Origin Isolation Audit

### Target Elements
1. `#csPreviewFrame` (`dashboard.html:614`)
2. `#previewIframe` (`dashboard.html:683`)
3. `#sandboxPreviewFrame` (`dashboard.html:731`)
4. `#splitLeftFrame` (`dashboard.html:897`)
5. `#splitRightFrame` (`dashboard.html:898`)

### Verification & Evidence Chain

| Iframe ID | File Location | Configured Sandbox Flags | Contains `allow-same-origin`? | Status |
|---|---|---|---|---|
| `#csPreviewFrame` | `dashboard.html:614` | `allow-scripts allow-modals allow-forms` | **NO** | **SECURE** |
| `#previewIframe` | `dashboard.html:683` | `allow-scripts allow-modals allow-popups allow-forms` | **NO** | **SECURE** |
| `#sandboxPreviewFrame` | `dashboard.html:731` | `allow-scripts allow-modals allow-forms` | **NO** | **SECURE** |
| `#splitLeftFrame` | `dashboard.html:897` | `allow-scripts allow-modals allow-popups allow-forms` | **NO** | **SECURE** |
| `#splitRightFrame` | `dashboard.html:898` | `allow-scripts allow-modals allow-popups allow-forms` | **NO** | **SECURE** |

### Critical Security Analysis: The `allow-scripts` + `allow-same-origin` Anti-Pattern
Under the HTML5 iframe sandboxing specification, combining `allow-scripts` and `allow-same-origin` on an iframe executing untrusted or user-generated code allows the script to remove its own `sandbox` attribute or access the parent origin's DOM, `localStorage`, `sessionStorage`, cookies, and sovereign session tokens (`lv_...`).

- In LuminaVista OS, **NONE** of the five execution frames possess `allow-same-origin`.
- The sandboxed context treats documents within these frames as having an opaque, unique origin (`null`).
- Any attempt from within the iframe to access `window.parent.localStorage`, `window.parent.document`, or call top-level window methods throws a standard cross-origin `SecurityError`.
- In `modules/telemetry-theme.js:99`, the dynamic policy toggle `applySandboxPolicy()` sets:
  ```javascript
  frame.setAttribute("sandbox", allow ? "allow-scripts allow-modals allow-popups allow-forms" : "");
  ```
  It strictly omits `allow-same-origin` even when scripts are enabled, maintaining complete cross-origin isolation.

---

## 2. Codespace IDE & Virtual Filesystem (VFS) Security (`modules/codespace.js`)

### 2.1 Popout Window Sandbox Integrity (`openCodespacePopout`)
- **Inspection Area**: `modules/codespace.js:485-493`
- **Mechanism**:
  ```javascript
  function openCodespacePopout() {
    const rawHtml = bundleCodespaceHTML();
    const isolatedContainer = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Codespace Preview</title><style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#000;}iframe{width:100%;height:100%;border:none;display:block;}</style></head><body><iframe sandbox="allow-scripts allow-modals allow-popups allow-forms" id="popoutFrame" style="width:100%;height:100%;"></iframe><script>try{window.opener=null;}catch(e){}document.getElementById('popoutFrame').srcdoc=${JSON.stringify(rawHtml).replace(/</g, '\\u003c')};<\/script></body></html>`;
    const blob = new Blob([isolatedContainer], { type: "text/html" });
    const popout = window.open(URL.createObjectURL(blob), "_blank");
    if (popout) {
      try { popout.opener = null; } catch (_) {}
    }
  }
  ```
- **Adversarial Assessment**:
  1. The outer Blob container explicitly severs `window.opener = null` both inside the container script and on the returned window reference.
  2. The raw user HTML is rendered inside an isolated inner iframe `#popoutFrame` with `sandbox="allow-scripts allow-modals allow-popups allow-forms"` (no `allow-same-origin`).
  3. JSON stringification with `<` escaping (`\u003c`) guarantees that user code containing `</script>` cannot break out of the container bootstrapping script.
  4. The code running in `#popoutFrame` has origin `null`, cannot access the parent Blob window, and cannot reach back into the main application.

### 2.2 DOM XSS Audit
- **Inspection Area**:
  - `renderCodespaceFileTree()` (`modules/codespace.js:50-150`)
  - `renderCodespaceFileTabs()` (`modules/codespace.js:167-189`)
  - Terminal outputs (`modules/codespace.js:371-413, 513-549`)
- **Findings**:
  - `escapeHtml` is declared at lines 6-13 and correctly encodes `&`, `<`, `>`, `"`, and `'`.
  - Every filename and folder name in the tree is wrapped in `escapeHtml(key)`, `escapeHtml(folder)`, `escapeHtml(subFile)`.
  - Tab labels are escaped via `escapeHtml(file.split('/').pop())`.
  - The breadcrumb label uses `breadcrumb.textContent = window.csActiveFile || ""` (immune to DOM XSS).
  - Terminal commands and execution streams in `runActiveFile()` and `handleIdeTerminalCommand()` wrap all `cmd`, `stdout`, `stderr`, and `error` in `escapeHtml()`.
  - No unescaped user-controlled string interpolation exists in `innerHTML`.

### 2.3 Command Injection Prevention (`runActiveFile`)
- **Inspection Area**: `modules/codespace.js:369-385`
- **Code**:
  ```javascript
  const activeFile = String(window.csActiveFile || '').trim();
  if (!/^[a-zA-Z0-9_\-\./]+$/.test(activeFile) || activeFile.includes('..')) {
    if (termOut) {
      termOut.innerHTML += `<div class="mt-2 text-rose-400 font-bold">✖ Security Error: Invalid filename pattern or path traversal detected</div>`;
      termOut.scrollTop = termOut.scrollHeight;
    }
    if (window.showToast) window.showToast("Security Alert", "Disallowed characters in filename for execution.");
    return;
  }
  ```
- **Findings**:
  - The filename regex `/^[a-zA-Z0-9_\-\./]+$/` permits only alphanumeric characters, underscore, dash, dot, and slash.
  - Characters used in command chaining, shell redirection, quoting, or subshell expansion (`'`, `"`, `;`, `&`, `|`, `$`, `` ` ``, `\n`, spaces) are completely rejected.
  - Path traversal sequences (`..`) are explicitly forbidden.
  - The filename is enclosed in double quotes in commands (`python3 "${activeFile}"`).

### 2.4 Prototype Pollution & Object Prototype Collision Defense
- **Inspection Area**:
  - `isValidVfsKey` (`modules/codespace.js:15-23`, `modules/ai-studio.js:36-44`)
  - Tree construction (`modules/codespace.js:61-71`)
- **Findings**:
  - `isValidVfsKey(key)` checks:
    ```javascript
    if (typeof key !== 'string') return false;
    const k = key.trim();
    if (!k) return false;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
    if (k.includes('__proto__') || k.includes('constructor') || k.includes('prototype')) return false;
    if (k.includes('..')) return false;
    return true;
    ```
  - All mutating entry points (`onEditorContentChange`, `promptCreateFile`, `promptCreateFolder`, `renameActiveFile`, `handleIdeTerminalCommand`, `uploadVfsFiles`, `ai-studio.js` file writes and sync) validate keys with `isValidVfsKey()`.
  - Tree construction uses `const tree = Object.create(null);`, completely eliminating prototype collisions on reserved Object methods (`toString`, `valueOf`, `hasOwnProperty`, `constructor`, `isPrototypeOf`).

---

## 3. Serverless MicroVM Bridges: Path Traversal & Command Injection

### 3.1 `api/terminal.js` Audit
- **Path Traversal Guard**:
  ```javascript
  function sanitizeFilePath(userPath) {
    if (!userPath || typeof userPath !== 'string') return '';
    const clean = userPath
      .replace(/\0/g, '')
      .replace(/\\/g, '/')
      .trim();
    const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      return '';
    }
    return normalized;
  }
  ```
  - Strips null bytes (`\0`).
  - Normalizes Windows backslashes to forward slashes before evaluation.
  - Resolves path segments via `path.posix.normalize()`.
  - Rejects traversal sequences (`..`, `../`, `/../`).
  - Fails closed by returning `''`.
- **Command Safety & Sandboxing**:
  - Session verified with zero-trust token check (`validateSession`).
  - Strict role check requiring `master` or `temporary` role.
  - Rate-limited to 20 commands per 5 minutes per IP.
  - Inspected by `inspectJevCommandSafety(command)` before dispatch.
  - Spawns an isolated E2B microVM (Firecracker sandbox) with a 30s timeout and automatic teardown in `finally`.
  - Secret scrubbing (`scrubSecrets`) applied to output and files before returning to client.

### 3.2 `api/compile.js` Audit
- **Safety Screening**:
  - Zero-trust session verification + role gate (`master` or `temporary`).
  - Sliding IP rate limit (20 req / 5 min).
  - Dual-layer Jev screening: `inspectJevCommandSafety(code)` and `inspectJevGuardrails(code)`.
  - Source code is written directly to predefined filenames (`RUNNERS[language].file` e.g. `main.py`, `main.cpp`), completely eliminating user-controlled file path traversal.
  - Ephemeral execution in E2B microVM with 15s timeout.
  - All output filtered through `scrubSecrets`.

---

## 4. Cross-Window Communication & PostMessage Security (`modules/calendar-sync.js`)

### Inspection Area: `modules/calendar-sync.js:664-672`
```javascript
  // Cross-window and OAuth postMessage listener
  if (typeof window !== 'undefined') {
    window.addEventListener('message', async (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'GCAL_AUTH_SUCCESS') {
        setSettings({ googleCalendarConnected: true });
        updateSyncStatusBadge();
        await syncGoogleCalendar();
      }
    });
```

### Adversarial Findings:
1. **Origin Verification**: The listener enforces `if (e.origin !== window.location.origin) return;`. Messages from any other origin (including untrusted third-party origins, attackers, or sandboxed iframes with `null` origin) are rejected and ignored.
2. **Wildcard `*` Rejection**: There are zero occurrences of wildcard `'*'` target origins in postMessage dispatch across the codebase. In `api/calendar.js`, outgoing postMessages explicitly calculate `targetOrigin` against a strict domain whitelist (`https://subhadraroy.github.io`, `https://lumina-vista-sigma.vercel.app`, `localhost`), defaulting to `https://lumina-vista-sigma.vercel.app`.

---

## 5. Line Count Invariants & Budget Status

All Surface 4 files were measured using newline counts in the working directory:

| File | Actual Line Count | Budget (< 2,000) | Headroom | Compliance Status |
|---|---|---|---|---|
| `dashboard.html` | 1,916 | 2,000 | 84 lines | **PASS** |
| `modules/codespace.js` | 645 | 2,000 | 1,355 lines | **PASS** |
| `modules/compiler.js` | 171 | 2,000 | 1,829 lines | **PASS** |
| `modules/ai-studio.js` | 1,669 | 2,000 | 331 lines | **PASS** |
| `api/terminal.js` | 133 | 2,000 | 1,867 lines | **PASS** |
| `api/compile.js` | 111 | 2,000 | 1,889 lines | **PASS** |
| `modules/calendar-sync.js` | 736 | 2,000 | 1,264 lines | **PASS** |
| `modules/telemetry-theme.js` | 134 | 2,000 | 1,866 lines | **PASS** |

---

## 6. Verification Suite Results

All four automated verification suites were executed in read-only mode:

1. **Syntax Linter (`node tests/lint.cjs`)**:
   - `✓ All 40 JavaScript modules passed syntax validation.`
2. **Recheck All Tasks Audit (`node tests/recheck-all-tasks.cjs`)**:
   - `🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!`
3. **Features Test Suite (`node tests/features.test.cjs`)**:
   - `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===`
   - `🎉 ALL TESTS PASSED WITH ZERO ERRORS!`
4. **Google Chrome CDP Test Suite (`node tests/browser-cdp-test.cjs`)**:
   - `=== BROWSER TEST RESULTS: 122/122 PASSED ===`
   - `🎉 ALL REAL-BROWSER TESTS PASSED IN GOOGLE CHROME!`

---

## Conclusion
Surface 4 (Client Execution Sandboxes, Virtual Filesystem Boundaries, Preview Iframes, and Compiler Bridges) has been fully hardened and verified. No sandbox escape paths or vulnerabilities remain.
