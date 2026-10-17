## 2026-10-17T08:31:47Z
You are Worker 2 (Client Sandbox & DOM Hardening Engineer) of the Remediation Team for Round 7 of the LuminaVista security review.
Your working directory is: c:/Users/roysu/LuminaVista/.agents/teamwork/worker_r7_client
Parent orchestrator conversation ID: 847b0db7-3b35-4e6b-8b9d-7ed3e8274c3a

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEPS:
1. Read the authoritative user request at: c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md (specifically ## Follow-up — 2026-10-17T08:13:40Z).
2. Read dispatch instructions at: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7/DISPATCH.md.
3. Read the taint analysis ledger at: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r7/TAINT_ANALYSIS.md.

YOUR EXCLUSIVE WRITE OWNERSHIP:
You own and may ONLY edit these files:
1. `modules/calendar.js`
2. `modules/whiteboard-gallery.js`
3. `modules/terminal.js`
4. `modules/ai-studio.js`
5. `modules/calendar-sync.js`
DO NOT edit any other files. DO NOT touch firmware/**.

TASKS TO IMPLEMENT:
1. In `modules/calendar.js`:
   - Fix DOM XSS sinks: In event rendering (lines ~447, 696, 710, 867), sanitize `evt.id` when interpolating into inline `onclick` handlers:
     `const safeEvtId = String(evt.id || '').replace(/[^a-zA-Z0-9_\-]/g, '');`
     Use `safeEvtId` in `LuminaCalendar.openEventModal('${safeEvtId}')` and `deleteEvent('${safeEvtId}')`.
   - In lines 448 and 868, escape `evt.title` inside `title="..."` tooltip attributes:
     `title="${escapeHtml(evt.title)}${timeStr ? ` (${timeStr})` : ''}"` and `title="${escapeHtml(evt.title)} (${timeLabel})"`.
2. In `modules/whiteboard-gallery.js`:
   - In lines ~752, 753, 755: Sanitize `b.id` using:
     `const safeBoardId = String(b.id || '').replace(/[^a-zA-Z0-9_\-]/g, '');`
     Use `${safeBoardId}` in `onclick="LuminaWhiteboardGallery.promptRenameBoard('${safeBoardId}')"`, `deleteBoard`, and `switchBoard`.
3. In `modules/terminal.js`:
   - In lines ~152-157, protect against prototype pollution when assigning `workspaceFiles` into VFS:
     Define and apply `isValidVfsKey(f.name)`:
     ```javascript
     function isValidVfsKey(k) {
       if (typeof k !== 'string') return false;
       const s = k.trim();
       if (!s || s === '__proto__' || s === 'constructor' || s === 'prototype') return false;
       if (s.includes('__proto__') || s.includes('constructor') || s.includes('prototype')) return false;
       if (s.includes('..') || s.includes('\\') || s.startsWith('/') || s.includes('?') || s.includes('#')) return false;
       if (/[\x00-\x1f\x7f]/.test(s)) return false;
       return true;
     }
     ```
     Only set `if (f && isValidVfsKey(f.name)) { vfs[f.name] = f.content; }`.
4. In `modules/ai-studio.js`:
   - In lines ~36-44, update `isValidVfsKey` to also reject backslashes, leading slashes, query/hash delimiters, and control characters:
     `if (k.includes('..') || k.includes('\\') || k.startsWith('/') || k.includes('?') || k.includes('#')) return false;`
     `if (/[\x00-\x1f\x7f]/.test(k)) return false;`
5. In `modules/calendar-sync.js`:
   - In line ~772, update the message origin check:
     `const isAllowedOrigin = (window.location && window.location.origin && window.location.origin !== 'null' && e.origin === window.location.origin) || e.origin === 'https://lumina-vista-sigma.vercel.app' || e.origin === 'https://subhadraroy.github.io';`
6. VERIFICATION:
   - Run `node tests/lint.cjs` and verify all 40 modules pass.
   - Verify all modified files remain strictly < 2,000 lines.
7. REPORTING:
   - Write `changes.md` and `handoff.md` in `c:/Users/roysu/LuminaVista/.agents/teamwork/worker_r7_client/`.
   - Notify parent orchestrator via `send_message` (Recipient="847b0db7-3b35-4e6b-8b9d-7ed3e8274c3a") when done.
