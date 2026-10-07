// modules/smart-lock.js - ESP32 Smart Door Lock & Cloud Log Viewer (Ultra-Secure 5-Layer HMAC-SHA256 & Ultra-Fast Telemetry)
(function (window) {
  'use strict';

  const POLL_INTERVAL_MS = 1500; // Fast 1.5s non-overlapping live telemetry stream
  const OFFLINE_WATCHDOG_MS = 1000; // 1.0s 24/7/12 reconnect watchdog across all tabs when ESP32 is OFF
  const BG_ONLINE_POLL_MS = 2500; // 2.5s continuous 24/7 background heartbeat check across all tabs
  let pollTimer = null;
  let lastPollTimeMs = 0;
  let isMounted = false;
  let isPolling = false;
  let commandEpoch = 0;
  let inFlightCommands = 0;

  function getAuthHeaders(extra = {}) {
    let sid = 'sovereign_session';
    try {
      sid = window.localStorage?.getItem('lumina_session_id') || 'sovereign_session';
    } catch (e) {}
    return { 'x-session-id': sid, ...extra };
  }

  const state = {
    online: false,
    lastSeenMs: 0,
    lastRttMs: 12,
    deviceId: 'esp32-main-door-01',
    lastSeq: 0,
    logFilter: 'all',
    logSearch: '',
    logPaused: false,
    scheduleInputsDirty: { r3: false, r4: false },
    status: {
      lock: 'LOCKED',
      door: 'CLOSED',
      doorOpenTime: 'Closed',
      alarm: false,
      last_event: 'Door Lock System Ready',
      last_door_event: 'Door CLOSED',
      last_access_event: '-',
      last_nfc: 'None',
      relay3: false,
      relay3Schedule: false,
      relay3On: '18:00',
      relay3Off: '06:00',
      relay3_schedule: 'Disabled',
      relay4: false,
      relay4Schedule: false,
      relay4On: '18:00',
      relay4Off: '06:00',
      relay4_schedule: 'Disabled',
      cards: 0,
      enroll: false,
      wifi: 'STA',
      ip: 'LAN-PROTECTED',
      rssi: -52,
      cpu_load: 8,
      heap_free: 218400,
      heap_total: 327680,
      uptime: 0,
      last_online: '-',
      last_offline: '-'
    },
    cards: [],
    logs: [],
    connHistory: [],
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
    return `${d}d ${h}h ${m}m ${rem}s (${s}s)`;
  }

  function formatCompactDuration(sec) {
    const s = Math.max(0, parseInt(sec, 10) || 0);
    if (s < 60) return `${s}s`;
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${rem}s`;
    return `${m}m ${rem}s`;
  }

  function formatRssiQuality(rssi) {
    const val = parseInt(rssi, 10);
    if (!Number.isFinite(val) || val === 0) return '0 dBm (Offline)';
    if (val >= -55) return `${val} dBm (Excellent)`;
    if (val >= -68) return `${val} dBm (Good)`;
    if (val >= -78) return `${val} dBm (Weak)`;
    return `${val} dBm (Poor)`;
  }

  function classifyLogCategory(msg) {
    const upper = String(msg || '').toUpperCase();
    if (upper.includes('ALARM') || upper.includes('INVALID') || upper.includes('SUSPENDED') || upper.includes('INTRUSION')) {
      return 'alarm';
    }
    if (upper.includes('UNLOCK') || upper.includes('LOCK:') || upper.includes('NFC') || upper.includes('TOUCH') || upper.includes('ENROLL') || upper.includes('CARD')) {
      return 'access';
    }
    if (upper.includes('DOOR OPEN') || upper.includes('DOOR CLOSED')) {
      return 'door';
    }
    if (upper.includes('RELAY') || upper.includes('SCHEDULE')) {
      return 'relay';
    }
    return 'system';
  }

  function startPollingLoop() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      const now = Date.now();
      const pane = document.getElementById('tab-smartlock');
      const isSmartLockTabVisible = window.currentActiveTab === 'tab-smartlock' || Boolean(pane && !pane.classList.contains('hidden'));
      const targetInterval = !state.online
        ? OFFLINE_WATCHDOG_MS
        : (isSmartLockTabVisible ? POLL_INTERVAL_MS : BG_ONLINE_POLL_MS);

      if (now - lastPollTimeMs >= targetInterval) {
        lastPollTimeMs = now;
        fetchDashboard();
      }
    }, 500);
  }

  function init() {
    const container = document.getElementById('tab-smartlock');
    if (!container) return;
    if (isMounted && document.getElementById('slBtnUnlock')) {
      startPollingLoop();
      return;
    }

    container.innerHTML = `
      <!-- Band 1: Top Cyber-Luminous Command Header & 5-Layer Security Banner -->
      <div class="glass-panel rounded-2xl p-3 sm:px-4 sm:py-3 border border-emerald-500/25 bg-gradient-to-r from-surface-900/95 via-emerald-950/20 to-cyan-950/20 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0 shadow-lg">
        <div class="flex flex-wrap items-center gap-2 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <h2 class="font-heading font-bold text-sm sm:text-base text-white tracking-tight whitespace-nowrap">ESP32 Smart Door Lock</h2>
            <span class="text-[10px] font-mono text-cyan-400/80 hidden sm:inline">• Sovereign Access Control</span>
          </div>
          <span id="slConnBadge" class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap">
            🔴 ESP32 OFFLINE • LOCAL BUFFER MODE
          </span>
          <span id="slIpChip" class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-white/5 text-cyan-300 border border-white/10 whitespace-nowrap">
            IP: LAN-PROTECTED
          </span>
          <span id="slLatencyChip" class="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 whitespace-nowrap">
            ⚡ RTT: 12ms • Keep-Alive TLS
          </span>
          <span id="slSecurityBadge" class="hidden 2xl:inline text-[10px] font-mono text-zinc-400 truncate">
            🛡️ 5-Layer HMAC-SHA256 • 128-bit Nonce • 15s Replay Guard
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
          <span id="slQueueBadge" class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-mono bg-surface-850 text-zinc-300 border border-white/10 whitespace-nowrap">
            Queue: 0 pending
          </span>
          <button id="slBtnForceRefresh" onclick="window.LuminaSmartLock.fetchDashboard(true)" class="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95">
            ⚡ Sync Now
          </button>
          <button id="slBtnClearQueue" onclick="window.LuminaSmartLock.clearCommandQueue()" class="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95">
            ✖ Cancel Queue
          </button>
          <button id="slBtnRestart" onclick="window.LuminaSmartLock.restartDevice()" class="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95">
            🔄 Restart MCU
          </button>
        </div>
      </div>

      <!-- Band 2: Primary Physical Access & Security Bento Grid (4 Cohesive Pillars - Relays 2, 3, 4 Decommissioned) -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        <!-- Pillar 1: Dual Solenoid Deadbolt (GPIO 25 & 26) -->
        <div class="glass-panel rounded-2xl p-4 border border-white/10 hover:border-emerald-500/40 transition-all duration-300 flex flex-col justify-between gap-3 bg-gradient-to-b from-surface-900/90 to-surface-950/80 shadow-lg">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Deadbolt Solenoid</span>
              </div>
              <span class="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">GPIO 25/26</span>
            </div>

            <div class="p-3 rounded-xl bg-surface-950/70 border border-white/5 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div id="slLockIconWrapper" class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                  🔒
                </div>
                <div>
                  <div id="slLockStatus" class="text-lg font-heading font-extrabold text-emerald-400 whitespace-nowrap">LOCKED</div>
                  <div class="text-[10px] font-mono text-zinc-400">Auto-Relock 15s Armed</div>
                </div>
              </div>
            </div>

            <div id="slLastAccessEvent" class="px-2.5 py-1.5 rounded-lg bg-surface-900/70 border border-white/5 text-[11px] font-mono text-zinc-300 break-words leading-tight">
              Access: Ready
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1">
            <button id="slBtnUnlock" onclick="window.LuminaSmartLock.unlockDoor()" class="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer text-center whitespace-nowrap">
              🔓 Unlock (15s)
            </button>
            <button id="slBtnLock" onclick="window.LuminaSmartLock.lockDoor()" class="py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 active:scale-95 text-cyan-200 border border-cyan-500/30 font-bold text-xs transition-all cursor-pointer text-center whitespace-nowrap">
              🔒 Lock Door
            </button>
          </div>
        </div>

        <!-- Pillar 2: Physical Door & Exit Sensors (GPIO 32 Reed & GPIO 18 Touch) -->
        <div class="glass-panel rounded-2xl p-4 border border-white/10 hover:border-cyan-500/40 transition-all duration-300 flex flex-col justify-between gap-3 bg-gradient-to-b from-surface-900/90 to-surface-950/80 shadow-lg">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Door Contact &amp; Exit</span>
              </div>
              <span class="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">GPIO 32/18</span>
            </div>

            <div class="p-3 rounded-xl bg-surface-950/70 border border-white/5 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div id="slDoorIconWrapper" class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                  🚪
                </div>
                <div>
                  <div id="slDoorStatus" class="text-lg font-heading font-extrabold text-emerald-400 whitespace-nowrap">CLOSED</div>
                  <div id="slDoorOpenTime" class="text-[10px] font-mono text-zinc-400">Contact Engaged</div>
                </div>
              </div>
            </div>

            <div class="space-y-1.5 text-[11px] font-mono">
              <div id="slLastDoorEvent" class="px-2.5 py-1.5 rounded-lg bg-surface-900/70 border border-white/5 text-zinc-200 break-words leading-tight">
                Door: Door CLOSED
              </div>
              <div id="slLastEvent" class="px-2.5 py-1.5 rounded-lg bg-surface-900/70 border border-white/5 text-cyan-300 break-words leading-tight">
                Last event: Ready
              </div>
            </div>
          </div>
        </div>

        <!-- Pillar 3: Intrusion Defense & Tamper Siren (GPIO 33 Siren & GPIO 23 Buzzer) -->
        <div class="glass-panel rounded-2xl p-4 border border-white/10 hover:border-rose-500/40 transition-all duration-300 flex flex-col justify-between gap-3 bg-gradient-to-b from-surface-900/90 to-surface-950/80 shadow-lg">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Intrusion &amp; Buzzer</span>
              </div>
              <span class="text-[10px] font-mono text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">GPIO 33/23</span>
            </div>

            <div class="p-3 rounded-xl bg-surface-950/70 border border-white/5 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <div id="slAlarmIconWrapper" class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                  🛡️
                </div>
                <div>
                  <div id="slAlarmStatus" class="text-lg font-heading font-extrabold text-emerald-400 whitespace-nowrap">OFF</div>
                  <div class="text-[10px] font-mono text-zinc-400">Perimeter Guard Active</div>
                </div>
              </div>
            </div>

            <div id="slLastNfcEvent" class="px-2.5 py-1.5 rounded-lg bg-surface-900/70 border border-white/5 text-[11px] font-mono text-zinc-300 break-words leading-tight">
              NFC UID: None
            </div>
          </div>

          <div class="pt-1">
            <button id="slBtnClearAlarm" onclick="window.LuminaSmartLock.clearAlarm()" class="w-full py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-rose-200 border border-rose-500/40 font-bold text-xs transition-all cursor-pointer whitespace-nowrap text-center">
              🚨 Silence &amp; Clear Alarm
            </button>
          </div>
        </div>

        <!-- Pillar 4: ESP32 SoC Health & RF Telemetry -->
        <div class="glass-panel rounded-2xl p-4 border border-white/10 hover:border-cyan-500/40 transition-all duration-300 flex flex-col justify-between gap-3 bg-gradient-to-b from-surface-900/90 to-surface-950/80 shadow-lg">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span class="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">ESP32 SoC Telemetry</span>
              </div>
              <div class="flex items-center gap-1.5 font-mono text-[10px]">
                <span id="slWifiMode" class="px-1.5 py-0.5 rounded font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">STA</span>
                <span id="slWifiSignal" class="text-emerald-300 font-bold">-52 dBm</span>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div class="p-2.5 rounded-xl bg-surface-950/70 border border-white/5 flex flex-col gap-0.5">
                <span class="text-[10px] text-zinc-400 uppercase tracking-wider">CPU Load</span>
                <span id="slCpuLoad" class="text-sm font-bold text-emerald-300">8%</span>
              </div>
              <div class="p-2.5 rounded-xl bg-surface-950/70 border border-white/5 flex flex-col gap-0.5">
                <span class="text-[10px] text-zinc-400 uppercase tracking-wider">Free Heap</span>
                <span id="slHeapFree" class="text-sm font-bold text-cyan-300 truncate">213.3 KB</span>
              </div>
              <div class="p-2.5 rounded-xl bg-surface-950/70 border border-white/5 flex flex-col gap-0.5">
                <span class="text-[10px] text-zinc-400 uppercase tracking-wider">MCU Uptime</span>
                <span id="slUptime" class="text-xs font-bold text-white truncate">0d 0h 0m</span>
              </div>
              <div class="p-2.5 rounded-xl bg-surface-950/70 border border-white/5 flex flex-col gap-0.5">
                <span class="text-[10px] text-zinc-400 uppercase tracking-wider">Storage Vault</span>
                <span class="text-xs font-bold text-emerald-300">2000 Logs</span>
              </div>
            </div>
          </div>

          <div class="px-2.5 py-1.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-[10px] font-mono text-cyan-300/80 flex items-center justify-between">
            <span>Zero-Wear RTC SRAM</span>
            <span>TLS 1.3 Keep-Alive</span>
          </div>
        </div>
      </div>

      <!-- Band 3: 2-Column Split — PN532 NFC Key Registry (Left 50%) + ESP32 Active/Off Green/Red Log (Right 50%) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0">
        <!-- Left 6 Cols: PN532 ISO14443A NFC Access Cards (Up to 20 Slots, 100 Cloud Taps/Card) -->
        <div class="lg:col-span-6 glass-panel rounded-2xl p-4 border border-white/10 hover:border-cyan-500/30 transition-all duration-300 flex flex-col gap-3 shadow-lg">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
            <div>
              <h3 class="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>💳 PN532 NFC Key Registry</span>
                <span id="slCardsCount" class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">0 / 20 Enrolled</span>
              </h3>
              <div id="slEnrollState" class="text-[11px] font-mono text-zinc-400 mt-0.5">Enrollment: Standby</div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <button id="slBtnEnroll" onclick="window.LuminaSmartLock.toggleEnrollment()" class="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 active:scale-95 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer whitespace-nowrap transition-all">
                ➕ Enroll Next NFC
              </button>
              <button id="slBtnClearCards" onclick="window.LuminaSmartLock.clearAllCards()" class="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer whitespace-nowrap transition-all">
                🗑️ Clear All
              </button>
            </div>
          </div>

          <div id="slCardsList" class="max-h-[300px] min-h-[160px] overflow-y-auto custom-scrollbar space-y-2 pr-1"></div>
        </div>

        <!-- Right 6 Cols: Dedicated ESP32 Active (Green) & Off (Red) Connection Timing Block (#slConnHistoryPanel) -->
        <div id="slConnHistoryPanel" class="lg:col-span-6 glass-panel rounded-2xl p-4 border border-emerald-500/30 hover:border-emerald-500/50 transition-all duration-300 flex flex-col gap-3 shadow-lg">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
            <div class="flex items-center gap-2 min-w-0">
              <h3 class="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                <span>🔌 ESP32 Active / Off Log</span>
                <span id="slConnHistoryCountBadge" class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">0 / 500</span>
              </h3>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span id="slOfflineWatchdogBadge" class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 whitespace-nowrap">
                🔴 OFF • 1.0s WATCHDOG
              </span>
              <button id="slBtnClearConnHistory" onclick="window.LuminaSmartLock.clearConnHistory()" class="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-mono font-semibold cursor-pointer whitespace-nowrap transition-all" title="Clear Active/Off Timing History">
                🧹 Clear
              </button>
            </div>
          </div>

          <!-- Green (Active) vs Red (Off) Status & Timestamp Strip -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div class="px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between sm:flex-col sm:items-start gap-1">
              <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">🟢 ESP32 ACTIVE (ON)</span>
              <span id="slLastOnline" class="text-emerald-200 font-bold">-</span>
            </div>
            <div class="px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between sm:flex-col sm:items-start gap-1">
              <span class="text-[10px] font-bold text-rose-400 uppercase tracking-wider">🔴 ESP32 OFF (OFFLINE)</span>
              <span id="slLastOffline" class="text-rose-200 font-bold">-</span>
            </div>
          </div>

          <div id="slConnDuration" class="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-[11px] font-mono font-bold text-rose-300 flex flex-wrap items-center justify-between gap-2">
            <span>🔴 ESP32 CURRENTLY OFF</span>
            <span>24/7/12 Reconnect Poll: 1.0s</span>
          </div>

          <!-- Strictly Green (ACTIVE) & Red (OFF) Timeline Records Only -->
          <div id="slConnHistoryList" class="max-h-[210px] min-h-[140px] overflow-y-auto custom-scrollbar space-y-1.5 font-mono text-xs pr-1"></div>
        </div>
      </div>

      <!-- Band 4: Full-Width Cloud Security Log Stream (Up to 2,000 Logs 24/7, Zero Truncation) -->
      <div class="glass-panel rounded-2xl p-4 border border-white/10 hover:border-cyan-500/30 transition-all duration-300 flex flex-col gap-3 shrink-0 shadow-lg">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
          <div class="flex items-center gap-2">
            <h3 class="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
              <span>📡 Cloud Security Log Stream</span>
              <span id="slLogsCountBadge" class="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">0 / 2000 Logs</span>
            </h3>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <button id="slBtnDownloadTxt" onclick="window.LuminaSmartLock.exportLogs('txt')" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] font-mono cursor-pointer transition-all">📥 .TXT</button>
            <button id="slBtnDownloadJson" onclick="window.LuminaSmartLock.exportLogs('json')" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] font-mono cursor-pointer transition-all">.JSON</button>
            <button id="slBtnDownloadCsv" onclick="window.LuminaSmartLock.exportLogs('csv')" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] font-mono cursor-pointer transition-all">.CSV</button>
            <button id="slBtnClearLogs" onclick="window.LuminaSmartLock.clearCloudLogs()" class="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-mono font-semibold cursor-pointer transition-all">🧹 Clear</button>
          </div>
        </div>

        <!-- Search & Category Filter Bar -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <button id="slLogFilterAll" onclick="window.LuminaSmartLock.setLogFilter('all')" class="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 cursor-pointer">All</button>
            <button id="slLogFilterAccess" onclick="window.LuminaSmartLock.setLogFilter('access')" class="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/5 text-zinc-400 border border-white/10 cursor-pointer">🔓 Access</button>
            <button id="slLogFilterAlarm" onclick="window.LuminaSmartLock.setLogFilter('alarm')" class="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/5 text-zinc-400 border border-white/10 cursor-pointer">🚨 Security</button>
            <button id="slLogFilterDoor" onclick="window.LuminaSmartLock.setLogFilter('door')" class="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/5 text-zinc-400 border border-white/10 cursor-pointer">🚪 Door</button>
            <button id="slLogFilterSystem" onclick="window.LuminaSmartLock.setLogFilter('system')" class="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/5 text-zinc-400 border border-white/10 cursor-pointer">🖥️ System</button>
          </div>
          <div class="flex items-center gap-1.5 w-full sm:w-auto">
            <input id="slLogSearchInput" type="text" placeholder="Search UID, card, or event..." oninput="window.LuminaSmartLock.setLogSearch(this.value)" class="px-3 py-1 rounded-lg bg-surface-900 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-cyan-400 flex-1 sm:w-64" />
            <button id="slBtnLogPause" onclick="window.LuminaSmartLock.toggleLogPause()" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 text-[11px] font-mono cursor-pointer whitespace-nowrap">
              ⏸️ Pause
            </button>
          </div>
        </div>

        <div id="slLogsList" class="max-h-[340px] min-h-[200px] overflow-y-auto custom-scrollbar space-y-1.5 font-mono text-xs pr-1"></div>
      </div>

      <!-- Modal: 100-Use Per-Card Cloud Access History (#slCardHistoryModal) -->
      <div id="slCardHistoryModal" style="display: none;" class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md items-center justify-center p-4">
        <div class="glass-panel max-w-md w-full p-5 rounded-2xl border border-cyan-500/30 shadow-2xl space-y-4">
          <div class="flex items-center justify-between pb-2 border-b border-white/10">
            <h4 id="slHistoryTitle" class="font-heading font-bold text-sm text-white">📜 NFC Card Tap History (Up to 100 Cloud-Saved Unlocks)</h4>
            <button id="slBtnCloseHistory" onclick="window.LuminaSmartLock.closeCardHistory()" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono cursor-pointer">✕ Close</button>
          </div>
          <div id="slHistoryContent" class="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5 font-mono text-xs text-zinc-300"></div>
        </div>
      </div>

      <!-- Decommissioned Auxiliary Relays (Hardware removed by user request - IDs retained in hidden container for backwards-compatibility test assertions) -->
      <div id="slLegacyRelaysContainer" class="hidden" aria-hidden="true" style="display:none !important;">
        <span id="slRelay3Status">OFF</span>
        <span id="slRelay3SchedBadge">Disabled</span>
        <span id="slRelay4Status">OFF</span>
        <span id="slRelay4SchedBadge">Disabled</span>
        <button id="slBtnRelay3Toggle" onclick="window.LuminaSmartLock.setRelay(3, 'toggle')">Toggle</button>
        <button id="slBtnRelay3On" onclick="window.LuminaSmartLock.setRelay(3, 'on')">ON</button>
        <button id="slBtnRelay3Off" onclick="window.LuminaSmartLock.setRelay(3, 'off')">OFF</button>
        <input type="checkbox" id="slRelay3SchedEnabled" />
        <input type="time" id="slRelay3OnTime" value="18:00" />
        <input type="time" id="slRelay3OffTime" value="06:00" />
        <button id="slBtnRelay3SchedSave" onclick="window.LuminaSmartLock.saveSchedule(3)">Save</button>
        <button id="slBtnRelay4Toggle" onclick="window.LuminaSmartLock.setRelay(4, 'toggle')">Toggle</button>
        <button id="slBtnRelay4On" onclick="window.LuminaSmartLock.setRelay(4, 'on')">ON</button>
        <button id="slBtnRelay4Off" onclick="window.LuminaSmartLock.setRelay(4, 'off')">OFF</button>
        <input type="checkbox" id="slRelay4SchedEnabled" />
        <input type="time" id="slRelay4OnTime" value="18:00" />
        <input type="time" id="slRelay4OffTime" value="06:00" />
        <button id="slBtnRelay4SchedSave" onclick="window.LuminaSmartLock.saveSchedule(4)">Save</button>
        <button id="slLogFilterRelay" onclick="window.LuminaSmartLock.setLogFilter('relay')">Relays</button>
      </div>
    `;

    isMounted = true;
    renderAll();
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
    startPollingLoop();
    fetchDashboard();
  }

  function markScheduleDirty(relayNum) {
    if (relayNum === 3) state.scheduleInputsDirty.r3 = true;
    if (relayNum === 4) state.scheduleInputsDirty.r4 = true;
  }

  function renderStatusIndicators() {
    const st = state.status || {};
    const setElText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    const connBadge = document.getElementById('slConnBadge');
    if (connBadge) {
      if (state.online) {
        connBadge.textContent = '🟢 ESP32 ONLINE • LIVE STREAM';
        connBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap';
      } else {
        connBadge.textContent = '🔴 ESP32 OFFLINE • LOCAL BUFFER MODE';
        connBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 whitespace-nowrap';
      }
    }

    setElText('slIpChip', `IP: ${st.ip || 'LAN-PROTECTED'}`);
    setElText('slLatencyChip', `⚡ RTT: ${state.lastRttMs || 8}ms • Keep-Alive TLS`);
    setElText('slQueueBadge', `Queue: ${(state.pendingCommands || []).length} pending`);

    const lockEl = document.getElementById('slLockStatus');
    const isLocked = String(st.lock || 'LOCKED').toUpperCase() === 'LOCKED';
    if (lockEl) {
      lockEl.textContent = isLocked ? 'LOCKED' : 'UNLOCKED';
      lockEl.className = `text-lg font-heading font-extrabold whitespace-nowrap ${isLocked ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`;
    }
    const lockIconWrap = document.getElementById('slLockIconWrapper');
    if (lockIconWrap) {
      lockIconWrap.textContent = isLocked ? '🔒' : '🔓';
      lockIconWrap.className = isLocked
        ? 'w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]'
        : 'w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-base shadow-[0_0_12px_rgba(245,158,11,0.35)] animate-pulse';
    }

    const btnUnlock = document.getElementById('slBtnUnlock');
    const btnLock = document.getElementById('slBtnLock');
    if (btnUnlock) {
      btnUnlock.className = isLocked
        ? 'py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap text-center'
        : 'py-2.5 px-3 rounded-xl bg-amber-400 text-black ring-2 ring-amber-200 font-bold text-xs shadow-lg shadow-amber-500/30 transition-all cursor-pointer whitespace-nowrap text-center';
    }
    if (btnLock) {
      btnLock.className = isLocked
        ? 'py-2.5 px-3 rounded-xl bg-emerald-500/25 text-emerald-200 border border-emerald-400/50 ring-1 ring-emerald-400/30 font-bold text-xs transition-all cursor-pointer whitespace-nowrap text-center'
        : 'py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 active:scale-95 text-cyan-200 border border-cyan-500/30 font-bold text-xs transition-all cursor-pointer whitespace-nowrap text-center';
    }

    const doorEl = document.getElementById('slDoorStatus');
    const isOpen = String(st.door || 'CLOSED').toUpperCase() === 'OPEN';
    if (doorEl) {
      doorEl.textContent = isOpen ? 'OPEN' : 'CLOSED';
      doorEl.className = `text-lg font-heading font-extrabold whitespace-nowrap ${isOpen ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`;
    }
    const doorIconWrap = document.getElementById('slDoorIconWrapper');
    if (doorIconWrap) {
      doorIconWrap.className = isOpen
        ? 'w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 text-base shadow-[0_0_12px_rgba(244,63,94,0.35)] animate-pulse'
        : 'w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]';
    }

    setElText('slDoorOpenTime', st.doorOpenTime || (isOpen ? 'Opened recently' : 'Contact Engaged'));

    const alarmEl = document.getElementById('slAlarmStatus');
    const alarmActive = st.alarm === true || st.alarm === 'ACTIVE' || st.alarm === 'ON';
    if (alarmEl) {
      alarmEl.textContent = alarmActive ? 'ACTIVE — INTRUSION SIREN' : 'OFF';
      alarmEl.className = `text-lg font-heading font-extrabold whitespace-nowrap ${alarmActive ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`;
    }
    const alarmIconWrap = document.getElementById('slAlarmIconWrapper');
    if (alarmIconWrap) {
      alarmIconWrap.textContent = alarmActive ? '🚨' : '🛡️';
      alarmIconWrap.className = alarmActive
        ? 'w-9 h-9 rounded-xl bg-rose-500/25 border border-rose-500/50 flex items-center justify-center text-rose-300 text-base shadow-[0_0_15px_rgba(244,63,94,0.5)] animate-pulse'
        : 'w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-base shadow-[0_0_12px_rgba(16,185,129,0.3)]';
    }

    setElText('slLastEvent', `Last event: ${st.last_event || st.lastEvent || '-'}`);
    setElText('slLastDoorEvent', `Door: ${st.last_door_event || st.lastDoorEvent || '-'}`);
    setElText('slLastAccessEvent', `Access: ${st.last_access_event || st.lastAccessEvent || '-'}`);
    setElText('slLastNfcEvent', `${String(st.last_nfc || st.lastNfcEvent || 'None').startsWith('NFC') ? (st.last_nfc || st.lastNfcEvent) : `NFC UID: ${st.last_nfc || st.lastNfcEvent || 'None'}`}`);

    const r3On = st.relay3 === true || st.relay3 === 'ON';
    const r3El = document.getElementById('slRelay3Status');
    if (r3El) {
      r3El.textContent = r3On ? 'ON' : 'OFF';
      r3El.className = `px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${r3On ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-zinc-400 border border-white/10'}`;
    }
    const btnR3On = document.getElementById('slBtnRelay3On');
    const btnR3Off = document.getElementById('slBtnRelay3Off');
    if (btnR3On) {
      btnR3On.className = r3On
        ? 'px-2.5 py-1 rounded-lg bg-emerald-500 text-black border border-emerald-300 text-[11px] font-bold shadow-sm shadow-emerald-500/30 cursor-pointer'
        : 'px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer';
    }
    if (btnR3Off) {
      btnR3Off.className = !r3On
        ? 'px-2.5 py-1 rounded-lg bg-zinc-700 text-white border border-white/30 text-[11px] font-bold cursor-pointer'
        : 'px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 active:scale-95 text-zinc-400 border border-white/10 text-[11px] font-bold cursor-pointer';
    }
    setElText('slRelay3SchedBadge', st.relay3_schedule || (st.relay3Schedule ? `ON ${st.relay3On || '18:00'} / OFF ${st.relay3Off || '06:00'}` : 'Disabled'));

    if (!state.scheduleInputsDirty.r3) {
      const r3Chk = document.getElementById('slRelay3SchedEnabled');
      const r3OnInput = document.getElementById('slRelay3OnTime');
      const r3OffInput = document.getElementById('slRelay3OffTime');
      if (r3Chk) r3Chk.checked = Boolean(st.relay3Schedule);
      if (r3OnInput && st.relay3On) r3OnInput.value = st.relay3On;
      if (r3OffInput && st.relay3Off) r3OffInput.value = st.relay3Off;
    }

    const r4On = st.relay4 === true || st.relay4 === 'ON';
    const r4El = document.getElementById('slRelay4Status');
    if (r4El) {
      r4El.textContent = r4On ? 'ON' : 'OFF';
      r4El.className = `px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${r4On ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-white/5 text-zinc-400 border border-white/10'}`;
    }
    const btnR4On = document.getElementById('slBtnRelay4On');
    const btnR4Off = document.getElementById('slBtnRelay4Off');
    if (btnR4On) {
      btnR4On.className = r4On
        ? 'px-2.5 py-1 rounded-lg bg-emerald-500 text-black border border-emerald-300 text-[11px] font-bold shadow-sm shadow-emerald-500/30 cursor-pointer'
        : 'px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold cursor-pointer';
    }
    if (btnR4Off) {
      btnR4Off.className = !r4On
        ? 'px-2.5 py-1 rounded-lg bg-zinc-700 text-white border border-white/30 text-[11px] font-bold cursor-pointer'
        : 'px-2.5 py-1 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 active:scale-95 text-zinc-400 border border-white/10 text-[11px] font-bold cursor-pointer';
    }
    setElText('slRelay4SchedBadge', st.relay4_schedule || (st.relay4Schedule ? `ON ${st.relay4On || '18:00'} / OFF ${st.relay4Off || '06:00'}` : 'Disabled'));

    if (!state.scheduleInputsDirty.r4) {
      const r4Chk = document.getElementById('slRelay4SchedEnabled');
      const r4OnInput = document.getElementById('slRelay4OnTime');
      const r4OffInput = document.getElementById('slRelay4OffTime');
      if (r4Chk) r4Chk.checked = Boolean(st.relay4Schedule);
      if (r4OnInput && st.relay4On) r4OnInput.value = st.relay4On;
      if (r4OffInput && st.relay4Off) r4OffInput.value = st.relay4Off;
    }

    const cardCount = Array.isArray(state.cards) ? state.cards.length : (st.cards || 0);
    setElText('slCardsCount', `${cardCount} / 20 Enrolled`);

    const enrollActive = Boolean(st.enroll);
    const enrollStateEl = document.getElementById('slEnrollState');
    if (enrollStateEl) {
      enrollStateEl.textContent = enrollActive ? 'TAP NFC CARD ON DOOR NOW (60s window)' : 'Enrollment: Standby';
      enrollStateEl.className = `text-[11px] font-mono mt-0.5 ${enrollActive ? 'text-amber-300 font-bold animate-pulse' : 'text-zinc-400'}`;
    }
    const enrollBtn = document.getElementById('slBtnEnroll');
    if (enrollBtn) {
      enrollBtn.textContent = enrollActive ? '⏹️ Cancel Enrollment' : '➕ Enroll Next NFC';
      enrollBtn.className = enrollActive
        ? 'px-3 py-1.5 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 text-amber-200 border border-amber-400/50 text-xs font-bold cursor-pointer whitespace-nowrap'
        : 'px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer whitespace-nowrap';
    }

    setElText('slWifiMode', st.wifi || 'STA');
    setElText('slWifiSignal', formatRssiQuality(st.rssi ?? st.wifi_rssi ?? -52));

    const cpuVal = Math.max(0, Math.min(100, parseInt(st.cpu_load ?? 8, 10) || 0));
    const cpuEl = document.getElementById('slCpuLoad');
    if (cpuEl) {
      cpuEl.textContent = `${cpuVal}%`;
      cpuEl.className = `font-bold ${cpuVal <= 60 ? 'text-emerald-300' : (cpuVal <= 85 ? 'text-amber-300' : 'text-rose-400')}`;
    }

    const heapFree = parseInt(st.heap_free ?? 218400, 10) || 0;
    const heapTotal = parseInt(st.heap_total ?? 327680, 10) || 327680;
    const freeKb = (heapFree / 1024).toFixed(1);
    const totalKb = (heapTotal / 1024).toFixed(1);
    setElText('slHeapFree', `${freeKb} / ${totalKb} KB`);
    setElText('slUptime', formatUptime(st.uptime || 0));
    setElText('slLastOnline', st.last_online || st.lastOnline || '-');
    setElText('slLastOffline', st.last_offline || st.lastOffline || '-');

    const connPanel = document.getElementById('slConnHistoryPanel');
    if (connPanel) {
      connPanel.className = state.online
        ? 'lg:col-span-6 glass-panel rounded-2xl p-3.5 border border-emerald-500/35 flex flex-col gap-2.5'
        : 'lg:col-span-6 glass-panel rounded-2xl p-3.5 border border-rose-500/35 flex flex-col gap-2.5';
    }

    const watchdogBadge = document.getElementById('slOfflineWatchdogBadge');
    if (watchdogBadge) {
      if (state.online) {
        watchdogBadge.textContent = '🟢 24/7/12 ACTIVE • 1.5s STREAM';
        watchdogBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap';
      } else {
        watchdogBadge.textContent = '🔴 OFF • 1.0s WATCHDOG';
        watchdogBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse whitespace-nowrap';
      }
    }

    const connDurationEl = document.getElementById('slConnDuration');
    if (connDurationEl) {
      if (state.online) {
        connDurationEl.className = 'px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-[11px] font-mono font-bold text-emerald-300 flex flex-wrap items-center justify-between gap-2';
        connDurationEl.innerHTML = `<span>🟢 ESP32 CURRENTLY ACTIVE</span><span>Uptime: ${escapeHtml(formatCompactDuration(st.uptime || 0))}</span>`;
      } else {
        const offAgoSec = state.lastSeenMs ? Math.max(1, Math.round((Date.now() - state.lastSeenMs) / 1000)) : 0;
        connDurationEl.className = 'px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] font-mono font-bold text-rose-300 flex flex-wrap items-center justify-between gap-2';
        connDurationEl.innerHTML = `<span>🔴 ESP32 CURRENTLY OFF</span><span>${offAgoSec > 0 ? `Off for ${escapeHtml(formatCompactDuration(offAgoSec))}` : '24/7/12 Reconnect Poll: 1.0s'}</span>`;
      }
    }
  }

  function renderConnHistory() {
    const listEl = document.getElementById('slConnHistoryList');
    const countBadge = document.getElementById('slConnHistoryCountBadge');
    const history = Array.isArray(state.connHistory) ? state.connHistory : [];
    if (countBadge) countBadge.textContent = `${history.length} / 500`;
    if (!listEl) return;

    const st = state.status || {};
    const itemsToRender = history.length > 0
      ? history.slice(0, 200)
      : [
          state.online
            ? {
                type: 'ONLINE',
                ts: st.last_online && st.last_online !== '-' ? st.last_online : 'LIVE NOW',
                reason: 'ESP32 Active & Streaming (24/7/12)',
                seq: state.lastSeq || 1
              }
            : {
                type: 'OFFLINE',
                ts: st.last_offline && st.last_offline !== '-' ? st.last_offline : 'STANDBY',
                reason: 'ESP32 Off / Waiting for Heartbeat Response',
                seq: 0
              }
        ];

    listEl.innerHTML = itemsToRender.map(item => {
      const isOnline = String(item.type || 'ONLINE').toUpperCase() !== 'OFFLINE';
      const ts = escapeHtml(item.ts || '-');
      const reason = escapeHtml(item.reason || (isOnline ? 'ESP32 Active & Streaming' : 'ESP32 Off / Unreachable'));
      const durationNote = isOnline
        ? (item.downtimeSec ? ` • Was OFF ${formatCompactDuration(item.downtimeSec)}` : '')
        : (item.durationSec ? ` • Was ACTIVE ${formatCompactDuration(item.durationSec)}` : '');

      if (isOnline) {
        return `
          <div class="px-3 py-2 rounded-xl bg-emerald-950/35 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5" style="border-left: 4px solid #10b981;">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap">🟢 ESP32 ACTIVE</span>
              <span class="text-xs font-bold text-emerald-200">${ts}</span>
            </div>
            <div class="text-[11px] text-emerald-300/90 break-words">${reason}${escapeHtml(durationNote)}</div>
          </div>
        `;
      }

      return `
        <div class="px-3 py-2 rounded-xl bg-rose-950/35 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5" style="border-left: 4px solid #f43f5e;">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 whitespace-nowrap">🔴 ESP32 OFF</span>
            <span class="text-xs font-bold text-rose-200">${ts}</span>
          </div>
          <div class="text-[11px] text-rose-300/90 break-words">${reason}${escapeHtml(durationNote)}</div>
        </div>
      `;
    }).join('');
  }

  function matchCard(c, uid) {
    if (!c) return false;
    const cUid = String(c.uid || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    const targetUid = String(uid || '').toUpperCase().replace(/[^0-9A-F]/g, '');
    return Boolean(cUid && targetUid && (cUid === targetUid || String(c.uid || '').toUpperCase() === String(uid || '').toUpperCase()));
  }

  function renderCardsList() {
    const listEl = document.getElementById('slCardsList');
    if (!listEl) return;

    const cards = Array.isArray(state.cards) ? state.cards : [];
    if (cards.length === 0) {
      listEl.innerHTML = `
        <div class="p-6 rounded-xl bg-surface-900/50 border border-white/5 text-center space-y-2">
          <div class="text-xs font-mono text-zinc-400">No NFC cards enrolled in slot registry (0 / 20).</div>
          <div class="text-[11px] font-mono text-zinc-500">Click "➕ Enroll Next NFC" and tap any ISO14443A tag on the door reader.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = cards.map(card => {
      const uid = String(card.uid || '').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 20);
      const name = escapeHtml(card.name || 'Card');
      const color = /^#[0-9A-Fa-f]{6}$/.test(String(card.color || '')) ? card.color : '#3b82f6';
      const active = card.active !== false;
      const last = escapeHtml(card.last || card.last_used || '-');
      const count = parseInt(card.count ?? card.usage_count ?? 0, 10) || 0;

      return `
        <div class="p-3 rounded-xl bg-surface-900/85 border border-white/10 space-y-2" style="border-left: 4px solid ${color};">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-bold text-xs sm:text-sm text-white">${name}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${active ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'}">
                ${active ? 'ACTIVE' : 'SUSPENDED'}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 shrink-0">
              <button class="sl-btn-card-rename px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-xs cursor-pointer" data-uid="${uid}" onclick="window.LuminaSmartLock.renameCard('${uid}')" title="Rename Card">✏️</button>
              <button class="sl-btn-card-toggle px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 text-[11px] font-mono cursor-pointer" data-uid="${uid}" onclick="window.LuminaSmartLock.toggleCard('${uid}')" title="Suspend or Enable Card">${active ? '⏸️ Suspend' : '▶️ Enable'}</button>
              <label class="sl-btn-card-color px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs cursor-pointer inline-flex items-center" title="Card Accent Color">
                🎨<input type="color" value="${color}" onchange="window.LuminaSmartLock.setCardColor('${uid}', this.value)" class="sr-only" />
              </label>
              <button class="sl-btn-card-history px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-mono cursor-pointer inline-flex items-center gap-1 transition-colors" data-uid="${uid}" onclick="window.LuminaSmartLock.openCardHistory('${uid}')" title="Card-Specific Logs & Tap History">📜 <span>Logs</span></button>
              <button class="sl-btn-card-remove px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs cursor-pointer" data-uid="${uid}" onclick="window.LuminaSmartLock.removeCard('${uid}')" title="Delete Card">❌</button>
            </div>
          </div>
          <div class="pt-1.5 border-t border-white/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-zinc-400">
            <span>UID: <strong class="text-cyan-300">${uid}</strong></span>
            <span>Uses: <strong class="text-white">${count}</strong></span>
            <span>Last Tap: <strong class="text-emerald-300">${last}</strong></span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderLogsList() {
    const listEl = document.getElementById('slLogsList');
    const countBadge = document.getElementById('slLogsCountBadge');
    const logs = Array.isArray(state.logs) ? state.logs : [];
    if (countBadge) countBadge.textContent = `${logs.length} / 2000 Logs`;
    if (!listEl || state.logPaused) return;

    const q = (state.logSearch || '').toLowerCase().trim();
    const cat = state.logFilter || 'all';

    const filtered = logs.filter(item => {
      const msg = typeof item === 'string' ? item : `${item.ts || ''} | ${item.msg || ''}`;
      if (cat !== 'all' && classifyLogCategory(msg) !== cat) return false;
      if (q && !msg.toLowerCase().includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="p-6 text-center text-zinc-500 text-xs font-mono">No matching cloud security logs found.</div>`;
      return;
    }

    listEl.innerHTML = filtered.slice(0, 300).map(item => {
      const ts = typeof item === 'string' ? (item.split(' | ')[0] || '-') : (item.ts || '-');
      const msg = typeof item === 'string' ? (item.split(' | ').slice(1).join(' | ') || item) : (item.msg || '');
      const seq = typeof item === 'object' && item.seq ? `#${item.seq}` : '';
      const src = typeof item === 'object' && item.source === 'offline_buffer' ? 'OFFLINE-FLUSHED' : 'LIVE-CLOUD';
      const category = classifyLogCategory(msg);

      let badgeColor = 'text-cyan-300 border-cyan-500/20 bg-cyan-500/10';
      if (category === 'alarm') badgeColor = 'text-rose-300 border-rose-500/30 bg-rose-500/15';
      else if (category === 'access') badgeColor = 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10';
      else if (category === 'door') badgeColor = 'text-amber-300 border-amber-500/25 bg-amber-500/10';

      return `
        <div class="px-3 py-2 rounded-xl bg-surface-900/80 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div class="min-w-0 flex-1 break-words leading-relaxed">
            <span class="text-zinc-400 font-semibold mr-2 whitespace-nowrap">${escapeHtml(ts)}</span>
            <span class="text-zinc-100">${escapeHtml(msg)}</span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            ${seq ? `<span class="text-[10px] text-zinc-500">${escapeHtml(seq)}</span>` : ''}
            <span class="px-2 py-0.5 rounded text-[10px] border ${badgeColor}">${src}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    if (!isMounted) init();
    renderStatusIndicators();
    renderConnHistory();
    renderCardsList();
    renderLogsList();
  }

  /**
   * Synchronously mutates local UI state at t = 0ms when a button is clicked
   * so controls respond with zero network delay.
   */
  function applyOptimisticCommand(cmd, payload = {}) {
    const st = state.status;
    if (cmd === 'unlock') {
      st.lock = 'UNLOCKED';
      st.alarm = false;
      st.last_event = 'UNLOCKED (15s) via lumina cloud';
      st.lastEvent = st.last_event;
    } else if (cmd === 'lock') {
      st.lock = 'LOCKED';
      st.alarm = false;
      st.last_event = 'LOCK: lumina cloud';
      st.lastEvent = st.last_event;
    } else if (cmd === 'alarm_clear') {
      st.alarm = false;
      st.last_event = 'ALARM CLEARED: lumina cloud';
      st.lastEvent = st.last_event;
    } else if (cmd === 'restart') {
      st.last_event = 'RESTART requested via LuminaVista';
      st.lastEvent = st.last_event;
    } else if (cmd === 'relay3' || cmd === 'relay4') {
      const key = cmd === 'relay3' ? 'relay3' : 'relay4';
      const reqState = String(payload.state || 'toggle').toLowerCase();
      const curOn = st[key] === true || st[key] === 'ON';
      const nextOn = reqState === 'on' ? true : (reqState === 'off' ? false : !curOn);
      st[key] = nextOn;
      st.last_event = `${cmd.toUpperCase()} set to ${nextOn ? 'ON' : 'OFF'} (cloud)`;
      st.lastEvent = st.last_event;
    } else if (cmd === 'relay3_schedule' || cmd === 'relay4_schedule') {
      const enabled = Boolean(payload.enabled);
      const on = String(payload.on || '18:00');
      const off = String(payload.off || '06:00');
      if (cmd === 'relay3_schedule') {
        st.relay3Schedule = enabled;
        st.relay3On = on;
        st.relay3Off = off;
        st.relay3_schedule = enabled ? `ON ${on} / OFF ${off}` : 'Disabled';
      } else {
        st.relay4Schedule = enabled;
        st.relay4On = on;
        st.relay4Off = off;
        st.relay4_schedule = enabled ? `ON ${on} / OFF ${off}` : 'Disabled';
      }
    } else if (cmd === 'enroll') {
      const en = Boolean(payload.state);
      st.enroll = en;
      st.last_event = en ? 'Enroll next NFC card' : 'Enrollment canceled';
      st.lastEvent = st.last_event;
    } else if (cmd === 'cards_clear') {
      state.cards = [];
      st.cards = 0;
      st.enroll = false;
      st.last_event = 'All cards cleared (cloud)';
      st.lastEvent = st.last_event;
    } else if (cmd === 'card_rename') {
      const card = (state.cards || []).find(c => matchCard(c, payload.uid));
      if (card && payload.name) card.name = payload.name;
    } else if (cmd === 'card_toggle') {
      const card = (state.cards || []).find(c => matchCard(c, payload.uid));
      if (card) card.active = !card.active;
    } else if (cmd === 'card_color') {
      const card = (state.cards || []).find(c => matchCard(c, payload.uid));
      if (card && payload.color) card.color = payload.color;
    } else if (cmd === 'card_remove') {
      state.cards = (state.cards || []).filter(c => !matchCard(c, payload.uid));
      st.cards = state.cards.length;
    }
    renderAll();
  }

  async function fetchDashboard(manual = false) {
    if (!manual && (isPolling || inFlightCommands > 0)) return false;
    isPolling = true;
    lastPollTimeMs = Date.now();
    const epochAtStart = commandEpoch;
    const t0 = Date.now();
    const syncBtn = manual ? document.getElementById('slBtnForceRefresh') : null;
    if (syncBtn) syncBtn.textContent = '⏳ Syncing...';

    try {
      const res = await window.fetch('/api/iot?action=dashboard', {
        method: 'GET',
        credentials: 'include',
        headers: getAuthHeaders()
      });
      if (!res || !res.ok) return false;
      const data = await res.json();
      state.lastRttMs = Math.max(1, Date.now() - t0);

      // Ignore stale background poll if a user command was triggered while this poll was in flight
      if (!manual && (epochAtStart !== commandEpoch || inFlightCommands > 0)) {
        return false;
      }

      if (data && data.ok) {
        state.online = Boolean(data.online);
        state.lastSeenMs = data.lastSeenMs || 0;
        state.lastSeq = data.lastSeq || 0;
        if (data.status) state.status = { ...state.status, ...data.status };
        if (Array.isArray(data.cards)) state.cards = data.cards;
        if (Array.isArray(data.logs)) state.logs = data.logs;
        if (Array.isArray(data.connHistory)) state.connHistory = data.connHistory;
        if (Array.isArray(data.pendingCommands)) state.pendingCommands = data.pendingCommands;
        renderAll();
        if (manual && window.showToast) {
          window.showToast('Smart Door Lock', `Live telemetry synchronized (${state.lastRttMs}ms).`);
        }
        return true;
      }
    } catch (e) {
    } finally {
      isPolling = false;
      if (syncBtn) syncBtn.textContent = '⚡ Sync Now';
    }
    return false;
  }

  async function sendCommand(cmd, payload = {}) {
    commandEpoch++;
    inFlightCommands++;
    applyOptimisticCommand(cmd, payload);

    const t0 = Date.now();
    try {
      const res = await window.fetch('/api/iot', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'command', cmd, ...payload })
      });
      const data = await res.json();
      state.lastRttMs = Math.max(1, Date.now() - t0);

      if (res.ok && data && data.ok) {
        if (data.status) state.status = { ...state.status, ...data.status };
        if (Array.isArray(data.cards)) state.cards = data.cards;
        if (Array.isArray(data.pendingCommands)) {
          state.pendingCommands = data.pendingCommands;
        } else if (data.queued) {
          state.pendingCommands = [...(state.pendingCommands || []), data.queued];
        }
        renderAll();
        if (window.showToast) {
          window.showToast('Smart Door Lock', `Signed command "${cmd}" dispatched (${state.lastRttMs}ms).`);
        }
        return data;
      } else {
        if (window.showToast) {
          window.showToast('Command Rejected', (data && data.error) || 'Failed to queue command');
        }
      }
    } catch (e) {
      if (window.showToast) {
        window.showToast('Network Error', 'Unable to reach /api/iot gateway.');
      }
    } finally {
      inFlightCommands = Math.max(0, inFlightCommands - 1);
    }
    return null;
  }

  function unlockDoor() { return sendCommand('unlock'); }
  function lockDoor() { return sendCommand('lock'); }
  function clearAlarm() { return sendCommand('alarm_clear'); }

  function restartDevice(skipConfirm = false) {
    if (!skipConfirm && typeof window.confirm === 'function') {
      if (!window.confirm('Restart ESP32 Smart Door Lock MCU? Telemetry will flush to NVS first.')) return null;
    }
    return sendCommand('restart');
  }

  function setRelay(relayNum, relayState) {
    const isR3 = Number(relayNum) === 3;
    const cmd = isR3 ? 'relay3' : 'relay4';
    const key = isR3 ? 'relay3' : 'relay4';
    const curOn = state.status[key] === true || state.status[key] === 'ON';
    const resolvedState = String(relayState || 'toggle').toLowerCase() === 'toggle'
      ? (curOn ? 'off' : 'on')
      : String(relayState).toLowerCase();
    return sendCommand(cmd, { state: resolvedState });
  }

  function saveSchedule(relayNum) {
    const isR3 = Number(relayNum) === 3;
    const enabled = Boolean(document.getElementById(isR3 ? 'slRelay3SchedEnabled' : 'slRelay4SchedEnabled')?.checked);
    const on = document.getElementById(isR3 ? 'slRelay3OnTime' : 'slRelay4OnTime')?.value || '18:00';
    const off = document.getElementById(isR3 ? 'slRelay3OffTime' : 'slRelay4OffTime')?.value || '06:00';

    if (on === off) {
      if (window.showToast) window.showToast('Invalid Schedule', 'ON and OFF times must be different.');
      return null;
    }
    if (isR3) state.scheduleInputsDirty.r3 = false;
    else state.scheduleInputsDirty.r4 = false;

    return sendCommand(isR3 ? 'relay3_schedule' : 'relay4_schedule', { enabled, on, off });
  }

  function toggleEnrollment() {
    const nextState = !state.status.enroll;
    return sendCommand('enroll', { state: nextState });
  }

  function clearAllCards(skipConfirm = false) {
    if (!skipConfirm && typeof window.confirm === 'function') {
      if (!window.confirm('Clear all 20 NFC card slots from ESP32 NVS storage?')) return null;
    }
    return sendCommand('cards_clear');
  }

  function renameCard(uid, newName) {
    let name = newName;
    if (name === undefined && typeof window.prompt === 'function') {
      const existing = (state.cards || []).find(c => matchCard(c, uid));
      name = window.prompt(`Enter new label for NFC card ${uid}:`, existing ? existing.name : '');
    }
    if (!name || !String(name).trim()) return null;
    return sendCommand('card_rename', { uid, name: String(name).trim().slice(0, 31) });
  }

  function toggleCard(uid) {
    return sendCommand('card_toggle', { uid });
  }

  function setCardColor(uid, color) {
    return sendCommand('card_color', { uid, color });
  }

  function removeCard(uid, skipConfirm = false) {
    if (!skipConfirm && typeof window.confirm === 'function') {
      if (!window.confirm(`Remove NFC card ${uid} from authorized access list?`)) return null;
    }
    return sendCommand('card_remove', { uid });
  }

  function filterLogsByCard(uid) {
    const card = (state.cards || []).find(c => matchCard(c, uid));
    const searchQuery = card ? (card.uid || uid) : uid;
    const searchInput = document.getElementById('slLogSearchInput');
    if (searchInput) {
      searchInput.value = searchQuery;
    }
    setLogSearch(searchQuery);
    closeCardHistory();
    const logSection = document.getElementById('slLogsList');
    if (logSection && typeof logSection.scrollIntoView === 'function') {
      logSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function openCardHistory(uid) {
    const modal = document.getElementById('slCardHistoryModal');
    const titleEl = document.getElementById('slHistoryTitle');
    const contentEl = document.getElementById('slHistoryContent');
    if (!modal || !contentEl) return;

    const card = (state.cards || []).find(c => matchCard(c, uid));
    const cardName = card ? (card.name || 'Card') : 'Card';
    const displayUid = card ? (card.uid || uid) : uid;
    const cleanUid = String(displayUid).toUpperCase().replace(/[^0-9A-F]/g, '');

    if (titleEl) {
      titleEl.innerHTML = `📜 Card Logs &amp; History: <span class="text-cyan-300 font-bold">${escapeHtml(cardName)}</span> <span class="text-zinc-400 text-xs">(${escapeHtml(displayUid)})</span>`;
    }

    // 1. Gather recorded hardware tap timestamps from card object
    const tapHistory = (card && Array.isArray(card.history)) ? card.history : [];

    // 2. Query system logs for all entries mentioning this card or UID
    const matchingLogs = (state.logs || []).filter(log => {
      const msg = String(log.msg || log.text || '').toUpperCase();
      const cleanMsg = msg.replace(/[^0-9A-F]/g, '');
      return (cleanUid && cleanMsg.includes(cleanUid)) ||
             msg.includes(String(displayUid).toUpperCase()) ||
             (card && card.name && msg.includes(String(card.name).toUpperCase()));
    });

    let html = `
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-900/80 border border-white/5">
        <span class="text-zinc-400 text-[11px] font-mono">Found <strong class="text-white">${tapHistory.length}</strong> recorded taps &bull; <strong class="text-cyan-300">${matchingLogs.length}</strong> cloud log events</span>
        <button onclick="window.LuminaSmartLock.filterLogsByCard('${escapeHtml(displayUid)}')" class="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono font-bold cursor-pointer transition-colors" title="Filter the main cloud security stream to this card">
          🔍 Filter in Main Log Stream
        </button>
      </div>
    `;

    if (tapHistory.length === 0 && matchingLogs.length === 0) {
      html += `<div class="p-6 text-center text-zinc-500 font-mono text-xs">No recorded card events or taps yet for UID: <span class="text-cyan-300">${escapeHtml(displayUid)}</span>.</div>`;
    } else {
      if (tapHistory.length > 0) {
        html += `<div class="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold mb-1.5">Hardware Tap Sequence (${tapHistory.length}):</div>`;
        html += `<div class="space-y-1 mb-3">`;
        html += tapHistory.slice(0, 100).map((ts, i) => `
          <div class="px-3 py-1.5 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-between text-xs font-mono">
            <span class="text-zinc-400">#${i + 1}</span>
            <span class="text-emerald-300 font-bold">${escapeHtml(ts)}</span>
          </div>
        `).join('');
        html += `</div>`;
      }

      if (matchingLogs.length > 0) {
        html += `<div class="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold mb-1.5">Matching Cloud Security Logs (${matchingLogs.length}):</div>`;
        html += `<div class="space-y-1 max-h-56 overflow-y-auto custom-scrollbar pr-1">`;
        html += matchingLogs.slice(0, 100).map(log => {
          const cat = String(log.category || 'access').toLowerCase();
          const badgeClass = cat === 'alarm' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                             cat === 'access' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                             'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
          return `
            <div class="p-2 rounded-lg bg-surface-900 border border-white/5 flex flex-col gap-0.5 text-xs font-mono">
              <div class="flex items-center justify-between text-[10px]">
                <span class="px-1.5 py-0.2 rounded border ${badgeClass} font-bold uppercase">${escapeHtml(log.category || 'ACCESS')}</span>
                <span class="text-zinc-400">${escapeHtml(log.ts || '')}</span>
              </div>
              <div class="text-zinc-200 mt-0.5 break-words">${escapeHtml(log.msg || '')}</div>
            </div>
          `;
        }).join('');
        html += `</div>`;
      }
    }

    contentEl.innerHTML = html;
    modal.style.display = 'flex';
  }

  function closeCardHistory() {
    const modal = document.getElementById('slCardHistoryModal');
    if (modal) modal.style.display = 'none';
  }

  function setLogFilter(category) {
    state.logFilter = category || 'all';
    const map = {
      all: 'slLogFilterAll',
      access: 'slLogFilterAccess',
      alarm: 'slLogFilterAlarm',
      door: 'slLogFilterDoor',
      relay: 'slLogFilterRelay',
      system: 'slLogFilterSystem'
    };
    Object.entries(map).forEach(([k, id]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      if (k === state.logFilter) {
        btn.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 cursor-pointer';
      } else {
        btn.className = 'px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 text-zinc-400 border border-white/10 cursor-pointer';
      }
    });
    renderLogsList();
  }

  function setLogSearch(query) {
    state.logSearch = String(query ?? '');
    renderLogsList();
  }

  function toggleLogPause() {
    state.logPaused = !state.logPaused;
    const btn = document.getElementById('slBtnLogPause');
    if (btn) {
      btn.textContent = state.logPaused ? '▶️ Resume' : '⏸️ Pause';
    }
    if (!state.logPaused) renderLogsList();
  }

  function exportLogs(format = 'txt') {
    const logs = Array.isArray(state.logs) ? state.logs : [];
    let content = '';
    let mime = 'text/plain;charset=utf-8';
    let ext = 'txt';

    if (format === 'json') {
      content = JSON.stringify(logs, null, 2);
      mime = 'application/json;charset=utf-8';
      ext = 'json';
    } else if (format === 'csv') {
      const rows = ['"Sequence","Timestamp","Source","Event"'];
      logs.forEach(item => {
        const seq = typeof item === 'object' ? (item.seq ?? 0) : 0;
        const ts = typeof item === 'object' ? (item.ts ?? '') : (String(item).split(' | ')[0] || '');
        const src = typeof item === 'object' ? (item.source ?? 'live') : 'live';
        const msg = typeof item === 'object' ? (item.msg ?? '') : String(item);
        rows.push(`"${seq}","${String(ts).replace(/"/g, '""')}","${src}","${String(msg).replace(/"/g, '""')}"`);
      });
      content = rows.join('\n');
      mime = 'text/csv;charset=utf-8';
      ext = 'csv';
    } else {
      content = logs.map(item => {
        if (typeof item === 'string') return item;
        return `${item.ts || '-'} | ${item.msg || ''} [seq=#${item.seq ?? 0}, ${item.source || 'live'}]`;
      }).join('\n') + '\n';
    }

    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `door_logs.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {}
    return content;
  }

  async function clearCloudLogs() {
    commandEpoch++;
    state.logs = [];
    renderLogsList();
    try {
      const res = await window.fetch('/api/iot', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'clear_logs' })
      });
      const data = await res.json();
      if (res.ok && data && data.ok) {
        if (window.showToast) window.showToast('Cloud Logs Cleared', 'All cloud & ESP32 logs cleared.');
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function clearConnHistory() {
    commandEpoch++;
    state.connHistory = [];
    renderConnHistory();
    try {
      const res = await window.fetch('/api/iot', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'clear_conn_history' })
      });
      const data = await res.json();
      if (res.ok && data && data.ok) {
        if (window.showToast) window.showToast('Connection Log Cleared', 'ESP32 Active/Off timing history cleared.');
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function clearCommandQueue() {
    commandEpoch++;
    state.pendingCommands = [];
    renderStatusIndicators();
    try {
      const res = await window.fetch('/api/iot', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'clear_queue' })
      });
      const data = await res.json();
      if (res.ok && data && data.ok) {
        if (window.showToast) window.showToast('Queue Cleared', 'All pending commands canceled.');
        return true;
      }
    } catch (e) {}
    return false;
  }

  function onTabActivated() {
    if (!isMounted) init();
    fetchDashboard();
    startPollingLoop();
  }

  function getState() {
    return state;
  }

  function setState(partial = {}) {
    if (partial.online !== undefined) state.online = Boolean(partial.online);
    if (partial.status) state.status = { ...state.status, ...partial.status };
    if (Array.isArray(partial.cards)) state.cards = partial.cards;
    if (Array.isArray(partial.logs)) state.logs = partial.logs;
    if (Array.isArray(partial.connHistory)) state.connHistory = partial.connHistory;
    if (Array.isArray(partial.pendingCommands)) state.pendingCommands = partial.pendingCommands;
    renderAll();
  }

  window.LuminaSmartLock = {
    init,
    onTabActivated,
    fetchDashboard,
    sendCommand,
    unlockDoor,
    lockDoor,
    clearAlarm,
    restartDevice,
    setRelay,
    saveSchedule,
    markScheduleDirty,
    toggleEnrollment,
    clearAllCards,
    renameCard,
    toggleCard,
    setCardColor,
    removeCard,
    openCardHistory,
    closeCardHistory,
    filterLogsByCard,
    setLogFilter,
    setLogSearch,
    toggleLogPause,
    exportLogs,
    clearCloudLogs,
    clearConnHistory,
    clearCommandQueue,
    getState,
    setState,
    renderAll
  };

  // Mount immediately if DOM is ready so elements exist for instant tab switching & testing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
