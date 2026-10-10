# Surface 4 Security Audit Plan: Client Sandboxes & VFS Boundaries

## Objective
Execute a rigorous read-only security and adversarial investigation across Surface 4 (Client Execution Sandboxes, Virtual Filesystem, Preview Iframes, and Compiler Bridges).

## Target Scope
1. `dashboard.html` — `#sandboxPreviewFrame`, `#previewIframe`, `#splitLeftFrame`, `#splitRightFrame` sandbox attributes
2. `modules/codespace.js` — Blob URL popout handling, window.open security, DOM XSS sinks (file tree, tab labels, modals, status line), command execution (`runActiveFile`, terminal, compiler), VFS prototype pollution and prototype collisions
3. `modules/compiler.js` — Client-side compilation engine, script sandboxing, worker isolation, line budget
4. `modules/ai-studio.js` — VFS mutations, prompt injections resulting in prototype pollution, iframe rendering
5. `api/terminal.js` & `api/compile.js` — Path traversal defenses, argument injection, server-side Jev command safety screening
6. `modules/calendar-sync.js` — `window.postMessage` origin validation (rejecting wildcard `*` origins and validating sender)
7. Repository Line Count Verification — Ensure `dashboard.html`, `modules/codespace.js`, `modules/compiler.js` strictly < 2,000 lines

## Methodology
- **Phase 1: Iframe Sandbox Integrity (dashboard.html)**
  - Search all `<iframe>` definitions in `dashboard.html`.
  - Check presence of `sandbox` attributes.
  - Verify that `allow-scripts` and `allow-same-origin` are NEVER combined on untrusted user code execution frames.
- **Phase 2: Codespace & VFS Security (modules/codespace.js & modules/ai-studio.js)**
  - Inspect window.open and Blob URL generation for popouts.
  - Audit all innerHTML / string interpolation sinks against DOM XSS.
  - Verify VFS path handling, key setter logic, recursive object merges for prototype pollution (`__proto__`, `constructor`, `prototype`).
  - Verify Object prototype method collision defenses (e.g., `hasOwnProperty`, `toString`, `valueOf`).
  - Audit command execution string generation (`runActiveFile`).
- **Phase 3: Serverless Terminal & Compile Bridges (api/terminal.js & api/compile.js)**
  - Audit path traversal normalization (e.g. backslash vs slash, multi-pass regex, traversal sequences `..`).
  - Inspect command invocation / child process spawning or simulated execution.
- **Phase 4: PostMessage Boundary Audit (modules/calendar-sync.js)**
  - Audit `window.addEventListener('message')` handlers.
  - Check origin verification logic (`event.origin`).
- **Phase 5: Line Count Audits & Synthesis**
  - Verify exact line count of all modified/relevant files.
  - Produce comprehensive `analysis.md` and `handoff.md`.
