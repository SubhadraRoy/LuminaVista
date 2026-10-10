## 2026-10-16T18:03:07Z
You are Worker M4 (Client Sandboxes, VFS Boundaries & Compiler Guardrails Remediation).
Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m4
Original request path: c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
Project plan path: c:\Users\roysu\LuminaVista\.agents\teamwork\PROJECT.md
Survey reports:
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_3\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_1\handoff.md

FILE WRITE OWNERSHIP:
You EXCLUSIVELY own:
- `dashboard.html`
- `modules/codespace.js`
- `modules/compiler.js`
- `modules/telemetry-theme.js`
- `modules/ai-studio.js`
- `api/terminal.js`
- `api/compile.js`
- `modules/calendar-sync.js`
Do NOT modify any files outside this exclusive list.
NEVER MODIFY OR ALTER `firmware/**`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVES:
Implement targeted defensive mitigations for Milestone 4:
1. Missing Sandbox on Preview Frame (VULN-SANDBOX-1):
   - In `dashboard.html:731`, add `sandbox="allow-scripts allow-modals allow-forms"` to `<iframe id="sandboxPreviewFrame">`.
2. Dangerous `allow-same-origin` on Sandboxed Frames (VULN-SANDBOX-2):
   - In `dashboard.html:683, 897, 898` and `modules/telemetry-theme.js:99`, remove `allow-same-origin` from sandboxed preview iframes (`#previewIframe`, `#splitLeftFrame`, `#splitRightFrame`). Use `sandbox="allow-scripts allow-modals allow-popups allow-forms"`.
3. Same-Origin Escape via Blob Popouts (VULN-SANDBOX-3):
   - In `modules/codespace.js:440-442` (`openCodespacePopout`), render the window content safely or inside an isolated iframe, preventing same-origin access to top-level `localStorage` and credentials.
4. DOM XSS in Codespace File Tree & Tabs (VULN-SANDBOX-4):
   - In `modules/codespace.js:78, 103, 125, 160`, ensure `escapeHtml()` is applied when interpolating `${key}`, `${folder}`, `${subFile}`, and `${file}` into DOM template strings.
5. Command Injection in `runActiveFile()` (VULN-SANDBOX-5):
   - In `modules/codespace.js:346-350`, validate `window.csActiveFile` against `^[a-zA-Z0-9_\-\./]+$`. Reject quotes, semicolons, backticks, shell metacharacters, or traversal sequences.
6. Prototype Collision DoS in `renderCodespaceFileTree()` (VULN-SANDBOX-6):
   - In `modules/codespace.js:45-55`, initialize `const tree = Object.create(null)` or check `!Object.prototype.hasOwnProperty.call(tree, folder)` to ensure reserved Object methods (`toString`, `valueOf`) do not crash the file tree renderer.
7. Prototype Pollution in VFS Writes (VULN-SANDBOX-7):
   - In `modules/codespace.js`, `modules/ai-studio.js`, enforce VFS key validation rejecting `__proto__`, `prototype`, `constructor`.
8. Path Traversal Defense in `api/terminal.js` (VULN-SANDBOX-8):
   - In `api/terminal.js:83`, replace single-pass regex with robust path normalization that strips both forward slashes and backslashes and prevents directory traversal.
9. Server-Side Jev Guardrails in `api/compile.js` (VULN-SANDBOX-9):
   - In `api/compile.js`, enforce command/code safety inspection (`inspectJevCommandSafety` / `inspectJevGuardrails`) before executing code in the E2B sandbox.
10. Unvalidated postMessage Origin in `modules/calendar-sync.js` (VULN-SANDBOX-10):
   - In `modules/calendar-sync.js:665-671`, validate `e.origin === window.location.origin` before accepting `GCAL_AUTH_SUCCESS`.

BUDGET CONSTRAINTS & INVARIANTS:
- CRITICAL: `dashboard.html` currently has 1,917 lines. It MUST remain strictly under 2,000 lines! Keep edits minimal and concise.
- All modified files must remain strictly under 2,000 lines.
- Run the full verification suites:
  * `node tests/lint.cjs`
  * `node tests/features.test.cjs`
  * `node tests/recheck-all-tasks.cjs`
  * `node tests/browser-cdp-test.cjs`
- Write handoff report to `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m4\handoff.md` and notify parent via `send_message`.
