# Project: Lumina Vista — Round 8 Google Service Account JWT Migration

## Architecture
- **Authentication**: Native RS256 JWT creation via Node.js built-in `crypto` (`crypto.createSign('RSA-SHA256')`). No third-party OAuth/JWT libraries.
- **Serverless Edge/API Routes**: `api/_lib/google-auth.js` provides `getGoogleServiceAccountToken()`, `api/calendar.js` handles CRUD endpoints using the Service Account Bearer token.
- **Target Calendar**: `process.env.GOOGLE_CALENDAR_ID?.trim()`, fallback/warning if not set. Zero hardcoded `'primary'`.
- **Frontend Sync**: `modules/calendar-sync.js` and `modules/calendar.js` decouple from OAuth popups and localStorage tokens, performing auto-sync on mount, window focus, and manual triggers.
- **Security & Environment**: ZERO `.env*` files in repository. Cloud-only runtime secrets (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`). Build-time safety (no errors if keys missing during static builds).
- **Invariants**: Strict <2,000 lines per file, firmware (`firmware/**`) untouched.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Native RS256 JWT Signing | Node `crypto.createSign('RSA-SHA256')` with private key sanitization & base64url encoding | M1 | DISPATCH.md R1 |
| 2 | Service Account Token Exchange | Server-to-server POST assertion to `https://oauth2.googleapis.com/token` with in-memory caching | M1 | DISPATCH.md R1 |
| 3 | Two-Way Calendar CRUD API | `api/calendar.js` handling GET, POST, PATCH/PUT, DELETE to Google Calendar v3 events API | M2 | DISPATCH.md R2 |
| 4 | Legacy OAuth Neutralization | Decommission/neutralize `/api/calendar/callback`, OAuth URL generation, and login popups | M2 & M3 | DISPATCH.md R2, R3 |
| 5 | Cache-Control & Diagnostics | Header `Cache-Control: no-store, no-cache, must-revalidate` + structured diagnostic JSON | M2 | DISPATCH.md R2 |
| 6 | Frontend Auto-Sync & Mutations | Auto-sync on mount/focus/button, immediate two-way mutation calling backend API | M3 | DISPATCH.md R3 |
| 7 | UI Diagnostics & Configuration | Surface clean non-blocking warnings when Service Account credentials or sharing missing | M3 | DISPATCH.md R3 |
| 8 | Zero-.env Policy Enforcement | Ensure 0 `.env*` files across repo, verify clean working tree | M4 | DISPATCH.md R4 |
| 9 | Build-Time Safety & Verification | `npm run build` and tests pass cleanly with zero local env variables, integration test suite | M4 | DISPATCH.md R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Architecture Mapping | Inspect `api/calendar.js`, `modules/calendar-sync.js`, `modules/calendar.js`, and test suites | None | DONE |
| M1 | Native Service Account JWT Engine | Implement `api/_lib/google-auth.js` with RS256 signing, key sanitization, token caching | M0 | IN_PROGRESS |
| M2 | Full Two-Way Google Calendar API Routes | Refactor `api/calendar.js` for CRUD + Service Account auth + remove legacy OAuth | M1 | PLANNED |
| M3 | Frontend Calendar UI & Auto-Sync | Refactor `modules/calendar-sync.js`, `modules/calendar.js`, remove OAuth UI popups | M2 | PLANNED |
| M4 | Zero-Env Verification & Build Gate | Integration test suite, zero-.env audit, regression test suite pass, lint clean | M3 | PLANNED |

## Code Layout
- `api/_lib/google-auth.js` - Service Account JWT creation and token caching
- `api/calendar.js` - Serverless Google Calendar API CRUD controller
- `modules/calendar-sync.js` - Client-side calendar synchronization engine
- `modules/calendar.js` - Client-side calendar UI and view renderer
- `tests/service-account-jwt.test.cjs` - New automated integration and unit test suite
- `tests/` - Existing verification test suites (`features.test.cjs`, `lint.cjs`, `recheck-all-tasks.cjs`, etc.)
- Firmware (`firmware/**`) - Strictly untouched

## Interface Contracts
### `api/_lib/google-auth.js`
- `getGoogleServiceAccountToken()`: Returns `Promise<string | null>` - cached or freshly minted Google OAuth2 access token.
- Returns null or throws descriptive error with diagnostic hints if `GOOGLE_SERVICE_ACCOUNT_EMAIL` or `GOOGLE_PRIVATE_KEY` are unset.
- Safe for build-time: only evaluated when called at runtime, no top-level module throws.

### `api/calendar.js`
- `GET /api/calendar?action=status` -> `{ status: "ok" | "unconfigured", ... diagnostics }`
- `GET /api/calendar?action=events&timeMin=...&timeMax=...` -> `{ success: true, events: [...] }`
- `POST /api/calendar` -> `{ success: true, event: {...} }`
- `PATCH /api/calendar` -> `{ success: true, event: {...} }`
- `DELETE /api/calendar?id=...` -> `{ success: true }`
- All responses include `Cache-Control: no-store, no-cache, must-revalidate`.
