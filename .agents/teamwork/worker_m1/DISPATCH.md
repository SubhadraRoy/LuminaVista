# Worker M1 Dispatch Specification

## Milestone
Milestone 1 (Phase 1): Native Zero-Dependency Service Account JWT Auth Engine

## Working Directory
`c:/Users/roysu/LuminaVista/.agents/teamwork/worker_m1`

## Authoritative Inputs
- `c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md`
- `c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/DISPATCH.md`
- `c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/plan.md`
- `c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_survey_1/handoff.md`

## File Ownership
- Exclusively owns: `api/_lib/google-auth.js` and `api/_lib/google-service-auth.js`.
- You MUST NOT modify firmware files (`firmware/**`).
- You MUST NOT create or modify any `.env*` files.

## Detailed Requirements
1. Implement `api/_lib/google-auth.js`:
   - Must export `getGoogleServiceAccountToken(forceRefresh = false)`: Returns `Promise<string | null>` (resolves to the Bearer token string if configured and valid, or null if unconfigured/missing).
   - Also export `getServiceAccountAccessToken()`, `getServiceAccountCredentials()`, `createServiceAccountJwt()`, `sanitizePrivateKey()`, `base64UrlEncode()`, `invalidateServiceAccountToken()`.
   - Maintain compatibility with `api/_lib/google-service-auth.js` (re-export or share canonical implementation).
2. Native RS256 JWT signing:
   - Use Node's built-in `crypto` module (`crypto.createSign('RSA-SHA256')`). Zero third-party npm packages.
3. Private key sanitization:
   - `rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')`.
4. JWT Construction & Token Exchange:
   - Header: `{"alg":"RS256","typ":"JWT"}`
   - Claims: `iss` (service account email), `scope` ("https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"), `aud` ("https://oauth2.googleapis.com/token"), `iat` (now in seconds), `exp` (now + 3600 seconds).
   - POST assertion to `https://oauth2.googleapis.com/token` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`.
5. In-Memory Token Caching:
   - Cache token until 5 minutes before expiration (`tokenExpiresAt - now > 300000`).
6. Build-Time Safety:
   - Never evaluate or throw errors on undefined environment variables at module top-level. Only evaluate lazily inside function calls.
7. File Limits:
   - Strict ceiling: strictly under 2,000 lines.
8. Verification:
   - Run `node tests/lint.cjs` to confirm syntax passes.
   - Run a node smoke test verifying JWT generation with a dummy RSA key without throwing errors.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Completion
Write report to `c:/Users/roysu/LuminaVista/.agents/teamwork/worker_m1/handoff.md` and send a message back to the orchestrator.


## 2026-10-17T11:18:37Z
You are Worker M1 (Google Auth Engine Worker).
Your working directory is: c:/Users/roysu/LuminaVista/.agents/teamwork/worker_m1
Your dispatch instructions are at: c:/Users/roysu/LuminaVista/.agents/teamwork/worker_m1/DISPATCH.md
You MUST read the authoritative requirements in: c:/Users/roysu/LuminaVista/.agents/teamwork/ORIGINAL_REQUEST.md
Also read:
- c:/Users/roysu/LuminaVista/.agents/teamwork/orchestrator_r8/plan.md
- c:/Users/roysu/LuminaVista/.agents/teamwork/explorer_survey_1/handoff.md

FILE OWNERSHIP: You exclusively own `api/_lib/google-auth.js` and `api/_lib/google-service-auth.js`.
DO NOT modify firmware (`firmware/**`).
DO NOT create or modify any `.env*` files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Tasks:
1. Implement `api/_lib/google-auth.js`:
   - Export `getGoogleServiceAccountToken(forceRefresh = false)`: Returns `Promise<string | null>` (resolves to the Bearer token string if configured, or null if unconfigured/missing).
   - Export `getServiceAccountAccessToken()`, `getServiceAccountCredentials()`, `createServiceAccountJwt()`, `sanitizePrivateKey()`, `base64UrlEncode()`, `invalidateServiceAccountToken()`.
   - Maintain compatibility with `api/_lib/google-service-auth.js`.
2. Native RS256 JWT signing using Node's built-in `crypto` module (`crypto.createSign('RSA-SHA256')`). Zero external npm dependencies.
3. Private key sanitization: `rawKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n')`.
4. Construct JWT Header (`{"alg":"RS256","typ":"JWT"}`) and Claims (`iss`, `scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events"`, `aud: "https://oauth2.googleapis.com/token"`, `iat`, `exp: now + 3600`).
5. In-memory token caching until 5 minutes before expiration (`tokenExpiresAt - now > 300000`).
6. Build-time safety: lazy evaluation inside runtime functions. Never throw at top-level module evaluation on undefined env vars.
7. Verification: Run `node tests/lint.cjs` and verify token generation with test script.
8. Write your completion report to `c:/Users/roysu/LuminaVista/.agents/teamwork/worker_m1/handoff.md` and send a message back to the orchestrator.
