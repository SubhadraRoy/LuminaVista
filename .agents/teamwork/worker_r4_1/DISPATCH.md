## 2026-10-16T22:39:19Z
You are worker_r4_1, a specialized defensive security implementation worker.
Your working directory is: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r4_1

MANDATORY: Read the full user request at:
c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
(Pay particular attention to ## Follow-up — 2026-10-16T22:26:30Z).
Also read c:\Users\roysu\LuminaVista\.agents\teamwork\PROJECT.md (see ## Round 4).

Read the three Explorer handoff reports for exact lines, evidence, and fix recipes:
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r4_1\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r4_2\handoff.md
- c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_r4_3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

YOUR OBJECTIVE:
Implement the targeted defensive security hardening patches identified in the Survey audit across the codebase:
1. `api/_lib/key-pool.js`: In `isBlockedSsrfTarget`, normalize IPv6-mapped IPv4 hostnames (e.g., `::ffff:127.0.0.1`, `::ffff:7f00:1`, `::ffff:a9fe:a9fe`, etc.) before evaluating loopback, private IP, and cloud metadata (169.254.169.254) blocklists so that `http://[::ffff:127.0.0.1]/` and `http://[::ffff:169.254.169.254]/` return `true` (blocked).
2. `api/calendar.js`:
   - CORS origin validation: Narrow `isAllowed` from blindly allowing any `*.github.io` / `*.vercel.app` to explicit whitelist (`https://subhadraroy.github.io`, `https://lumina-vista-sigma.vercel.app`) plus official preview pattern `^https:\/\/lumina-vista-[a-zA-Z0-9_-]+\.vercel\.app$` and localhost.
   - postMessage targetOrigin: In lines 214 and 402, replace `'*'` with `finalOrigin` or the validated client origin from OAuth state so user email is never broadcast to wildcard origins.
   - Rate limiting and payload cap: Add `checkRateLimit(req, storage, 'calendar_sync', 120, 60)` and payload cap to `/api/calendar/sync`.
3. `api/storage.js`, `api/chat.js`, `api/compile.js`, `api/terminal.js`, and `api/worker.js`:
   - On `OPTIONS` preflight, ensure `res._req = req; setSecurityHeaders(res, req);` is called before `return res.status(204).end();` (or `res.status(200).end();`) so CORS headers are emitted.
4. `modules/calendar-sync.js`:
   - In the message listener (`window.addEventListener('message')`), narrow allowed origins from matching any `*.vercel.app` / `*.github.io` to strictly `https://lumina-vista-sigma.vercel.app`, `window.location.origin`, and `https://subhadraroy.github.io`.
5. `modules/projects.js`:
   - Line 59: Wrap `${p.name}` in `escapeHtml(p.name)` in `b.innerHTML`.
   - Line 7: In `resolveProjectUrl(raw)`, add `if (typeof raw !== 'string' || raw.includes('..')) return 'about:blank';` to prevent directory traversal.
6. `modules/codespace.js`:
   - In `runActiveFile`: reject filenames starting with `-` (`activeFile.startsWith('-')`) and invoke interpreters with `--` delimiter (e.g. `python3 -- "${activeFile}"`, `node -- "${activeFile}"`, etc.).
7. `api/_lib/auth-guard.js`:
   - In `sanitizeDeep(data)`: skip reserved keys: `if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;`.
8. `api/sync.js`:
   - In POST handler: add structural type guards before copying fields from `req.body.data` (`calendar`, `notes`, `vfs`, `activeTabId`).
9. `api/worker.js`:
   - Add `checkRateLimit` and `enforcePayloadLimit`.

CONSTRAINTS & INVARIANTS:
- All modified files must strictly contain FEWER than 2,000 lines. Check lines before and after editing.
- DO NOT touch or edit `firmware/**`.
- DO NOT touch or edit `tests/features.test.cjs` (it is frozen at 1,984 lines).
- DO NOT create any exploit scripts or offensive payloads in the repository.
- Verify your changes by running:
  - `node tests/lint.cjs` (40/40 modules must pass)
  - `node tests/recheck-all-tasks.cjs` (42/42 assertions must pass)
  - `node tests/features.test.cjs` (1,102/1,102 assertions must pass)
  - `node tests/challenger-calendar-empirical.cjs` (63/63 assertions must pass)
  - SSRF test command:
    `node -e "const { isBlockedSsrfTarget } = require('./api/_lib/key-pool.js'); console.log('IPv4 loopback:', isBlockedSsrfTarget('http://127.0.0.1/')); console.log('IPv6 loopback:', isBlockedSsrfTarget('http://[::ffff:127.0.0.1]/')); console.log('IPv6 metadata:', isBlockedSsrfTarget('http://[::ffff:169.254.169.254]/'));"`
    (All 3 must return `true`).
- Keep `progress.md` updated with timestamps.
- When done, write `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_r4_1\handoff.md` and call send_message to report completion.
