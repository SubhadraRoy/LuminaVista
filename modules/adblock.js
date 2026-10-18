// modules/adblock.js - ESP32 DNS Ad-Blocker Cyber-Clean Reactive Control Center
(function (window) {
  'use strict';

  // Default to 3,500ms (Hardware-matched to ESP32 heartbeat cadence) to conserve battery, Wi-Fi airtime and avoid DNS contention
  let activePollIntervalMs = 3500;
  try {
    const saved = typeof window.localStorage !== 'undefined' && window.localStorage.getItem('lumina_adblock_poll_interval');
    if (saved) activePollIntervalMs = Math.max(1000, parseInt(saved, 10) || 3500);
  } catch (e) {}

  let simulatedLatencyMs = 0;
  try {
    const savedSim = typeof window.localStorage !== 'undefined' && window.localStorage.getItem('lumina_adblock_sim_latency');
    if (savedSim) simulatedLatencyMs = Math.max(0, parseInt(savedSim, 10) || 0);
  } catch (e) {}

  const BG_POLL_MS = 15000;      // 15s background standby heartbeat
  const RING_BUFFER_SIZE = 60;

  let pollTimer = null;
  let lastPollTimeMs = 0;
  let isMounted = false;
  let isPolling = false;
  let commandEpoch = 0;
  let inFlightCommands = 0;

  // Zero-Allocation Ring Buffer for Throughput Chart (last 60 samples)
  const qpsRingBuffer = new Float32Array(RING_BUFFER_SIZE);
  let ringIndex = 0;
  let ewmaValue = 0;
  let renderValue = 0;
  let rafId = null;

  // Cached Canvas Layout Dimensions
  let cachedWidth = 0;
  let cachedHeight = 0;
  let cachedDpr = 1;
  let resizeObserver = null;

  function getAuthHeaders(extra = {}) {
    let sid = '';
    try {
      sid = window.localStorage?.getItem('lumina_session_id') ||
            window.sessionStorage?.getItem('lumina_workspace_attestation') ||
            '';
    } catch (e) {}
    const headers = { ...extra };
    if (sid && sid !== 'sovereign_session') {
      headers['x-session-id'] = sid;
    }
    return headers;
  }

  async function adblockFetch(endpoint, options = {}) {
    const fetchOpts = {
      // Modern Web Guidance (deprioritize-background-fetches): Mark background telemetry fetches as low priority
      priority: options.priority || 'low',
      ...options
    };

    // Simulated latency injection for network degradation / stress verification
    if (simulatedLatencyMs > 0) {
      await new Promise(r => setTimeout(r, simulatedLatencyMs));
    }

    try {
      const res = await window.fetch(endpoint, fetchOpts);
      if (res && res.status !== 404) return res;
    } catch (e) {}
    const sep = endpoint.includes('?') ? '&' : '?';
    const fallback = endpoint.replace('/api/adblock', `/api/iot${sep}service=adblock`).replace('??', '?').replace('&&', '&');
    return window.fetch(fallback, fetchOpts);
  }

  const state = {
    online: false,
    lastSeenMs: 0,
    lastRttMs: 14,
    pollIntervalMs: activePollIntervalMs,
    simulatedLatencyMs: simulatedLatencyMs,
    activeSubTab: 'clients',
    clientSearch: '',
    logSearch: '',
    editingClientIp: null,
    status: {
      totalBlocked: 0,
      totalAllowed: 0,
      rebindBlocked: 0,
      rateLimited: 0,
      rulesCount: 245000,
      freeHeap: 106000,
      minHeap: 85000,
      uptime: 0,
      qps: 0,
      ip: '192.168.0.115',
      rssi: -52,
      lastOnline: '-',
      lastOffline: '-'
    },
    clients: [],
    logs: [],
    uboOverrides: [],
    pendingCommands: []
  };

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatUptime(sec) {
    const s = Math.max(0, parseInt(sec, 10) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${rem}s`;
    return `${m}m ${rem}s`;
  }

  function formatBytes(bytes) {
    const b = parseInt(bytes, 10) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  function getThemeColor() {
    try {
      const col = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      return col || '#00f2fe';
    } catch (e) {
      return '#00f2fe';
    }
  }

  function isTabActive() {
    if (typeof document === 'undefined' || document.hidden) return false;
    const pane = document.getElementById('tab-adblock');
    return Boolean(pane && !pane.classList.contains('hidden') && window.currentActiveTab === 'tab-adblock');
  }

  // Asymmetric Attack/Decay EWMA
  function updateEwma(sample) {
    const alphaUp = 0.65;   // Fast attack on QPS burst
    const alphaDown = 0.22; // Smooth release on idle
    if (sample > ewmaValue) {
      ewmaValue = alphaUp * sample + (1 - alphaUp) * ewmaValue;
    } else {
      ewmaValue = alphaDown * sample + (1 - alphaDown) * ewmaValue;
    }
    qpsRingBuffer[ringIndex] = ewmaValue;
    ringIndex = (ringIndex + 1) % RING_BUFFER_SIZE;
  }

  function initCanvasEngine() {
    const canvas = document.getElementById('adblockThroughputCanvas');
    if (!canvas) return;

    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(entry.contentRect.width);
        const h = Math.floor(entry.contentRect.height);
        if (w > 0 && h > 0 && (w !== cachedWidth || h !== cachedHeight || dpr !== cachedDpr)) {
          cachedWidth = w;
          cachedHeight = h;
          cachedDpr = dpr;
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
        }
      }
    });
    resizeObserver.observe(canvas);

    startCanvasRenderLoop();
  }

  function startCanvasRenderLoop() {
    if (rafId) cancelAnimationFrame(rafId);

    let lastFrameTime = performance.now();

    function renderFrame(now) {
      if (!isTabActive()) {
        rafId = null;
        return;
      }

      const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      // Exponential lerp toward target EWMA value
      const lambda = 8.0;
      renderValue += (ewmaValue - renderValue) * (1 - Math.exp(-lambda * dt));

      const canvas = document.getElementById('adblockThroughputCanvas');
      if (canvas && cachedWidth > 0 && cachedHeight > 0) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawThroughputChart(ctx, canvas.width, canvas.height, cachedDpr);
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  function drawThroughputChart(ctx, w, h, dpr) {
    ctx.clearRect(0, 0, w, h);

    const padTop = 15 * dpr;
    const padBottom = 20 * dpr;
    const padLeft = 10 * dpr;
    const padRight = 10 * dpr;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    if (plotW <= 0 || plotH <= 0) return;

    // Determine max scale (minimum 10 QPS scale for readability)
    let maxVal = 10;
    for (let i = 0; i < RING_BUFFER_SIZE; i++) {
      if (qpsRingBuffer[i] > maxVal) maxVal = qpsRingBuffer[i];
    }
    maxVal *= 1.2; // 20% headroom

    // Grid Lines & Guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop + plotH * 0.5);
    ctx.lineTo(padLeft + plotW, padTop + plotH * 0.5);
    ctx.stroke();

    const themeColor = getThemeColor();

    // Plot Points from Ring Buffer
    ctx.beginPath();
    const stepX = plotW / (RING_BUFFER_SIZE - 1);
    for (let i = 0; i < RING_BUFFER_SIZE; i++) {
      const idx = (ringIndex + i) % RING_BUFFER_SIZE;
      const val = qpsRingBuffer[idx];
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (val / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Gradient Fill
    ctx.save();
    const fillGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    fillGrad.addColorStop(0, `${themeColor}33`); // 20% opacity
    fillGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.lineTo(padLeft + plotW, padTop + plotH);
    ctx.lineTo(padLeft, padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = fillGrad;
    ctx.fill();
    ctx.restore();

    // Foreground Line
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = `${themeColor}88`;
    ctx.shadowBlur = 8 * dpr;
    ctx.beginPath();
    for (let i = 0; i < RING_BUFFER_SIZE; i++) {
      const idx = (ringIndex + i) % RING_BUFFER_SIZE;
      const val = qpsRingBuffer[idx];
      const x = padLeft + i * stepX;
      const y = padTop + plotH - (val / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Current QPS Label
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${11 * dpr}px ui-monospace, SFMono-Regular, monospace`;
    ctx.fillText(`${renderValue.toFixed(1)} QPS`, padLeft + 6 * dpr, padTop + 14 * dpr);
  }

  function startPollingLoop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      const now = Date.now();
      const targetInterval = isTabActive() ? activePollIntervalMs : BG_POLL_MS;
      if (now - lastPollTimeMs >= targetInterval) {
        lastPollTimeMs = now;
        fetchDashboard();
      }
    }, 250);
  }

  async function fetchDashboard(manual = false) {
    if (!manual && (isPolling || inFlightCommands > 0)) return false;
    isPolling = true;
    lastPollTimeMs = Date.now();
    const epochAtStart = commandEpoch;
    const t0 = Date.now();

    const syncBtn = manual ? document.getElementById('adblockBtnRefresh') : null;
    if (syncBtn) syncBtn.textContent = '⏳ Syncing...';

    try {
      const res = await adblockFetch('/api/adblock?action=dashboard', {
        method: 'GET',
        credentials: 'include',
        headers: getAuthHeaders()
      });

      if (!res || !res.ok) {
        try {
          const wdRes = await adblockFetch('/api/adblock?action=watchdog', { method: 'GET' });
          if (wdRes && wdRes.ok) {
            const wd = await wdRes.json();
            if (wd && wd.ok) {
              state.online = Boolean(wd.online);
              state.lastSeenMs = wd.lastSeenMs || 0;
              renderHeader();
            }
          }
        } catch (_) {}
        return false;
      }
      const data = await res.json();
      state.lastRttMs = Math.max(1, Date.now() - t0);

      // Discard stale background responses if user performed in-flight mutation
      if (!manual && (epochAtStart !== commandEpoch || inFlightCommands > 0)) {
        return false;
      }

      if (data && data.ok) {
        state.online = Boolean(data.online);
        state.lastSeenMs = data.lastSeenMs || 0;
        if (data.status) state.status = { ...state.status, ...data.status };
        if (Array.isArray(data.clients)) state.clients = data.clients;
        if (Array.isArray(data.logs)) state.logs = data.logs;
        if (Array.isArray(data.uboOverrides)) state.uboOverrides = data.uboOverrides;
        if (Array.isArray(data.pendingCommands)) state.pendingCommands = data.pendingCommands;

        // Feed EWMA engine
        const currentQps = Number(state.status.qps || 0);
        updateEwma(currentQps);

        renderAll();
        if (manual && window.showToast) {
          window.showToast('ESP32 AdBlocker', `Live telemetry synchronized (${state.lastRttMs}ms RTT).`);
        }
      }
      return true;
    } catch (e) {
      console.warn('[AdBlock] Dashboard poll failed:', e);
      return false;
    } finally {
      isPolling = false;
      if (syncBtn) syncBtn.textContent = '🔄 Refresh';
    }
  }

  async function sendCommand(cmd, param = '') {
    commandEpoch++;
    inFlightCommands++;
    renderAll();

    try {
      const res = await adblockFetch('/api/adblock?action=command', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ cmd, param })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (window.showToast) {
          window.showToast('Command Dispatched', data.message || `Command '${cmd}' queued for ESP32.`);
        }
        await fetchDashboard(true);
      } else {
        if (window.showToast) {
          window.showToast('Command Failed', data.error || 'Failed to dispatch command to gateway.');
        }
      }
    } catch (err) {
      if (window.showToast) {
        window.showToast('Network Error', err.message || 'Error sending command.');
      }
    } finally {
      inFlightCommands = Math.max(0, inFlightCommands - 1);
      renderAll();
    }
  }

  function init() {
    const container = document.getElementById('tab-adblock');
    if (!container) return;
    if (isMounted) {
      startPollingLoop();
      initCanvasEngine();
      return;
    }

    container.innerHTML = `
      <!-- Top Band: Cyber-Luminous Telemetry & Security Header -->
      <div class="glass-panel rounded-2xl p-3 sm:px-4 sm:py-3 border border-cyan-500/25 bg-gradient-to-r from-surface-900/95 via-cyan-950/20 to-surface-900/95 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0 shadow-lg">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-[0_0_12px_rgba(0,242,254,0.25)]">
            <i data-lucide="shield-alert" class="w-4 h-4"></i>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <h2 class="font-heading font-bold text-sm sm:text-base text-white tracking-tight whitespace-nowrap">ESP32 DNS Ad-Blocker</h2>
            <span class="text-[10px] font-mono text-cyan-400/80 hidden sm:inline">• Sovereign Network Sinkhole</span>
          </div>
          <span id="adblockConnBadge" class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
            🔴 HARDWARE OFFLINE
          </span>
          <span id="adblockIpChip" class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-white/5 text-cyan-300 border border-white/10 whitespace-nowrap">
            IP: 192.168.0.115
          </span>
          <span id="adblockRttBadge" class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 whitespace-nowrap">
            ⚡ RTT: 14ms (Direct Cloud)
          </span>
          <span class="hidden 2xl:inline text-[10px] font-mono text-zinc-400 truncate">
            🛡️ 5-Layer HMAC-SHA256 • TLS 1.3 ISRG Root X1
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          <span id="adblockQueueBadge" class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-mono bg-surface-850 text-zinc-300 border border-white/10 whitespace-nowrap">
            Queue: 0 pending
          </span>
          <button id="adblockBtnRefresh" onclick="window.LuminaAdBlock.fetchDashboard(true)" class="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95">
            🔄 Refresh
          </button>
        </div>
      </div>

      <!-- Band 2: 6 KPI Telemetry Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3 shrink-0">
        <!-- Card 1: Total Sinkholed -->
        <div class="glass-panel p-3 rounded-xl border border-white/5 flex flex-col justify-between">
          <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Sinkholed Ads</span>
          <div class="mt-1 flex items-baseline gap-1.5">
            <span id="adblockStatBlocked" class="text-lg sm:text-xl font-bold font-mono text-rose-400">0</span>
            <span id="adblockStatPercent" class="text-[10px] font-mono text-zinc-400">(0.0%)</span>
          </div>
          <span class="text-[9px] text-zinc-500">Sinkholed to 0.0.0.0</span>
        </div>
        <!-- Card 2: Clean Forwarded -->
        <div class="glass-panel p-3 rounded-xl border border-white/5 flex flex-col justify-between">
          <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Clean Queries</span>
          <div class="mt-1">
            <span id="adblockStatAllowed" class="text-lg sm:text-xl font-bold font-mono text-emerald-400">0</span>
          </div>
          <span class="text-[9px] text-zinc-500">Upstream Forwarded</span>
        </div>
        <!-- Card 3: Filter Rules -->
        <div class="glass-panel p-3 rounded-xl border border-white/5 flex flex-col justify-between">
          <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Rules in Flash</span>
          <div class="mt-1">
            <span id="adblockStatRules" class="text-lg sm:text-xl font-bold font-mono text-cyan-400">245,000</span>
          </div>
          <span class="text-[9px] text-zinc-500">Prefix Trie Engine</span>
        </div>
        <!-- Card 4: Connected Devices -->
        <div class="glass-panel p-3 rounded-xl border border-white/5 flex flex-col justify-between">
          <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Active Devices</span>
          <div class="mt-1">
            <span id="adblockStatClients" class="text-lg sm:text-xl font-bold font-mono text-amber-400">0</span>
          </div>
          <span class="text-[9px] text-zinc-500">Clients on LAN</span>
        </div>
        <!-- Card 5: Wi-Fi RSSI -->
        <div class="glass-panel p-3 rounded-xl border border-white/5 flex flex-col justify-between">
          <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Wi-Fi Signal</span>
          <div class="mt-1">
            <span id="adblockStatRssi" class="text-lg sm:text-xl font-bold font-mono text-zinc-200">-52 dBm</span>
          </div>
          <span id="adblockStatRssiQuality" class="text-[9px] text-emerald-400">Excellent</span>
        </div>
        <!-- Card 6: Free DRAM Heap -->
        <div class="glass-panel p-3 rounded-xl border border-white/5 flex flex-col justify-between">
          <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Internal DRAM</span>
          <div class="mt-1">
            <span id="adblockStatHeap" class="text-lg sm:text-xl font-bold font-mono text-purple-400">106 KB</span>
          </div>
          <span class="text-[9px] text-zinc-500">Core 0 Free Heap</span>
        </div>
      </div>

      <!-- Band 3: Real-Time High-DPI Canvas Throughput Pulse Chart -->
      <div class="glass-panel rounded-2xl p-3 border border-white/5 flex flex-col gap-2 shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Live Query Throughput</span>
            <span class="text-[10px] font-mono text-zinc-400">(Queries / Second)</span>
          </div>
          <div class="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
            <span>Uptime: <b id="adblockUptimeText" class="text-zinc-200">0s</b></span>
            <span>Rebind Defenses: <b id="adblockRebindText" class="text-rose-400">0</b></span>
          </div>
        </div>
        <div class="relative w-full h-24 sm:h-28 bg-surface-950/60 rounded-xl overflow-hidden border border-white/5">
          <canvas id="adblockThroughputCanvas" class="w-full h-full block"></canvas>
          <div id="adblockThroughputOverlay" class="absolute inset-0 bg-surface-950/80 backdrop-blur-sm hidden flex items-center justify-center text-xs font-mono text-amber-400">
            [THROUGHPUT FROZEN • HARDWARE STANDBY]
          </div>
        </div>
      </div>

      <!-- Band 4: Multi-Tab Functional Workstation -->
      <div class="glass-panel rounded-2xl border border-white/5 flex-1 flex flex-col min-h-0 overflow-hidden">
        <!-- Sub-Tab Header Navigation -->
        <div class="flex items-center gap-1 p-2 border-b border-white/5 bg-surface-900/60 shrink-0 overflow-x-auto custom-scrollbar">
          <button onclick="window.LuminaAdBlock.switchSubTab('clients')" id="adblockSubTabBtn-clients" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 transition-all cursor-pointer whitespace-nowrap">
            💻 Connected Clients (<span id="adblockClientsBadge">0</span>)
          </button>
          <button onclick="window.LuminaAdBlock.switchSubTab('rules')" id="adblockSubTabBtn-rules" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap">
            🛡️ Blocklist & Rules
          </button>
          <button onclick="window.LuminaAdBlock.switchSubTab('logs')" id="adblockSubTabBtn-logs" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap">
            📋 Blocked Query Log
          </button>
          <button onclick="window.LuminaAdBlock.switchSubTab('system')" id="adblockSubTabBtn-system" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap">
            ⚙️ System & Updates
          </button>
          <button onclick="window.LuminaAdBlock.switchSubTab('webview')" id="adblockSubTabBtn-webview" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap ml-auto">
            🌐 Live Device Portal
          </button>
        </div>

        <!-- Sub-Pane Container -->
        <div class="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
          <!-- 1. Connected Clients Sub-Pane -->
          <div id="adblockPane-clients" class="space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="relative flex-1 max-w-sm">
                <input type="text" id="adblockClientSearchInput" oninput="window.LuminaAdBlock.onClientSearch(this.value)" placeholder="Search clients by IP, alias, MAC..." class="w-full bg-surface-900/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50">
              </div>
              <button onclick="window.LuminaAdBlock.exportClientsCSV()" class="px-3 py-1.5 rounded-xl bg-surface-850 hover:bg-surface-800 text-zinc-300 border border-white/10 text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto">
                📥 Export Clients CSV
              </button>
            </div>
            <div class="overflow-x-auto custom-scrollbar rounded-xl border border-white/5 bg-surface-950/40">
              <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr class="border-b border-white/5 text-zinc-400 uppercase text-[10px] bg-white/[0.02]">
                    <th class="p-2.5">Client Device</th>
                    <th class="p-2.5">IP Address</th>
                    <th class="p-2.5 hidden md:table-cell">Interface</th>
                    <th class="p-2.5 text-right">Queries</th>
                    <th class="p-2.5 text-right">Blocked</th>
                    <th class="p-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody id="adblockClientsTableBody">
                  <tr><td colspan="6" class="p-4 text-center text-zinc-500">Loading clients telemetry...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 2. Blocklist & Rules Sub-Pane -->
          <div id="adblockPane-rules" class="space-y-4 hidden">
            <!-- Add Domain Form -->
            <div class="glass-panel p-3 sm:p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row gap-2">
              <input type="text" id="adblockCustomDomainInput" placeholder="Add domain to blocklist (e.g. telemetry.tracker.com)" class="flex-1 bg-surface-900/80 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50">
              <button onclick="window.LuminaAdBlock.addBlockDomain()" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all cursor-pointer shadow-lg shadow-cyan-500/20 whitespace-nowrap">
                + Add Custom Block
              </button>
            </div>

            <!-- Threat Category Presets -->
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[10px] font-mono text-zinc-400 mr-1">Quick Threat Presets:</span>
              <button onclick="window.LuminaAdBlock.addPresetDomain('telemetry.microsoft.com')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 transition-all cursor-pointer">+ MS Telemetry</button>
              <button onclick="window.LuminaAdBlock.addPresetDomain('analytics.tiktok.com')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 transition-all cursor-pointer">+ TikTok Analytics</button>
              <button onclick="window.LuminaAdBlock.addPresetDomain('pagead2.googlesyndication.com')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 transition-all cursor-pointer">+ Google AdSense</button>
            </div>

            <!-- Active Custom Rules Table -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Active Custom SRAM & LittleFS Overrides</span>
                <span class="text-[10px] font-mono text-zinc-400">4 KB SeqLock Robin Hood Table</span>
              </div>
              <div id="adblockCustomRulesList" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <div class="p-3 rounded-xl border border-white/5 bg-surface-950/40 text-xs text-zinc-500">No custom overrides currently active.</div>
              </div>
            </div>
          </div>

          <!-- 3. Blocked Activity Log Sub-Pane -->
          <div id="adblockPane-logs" class="space-y-3 hidden">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="relative flex-1 max-w-sm">
                <input type="text" id="adblockLogSearchInput" oninput="window.LuminaAdBlock.onLogSearch(this.value)" placeholder="Filter logs by domain, IP, reason..." class="w-full bg-surface-900/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50">
              </div>
              <button onclick="window.LuminaAdBlock.exportLogsCSV()" class="px-3 py-1.5 rounded-xl bg-surface-850 hover:bg-surface-800 text-zinc-300 border border-white/10 text-xs font-semibold transition-all cursor-pointer self-start sm:self-auto">
                📥 Export Logs CSV
              </button>
            </div>
            <div class="overflow-x-auto custom-scrollbar rounded-xl border border-white/5 bg-surface-950/40">
              <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr class="border-b border-white/5 text-zinc-400 uppercase text-[10px] bg-white/[0.02]">
                    <th class="p-2.5">Time</th>
                    <th class="p-2.5">Sinkholed Domain</th>
                    <th class="p-2.5">Client IP</th>
                    <th class="p-2.5">Defense Category</th>
                  </tr>
                </thead>
                <tbody id="adblockLogsTableBody">
                  <tr><td colspan="4" class="p-4 text-center text-zinc-500">No recent sinkholed query events recorded.</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 4. System & Maintenance Sub-Pane -->
          <div id="adblockPane-system" class="space-y-4 hidden">
            <!-- Latency & Telemetry Cadence Engine Card -->
            <div class="glass-panel p-4 rounded-xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/20 to-surface-900/60 space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-base">⏱️</span>
                  <div>
                    <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Telemetry Cadence & Latency Tuner</span>
                    <span class="block text-[10px] text-zinc-400">Modern Web Guidance (<code class="text-cyan-300">priority: 'low'</code>) &amp; Silicon Core 0 Offloading</span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span id="adblockCadenceLivePill" class="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    Cadence: 3.5s
                  </span>
                  <span id="adblockSimLatencyPill" class="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Simulated Lag: 0ms
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <!-- Control 1: Active Polling Interval -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-mono font-semibold text-zinc-200">Browser Cloud Polling Cadence</span>
                    <span class="text-[10px] font-mono text-zinc-500">Controls fetch frequency</span>
                  </div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Higher intervals conserve browser battery and prevent redundant cloud requests when the ESP32 pushes heartbeats every 3.5s–5.0s.
                  </p>
                  <div class="flex flex-wrap items-center gap-1.5" id="adblockPollCadenceButtons">
                    <button onclick="window.LuminaAdBlock.setPollInterval(1500)" id="cadenceBtn-1500" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer">1.5s (Turbo)</button>
                    <button onclick="window.LuminaAdBlock.setPollInterval(3500)" id="cadenceBtn-3500" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-cyan-500/40 bg-cyan-500/20 text-cyan-300 font-bold cursor-pointer">3.5s (Balanced)</button>
                    <button onclick="window.LuminaAdBlock.setPollInterval(5000)" id="cadenceBtn-5000" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer">5.0s (Eco Saver)</button>
                    <button onclick="window.LuminaAdBlock.setPollInterval(10000)" id="cadenceBtn-10000" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer">10.0s (Low-Bandwidth)</button>
                  </div>
                </div>

                <!-- Control 2: Artificial Network Latency Injector -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-mono font-semibold text-zinc-200">Artificial Network Latency Injector</span>
                    <span class="text-[10px] font-mono text-zinc-500">Stress &amp; chaos testing</span>
                  </div>
                  <p class="text-[11px] text-zinc-400 leading-relaxed">
                    Inject simulated RTT propagation delays to verify optimistic UI updates, out-of-order response dropping, and degraded WAN resilience.
                  </p>
                  <div class="flex flex-wrap items-center gap-1.5" id="adblockSimLagButtons">
                    <button onclick="window.LuminaAdBlock.setSimulatedLatency(0)" id="simLagBtn-0" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-cyan-500/40 bg-cyan-500/20 text-cyan-300 font-bold cursor-pointer">0ms (Direct)</button>
                    <button onclick="window.LuminaAdBlock.setSimulatedLatency(150)" id="simLagBtn-150" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer">+150ms (3G)</button>
                    <button onclick="window.LuminaAdBlock.setSimulatedLatency(300)" id="simLagBtn-300" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer">+300ms (WAN)</button>
                    <button onclick="window.LuminaAdBlock.setSimulatedLatency(500)" id="simLagBtn-500" class="px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer">+500ms (Satellite)</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- Blocklist OTA Card -->
              <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
                <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Remote Blocklist OTA Engine</span>
                <p class="text-xs text-zinc-400">Trigger an immediate atomic swap of the upstream filter rules from LittleFS partition.</p>
                <button onclick="window.LuminaAdBlock.triggerOtaFetch()" class="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer">
                  ⚡ Fetch & Swap Blocklist Now
                </button>
              </div>

              <!-- Hardware Control Card -->
              <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
                <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Device Maintenance</span>
                <p class="text-xs text-zinc-400">Perform a graceful software restart on the physical ESP32 microcontroller.</p>
                <button onclick="window.LuminaAdBlock.rebootDevice()" class="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-semibold transition-all cursor-pointer">
                  ⚠️ Graceful Device Reboot
                </button>
              </div>
            </div>
          </div>

          <!-- 5. Live Device Portal & Direct LAN Gateway Sub-Pane -->
          <div id="adblockPane-webview" class="space-y-4 hidden h-full flex flex-col">
            <!-- Gateway Control Bar -->
            <div class="glass-panel p-3.5 sm:p-4 rounded-xl border border-white/5 space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
                  <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Direct LAN Hardware Gateway</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Port 80 HTTP</span>
                </div>
                <div class="flex items-center gap-2">
                  <button onclick="window.LuminaAdBlock.openDevicePortal()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center gap-2 active:scale-95">
                    <span>🚀 Launch Live Portal in New Tab</span>
                    <span class="text-[10px]">↗</span>
                  </button>
                </div>
              </div>

              <!-- Address Configuration & Quick Presets -->
              <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <div class="relative flex-1">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono">URL:</span>
                  <input type="text" id="adblockTargetPortalUrl" value="http://esp32adblock.local/" class="w-full bg-surface-900/90 border border-white/10 rounded-xl pl-12 pr-20 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500/50">
                  <button onclick="window.LuminaAdBlock.copyPortalUrl()" class="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-mono text-zinc-300 cursor-pointer">
                    Copy
                  </button>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 overflow-x-auto custom-scrollbar">
                  <span class="text-[10px] font-mono text-zinc-500 mr-1">Presets:</span>
                  <button onclick="window.LuminaAdBlock.setTargetPortalUrl('http://esp32adblock.local/')" class="px-2.5 py-1.5 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5 transition-all cursor-pointer">mDNS (.local)</button>
                  <button onclick="window.LuminaAdBlock.setTargetPortalUrl('http://192.168.0.115/')" class="px-2.5 py-1.5 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5 transition-all cursor-pointer">Direct IP</button>
                </div>
              </div>
            </div>

            <!-- Security Notice & Browser Policy Explanation Card -->
            <div id="adblockHttpsNotice" class="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-zinc-300 flex items-start gap-3">
              <span class="text-base text-amber-400 shrink-0 mt-0.5">🔒</span>
              <div class="space-y-1 flex-1">
                <div class="flex items-center gap-2">
                  <b class="text-amber-300 text-xs font-mono uppercase tracking-wide">Browser Security Policy Notice (Mixed Content & PNA)</b>
                </div>
                <p class="text-[11px] text-zinc-400 leading-relaxed">
                  Modern browsers protect users by blocking unencrypted local HTTP (<code class="text-cyan-300">http://esp32adblock.local</code>) from being embedded directly inside HTTPS cloud applications (<code class="text-zinc-300">https://lumina-vista-sigma.vercel.app</code>).
                  Click <b class="text-cyan-300">"Launch Live Portal in New Tab"</b> to interact directly with your physical ESP32 web server on your local LAN, or use the live telemetry console below.
                </p>
              </div>
            </div>

            <!-- Live Silicon & Telemetry Twin (Interactive Mirror) -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <!-- Column 1: Hardware Specs -->
              <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Silicon & Firmware</span>
                  <span class="text-[10px] font-mono text-cyan-400">ESP-IDF v5.2</span>
                </div>
                <div class="space-y-2 text-xs font-mono">
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-zinc-500">SoC Architecture:</span>
                    <span class="text-zinc-200">ESP32-D0WD-V3 (240MHz)</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-zinc-500">Dual-Core Allocation:</span>
                    <span class="text-zinc-200">Core 0: Cloud | Core 1: DNS</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-zinc-500">Filter Engine:</span>
                    <span class="text-cyan-300">SeqLock Prefix Trie</span>
                  </div>
                  <div class="flex justify-between py-1">
                    <span class="text-zinc-500">Cloud Link Security:</span>
                    <span class="text-emerald-400">ISRG Root X1 TLS 1.3</span>
                  </div>
                </div>
              </div>

              <!-- Column 2: Live Real-Time Telemetry Mirror -->
              <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Live Telemetry Mirror</span>
                  <span id="adblockMirrorStatusBadge" class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">LIVE SHADOW</span>
                </div>
                <div class="space-y-2 text-xs font-mono">
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-zinc-500">Internal Free Heap:</span>
                    <span id="adblockMirrorHeap" class="text-purple-400">106 KB (Core 0 DRAM)</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-zinc-500">Sinkholed Ratio:</span>
                    <span id="adblockMirrorBlockRatio" class="text-rose-400">0.0% (0 blocked)</span>
                  </div>
                  <div class="flex justify-between py-1 border-b border-white/5">
                    <span class="text-zinc-500">Active Rules:</span>
                    <span id="adblockMirrorRules" class="text-cyan-400">245,000 domains</span>
                  </div>
                  <div class="flex justify-between py-1">
                    <span class="text-zinc-500">Wi-Fi RSSI Signal:</span>
                    <span id="adblockMirrorRssi" class="text-emerald-400">-52 dBm (Excellent)</span>
                  </div>
                </div>
              </div>

              <!-- Column 3: Remote Hardware Actions -->
              <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
                <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Hardware Command Hub</span>
                <div class="grid grid-cols-1 gap-2 pt-1">
                  <button onclick="window.LuminaAdBlock.flushDnsCache()" class="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-xs font-semibold flex items-center justify-between transition-all cursor-pointer">
                    <span>⚡ Flush Local DNS Cache</span>
                    <span class="text-[10px] text-zinc-500">flush_cache</span>
                  </button>
                  <button onclick="window.LuminaAdBlock.triggerOtaFetch()" class="px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center justify-between transition-all cursor-pointer">
                    <span>📥 Force Blocklist OTA Swap</span>
                    <span class="text-[10px] text-cyan-400">fetch_now</span>
                  </button>
                  <button onclick="window.LuminaAdBlock.rebootDevice()" class="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center justify-between transition-all cursor-pointer">
                    <span>🔄 Graceful ESP32 Reboot</span>
                    <span class="text-[10px] text-rose-500">reboot</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Optional / Experimental Embedded Frame Container -->
            <div id="adblockEmbeddedFrameSection" class="glass-panel rounded-xl border border-white/5 p-3 space-y-2">
              <div class="flex items-center justify-between text-xs text-zinc-400">
                <div class="flex items-center gap-2">
                  <span>In-Page Frame Container</span>
                  <span id="adblockFrameStatus" class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">Standby</span>
                </div>
                <div class="flex items-center gap-2">
                  <button onclick="window.LuminaAdBlock.toggleIframeView()" id="adblockBtnToggleFrame" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white cursor-pointer">
                    Show In-Page Frame
                  </button>
                  <button onclick="window.LuminaAdBlock.reloadIframe()" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white cursor-pointer">
                    Reload Frame
                  </button>
                </div>
              </div>
              <div id="adblockIframeWrapper" class="hidden min-h-[420px] rounded-xl border border-white/5 overflow-hidden bg-black relative">
                <div id="adblockIframeFallback" class="absolute inset-0 bg-surface-950 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10 hidden">
                  <div class="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-xl text-rose-400">⚠️</div>
                  <h4 class="text-sm font-bold text-white font-heading">Frame Cannot Be Displayed In-Page</h4>
                  <p class="text-xs text-zinc-400 max-w-md leading-relaxed">
                    The local ESP32 web server was blocked by browser security (Mixed Content or Private Network Access) or is currently unreachable on this subnet.
                  </p>
                  <button onclick="window.LuminaAdBlock.openDevicePortal()" class="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 cursor-pointer">
                    Open in New Tab (Direct LAN) ↗
                  </button>
                </div>
                <iframe id="adblockDeviceIframe" src="about:blank" class="w-full h-[420px] border-0" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Rename Client Alias Modal -->
      <div id="adblockRenameModal" class="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm hidden flex items-center justify-center p-4">
        <div class="glass-panel w-full max-w-sm p-4 rounded-2xl border border-white/10 space-y-3">
          <h3 class="text-sm font-bold text-white font-heading">Assign Device Friendly Name</h3>
          <p class="text-xs text-zinc-400">Set a recognizable alias for IP: <b id="adblockRenameIpTarget" class="text-cyan-300"></b></p>
          <input type="text" id="adblockRenameInput" placeholder="e.g. Primary Workstation, Smart TV" class="w-full bg-surface-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500">
          <div class="flex items-center justify-end gap-2 pt-1">
            <button onclick="window.LuminaAdBlock.closeRenameModal()" class="px-3 py-1.5 rounded-xl bg-surface-850 hover:bg-surface-800 text-zinc-300 text-xs font-semibold">Cancel</button>
            <button onclick="window.LuminaAdBlock.saveClientRename()" class="px-3.5 py-1.5 rounded-xl bg-cyan-500 text-black font-semibold text-xs">Save Name</button>
          </div>
        </div>
      </div>
    `;

    isMounted = true;
    startPollingLoop();
    initCanvasEngine();
    fetchDashboard(true);
  }

  function renderAll() {
    renderHeader();
    renderKpis();
    renderClientsTable();
    renderRulesList();
    renderLogsTable();
    renderWebviewPane();
    renderSystemPane();
  }

  function renderHeader() {
    const connBadge = document.getElementById('adblockConnBadge');
    const rttBadge = document.getElementById('adblockRttBadge');
    const queueBadge = document.getElementById('adblockQueueBadge');
    const overlay = document.getElementById('adblockThroughputOverlay');

    const now = Date.now();
    const isOnline = state.online && (now - state.lastSeenMs < 45000);

    if (connBadge) {
      if (isOnline) {
        connBadge.innerHTML = '🟢 ESP32 DIRECT ONLINE • CLOUD STREAM';
        connBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap';
        if (overlay) overlay.classList.add('hidden');
      } else if (state.lastSeenMs > 0 && now - state.lastSeenMs < 3600000) {
        connBadge.innerHTML = '🟠 CLOUD SHADOW • HARDWARE STANDBY';
        connBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap';
        if (overlay) overlay.classList.remove('hidden');
      } else {
        connBadge.innerHTML = '🔴 HARDWARE OFFLINE';
        connBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap';
        if (overlay) overlay.classList.remove('hidden');
      }
    }

    if (rttBadge) {
      const simLabel = simulatedLatencyMs > 0 ? ` (+${simulatedLatencyMs}ms lag)` : '';
      const cadLabel = `Cadence: ${(activePollIntervalMs / 1000).toFixed(1)}s`;
      rttBadge.textContent = `⚡ RTT: ${state.lastRttMs}ms | ${cadLabel}${simLabel}`;
    }

    if (queueBadge) {
      const qLen = state.pendingCommands?.length || 0;
      queueBadge.textContent = `Queue: ${qLen} pending`;
      queueBadge.className = qLen > 0
        ? 'px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 whitespace-nowrap'
        : 'px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-mono bg-surface-850 text-zinc-300 border border-white/10 whitespace-nowrap';
    }

    const ipChip = document.getElementById('adblockIpChip');
    if (ipChip && state.status?.ip) {
      ipChip.textContent = `IP: ${state.status.ip}`;
    }
  }

  function renderKpis() {
    const s = state.status || {};
    const totalBlocked = s.totalBlocked || 0;
    const totalAllowed = s.totalAllowed || 0;
    const totalQueries = totalBlocked + totalAllowed;
    const percent = totalQueries > 0 ? ((totalBlocked / totalQueries) * 100).toFixed(1) : '0.0';

    const elBlocked = document.getElementById('adblockStatBlocked');
    const elPercent = document.getElementById('adblockStatPercent');
    const elAllowed = document.getElementById('adblockStatAllowed');
    const elRules = document.getElementById('adblockStatRules');
    const elClients = document.getElementById('adblockStatClients');
    const elRssi = document.getElementById('adblockStatRssi');
    const elHeap = document.getElementById('adblockStatHeap');
    const elUptime = document.getElementById('adblockUptimeText');
    const elRebind = document.getElementById('adblockRebindText');
    const elClientsBadge = document.getElementById('adblockClientsBadge');

    if (elBlocked) elBlocked.textContent = totalBlocked.toLocaleString();
    if (elPercent) elPercent.textContent = `(${percent}%)`;
    if (elAllowed) elAllowed.textContent = totalAllowed.toLocaleString();
    if (elRules) elRules.textContent = (s.rulesCount || 245000).toLocaleString();
    if (elClients) elClients.textContent = (state.clients?.length || 0).toString();
    if (elClientsBadge) elClientsBadge.textContent = (state.clients?.length || 0).toString();
    if (elRssi) elRssi.textContent = `${s.rssi || -52} dBm`;
    if (elHeap) elHeap.textContent = formatBytes(s.freeHeap || 106000);
    if (elUptime) elUptime.textContent = formatUptime(s.uptime || 0);
    if (elRebind) elRebind.textContent = (s.rebindBlocked || 0).toString();
  }

  function renderClientsTable() {
    const tbody = document.getElementById('adblockClientsTableBody');
    if (!tbody) return;

    const list = state.clients || [];
    const search = state.clientSearch.toLowerCase();
    const filtered = list.filter(c => {
      if (!search) return true;
      return (c.ip && c.ip.toLowerCase().includes(search)) ||
             (c.name && c.name.toLowerCase().includes(search)) ||
             (c.mac && c.mac.toLowerCase().includes(search));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-zinc-500">No client devices match '${escapeHtml(state.clientSearch)}'.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const isBanned = Boolean(c.banned);
      const banBtnText = isBanned ? 'Unban' : 'Ban';
      const banBtnClass = isBanned
        ? 'px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30'
        : 'px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30';

      return `
        <tr class="border-b border-white/5 hover:bg-white/[0.02]">
          <td class="p-2.5 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full ${isBanned ? 'bg-rose-500' : 'bg-emerald-400'}"></span>
            <span class="font-bold text-white">${escapeHtml(c.name || c.ip)}</span>
          </td>
          <td class="p-2.5 text-zinc-300">${escapeHtml(c.ip)}</td>
          <td class="p-2.5 hidden md:table-cell text-zinc-400">${escapeHtml(c.iface || 'Wi-Fi')}</td>
          <td class="p-2.5 text-right text-emerald-400">${(c.queries || 0).toLocaleString()}</td>
          <td class="p-2.5 text-right text-rose-400">${(c.blocked || 0).toLocaleString()}</td>
          <td class="p-2.5 text-center flex items-center justify-center gap-1.5">
            <button onclick="window.LuminaAdBlock.openRenameModal('${escapeHtml(c.ip)}', '${escapeHtml(c.name || '')}')" class="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 text-[10px]">
              Rename
            </button>
            <button onclick="window.LuminaAdBlock.toggleClientBan('${escapeHtml(c.ip)}', ${isBanned})" class="${banBtnClass} text-[10px]">
              ${banBtnText}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderRulesList() {
    const container = document.getElementById('adblockCustomRulesList');
    if (!container) return;

    const overrides = state.uboOverrides || [];
    if (overrides.length === 0) {
      container.innerHTML = `<div class="p-3 rounded-xl border border-white/5 bg-surface-950/40 text-xs text-zinc-500 col-span-full">No custom overrides currently active.</div>`;
      return;
    }

    container.innerHTML = overrides.map(o => `
      <div class="p-2.5 rounded-xl border border-white/5 bg-surface-900/60 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span class="font-mono text-xs text-white truncate">${escapeHtml(o.domain || o)}</span>
        </div>
        <button onclick="window.LuminaAdBlock.removeBlockDomain('${escapeHtml(o.domain || o)}')" class="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px]">
          Remove
        </button>
      </div>
    `).join('');
  }

  function renderLogsTable() {
    const tbody = document.getElementById('adblockLogsTableBody');
    if (!tbody) return;

    const list = state.logs || [];
    const search = state.logSearch.toLowerCase();
    const filtered = list.filter(l => {
      if (!search) return true;
      return (l.domain && l.domain.toLowerCase().includes(search)) ||
             (l.ip && l.ip.toLowerCase().includes(search)) ||
             (l.cat && l.cat.toLowerCase().includes(search));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-zinc-500">No sinkholed events match '${escapeHtml(state.logSearch)}'.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.slice(0, 50).map(l => {
      const timeStr = l.ts ? new Date(l.ts).toLocaleTimeString() : '-';
      return `
        <tr class="border-b border-white/5 hover:bg-white/[0.02]">
          <td class="p-2.5 text-zinc-400">${timeStr}</td>
          <td class="p-2.5 text-rose-400 font-bold">${escapeHtml(l.domain || '-')}</td>
          <td class="p-2.5 text-zinc-300">${escapeHtml(l.ip || '-')}</td>
          <td class="p-2.5 text-cyan-400"><span class="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[9px]">${escapeHtml(l.cat || 'AD_SINKHOLE')}</span></td>
        </tr>
      `;
    }).join('');
  }

  function renderWebviewPane() {
    const mirrorHeap = document.getElementById('adblockMirrorHeap');
    const mirrorRatio = document.getElementById('adblockMirrorBlockRatio');
    const mirrorRules = document.getElementById('adblockMirrorRules');
    const mirrorRssi = document.getElementById('adblockMirrorRssi');
    const mirrorBadge = document.getElementById('adblockMirrorStatusBadge');

    if (mirrorHeap) mirrorHeap.textContent = `${formatBytes(state.status.freeHeap)} (Core 0 DRAM)`;
    if (mirrorRatio) {
      const blocked = state.status.totalBlocked || 0;
      const total = blocked + (state.status.totalAllowed || 0);
      const pct = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
      mirrorRatio.textContent = `${pct}% (${blocked.toLocaleString()} blocked)`;
    }
    if (mirrorRules) mirrorRules.textContent = `${(state.status.rulesCount || 245000).toLocaleString()} domains`;
    if (mirrorRssi) mirrorRssi.textContent = `${state.status.rssi || -52} dBm (Excellent)`;

    if (mirrorBadge) {
      const now = Date.now();
      const isOnline = state.online && (now - state.lastSeenMs < 45000);
      if (isOnline) {
        mirrorBadge.textContent = 'LIVE SHADOW • ONLINE';
        mirrorBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      } else {
        mirrorBadge.textContent = 'CLOUD SHADOW • STANDBY';
        mirrorBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20';
      }
    }
  }

  function renderSystemPane() {
    const livePill = document.getElementById('adblockCadenceLivePill');
    if (livePill) {
      livePill.textContent = `Cadence: ${(activePollIntervalMs / 1000).toFixed(1)}s`;
    }
    const lagPill = document.getElementById('adblockSimLatencyPill');
    if (lagPill) {
      lagPill.textContent = simulatedLatencyMs > 0 ? `Simulated Lag: +${simulatedLatencyMs}ms` : 'Simulated Lag: 0ms';
      lagPill.className = simulatedLatencyMs > 0
        ? 'px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30'
        : 'px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
    }

    const cadences = [1500, 3500, 5000, 10000];
    for (const c of cadences) {
      const btn = document.getElementById(`cadenceBtn-${c}`);
      if (btn) {
        if (activePollIntervalMs === c) {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-mono border border-cyan-500/40 bg-cyan-500/20 text-cyan-300 font-bold cursor-pointer';
        } else {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer';
        }
      }
    }

    const lags = [0, 150, 300, 500];
    for (const l of lags) {
      const btn = document.getElementById(`simLagBtn-${l}`);
      if (btn) {
        if (simulatedLatencyMs === l) {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-mono border border-cyan-500/40 bg-cyan-500/20 text-cyan-300 font-bold cursor-pointer';
        } else {
          btn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-surface-850 hover:bg-white/10 text-zinc-300 cursor-pointer';
        }
      }
    }
  }

  function switchSubTab(tabId) {
    state.activeSubTab = tabId;
    const tabs = ['clients', 'rules', 'logs', 'system', 'webview'];
    for (const t of tabs) {
      const btn = document.getElementById(`adblockSubTabBtn-${t}`);
      const pane = document.getElementById(`adblockPane-${t}`);
      if (t === tabId) {
        if (btn) btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 transition-all cursor-pointer whitespace-nowrap';
        if (pane) pane.classList.remove('hidden');
      } else {
        if (btn) btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer whitespace-nowrap';
        if (pane) pane.classList.add('hidden');
      }
    }
  }

  function onTabActivated() {
    init();
    fetchDashboard(true);
    startCanvasRenderLoop();
  }

  // Exports
  window.LuminaAdBlock = {
    init,
    onTabActivated,
    fetchDashboard,
    switchSubTab,
    onClientSearch: (val) => { state.clientSearch = val; renderClientsTable(); },
    onLogSearch: (val) => { state.logSearch = val; renderLogsTable(); },
    addBlockDomain: () => {
      const input = document.getElementById('adblockCustomDomainInput');
      const domain = (input?.value || '').trim();
      if (!domain) return;
      sendCommand('add_block', domain);
      if (input) input.value = '';
    },
    addPresetDomain: (domain) => {
      sendCommand('add_block', domain);
    },
    removeBlockDomain: (domain) => {
      sendCommand('remove_block', domain);
    },
    toggleClientBan: (ip, currentlyBanned) => {
      const cmd = currentlyBanned ? 'unban_client' : 'ban_client';
      sendCommand(cmd, ip);
    },
    triggerOtaFetch: () => {
      sendCommand('fetch_now', '');
    },
    rebootDevice: () => {
      if (window.confirm('Are you sure you want to reboot the physical ESP32 AdBlocker?')) {
        sendCommand('reboot', '');
      }
    },
    openRenameModal: (ip, currentName) => {
      state.editingClientIp = ip;
      const target = document.getElementById('adblockRenameIpTarget');
      const input = document.getElementById('adblockRenameInput');
      const modal = document.getElementById('adblockRenameModal');
      if (target) target.textContent = ip;
      if (input) input.value = currentName || '';
      if (modal) modal.classList.remove('hidden');
    },
    closeRenameModal: () => {
      state.editingClientIp = null;
      const modal = document.getElementById('adblockRenameModal');
      if (modal) modal.classList.add('hidden');
    },
    saveClientRename: () => {
      if (!state.editingClientIp) return;
      const input = document.getElementById('adblockRenameInput');
      const alias = (input?.value || '').trim();
      if (alias) {
        sendCommand('set_name', `${state.editingClientIp}|${alias}|lan`);
      }
      window.LuminaAdBlock.closeRenameModal();
    },
    openDevicePortal: () => {
      const input = document.getElementById('adblockTargetPortalUrl');
      const url = (input?.value || 'http://esp32adblock.local/').trim();
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    setTargetPortalUrl: (url) => {
      const input = document.getElementById('adblockTargetPortalUrl');
      if (input) input.value = url;
      const iframe = document.getElementById('adblockDeviceIframe');
      if (iframe && iframe.src !== 'about:blank' && iframe.src !== '') {
        iframe.src = url;
      }
    },
    copyPortalUrl: () => {
      const input = document.getElementById('adblockTargetPortalUrl');
      const url = (input?.value || 'http://esp32adblock.local/').trim();
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          if (typeof window.showToast === 'function') window.showToast('Copied LAN portal URL to clipboard!', 'success');
        }).catch(() => {});
      }
    },
    toggleIframeView: () => {
      const wrapper = document.getElementById('adblockIframeWrapper');
      const btn = document.getElementById('adblockBtnToggleFrame');
      const iframe = document.getElementById('adblockDeviceIframe');
      const fallback = document.getElementById('adblockIframeFallback');
      const status = document.getElementById('adblockFrameStatus');
      if (!wrapper) return;

      const isHidden = wrapper.classList.contains('hidden');
      if (isHidden) {
        wrapper.classList.remove('hidden');
        if (btn) btn.textContent = 'Hide In-Page Frame';
        const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
        if (isHttps) {
          if (fallback) fallback.classList.remove('hidden');
          if (status) {
            status.textContent = 'Blocked by HTTPS';
            status.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20';
          }
        } else {
          const input = document.getElementById('adblockTargetPortalUrl');
          const url = (input?.value || 'http://esp32adblock.local/').trim();
          if (iframe) {
            iframe.src = url;
            if (status) {
              status.textContent = 'Loading...';
              status.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20';
            }
          }
        }
      } else {
        wrapper.classList.add('hidden');
        if (btn) btn.textContent = 'Show In-Page Frame';
        if (status) {
          status.textContent = 'Standby';
          status.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400';
        }
      }
    },
    flushDnsCache: () => {
      sendCommand('flush_cache', '');
      if (typeof window.showToast === 'function') window.showToast('Flushed local DNS cache command sent to ESP32', 'info');
    },
    reloadIframe: () => {
      const iframe = document.getElementById('adblockDeviceIframe');
      const input = document.getElementById('adblockTargetPortalUrl');
      const url = (input?.value || 'http://esp32adblock.local/').trim();
      if (iframe) iframe.src = url;
    },
    exportClientsCSV: () => {
      const clients = state.clients || [];
      let csv = 'IP,Name,Interface,Queries,Blocked,Banned\n';
      for (const c of clients) {
        csv += `"${c.ip}","${c.name || ''}","${c.iface || ''}",${c.queries || 0},${c.blocked || 0},${c.banned ? 'true' : 'false'}\n`;
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esp32_adblock_clients_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    exportLogsCSV: () => {
      const logs = state.logs || [];
      let csv = 'Timestamp,Domain,Client_IP,Category\n';
      for (const l of logs) {
        csv += `"${new Date(l.ts || 0).toISOString()}","${l.domain || ''}","${l.ip || ''}","${l.cat || ''}"\n`;
      }
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esp32_adblock_logs_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    setPollInterval: (ms) => {
      const val = Math.max(500, parseInt(ms, 10) || 3500);
      activePollIntervalMs = val;
      state.pollIntervalMs = val;
      try {
        if (typeof window.localStorage !== 'undefined') {
          window.localStorage.setItem('lumina_adblock_poll_interval', String(val));
        }
      } catch (e) {}
      startPollingLoop();
      renderHeader();
      renderSystemPane();
      if (typeof window.showToast === 'function') {
        window.showToast('Polling Cadence Updated', `Telemetry fetch interval set to ${(val / 1000).toFixed(1)}s.`);
      }
      return activePollIntervalMs;
    },
    setSimulatedLatency: (ms) => {
      const val = Math.max(0, parseInt(ms, 10) || 0);
      simulatedLatencyMs = val;
      state.simulatedLatencyMs = val;
      try {
        if (typeof window.localStorage !== 'undefined') {
          window.localStorage.setItem('lumina_adblock_sim_latency', String(val));
        }
      } catch (e) {}
      renderHeader();
      renderSystemPane();
      if (typeof window.showToast === 'function') {
        window.showToast('Simulated Latency', val > 0 ? `Artificial network delay set to +${val}ms.` : 'Artificial network delay disabled (0ms).');
      }
      return simulatedLatencyMs;
    },
    cycleLatencyCadence: () => {
      const cadences = [1500, 3500, 5000, 10000];
      const currIdx = cadences.indexOf(activePollIntervalMs);
      const nextCadence = cadences[(currIdx + 1) % cadences.length];
      return window.LuminaAdBlock.setPollInterval(nextCadence);
    },
    getLatencyStats: () => {
      return {
        activePollIntervalMs,
        simulatedLatencyMs,
        lastRttMs: state.lastRttMs,
        isTabActive: isTabActive(),
        bgPollMs: BG_POLL_MS
      };
    }
  };

  // Auto-mount and visibility listeners
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (!isMounted) init();
      });
    } else {
      setTimeout(() => {
        if (!isMounted) init();
      }, 0);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      } else if (isTabActive()) {
        startCanvasRenderLoop();
        fetchDashboard(true);
      }
    });
  }

})(typeof window !== 'undefined' ? window : this);
