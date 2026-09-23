# LuminaVista OS — Architectural Blueprint & System Specifications

**Version:** 14.0.0 (Enterprise Sovereign Cloud OS)  
**Architecture:** Serverless Edge (Vercel) + Client-Side SPA + Ephemeral Linux MicroVMs (E2B) + Upstash Redis  
**Security Standard:** Zero-Trust Authorization (`godx_session`), Timing-Safe SHA-256 Auth, 15-Minute Idle Inactivity Lock  

---

## 1. System Topology & Edge Routing

LuminaVista OS combines edge middleware routing, zero-trust serverless backend functions, and a modular client-side single page application (SPA).

```
[ Client Browser ]
        │
        ├───► [ /index.html ] ────────► Biometric / Passphrase Security Gateway
        │          │
        │          ▼ (POST /api/auth)
        │     Sets HttpOnly, SameSite=Strict `godx_session` Cookie
        │
        └───► [ /dashboard.html ] ────► Guarded by Edge Middleware (`middleware.js`)
                   │
                   ▼ (Zero-Trust Session Guard: `api/_lib/auth-guard.js`)
          ┌────────┴────────┬────────────────┬────────────────┬──────────────┐
          ▼                 ▼                ▼                ▼              ▼
     /api/chat        /api/compile     /api/terminal     /api/storage    /api/sync
    (AI Engine)      (Code Sandbox)   (Linux MicroVM)    (GitHub VFS)   (Redis State)
```

---

## 2. Directory & Component Layout

```
LuminaVista/
├── .github/                 # Automated CI/CD workflows and community issue templates
│   ├── workflows/           # GitHub Actions test and lint pipelines
│   └── ISSUE_TEMPLATE/      # Bug reports and feature request templates
├── api/                     # Vercel serverless API functions
│   ├── _lib/                # Shared utilities
│   │   ├── auth-guard.js    # Zero-trust session validation, sliding rate-limits, error sanitizer
│   │   └── redis.js         # Upstash Redis client singleton
│   ├── auth.js              # Constant-time password verification & session issuance
│   ├── chat.js              # Autonomous AI agent dispatch & tool loop
│   ├── compile.js           # Multi-language code compiler via E2B sandbox
│   ├── logout.js            # Session revocation & cookie invalidation
│   ├── storage.js           # GitHub Virtual File System (VFS) synchronization
│   ├── sync.js              # Workspace state persistence in Redis
│   ├── terminal.js          # Linux Firecracker microVM execution engine
│   └── worker.js            # Asynchronous background job worker
├── docs/                    # Technical architecture, security policy, and deployment guides
│   ├── ARCHITECTURE.md      # Detailed system blueprints and specifications
│   ├── DEPLOYMENT.md        # Production environment variable and deployment guide
│   └── SECURITY.md          # 10-persona audit findings and security standards
├── EXM/                     # Interactive workspace projects (19 showcase modules)
├── modules/                 # Modular client-side subsystems
│   ├── ai-studio.js         # Autonomous agent interface, tool loop, simulation sandbox
│   ├── codespace.js         # Artifacts IDE, file tree, code editor, and live DOM preview
│   ├── compiler.js          # Compilers & SQL workbench frontend
│   ├── dashboard.js         # Master bootstrapper and lifecycle manager
│   ├── notes.js             # Markdown note vault with bidirectional checkbox sync
│   ├── projects.js          # Projects explorer & repository showcase inspector
│   ├── sidebar.js           # Responsive sidebar resizer and minimization controller
│   ├── state.js             # Centralized in-memory reactive state manager
│   ├── system.js            # Navigation, command palette, 15m idle auto-lock, and clock
│   ├── telemetry-theme.js   # Waveform canvas visualizer & theme switcher
│   ├── terminal.js          # Quantum Terminal emulator & directive dispatcher
│   └── whiteboard.js        # High-DPI canvas whiteboard with shapes, sticky notes & export
├── tests/                   # Automated quality gates and test runners
│   ├── browser-cdp-test.cjs # Real Google Chrome CDP headless browser test runner
│   ├── features.test.cjs    # DOM integration and security unit test suite
│   └── server.cjs           # Local mock development and test server
├── dashboard.html           # Sovereign OS desktop application interface
├── diagram.png              # System architecture showcase diagram
├── index.html               # Biometric security node & entry gateway
├── LICENSE                  # MIT Open-Source License
├── middleware.js            # Edge middleware guarding /dashboard.html
├── package.json             # Manifest, dependencies, and lifecycle scripts
├── personas.js              # 22 enterprise specialized technical personas
└── vercel.json              # CSP headers, HSTS, CORS boundaries, and routing
```

---

## 3. Environment Variables & Credentials Wiring

Configure these variables in your Vercel Project Settings:

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `ADMIN_PASSWORD` | **YES** | Master administrator passphrase validated via constant-time SHA-256 comparison. |
| `UPSTASH_REDIS_REST_URL` | **YES** | HTTPS endpoint for Upstash Redis database (session cache and rate-limiting). |
| `UPSTASH_REDIS_REST_TOKEN` | **YES** | Bearer authentication token for Upstash Redis. |
| `OLLAMA_ENDPOINT` | **YES** | Upstream LLM gateway endpoint (e.g., OpenRouter, native Ollama). |
| `OLLAMA_API_KEY` | **YES** | Upstream LLM provider authentication key. Kept strictly on server. |
| `E2B_API_KEY` | Optional | API token for `e2b.dev` to launch on-demand Firecracker Linux microVMs. |
| `GITHUB_STORAGE_TOKEN` | Optional | GitHub Personal Access Token (classic) with `repo` scope for VFS sync. |
| `GITHUB_STORAGE_REPO` | Optional | Target repository for persistent cloud storage (`User/Repo`). |

---

## 4. Client-Side Local Storage Schema

| Key | Scope | Content |
| :--- | :--- | :--- |
| `godx_session` | Cookie | Secure, HttpOnly, SameSite=Strict UUID session token (TTL: 20 minutes). |
| `lumina_godx_user` | `sessionStorage` | Administrator username display string. |
| `lumina_codespace_vfs` | `localStorage` | JSON object containing the live virtual file system tree. |
| `lumina_ai_history` | `localStorage` | Conversation history thread maintaining AI context window. |
| `lumina_ai_model` | `localStorage` | Active model selection (e.g., `gpt-oss:20b`, `gpt-oss:120b`). |
| `lumina_ai_persona` | `localStorage` | Selected persona ID from the 22-persona roster. |
| `lumina_theme` | `localStorage` | Active visual theme (`cyan`, `emerald`, `amber`, `rose`). |
| `lumina_godx_multi_notes` | `localStorage` | Notes vault documents and markdown content. |

---

## 5. Security & Quality Assurance

- **Unit & Integration Suite (`npm test`)**: 102/102 assertions verifying DOM presence, canvas rendering, Markdown parsing, autonomous agent tool parsing, and security guards.
- **Headless Chrome Browser Suite (`npm run test:browser`)**: 24/24 browser assertions verifying real Chrome rendering, tab switching, and zero console errors.
