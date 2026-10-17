# Comprehensive Client Sandbox, DOM Rendering Pipelines & VFS Security Audit
**Auditor**: Explorer 2 (Client Sandbox & DOM Auditor) — Discovery Team (Round 7)  
**Date**: 2026-10-17  
**Scope**: Client execution sandboxes, DOM rendering pipelines, VFS boundaries, Prototype Pollution, postMessage origin validation, and shell command generation across `modules/codespace.js`, `modules/compiler.js`, `modules/ai-studio.js`, `dashboard.html`, `modules/calendar.js`, `modules/calendar-sync.js`, `modules/cloud-sync.js`, `modules/notes.js`, `modules/projects.js`, `modules/terminal.js`, `modules/whiteboard-gallery.js`, `modules/whiteboard.js`, and `api/calendar.js`.

---

## Executive Summary

A comprehensive taint analysis and static code audit was conducted across all client modules, virtual filesystem (VFS) boundaries, and DOM sinks in LuminaVista OS. 

### Key Findings Overview:
| # | Severity | Category | Vulnerability | File & Line | Status |
|---|----------|----------|---------------|-------------|--------|
| 1 | **HIGH** | DOM XSS | Unescaped Event ID and Title Interpolation in Calendar Inline Handlers | `modules/calendar.js:447-448, 696, 710, 867-868` | Confirmed |
| 2 | **HIGH** | DOM XSS | Unescaped Board ID in Whiteboard Gallery Inline Event Handlers | `modules/whiteboard-gallery.js:752-755` | Confirmed |
| 3 | **MEDIUM** | Prototype Pollution | Missing `isValidVfsKey` Validation in MicroVM Workspace File Ingestion | `modules/terminal.js:152-157` | Confirmed |
| 4 | **MEDIUM** | Input Sanitization | Inconsistent `isValidVfsKey` Permitting Traversal/Control Characters in AI Studio | `modules/ai-studio.js:36-44` vs `modules/codespace.js:15-24` | Confirmed |
| 5 | **MEDIUM** | Origin Spoofing | `postMessage` Origin Validation Bypass on Local/Opaque Origins (`"null" === "null"`) | `modules/calendar-sync.js:771-776` | Confirmed |
| 6 | **LOW** | Information Leak | Broad Vercel Subdomain Wildcard in OAuth Callback `clientTargetOrigin` | `api/calendar.js:326, 421` | Confirmed |
| 7 | **LOW** | CLI Parameter Injection | Missing `--` Delimiter and Path Segment Hyphen Check for Java Compilation | `modules/codespace.js:371, 384` | Confirmed |
| 8 | **LOW** | Defense-in-Depth | Incomplete HTML Entity Escaping in Markdown Notes Preview | `modules/notes.js:304-306` | Confirmed |

### Validated Hardened Surfaces (No Regressions):
- **Client Iframe Sandbox Boundaries**: All five iframes in `dashboard.html` (`#csPreviewFrame:614`, `#previewIframe:683`, `#sandboxPreviewFrame:731`, `#splitLeftFrame:897`, `#splitRightFrame:898`) strictly omit `allow-same-origin`. They enforce `sandbox="allow-scripts allow-modals allow-forms"` (and optionally `allow-popups`).
- **Dynamic Execution Engines**: Zero instances of `eval()` or `new Function()` exist across all client scripts.
- **Blob URL Popout Isolation**: `openCodespacePopout()` in `modules/codespace.js:488` isolates preview content inside an inner sandboxed iframe with JSON string encoding (`\u003c`), severing `window.opener = null`.
- **Line Count Invariants**: All client modules and `dashboard.html` (1,780 lines) remain well under the strict 2,000-line budget ceiling.

---

## Detailed Taint Analysis & Vulnerability Findings

### 1. [VULN-R7-CLIENT-01] DOM XSS via Unescaped Event Attributes in `modules/calendar.js`
- **Severity**: HIGH (CVSS 7.4: `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:L/A:N`)
- **Affected File**: `modules/calendar.js`
- **Lines**: 446-451, 696, 710, 866-870
- **Taint Source**:
  1. Untrusted Google Calendar API event data pulled from external Google accounts via `modules/calendar-sync.js:475`.
  2. Autonomous LLM directives `[TOOL:SCHEDULE_EVENT ...]` parsed by `modules/ai-studio.js:969-1020`.
  3. Cloud sync hydration payload (`state.calendar`) from `modules/cloud-sync.js:230-330`.
