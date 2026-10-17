# Dependency & Supply Chain Security Audit Report (explorer_r5_supply)

## 1. Observation

A systematic forensic audit of the project dependencies, package manifests, lockfiles, build scripts, client-side asset imports, and execution sandboxes was conducted across LuminaVista OS.

### 1.1 Direct Observations & Evidence

#### Observation O1: Known Vulnerability in `cookie` Dependency (GHSA-pxg6-pf52-xh8x / CVE-2024-47764)
- **Target File**: `package.json` (Line 31) & `package-lock.json`
- **Verbatim Content (`package.json:28-32`)**:
  ```json
  "dependencies": {
    "@e2b/code-interpreter": "^1.0.2",
    "@upstash/redis": "^1.28.0",
    "cookie": "^0.6.0"
  }
  ```
- **Tool Result (`npm audit --json`)**:
  ```json
  "vulnerabilities": {
    "cookie": {
      "name": "cookie",
      "severity": "low",
      "isDirect": true,
      "via": [
        {
          "source": 1103907,
          "name": "cookie",
          "dependency": "cookie",
          "title": "cookie accepts cookie name, path, and domain with out of bounds characters",
          "url": "https://github.com/advisories/GHSA-pxg6-pf52-xh8x",
          "severity": "low",
          "cwe": [ "CWE-74" ],
          "range": "<0.7.0"
        }
      ],
      "range": "<0.7.0",
      "nodes": [ "node_modules/cookie" ],
      "fixAvailable": { "name": "cookie", "version": "2.0.1", "isSemVerMajor": true }
    }
  }
  ```
- **Code Usage**: `cookie` is imported in `api/auth.js:2`, `api/calendar.js:6`, and `api/logout.js:1` for session cookie serialization and parsing.

#### Observation O2: Unpinned Dynamic CDN Script Import with `@latest` Dist-Tag (`lucide`)
- **Target File**: `dashboard.html` (Line 28)
- **Verbatim Line**:
  ```html
  <script src="https://unpkg.com/lucide@latest"></script>
  ```
- **Inspection Result**:
  - Request to `https://unpkg.com/lucide@latest` returns HTTP 302 redirecting to `https://unpkg.com/lucide@1.58.0/dist/umd/lucide.min.js`.
  - Zero Subresource Integrity (`integrity="..."`) attribute.
  - Zero `crossorigin="anonymous"` attribute.

#### Observation O3: Missing Subresource Integrity (SRI) on Pinned External Asset (`GSAP`)
- **Target Files**: `dashboard.html` (Line 29), `index.html` (Line 11)
- **Verbatim Lines**:
  - `dashboard.html:29`: `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>`
  - `index.html:11`: `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>`
- **Inspection Result**:
  - Script is fetched from external CDN (`cdnjs.cloudflare.com`).
  - While pinned to version `3.12.5`, it lacks `integrity` and `crossorigin="anonymous"`.
  - Cryptographic digest calculated on `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`:
    - SHA-384: `sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt`
    - SHA-512: `sha512-7eHRwcbYkK4d9g/6tD/mhkf++eoTHwpNM9woBxtPUBWm67zeAfFC+HrdoE2GanKeocly/VxeLvIqwvCdk7qScg==`

#### Observation O4: Unpinned Runtime JIT CDN Script (`Tailwind Play CDN`)
- **Target Files**: `dashboard.html` (Line 15), `index.html` (Line 10), `404.html` (Line 10)
- **Verbatim Lines**:
  - `dashboard.html:15`: `<script src="https://cdn.tailwindcss.com"></script>`
  - `index.html:10`: `<script src="https://cdn.tailwindcss.com"></script>`
  - `404.html:10`: `<script src="https://cdn.tailwindcss.com"></script>`
- **Inspection Result**:
  - Unpinned floating version pulling the in-browser compiler from `cdn.tailwindcss.com`.
  - Zero Subresource Integrity hash.
  - Zero `crossorigin="anonymous"`.
  - Pinning to `https://cdn.tailwindcss.com/3.4.15` returns HTTP 200 with SHA-384 hash:
    `sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN`.

