# Project: LuminaVista OS — Google Calendar Two-Way Sync & Month View UI Perfection

## Architecture
- **Backend Edge Controller (`api/calendar.js`)**: Serverless function providing Google OAuth2 flow, token refresh, Redis persistence (`gcal:master_tokens`), CORS preflight, and two-way event synchronization endpoints (`/api/calendar/auth`, `/api/calendar/callback`, `/api/calendar/status`, `/api/calendar/sync`, `/api/calendar/disconnect`).
- **Frontend Sync Engine (`modules/calendar-sync.js`)**: Dynamic API origin resolution (`getApiOrigin`), resilient popup + navigation OAuth flow, cross-origin communication, auto-sync triggers (`visibilitychange`, `focus`, 5-min timer), all-day date calculations (`end.date = start.date + 1 day`), and push syncing.
- **Frontend Core Calendar (`modules/calendar.js`)**: Event management, `aiAutoPlanDay()` routine synthesis, `getEventLocalDateKey` raw date key preservation, month view rendering (decoupled Day 1 month abbreviation, standardized `min-h-[90px]` Today cell with `ring-inset`), and dynamic sync badge (`#calSyncStatusBadge`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Production OAuth Redirect URI Prioritization | Resolve redirect URI prioritizing `https://lumina-vista-sigma.vercel.app/api/calendar/callback` on GitHub Pages & preview deployments | M1 | Survey |
| 2 | Decouple Calendar Auth from Master Password | Make `/api/calendar/status` and `/api/calendar/auth` public; authenticate `/api/calendar/sync` via Google OAuth credentials | M1 | Survey |
| 3 | Comprehensive CORS Preflight (OPTIONS 204) | Handle OPTIONS returning HTTP 204 with allow-credentials, allow-origin (supporting *.github.io and *.vercel.app) | M1 | Survey |
| 4 | Token Persistence & Partitioned Cookies (CHIPS) | Preserve refresh_token across re-authorizations, set `partitioned` attribute on HTTPS cookies, persist to Redis | M1 | Survey |
| 5 | Expanded Static Host Origin Resolution | `getApiOrigin()` routing `/api/calendar/*` to Vercel on GitHub Pages and static hosts while keeping localhost local | M2 | Survey |
| 6 | Resilient OAuth Popup & Cross-Domain PostMessage | Window navigation fallback and cross-origin postMessage allowance for `lumina-vista-sigma.vercel.app` on `github.io` | M2 | Survey |
| 7 | Multi-Trigger Auto-Sync & Visibility Listener | Add `visibilitychange` listener alongside `focus` and periodic timer with concurrency guard | M2 | Survey |
| 8 | Google Calendar API v3 All-Day Event Calculation | Enforce `end.date = start.date + 1 day` for single-day all-day events | M2 | Survey |
| 9 | Raw YYYY-MM-DD Timezone Key Preservation | Intercept `YYYY-MM-DD` without UTC `new Date()` conversion to prevent timezone date shifts | M2 | Survey |
| 10 | AI Plan Day & Event Edit Push Triggers | Call `pushEventToGoogle` in `aiAutoPlanDay()` and remove unlinked event filter in `handleAgentDirective` | M2 | Survey |
| 11 | Month View Day 1 Text Wrap & Badge Integrity | Decouple month abbreviation outside the 24px circular badge | M3 | Survey |
| 12 | Month View Today Cell Height & Inset Borders | Standardize `min-h-[90px]` and `ring-inset` styling to prevent row blowout and cell overlap | M3 | Survey |
| 13 | Dynamic Sync Status Badge | Real-time transitions: Syncing (cyan ping), Google Synced (emerald pulse), Local Sovereign (amber dot) | M3 | Survey |
| 14 | Automated Full-Suite Verification | 1,102 unit assertions, 122 browser CDP tests, 42 recheck tasks, 40 linted modules, line budgets, firmware untouched | M3 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Google OAuth & Serverless Calendar Controller | `api/calendar.js` | Survey | IN_PROGRESS |
| M2 | Frontend Two-Way Synchronization Engine | `modules/calendar-sync.js`, `modules/calendar.js` | M1 | PLANNED |
| M3 | Calendar Month View UI Perfection & Full Verification | `modules/calendar.js`, `dashboard.html`, `tests/*` | M2 | PLANNED |
| M4 | Committee Review & Victory Certification | Comprehensive verification across all 4 suites & auditor sign-off | M3 | PLANNED |

## Interface Contracts
### `modules/calendar-sync.js` ↔ `api/calendar.js`
- `GET /api/calendar/status`: Public status endpoint. Returns `{ connected: boolean, configured: boolean, userEmail?: string, calendarId?: string }`.
- `GET /api/calendar/auth`: Public auth URL generator. Returns `{ authUrl: string, state: string }`.
- `OPTIONS /api/calendar/*`: Preflight returning HTTP 204 with credentials and origin header.
- `POST /api/calendar/sync`: Synchronizes events. Body: `{ action: 'pull'|'push'|'delete', events?: array, event?: object, eventId?: string }`. Authenticated via `gcal_token` cookie or `gcal:master_tokens` Redis state.
- `GET /api/calendar/callback`: Completes OAuth exchange, stores tokens in cookie (`SameSite=None; Secure; Partitioned`) and Redis, emits `postMessage({ type: 'gcal_auth_success', ... })`.

## Code Layout
- `api/calendar.js`: Owned by Worker M1.
- `modules/calendar-sync.js`: Owned by Worker M2.
- `modules/calendar.js`: Owned by Worker M2 / M3.
- `dashboard.html`: Read-only / verification.
- `firmware/**`: 100% UNTOUCHED.
- `tests/**`: 100% UNTOUCHED / Verified.
