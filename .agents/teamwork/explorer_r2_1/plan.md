# Investigation Plan: Explorer R2-1 (Edge APIs & Zero-Trust Sessions)

## Scope
- Surface 1: Serverless Edge APIs (`api/*.js`, `api/_lib/*.js`, including `calendar.js`, `chat.js`, `storage.js`, `sync.js`, `terminal.js`, `compile.js`, `worker.js`)
- Surface 2: Zero-Trust Authentication & Session Validation (`api/admin.js`, `api/auth.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js`)
- Integrity & Constraints: Line counts (< 2000 lines), tests/** and firmware/** untampered

## Phase 1: Context & Baseline Review
- Read `ORIGINAL_REQUEST.md` and `PROJECT.md` to understand context, threats, and past fixes.
- List all files in scope under `api/`, `api/_lib/`, `modules/admin-access.js`, and check line counts.

## Phase 2: Surface 2 Deep Dive (Zero-Trust Auth & Sessions)
- Audit `api/auth.js`, `api/admin.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js`.
- Hardcoded secrets and fallback keys check.
- Constant-time comparison implementation (`crypto.timingSafeEqual`) on password hashes, session keys, HMACs (verify length mismatch handling does not throw or leak timing).
- Sovereign session key (`lv_...`) format, HMAC/cryptographic signatures, and Redis revocation checks (fail-closed semantics).
- Minimum-1 active access key invariant in `api/admin.js` (deletion/revocation conditions, atomic operations, race conditions).
- CORS origin validation and reflection in `auth-guard.js` (untrusted origin reflection when credentials=true).

## Phase 3: Surface 1 Deep Dive (Serverless Edge APIs)
- Audit `api/calendar.js`, `api/chat.js`, `api/storage.js`, `api/sync.js`, `api/terminal.js`, `api/compile.js`, `api/worker.js`, and any helper modules in `api/_lib/`.
- Prototype pollution (`__proto__`, `constructor`, `prototype`).
- Path traversal (file operations, storage keys, path sanitization).
- Command injection / code execution (terminal execution, compile jobs, worker tasks).
- SSRF (chat API, sync endpoints, external fetch calls).
- Rate limiting and input validation defenses.

## Phase 4: Integrity & Non-Tampering Verification
- Check line count compliance across all audited files (< 2,000 lines).
- Verify git status / check whether `tests/**` or `firmware/**` were tampered with.

## Phase 5: Synthesis & Reporting
- Compile technical analysis into `analysis.md`.
- Formulate 5-component `handoff.md` (Observation, Logic Chain, Caveats, Conclusion, Verification Method).
- Send completion message to orchestrator via `send_message`.
