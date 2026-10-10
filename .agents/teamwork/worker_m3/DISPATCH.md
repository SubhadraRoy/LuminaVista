## 2026-10-16T17:51:05Z
You are Worker M3 (Multi-Device Cloud Sync & Non-Destructive Hydration Remediation).
Working directory: c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m3
Original request path: c:\Users\roysu\LuminaVista\.agents\teamwork\ORIGINAL_REQUEST.md
Project plan path: c:\Users\roysu\LuminaVista\.agents\teamwork\PROJECT.md
Survey report: c:\Users\roysu\LuminaVista\.agents\teamwork\explorer_survey_1\handoff.md (OBS-06)

FILE WRITE OWNERSHIP:
You EXCLUSIVELY own:
- `modules/cloud-sync.js`
Do NOT modify any files outside this exclusive list.
NEVER MODIFY OR ALTER `firmware/**`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

TASK OBJECTIVE:
Implement defensive mitigations for Milestone 3:
1. Non-Destructive Additive Cloud Hydration (VULN-SYNC-1):
   - In `modules/cloud-sync.js:221-232`: Calendar events (`state.calendar`) must be merged non-destructively with existing local events. Match by `id`: if an event exists both locally and in cloud, retain the one with newer `updatedAt` / `lastModified` timestamp; preserve local events not present in cloud state and include cloud events not present locally.
   - In `modules/cloud-sync.js:359-382`: Notes (`state.notes`) must be merged non-destructively by `id` / `updatedAt` without dropping local notes.
   - VFS files (`state.vfs`) must be merged non-destructively without blindly clobbering local changes. Sanitize keys to reject prototype pollution keys (`__proto__`, `prototype`, `constructor`).
2. Prevent Tab Hijacking During Background Sync (VULN-SYNC-2):
   - In `modules/cloud-sync.js:453-463` and `543-547`: Decouple `activeTabId` restoration from background polling. Only switch tabs on the very first initial page load (cold boot), NEVER during periodic background sync intervals (e.g. 90-second `pullFromCloud` polling).
3. Invariants & Verification:
   - `modules/cloud-sync.js` must remain strictly under 2,000 lines (currently ~557 lines).
   - All public APIs (`window.LuminaCloudSync`, `pullFromCloud`, `pushToCloud`, etc.) and test contracts must be preserved.
   - Run the full verification suites:
     * `node tests/lint.cjs`
     * `node tests/features.test.cjs`
     * `node tests/recheck-all-tasks.cjs`
     * `node tests/browser-cdp-test.cjs`
   - Write handoff report to `c:\Users\roysu\LuminaVista\.agents\teamwork\worker_m3\handoff.md` and notify parent via `send_message`.
