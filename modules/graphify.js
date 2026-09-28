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
    { id: 'dashboard.html', label: 'dashboard.html', cat: 'frontend', type: 'HTML/Shell', loc: 980, size: '84 KB', desc: 'Main LuminaVista OS desktop, tabbed workspaces, top system bar, and dialog modals.' },
    { id: 'index.html', label: 'index.html', cat: 'frontend', type: 'Landing Page', loc: 420, size: '36 KB', desc: 'Marketing landing page showcasing features, live preview, and quick launch.' },
    { id: 'login.html', label: 'login.html', cat: 'frontend', type: 'Auth Page', loc: 210, size: '18 KB', desc: 'Zero-trust cryptographic PIN login interface with session lock.' },

    // AI & Inference Engine
    { id: 'modules/ai-studio.js', label: 'ai-studio.js', cat: 'ai', type: 'Core Module', loc: 1820, size: '83 KB', desc: 'Autonomous AI Studio, cognitive thinking engine, tool protocol execution, and multi-session chat.' },
    { id: 'personas.js', label: 'personas.js', cat: 'ai', type: 'Persona Matrix', loc: 3600, size: '190 KB', desc: '1,800+ specialized technical persona directives categorized across 35 engineering disciplines.' },
    { id: 'api/_lib/key-pool.js', label: 'key-pool.js', cat: 'ai', type: 'Failover Engine', loc: 200, size: '8 KB', desc: '8x Ollama Cloud & NVIDIA NIM multi-key pool with automated 429 rate-limit failover.' },
    { id: 'api/_lib/jev-engine.js', label: 'jev-engine.js', cat: 'ai', type: 'S1 Decision Layer', loc: 280, size: '15 KB', desc: 'TypeSafe Jev System-1 sub-50ms intent classifier, safety guardrails, and dynamic cognitive synthesis.' },

    // Serverless APIs
    { id: 'api/chat.js', label: 'api/chat.js', cat: 'api', type: 'Serverless API', loc: 410, size: '17 KB', desc: 'Autonomous serverless agent loop with multi-key cloud failover, tool calling, and live VFS injection.' },
    { id: 'api/terminal.js', label: 'api/terminal.js', cat: 'api', type: 'Serverless API', loc: 180, size: '7 KB', desc: 'E2B Firecracker POSIX microVM execution endpoint with sandbox timeout guards.' },
    { id: 'api/compile.js', label: 'api/compile.js', cat: 'api', type: 'Serverless API', loc: 160, size: '6 KB', desc: 'Zero-downtime multi-language compiler for Python, C++, Java, and Node.js.' },
    { id: 'api/sync.js', label: 'api/sync.js', cat: 'api', type: 'Serverless API', loc: 140, size: '5 KB', desc: 'Encrypted remote workspace synchronization with zero-trust session validation.' },
    { id: 'api/storage.js', label: 'api/storage.js', cat: 'api', type: 'Serverless API', loc: 150, size: '6 KB', desc: 'Directory-traversal protected persistent file storage vault.' },
    { id: 'api/worker.js', label: 'api/worker.js', cat: 'api', type: 'Serverless API', loc: 190, size: '8 KB', desc: 'Autonomous scheduled task runner and heartbeat cron worker.' },

    // Security & Auth
    { id: 'api/_lib/auth-guard.js', label: 'auth-guard.js', cat: 'security', type: 'Security Guard', loc: 130, size: '5 KB', desc: 'Zero-trust session authorization, sliding IP rate limiting, and error sanitization.' },
    { id: 'api/_lib/redis.js', label: 'redis.js', cat: 'security', type: 'KV Store Client', loc: 20, size: '1 KB', desc: 'Upstash Redis REST client initialization with graceful offline degradation.' },

    // Sandboxes & Runtimes
    { id: 'VFS', label: 'Virtual File System', cat: 'runtime', type: 'In-Memory Storage', loc: 'N/A', size: 'RAM', desc: 'Sovereign client-side virtual file system mounted at window.vfs with localStorage persistence.' },
    { id: 'E2B MicroVM', label: 'Firecracker MicroVM', cat: 'runtime', type: 'Cloud Linux Sandbox', loc: 'N/A', size: 'POSIX', desc: 'Isolated POSIX Linux microVM sandbox executing Node.js 20, Python 3.11, and Bash.' },
    { id: 'Ollama Cloud 8x', label: 'Ollama Cloud Pool', cat: 'runtime', type: 'Cloud Inference', loc: 'N/A', size: '8 Keys', desc: '8-Key pooled cloud inference gateway supporting Llama 3.3, DeepSeek, and Qwen.' },
    { id: 'NVIDIA NIM Pool', label: 'NVIDIA NIM Pool', cat: 'runtime', type: 'Cloud Inference', loc: 'N/A', size: 'Multi-Key', desc: 'High-throughput enterprise AI gateway hosted on NVIDIA accelerated compute.' },

    // Workspaces & Tools
    { id: 'modules/whiteboard.js', label: 'whiteboard.js', cat: 'workspace', type: 'Canvas Engine', loc: 560, size: '24 KB', desc: 'Whiteboard Pro vector drawing studio with dual-canvas layer preview and sticky notes.' },
    { id: 'modules/notes.js', label: 'notes.js', cat: 'workspace', type: 'Markdown Studio', loc: 420, size: '18 KB', desc: 'Multi-document Markdown notes vault with split real-time HTML preview.' },
    { id: 'modules/projects.js', label: 'projects.js', cat: 'workspace', type: 'Explorer Module', loc: 310, size: '13 KB', desc: 'Interactive projects directory with multi-device viewport frame switcher.' },
    { id: 'modules/compilers.js', label: 'compilers.js', cat: 'workspace', type: 'IDE Module', loc: 380, size: '15 KB', desc: 'Code runner with Monaco/Ace editors, SQL schemas, and stdin input buffer.' },
    { id: 'modules/telemetry.js', label: 'telemetry.js', cat: 'workspace', type: 'Telemetry Module', loc: 240, size: '10 KB', desc: 'Real-time Web Audio API waveform visualizer and system health metrics.' },
    { id: 'modules/terminal.js', label: 'terminal.js', cat: 'workspace', type: 'Shell Client', loc: 290, size: '12 KB', desc: 'Interactive terminal emulator connected to Firecracker MicroVM API.' },
    { id: 'modules/graphify.js', label: 'graphify.js', cat: 'workspace', type: 'Visualizer Module', loc: 400, size: '16 KB', desc: 'Dynamic project architecture and dependency graph visualizer.' },

    // Testing Infrastructure
    { id: 'tests/features.test.cjs', label: 'features.test.cjs', cat: 'tests', type: 'Unit Test Suite', loc: 460, size: '24 KB', desc: '131-point comprehensive test suite covering DOM, sandboxes, tools, and security.' },
    { id: 'tests/browser-cdp-test.cjs', label: 'browser-cdp-test.cjs', cat: 'tests', type: 'Browser Test Suite', loc: 220, size: '11 KB', desc: 'Headless Google Chrome automation testing via DevTools Protocol (CDP).' }
  ];

  const BASE_LINKS = [
    { source: 'dashboard.html', target: 'modules/ai-studio.js' },
    { source: 'dashboard.html', target: 'modules/whiteboard.js' },
    { source: 'dashboard.html', target: 'modules/notes.js' },
    { source: 'dashboard.html', target: 'modules/projects.js' },
    { source: 'dashboard.html', target: 'modules/compilers.js' },
    { source: 'dashboard.html', target: 'modules/telemetry.js' },
    { source: 'dashboard.html', target: 'modules/terminal.js' },
    { source: 'dashboard.html', target: 'modules/graphify.js' },
    { source: 'dashboard.html', target: 'login.html' },

    { source: 'modules/ai-studio.js', target: 'api/chat.js' },
    { source: 'modules/ai-studio.js', target: 'api/terminal.js' },
    { source: 'modules/ai-studio.js', target: 'personas.js' },
    { source: 'modules/ai-studio.js', target: 'VFS' },

    { source: 'api/chat.js', target: 'api/_lib/key-pool.js' },
    { source: 'api/chat.js', target: 'api/_lib/jev-engine.js' },
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
    { source: 'tests/features.test.cjs', target: 'api/chat.js' },
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
  let isDragging = false;
  let dragNode = null;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let hoveredNode = null;
  let selectedNode = null;
  let activeFilter = 'all';
  let searchQuery = '';
  let animId = null;

  function initGraphifyGraph() {
    canvas = document.getElementById('graphifyCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);
    setupInteractions();
    rebuildGraphData();
    startSimulation();
  }

  function resizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    width = rect.width || 800;
    height = rect.height || 600;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    panX = width / 2;
    panY = height / 2;
  }

  function rebuildGraphData() {
    nodes = BASE_NODES.map(n => ({
      ...n,
      x: (Math.random() - 0.5) * 500,
      y: (Math.random() - 0.5) * 400,
      vx: 0,
      vy: 0,
      radius: n.cat === 'frontend' ? 26 : (n.cat === 'ai' || n.cat === 'api' ? 22 : 18)
    }));

    links = [...BASE_LINKS];

    // Dynamically inject user VFS files
    const vfs = window.vfs || {};
    Object.keys(vfs).forEach(filename => {
      const vfsId = `vfs://${filename}`;
      if (!nodes.some(n => n.id === vfsId)) {
        nodes.push({
          id: vfsId,
          label: filename,
          cat: 'vfs',
          type: 'Virtual File',
          loc: (vfs[filename] || '').split('\n').length,
          size: `${(vfs[filename] || '').length} B`,
          desc: `Mounted in-memory virtual file system artifact (${filename}).`,
          x: (Math.random() - 0.5) * 300,
          y: (Math.random() - 0.5) * 200,
          vx: 0,
          vy: 0,
          radius: 16
        });
        links.push({ source: 'VFS', target: vfsId });
      }
    });

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
  }

  function startSimulation() {
    if (animId) cancelAnimationFrame(animId);

    function step() {
      // 1. Force calculation (Repulsion between all nodes)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const na = nodes[i];
          const nb = nodes[j];
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 260) {
            const force = (260 - dist) / dist * 0.6;
            na.vx -= dx * force * 0.05;
            na.vy -= dy * force * 0.05;
            nb.vx += dx * force * 0.05;
            nb.vy += dy * force * 0.05;
          }
        }
      }

      // 2. Spring attraction along links
      links.forEach(l => {
        const na = nodes.find(n => n.id === l.source);
        const nb = nodes.find(n => n.id === l.target);
        if (na && nb) {
          const dx = nb.x - na.x;
          const dy = nb.y - na.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 110;
          const force = (dist - targetDist) * 0.015;
          na.vx += dx * force * 0.1;
          na.vy += dy * force * 0.1;
          nb.vx -= dx * force * 0.1;
          nb.vy -= dy * force * 0.1;
        }
      });

      // 3. Center gravity & velocity damping
      nodes.forEach(n => {
        n.vx -= n.x * 0.003;
        n.vy -= n.y * 0.003;
        n.vx *= 0.88;
        n.vy *= 0.88;
        if (n !== dragNode) {
          n.x += n.vx;
          n.y += n.vy;
        }
      });

      render();
      animId = requestAnimationFrame(step);
    }

    step();
  }

  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
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

})(typeof window !== 'undefined' ? window : global);
