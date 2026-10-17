# DISPATCH — 2026-10-17T05:15:00Z
Role: Cryptographic & IoT Security Engineer
Task: Evaluate constant-time checks, HMAC-SHA256, monotonic counters, and 15s command TTLs.
Directory: c:\Users\roysu\LuminaVista\.agents\teamwork\critic_r5_cryptoiot
## 2026-10-17T05:12:54Z
Sender: 6af1b532-87e3-493e-84d6-04eb107f2ec9
Task: Perform an adversarial cryptographic and IoT security evaluation across hardware gateway interfaces, crypto primitives, and session mechanisms:
1. api/iot.js:
   - Verify 5-layer HMAC signature verification.
   - Verify monotonic sequence counter validation (seq >= lastSeq).
   - Verify replay nonce deduplication and TTL expiration (T_nonce = 120s >= 2W).
   - Verify physical command TTL (15s) and dynamic in-memory state projection (anti-ghost-lock).
   - Verify hardware push rate-limiting clamped to 60 req/60s.
2. Cryptographic Comparisons & Timing Attack Defense:
   - Verify that all token, password, hash, and signature checks across api/ use constant-time crypto.timingSafeEqual with normalized buffer lengths.
3. ESP32 Physical Firmware Immutability:
   - Inspect firmware/** to verify that all hardware firmware files remain 100% untouched.
Evaluation Criteria:
- Certify whether zero Critical, High, or Medium cryptographic or IoT vulnerabilities remain.
- Determine final verdict: APPROVE or REQUEST_CHANGES.
- Write your detailed evaluation and verdict to c:\Users\roysu\LuminaVista\.agents\teamwork\critic_r5_cryptoiot\handoff.md.
- Send a completion message back to the orchestrator with your verdict.
Do NOT modify application source code.
