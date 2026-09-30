// modules/graphify.js - Interactive Project Architecture & Dependency Visualizer for LuminaVista OS
(function(window) {
  'use strict';

  // Category Color Map & Metadata
  const CATEGORIES = {
    frontend: { label: 'Frontend Core', color: '#00f2fe', bg: 'rgba(0, 242, 254, 0.15)', border: '#00f2fe' },
    ai: { label: 'AI & Inference', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.15)', border: '#818cf8' },
    api: { label: 'Serverless APIs', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981' },
    security: { label: 'Security & Auth', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)', border: '#f43f5e' },
    runtime: { label: 'Sandboxes & Runtimes', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: '#c084fc' },
    workspace: { label: 'Workspaces & Tools', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24' },
    tests: { label: 'Testing & QA', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8' },
    vfs: { label: 'User VFS Files', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.15)', border: '#2dd4bf' }
  };

  // Base Architecture Graph Definition
  const BASE_NODES = [
    // Frontend Core
    { id: 'dashboard.html', label: 'dashboard.html', cat: 'frontend', type: 'HTML/Shell', loc: 1530, size: '84 KB', desc: 'Main LuminaVista OS desktop, tabbed workspaces, top system bar, and dialog modals.' },
    { id: 'index.html', label: 'index.html', cat: 'frontend', type: 'Landing Page', loc: 420, size: '36 KB', desc: 'Marketing landing page showcasing features, live preview, and quick launch.' },
    { id: 'modules/sidebar.js', label: 'sidebar.js', cat: 'frontend', type: 'Navigation Core', loc: 320, size: '14 KB', desc: 'Responsive off-canvas sidebar drawer, workspace switcher, and mobile drawer controls.' },
    { id: 'modules/system.js', label: 'system.js', cat: 'frontend', type: 'System Core', loc: 430, size: '15 KB', desc: 'Command palette (Ctrl+K), zero-trust cryptographic lock screen, and system clock.' },
    { id: 'modules/state.js', label: 'state.js', cat: 'frontend', type: 'State Bus', loc: 210, size: '9 KB', desc: 'Central reactive state store, active tab routing, and session state persistence.' },

    // AI & Inference Engine
    { id: 'modules/ai-studio.js', label: 'ai-studio.js', cat: 'ai', type: 'Core Orchestrator', loc: 1363, size: '64 KB', desc: 'Autonomous AI Studio core orchestrator, Jev intent classifier, provider settings, and tool execution protocol.' },
    { id: 'modules/ai-simulation.js', label: 'ai-simulation.js', cat: 'ai', type: 'Simulation Engine', loc: 1225, size: '58 KB', desc: 'Client-side autonomous agent simulation sandbox, chaos engineering drill generator, and offline tool execution.' },
    { id: 'modules/ai-tasks-sessions.js', label: 'ai-tasks-sessions.js', cat: 'ai', type: 'Task & Session Core', loc: 550, size: '24 KB', desc: 'Multi-session conversation history, scheduled autonomous background tasks, and cloud worker synchronization.' },
    { id: 'personas.js', label: 'personas.js', cat: 'ai', type: 'Persona Orchestrator', loc: 357, size: '15 KB', desc: 'Master orchestrator aggregating 1,813+ specialist persona directives across 35 categories and 13 modular domain files.' },
    { id: 'modules/personas/general.js', label: 'personas/general.js', cat: 'ai', type: 'Persona Domain', loc: 967, size: '48 KB', desc: '105 General, Cognitive Mentors, and Everyday Life Assistant personas.' },
    { id: 'modules/personas/software-eng.js', label: 'personas/software-eng.js', cat: 'ai', type: 'Persona Domain', loc: 940, size: '47 KB', desc: '102 Software Engineering & Programming Language Specialist personas.' },
    { id: 'modules/personas/ai-data.js', label: 'personas/ai-data.js', cat: 'ai', type: 'Persona Domain', loc: 940, size: '47 KB', desc: '102 Artificial Intelligence, Deep Learning & Data Science personas.' },
    { id: 'modules/personas/devops-security.js', label: 'personas/devops-security.js', cat: 'ai', type: 'Persona Domain', loc: 940, size: '47 KB', desc: '102 DevOps, Cloud SRE & Cybersecurity Specialist personas.' },
    { id: 'api/_lib/jev-engine.js', label: 'jev-engine.js', cat: 'ai', type: 'S1 Decision Layer', loc: 1476, size: '70 KB', desc: 'TypeSafe Jev Ultra Cognitive Matrix v4.0 with sub-1.5ms decision routing, 50+ domain semantic ontology, DAG planning, and typed judgments.' },
    { id: 'api/_lib/jev/jev-tensor.js', label: 'jev-tensor.js', cat: 'ai', type: 'Semantic Matrix', loc: 237, size: '12 KB', desc: '50+ domain semantic vector tensor and calibrated confidence scoring.' },
    { id: 'api/_lib/jev/jev-dag.js', label: 'jev-dag.js', cat: 'ai', type: 'DAG Synthesizer', loc: 109, size: '6 KB', desc: 'Dynamic tool execution graph generator with node dependencies and rollback policies.' },
    { id: 'api/_lib/jev/jev-ask.js', label: 'jev-ask.js', cat: 'ai', type: 'Typed Decisions', loc: 167, size: '8 KB', desc: 'High-speed typed evaluation suite supporting noul, choice, score, rank, and gate.' },

    // Serverless APIs
    { id: 'api/chat.js', label: 'api/chat.js', cat: 'api', type: 'Serverless API', loc: 410, size: '17 KB', desc: 'Autonomous serverless agent loop with multi-key cloud failover, tool calling, and live VFS injection.' },
    { id: 'api/calendar.js', label: 'api/calendar.js', cat: 'api', type: 'Serverless API', loc: 370, size: '14 KB', desc: 'Consolidated Google Calendar OAuth2 flow, webhook handlers, and two-way synchronization controller.' },
    { id: 'api/terminal.js', label: 'api/terminal.js', cat: 'api', type: 'Serverless API', loc: 180, size: '7 KB', desc: 'E2B Firecracker POSIX microVM execution endpoint with sandbox timeout guards.' },
    { id: 'api/compile.js', label: 'api/compile.js', cat: 'api', type: 'Serverless API', loc: 160, size: '6 KB', desc: 'Zero-downtime multi-language compiler for Python, C++, Java, and Node.js.' },
    { id: 'api/sync.js', label: 'api/sync.js', cat: 'api', type: 'Serverless API', loc: 140, size: '5 KB', desc: 'Encrypted remote workspace synchronization with zero-trust session validation.' },
    { id: 'api/storage.js', label: 'api/storage.js', cat: 'api', type: 'Serverless API', loc: 150, size: '6 KB', desc: 'Directory-traversal protected persistent file storage vault.' },
    { id: 'api/worker.js', label: 'api/worker.js', cat: 'api', type: 'Serverless API', loc: 190, size: '8 KB', desc: 'Autonomous scheduled task runner and heartbeat cron worker.' },

    // Security & Auth
    { id: 'middleware.js', label: 'middleware.js', cat: 'security', type: 'Edge Middleware', loc: 90, size: '4 KB', desc: 'Edge runtime security headers, CSP policies, and zero-trust session validation.' },
    { id: 'api/auth.js', label: 'api/auth.js', cat: 'security', type: 'Auth API', loc: 110, size: '5 KB', desc: 'Cryptographic PIN authentication, session token generation, and secure cookie issuance.' },
    { id: 'api/logout.js', label: 'api/logout.js', cat: 'security', type: 'Auth API', loc: 40, size: '2 KB', desc: 'Zero-trust session revocation, cookie scrubbing, and cache clearing.' },
    { id: 'api/_lib/auth-guard.js', label: 'auth-guard.js', cat: 'security', type: 'Security Guard', loc: 130, size: '5 KB', desc: 'Zero-trust session authorization, sliding IP rate limiting, and error sanitization.' },
    { id: 'api/_lib/redis.js', label: 'redis.js', cat: 'security', type: 'KV Store Client', loc: 20, size: '1 KB', desc: 'Upstash Redis REST client initialization with graceful offline degradation.' },

    // Sandboxes & Runtimes
    { id: 'VFS', label: 'Virtual File System', cat: 'runtime', type: 'In-Memory Storage', loc: 'N/A', size: 'RAM', desc: 'Sovereign client-side virtual file system mounted at window.vfs with localStorage persistence.' },
    { id: 'E2B MicroVM', label: 'Firecracker MicroVM', cat: 'runtime', type: 'Cloud Linux Sandbox', loc: 'N/A', size: 'POSIX', desc: 'Isolated POSIX Linux microVM sandbox executing Node.js 20, Python 3.11, and Bash.' },
    { id: 'Ollama Cloud 8x', label: 'Ollama Cloud Pool', cat: 'runtime', type: 'Cloud Inference', loc: 'N/A', size: '8 Keys', desc: '8-Key pooled cloud inference gateway supporting Llama 3.3, DeepSeek, and Qwen.' },
    { id: 'NVIDIA NIM Pool', label: 'NVIDIA NIM Pool', cat: 'runtime', type: 'Cloud Inference', loc: 'N/A', size: 'Multi-Key', desc: 'High-throughput enterprise AI gateway hosted on NVIDIA accelerated compute.' },
    { id: 'Google Calendar API', label: 'Google Calendar API', cat: 'runtime', type: 'Cloud Calendar', loc: 'N/A', size: 'REST OAuth2', desc: 'Google Calendar API v3 primary calendar endpoint for real-time two-way synchronization.' },

    // Workspaces & Tools
    { id: 'modules/calendar.js', label: 'calendar.js', cat: 'workspace', type: 'Scheduler Core', loc: 1615, size: '68 KB', desc: 'Google Calendar sovereign replica with 6 calendar views, AI auto-planning, conflict resolution, and event modals.' },
    { id: 'modules/calendar-sync.js', label: 'calendar-sync.js', cat: 'workspace', type: 'Sync & iCal Engine', loc: 650, size: '25 KB', desc: 'Google Calendar two-way OAuth2 synchronization controller, status badge, modal, and RFC 5545 iCalendar import/export.' },
    { id: 'modules/codespace.js', label: 'codespace.js', cat: 'workspace', type: 'Artifacts IDE', loc: 850, size: '36 KB', desc: 'In-browser Monaco/Ace Artifacts IDE, multi-tab file editor, live preview engine, and collapsible VFS tree.' },
    { id: 'modules/whiteboard.js', label: 'whiteboard.js', cat: 'workspace', type: 'Canvas Engine', loc: 560, size: '24 KB', desc: 'Whiteboard Pro vector drawing studio with touchscreen pointer events, dual-canvas preview, and sticky notes.' },
    { id: 'modules/notes.js', label: 'notes.js', cat: 'workspace', type: 'Markdown Studio', loc: 420, size: '18 KB', desc: 'Multi-document Markdown notes vault with split real-time HTML preview.' },
    { id: 'modules/projects.js', label: 'projects.js', cat: 'workspace', type: 'Explorer Module', loc: 310, size: '13 KB', desc: 'Interactive projects directory with multi-device viewport frame switcher.' },
    { id: 'modules/compiler.js', label: 'compiler.js', cat: 'workspace', type: 'IDE Module', loc: 380, size: '15 KB', desc: 'Code runner with Monaco/Ace editors, SQL schemas, and stdin input buffer.' },
    { id: 'modules/telemetry-theme.js', label: 'telemetry-theme.js', cat: 'workspace', type: 'Telemetry Module', loc: 240, size: '10 KB', desc: 'Real-time Web Audio API waveform visualizer and system health metrics.' },
    { id: 'modules/terminal.js', label: 'terminal.js', cat: 'workspace', type: 'Shell Client', loc: 290, size: '12 KB', desc: 'Interactive terminal emulator connected to Firecracker MicroVM API.' },
    { id: 'modules/voice-studio.js', label: 'voice-studio.js', cat: 'workspace', type: 'Voice Engine', loc: 480, size: '20 KB', desc: '100% Free Sovereign Voice Studio with Web Speech recognition, audio visualizer, and speech synthesis.' },
    { id: 'modules/graphify.js', label: 'graphify.js', cat: 'workspace', type: 'Visualizer Module', loc: 660, size: '29 KB', desc: 'Dynamic project architecture and dependency graph visualizer.' },

    // Testing Infrastructure
    { id: 'tests/features.test.cjs', label: 'features.test.cjs', cat: 'tests', type: 'Unit Test Suite', loc: 600, size: '30 KB', desc: '240+ assertion comprehensive test suite covering DOM, sandboxes, tools, calendar, and security.' },
    { id: 'tests/browser-cdp-test.cjs', label: 'browser-cdp-test.cjs', cat: 'tests', type: 'Browser Test Suite', loc: 220, size: '11 KB', desc: 'Headless Google Chrome automation testing via DevTools Protocol (CDP).' }
  ];

  const BASE_LINKS = [
    { source: 'dashboard.html', target: 'modules/ai-studio.js' },
    { source: 'dashboard.html', target: 'modules/ai-simulation.js' },
    { source: 'dashboard.html', target: 'modules/ai-tasks-sessions.js' },
    { source: 'dashboard.html', target: 'modules/ai-chat-ui.js' },
    { source: 'dashboard.html', target: 'modules/calendar.js' },
    { source: 'dashboard.html', target: 'modules/calendar-sync.js' },
    { source: 'dashboard.html', target: 'modules/codespace.js' },
    { source: 'dashboard.html', target: 'modules/whiteboard.js' },
    { source: 'dashboard.html', target: 'modules/notes.js' },
    { source: 'dashboard.html', target: 'modules/projects.js' },
    { source: 'dashboard.html', target: 'modules/compiler.js' },
    { source: 'dashboard.html', target: 'modules/telemetry-theme.js' },
    { source: 'dashboard.html', target: 'modules/terminal.js' },
    { source: 'dashboard.html', target: 'modules/voice-studio.js' },
    { source: 'dashboard.html', target: 'modules/graphify.js' },
    { source: 'dashboard.html', target: 'modules/sidebar.js' },
    { source: 'dashboard.html', target: 'modules/system.js' },
    { source: 'dashboard.html', target: 'modules/state.js' },
    { source: 'dashboard.html', target: 'middleware.js' },

    { source: 'modules/ai-studio.js', target: 'modules/ai-simulation.js' },
    { source: 'modules/ai-studio.js', target: 'modules/ai-tasks-sessions.js' },
    { source: 'modules/ai-studio.js', target: 'modules/ai-chat-ui.js' },
    { source: 'modules/ai-studio.js', target: 'api/chat.js' },
    { source: 'modules/ai-studio.js', target: 'api/terminal.js' },
    { source: 'modules/ai-studio.js', target: 'personas.js' },
    { source: 'personas.js', target: 'modules/personas/general.js' },
    { source: 'personas.js', target: 'modules/personas/software-eng.js' },
    { source: 'personas.js', target: 'modules/personas/ai-data.js' },
    { source: 'personas.js', target: 'modules/personas/devops-security.js' },
    { source: 'modules/ai-studio.js', target: 'VFS' },
    { source: 'modules/ai-studio.js', target: 'modules/codespace.js' },
    { source: 'modules/ai-studio.js', target: 'modules/calendar.js' },
    { source: 'modules/ai-studio.js', target: 'modules/voice-studio.js' },
    { source: 'modules/ai-tasks-sessions.js', target: 'modules/calendar.js' },
    { source: 'modules/ai-tasks-sessions.js', target: 'api/worker.js' },

    { source: 'modules/calendar.js', target: 'modules/calendar-sync.js' },
    { source: 'modules/calendar-sync.js', target: 'api/calendar.js' },
    { source: 'modules/calendar.js', target: 'api/calendar.js' },
    { source: 'api/calendar.js', target: 'Google Calendar API' },
    { source: 'api/worker.js', target: 'api/calendar.js' },

    { source: 'modules/compiler.js', target: 'api/compile.js' },
    { source: 'modules/terminal.js', target: 'api/terminal.js' },

    { source: 'middleware.js', target: 'api/_lib/auth-guard.js' },
    { source: 'api/auth.js', target: 'api/_lib/auth-guard.js' },
    { source: 'api/auth.js', target: 'api/_lib/redis.js' },
    { source: 'api/logout.js', target: 'api/_lib/auth-guard.js' },

    { source: 'api/chat.js', target: 'api/_lib/jev-engine.js' },
    { source: 'api/_lib/jev-engine.js', target: 'api/_lib/jev/jev-tensor.js' },
    { source: 'api/_lib/jev-engine.js', target: 'api/_lib/jev/jev-dag.js' },
    { source: 'api/_lib/jev-engine.js', target: 'api/_lib/jev/jev-ask.js' },
    { source: 'api/chat.js', target: 'api/_lib/auth-guard.js' },
    { source: 'api/chat.js', target: 'E2B MicroVM' },

    { source: 'api/_lib/key-pool.js', target: 'Ollama Cloud 8x' },
    { source: 'api/_lib/key-pool.js', target: 'NVIDIA NIM Pool' },

    { source: 'api/_lib/auth-guard.js', target: 'api/_lib/redis.js' },
    { source: 'api/terminal.js', target: 'E2B MicroVM' },
    { source: 'api/terminal.js', target: 'api/_lib/auth-guard.js' },
    { source: 'api/compile.js', target: 'api/_lib/auth-guard.js' },
    { source: 'api/sync.js', target: 'api/_lib/auth-guard.js' },
    { source: 'api/worker.js', target: 'api/chat.js' },

    { source: 'tests/features.test.cjs', target: 'dashboard.html' },
    { source: 'tests/features.test.cjs', target: 'modules/calendar.js' },
    { source: 'tests/features.test.cjs', target: 'api/chat.js' },
    { source: 'tests/features.test.cjs', target: 'api/calendar.js' },
    { source: 'tests/features.test.cjs', target: 'api/_lib/jev-engine.js' },
    { source: 'tests/browser-cdp-test.cjs', target: 'dashboard.html' }
  ];

  // Graphify Engine State
  let canvas = null;
  let ctx = null;
  let nodes = [];
  let links = [];
  let width = 800;
  let height = 600;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let panInitialized = false;
  let isDragging = false;
  let dragNode = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let hoveredNode = null;
  let selectedNode = null;
  let activeFilter = 'all';
  let searchQuery = '';
  let animId = null;
  let isInitialized = false;
  let resizeObserver = null;

  function initGraphifyGraph() {
    canvas = document.getElementById('graphifyCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();

    if (!isInitialized) {
      window.addEventListener('resize', resizeCanvas);
      setupInteractions();
      if (window.ResizeObserver && canvas.parentElement) {
        resizeObserver = new ResizeObserver(() => {
          resizeCanvas();
        });
        resizeObserver.observe(canvas.parentElement);
      }
      isInitialized = true;
    }

    rebuildGraphData();
    startSimulation();
  }

  function resizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    width = rect.width;
    height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    if (!panInitialized) {
      panX = width / 2;
      panY = height / 2;
      panInitialized = true;
    }
  }

  function rebuildGraphData() {
    const existingMap = new Map();
    nodes.forEach(n => {
      existingMap.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy });
    });

    const newNodes = BASE_NODES.map(n => {
      const existing = existingMap.get(n.id);
      return {
        ...n,
        x: existing && Number.isFinite(existing.x) ? existing.x : (Math.random() - 0.5) * 350,
        y: existing && Number.isFinite(existing.y) ? existing.y : (Math.random() - 0.5) * 280,
        vx: existing && Number.isFinite(existing.vx) ? existing.vx : 0,
        vy: existing && Number.isFinite(existing.vy) ? existing.vy : 0,
        radius: n.cat === 'frontend' ? 26 : (n.cat === 'ai' || n.cat === 'api' ? 22 : 18)
      };
    });

    const newLinks = [...BASE_LINKS];

    const vfsHub = newNodes.find(n => n.id === 'VFS');
    const hubX = vfsHub ? vfsHub.x : 0;
    const hubY = vfsHub ? vfsHub.y : 0;

    // Dynamically inject user VFS files
    const vfs = window.vfs || {};
    Object.keys(vfs).forEach(filename => {
      const vfsId = `vfs://${filename}`;
      const existing = existingMap.get(vfsId);
      const content = vfs[filename] || '';
      newNodes.push({
        id: vfsId,
        label: filename,
        cat: 'vfs',
        type: 'Virtual File',
        loc: content.split('\n').length,
        size: `${content.length} B`,
        desc: `Mounted in-memory virtual file system artifact (${filename}).`,
        x: existing && Number.isFinite(existing.x) ? existing.x : hubX + (Math.random() - 0.5) * 160,
        y: existing && Number.isFinite(existing.y) ? existing.y : hubY + (Math.random() - 0.5) * 160,
        vx: existing && Number.isFinite(existing.vx) ? existing.vx : 0,
        vy: existing && Number.isFinite(existing.vy) ? existing.vy : 0,
        radius: 16
      });
      newLinks.push({ source: 'VFS', target: vfsId });
    });

    nodes = newNodes;
    links = newLinks;

    if (selectedNode) {
      const updatedSelected = nodes.find(n => n.id === selectedNode.id);
      if (updatedSelected) {
        selectedNode = updatedSelected;
      } else {
        selectedNode = null;
        const drawer = document.getElementById('graphifyInspectorDrawer');
        if (drawer) drawer.classList.add('hidden');
      }
    }

    const countEl = document.getElementById('graphifyNodeCount');
    if (countEl) countEl.textContent = `${nodes.length} Nodes • ${links.length} Links`;
  }

  function setupInteractions() {
    if (!canvas) return;

    canvas.onmousedown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panX) / zoom;
      const mouseY = (e.clientY - rect.top - panY) / zoom;

      // Check node hit
      const hit = nodes.find(n => {
        const dx = n.x - mouseX;
        const dy = n.y - mouseY;
        return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
      });

      if (hit) {
        dragNode = hit;
        selectedNode = hit;
        showNodeInspector(hit);
      } else {
        isDragging = true;
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    window.onmousemove = (e) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left - panX) / zoom;
      const mouseY = (e.clientY - rect.top - panY) / zoom;

      if (dragNode) {
        dragNode.x = mouseX;
        dragNode.y = mouseY;
        dragNode.vx = 0;
        dragNode.vy = 0;
      } else if (isDragging) {
        panX += e.clientX - lastMouseX;
        panY += e.clientY - lastMouseY;
      } else {
        // Hover test
        hoveredNode = nodes.find(n => {
          const dx = n.x - mouseX;
          const dy = n.y - mouseY;
          return Math.sqrt(dx * dx + dy * dy) <= n.radius + 4;
        }) || null;
        canvas.style.cursor = hoveredNode ? 'pointer' : (isDragging ? 'grabbing' : 'default');
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    window.onmouseup = () => {
      isDragging = false;
      dragNode = null;
    };

    canvas.onwheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoom = Math.max(0.3, Math.min(2.5, zoom * zoomFactor));
    };

    // Mobile & Tablet Touch Support (Pan, Node Drag & Pinch-to-Zoom)
    let initialPinchDist = 0;
    let initialZoom = 1;

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = (touch.clientX - rect.left - panX) / zoom;
        const touchY = (touch.clientY - rect.top - panY) / zoom;

        const hit = nodes.find(n => {
          const dx = n.x - touchX;
          const dy = n.y - touchY;
          return Math.sqrt(dx * dx + dy * dy) <= n.radius + 12; // Touch-friendly radius
        });

        if (hit) {
          dragNode = hit;
          selectedNode = hit;
          showNodeInspector(hit);
        } else {
          isDragging = true;
        }
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        dragNode = null;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialPinchDist = Math.hypot(dx, dy);
        initialZoom = zoom;
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!canvas) return;
      if (e.touches.length === 1 && (dragNode || isDragging)) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = (touch.clientX - rect.left - panX) / zoom;
        const touchY = (touch.clientY - rect.top - panY) / zoom;

        if (dragNode) {
          dragNode.x = touchX;
          dragNode.y = touchY;
          dragNode.vx = 0;
          dragNode.vy = 0;
        } else if (isDragging) {
          panX += touch.clientX - lastMouseX;
          panY += touch.clientY - lastMouseY;
        }
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
      } else if (e.touches.length === 2 && initialPinchDist > 0) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        const factor = currentDist / initialPinchDist;
        zoom = Math.max(0.3, Math.min(2.5, initialZoom * factor));
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        isDragging = false;
        dragNode = null;
        initialPinchDist = 0;
      }
    });

    window.addEventListener('touchcancel', () => {
      isDragging = false;
      dragNode = null;
      initialPinchDist = 0;
    });
  }

  function startSimulation() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }

    function step() {
      // Pause loop if container is hidden
      const col = document.getElementById('aiGraphifyColumn');
      if (col && col.classList.contains('hidden')) {
        animId = null;
        return;
      }

      // 1. Force calculation (Coulomb repulsion with softening)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const na = nodes[i];
          const nb = nodes[j];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 260) {
            const repForce = Math.min(15, (260 - dist) / Math.max(dist, 15)) * 0.35;
            const fx = (dx / dist) * repForce;
            const fy = (dy / dist) * repForce;
            na.vx -= fx;
            na.vy -= fy;
            nb.vx += fx;
            nb.vy += fy;
          }
        }
      }

      // 2. Spring attraction along links (Hooke's law with unit vector)
      links.forEach(l => {
        const na = nodes.find(n => n.id === l.source);
        const nb = nodes.find(n => n.id === l.target);
        if (na && nb) {
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 110;
          const springForce = (dist - targetDist) * 0.035;
          const fx = (dx / dist) * springForce;
          const fy = (dy / dist) * springForce;
          na.vx += fx;
          na.vy += fy;
          nb.vx -= fx;
          nb.vy -= fy;
        }
      });

      // 3. Center gravity, velocity damping, and clamping
      const MAX_VELOCITY = 10;
      nodes.forEach(n => {
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
          n.x = (Math.random() - 0.5) * 200;
          n.y = (Math.random() - 0.5) * 200;
          n.vx = 0;
          n.vy = 0;
        }
        n.vx -= n.x * 0.002;
        n.vy -= n.y * 0.002;
        n.vx *= 0.86;
        n.vy *= 0.86;
        n.vx = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, n.vx));
        n.vy = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, n.vy));
        if (n !== dragNode) {
          n.x += n.vx;
          n.y += n.vy;
        }
      });

      render();
      animId = requestAnimationFrame(step);
    }

    animId = requestAnimationFrame(step);
  }

  function render() {
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // 1. Draw Links
    links.forEach(l => {
      const na = nodes.find(n => n.id === l.source);
      const nb = nodes.find(n => n.id === l.target);
      if (!na || !nb) return;

      const isHighlighted = (hoveredNode && (hoveredNode.id === na.id || hoveredNode.id === nb.id)) ||
                            (selectedNode && (selectedNode.id === na.id || selectedNode.id === nb.id));

      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(0, 242, 254, 0.8)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isHighlighted ? 2.5 : 1;
      ctx.stroke();
    });

    // 2. Draw Nodes
    nodes.forEach(n => {
      const catMeta = CATEGORIES[n.cat] || CATEGORIES.frontend;
      const isFilteredOut = activeFilter !== 'all' && n.cat !== activeFilter;
      const matchesSearch = !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase()) || n.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const isHovered = hoveredNode && hoveredNode.id === n.id;
      const isSelected = selectedNode && selectedNode.id === n.id;

      const alpha = isFilteredOut ? 0.15 : (matchesSearch ? 1 : 0.25);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Outer Glow
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 8, 0, Math.PI * 2);
        ctx.fillStyle = catMeta.color;
        ctx.globalAlpha = 0.25;
        ctx.fill();
        ctx.globalAlpha = alpha;
      }

      // Main Circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
      ctx.fillStyle = catMeta.bg;
      ctx.fill();
      ctx.strokeStyle = (isHovered || isSelected) ? '#ffffff' : catMeta.border;
      ctx.lineWidth = (isHovered || isSelected) ? 2.5 : 1.5;
      ctx.stroke();

      // Center Icon or Dot
      ctx.beginPath();
      ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = catMeta.color;
      ctx.fill();

      // Label
      ctx.fillStyle = (isHovered || isSelected) ? '#ffffff' : '#d4d4d8';
      ctx.font = `${isHovered ? 'bold ' : ''}10px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(n.label, n.x, n.y + n.radius + 12);

      ctx.restore();
    });

    ctx.restore();
  }

  function showNodeInspector(node) {
    const drawer = document.getElementById('graphifyInspectorDrawer');
    if (!drawer) return;

    const catMeta = CATEGORIES[node.cat] || CATEGORIES.frontend;
    drawer.classList.remove('hidden');

    const inLinks = links.filter(l => l.target === node.id).map(l => l.source);
    const outLinks = links.filter(l => l.source === node.id).map(l => l.target);

    drawer.innerHTML = `
      <div class="p-4 border-b border-white/10 flex items-center justify-between bg-surface-900/90">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${catMeta.color};"></span>
          <h4 class="font-heading font-bold text-sm text-white">${escapeHtml(node.label)}</h4>
        </div>
        <button onclick="document.getElementById('graphifyInspectorDrawer').classList.add('hidden')" class="p-1 rounded text-zinc-400 hover:text-white cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>
      <div class="p-4 space-y-4 text-xs font-mono overflow-y-auto max-h-[80vh] custom-scrollbar">
        <div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Architecture Classification</div>
          <span class="px-2 py-0.5 rounded text-[11px] font-bold border" style="background-color: ${catMeta.bg}; color: ${catMeta.color}; border-color: ${catMeta.border};">${catMeta.label}</span>
          <span class="px-2 py-0.5 rounded text-[11px] bg-white/5 text-zinc-300 border border-white/10 ml-1">${escapeHtml(node.type)}</span>
        </div>
        <div>
          <div class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Role &amp; Responsibilities</div>
          <p class="text-zinc-300 leading-relaxed font-sans">${escapeHtml(node.desc)}</p>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
          <div class="p-2.5 rounded-xl bg-surface-950 border border-white/5">
            <div class="text-[10px] text-zinc-500">Est. Lines of Code</div>
            <div class="text-sm font-bold text-cyan-400">${node.loc} LOC</div>
          </div>
          <div class="p-2.5 rounded-xl bg-surface-950 border border-white/5">
            <div class="text-[10px] text-zinc-500">Asset Size</div>
            <div class="text-sm font-bold text-emerald-400">${node.size}</div>
          </div>
        </div>
        <div class="pt-2 border-t border-white/5 space-y-2">
          <div class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Incoming Dependencies (${inLinks.length})</div>
          <div class="space-y-1">
            ${inLinks.length > 0 ? inLinks.map(l => `<div class="p-1.5 rounded bg-surface-950 text-zinc-400 truncate">← ${escapeHtml(l)}</div>`).join('') : '<div class="text-zinc-600 italic">None (Root Entrypoint)</div>'}
          </div>
        </div>
        <div class="pt-2 border-t border-white/5 space-y-2">
          <div class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Dispatched Outgoing Links (${outLinks.length})</div>
          <div class="space-y-1">
            ${outLinks.length > 0 ? outLinks.map(l => `<div class="p-1.5 rounded bg-surface-950 text-zinc-400 truncate">➜ ${escapeHtml(l)}</div>`).join('') : '<div class="text-zinc-600 italic">Terminal Node (Leaf)</div>'}
          </div>
        </div>
        ${node.cat === 'vfs' ? `
          <button onclick="window.switchAiSubTab('artifacts'); window.switchAndOpenFile('${escapeHtml(node.label)}');" class="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs transition-colors cursor-pointer mt-2">
            Open File in Artifacts IDE
          </button>
        ` : ''}
      </div>
    `;

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function setGraphifyFilter(cat) {
    activeFilter = cat;
    document.querySelectorAll('.graphify-filter-btn').forEach(btn => {
      if (btn.dataset.cat === cat) {
        btn.classList.add('bg-cyan-500', 'text-black', 'font-bold');
        btn.classList.remove('bg-surface-900', 'text-zinc-400');
      } else {
        btn.classList.remove('bg-cyan-500', 'text-black', 'font-bold');
        btn.classList.add('bg-surface-900', 'text-zinc-400');
      }
    });
  }

  function setGraphifySearch(query) {
    searchQuery = (query || '').trim();
  }

  function resetGraphifyView() {
    zoom = 1;
    panX = width / 2;
    panY = height / 2;
  }

  function zoomGraphify(delta) {
    zoom = Math.max(0.3, Math.min(2.5, zoom + delta));
  }

  function exportGraphifyImage() {
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `luminavista-architecture-graph-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
    if (window.showToast) window.showToast('Graph Exported', 'Downloaded high-resolution project architecture diagram.');
  }

  function exportGraphifyJson() {
    const data = {
      project: 'LuminaVista OS',
      version: '14.0.0',
      timestamp: new Date().toISOString(),
      nodes: nodes.map(n => ({ id: n.id, label: n.label, category: n.cat, type: n.type, loc: n.loc, size: n.size, desc: n.desc })),
      links
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.download = `graphify-manifest-${Date.now()}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
    if (window.showToast) window.showToast('JSON Exported', 'Saved Graphify architecture manifest JSON.');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  // Window Exports
  window.initGraphifyGraph = initGraphifyGraph;
  window.setGraphifyFilter = setGraphifyFilter;
  window.setGraphifySearch = setGraphifySearch;
  window.resetGraphifyView = resetGraphifyView;
  window.zoomGraphify = zoomGraphify;
  window.exportGraphifyImage = exportGraphifyImage;
  window.exportGraphifyJson = exportGraphifyJson;
  window.rebuildGraphData = rebuildGraphData;
  window.getGraphifyBaseNodes = () => [...BASE_NODES];
  window.getGraphifyBaseLinks = () => [...BASE_LINKS];

})(typeof window !== 'undefined' ? window : global);