- **Sensitive Sink**:
  - `container.innerHTML = html` in `modules/calendar.js:464, 537, 661, 724`.
- **Code Evidence**:
  In `modules/calendar.js:446-451`:
  ```javascript
  style="background-color: ${evt.color || '#039be5'}; color: #ffffff;"
  onclick="event.stopPropagation(); LuminaCalendar.openEventModal('${evt.id}')"
  title="${evt.title}${timeStr ? ` (${timeStr})` : ''}">
  ```
  In `modules/calendar.js:695-710`:
  ```javascript
  onclick="LuminaCalendar.openEventModal('${evt.id}')">
  ...
  <button onclick="event.stopPropagation(); LuminaCalendar.deleteEvent('${evt.id}')" ...>
  ```
  In `modules/calendar.js:866-870`:
  ```javascript
  style="top: ${top}px; height: ${Math.max(height, 24)}px; background-color: ${evt.color || '#039be5'}; color: #ffffff;"
  onclick="event.stopPropagation(); LuminaCalendar.openEventModal('${evt.id}')"
  title="${evt.title} (${timeLabel})">
  ```
- **Vulnerability Mechanics**:
  - While `evt.title` is escaped inside `<span>${escapeHtml(evt.title)}</span>`, it is interpolated directly without escaping into `title="${evt.title}..."` (lines 448 and 868). An event title such as `" onmouseover="alert(1)` breaks out of the `title` attribute.
  - Furthermore, `evt.id` is interpolated directly into single-quoted inline event handlers: `onclick="...('${evt.id}')"`. An event ID containing a single quote (e.g., `x');alert(document.domain);//`) escapes the JavaScript string literal and executes arbitrary code in the context of `dashboard.html`.
  - `evt.color` is directly interpolated into `style="background-color: ${evt.color};"` without hex color regex validation, allowing CSS style breakouts or injection.
- **Proposed Remediation**:
  1. Sanitize `evt.id` using alphanumeric regex `String(evt.id || '').replace(/[^a-zA-Z0-9_\-]/g, '')`, or bind event listeners via data attributes (`data-id="${escapeHtml(evt.id)}" onclick="event.stopPropagation(); LuminaCalendar.openEventModal(this.getAttribute('data-id'))"`), matching the pattern in `modules/whiteboard.js:691`.
  2. Apply `escapeHtml(evt.title)` inside all `title="..."` attributes.
  3. Validate `evt.color` with `/^#[0-9A-Fa-f]{6}$/.test(evt.color) ? evt.color : '#039be5'` (identical to `modules/smart-lock.js:785`).

---

### 2. [VULN-R7-CLIENT-02] DOM XSS in `modules/whiteboard-gallery.js` Saved Board Management
- **Severity**: HIGH (CVSS 7.1: `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`)
- **Affected File**: `modules/whiteboard-gallery.js`
- **Lines**: 752, 753, 755
- **Taint Source**:
  - Cloud sync hydration payload `state.whiteboardBoards` in `modules/cloud-sync.js:424-430`, stored in `lumina_wb_boards`.
- **Sensitive Sink**:
  - `container.innerHTML = boards.map(...).join('')` in `modules/whiteboard-gallery.js:737`.