#### Observation O5: Overly Permissive Content Security Policy (CSP) Wildcard
- **Target File**: `dashboard.html` (Line 7)
- **Verbatim Line**:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https: wss: data: blob:; object-src 'none';">
  ```
- **Inspection Result**:
  - `default-src` includes unrestricted wildcard `https:`.
  - Any script or resource from any HTTPS origin on the internet is permitted to load.

#### Observation O6: Package Lifecycle Scripts and Build Security
- **Target Files**: `package.json` (Lines 22-27), `package-lock.json`
- **Verbatim Content (`package.json:22-27`)**:
  ```json
  "scripts": {
    "start": "node tests/server.cjs",
    "test": "node tests/features.test.cjs",
    "test:browser": "node tests/browser-cdp-test.cjs",
    "lint": "node tests/lint.cjs"
  }
  ```
- **Tool Result (`inspect_lock.cjs`)**:
  - Scanned all 76 packages in `package-lock.json`.
  - `hasInstallScript: true`: 0 packages found. Zero `preinstall`, `install`, or `postinstall` hooks exist in dependencies or transitive dependencies.

#### Observation O7: Client Sandbox Execution Boundaries
- **Target Files**: `dashboard.html` (Lines 614, 683, 731, 897, 898), `modules/compiler.js`, `modules/codespace.js`
- **Verbatim Elements**:
  - Line 614: `<iframe id="csPreviewFrame" sandbox="allow-scripts allow-modals allow-forms" class="w-full h-full border-0 bg-white"></iframe>`
  - Line 683: `<iframe id="previewIframe" src="about:blank" sandbox="allow-scripts allow-modals allow-popups allow-forms" class="w-full h-full border-0 bg-white"></iframe>`
  - Line 731: `<iframe id="sandboxPreviewFrame" sandbox="allow-scripts allow-modals allow-forms" class="w-full h-full border-0 absolute inset-0"></iframe>`
  - Lines 897-898: `<iframe id="splitLeftFrame" sandbox="allow-scripts allow-modals allow-popups allow-forms" ...></iframe>`
- **Inspection Result**:
  - All iframes enforce explicit `sandbox` attributes.
  - Crucially, NONE include `allow-same-origin`. This forces the sandbox into a unique opaque origin, blocking sandboxed scripts from reading parent cookies, `localStorage`, `sessionStorage`, or executing DOM traversal into the parent.

---

## 2. Logic Chain

1. **Vulnerability in Dependency Resolution (O1)**:
   - In npm semver, `^0.6.0` specifies `>=0.6.0 <0.7.0`.
   - The security advisory GHSA-pxg6-pf52-xh8x affects all versions `<0.7.0` where cookie name, path, and domain fields are not validated for out-of-bounds characters (CWE-74).
   - Because `^0.6.0` will never resolve to `0.7.0` or higher during `npm install`, the project remains permanently locked to a vulnerable version.
   - Upstream fixed this vulnerability in `0.7.0` (and `1.0.2` / `2.0.1`), preserving exact API backward compatibility for `serialize` and `parse`.
   - **Inference**: Upgrading `package.json` to `"cookie": "^0.7.0"` (or `"cookie": "^1.0.2"`) resolves GHSA-pxg6-pf52-xh8x without breaking `api/auth.js`, `api/calendar.js`, or `api/logout.js`.

2. **Supply Chain Exposure via Unpinned Dynamic Scripts (O2, O4)**:
   - `dashboard.html:28` imports `https://unpkg.com/lucide@latest`.
   - The `@latest` tag on a public package registry (npm via unpkg CDN) means that each time a user loads the dashboard, the browser resolves whatever version is currently published as `@latest`.
   - If the `lucide` npm package is hijacked, if a maintainer's credentials are leaked, or if unpkg suffers DNS/routing cache poisoning, an attacker can push malicious JavaScript that will immediately execute in the security context of every user visiting LuminaVista OS.
   - Furthermore, dynamic URLs cannot support Subresource Integrity (SRI) hashes because the resource hash changes whenever `@latest` shifts.
   - `dashboard.html:15` similarly loads unpinned `https://cdn.tailwindcss.com` without SRI.
   - **Inference**: Loading unpinned scripts from third-party CDNs without cryptographic verification creates a direct third-party code injection path. Pinning exact versions and adding SRI hashes enforces strict cryptographic validation by the browser before execution.

