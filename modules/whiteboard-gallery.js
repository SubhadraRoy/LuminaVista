// modules/whiteboard-gallery.js - Whiteboard Pro Multi-Board Manager & Blueprint Templates Gallery
// Sovereign Cloud Workspace - LuminaVista OS

(function(window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Built-in Premium Architecture & Workflow Blueprints
  // ---------------------------------------------------------------------------
  const WHITEBOARD_TEMPLATES = [
    {
      id: 'template_microservices',
      category: 'architecture',
      name: 'Microservices & Cloud-Native Mesh',
      description: 'Distributed cloud architecture with API Gateway, OAuth Service, Orders, Payments, Kafka Bus, Redis & Postgres.',
      badge: 'Architecture',
      badgeColor: 'cyan',
      nodes: [
        { id: 'client', type: 'cloud', x: 60, y: 190, w: 150, h: 80, label: 'Client Apps\n(Web & Mobile)', color: '#00f2fe', fill: true },
        { id: 'cdn', type: 'roundedRect', x: 270, y: 190, w: 140, h: 80, label: 'Cloudflare Edge\n& DDoS Shield', color: '#38bdf8', fill: true },
        { id: 'gateway', type: 'diamond', x: 470, y: 170, w: 140, h: 120, label: 'API Gateway\n(Envoy / Rate Limit)', color: '#a855f7', fill: true },
        { id: 'auth', type: 'roundedRect', x: 680, y: 80, w: 160, h: 75, label: 'Auth Service\n(OAuth2 / JWT)', color: '#f43f5e', fill: true },
        { id: 'orders', type: 'roundedRect', x: 680, y: 195, w: 160, h: 75, label: 'Order Service\n(Node.js / Express)', color: '#10b981', fill: true },
        { id: 'payments', type: 'roundedRect', x: 680, y: 310, w: 160, h: 75, label: 'Payment Gateway\n(Stripe Webhooks)', color: '#f59e0b', fill: true },
        { id: 'kafka', type: 'rect', x: 910, y: 195, w: 150, h: 75, label: 'Kafka Event Bus\n(Async Pub/Sub)', color: '#eab308', fill: true },
        { id: 'postgres', type: 'cylinder', x: 1120, y: 185, w: 140, h: 95, label: 'PostgreSQL DB\n(Primary Replica)', color: '#06b6d4', fill: true },
        { id: 'redis', type: 'cylinder', x: 1120, y: 310, w: 140, h: 85, label: 'Redis Cache\n(Distributed L2)', color: '#ec4899', fill: true }
      ],
      connectors: [
        { from: 'client', to: 'cdn', label: 'HTTPS / TLS 1.3', arrow: true, color: '#00f2fe' },
        { from: 'cdn', to: 'gateway', label: 'Origin Reverse Proxy', arrow: true, color: '#38bdf8' },
        { from: 'gateway', to: 'auth', label: 'Validate Token', arrow: true, color: '#f43f5e' },
        { from: 'gateway', to: 'orders', label: 'POST /v1/orders', arrow: true, color: '#10b981' },
        { from: 'gateway', to: 'payments', label: 'POST /v1/checkout', arrow: true, color: '#f59e0b' },
        { from: 'orders', to: 'kafka', label: 'Publish Event', arrow: true, color: '#eab308' },
        { from: 'kafka', to: 'postgres', label: 'CDC Sink', arrow: true, color: '#06b6d4' },
        { from: 'orders', to: 'redis', label: 'Session Cache', arrow: true, color: '#ec4899' }
      ],
      stickies: [
        { x: 270, y: 310, text: 'Perimeter: Cloudflare WAF blocks rate breaches > 120 req/min.', color: '#a5f3fc' },
        { x: 910, y: 80, text: 'Event-driven consistency guarantees zero checkout data loss.', color: '#fef08a' }
      ]
    },
    {
      id: 'template_serverless_ai',
      category: 'ai_cloud',
      name: 'Serverless AI & Vector Pipeline',
      description: 'Zero-latency retrieval augmented generation pipeline with embeddings, Milvus vector store & Firecracker MicroVM inference.',
      badge: 'Cloud & AI',
      badgeColor: 'emerald',
      nodes: [
        { id: 'client', type: 'cloud', x: 80, y: 200, w: 140, h: 80, label: 'User Client\n(Chat UI / CLI)', color: '#00f2fe', fill: true },
        { id: 'edge', type: 'roundedRect', x: 290, y: 200, w: 150, h: 80, label: 'Edge Middleware\n(Vercel Edge / JWT)', color: '#3b82f6', fill: true },
        { id: 'embed', type: 'diamond', x: 510, y: 180, w: 140, h: 120, label: 'Embedding Model\n(nomic-embed-text)', color: '#a855f7', fill: true },
        { id: 'vector', type: 'cylinder', x: 730, y: 100, w: 160, h: 90, label: 'Upstash / Milvus\n(Vector Similarity)', color: '#10b981', fill: true },
        { id: 'microvm', type: 'rect', x: 730, y: 260, w: 160, h: 85, label: 'Firecracker VM\n(Python Code Sandbox)', color: '#f59e0b', fill: true },
        { id: 'llm', type: 'roundedRect', x: 970, y: 195, w: 160, h: 90, label: 'Frontier LLM Pool\n(NIM / Ollama / DeepSeek)', color: '#f43f5e', fill: true }
      ],
      connectors: [
        { from: 'client', to: 'edge', label: 'Streaming SSE', arrow: true, color: '#00f2fe' },
        { from: 'edge', to: 'embed', label: 'Tokenize', arrow: true, color: '#3b82f6' },
        { from: 'embed', to: 'vector', label: 'Cosine Search (Top-K)', arrow: true, color: '#10b981' },
        { from: 'embed', to: 'llm', label: 'Context Injection', arrow: true, color: '#a855f7' },
        { from: 'edge', to: 'microvm', label: 'Run Python Script', arrow: true, color: '#f59e0b' },
        { from: 'microvm', to: 'llm', label: 'Execution Output', arrow: true, color: '#f43f5e' }
      ],
      stickies: [
        { x: 510, y: 340, text: 'RAG Latency SLA: Sub-350ms end-to-end response time.', color: '#a7f3d0' }
      ]
    },
    {
      id: 'template_zero_trust',
      category: 'architecture',
      name: 'Zero-Trust Enclave Security Mesh',
      description: 'Defense-in-depth sovereign architecture with hardware security module, token validation, rate limiters, and isolated enclaves.',
      badge: 'Security',
      badgeColor: 'rose',
      nodes: [
        { id: 'identity', type: 'roundedRect', x: 90, y: 200, w: 150, h: 80, label: 'Identity Provider\n(Google OAuth / WebAuthn)', color: '#f43f5e', fill: true },
        { id: 'guard', type: 'diamond', x: 310, y: 180, w: 140, h: 120, label: 'Sovereign Guard\n(auth-guard.js)', color: '#00f2fe', fill: true },
        { id: 'enclave', type: 'rect', x: 530, y: 200, w: 160, h: 80, label: 'Hardened MicroVM\n(Isolated Rootfs)', color: '#10b981', fill: true },
        { id: 'redis', type: 'cylinder', x: 760, y: 120, w: 150, h: 90, label: 'Encrypted Redis\n(Session Sliding Window)', color: '#ec4899', fill: true },
        { id: 'vault', type: 'cylinder', x: 760, y: 270, w: 150, h: 90, label: 'Secret Key Pool\n(Zero-Leakage Rotator)', color: '#f59e0b', fill: true }
      ],
      connectors: [
        { from: 'identity', to: 'guard', label: 'Signed Token', arrow: true, color: '#f43f5e' },
        { from: 'guard', to: 'enclave', label: 'Ephem Session Auth', arrow: true, color: '#10b981' },
        { from: 'guard', to: 'redis', label: 'Rate-Limit Audit', arrow: true, color: '#ec4899' },
        { from: 'enclave', to: 'vault', label: 'Masked API Fetch', arrow: true, color: '#f59e0b' }
      ],
      stickies: [
        { x: 310, y: 340, text: 'Strict session validation on all state mutations. Zero unauthenticated endpoints.', color: '#fecdd3' }
      ]
    },
    {
      id: 'template_ecommerce_erd',
      category: 'database',
      name: 'Relational Database ERD Schema',
      description: 'Complete entity-relationship data model with primary keys, foreign key constraints, indexes, and cardinality connectors.',
      badge: 'Database ERD',
      badgeColor: 'amber',
      nodes: [
        { id: 'users', type: 'cylinder', x: 90, y: 160, w: 170, h: 110, label: 'users\n───\nPK id (UUID)\nemail (VARCHAR)\nhash (CHAR64)\nrole (ENUM)', color: '#00f2fe', fill: true },
        { id: 'orders', type: 'cylinder', x: 340, y: 160, w: 170, h: 110, label: 'orders\n───\nPK id (UUID)\nFK user_id\ntotal_cents (INT)\nstatus (VARCHAR)', color: '#10b981', fill: true },
        { id: 'order_items', type: 'cylinder', x: 590, y: 160, w: 170, h: 110, label: 'order_items\n───\nPK id (UUID)\nFK order_id\nFK product_id\nquantity (INT)', color: '#f59e0b', fill: true },
        { id: 'products', type: 'cylinder', x: 840, y: 160, w: 170, h: 110, label: 'products\n───\nPK id (UUID)\nsku (VARCHAR)\ntitle (TEXT)\nstock (INT)', color: '#a855f7', fill: true },
        { id: 'payments', type: 'cylinder', x: 340, y: 330, w: 170, h: 110, label: 'payments\n───\nPK id (UUID)\nFK order_id\namount (INT)\nprovider (VARCHAR)', color: '#f43f5e', fill: true }
      ],
      connectors: [
        { from: 'users', to: 'orders', label: '1 ───< N (Places)', arrow: true, color: '#00f2fe' },
        { from: 'orders', to: 'order_items', label: '1 ───< N (Contains)', arrow: true, color: '#10b981' },
        { from: 'products', to: 'order_items', label: '1 ───< N (Included in)', arrow: true, color: '#a855f7' },
        { from: 'orders', to: 'payments', label: '1 ─── 1 (Paid via)', arrow: true, color: '#f43f5e' }
      ],
      stickies: [
        { x: 590, y: 330, text: 'Compound index on (order_id, product_id) prevents duplicate line items.', color: '#fef08a' }
      ]
    },
    {
      id: 'template_oauth_flow',
      category: 'workflows',
      name: 'OAuth 2.0 PKCE Authentication Sequence',
      description: 'Secure authorization code exchange with Proof Key for Code Exchange (PKCE), refresh tokens, and session renewal.',
      badge: 'Sequence Flow',
      badgeColor: 'cyan',
      nodes: [
        { id: 'user', type: 'roundedRect', x: 90, y: 200, w: 150, h: 80, label: 'Browser Client\n(SPA / Mobile)', color: '#00f2fe', fill: true },
        { id: 'auth_server', type: 'roundedRect', x: 360, y: 200, w: 160, h: 80, label: 'Authorization Server\n(Google OAuth2 / OIDC)', color: '#a855f7', fill: true },
        { id: 'backend', type: 'diamond', x: 630, y: 180, w: 140, h: 120, label: 'API Backend\n(/api/auth/callback)', color: '#10b981', fill: true },
        { id: 'resource', type: 'rect', x: 890, y: 200, w: 160, h: 80, label: 'Resource Server\n(Protected Endpoints)', color: '#f59e0b', fill: true }
      ],
      connectors: [
        { from: 'user', to: 'auth_server', label: '1. /auth?challenge=code', arrow: true, color: '#00f2fe' },
        { from: 'auth_server', to: 'user', label: '2. Redirect with auth_code', arrow: true, color: '#a855f7' },
        { from: 'user', to: 'backend', label: '3. Exchange code + verifier', arrow: true, color: '#10b981' },
        { from: 'backend', to: 'auth_server', label: '4. Validate & issue tokens', arrow: true, color: '#a855f7' },
        { from: 'backend', to: 'user', label: '5. Set HttpOnly session cookie', arrow: true, color: '#10b981' },
        { from: 'user', to: 'resource', label: '6. Authenticated API Calls', arrow: true, color: '#f59e0b' }
      ],
      stickies: [
        { x: 360, y: 340, text: 'Tokens stored in strict HttpOnly, SameSite=Strict cookies.', color: '#a5f3fc' }
      ]
    },
    {
      id: 'template_kanban',
      category: 'workflows',
      name: 'Agile Kanban & Sprint Board',
      description: 'Visual 4-lane sprint workflow with stylized category lanes and interactive drag-and-drop sticky notes.',
      badge: 'Agile Strategy',
      badgeColor: 'emerald',
      nodes: [
        { id: 'lane_backlog', type: 'roundedRect', x: 80, y: 100, w: 230, h: 480, label: '📋 SPRINT BACKLOG', color: '#64748b', fill: false },
        { id: 'lane_in_progress', type: 'roundedRect', x: 340, y: 100, w: 230, h: 480, label: '⚡ IN DEVELOPMENT', color: '#00f2fe', fill: false },
        { id: 'lane_review', type: 'roundedRect', x: 600, y: 100, w: 230, h: 480, label: '🔍 CODE REVIEW & QA', color: '#a855f7', fill: false },
        { id: 'lane_done', type: 'roundedRect', x: 860, y: 100, w: 230, h: 480, label: '🚀 SHIPPED / PROD', color: '#10b981', fill: false }
      ],
      connectors: [],
      stickies: [
        { x: 95, y: 150, text: '[Story] Implement Webhook Retry Queue with Exponential Backoff', color: '#fef08a' },
        { x: 95, y: 280, text: '[Tech Debt] Optimize SQLite WAL checkpoint intervals', color: '#fecdd3' },
        { x: 355, y: 150, text: '[Feature] Whiteboard AI Directive Engine & Blueprint Gallery', color: '#a5f3fc' },
        { x: 355, y: 280, text: '[Security] Zero-leak API credential masking proxy', color: '#a7f3d0' },
        { x: 615, y: 150, text: '[PR #418] Mobile gyro 3D card tilt & touch trail physics', color: '#fef08a' },
        { x: 875, y: 150, text: '[Shipped] GitHub Actions CI Node 22 upgrade & JSDOM hardening', color: '#a7f3d0' }
      ]
    },
    {
      id: 'template_mindmap',
      category: 'ai_cloud',
      name: 'Lumina Sovereign OS Brainstorming Mind Map',
      description: 'Radial cognitive thought map linking OS subsystems, AI persona roster, microVM sandboxes, and vector state.',
      badge: 'Mind Map',
      badgeColor: 'rose',
      nodes: [
        { id: 'core', type: 'circle', x: 550, y: 280, w: 180, h: 100, label: 'LUMINA VISTA OS\n(Sovereign Core)', color: '#00f2fe', fill: true },
        { id: 'sub_ai', type: 'roundedRect', x: 180, y: 120, w: 170, h: 70, label: 'Cognitive Matrix\n(Jev System-1)', color: '#a855f7', fill: true },
        { id: 'sub_vm', type: 'roundedRect', x: 850, y: 120, w: 170, h: 70, label: 'Firecracker VM\n(Ephemeral Linux)', color: '#f59e0b', fill: true },
        { id: 'sub_vfs', type: 'roundedRect', x: 180, y: 440, w: 170, h: 70, label: 'Zero-Trust VFS\n(Artifacts Workspace)', color: '#10b981', fill: true },
        { id: 'sub_wb', type: 'roundedRect', x: 850, y: 440, w: 170, h: 70, label: 'Whiteboard Pro\n(AI Visual Studio)', color: '#f43f5e', fill: true }
      ],
      connectors: [
        { from: 'core', to: 'sub_ai', label: 'Intent Routing', arrow: true, color: '#a855f7' },
        { from: 'core', to: 'sub_vm', label: 'Isolated Exec', arrow: true, color: '#f59e0b' },
        { from: 'core', to: 'sub_vfs', label: 'Atomic Sync', arrow: true, color: '#10b981' },
        { from: 'core', to: 'sub_wb', label: 'Visual Synthesis', arrow: true, color: '#f43f5e' }
      ],
      stickies: [
        { x: 540, y: 440, text: 'Core Principle: Private, local-first, zero-trust developer workspace.', color: '#a5f3fc' }
      ]
    }
  ];

  // ---------------------------------------------------------------------------
  // 2. Multi-Board Storage & State Management
  // ---------------------------------------------------------------------------
  const STORAGE_KEY_BOARDS = 'lumina_wb_boards';
  const STORAGE_KEY_ACTIVE_ID = 'lumina_wb_active_board_id';

  function getStoredBoards() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BOARDS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[Whiteboard Gallery] Error reading boards:', e);
    }

    // Default primary board
    const defaultBoard = {
      id: 'board_default',
      name: 'Main Whiteboard',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: null,
      stateDataUrl: localStorage.getItem('lumina_wb_state') || null,
      stickies: window.wbStickies || []
    };
    saveStoredBoards([defaultBoard]);
    return [defaultBoard];
  }

  function saveStoredBoards(boards) {
    try {
      localStorage.setItem(STORAGE_KEY_BOARDS, JSON.stringify(boards));
    } catch (e) {
      console.warn('[Whiteboard Gallery] Error saving boards:', e);
    }
  }

  function getActiveBoardId() {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_ID) || 'board_default';
  }

  function setActiveBoardId(id) {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
    updateBoardSelectorUI();
  }

  function getCurrentActiveBoard() {
    const boards = getStoredBoards();
    const activeId = getActiveBoardId();
    return boards.find(b => b.id === activeId) || boards[0];
  }

  function saveCurrentBoardState(customName = null) {
    const mainCv = document.getElementById('whiteboardCanvas');
    if (!mainCv) return;

    const dataUrl = mainCv.toDataURL('image/png');
    const boards = getStoredBoards();
    const activeId = getActiveBoardId();
    let board = boards.find(b => b.id === activeId);

    if (!board) {
      board = {
        id: activeId,
        name: customName || 'Untitled Board',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        thumbnail: dataUrl,
        stateDataUrl: dataUrl,
        stickies: window.wbStickies || []
      };
      boards.push(board);
    } else {
      if (customName) board.name = customName;
      board.updatedAt = new Date().toISOString();
      board.stateDataUrl = dataUrl;
      board.thumbnail = dataUrl;
      board.stickies = window.wbStickies || [];
    }

    saveStoredBoards(boards);
    localStorage.setItem('lumina_wb_state', dataUrl);
    updateBoardSelectorUI();
  }

  function createNewBoard(name = 'New Board', templateId = null) {
    saveCurrentBoardState();

    const id = 'board_' + Date.now();
    const newBoard = {
      id,
      name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      thumbnail: null,
      stateDataUrl: null,
      stickies: []
    };

    const boards = getStoredBoards();
    boards.unshift(newBoard);
    saveStoredBoards(boards);
    setActiveBoardId(id);

    // Clear canvas
    if (window.clearWhiteboardSilently) {
      window.clearWhiteboardSilently();
    } else if (window.clearWhiteboard) {
      window.clearWhiteboard();
    }

    if (templateId) {
      loadTemplate(templateId, false);
    } else {
      saveCurrentBoardState();
      if (window.showToast) window.showToast('New Board Created', `"${name}" is ready.`);
    }

    updateBoardSelectorUI();
    return newBoard;
  }

  function switchBoard(id) {
    if (id === getActiveBoardId()) return;

    // Save current active state before switching
    saveCurrentBoardState();

    const boards = getStoredBoards();
    const target = boards.find(b => b.id === id);
    if (!target) return;

    setActiveBoardId(id);

    // Clear stickies
    window.wbStickies = [];
    const stickyContainer = document.getElementById('whiteboardStickyContainer');
    if (stickyContainer) stickyContainer.innerHTML = '';

    // Clear canvas
    const mainCv = document.getElementById('whiteboardCanvas');
    const wrap = document.getElementById('whiteboardContainer');
    if (mainCv && wrap) {
      const ctx = mainCv.getContext('2d');
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);

      if (target.stateDataUrl && target.stateDataUrl !== 'data:,') {
        const img = new Image();
        img.src = target.stateDataUrl;
        img.onload = () => {
          ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
          if (window.saveWbState) window.saveWbState();
        };
      }
    }

    // Restore stickies
    if (Array.isArray(target.stickies)) {
      target.stickies.forEach(s => {
        if (window.createStickyNote) {
          window.createStickyNote(s.x, s.y, s.text, s.color);
        }
      });
    }

    if (window.showToast) window.showToast('Switched Board', `Active: "${target.name}"`);
    updateBoardSelectorUI();
  }

  function renameCurrentBoard(newName) {
    if (!newName || !newName.trim()) return;
    const boards = getStoredBoards();
    const activeId = getActiveBoardId();
    const board = boards.find(b => b.id === activeId);
    if (board) {
      board.name = newName.trim();
      board.updatedAt = new Date().toISOString();
      saveStoredBoards(boards);
      updateBoardSelectorUI();
      if (window.showToast) window.showToast('Board Renamed', `Board is now "${board.name}"`);
    }
  }

  function deleteBoard(id) {
    let boards = getStoredBoards();
    if (boards.length <= 1) {
      if (window.showToast) window.showToast('Notice', 'Cannot delete the only remaining board.');
      return;
    }

    boards = boards.filter(b => b.id !== id);
    saveStoredBoards(boards);

    if (id === getActiveBoardId()) {
      setActiveBoardId(boards[0].id);
      switchBoard(boards[0].id);
    } else {
      updateBoardSelectorUI();
    }

    if (window.showToast) window.showToast('Board Removed', 'Selected board was deleted.');
  }

  // ---------------------------------------------------------------------------
  // 3. Template Loader & Renderer
  // ---------------------------------------------------------------------------
  function loadTemplate(templateId, asNewBoard = false) {
    const template = WHITEBOARD_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      console.warn(`[Whiteboard Gallery] Template "${templateId}" not found.`);
      return false;
    }

    if (asNewBoard) {
      createNewBoard(template.name, templateId);
      return true;
    }

    // Render directly into active board
    if (window.LuminaWhiteboard && window.LuminaWhiteboard.drawDiagram) {
      window.LuminaWhiteboard.drawDiagram(template);
    } else {
      renderDiagramDirect(template);
    }

    saveCurrentBoardState(template.name);
    if (window.showToast) window.showToast('Template Loaded', `Blueprint "${template.name}" rendered.`);
    closeGalleryModal();
    return true;
  }

  function renderDiagramDirect(spec) {
    const mainCv = document.getElementById('whiteboardCanvas');
    const wrap = document.getElementById('whiteboardContainer');
    if (!mainCv || !wrap) return;

    const ctx = mainCv.getContext('2d');
    const w = (wrap && wrap.clientWidth) || 1200;
    const h = (wrap && wrap.clientHeight) || 800;

    if (spec.clearFirst !== false) {
      if (ctx) ctx.clearRect(0, 0, w, h);
      window.wbStickies = [];
      const sc = document.getElementById('whiteboardStickyContainer');
      if (sc) sc.innerHTML = '';
    }

    if (ctx) {
      // Render nodes
      if (Array.isArray(spec.nodes)) {
        spec.nodes.forEach(node => {
          drawDiagramNode(ctx, node);
        });
      }

      // Render connectors
      if (Array.isArray(spec.connectors)) {
        const nodeMap = {};
        (spec.nodes || []).forEach(n => { nodeMap[n.id] = n; });

        spec.connectors.forEach(conn => {
          const fromNode = nodeMap[conn.from];
          const toNode = nodeMap[conn.to];
          if (fromNode && toNode) {
            drawDiagramConnector(ctx, fromNode, toNode, conn);
          }
        });
      }
    }

    // Render stickies
    if (Array.isArray(spec.stickies) && window.createStickyNote) {
      spec.stickies.forEach(s => {
        window.createStickyNote(s.x, s.y, s.text, s.color || '#fef08a');
      });
    }

    if (window.saveWbState) window.saveWbState();
  }

  function drawDiagramNode(ctx, node) {
    const { x, y, w, h, type, label, color = '#00f2fe', fill = true } = node;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (fill) {
      ctx.fillStyle = hexToRgba(color, 0.18);
    }

    if (type === 'roundedRect') {
      const r = Math.min(12, w / 4, h / 4);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
      } else if (ctx.rect) {
        ctx.rect(x, y, w, h);
      } else {
        ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      }
      if (fill && ctx.fill) ctx.fill();
      if (ctx.stroke) ctx.stroke();
    } else if (type === 'rect') {
      ctx.beginPath();
      if (ctx.rect) {
        ctx.rect(x, y, w, h);
      } else {
        ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      }
      if (fill && ctx.fill) ctx.fill();
      if (ctx.stroke) ctx.stroke();
    } else if (type === 'diamond') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(cx, y + h);
      ctx.lineTo(x, cy);
      ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (type === 'cylinder') {
      const rx = w / 2;
      const ry = Math.min(16, h / 4);
      const cx = x + rx;
      ctx.beginPath();
      ctx.ellipse(cx, y + ry, rx, ry, 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, y + ry);
      ctx.lineTo(x, y + h - ry);
      ctx.ellipse(cx, y + h - ry, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, y + ry);
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (type === 'cloud') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 3.2;
      ctx.beginPath();
      ctx.arc(cx - r * 0.9, cy, r * 0.7, 0, Math.PI * 2);
      ctx.arc(cx, cy - r * 0.6, r * 0.9, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.9, cy, r * 0.7, 0, Math.PI * 2);
      ctx.arc(cx, cy + r * 0.4, r * 0.8, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (type === 'circle') {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();
    }

    // Label Rendering
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = label.split('\n');
      const lineHeight = 16;
      const startY = y + h / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, idx) => {
        ctx.fillText(line, x + w / 2, startY + idx * lineHeight);
      });
    }

    ctx.restore();
  }

  function drawDiagramConnector(ctx, a, b, conn) {
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;

    ctx.save();
    ctx.strokeStyle = conn.color || '#00f2fe';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (conn.style === 'dashed') ctx.setLineDash([6, 4]);

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);

    if (conn.arrow !== false) {
      const angle = Math.atan2(by - ay, bx - ax);
      const headlen = 10;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - headlen * Math.cos(angle - Math.PI / 6), by - headlen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - headlen * Math.cos(angle + Math.PI / 6), by - headlen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }

    // Connector Text Badge
    if (conn.label) {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const textW = ctx.measureText(conn.label).width;

      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(mx - textW / 2 - 4, my - 8, textW + 8, 16);
      ctx.strokeStyle = conn.color || '#00f2fe';
      ctx.lineWidth = 1;
      ctx.strokeRect(mx - textW / 2 - 4, my - 8, textW + 8, 16);

      ctx.fillStyle = '#f8fafc';
      ctx.fillText(conn.label, mx, my);
    }

    ctx.restore();
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // ---------------------------------------------------------------------------
  // 4. Gallery UI Modal & Dropdown Controller
  // ---------------------------------------------------------------------------
  let activeGalleryCategory = 'all';

  function openGalleryModal(initialTab = 'templates') {
    const modal = document.getElementById('whiteboardGalleryModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (initialTab === 'boards') {
      switchGalleryTab('boards');
    } else {
      switchGalleryTab('templates');
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeGalleryModal() {
    const modal = document.getElementById('whiteboardGalleryModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function switchGalleryTab(tab) {
    const tabTemplatesBtn = document.getElementById('galleryTabTemplatesBtn');
    const tabBoardsBtn = document.getElementById('galleryTabBoardsBtn');
    const viewTemplates = document.getElementById('galleryTemplatesView');
    const viewBoards = document.getElementById('galleryBoardsView');

    if (tab === 'boards') {
      if (tabBoardsBtn) tabBoardsBtn.className = 'px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-400 font-heading font-semibold text-xs border border-cyan-500/30 cursor-pointer';
      if (tabTemplatesBtn) tabTemplatesBtn.className = 'px-4 py-2 rounded-xl text-zinc-400 hover:text-white font-heading font-semibold text-xs cursor-pointer';
      if (viewBoards) viewBoards.classList.remove('hidden');
      if (viewTemplates) viewTemplates.classList.add('hidden');
      renderBoardsGalleryList();
    } else {
      if (tabTemplatesBtn) tabTemplatesBtn.className = 'px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-400 font-heading font-semibold text-xs border border-cyan-500/30 cursor-pointer';
      if (tabBoardsBtn) tabBoardsBtn.className = 'px-4 py-2 rounded-xl text-zinc-400 hover:text-white font-heading font-semibold text-xs cursor-pointer';
      if (viewTemplates) viewTemplates.classList.remove('hidden');
      if (viewBoards) viewBoards.classList.add('hidden');
      renderTemplatesGalleryList(activeGalleryCategory);
    }
  }

  function filterTemplatesByCategory(category) {
    activeGalleryCategory = category;
    const chips = document.querySelectorAll('.gallery-category-chip');
    chips.forEach(chip => {
      const cat = chip.getAttribute('data-category');
      if (cat === category) {
        chip.className = 'gallery-category-chip px-3 py-1.5 rounded-lg text-xs font-mono bg-cyan-500 text-black font-bold cursor-pointer';
      } else {
        chip.className = 'gallery-category-chip px-3 py-1.5 rounded-lg text-xs font-mono bg-surface-900 text-zinc-400 hover:text-white border border-white/10 cursor-pointer';
      }
    });
    renderTemplatesGalleryList(category);
  }

  function renderTemplatesGalleryList(category = 'all') {
    const container = document.getElementById('galleryTemplatesGrid');
    if (!container) return;

    const list = category === 'all'
      ? WHITEBOARD_TEMPLATES
      : WHITEBOARD_TEMPLATES.filter(t => t.category === category);

    container.innerHTML = list.map(t => {
      return `
        <div class="glass-card p-4 rounded-xl border border-white/10 hover:border-cyan-500/40 transition-all flex flex-col justify-between group">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-${t.badgeColor}-500/10 text-${t.badgeColor}-400 border border-${t.badgeColor}-500/20">${t.badge}</span>
              <span class="text-[11px] font-mono text-zinc-500">${(t.nodes || []).length} nodes</span>
            </div>
            <h4 class="font-heading font-bold text-sm text-white group-hover:text-cyan-400 transition-colors">${t.name}</h4>
            <p class="text-xs text-zinc-400 mt-1 leading-relaxed">${t.description}</p>
          </div>
          <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <button onclick="LuminaWhiteboardGallery.loadTemplate('${t.id}', true)" class="px-2.5 py-1.5 rounded-lg bg-surface-900 hover:bg-surface-850 text-zinc-300 text-xs font-mono border border-white/10 cursor-pointer transition-colors" title="Open as a brand new whiteboard">
              + New Board
            </button>
            <button onclick="LuminaWhiteboardGallery.loadTemplate('${t.id}', false)" class="btn-gradient px-3.5 py-1.5 rounded-lg text-xs font-bold text-black cursor-pointer shadow-md flex items-center gap-1.5">
              <i data-lucide="layout" class="w-3.5 h-3.5"></i> Insert Template
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function renderBoardsGalleryList() {
    const container = document.getElementById('galleryBoardsGrid');
    if (!container) return;

    const boards = getStoredBoards();
    const activeId = getActiveBoardId();

    container.innerHTML = boards.map(b => {
      const isActive = b.id === activeId;
      const dateStr = b.updatedAt ? new Date(b.updatedAt).toLocaleDateString() : 'Recent';
      return `
        <div class="glass-card p-4 rounded-xl border ${isActive ? 'border-cyan-400 bg-cyan-500/5' : 'border-white/10'} hover:border-cyan-500/40 transition-all flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${isActive ? 'bg-cyan-500 text-black' : 'bg-surface-900 text-zinc-400'}">${isActive ? 'ACTIVE' : 'SAVED'}</span>
              <span class="text-[11px] font-mono text-zinc-500">${dateStr}</span>
            </div>
            <h4 class="font-heading font-bold text-sm text-white">${escapeHtml(b.name)}</h4>
            <p class="text-xs text-zinc-400 mt-1">${(b.stickies || []).length} sticky note(s)</p>
          </div>
          <div class="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1">
              <button onclick="LuminaWhiteboardGallery.promptRenameBoard('${b.id}')" class="p-1.5 rounded bg-surface-900 hover:bg-surface-850 text-zinc-400 hover:text-white cursor-pointer" title="Rename"><i data-lucide="edit-2" class="w-3.5 h-3.5"></i></button>
              ${boards.length > 1 ? `<button onclick="LuminaWhiteboardGallery.deleteBoard('${b.id}')" class="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>` : ''}
            </div>
            ${isActive ? `<span class="text-xs font-mono text-cyan-400 font-semibold">Loaded</span>` : `<button onclick="LuminaWhiteboardGallery.switchBoard('${b.id}'); LuminaWhiteboardGallery.closeGalleryModal();" class="px-3 py-1.5 rounded-lg bg-cyan-500 text-black font-bold text-xs cursor-pointer shadow-md">Open Board</button>`}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function promptNewBoard() {
    const name = window.prompt('Enter new whiteboard name:', 'Architecture Blueprint');
    if (name) {
      createNewBoard(name);
      closeGalleryModal();
    }
  }

  function promptRenameBoard(id) {
    const boards = getStoredBoards();
    const board = boards.find(b => b.id === id);
    if (!board) return;
    const newName = window.prompt('Rename whiteboard:', board.name);
    if (newName && newName.trim()) {
      board.name = newName.trim();
      saveStoredBoards(boards);
      updateBoardSelectorUI();
      renderBoardsGalleryList();
    }
  }

  function updateBoardSelectorUI() {
    const selector = document.getElementById('wbBoardSelector');
    if (!selector) return;

    const boards = getStoredBoards();
    const activeId = getActiveBoardId();

    selector.innerHTML = boards.map(b => {
      return `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${escapeHtml(b.name)}</option>`;
    }).join('');

    const titleEl = document.getElementById('wbActiveBoardTitle');
    if (titleEl) {
      const active = boards.find(b => b.id === activeId);
      titleEl.textContent = active ? active.name : 'Main Whiteboard';
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------------------------------------------------------------------
  // 5. Global Export Namespace
  // ---------------------------------------------------------------------------
  window.LuminaWhiteboardGallery = {
    templates: WHITEBOARD_TEMPLATES,
    getStoredBoards,
    saveStoredBoards,
    getActiveBoardId,
    getCurrentActiveBoard,
    saveCurrentBoardState,
    createNewBoard,
    switchBoard,
    renameCurrentBoard,
    deleteBoard,
    loadTemplate,
    renderDiagramDirect,
    openGalleryModal,
    closeGalleryModal,
    switchGalleryTab,
    filterTemplatesByCategory,
    promptNewBoard,
    promptRenameBoard,
    updateBoardSelectorUI
  };

  // Lifecycle initialization hook
  document.addEventListener('DOMContentLoaded', () => {
    updateBoardSelectorUI();
  });

})(typeof window !== 'undefined' ? window : global);
