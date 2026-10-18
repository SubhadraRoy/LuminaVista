// modules/cloud-computer.js
// Lumina Vista Autonomous Cloud Computer Controller & Workstation Surface
// Manages real-time compute telemetry, 24/7 background daemons, and autonomous multi-step mission DAGs.

(function () {
  'use strict';

  let isMounted = false;
  let pollingInterval = null;
  let canvasAnimId = null;

  // Waveform visualizer state
  let canvas = null;
  let ctx = null;
  let wavePhase = 0;

  const state = {
    metrics: {
      osName: 'Lumina Vista Autonomous Cloud Computer',
      kernelVersion: 'v2.4.0-cloud-rtos',
      arch: 'x86_64 Cloud MicroVM (E2B Firecracker)',
      vcpuCores: 4,
      vcpuLoadPercent: 18.4,
      ramAllocatedMb: 1420,
      ramTotalMb: 4096,
      vfsStorageUsedMb: 184.6,
      vfsStorageTotalMb: 1024.0,
      activeSandboxes: 1,
      maxSandboxes: 8,
      activeDaemonsCount: 4,
      totalDaemonsCount: 4,
      activeMissionsCount: 0,
      systemUptimeSeconds: 86400,
      healthStatus: 'HEALTHY_AUTONOMOUS'
    },
    daemons: [],
    activeMissions: [],
    currentMission: null,
    terminalLogs: [
      `[KERNEL] Lumina Vista Autonomous Cloud Computer initialized.`,
      `[INIT] E2B MicroVM Sandbox pool ready (Tier-1 Cloud Container).`,
      `[DAEMON] 4 autonomous background daemons registered in Upstash Redis.`,
      `[READY] Standing by for autonomous mission goals.`
    ],
    selectedPreset: 'custom',
    autonomousEngineActive: true
  };

  function getAuthHeaders(extra = {}) {
    let sid = '';
    try {
      sid = window.localStorage?.getItem('lumina_session_id') ||
            window.sessionStorage?.getItem('lumina_workspace_attestation') ||
            '';
    } catch (e) {}
    const headers = { 'content-type': 'application/json', ...extra };
    if (sid && sid !== 'sovereign_session') {
      headers['x-session-id'] = sid;
    }
    return headers;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function appendTerminalLog(msg) {
    const time = new Date().toLocaleTimeString();
    state.terminalLogs.push(`[${time}] ${msg}`);
    if (state.terminalLogs.length > 100) state.terminalLogs.shift();
    renderTerminal();
  }

  async function fetchComputeStatus(silent = false) {
    try {
      const res = await window.fetch('/api/worker?action=autonomous_status', {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.metrics) state.metrics = data.metrics;
          if (Array.isArray(data.daemons)) state.daemons = data.daemons;
          if (Array.isArray(data.activeMissions)) state.activeMissions = data.activeMissions;
          renderAll();
        }
      }
    } catch (err) {
      if (!silent) console.warn('[CloudComputer] Fetch compute status error:', err);
    }
  }

  async function dispatchMission(goal, preset = 'custom') {
    const cleanGoal = (goal || '').trim();
    if (!cleanGoal) {
      if (window.showToast) window.showToast('Please specify an autonomous mission goal', 'warning');
      return;
    }

    appendTerminalLog(`🚀 Dispatching autonomous mission: "${cleanGoal.slice(0, 60)}..."`);
    try {
      const res = await window.fetch('/api/worker', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'dispatch_mission',
          goal: cleanGoal,
          preset
        })
      });
      const data = await res.json();
      if (data.success && data.mission) {
        state.currentMission = data.mission;
        appendTerminalLog(`✓ Mission registered: ${data.mission.missionId}`);
        renderMissionDag();
        renderProcessManager();
        if (window.showToast) window.showToast('Autonomous Mission Dispatched into Cloud!', 'success');

        // Poll for progress updates
        setTimeout(() => pollMissionProgress(data.mission.missionId), 1200);
      } else {
        appendTerminalLog(`✖ Mission dispatch rejected: ${data.error || 'Unknown error'}`);
        if (window.showToast) window.showToast(data.error || 'Failed to dispatch mission', 'error');
      }
    } catch (err) {
      appendTerminalLog(`✖ Network fault during mission dispatch: ${err.message}`);
    }
  }

  async function pollMissionProgress(missionId) {
    try {
      const res = await window.fetch(`/api/worker?action=mission_status&missionId=${encodeURIComponent(missionId)}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.mission) {
          state.currentMission = data.mission;
          renderMissionDag();
          renderProcessManager();
          if (data.mission.status === 'completed') {
            appendTerminalLog(`🎉 Mission ${missionId} completed successfully with 0 errors!`);
            fetchComputeStatus(true);
          }
        }
      }
    } catch (err) {
      console.warn('[CloudComputer] Mission poll error:', err);
    }
  }

  async function toggleDaemon(daemonId) {
    const daemon = state.daemons.find(d => d.id === daemonId);
    if (!daemon) return;
    const newEnabled = !daemon.enabled;
    appendTerminalLog(`⚙️ Toggling daemon ${daemon.name} -> ${newEnabled ? 'ACTIVE' : 'DISABLED'}`);

    try {
      const res = await window.fetch('/api/worker', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'toggle_daemon',
          daemonId,
          enabled: newEnabled
        })
      });
      const data = await res.json();
      if (data.success) {
        daemon.enabled = newEnabled;
        daemon.status = newEnabled ? 'idle' : 'disabled';
        renderDaemonsList();
        renderMetricsBento();
        if (window.showToast) window.showToast(`${daemon.name} is now ${newEnabled ? 'enabled' : 'disabled'}`, 'info');
      }
    } catch (err) {
      appendTerminalLog(`✖ Failed to toggle daemon: ${err.message}`);
    }
  }

  async function runDaemonNow(daemonId) {
    const daemon = state.daemons.find(d => d.id === daemonId);
    if (!daemon) return;
    appendTerminalLog(`⚡ Triggering immediate autonomous cycle for ${daemon.name}...`);

    try {
      const res = await window.fetch('/api/worker', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'run_daemon_now',
          daemonId
        })
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        Object.assign(daemon, data.daemon);
        appendTerminalLog(`✓ Cycle completed: ${data.summary || daemon.lastResult}`);
        renderDaemonsList();
        renderMetricsBento();
        if (window.showToast) window.showToast(`Completed cycle for ${daemon.name}`, 'success');
      }
    } catch (err) {
      appendTerminalLog(`✖ Failed to execute daemon cycle: ${err.message}`);
    }
  }

  function initWaveformCanvas() {
    canvas = document.getElementById('cloudCpuWaveformCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    animateWaveform();
  }

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(100, Math.floor(rect.width * dpr));
    canvas.height = Math.max(30, Math.floor(rect.height * dpr));
    if (ctx) ctx.scale(dpr, dpr);
  }

  function animateWaveform() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Draw grid background
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 20) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 15) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Draw glowing compute wave
    wavePhase += 0.04;
    const load = state.metrics?.vcpuLoadPercent || 20;
    const amplitude = (load / 100) * (h * 0.35) + 3;

    ctx.beginPath();
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 8;

    for (let x = 0; x < w; x++) {
      const y = (h / 2) + Math.sin(x * 0.03 + wavePhase) * amplitude + Math.cos(x * 0.06 - wavePhase * 0.7) * (amplitude * 0.4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      canvasAnimId = window.requestAnimationFrame(animateWaveform);
    } else {
      canvasAnimId = setTimeout(animateWaveform, 33);
    }
  }

  function renderAll() {
    renderHeader();
    renderMetricsBento();
    renderDaemonsList();
    renderMissionDag();
    renderProcessManager();
    renderTerminal();
  }

  function renderHeader() {
    const statusBadge = document.getElementById('cloudComputerStatusBadge');
    const uptimeText = document.getElementById('cloudComputerUptimeText');
    const archText = document.getElementById('cloudComputerArchText');

    if (statusBadge) {
      statusBadge.innerHTML = state.autonomousEngineActive
        ? '🟢 AUTONOMOUS CLOUD COMPUTER • ONLINE'
        : '🟠 CLOUD ENGINE • STANDBY';
      statusBadge.className = state.autonomousEngineActive
        ? 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap'
        : 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap';
    }

    if (uptimeText) {
      const sec = state.metrics.systemUptimeSeconds || 86400;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      uptimeText.textContent = `Uptime: ${h}h ${m}m`;
    }

    if (archText) {
      archText.textContent = state.metrics.arch || 'x86_64 Cloud MicroVM';
    }
  }

  function renderMetricsBento() {
    const m = state.metrics;
    const cpuEl = document.getElementById('cloudMetricCpu');
    const cpuBar = document.getElementById('cloudMetricCpuBar');
    const ramEl = document.getElementById('cloudMetricRam');
    const ramBar = document.getElementById('cloudMetricRamBar');
    const sandEl = document.getElementById('cloudMetricSandboxes');
    const vfsEl = document.getElementById('cloudMetricVfs');
    const daemonsEl = document.getElementById('cloudMetricDaemons');

    if (cpuEl) cpuEl.textContent = `${m.vcpuLoadPercent}%`;
    if (cpuBar) cpuBar.style.width = `${Math.min(100, m.vcpuLoadPercent)}%`;

    if (ramEl) ramEl.textContent = `${m.ramAllocatedMb} MB / ${m.ramTotalMb} MB`;
    if (ramBar) ramBar.style.width = `${Math.min(100, (m.ramAllocatedMb / m.ramTotalMb) * 100)}%`;

    if (sandEl) sandEl.textContent = `${m.activeSandboxes} / ${m.maxSandboxes} Active`;
    if (vfsEl) vfsEl.textContent = `${m.vfsStorageUsedMb} MB / ${m.vfsStorageTotalMb} MB`;
    if (daemonsEl) daemonsEl.textContent = `${m.activeDaemonsCount} / ${m.totalDaemonsCount} Active`;
  }

  function renderDaemonsList() {
    const list = document.getElementById('cloudDaemonsGrid');
    if (!list) return;

    if (!state.daemons || state.daemons.length === 0) {
      list.innerHTML = `<div class="p-4 text-center text-zinc-500 text-xs font-mono">Loading autonomous daemons...</div>`;
      return;
    }

    list.innerHTML = state.daemons.map(d => {
      const isEnabled = d.enabled;
      const statusColor = isEnabled ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-zinc-500 bg-zinc-800 border-zinc-700';
      const statusText = isEnabled ? (d.status === 'active' ? '⚡ RUNNING' : '🟢 ACTIVE') : '⚪ DISABLED';

      return `
        <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between hover:border-white/10 transition-all">
          <div class="space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="text-[10px] font-mono uppercase tracking-wider text-cyan-400">${escapeHtml(d.category)}</span>
                <h4 class="text-sm font-bold text-white font-heading">${escapeHtml(d.name)}</h4>
              </div>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono border ${statusColor} whitespace-nowrap">
                ${statusText}
              </span>
            </div>
            <p class="text-xs text-zinc-400 leading-relaxed">${escapeHtml(d.description)}</p>
          </div>

          <div class="space-y-2 pt-2 border-t border-white/5 text-[11px] font-mono">
            <div class="flex justify-between text-zinc-400">
              <span>Cadence:</span>
              <span class="text-zinc-200">Every ${Math.round(d.intervalSeconds / 60)} mins</span>
            </div>
            <div class="flex justify-between text-zinc-400">
              <span>Executions:</span>
              <span class="text-cyan-300 font-bold">${d.executionCount || 0} cycles</span>
            </div>
            <div class="text-[10px] text-zinc-500 truncate" title="${escapeHtml(d.lastResult || '')}">
              Last: ${escapeHtml(d.lastResult || 'Awaiting initial cycle')}
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <button onclick="window.LuminaCloudComputer.runDaemonNow('${d.id}')" class="flex-1 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer">
              ⚡ Run Now
            </button>
            <button onclick="window.LuminaCloudComputer.toggleDaemon('${d.id}')" class="px-3 py-1.5 rounded-lg ${isEnabled ? 'bg-white/5 hover:bg-white/10 text-zinc-300' : 'bg-emerald-500/15 text-emerald-300'} border border-white/10 text-xs font-semibold transition-all cursor-pointer">
              ${isEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderMissionDag() {
    const dagContainer = document.getElementById('cloudMissionDagContainer');
    const goalTitle = document.getElementById('cloudMissionGoalTitle');
    const badge = document.getElementById('cloudMissionStatusBadge');
    if (!dagContainer) return;

    const mission = state.currentMission;
    if (!mission || !mission.dag) {
      dagContainer.innerHTML = `
        <div class="p-6 text-center text-zinc-500 text-xs font-mono space-y-2">
          <div>No active mission DAG executing.</div>
          <div class="text-[11px] text-zinc-600">Select a preset below or type an autonomous goal to launch into the cloud.</div>
        </div>
      `;
      if (goalTitle) goalTitle.textContent = 'Standby for Autonomous Goal';
      if (badge) {
        badge.textContent = 'STANDBY';
        badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400';
      }
      return;
    }

    if (goalTitle) goalTitle.textContent = `Mission: "${mission.goal}"`;
    if (badge) {
      if (mission.status === 'completed') {
        badge.textContent = 'COMPLETED (0 ERRORS)';
        badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
      } else {
        badge.textContent = 'EXECUTING DAG';
        badge.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse';
      }
    }

    dagContainer.innerHTML = mission.dag.map(step => {
      let icon = '⚪';
      let borderCol = 'border-white/5';
      let statusChip = '<span class="text-[10px] text-zinc-500">PENDING</span>';

      if (step.status === 'completed') {
        icon = '✓';
        borderCol = 'border-emerald-500/30 bg-emerald-500/5';
        statusChip = `<span class="text-[10px] font-mono text-emerald-400">DONE (${step.elapsedMs}ms)</span>`;
      } else if (step.status === 'in_progress') {
        icon = '⚡';
        borderCol = 'border-cyan-500/40 bg-cyan-500/10 shadow-lg shadow-cyan-500/10';
        statusChip = '<span class="text-[10px] font-mono text-cyan-300 animate-pulse">RUNNING...</span>';
      }

      return `
        <div class="p-3 rounded-xl border ${borderCol} space-y-1.5 transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white flex items-center gap-2">
              <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-white/10 text-cyan-300">${icon}</span>
              ${escapeHtml(step.title)}
            </span>
            ${statusChip}
          </div>
          <p class="text-[11px] font-mono text-zinc-400 pl-6 leading-relaxed">${escapeHtml(step.output || '')}</p>
        </div>
      `;
    }).join('');
  }

  function renderProcessManager() {
    const tbody = document.getElementById('cloudProcessTableBody');
    if (!tbody) return;

    const mission = state.currentMission;
    const active = state.activeMissions || [];

    const rows = [];
    if (mission) {
      rows.push({
        id: mission.missionId,
        name: mission.goal.slice(0, 36) + '...',
        daemon: 'Jev-Autonomous-DAG',
        sandbox: 'microvm-e2b-sandbox-01',
        status: mission.status
      });
    }

    for (const m of active) {
      if (mission && m.missionId === mission.missionId) continue;
      rows.push({
        id: m.missionId,
        name: m.goal.slice(0, 36) + '...',
        daemon: 'Cloud Worker Job',
        sandbox: 'microvm-pool-instance',
        status: m.status
      });
    }

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-zinc-500">No active microVM processes executing.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr class="border-b border-white/5 hover:bg-white/[0.02]">
        <td class="p-2.5 font-mono text-cyan-300">${escapeHtml(r.id)}</td>
        <td class="p-2.5 text-zinc-200">${escapeHtml(r.name)}</td>
        <td class="p-2.5 text-zinc-400 font-mono text-[10px]">${escapeHtml(r.daemon)}</td>
        <td class="p-2.5 text-zinc-400 font-mono text-[10px]">${escapeHtml(r.sandbox)}</td>
        <td class="p-2.5">
          <span class="px-2 py-0.5 rounded text-[10px] font-mono ${r.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-300'}">
            ${escapeHtml(r.status.toUpperCase())}
          </span>
        </td>
      </tr>
    `).join('');
  }

  function renderTerminal() {
    const terminalEl = document.getElementById('cloudTerminalOutput');
    if (!terminalEl) return;
    terminalEl.textContent = state.terminalLogs.join('\n');
    terminalEl.scrollTop = terminalEl.scrollHeight;
  }

  function init() {
    const container = document.getElementById('tab-cloud-computer');
    if (!container || isMounted) return;

    container.innerHTML = `
      <!-- Top System Header -->
      <div class="glass-panel rounded-2xl p-3.5 sm:p-4 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></span>
            <h2 class="font-heading font-bold text-base sm:text-lg text-white tracking-tight">Autonomous Cloud Computer</h2>
          </div>
          <span id="cloudComputerStatusBadge" class="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
            🟢 AUTONOMOUS CLOUD COMPUTER • ONLINE
          </span>
          <span id="cloudComputerArchText" class="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-white/5 text-cyan-300 border border-white/10 hidden sm:inline">
            x86_64 Cloud MicroVM
          </span>
          <span id="cloudComputerUptimeText" class="text-xs font-mono text-zinc-400 hidden xl:inline">
            Uptime: 24h 0m
          </span>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button onclick="window.LuminaCloudComputer.fetchComputeStatus()" class="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer active:scale-95">
            🔄 Refresh Compute
          </button>
        </div>
      </div>

      <!-- Band 1: Real-Time Compute & Virtual Machine Telemetry (Bento Grid) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 shrink-0">
        <!-- vCPU Load -->
        <div class="glass-panel p-3.5 rounded-xl border border-white/5 flex flex-col justify-between space-y-2">
          <div class="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
            <span>vCPU Load</span>
            <span class="text-cyan-400 font-bold">4 Cores</span>
          </div>
          <div class="flex items-baseline justify-between">
            <span id="cloudMetricCpu" class="text-xl font-bold font-mono text-cyan-400">18.4%</span>
            <span class="text-[10px] font-mono text-zinc-500">Tier-1 MicroVM</span>
          </div>
          <div class="w-full h-1.5 bg-surface-900 rounded-full overflow-hidden">
            <div id="cloudMetricCpuBar" class="h-full bg-cyan-400 transition-all duration-300" style="width: 18.4%;"></div>
          </div>
        </div>

        <!-- Virtual RAM -->
        <div class="glass-panel p-3.5 rounded-xl border border-white/5 flex flex-col justify-between space-y-2">
          <div class="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
            <span>Virtual RAM</span>
            <span class="text-purple-400 font-bold">4 GB Total</span>
          </div>
          <div class="flex items-baseline justify-between">
            <span id="cloudMetricRam" class="text-sm font-bold font-mono text-purple-300">1420 MB / 4096 MB</span>
          </div>
          <div class="w-full h-1.5 bg-surface-900 rounded-full overflow-hidden">
            <div id="cloudMetricRamBar" class="h-full bg-purple-400 transition-all duration-300" style="width: 34.6%;"></div>
          </div>
        </div>

        <!-- MicroVM Sandboxes Pool -->
        <div class="glass-panel p-3.5 rounded-xl border border-white/5 flex flex-col justify-between space-y-2">
          <div class="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
            <span>MicroVM Sandboxes</span>
            <span class="text-emerald-400 font-bold">E2B Fast Path</span>
          </div>
          <div class="flex items-baseline justify-between">
            <span id="cloudMetricSandboxes" class="text-lg font-bold font-mono text-emerald-400">1 / 8 Active</span>
          </div>
          <span class="text-[9px] text-zinc-500">Auto-Scaling MicroVM Pool</span>
        </div>

        <!-- VFS Storage Storage -->
        <div class="glass-panel p-3.5 rounded-xl border border-white/5 flex flex-col justify-between space-y-2">
          <div class="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
            <span>Cloud VFS Storage</span>
            <span class="text-amber-400 font-bold">1 GB Quota</span>
          </div>
          <div class="flex items-baseline justify-between">
            <span id="cloudMetricVfs" class="text-sm font-bold font-mono text-amber-300">184.6 MB / 1024 MB</span>
          </div>
          <span class="text-[9px] text-zinc-500">GitHub Persistent Mirror</span>
        </div>

        <!-- Autonomous Daemons -->
        <div class="glass-panel p-3.5 rounded-xl border border-white/5 flex flex-col justify-between space-y-2 col-span-2 sm:col-span-1">
          <div class="flex justify-between items-center text-[10px] font-mono text-zinc-400 uppercase">
            <span>Autonomous Daemons</span>
            <span class="text-cyan-300 font-bold">24/7/365</span>
          </div>
          <div class="flex items-baseline justify-between">
            <span id="cloudMetricDaemons" class="text-lg font-bold font-mono text-cyan-300">4 / 4 Active</span>
          </div>
          <span class="text-[9px] text-zinc-500">Always-On Autonomous OS</span>
        </div>
      </div>

      <!-- Real-Time Waveform Strip -->
      <div class="glass-panel p-3 rounded-xl border border-white/5 space-y-1.5 shrink-0">
        <div class="flex justify-between items-center text-[10px] font-mono text-zinc-400">
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            Real-Time Virtual Compute Activity Waveform
          </span>
          <span>Sampling: 60 FPS • Jev System-1 Kernel</span>
        </div>
        <div class="w-full h-12 bg-surface-950/80 rounded-lg overflow-hidden border border-white/5">
          <canvas id="cloudCpuWaveformCanvas" class="w-full h-full block"></canvas>
        </div>
      </div>

      <!-- Band 2: The 4 Core Autonomous Background Daemons -->
      <div class="space-y-2 shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Active Autonomous Cloud Daemons</span>
            <span class="text-[10px] font-mono text-zinc-400">• Running in Cloud Even When PC is Off</span>
          </div>
          <span class="text-[10px] font-mono text-cyan-400">4 Active Workers</span>
        </div>
        <div id="cloudDaemonsGrid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <!-- Populated dynamically by renderDaemonsList -->
        </div>
      </div>

      <!-- Band 3: Autonomous Mission Dispatcher & Visual DAG Tracker -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0">
        <!-- Goal Dispatcher -->
        <div class="lg:col-span-5 glass-panel p-4 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Dispatch Autonomous Mission</span>
              <span class="text-[10px] font-mono text-cyan-400">Jev-Cognitive Engine</span>
            </div>
            <p class="text-xs text-zinc-400">
              State any complex objective. The Autonomous Cloud Computer will decompose it into a DAG, generate code, execute in microVM sandboxes, self-heal errors, and save artifacts into VFS.
            </p>
            <textarea id="cloudMissionGoalInput" rows="3" placeholder="e.g. Build an autonomous REST API tester script in Python, run tests in microVM, fix any edge failures, and save output report..." class="w-full bg-surface-900/90 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 resize-none font-mono"></textarea>
          </div>

          <!-- Quick Presets -->
          <div class="space-y-2">
            <span class="text-[10px] font-mono text-zinc-500">Autonomous Presets:</span>
            <div class="flex flex-wrap gap-1.5">
              <button onclick="window.LuminaCloudComputer.selectPreset('Build and verify a high-performance Python JSON data normalizer in microVM', 'autodev')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/5 transition-all cursor-pointer">🐍 Python CLI</button>
              <button onclick="window.LuminaCloudComputer.selectPreset('Conduct a deep forensic health audit of ESP32 AdBlock and Smart Lock gateways', 'sentinel')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/5 transition-all cursor-pointer">🛡️ Audit IoT</button>
              <button onclick="window.LuminaCloudComputer.selectPreset('Synthesize an analytical tech report on autonomous agent architectures into VFS', 'research')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/5 transition-all cursor-pointer">📊 AI Trends</button>
              <button onclick="window.LuminaCloudComputer.selectPreset('Optimize Google Calendar schedules and draft balanced daily focus blocks', 'calendar')" class="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/5 transition-all cursor-pointer">📅 Life Plan</button>
            </div>
          </div>

          <button onclick="window.LuminaCloudComputer.dispatchFromInput()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2">
            <span>🚀 Dispatch Mission to Cloud MicroVM</span>
          </button>
        </div>

        <!-- Visual Task DAG Container -->
        <div class="lg:col-span-7 glass-panel p-4 rounded-xl border border-white/5 space-y-3 flex flex-col justify-between">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Mission Execution DAG</span>
            <span id="cloudMissionStatusBadge" class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">STANDBY</span>
          </div>
          <div id="cloudMissionGoalTitle" class="text-xs font-mono text-cyan-300 truncate">Standby for Autonomous Goal</div>
          <div id="cloudMissionDagContainer" class="space-y-2 overflow-y-auto max-h-[220px] custom-scrollbar">
            <!-- Populated dynamically by renderMissionDag -->
          </div>
        </div>
      </div>

      <!-- Band 4: Cloud Process Manager & Live Terminal Output -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-[260px]">
        <!-- Cloud Process Table -->
        <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3 flex flex-col">
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Active MicroVM Processes</span>
            <span class="text-[10px] font-mono text-zinc-500">Live Compute Table</span>
          </div>
          <div class="overflow-x-auto custom-scrollbar flex-1 rounded-xl border border-white/5 bg-surface-950/40">
            <table class="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr class="border-b border-white/5 text-zinc-400 uppercase text-[10px] bg-white/[0.02]">
                  <th class="p-2.5">Process ID</th>
                  <th class="p-2.5">Mission / Task</th>
                  <th class="p-2.5">Daemon</th>
                  <th class="p-2.5">Sandbox</th>
                  <th class="p-2.5">State</th>
                </tr>
              </thead>
              <tbody id="cloudProcessTableBody">
                <!-- Populated dynamically -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Live Stdout Terminal -->
        <div class="glass-panel p-4 rounded-xl border border-white/5 space-y-3 flex flex-col">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span class="text-xs font-mono font-bold text-white uppercase tracking-wider">Autonomous Cloud Terminal</span>
            </div>
            <button onclick="window.LuminaCloudComputer.clearTerminal()" class="text-[10px] font-mono text-zinc-500 hover:text-zinc-300">Clear</button>
          </div>
          <pre id="cloudTerminalOutput" class="flex-1 bg-surface-950/90 rounded-xl p-3 text-[11px] font-mono text-emerald-400/90 overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed border border-white/5 select-text"></pre>
        </div>
      </div>
    `;

    isMounted = true;
    initWaveformCanvas();
    fetchComputeStatus();
    startPollingLoop();
  }

  function startPollingLoop() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      if (document.getElementById('tab-cloud-computer')?.classList.contains('hidden') === false) {
        fetchComputeStatus(true);
      }
    }, 4000);
  }

  function onTabActivated() {
    init();
    fetchComputeStatus(true);
    resizeCanvas();
  }

  // Exports
  window.LuminaCloudComputer = {
    init,
    onTabActivated,
    fetchComputeStatus,
    dispatchMission,
    dispatchFromInput: () => {
      const input = document.getElementById('cloudMissionGoalInput');
      const goal = (input?.value || '').trim();
      if (goal) {
        dispatchMission(goal, state.selectedPreset);
        if (input) input.value = '';
      }
    },
    selectPreset: (goal, preset) => {
      state.selectedPreset = preset;
      const input = document.getElementById('cloudMissionGoalInput');
      if (input) input.value = goal;
    },
    toggleDaemon,
    runDaemonNow,
    clearTerminal: () => {
      state.terminalLogs = [`[KERNEL] Terminal cleared by operator.`];
      renderTerminal();
    }
  };

  // Auto-init when DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();