- **Code Evidence**:
  In `modules/whiteboard-gallery.js:751-756`:
  ```javascript
  <div class="flex items-center gap-1">
    <button onclick="LuminaWhiteboardGallery.promptRenameBoard('${b.id}')" class="p-1.5 rounded bg-surface-900 hover:bg-surface-850 text-zinc-400 hover:text-white cursor-pointer" title="Rename"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></button>
    ${boards.length > 1 ? `<button onclick="LuminaWhiteboardGallery.deleteBoard('${b.id}')" class="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
  </div>
  ${isActive ? `<span class="text-xs font-mono text-cyan-400 font-semibold">Loaded</span>` : `<button onclick="LuminaWhiteboardGallery.switchBoard('${b.id}'); LuminaWhiteboardGallery.closeGalleryModal();" class="px-3 py-1.5 rounded-lg bg-cyan-500 text-black font-bold text-xs cursor-pointer shadow-md">Open Board</button>`}
  ```
- **Vulnerability Mechanics**:
  - `b.id` is interpolated directly into `onclick="...('${b.id}')"` without sanitization or escaping.
  - If a synced whiteboard board contains `b.id = "board_1');alert(1);//"`, opening the Whiteboard Gallery and clicking "Rename", "Delete", or "Open Board" triggers immediate JavaScript execution.
- **Proposed Remediation**:
  - Sanitize `b.id` before string interpolation using `const safeId = String(b.id || '').replace(/[^a-zA-Z0-9_\-]/g, '')`, or use `data-id="${safeId}"` and retrieve it via `this.getAttribute('data-id')`.

---

### 3. [VULN-R7-CLIENT-03] Prototype Pollution & DoS in `modules/terminal.js` VFS Synchronization
- **Severity**: MEDIUM (CVSS 6.5: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`)
- **Affected File**: `modules/terminal.js`
- **Lines**: 152-157
- **Taint Source**:
  - Response object `d.workspaceFiles` returned by `/api/terminal` when executing commands in the microVM.
- **Sensitive Sink**:
  - Direct object mutation `vfs[f.name] = f.content;` (line 153).
- **Code Evidence**:
  In `modules/terminal.js:152-157`:
  ```javascript
  if (Array.isArray(d.workspaceFiles)) {
    d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
    localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
    if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
    if (window.renderCodespaceFileTabs) window.renderCodespaceFileTabs();
  }
  ```
- **Contrast With Peer Implementations**:
  - In `modules/codespace.js:534-536`:
    ```javascript
    d.workspaceFiles.forEach(f => {
      if (f && f.name && isValidVfsKey(f.name)) {
        vfs[f.name] = f.content;
      }
    });
    ```
  - In `modules/ai-studio.js:868-872`:
    ```javascript
    d.workspaceFiles.forEach(f => {
      if (f && f.name && isValidVfsKey(f.name)) {
        vfs[f.name] = f.content;
      }
    });
    ```
- **Vulnerability Mechanics**:
  - `modules/terminal.js` omitted the `isValidVfsKey` guard present in both `codespace.js` and `ai-studio.js`.
  - If a command outputs a workspace file named `'__proto__'`, `'constructor'`, or `'prototype'`, `vfs[f.name] = f.content` mutates `vfs.__proto__` or `Object.prototype`, polluting prototypes across the client session or breaking built-in methods (`toString`, `valueOf`).
- **Proposed Remediation**:
  - Insert validation check in `modules/terminal.js:153`:
    ```javascript
    d.workspaceFiles.forEach(f => {
      if (f && f.name && (window.isValidVfsKey ? window.isValidVfsKey(f.name) : !['__proto__', 'constructor', 'prototype'].includes(f.name))) {
        vfs[f.name] = f.content;
      }
    });
    ```

---

### 4. [VULN-R7-CLIENT-04] Inconsistent `isValidVfsKey` Validation in `modules/ai-studio.js`
- **Severity**: MEDIUM (CVSS 5.3: `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L`)
- **Affected File**: `modules/ai-studio.js`
- **Lines**: 36-44
- **Code Comparison**:
  In `modules/codespace.js:15-24`:
  ```javascript
  function isValidVfsKey(key) {
    if (typeof key !== 'string') return false;
    const k = key.trim();
    if (!k) return false;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
    if (k.includes('__proto__') || k.includes('constructor') || k.includes('prototype')) return false;
    if (k.includes('..') || k.includes('\\') || k.startsWith('/') || k.includes('?') || k.includes('#')) return false;
    if (/[\x00-\x1f\x7f]/.test(k)) return false;
    return true;
  }
  ```
  In `modules/ai-studio.js:36-44`:
  ```javascript
  function isValidVfsKey(key) {
    if (typeof key !== 'string') return false;
    const k = key.trim();
    if (!k) return false;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
    if (k.includes('__proto__') || k.includes('constructor') || k.includes('prototype')) return false;
    if (k.includes('..')) return false;
    return true;
  }
  ```
