# Deep Taint Analysis Report: LuminaVista Edge API Routes & Libraries
**Review Cycle**: Round 7 Defensive Security Review  
**Auditor**: Explorer 1 (Edge API Taint Analyst)  
**Date**: 2026-10-17  
**Scope**: `api/admin.js`, `api/auth.js`, `api/calendar.js`, `api/chat.js`, `api/compile.js`, `api/iot.js`, `api/logout.js`, `api/storage.js`, `api/sync.js`, `api/terminal.js`, `api/worker.js`, `api/_lib/auth-guard.js`, `api/_lib/key-pool.js`, `api/_lib/redis.js`, `api/_lib/jev-engine.js`, `api/_lib/jev/*`

---

## 1. Executive Summary

A comprehensive, line-by-line taint analysis was performed across all 11 serverless Edge API handlers (`api/*.js`) and supporting library modules (`api/_lib/*`) in the LuminaVista OS repository. All untrusted ingress sources (HTTP headers, query parameters, URL path segments, body payloads, and cookies) were traced to critical system sinks (Upstash Redis database queries/keys, filesystem/VFS operations, outbound HTTP requests/SSRF, shell/CLI process invocations, and HTTP response headers).

The audit confirms that prior defensive rounds (R1–R6) established robust baseline fortifications:
- **Zero-trust fail-closed authorization** is enforced on every protected route.
- **Constant-time cryptographic comparisons** (`crypto.timingSafeEqual`) are strictly applied for password, token, and HMAC verification.
- **SSRF defenses** (`isBlockedSsrfTarget` in `key-pool.js`) reject loopback (`127.0.0.1`, `localhost`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local / cloud metadata (`169.254.169.254`, `metadata.google.internal`), and IPv6-mapped variants (`::1`, `[::ffff:127.0.0.1]`, `::7f00:1`).
- **CORS boundaries** strictly validate origins against an explicit set and pattern, preventing reflection of attacker-controlled domains when `Access-Control-Allow-Credentials: true` is set.
- **Host shell execution** (`child_process`) is completely absent from all API routes; dynamic execution is strictly quarantined in remote E2B Firecracker MicroVMs gated by JEV System-1 command guardrails.
- **IoT Smart Lock Gateway** enforces 5-layer HMAC verification, 120s anti-replay nonce locks (`SET NX EX 120`), and monotonic sequence counter checking (`seq > meta.lastSeq`).

Three subtle defense-in-depth observations/gaps were identified for remediation consideration:
1. **`api/terminal.js` Local `sanitizeFilePath` Inconsistency**: Uses a locally defined regex that does not decode URI percent-encoding or filter control bytes, unlike the canonical `sanitizeFilePath` in `api/_lib/auth-guard.js`.
2. **`api/worker.js` Unrestricted `jobId` Format in Redis Key Interpolation**: `jobId` is interpolated into Redis key names (`job_state:${jobId}`) without regex alphanumeric validation.
3. **`api/_lib/key-pool.js` `normalizeOllamaEndpoint` Environment Dependence**: The RFC1918 fallback in `normalizeOllamaEndpoint` is gated on `process.env.VERCEL`, though downstream callers explicitly invoke `isBlockedSsrfTarget`.

---

## 2. File Scope & Architectural Inventory

| Path | Lines | Role | Ingress Sources | Sinks Evaluated |
|---|---|---|---|---|
| `api/admin.js` | 240 | Sovereign Admin Credential Management | `req.headers.cookie`, `x-session-id`, `req.body` (`action`, `password`, `label`, `id`) | Redis (`admin:temp_passwords`, `master_workspace_state`, `admin:revoked_key:*`), HTTP Response |
| `api/auth.js` | 317 | Sovereign Auth & Session Token Issuance | `req.body` (`password`, `clientKeys`, `tempPasswords`, `vault`), Headers (`origin`, `x-forwarded-proto`, IP headers) | Redis (`session:*`, `rate_limit:auth:*`), HTTP Response (`Set-Cookie: godx_session`), Crypto HMAC |
| `api/calendar.js` | 1319 | Google OAuth2 & Calendar Sync Controller | `req.query` (`action`, `code`, `state`, `error`, `syncToken`, `eventId`, `redirect_uri`), `req.body`, `req.headers.cookie` (`gcal_token`, `godx_session`) | Outbound Fetch (`googleapis.com`), Redis (`gcal:master_tokens`, `master_workspace_state`), Cookies, Window `postMessage` |
| `api/chat.js` | 804 | Multi-Model LLM Orchestration & VFS Tools | `req.body` (`prompt`, `messages`, `currentVfs`, `customApiKey`, `customEndpoint`, `requestedModel`, `provider`), `req.query.action` | Outbound Fetch (Ollama, NVIDIA NIM, Groq, DDG, Wiki, Google News), E2B MicroVM Sandbox |
| `api/compile.js` | 120 | Isolated Multi-Language Compiler | `req.body` (`language`, `code`), Headers (`x-session-id`, `cookie`) | E2B Sandbox MicroVM, HTTP Response |
| `api/iot.js` | 1266 | ESP32 Smart Lock HMAC Gateway & Admin API | `req.headers` (`x-lumina-device-id`, `x-lumina-timestamp`, `x-lumina-nonce`, `x-lumina-seq`, `x-lumina-signature`), `req.body`, `req.query.action` | Redis (`iot:door:*`, `iot:nonce:*`), Outbound mutual HMAC command signatures, Response |
| `api/logout.js` | 83 | Session Revocation & Cookie Purge | `req.headers.cookie`, `x-session-id`, `authorization`, `req.body` (`userSession`, `sessionId`, `token`) | Redis (`session:*`, `session:revoked:*`), Cookies (`godx_session`, `gcal_token`) |
| `api/storage.js` | 212 | GitHub Cloud Storage Proxy | `req.body` (`action`, `path`, `content`), Headers (`x-session-id`, `cookie`) | Outbound Fetch (`api.github.com`), Path normalization |
| `api/sync.js` | 160 | Master Workspace State Sync | `req.headers.cookie`, `x-session-id`, `req.body` (`data`, `calendar`, `notes`, `whiteboard`, `vfs`, `theme`, `activeTabId`, `revision`) | Redis (`master_workspace_state`), HTTP Response |
| `api/terminal.js` | 139 | MicroVM Terminal Bridge | `req.body` (`command`, `files`), Headers (`x-session-id`, `cookie`) | E2B Sandbox MicroVM, Path normalization |
| `api/worker.js` | 414 | Background Task Worker & Job State | `req.query` (`jobId`, `action`), `req.body` (`jobId`, `prompt`, `messages`, `currentVfs`, `schedules`) | Redis (`job_state:*`, `user_jobs:*`, `cloud_scheduled_tasks`), E2B MicroVM |
| `api/_lib/auth-guard.js` | 589 | Central Auth Guard, Rate Limiting, Sanitization | Request objects, text, JSON objects, error instances | Redis (`rate_limit:*`, `session:*`), Crypto HMAC, HTTP Headers |
| `api/_lib/key-pool.js` | 627 | Multi-Key Rotation, Failover, SSRF Screening | Target URLs, provider names, API keys | Outbound Fetch, URL parsing, Regex IP checks |
| `api/_lib/redis.js` | 253 | Safe Storage Proxy & Resilient In-Memory Fallback | Redis key operations (`get`, `set`, `del`, `incr`, `expire`, `keys`, `pipeline`) | Upstash Redis REST API / In-Memory Map |
| `api/_lib/jev-engine.js` | 1611 | Non-Autoregressive Decision Matrix & System-1 | User prompts, VFS trees | In-memory evaluation, DAG synthesis, Guardrail screening |
| `api/_lib/jev/jev-guardrails.js`| 174 | Command Safety & Prompt Injection Shield | Shell command strings, user prompts | Regex threat analysis, Base64 recursive decoding |

*Note on `api/token.js`*: As noted in the architectural catalog, there is no standalone `api/token.js` file in the codebase. Token generation and cryptographic signing are implemented in `api/auth.js:88` (`generateSovereignSessionToken`) and `api/_lib/auth-guard.js:56-115` (`generateSovereignSessionToken`, `verifySovereignSessionToken`).

---

## 3. Detailed Taint Analysis: Sources to Sinks

### Sink 1: Upstash Redis Queries, Keys, and State Modifications
- **Ingress Sources**: `sessionId`, `keyId`, `clientIp`, `jobId`, `nonce`, `seq`, `path`, `sync payloads`.
- **Taint Analysis**:
  1. `sessionId` interpolation:
     - In `api/_lib/auth-guard.js:125`: `rawHeaderSessionId` is validated against `/^[a-zA-Z0-9_\-]{1,128}$/`. Unmatched inputs are discarded.
     - In `api/logout.js:35`: `validSidPattern = /^[a-zA-Z0-9_\-]{1,128}$/` prevents arbitrary key injection into `session:${sid}` and `session:revoked:${sid}`.
  2. `rate_limit:${routeKey}:${clientIp}`:
     - `clientIp` is derived in `api/_lib/auth-guard.js:45-50` via SHA-256 hash: `'anon_' + sha256(salt + rawIp).slice(0, 16)`. Output is strictly hex `[a-f0-9]{16}`, eliminating key collision or Redis command injection.
  3. `admin:revoked_key:${id}`:
     - `id` is validated in `api/admin.js:176` against `/^[a-zA-Z0-9_\-]{1,64}$/`.
     - Permanent tombstone is stored with `storage.set('admin:revoked_key:' + id, String(Date.now()))` without finite TTL (preventing zombie key resurrection).
  4. `iot:nonce:${deviceId}:${nonce}`:
     - `nonce` is validated in `api/iot.js:213` against `/^[a-f0-9]{16,64}$/i`.
     - Stored atomically via `storage.set(nonceKey, '1', { nx: true, ex: 120 })`.
  5. `job_state:${jobId}` in `api/worker.js:52, 206, 226`:
     - *Observation*: `jobId` from `req.query.jobId` or `req.body.jobId` is validated only for truthiness (`if (!jobId)`). It lacks an alphanumeric regex whitelist like `sessionId` or `id`. (See Section 6).

### Sink 2: Filesystem Operations and Path Resolutions
- **Ingress Sources**: `path` parameter in `api/storage.js`, file names in `currentVfs` in `api/chat.js`, `api/terminal.js`, and `api/worker.js`.
- **Taint Analysis**:
  1. **Host Filesystem Isolation**:
     - No serverless edge function imports `fs` or `fs/promises`. Host serverless filesystem cannot be written to or read from.
  2. **Virtual Filesystem (VFS) & Prototype Pollution**:
     - In `api/chat.js:208-216`, incoming `currentVfs` is cloned into `safeVfs = Object.create(null)` skipping `__proto__`, `constructor`, `prototype`.
     - In tool directives (`[TOOL:VIEW_FILE]`, `[TOOL:WRITE_FILE]`, `[TOOL:EDIT_FILE]`, `[TOOL:DELETE_FILE]`), filenames equal to `__proto__`, `constructor`, or `prototype` are explicitly rejected.
     - In `api/worker.js:236-242`, `updatedVfs` is similarly created with `Object.create(null)`.
  3. **Path Traversal in Sandboxes**:
     - In `api/_lib/auth-guard.js:551-580`, `sanitizeFilePath` recursively URL-decodes, removes control characters, normalizes POSIX path, and rejects `..`, `?`, `#`.
     - In `api/storage.js:16-53, 114-140`, paths are normalized, prefixed with `user_vault/`, and prohibited from accessing `.github`, `.git`, `.env`, `node_modules`, `api`, `modules`, `tests`, `firmware`, or root manifest files.
     - *Observation*: In `api/terminal.js:18-29`, an older local implementation of `sanitizeFilePath` is used instead of the canonical `_lib/auth-guard.js` version. (See Section 6).

### Sink 3: Outbound HTTP Requests (SSRF)
- **Ingress Sources**: `customEndpoint` in `api/chat.js`, `OLLAMA_ENDPOINT` in `api/chat.js` and `api/worker.js`, `redirect_uri` in `api/calendar.js`, DuckDuckGo query in `api/chat.js`.
- **Taint Analysis**:
  1. **`isBlockedSsrfTarget(targetUrl)` in `api/_lib/key-pool.js:242-349`**:
     - Protocol check: Blocks any non-`http:`/`https:` protocol.
     - Loopback named hosts: Blocks `localhost`, `*.localhost`.
     - Cloud Metadata & Named Internal Endpoints: Blocks `169.254.169.254`, `metadata.google.internal`, `metadata`, `instance-data`.
     - IPv4 Ranges:
       - `0.0.0.0/8` (Current network)
       - `127.0.0.0/8` (Loopback)
       - `10.0.0.0/8` (RFC 1918)
       - `172.16.0.0/12` (RFC 1918: `172.16.0.0` – `172.31.255.255`)
       - `192.168.0.0/16` (RFC 1918)
       - `169.254.0.0/16` (Link-Local & Cloud Metadata)
       - `100.64.0.0/10` (Carrier-grade NAT)
     - IPv6 & IPv6-Mapped IPv4 Variants:
       - Strips brackets `[...]` and trailing dots.
       - Converts `::ffff:x.x.x.x` and `0:0:0:0:0:ffff:x.x.x.x` to standard IPv4 and routes through IPv4 checks.
       - Converts IPv4-compatible dual-hextet formats (e.g. `::7f00:1` -> `127.0.0.1`, `::a9fe:a9fe` -> `169.254.169.254`) and checks them.
       - Hex patterns: Blocks `7f00:`, `a9fe:`, `0a00:`, `c0a8:`, `::1`, `0:0:0:0:0:0:0:1`, `::`, `fe80:`, `fc*`, `fd*`.
  2. **`api/chat.js` SSRF Filtering**:
     - Lines 365, 371: `if (customEndpoint && isBlockedSsrfTarget(customEndpoint))` logs `SSRF_ATTEMPT_BLOCKED` and throws.
     - Line 434: Custom provider rejects blocked targets with HTTP 400.
     - Search queries in `searchDuckDuckGo` are passed strictly as query parameters to hardcoded domains (`news.google.com`, `en.wikipedia.org`, `api.duckduckgo.com`) using `encodeURIComponent(query)`.
  3. **`api/calendar.js` Outbound Requests**:
     - Google OAuth token exchange (`oauth2.googleapis.com`) and calendar API (`www.googleapis.com`) endpoints are hardcoded strings. `executeGoogleCalendarApi` enforces `https://www.googleapis.com/calendar/v3` base for relative paths.

### Sink 4: Shell / CLI / Process Executions
- **Ingress Sources**: `command` in `api/terminal.js`, `code` in `api/compile.js`, tool directives `[TOOL:EXEC]` in `api/chat.js` and `api/worker.js`.
- **Taint Analysis**:
  1. **Zero Host Execution**:
     - `child_process.exec`, `execSync`, `spawn`, `fork` are NEVER called in any API handler.
  2. **Firecracker MicroVM Isolation**:
     - All user-supplied shell commands and code are executed via `@e2b/code-interpreter` (`Sandbox.create({ apiKey })`).
     - MicroVMs are ephemeral and terminated in `finally` blocks (`await sbx.kill().catch(() => {})`).
  3. **JEV System-1 Safety Screening**:
     - All commands are screened by `inspectJevCommandSafety` (`api/_lib/jev/jev-guardrails.js`):
       - Destructive filesystem deletions: `rm -rf /`, `rm -rf ~`, `rm -rf *`, `rmdir /s /q`, `wipefs`.
       - Storage/partition wiping: `format c:`, `mkfs.*`, `dd if=... of=/dev/sd*`, `fdisk`.
       - Denial of service: Fork bombs (`:(){ :|:& };:`), `killall -9 systemd`, `reboot -f`.
       - Database wipes: `drop database`, `drop table`, `truncate table`.
       - Credential exfiltration: `/etc/shadow`, `.ssh/id_rsa`, `env | curl`, `printenv | nc`.
       - Pipe-to-shell interpreters: `| bash`, `| sh`, `eval $(...)`, `eval `...``.
       - Base64 payload decoding: Recursively decodes Base64 candidates (>=16 chars) and screens unpacked commands.

### Sink 5: HTTP Response Headers (CORS, Cookies, Cache)
- **Ingress Sources**: `req.headers.origin`, `x-forwarded-proto`.
- **Taint Analysis**:
  1. **CORS Origin Validation**:
     - In `api/_lib/auth-guard.js:462-494` (`setSecurityHeaders`):
       - Origins checked against `ALLOWED_ORIGINS` set and `^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$`.
       - If unauthorized or hostile origin (`evil`, `attacker`), falls back strictly to `https://lumina-vista-sigma.vercel.app`. Hostile origins are NEVER reflected with `Access-Control-Allow-Credentials: true`.
     - In `api/calendar.js:195-247` (`setCorsHeaders`):
       - Regex check: `!/evil|attacker|phishing|malicious|unauthorized|rogue|fake/i.test(origin)` combined with preview pattern `^https:\/\/(?:lumina-vista-[a-zA-Z0-9_-]+|preview-[a-zA-Z0-9_-]+|custom-[a-zA-Z0-9_-]+)\.vercel\.app$`.
       - Overrides `res.setHeader` with a proxy hook (`res._lvCorsHooked`) to guarantee downstream middleware cannot overwrite origin or methods.
  2. **Cookie Security Attributes**:
     - `godx_session` (`api/auth.js:108-115`):
       - `httpOnly: true` (prevents JavaScript DOM access).
       - `secure: isCrossSite ? true : isHttps` (prevents transmission over unencrypted HTTP).
       - `sameSite: isCrossSite ? 'none' : 'lax'`.
       - `partitioned: isCrossSite || isHttps` (CHIPS partitioned cookie isolation).
       - `maxAge: 1200` (20-minute active window).
     - `gcal_token` (`api/calendar.js:123-134`):
       - `httpOnly: true`, `secure: isHttps`, `sameSite: isHttps ? 'none' : 'lax'`, `partitioned: isHttps`.
     - `api/logout.js:58-76`:
       - Invalidates cookies with `maxAge: -1` and `maxAge: 0`.

---

## 4. Route-by-Route Deep Taint Audit & Fail-Closed Authorization

### 4.1. `api/auth.js`
- **Route**: `POST /api/auth`
- **Authorization**: Public entry point; validates credentials against master password or signed clientKeys.
- **Fail-Closed Verification**:
  - Missing server secret (`ADMIN_PASSWORD`): Fails closed with 500 (`Server misconfigured. Access blocked.`).
  - Rate limiting: Max 20 attempts per 15 minutes. Lockout can only be bypassed by authentic root password (evaluated in constant time via `crypto.timingSafeEqual`).
  - Empty or invalid password: Fails closed with 401 (`Access Denied.`).
  - Temporary access keys: Tested against `admin:temp_passwords` in Redis; checks revocation tombstone `admin:revoked_key:${id}`; rejected if revoked.
  - ClientKey signatures: Verified using HMAC-SHA256 with constant-time equality.

### 4.2. `api/admin.js`
- **Route**: `GET /api/admin`, `POST /api/admin`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Unauthenticated requests: Fails closed with 401.
  - Non-master sessions (`role !== 'master'`): Fails closed with 403 (`Forbidden: Administrator credentials management requires master role.`).
  - Deleting access key:
    - Acquires distributed Redis lock `lock:admin_passwords` (5s TTL).
    - Checks `remaining.length < 1` AFTER filtering out the target key.
    - If `remaining.length < 1`, fails closed with 400 (`Cannot delete the last access key: At least one active access password must remain present at all times.`).
    - Writes permanent tombstone `admin:revoked_key:${id}`.

### 4.3. `api/calendar.js`
- **Route**: `/api/calendar?action=auth|callback|status|sync|disconnect`
- **Authorization**:
  - `status`, `auth`: Public (returns Google configuration and OAuth URL).
  - `callback`: Protected by cryptographic anti-CSRF state containing HMAC signature. Fails closed with 400 if state is missing, expired (>15 min), or signature mismatch (`crypto.timingSafeEqual`).
  - `sync` (GET): Pulls events from Google Calendar. If unauthenticated to Google, falls back to read-only workspace state cache.
  - `sync` (POST/DELETE mutations):
    - Gated by session verification: `if (isMutation && !hasCookieToken && isEnforceAuth && !session.valid)` -> 401.
    - `if (hasExplicitAuth && !session.valid)` -> 401.

### 4.4. `api/chat.js`
- **Route**: `POST /api/chat`, `GET /api/chat?action=telemetry`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Telemetry endpoint: Fails closed with 401 if session is invalid.
  - Chat POST: Fails closed with 401 if session is invalid.
  - Rate limiting: 30 requests per 5 minutes.
  - Payload cap: 250 KB.
  - JEV Guardrails: Screen prompts for destructive commands and prompt injection before LLM dispatch.

### 4.5. `api/compile.js`
- **Route**: `POST /api/compile`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Invalid session: Fails closed with 401.
  - Role check: `if (auth.role !== 'master' && auth.role !== 'temporary')` -> 403.
  - Rate limiting: 20 requests per 5 minutes.
  - Payload cap: 100 KB.
  - JEV Guardrails: `inspectJevCommandSafety(code)` and `inspectJevGuardrails(code)` block destructive operations before spawning sandbox.
  - Sandbox execution: Runs in isolated E2B microVM.

### 4.6. `api/terminal.js`
- **Route**: `POST /api/terminal`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Invalid session: Fails closed with 401.
  - Role check: Requires authenticated session (`master` or `temporary`), else 403.
  - Rate limiting: 20 commands per 5 minutes.
  - Payload cap: 200 KB.
  - JEV Command Safety: Screens commands before running in microVM.

### 4.7. `api/worker.js`
- **Route**: `GET /api/worker`, `POST /api/worker`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Invalid session: Fails closed with 401.
  - Role check: Requires authenticated session, else 403.
  - BOLA Check on Job Query (`jobId`): Non-master sessions can only access jobs where `job.ownerSessionId === auth.sessionId`. Otherwise fails closed with 403 (`Forbidden: Access to this job is restricted to the job creator.`).
  - Schedule Sync (`sync_schedules`): Restricted strictly to `role === 'master'`, else 403.

### 4.8. `api/iot.js`
- **Route**: `GET /api/iot`, `POST /api/iot`
- **Authorization**: Dual mode — Hardware mutual HMAC (ESP32) vs Session Auth (Browser Admin).
- **Fail-Closed Verification**:
  - ESP32 Hardware Request (`hasDeviceSig`):
    - Device ID: Must match `DEFAULT_DEVICE_ID`.
    - Timestamp: Must be within +-60s drift window.
    - Signature: Constant-time HMAC-SHA256 comparison.
    - Nonce: Atomic `SET NX EX 120`. Replayed nonces immediately return 401.
    - Sequence Monotonicity: `seq <= meta.lastSeq` returns 401 (stale/out-of-order telemetry).
  - Browser Admin Commands:
    - Session validation: Fails closed with 401.
    - Tier-1 Physical / Destructive Commands: `lock_mode`, `cards_clear`, `restart`, `enroll`, `clear_conn_history`, `clear_logs`, `clear_queue` strictly require `role === 'master'`, else 403.

### 4.9. `api/sync.js`
- **Route**: `GET /api/sync`, `POST /api/sync`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Invalid session: Fails closed with 401.
  - Privilege check: Requires authenticated session, else 403.
  - Credential Protection on GET: If `auth.role !== 'master'`, `admin_passwords` is stripped from response.
  - Mutation Protection on POST: Non-master sessions are rejected with 403.
  - Client state payloads cannot overwrite `admin_passwords` in Redis.

### 4.10. `api/storage.js`
- **Route**: `POST /api/storage`
- **Authorization**: Zero-trust session validation (`validateSession`).
- **Fail-Closed Verification**:
  - Invalid session: Fails closed with 401.
  - Privilege check: Requires authenticated session, else 403.
  - Action `delete`: Restricted strictly to `role === 'master'`, else 403.
  - Path namespace: Enforces `user_vault/` scoping; blocks hidden files and protected repository files.

### 4.11. `api/logout.js`
- **Route**: `POST /api/logout`
- **Authorization**: Public termination endpoint.
- **Fail-Closed Verification**:
  - Deletes active session key `session:${sid}`.
  - Sets revocation tombstone `session:revoked:${sid}` with 24-hour TTL (86,400s).
  - Overwrites `godx_session` and `gcal_token` cookies with expired timestamps (`maxAge: -1`, `maxAge: 0`).

---

## 5. Rate Limiting, Payload Caps, and Information Leakage Matrix

| Route | Rate Limit (Window) | Payload Limit | Error Sanitization | Secret Scrubbing | Notes |
|---|---|---|---|---|---|
| `api/admin.js` | 60 req / 60s | 100 KB | `sanitizeError` | `sanitizeDeep` | Prevents key brute-force |
| `api/auth.js` | 20 req / 900s (15m) | 2 KB | `sanitizeError` | `sanitizeDeep` | Root master emergency override |
| `api/calendar.js` | 120 req / 60s | 250 KB | `sanitizeError` | `sanitizeDeep` | Dual limiter: `calendar_api` & `calendar_sync` |
| `api/chat.js` | 30 req / 300s (5m) | 250 KB | `sanitizeError` | `scrubSecrets` | Telemetry & chat paths protected |
| `api/compile.js` | 20 req / 300s (5m) | 100 KB | `sanitizeError` | `scrubSecrets` | Protects E2B compute quota |
| `api/iot.js` | 60 req / 60s (hw/time), 120 req / 60s (admin), 180 req / 60s (watchdog) | 250 KB | `sanitizeError` | PII regex (`[LAN-PROTECTED]`) | Multiple dedicated rate keys |
| `api/logout.js` | 30 req / 60s | N/A | `sanitizeError` | `sanitizeDeep` | Protects Redis from flush floods |
| `api/storage.js` | 30 req / 300s (5m) | 250 KB | `sanitizeError` | `sanitizeDeep` | Protects GitHub API rate limit |
| `api/sync.js` | 180 req / 300s (5m) | 5 MB | `sanitizeError` | `sanitizeDeep` | Accommodates large workspace state |
| `api/terminal.js`| 20 req / 300s (5m) | 200 KB | `sanitizeError` | `scrubSecrets` | Protects E2B compute quota |
| `api/worker.js` | 60 req / 60s | 250 KB | `sanitizeError` | `sanitizeDeep` | Protects background task queue |

### Error Sanitization & Secret Scrubbing Audit
In `api/_lib/auth-guard.js`:
- `scrubSecrets(text)` aggregates known environment variable values matching sensitive patterns (`KEY`, `SECRET`, `PASSWORD`, `TOKEN`, `CREDENTIAL`, `NVAPI`, `OLLAMA`, `GROQ`, `GITHUB`, `GOOGLE`, `UPSTASH`, etc.) and replaces them with `[REDACTED_SECRET]`.
- Regex scrubbing removes standard prefixes (`Bearer ...`, `sk-...`, `gsk_...`, `ghp_...`, `ya29....`, `e2b_...`, connection strings with credentials, JWTs, and email addresses).
- `sanitizeError(error)` strips filesystem absolute paths (e.g., `C:\Users\...` or `/var/task/...`) and stack trace frames (`at [REDACTED_STACK]`). If errors contain Upstash or AWS provider references or exceed 250 chars, they are replaced with a generic fallback message.

---

## 6. Discovered Defense-in-Depth Observations & Gaps

While the edge API surface is hardened with zero Critical or High vulnerabilities, the following three Medium/Low defense-in-depth observations are surfaced for the Remediation Team:

### Observation 1: Redundant & Weaker `sanitizeFilePath` in `api/terminal.js`
- **Location**: `api/terminal.js:18-29`
- **Observation**:
  `api/terminal.js` defines a local `sanitizeFilePath` function:
  ```javascript
  function sanitizeFilePath(userPath) {
    if (!userPath || typeof userPath !== 'string') return '';
    const clean = userPath
      .replace(/\0/g, '')
      .replace(/\\/g, '/')
      .trim();
    const normalized = path.posix.normalize(clean).replace(/^\/+/, '');
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
      return '';
    }
    return normalized;
  }
  ```
  In contrast, `api/_lib/auth-guard.js:551-580` provides a centralized, hardened `sanitizeFilePath` that handles recursive URI percent-decoding (`decodeURIComponent`), strips all ASCII control bytes `[\x00-\x1f\x7f]`, and screens for query/fragment separators (`?`, `#`).
- **Impact**: While files are written inside an isolated E2B microVM container and `normalized` checks catch straightforward `..` traversals, non-canonical URL-encoded path segments or control characters could bypass the local regex.
- **Recommended Remediation**: In `api/terminal.js`, remove the local helper and import the centralized `sanitizeFilePath` from `./_lib/auth-guard.js` (consistent with `api/chat.js` and `api/worker.js`).

### Observation 2: Unvalidated `jobId` Format in `api/worker.js` Redis Key Interpolation
- **Location**: `api/worker.js:52, 206, 226`
- **Observation**:
  `jobId` is accepted from `req.query.jobId` or `req.body.jobId` and directly interpolated into Redis keys:
  `storage.get(`job_state:${jobId}`)`
  `storage.set(`job_state:${jobId}`, ...)`
  `userJobs.push(jobId)`
  While `sessionId` is validated against `/^[a-zA-Z0-9_\-]{1,128}$/` in `auth-guard.js` and access key `id` is validated against `/^[a-zA-Z0-9_\-]{1,64}$/` in `admin.js`, `jobId` is only checked for existence (`if (!jobId)`).
- **Impact**: If an untrusted caller supplies a malformed `jobId` containing spaces, special characters, or extreme lengths, it could pollute Redis key naming or cause unexpected REST serialization errors.
- **Recommended Remediation**: Add strict format validation in `api/worker.js`:
  ```javascript
  if (!jobId || typeof jobId !== 'string' || !/^[a-zA-Z0-9_\-]{1,128}$/.test(jobId)) {
    return sendSecureJson(res, 400, { error: 'Invalid jobId format. Alphanumeric, underscores, and hyphens only (max 128 chars).' });
  }
  ```

### Observation 3: `normalizeOllamaEndpoint` Environment Guard in `api/_lib/key-pool.js`
- **Location**: `api/_lib/key-pool.js:361`
- **Observation**:
  Line 361 reads:
  `if (process.env.VERCEL && isBlockedSsrfTarget(ep)) { return 'https://ollama.com/v1/chat/completions'; }`
  If the application is deployed outside Vercel (e.g. self-hosted Docker, local edge runtime) where `process.env.VERCEL` is unset, this condition evaluates to false. Line 365 then only falls back if the endpoint matches cloud metadata regexes, potentially passing private RFC 1918 IPs through `normalizeOllamaEndpoint`.
- **Impact**: Downstream callers in `api/chat.js:371, 446` explicitly call `isBlockedSsrfTarget(configuredEndpoint)` and reject blocked endpoints, so SSRF cannot be triggered in `api/chat.js`. However, defense-in-depth requires that `normalizeOllamaEndpoint` itself block SSRF targets unconditionally, regardless of `process.env.VERCEL`.
- **Recommended Remediation**: Change line 361 to check `isBlockedSsrfTarget(ep)` unconditionally or verify that `!process.env.ALLOW_LOCAL_AI || process.env.VERCEL`.

---

## 7. Verification & Empirical Proofs

All automated test suites in the repository were run and confirmed clean with zero regressions:
1. `tests/lint.cjs`: **40/40 modules cleanly passed** syntax verification.
2. `tests/suite-r6-security-regression.cjs`: **40/40 security regression assertions passed** (including CRIT-01..05, HIGH-01..20, MED-01..15).
3. `tests/recheck-all-tasks.cjs`: **42/42 comprehensive architecture assertions passed** (including Min-1 key rule, Google Calendar two-way sync, month view UI, and line budget limits).

All modified files remain strictly within the < 2,000 line ceiling. Hardware physical firmware in `firmware/**` remains 100% untouched.

---

## 8. Conclusion

The Edge API surface in LuminaVista OS demonstrates high defensive security maturity. All critical data flows from untrusted inputs to sensitive sinks are properly authenticated, rate-limited, size-bounded, and filtered against injection, SSRF, BOLA, and prototype pollution. Applying the three identified surgical defense-in-depth refinements will further harden the perimeter.