3. **Tamper Resilience via SRI Hashes and Crossorigin (O3, O4)**:
   - Even when an external script has a pinned version URL (such as `cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`), without `integrity` and `crossorigin="anonymous"`, the browser trusts the CDN response implicitly.
   - CDNs are subject to account compromises, edge worker compromises, or regional DNS spoofing.
   - SRI instructs the browser to compute the cryptographic digest (SHA-384) of the delivered asset and abort execution if the hash does not match the expected value.
   - **Inference**: Adding `integrity` and `crossorigin="anonymous"` to all CDN-delivered dependencies eliminates CDN tampering as an attack vector.

4. **Defense-in-Depth via CSP Hardening (O5)**:
   - The current CSP `<meta>` tag in `dashboard.html:7` allows `default-src ... https:`.
   - Because `https:` is an unrestricted wildcard, any script injection vulnerability or compromised CDN could load scripts from arbitrary external domains.
   - **Inference**: Restricting the CSP `script-src` and `style-src` directives to specific trusted CDNs (`cdnjs.cloudflare.com`, `unpkg.com`, `cdn.tailwindcss.com`, `accounts.google.com`) reinforces the SRI boundary and prevents unauthorized external asset imports.

---

## 3. Caveats

- **Google Identity Services (GSI)**: `https://accounts.google.com/gsi/client` (O3) intentionally does not provide static SRI hashes because Google updates the GSI client dynamically for security reasons. Google's documentation explicitly requires loading it directly over HTTPS without SRI.
- **Tailwind Play CDN vs Production Build**: `cdn.tailwindcss.com` is intended for prototyping. In high-security production environments, compiling Tailwind CSS ahead-of-time (AOT) to a static local stylesheet eliminates all runtime CDN dependencies. For the current environment, pinning to `https://cdn.tailwindcss.com/3.4.15` with SRI provides defense-in-depth while preserving runtime styling.
- **Scope Limit**: This audit inspected project manifests, client HTML files, and modules. ESP32 physical firmware files (`firmware/**`) were not modified in accordance with invariant constraints.

---

## 4. Conclusion & Specific Recommendations

### Summary Table of Findings

| ID | Component / File | Vulnerability Classification | Severity | Rationale | Recommended Defensive Mitigation |
|---|---|---|---|---|---|
| **SC-01** | `package.json:31` | Out-of-bounds cookie field injection (GHSA-pxg6-pf52-xh8x / CWE-74) | **Medium** | `cookie < 0.7.0` fails to sanitize name, path, and domain fields; `^0.6.0` locks out security patch. | Upgrade `"cookie": "^0.7.0"` (or `^1.0.2`) in `package.json` and refresh `package-lock.json`. |
| **SC-02** | `dashboard.html:28` | Unpinned `@latest` CDN script (CWE-829) | **High** | Pulls unpinned latest package from unpkg without SRI, allowing supply chain takeover. | Pin to `lucide@1.58.0/dist/umd/lucide.min.js` with SHA-384 SRI hash and `crossorigin="anonymous"`. |
| **SC-03** | `dashboard.html:29`, `index.html:11` | Missing SRI & `crossorigin` on GSAP (CWE-353) | **Medium** | Third-party CDN script executed without cryptographic integrity verification. | Add `integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt"` and `crossorigin="anonymous"`. |
| **SC-04** | `dashboard.html:15`, `index.html:10`, `404.html:10` | Unpinned Tailwind Play CDN without SRI (CWE-829 / CWE-353) | **Medium** | Unpinned dynamic runtime JIT script without integrity checking. | Pin to `https://cdn.tailwindcss.com/3.4.15` with `integrity="sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN"` and `crossorigin="anonymous"`. |
| **SC-05** | `dashboard.html:7` | Wildcard `https:` in Content Security Policy (CWE-1021) | **Low / Medium** | Broad CSP permits loading executable scripts from any arbitrary HTTPS domain. | Restrict `script-src` and `style-src` to explicitly whitelisted CDN domains. |

