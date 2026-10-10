# Challenger Handoff Report: Milestone 1 (Challenger M1_2)

- **Agent**: Challenger M1_2 (`challenger_m1_2`)
- **Archetype**: EMPIRICAL CHALLENGER
- **Roles**: critic, specialist
- **Timestamp**: 2026-10-16T16:47:00Z
- **Target Surfaces**: `api/auth.js`, `api/admin.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js`
- **Verdict**: **APPROVE**

---

## 1. Observation

### OBS-1.1: `crypto.timingSafeEqual` Buffer Length Normalization
- **File**: `api/auth.js:52-62, 154-160, 196-204, 236-257`
- **File**: `api/_lib/auth-guard.js:70-78`
- **Direct observation**:
  1. In `api/auth.js:52-58`:
     ```javascript
     const passBuf = crypto.createHash('sha256').update(password).digest();
     const trimmedPassBuf = crypto.createHash('sha256').update(password.trim()).digest();
     // ...
     const candBuf = crypto.createHash('sha256').update(cand).digest();
     const match1 = crypto.timingSafeEqual(passBuf, candBuf);
     const match2 = crypto.timingSafeEqual(trimmedPassBuf, candBuf);
     ```
     `passBuf`, `trimmedPassBuf`, and `candBuf` are all produced by `crypto.createHash('sha256').digest()`, which strictly returns a 32-byte `Buffer`.
  2. In `api/auth.js:196-204` & `236-243`:
     ```javascript
     const keyBuf = Buffer.alloc(32);
     const parsedKey = Buffer.from(targetHash, 'hex');
     const validLen = parsedKey.length === 32;
     if (validLen) parsedKey.copy(keyBuf);
     const match1 = crypto.timingSafeEqual(inputHash, keyBuf);
     const match2 = crypto.timingSafeEqual(trimmedHash, keyBuf);
     if (validLen && (match1 || match2)) return true;
     ```
     `keyBuf` is pre-allocated with a fixed size of 32 bytes (`Buffer.alloc(32)`). `inputHash` and `trimmedHash` are also 32-byte SHA-256 buffers. Regardless of the size, validity, or formatting of `targetHash`, `keyBuf` is guaranteed to be 32 bytes.
  3. In `api/auth.js:250-256`:
     ```javascript
     const expectedSigBuf = crypto.createHmac('sha256', secret).update(`${k.id}:${k.hash}:${k.createdAt}`).digest();
     const sigBuf = Buffer.alloc(32);
     const parsedSig = Buffer.from(k.sig.toLowerCase().trim(), 'hex');
     const validLen = parsedSig.length === 32;
     if (validLen) parsedSig.copy(sigBuf);
     const isMatch = crypto.timingSafeEqual(sigBuf, expectedSigBuf);
     if (validLen && isMatch) return true;
     ```
     `expectedSigBuf` is 32 bytes (HMAC-SHA256 digest buffer), and `sigBuf` is fixed at 32 bytes (`Buffer.alloc(32)`).
  4. In `api/_lib/auth-guard.js:70-77`:
     ```javascript
     const expectedSig = crypto.createHmac('sha256', s).update(payload).digest('hex');
     if (signature.length === expectedSig.length) {
       try {
         if (crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
           signatureMatch = true;
           break;
         }
       } catch (_) {}
     }
     ```
     Length check precedes buffer comparison, and `timingSafeEqual` is enclosed in `try ... catch` to prevent uncaught `RangeError` from multi-byte unicode strings.

### OBS-1.2: Temporary Admin Authorization & Min-1 Invariant
- **File**: `api/admin.js:16-19, 161-168`
- **Direct observation**:
  In `api/admin.js:16`:
  ```javascript
  const session = await validateSession(req, storage);
  if (!session.valid) {
    return sendSecureJson(res, session.status || 401, { error: session.error || 'Unauthorized' }, req);
  }
  ```
  Any valid session (including `role: 'temporary'`) is authenticated to access `GET /api/admin` and `POST /api/admin`.
  In `api/admin.js:161-168`:
  ```javascript
  const remaining = items.filter(k => k && k.id !== id);
  if (remaining.length < 1) {
    return sendSecureJson(res, 400, {
      error: 'Cannot delete the last access key: At least one active access password must remain present at all times.'
    }, req);
  }
  ```
  Deletion calculates `remaining` post-filtering, preventing deletion when remaining active access keys would drop to zero.

### OBS-1.3: Master Password Lockout Bypass in Constant Time
- **File**: `api/auth.js:48-72`
- **Direct observation**:
  When IP rate check fails (`if (!rateCheck.allowed)`), line 50 checks `isMasterAttempt`.
  Each candidate secret (`cleanExpected`, `rawExpectedPassword.trim()`, `rawExpectedPassword`) is hashed to a 32-byte buffer and compared via `crypto.timingSafeEqual(passBuf, candBuf)` and `crypto.timingSafeEqual(trimmedPassBuf, candBuf)`.
  The loop evaluates all candidates without premature termination on byte mismatches.
  Upon a match, `isMasterAttempt = true` bypasses the 429 response and issues a sovereign master session token.

### OBS-1.4: Empirical Test Suite Execution Results
- Command: `node tests/lint.cjs`
  * Output: `✓ All 40 JavaScript modules passed syntax validation.`
  * Result: Exit code 0 (40/40 passed).