- **Vulnerability Mechanics**:
  - The `isValidVfsKey` implementation in `ai-studio.js` lacks checks for:
    1. Backslashes (`\\`)
    2. Leading slashes (`/foo.js`)
    3. URI query/hash delimiters (`?`, `#`)
    4. Control characters (`[\x00-\x1f\x7f]`)
  - When an autonomous AI agent produces `[TOOL:WRITE_FILE filename="/app.js"]`, the file is created with a leading slash. In `modules/codespace.js:63-72`, `parts[0]` evaluates to `""`, causing the file tree renderer to create an empty folder header (`//`), degrading the IDE UI.
- **Proposed Remediation**:
  - Synchronize `modules/ai-studio.js:36-44` to match `modules/codespace.js:15-24`.

---

### 5. [VULN-R7-CLIENT-05] `postMessage` Origin Validation Flaw on Local `file://` / Opaque Origins
- **Severity**: MEDIUM (CVSS 5.0: `CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:C/C:N/I:L/A:N`)
- **Affected File**: `modules/calendar-sync.js`
- **Lines**: 771-776
- **Code Evidence**:
  In `modules/calendar-sync.js:770-776`:
  ```javascript
  window.addEventListener('message', async (e) => {
    const isAllowedOrigin = (
      (window.location && e.origin === window.location.origin) ||
      e.origin === 'https://lumina-vista-sigma.vercel.app' ||
      e.origin === 'https://subhadraroy.github.io'
    );
    if (!isAllowedOrigin) return;
  ```
- **Vulnerability Mechanics**:
  - If the application is opened locally (`file://`) or within an environment where `window.location.origin` evaluates to `"null"`, `e.origin === window.location.origin` evaluates to `true` for any untrusted sandboxed iframe (which also has opaque origin `e.origin === "null"`).
  - An untrusted script running inside a sandboxed preview frame could post `{ type: 'GCAL_AUTH_SUCCESS', email: 'attacker@evil.com' }` to the parent window, causing the client to enter a connected calendar state and initiate unintended sync operations.
  - Notice `modules/projects.js:24` already guards against `"null"`:
    `const origin = (window.location.origin && window.location.origin !== "null") ? window.location.origin : "";`
- **Proposed Remediation**:
  - Update `calendar-sync.js:772` to:
    ```javascript
    (window.location && window.location.origin && window.location.origin !== 'null' && e.origin === window.location.origin)
    ```

---

### 6. [VULN-R7-CLIENT-06] Broad Vercel Subdomain Whitelist in `api/calendar.js` postMessage
- **Severity**: LOW (CVSS 4.3: `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:N/A:N`)
- **Affected File**: `api/calendar.js`
- **Lines**: 326, 421
- **Code Evidence**:
  ```javascript
  /^https:\/\/lumina-vista-[a-zA-Z0-9_-]+\.vercel\.app$/.test(u.origin)
  ```
- **Vulnerability Mechanics**:
  - The regex permits any arbitrary Vercel domain prefixed with `lumina-vista-` (e.g., `https://lumina-vista-attacker.vercel.app`).
  - If an attacker creates an external project on Vercel with that prefix and sets it as the OAuth redirect/state, `clientTargetOrigin` will target the attacker's site, and line 548 will dispatch `window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', email: userEmail }, clientTargetOrigin)` to the attacker.
- **Proposed Remediation**:
  - Constrain allowed origins strictly to production domains (`https://lumina-vista-sigma.vercel.app`, `https://subhadraroy.github.io`, `localhost`).

---

### 7. [VULN-R7-CLIENT-07] Defense-in-Depth CLI Parameter Injection in `modules/codespace.js`
- **Severity**: LOW (CVSS 3.8: `CVSS:3.1/AV:L/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N`)
- **Affected File**: `modules/codespace.js`
- **Lines**: 371, 384
- **Code Evidence**:
  ```javascript
  let cmd = `python3 -- "${activeFile}"`;
  if (activeFile.endsWith('.js')) cmd = `node -- "${activeFile}"`;
  if (activeFile.endsWith('.sh')) cmd = `bash -- "${activeFile}"`;
  if (activeFile.endsWith('.cpp')) cmd = `g++ -O2 -- "${activeFile}" -o out && ./out`;
  if (activeFile.endsWith('.java')) cmd = `javac "${activeFile}" && java Main`;
  ```
- **Vulnerability Mechanics**:
  - `javac "${activeFile}"` lacks `--`.
  - While line 371 checks `activeFile.startsWith('-')`, if a file is nested inside a subfolder (e.g., `dir/-flag.java`), `startsWith('-')` is false.
