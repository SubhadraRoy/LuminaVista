# LuminaVista OS — Enterprise Security Policy & 10-Persona Defense

## Security Architecture Overview
LuminaVista OS implements a defense-in-depth security model designed according to OWASP Top-10 and OWASP API Top-10 standards. All private API endpoints are protected behind zero-trust session validation and sliding-window rate-limiting.

---

## 1. Zero-Trust Access Control & Session Lifecycle
- **Entry Gate (`/index.html`)**: Passphrases are received over HTTPS and validated in `/api/auth` using constant-time hash comparison (`crypto.timingSafeEqual`) over SHA-256 digests.
- **Session Issuance**: Upon successful verification, a cryptographically random UUID session token is stored in Upstash Redis (`session:<id>`) with an initial TTL of 1200 seconds (20 minutes).
- **Cookie Security**:
  ```http
  Set-Cookie: godx_session=<uuid>; HttpOnly; Secure; SameSite=Strict; Max-Age=1200; Path=/
  ```
  - `HttpOnly`: Prevents client-side script access, mitigating session theft via XSS.
  - `Secure`: Transmitted only over encrypted TLS connections.
  - `SameSite=Strict`: Protects against Cross-Site Request Forgery (CSRF).
- **Edge Middleware (`middleware.js`)**: Direct browser requests to `/dashboard.html` are intercepted at the edge. Requests without an active Redis session token are redirected to `/index.html`.
- **Sliding Session Expiration**: Every valid authenticated request refreshes the session key TTL in Redis by 1200 seconds.

---

## 2. Secrets Shielding & Error Masking
- **Server-Side Isolation**: Cloud API keys (`OLLAMA_API_KEY`, `E2B_API_KEY`, `GITHUB_STORAGE_TOKEN`, `UPSTASH_REDIS_REST_TOKEN`) and the master passphrase (`ADMIN_PASSWORD`) are never exposed to client-side bundles, telemetry, or logs.
- **Error Sanitization (`sanitizeError`)**: All caught exceptions pass through a unified regex sanitizer that strips bearer tokens, provider keys (`sk-`, `key-`, `e2b_`), internal URLs, and stack traces before returning responses to callers.

---

## 3. Rate-Limiting & Resource Defense
All stateful and compute-intensive endpoints enforce sliding-window IP rate-limiting in Upstash Redis:

| Route | Limit | Window | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/auth` | 5 attempts | 15 minutes | Brute-force & credential stuffing defense (with lockout) |
| `/api/chat` | 30 requests | 5 minutes | LLM token exhaustion defense |
| `/api/compile` | 20 runs | 5 minutes | MicroVM container exhaustion defense |
| `/api/terminal` | 20 runs | 5 minutes | Shell command spam defense |
| `/api/storage` | 30 calls | 5 minutes | GitHub API quota defense |
| `/api/sync` | 60 calls | 5 minutes | Redis mutation defense |

---

## 4. 15-Minute Client-Side Idle Inactivity Lock
- **Activity Monitoring**: The client tracks user interaction events (`mousemove`, `keydown`, `mousedown`, `scroll`, `touchstart`).
- **Auto-Lock Trigger**: After 15 minutes (900 seconds) of inactivity:
  - Workspace container `#app-root` is blurred (`blur-lg`) and interaction is disabled.
  - `#lockModal` is displayed prompting for administrator password re-verification.
  - Re-authentication calls `/api/auth` directly without requiring a full page reload.

---

## 5. HTTP Security Headers
Configured in `vercel.json`:
- `Content-Security-Policy`: Restricts scripts, styles, fonts, frames, and connect endpoints to trusted CDNs and self.
- `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `SAMEORIGIN`
- `X-XSS-Protection`: `1; mode=block`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), browsing-topics=()`
