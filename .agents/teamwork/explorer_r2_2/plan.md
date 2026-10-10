# Investigation Plan: Surface 3 (IoT Gateway) & Surface 5 (Cloud Sync)

## Scope & Objectives
1. **Surface 3: ESP32 Smart Lock Hardware Gateway (`api/iot.js`)**
   - 5-layer HMAC signature verification (mutual auth, secret presence, constant-time compare)
   - Monotonic sequence validation (`packet.seq > meta.lastSeq`)
   - Replay nonce deduplication cache bounds, eviction policy, TTL (prevent memory exhaustion & replay bypass)
   - Command TTLs and physical lock command handling (unlock, lock, config, reboot)
   - Sliding-window rate limiting on `GET /api/iot?action=time` (prevent HMAC DoS)
   - Firmware integrity: verify `firmware/**` is strictly untouched

2. **Surface 5: Multi-Device Cloud Sync & Hydration (`modules/cloud-sync.js`, `api/sync.js`)**
   - Non-destructive cloud hydration: calendar events, notes, VFS files merged intelligently by ID/updatedAt
   - Active tab protection: ensure 90s background sync cycles NEVER hijack active tabs or call `window.switchTab`
   - `api/sync.js`: verify sensitive data (admin password hashes, private keys) are never leaked in sync responses or state
   - Line count verification: `api/iot.js` (< 2000), `modules/cloud-sync.js` (< 2000)

3. **Synthesis & Reporting**
   - Compile detailed findings in `analysis.md`
   - Structure final assessment in `handoff.md` (Observation, Logic Chain, Caveats, Conclusion, Verification Method)
   - Notify orchestrator with `send_message`
