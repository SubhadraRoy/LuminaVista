## 2026-10-16T17:42:07Z
You are Worker M2 (Iteration 2) for Milestone 2 remediation.
Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m2_it2
Original request path: c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
Project plan path: c:\Users\roysu\LuminaVista\.agents\teamwork\PROJECT.md
Challenger M2_2 defect report: c:\Users\roysu\LuminaVista\.agents\teamwork\challenger_m2_2\handoff.md

FILE WRITE OWNERSHIP:
You EXCLUSIVELY own:
- `api/calendar.js`
Do NOT modify any files outside this exclusive list.
NEVER MODIFY OR ALTER `firmware/**`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVE:
Fix the OAuth2 state validation fail-open vulnerability in `api/calendar.js` identified by Challenger M2_2:
1. In `api/calendar.js:123-153` (`handleCallback`):
   - When `state` is received, parse and validate that:
     * `state` is a valid base64-encoded JSON object containing `redirect_uri`, `nonce`, `ts`, and `sig`.
     * `age = Date.now() - parsed.ts` is between 0 and 15 * 60 * 1000 (15 minutes maximum TTL).
     * `parsed.sig` matches HMAC-SHA256(`nonce:redirect_uri:ts`, secret) using `crypto.timingSafeEqual` on equal-length buffers.
   - If `state` is missing, malformed, expired, carries an invalid signature, or is unsigned:
     **Immediately reject the request** with HTTP 400 (`return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');` or sendSecureJson) BEFORE calling `fetch('https://oauth2.googleapis.com/token')`.
   - Remove the lines 140-143 fallback that accepted unsigned states.
2. Ensure OPTIONS `/api/calendar/sync` CORS handling in `setCorsHeaders` continues to pass `tests/features.test.cjs` line 1153.
3. Invariants & Verification:
   - `api/calendar.js` must remain strictly under 2,000 lines (currently ~822 lines).
   - NEVER modify `firmware/**`.
   - Run the full verification suites:
     * `node tests/lint.cjs`
     * `node tests/features.test.cjs`
     * `node tests/recheck-all-tasks.cjs`
     * `node tests/browser-cdp-test.cjs`
   - Test Challenger M2_2's repro script (tampered state must now return HTTP 400).
   - Write handoff report to `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m2_it2\handoff.md` and notify parent via `send_message`.