- Command: `node tests/features.test.cjs`
  * Output: `=== TEST RESULTS: 1102/1102 ASSERTIONS PASSED ===`
  * Result: Exit code 0 (1,102/1,102 passed).
- Command: `node tests/recheck-all-tasks.cjs`
  * Output: `🎉 ALL 42 COMPREHENSIVE RECHECK ASSERTIONS PASSED WITH ZERO ERRORS!`
  * Result: Exit code 0 (42/42 passed).
- Command: `node tests/browser-cdp-test.cjs`
  * Output: `=== BROWSER TEST RESULTS: 122/122 PASSED ===`
  * Result: Exit code 0 (122/122 passed).

---

## 2. Logic Chain

1. **Safety from `RangeError` (OBS-1.1)**:
   - Node.js `crypto.timingSafeEqual(a, b)` requires `a.length === b.length` and throws `RangeError: Input buffers must have the same byte length` if lengths differ.
   - In `api/auth.js`, all string inputs (`password`, `targetHash`, `sig`) are either transformed into fixed 32-byte SHA-256 digests or copied into fixed 32-byte buffers (`Buffer.alloc(32)`).
   - In `api/_lib/auth-guard.js`, the signature comparison is wrapped in a `try...catch` block.
   - Tested empirically with odd hex strings (`"abc"`), empty strings, 128-byte strings, multi-byte UTF-8 (`"a".repeat(63) + "ä"`), nulls, numbers, and objects. Zero unhandled `RangeError` crashes were observed.

2. **Access Control Integrity & Invariant Preservation (OBS-1.2)**:
   - Temporary admin sessions (`role: 'temporary'`) passing valid sovereign tokens or stored sessions successfully access `GET /api/admin`, `POST /api/admin` (create), and `POST /api/admin` (delete when > 1 key remains).
   - When attempting to delete the final key in storage, `remaining.length < 1` triggers HTTP 400 Bad Request with the required security policy error message.
   - Temporary administrators cannot eliminate all keys, upholding the min-1 key invariant.

3. **Master Password Lockout Bypass & Side-Channel Resistance (OBS-1.3)**:
   - Under an active IP lockout (rate check exceeded), an attacker providing incorrect credentials receives HTTP 429 (`Rate limit exceeded`).
   - Supplying the genuine master password (or master password with whitespace) bypasses the rate-limit lockout and returns HTTP 200 with `role: 'master'`.
   - The comparison evaluates SHA-256 digests of identical 32-byte length using `timingSafeEqual` in uniform time.

4. **Zero Regressions (OBS-1.4)**:
   - All 4 official test suites passed with 100% success rate across 1,306 total assertions (40 lint + 1,102 features + 42 recheck + 122 browser CDP).
   - All modified files remain well within their 2,000-line budget.

---

## 3. Caveats

- **No Caveats**: The review and empirical stress harnesses strictly covered the Milestone 1 target boundaries (`api/auth.js`, `api/admin.js`, `api/_lib/auth-guard.js`, `modules/admin-access.js`).
- ESP32 hardware firmware (`firmware/**`) remained completely untouched.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- The timing-safe equality implementation in `api/auth.js` and `api/_lib/auth-guard.js` is cryptographically sound and resilient against uncaught `RangeError` exceptions.
- Temporary admin users can perform all authorized actions permitted by the test suite, while the minimum-1 access key rule is strictly enforced post-filtering.
- Master passwords reliably and securely bypass lockout in constant time without timing leaks.
- All test suites pass cleanly.

---

## 5. Verification Method

To independently re-verify the challenger's empirical findings:

1. **Verify Syntax & Features**:
   ```bash
   node tests/lint.cjs
   node tests/features.test.cjs
   node tests/recheck-all-tasks.cjs
   node tests/browser-cdp-test.cjs
   ```

2. **Verify RangeError Immunity on Malformed/Unequal Buffers**:
   ```bash
   node -e "const crypto=require('crypto'); (async()=>{ const {verifyCredentials}=await import('./api/auth.js'); const res=await verifyCredentials('any', 'Master123', null, [{id:'1', hash:'abc', sig:'1234'}, {id:'2', hash:'a'.repeat(128), sig:''}, {id:'3', hash:'', sig:'a'.repeat(64)}]); console.assert(!res.authenticated); console.log('PASS: No RangeError thrown on unequal/malformed buffers'); })();"
   ```

3. **Verify Lockout Bypass**:
   ```bash
   node -e "(async()=>{ const authMod=await import('./api/auth.js'); const guardMod=await import('./api/_lib/auth-guard.js'); const {ResilientFallbackStorage}=await import('./api/_lib/redis.js'); process.env.ADMIN_PASSWORD='root_password'; process.env.NODE_ENV='production'; const s=new ResilientFallbackStorage(); const ip='10.1.2.3'; const hashedIp=guardMod.getClientIp({headers:{'x-real-ip':ip}}); await s.set('rate_limit:auth:'+hashedIp, 50, {ex:900}); let st=0; const res={status(c){st=c;return this;},json(){return this;},setHeader(){},end(){}}; await authMod.default({method:'POST',body:{password:'wrong'},headers:{'x-real-ip':ip}}, res); console.assert(st===429, 'Wrong must 429'); await authMod.default({method:'POST',body:{password:'root_password'},headers:{'x-real-ip':ip}}, res); console.assert(st===200, 'Master must bypass lockout with 200'); console.log('PASS: Master lockout bypass verified'); })();"
   ```