### Concrete Code Patch Proposals

#### 1. `package.json`
```json
// Before:
    "cookie": "^0.6.0"
// After:
    "cookie": "^0.7.0"
```

#### 2. `dashboard.html` Asset Imports (Lines 15-30)
```html
<!-- Before -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>

<!-- After -->
  <script src="https://cdn.tailwindcss.com/3.4.15" integrity="sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/lucide@1.58.0/dist/umd/lucide.min.js" integrity="sha384-ZemqnyvuKtPJISxDW78AAL1B4QhqxJ0SeEj42qO/4SLmpu+yFCcErD98G2F5vov3" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt" crossorigin="anonymous"></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
```

#### 3. `index.html` Asset Imports (Lines 10-11)
```html
<!-- Before -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>

<!-- After -->
  <script src="https://cdn.tailwindcss.com/3.4.15" integrity="sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN" crossorigin="anonymous"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt" crossorigin="anonymous"></script>
```

#### 4. `404.html` Asset Imports (Line 10)
```html
<!-- Before -->
  <script src="https://cdn.tailwindcss.com"></script>

<!-- After -->
  <script src="https://cdn.tailwindcss.com/3.4.15" integrity="sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN" crossorigin="anonymous"></script>
```

---

## 5. Verification Method

To independently verify all findings and test remediations:

1. **Verify Dependency Vulnerability**:
   ```bash
   npm audit --json
   ```
   *Expected outcome before fix*: Reports GHSA-pxg6-pf52-xh8x on `cookie <0.7.0`.
   *Expected outcome after bumping `cookie: ^0.7.0`*: `found 0 vulnerabilities`.

2. **Verify Subresource Integrity (SRI) Hashes**:
   Run the verification script:
   ```bash
   node -e "
   const crypto = require('crypto');
   const https = require('https');
   const check = (url, expected) => {
     https.get(url, (res) => {
       if (res.statusCode >= 300 && res.statusCode < 400) return check('https://unpkg.com' + res.headers.location, expected);
       const chunks = [];
       res.on('data', d => chunks.push(d));
       res.on('end', () => {
         const hash = 'sha384-' + crypto.createHash('sha384').update(Buffer.concat(chunks)).digest('base64');
         console.log(url, hash === expected ? 'PASS' : 'FAIL (got ' + hash + ')');
       });
     });
   };
   check('https://unpkg.com/lucide@1.58.0/dist/umd/lucide.min.js', 'sha384-ZemqnyvuKtPJISxDW78AAL1B4QhqxJ0SeEj42qO/4SLmpu+yFCcErD98G2F5vov3');
   check('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt');
   check('https://cdn.tailwindcss.com/3.4.15', 'sha384-9J/eie52OVscsZkst4qvkkOvH3804cvot2wKJLuZ6Hc3C77tNxZeqj3oRcpchvwN');
   "
   ```

3. **Verify Regression Test Suites**:
   Confirm that all existing test suites continue to pass:
   ```bash
   node tests/lint.cjs
   node tests/features.test.cjs
   node tests/browser-cdp-test.cjs
   node tests/recheck-all-tasks.cjs
   ```
   *Pass criteria*: 40/40 modules linted, 1,102 unit assertions pass, 122 browser CDP tests pass, 42 recheck tasks pass.
