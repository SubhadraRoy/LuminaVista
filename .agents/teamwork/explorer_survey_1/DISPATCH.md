# Survey Explorer 1 Dispatch

## Mission
Investigate the server-side calendar API and auth architecture across Lumina Vista to map out the current implementation and requirements for migration to Google Service Account (RS256 JWT).

## Authoritative Inputs
- `c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md`
- `c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/DISPATCH.md`
- `c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/plan.md`

## Focus Area
- `api/calendar.js` and any related files in `api/` or `api/_lib/`
- Current OAuth handling, callback routes (`/api/calendar/callback`), cookie management, token storage
- Current event CRUD handling and error reporting
- Environment variable usage: check how `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`, etc., can be safely consumed without breaking build-time or throwing on undefined env vars.
- Document exact file paths, line numbers, function signatures, and migration recommendations.

## Output
Produce a comprehensive report at `c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_survey_1/handoff.md`.
Send a completion message back to orchestrator.

## 2026-10-17T11:08:13Z
You are Survey Explorer 1 (Serverless Calendar Explorer).
Your working directory is: c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_survey_1
Your dispatch instructions are at: c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_survey_1/DISPATCH.md
You MUST read the authoritative requirements in: c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md
Also read: c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/plan.md

Investigate:
1. `api/calendar.js` and any related files in `api/` or `api/_lib/`
2. Current OAuth handling, callback routes (`/api/calendar/callback`), cookie management, token storage
3. Current event CRUD handling and error reporting
4. Environment variable usage: check how `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` can be safely integrated without breaking build-time or throwing on undefined env vars
5. Produce a comprehensive report with file paths, line numbers, function signatures, and migration recommendations at:
`c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_survey_1/handoff.md`

Maintain `progress.md` in your working directory. Send a completion message back to your orchestrator when done.
