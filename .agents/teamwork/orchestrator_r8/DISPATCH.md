# Orchestrator R8 Dispatch Specification

## Objective
Execute a complete, end-to-end migration of the "Lumina Vista" Google Calendar integration to a permanent, zero-login Google Service Account (Server-to-Server RS256 JWT) architecture across 4 phases with full verification.

## Working Directory
`c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8`

## Strict Operating Rules
1. ZERO `.env` FILES POLICY: Do NOT create, read, require, or leave any `.env`, `.env.local`, `.env.production`, or `.env.example` files anywhere in the project. Delete any existing `.env*` files if found.
2. CLOUD-ONLY RUNTIME SECRETS: All credentials (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`) are injected exclusively at runtime by Vercel's Cloud Backend via `process.env`.
3. BUILD-TIME SAFETY: Never throw top-level errors during `npm run build` / static page generation if `process.env.GOOGLE_PRIVATE_KEY` is undefined in the local build environment. Only evaluate `process.env` lazily inside runtime API request handlers.
4. LINE CEILING: All modified repository files must strictly remain under 2,000 lines.
5. FIRMWARE INTEGRITY: Never modify or alter the ESP32 physical firmware files (`firmware/**`).

## Requirements
### R1. Phase 1: Native Zero-Dependency Service Account JWT Auth Engine
- Implement native RS256 JWT signing using Node's built-in `crypto` module (`crypto.createSign('RSA-SHA256')`).
- Sanitize private key: `rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')`.
- Construct JWT Header (`{"alg":"RS256","typ":"JWT"}`) and Claim Set (`iss`, `scope`, `aud`, `iat`, `exp`).
- Sign with `privateKey` using base64url encoding and exchange assertion via `POST https://oauth2.googleapis.com/token`.
- Cache short-lived access token in memory until 5 minutes before expiration to ensure instant consecutive requests.

### R2. Phase 2: Full Two-Way Google Calendar API Routes (`api/calendar.js`)
- Refactor all calendar API endpoints to use the Service Account token generator.
- Neutralize legacy OAuth redirect routes (`/api/calendar/callback`, OAuth URL generation) so no OAuth popups or callbacks remain.
- Target Calendar ID: `process.env.GOOGLE_CALENDAR_ID?.trim()` (never hardcode `'primary'`).
- Implement full CRUD against `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` (GET, POST, PATCH/PUT, DELETE).
- Enforce `Cache-Control: no-store, no-cache, must-revalidate` on all API responses.
- Surface structured diagnostic JSON if credentials or calendar sharing are missing.

### R3. Phase 3: Frontend Calendar UI & Auto-Sync Integration
- Remove all legacy "Connect Google Calendar" / "Sign in with Google" OAuth popup triggers and `localStorage` token dependencies.
- Auto-sync on mount, window focus, and manual "Sync / Refresh" button clicks.
- Immediate two-way mutation: creating, editing, or deleting an event calls the backend API and updates local state.
- Surface clear configuration warnings in the UI if `GOOGLE_CALENDAR_ID` or Service Account sharing is unconfigured.

### R4. Phase 4: Zero-Env Verification & Adversarial Build Gate
- Verify zero `.env*` files exist in git status or the file tree.
- Validate build-time safety: `npm run build` and test suites pass cleanly with no local `.env` files present.
- Create automated integration test verifying RS256 JWT creation, mock Google Calendar token exchange, CRUD dispatch, and error handling.
- Verify all existing verification suites pass with 0 regressions.

## Acceptance Criteria
- [ ] Native RS256 Service Account JWT engine implemented using Node `crypto` without third-party SDK dependencies.
- [ ] Zero `.env*` files present across the repository.
- [ ] `/api/calendar` supports full CRUD (GET, POST, PATCH, DELETE) targeting `GOOGLE_CALENDAR_ID`.
- [ ] Legacy OAuth redirect flows neutralized; UI auto-syncs with zero login popups.
- [ ] All automated test suites and linters pass cleanly with zero local environment variables.


## 2026-10-17T11:06:33Z

You are the Project Orchestrator for Round 8 of Lumina Vista. Your working directory is c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8. Read your dispatch specification in c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/DISPATCH.md and the authoritative requirements in c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md. Decompose and orchestrate the full migration of the Google Calendar integration to a permanent zero-login Google Service Account (Server-to-Server RS256 JWT) architecture across Phases 1-4 with specialist subagents, rigorous review, and regression verification. Adhere strictly to the ZERO .env files policy, cloud-only runtime secrets, build-time safety, < 2,000 line limit, and untouched firmware. Maintain plan.md and progress.md in your working directory. Report back when all phases are complete and verified.