- **Proposed Remediation**:
  - Add segment checking: `if (activeFile.split('/').some(part => part.startsWith('-'))) return;`.

---

### 8. [VULN-R7-CLIENT-08] Incomplete HTML Entity Escaping in `modules/notes.js`
- **Severity**: LOW (CVSS 3.1: `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:L/A:N`)
- **Affected File**: `modules/notes.js`
- **Lines**: 304-306
- **Code Evidence**:
  ```javascript
  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  ```
- **Vulnerability Mechanics**:
  - `notes.js` omits quote escaping (`"` and `'`). While markdown prose is escaped prior to HTML rendering, quotes are not encoded as `&quot;` and `&#039;`.
- **Proposed Remediation**:
  - Align `escapeHtml` with `codespace.js` and `calendar.js` by escaping `"` and `'`.

---

## Client Sandbox & DOM Verification Matrix

| Sandbox Surface | Element / Path | Configured Attributes | `allow-same-origin`? | Verdict |
|-----------------|----------------|----------------------|----------------------|---------|
| Codespace Live Preview | `dashboard.html:614` (`#csPreviewFrame`) | `allow-scripts allow-modals allow-forms` | ❌ NO | SECURE (Opaque Origin) |
| GitHub Workspace Preview | `dashboard.html:683` (`#previewIframe`) | `allow-scripts allow-modals allow-popups allow-forms` | ❌ NO | SECURE (Opaque Origin) |
| Cloud Compiler HTML Sandbox | `dashboard.html:731` (`#sandboxPreviewFrame`) | `allow-scripts allow-modals allow-forms` | ❌ NO | SECURE (Opaque Origin) |
| Dual Split Left Frame | `dashboard.html:897` (`#splitLeftFrame`) | `allow-scripts allow-modals allow-popups allow-forms` | ❌ NO | SECURE (Opaque Origin) |
| Dual Split Right Frame | `dashboard.html:898` (`#splitRightFrame`) | `allow-scripts allow-modals allow-popups allow-forms` | ❌ NO | SECURE (Opaque Origin) |
| Popout Preview Tab | `modules/codespace.js:488` (`#popoutFrame`) | `allow-scripts allow-modals allow-popups allow-forms` | ❌ NO | SECURE (Opaque Origin) |
| Telemetry Sandbox Policy | `modules/telemetry-theme.js:99` | Dynamic toggle: `allow-scripts allow-modals allow-popups allow-forms` or `""` | ❌ NO | SECURE |

---

## Action Plan for Remediation Team

1. **`modules/calendar.js`**:
   - In `renderMonthView` (line 446-451), `renderScheduleView` (lines 696, 710), and `renderTimeGridEvent` (lines 866-870):
     - Replace inline string interpolation `'${evt.id}'` with `data-id="${escapeHtml(evt.id)}"` and handle via `this.getAttribute('data-id')` or sanitize `evt.id` via alphanumeric regex.
     - Escape `evt.title` inside `title="${escapeHtml(evt.title)}..."`.
     - Validate `evt.color` against `^#[0-9A-Fa-f]{6}$`.
2. **`modules/whiteboard-gallery.js`**:
   - In `renderBoardsGalleryList` (lines 752-755), sanitize `b.id` via `String(b.id || '').replace(/[^a-zA-Z0-9_\-]/g, '')` before interpolating into `onclick` handlers.
3. **`modules/terminal.js`**:
   - In `handleTerminalCommand` (line 153), wrap `d.workspaceFiles` assignment in `if (f && f.name && (window.isValidVfsKey ? window.isValidVfsKey(f.name) : !['__proto__', 'constructor', 'prototype'].includes(f.name)))`.
4. **`modules/ai-studio.js`**:
   - Synchronize `isValidVfsKey` (lines 36-44) with `modules/codespace.js` to block `\\`, `startsWith('/')`, `?`, `#`, and control characters.
5. **`modules/calendar-sync.js`**:
   - In `message` event listener (line 772), require `window.location.origin !== 'null'`.
6. **`modules/notes.js`**:
   - Upgrade `escapeHtml` (lines 304-306) to escape `"` and `'`.
7. **`modules/codespace.js`**:
   - In `runActiveFile` (line 371), check that no segment of `activeFile.split('/')` starts with `-`.
