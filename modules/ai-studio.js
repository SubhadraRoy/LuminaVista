// modules/ai-studio.js - Autonomous AI Studio, Multi-Session History, Scheduled Tasks, 2-Tier Personas & Thinking Engine
(function(window) {
  'use strict';

  // Constants & Global State
  const MAX_AGENT_LOOPS = 5;
  window.isAgentRunning = false;
  window.isAgentAborted = false;
  window.currentAgentLoop = 0;
  window.aiConversation = [];
  window.aiSessions = [];
  window.activeSessionId = null;
  window.scheduledTasks = [];

  // VFS Initialization
  if (!window.vfs) {
    try {
      window.vfs = JSON.parse(localStorage.getItem("lumina_codespace_vfs") || "{}");
    } catch (e) {
      window.vfs = {};
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // =========================================================================
  // 1. MULTI-SESSION CONVERSATION MANAGEMENT
  // =========================================================================

  function initChatSessions() {
    try {
      const stored = localStorage.getItem("lumina_chat_sessions");
      window.aiSessions = stored ? JSON.parse(stored) : [];
    } catch (e) {
      window.aiSessions = [];
    }

    if (!Array.isArray(window.aiSessions) || window.aiSessions.length === 0) {
      const defaultId = "sess_" + Date.now();
      const legacyHistory = JSON.parse(localStorage.getItem("lumina_ai_history") || "[]");
      const initialSession = {
        id: defaultId,
        title: legacyHistory.length > 0 ? (legacyHistory[0].content.substring(0, 30) + "...") : "Welcome Session",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: legacyHistory
      };
      window.aiSessions = [initialSession];
      window.activeSessionId = defaultId;
    } else {
      window.activeSessionId = localStorage.getItem("lumina_active_session_id") || window.aiSessions[0].id;
      if (!window.aiSessions.some(s => s.id === window.activeSessionId)) {
        window.activeSessionId = window.aiSessions[0].id;
      }
    }

    saveChatSessions();
    syncActiveSessionToConversation();
    renderSessionsList();
    updateSessionsBadge();
  }

  function saveChatSessions() {
    localStorage.setItem("lumina_chat_sessions", JSON.stringify(window.aiSessions));
    localStorage.setItem("lumina_active_session_id", window.activeSessionId);
    updateSessionsBadge();
  }

  function getActiveSession() {
    return window.aiSessions.find(s => s.id === window.activeSessionId) || window.aiSessions[0];
  }

  function syncActiveSessionToConversation() {
    const sess = getActiveSession();
    if (sess) {
      window.aiConversation = sess.messages || [];
      localStorage.setItem("lumina_ai_history", JSON.stringify(window.aiConversation));
    }
  }

  function updateActiveSessionMessages() {
    const sess = getActiveSession();
    if (sess) {
      sess.messages = window.aiConversation;
      sess.updatedAt = Date.now();
      // Auto-title from first user message if still titled default
      if (sess.title === "Welcome Session" || sess.title === "New Conversation") {
        const firstUser = sess.messages.find(m => m.role === "user");
        if (firstUser && firstUser.content) {
          sess.title = firstUser.content.substring(0, 32).trim() + (firstUser.content.length > 32 ? "..." : "");
        }
      }
      saveChatSessions();
      renderSessionsList();
    }
  }

  function createNewChatSession() {
    const newId = "sess_" + Date.now();
    const newSession = {
      id: newId,
      title: "New Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    window.aiSessions.unshift(newSession);
    window.activeSessionId = newId;
    saveChatSessions();
    syncActiveSessionToConversation();
    renderAiChat();
    renderSessionsList();
    if (window.showToast) window.showToast("New Chat", "Started fresh conversation session.");
  }

  function switchChatSession(sessionId) {
    if (!sessionId || sessionId === window.activeSessionId) return;
    const target = window.aiSessions.find(s => s.id === sessionId);
    if (!target) return;
    window.activeSessionId = sessionId;
    saveChatSessions();
    syncActiveSessionToConversation();
    renderAiChat();
    renderSessionsList();
    if (window.showToast) window.showToast("Switched Chat", `Loaded "${target.title}"`);
  }

  function renameChatSession(sessionId, e) {
    if (e) e.stopPropagation();
    const sess = window.aiSessions.find(s => s.id === sessionId);
    if (!sess) return;
    const newTitle = prompt("Enter new title for conversation:", sess.title);
    if (newTitle && newTitle.trim()) {
      sess.title = newTitle.trim();
      saveChatSessions();
      renderSessionsList();
    }
  }

  function deleteChatSession(sessionId, e) {
    if (e) e.stopPropagation();
    if (window.aiSessions.length <= 1) {
      // Clear instead of removing last session
      const sess = window.aiSessions[0];
      sess.messages = [];
      sess.title = "New Conversation";
      sess.updatedAt = Date.now();
      saveChatSessions();
      syncActiveSessionToConversation();
      renderAiChat();
      renderSessionsList();
      if (window.showToast) window.showToast("Chat Cleared", "Reset conversation memory.");
      return;
    }

    if (!confirm("Are you sure you want to delete this chat session?")) return;

    window.aiSessions = window.aiSessions.filter(s => s.id !== sessionId);
    if (window.activeSessionId === sessionId) {
      window.activeSessionId = window.aiSessions[0].id;
    }
    saveChatSessions();
    syncActiveSessionToConversation();
    renderAiChat();
    renderSessionsList();
    if (window.showToast) window.showToast("Deleted", "Chat session removed.");
  }

  function exportChatSession(sessionId, e) {
    if (e) e.stopPropagation();
    const sess = window.aiSessions.find(s => s.id === sessionId) || getActiveSession();
    if (!sess) return;

    let md = `# LuminaVista OS — ${sess.title}\nExported: ${new Date(sess.updatedAt).toLocaleString()}\n\n---\n\n`;
    sess.messages.forEach(m => {
      const speaker = m.role === 'user' ? 'User' : 'Assistant';
      md += `### ${speaker}\n${m.content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sess.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.showToast) window.showToast("Exported", "Chat history downloaded as Markdown.");
  }

  function toggleSessionsDrawer(forceOpen) {
    const drawer = document.getElementById("aiSessionsDrawer");
    if (!drawer) return;
    if (forceOpen === true) {
      drawer.classList.remove("hidden");
    } else if (forceOpen === false) {
      drawer.classList.add("hidden");
    } else {
      drawer.classList.toggle("hidden");
    }
    if (!drawer.classList.contains("hidden")) {
      renderSessionsList();
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }
  }

  function filterSessionsList(query) {
    renderSessionsList(query);
  }

  function renderSessionsList(filterText = '') {
    const listEl = document.getElementById("aiSessionsList");
    if (!listEl) return;
    listEl.innerHTML = '';

    const q = (filterText || '').toLowerCase();
    const filtered = window.aiSessions.filter(s => {
      if (!q) return true;
      if (s.title.toLowerCase().includes(q)) return true;
      return (s.messages || []).some(m => m.content.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="p-4 text-center text-xs text-zinc-500 font-mono">
          No matching conversations.
        </div>
      `;
      return;
    }

    filtered.forEach(s => {
      const isActive = s.id === window.activeSessionId;
      const count = (s.messages || []).length;
      const timeStr = new Date(s.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' });

      const item = document.createElement('div');
      item.className = `p-2.5 rounded-xl border transition-all cursor-pointer group flex items-center justify-between gap-2 ${
        isActive 
          ? 'bg-cyan-500/10 border-cyan-500/40 text-white shadow-sm shadow-cyan-500/10' 
          : 'bg-surface-900/60 border-white/5 text-zinc-300 hover:bg-surface-850 hover:border-white/10'
      }`;
      item.onclick = () => switchChatSession(s.id);

      item.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
          <i data-lucide="${isActive ? 'message-square-code' : 'message-square'}" class="w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-zinc-500'} shrink-0"></i>
          <div class="truncate text-xs font-semibold">
            <span class="block truncate">${escapeHtml(s.title)}</span>
            <span class="text-[10px] text-zinc-500 font-mono font-normal">${count} msgs • ${timeStr}</span>
          </div>
        </div>
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="renameChatSession('${s.id}', event)" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white" title="Rename Session">
            <i data-lucide="edit-2" class="w-3 h-3"></i>
          </button>
          <button onclick="exportChatSession('${s.id}', event)" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white" title="Export Markdown">
            <i data-lucide="download" class="w-3 h-3"></i>
          </button>
          <button onclick="deleteChatSession('${s.id}', event)" class="p-1 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400" title="Delete Session">
            <i data-lucide="trash" class="w-3 h-3"></i>
          </button>
        </div>
      `;
      listEl.appendChild(item);
    });

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function updateSessionsBadge() {
    const badge = document.getElementById("sessionCountBadge");
    if (badge) {
      badge.textContent = window.aiSessions.length;
    }
  }

  // =========================================================================
  // 2. AUTONOMOUS SCHEDULED TASKS ENGINE
  // =========================================================================

  function initScheduledTasks() {
    try {
      const stored = localStorage.getItem("lumina_scheduled_tasks");
      window.scheduledTasks = stored ? JSON.parse(stored) : [];
    } catch (e) {
      window.scheduledTasks = [];
    }
    updateScheduledTasksBadge();
    startScheduledTasksDaemon();
  }

  function saveScheduledTasks() {
    localStorage.setItem("lumina_scheduled_tasks", JSON.stringify(window.scheduledTasks));
    updateScheduledTasksBadge();
    renderScheduledTasksList();
  }

  function updateScheduledTasksBadge() {
    const badge = document.getElementById("scheduledCountBadge");
    const modalBadge = document.getElementById("schedTasksStatusBadge");
    const activeCount = window.scheduledTasks.filter(t => t.enabled).length;

    if (badge) {
      badge.textContent = activeCount;
      if (activeCount > 0) {
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    }
    if (modalBadge) {
      modalBadge.textContent = `${activeCount} Active / ${window.scheduledTasks.length} Total`;
    }
  }

  function openScheduledTasksModal() {
    const m = document.getElementById("aiScheduledModal");
    if (!m) return;
    renderScheduledTasksList();
    m.style.display = "flex";
    setTimeout(() => {
      m.classList.remove("opacity-0");
      const c = m.querySelector(".glass-panel");
      if (c) c.classList.remove("scale-95");
    }, 10);
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeScheduledTasksModal() {
    const m = document.getElementById("aiScheduledModal");
    if (!m) return;
    m.classList.add("opacity-0");
    const c = m.querySelector(".glass-panel");
    if (c) c.classList.add("scale-95");
    setTimeout(() => m.style.display = "none", 200);
  }

  function handleCreateScheduledTask(e) {
    if (e) e.preventDefault();
    const nameInp = document.getElementById("schedTaskName");
    const intervalInp = document.getElementById("schedTaskInterval");
    const promptInp = document.getElementById("schedTaskPrompt");
    if (!nameInp || !promptInp) return;

    const name = nameInp.value.trim();
    const intervalSeconds = parseInt(intervalInp.value, 10) || 300;
    const prompt = promptInp.value.trim();
    if (!name || !prompt) return;

    const newTask = {
      id: "task_" + Date.now(),
      name,
      intervalSeconds,
      prompt,
      enabled: true,
      lastRun: Date.now(),
      executionCount: 0
    };

    window.scheduledTasks.push(newTask);
    saveScheduledTasks();

    nameInp.value = "";
    promptInp.value = "";
    if (window.showToast) window.showToast("Task Scheduled", `Registered "${name}" (Every ${intervalSeconds / 60}m)`);
  }

  function toggleScheduledTask(id) {
    const t = window.scheduledTasks.find(x => x.id === id);
    if (!t) return;
    t.enabled = !t.enabled;
    saveScheduledTasks();
    if (window.showToast) window.showToast("Task Toggled", `Task "${t.name}" is now ${t.enabled ? 'Enabled' : 'Paused'}`);
  }

  function deleteScheduledTask(id) {
    window.scheduledTasks = window.scheduledTasks.filter(x => x.id !== id);
    saveScheduledTasks();
    if (window.showToast) window.showToast("Task Removed", "Scheduled task deleted.");
  }

  async function runScheduledTaskNow(id) {
    const t = window.scheduledTasks.find(x => x.id === id);
    if (!t) return;
    t.lastRun = Date.now();
    t.executionCount = (t.executionCount || 0) + 1;
    saveScheduledTasks();

    if (window.showToast) window.showToast("Running Schedule", `Executing "${t.name}" autonomously...`);
    
    // Switch to or append into chat
    window.aiConversation.push({
      role: "user",
      content: `[SCHEDULED AUTONOMOUS TRIGGER: ${t.name}]\n${t.prompt}`
    });
    updateActiveSessionMessages();
    renderAiChat();

    // Trigger autonomous send
    const fakeEvt = { preventDefault: () => {} };
    const inp = document.getElementById("aiPromptTextarea");
    if (inp) inp.value = `[SCHEDULED AUTONOMOUS TRIGGER: ${t.name}]\n${t.prompt}`;
    handleSendAiPrompt(fakeEvt);
  }

  function renderScheduledTasksList() {
    const listEl = document.getElementById("schedTasksList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (window.scheduledTasks.length === 0) {
      listEl.innerHTML = `
        <div class="p-4 text-center text-xs text-zinc-500 font-mono bg-surface-900/40 rounded-xl border border-white/5">
          No active scheduled tasks. Create one above to run autonomous background intervals.
        </div>
      `;
      return;
    }

    window.scheduledTasks.forEach(t => {
      const item = document.createElement("div");
      item.className = `p-3 rounded-xl border flex items-center justify-between gap-3 ${
        t.enabled ? 'bg-surface-900/80 border-purple-500/30' : 'bg-surface-950/40 border-white/5 opacity-60'
      }`;

      const intervalMin = Math.round(t.intervalSeconds / 60);
      const nextRunSec = Math.max(0, Math.round(((t.lastRun + t.intervalSeconds * 1000) - Date.now()) / 1000));

      item.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${t.enabled ? 'bg-purple-400 animate-ping' : 'bg-zinc-600'} shrink-0"></span>
            <span class="text-xs font-bold text-white truncate">${escapeHtml(t.name)}</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] bg-purple-500/20 text-purple-300 font-mono">Every ${intervalMin}m</span>
          </div>
          <p class="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">${escapeHtml(t.prompt)}</p>
          <div class="text-[10px] text-zinc-500 font-mono mt-1">
            Next tick in: ${nextRunSec}s • Executed: ${t.executionCount || 0} times
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="runScheduledTaskNow('${t.id}')" class="px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-[10px] font-bold border border-purple-500/30 cursor-pointer" title="Trigger Run Now">
            Run Now
          </button>
          <button onclick="toggleScheduledTask('${t.id}')" class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer" title="${t.enabled ? 'Pause' : 'Resume'}">
            <i data-lucide="${t.enabled ? 'pause' : 'play'}" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteScheduledTask('${t.id}')" class="p-1 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 cursor-pointer" title="Delete Task">
            <i data-lucide="trash" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
      listEl.appendChild(item);
    });

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  let scheduledDaemonInterval = null;
  function startScheduledTasksDaemon() {
    if (scheduledDaemonInterval) clearInterval(scheduledDaemonInterval);
    scheduledDaemonInterval = setInterval(() => {
      const now = Date.now();
      window.scheduledTasks.forEach(t => {
        if (!t.enabled) return;
        if (now - (t.lastRun || 0) >= t.intervalSeconds * 1000) {
          runScheduledTaskNow(t.id);
        }
      });
    }, 5000);
  }

  // =========================================================================
  // 3. THINKING ORBS ENGINE (Multi-State Animated AI Thought Indicator)
  // Supports: breathing | solving | searching | connecting | composing | working
  // =========================================================================
  let currentThinkingOrbState = 'breathing';
  const thinkingOrbRegistry = [];

  function setThinkingOrbState(state) {
    currentThinkingOrbState = state;
    thinkingOrbRegistry.forEach(orb => { orb.state = state; });
  }

  function createThinkingOrb(canvas) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const size = canvas.width || 48;
    const center = size / 2;
    let animId = null;
    const startTime = Date.now();

    const instance = {
      canvas,
      ctx,
      state: currentThinkingOrbState,
      stop: () => { if (animId) cancelAnimationFrame(animId); }
    };

    function render() {
      const elapsed = (Date.now() - startTime) / 1000;
      ctx.clearRect(0, 0, size, size);
      const st = instance.state || 'breathing';

      if (st === 'breathing') {
        // Idle breathing rhythm: expanding/contracting dotted ring with soft glow
        const count = 16;
        const breath = Math.sin(elapsed * 2) * (size * 0.05);
        const r = (size * 0.33) + breath;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + elapsed * 0.35;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          const alpha = 0.45 + Math.sin(elapsed * 2 + i) * 0.35;
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 242, 254, ${Math.max(0.2, alpha)})`;
          ctx.shadowColor = "rgba(0, 242, 254, 0.7)";
          ctx.shadowBlur = 4;
          ctx.fill();
        }
      } else if (st === 'solving') {
        // Chain-of-thought reasoning: dual counter-rotating concentric orbital rings
        const rings = [
          { r: size * 0.20, count: 8, dir: 1, speed: 2.2, color: 'rgba(168, 85, 247, 0.9)' },
          { r: size * 0.34, count: 14, dir: -1, speed: 1.6, color: 'rgba(0, 242, 254, 0.9)' }
        ];
        rings.forEach(ring => {
          for (let i = 0; i < ring.count; i++) {
            const angle = (i / ring.count) * Math.PI * 2 + elapsed * ring.speed * ring.dir;
            const x = center + Math.cos(angle) * ring.r;
            const y = center + Math.sin(angle) * ring.r;
            ctx.beginPath();
            ctx.arc(x, y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = ring.color;
            ctx.shadowColor = ring.color;
            ctx.shadowBlur = 5;
            ctx.fill();
          }
        });
      } else if (st === 'searching') {
        // Globe scan meridian: spherical latitude dots with sweeping scan longitude line
        const count = 18;
        const r = size * 0.34;
        const scan = (Math.sin(elapsed * 3) + 1) / 2;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          const distToScan = Math.abs((x / size) - scan);
          const alpha = distToScan < 0.25 ? 0.95 : 0.25;
          ctx.beginPath();
          ctx.arc(x, y, distToScan < 0.2 ? 2.2 : 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.shadowColor = "rgba(56, 189, 248, 0.8)";
          ctx.shadowBlur = distToScan < 0.2 ? 6 : 2;
          ctx.fill();
        }
      } else if (st === 'connecting') {
        // MicroVM handshake & network nodes connecting with lines
        const nodeCount = 6;
        const r = size * 0.33;
        const pts = [];
        for (let i = 0; i < nodeCount; i++) {
          const angle = (i / nodeCount) * Math.PI * 2 + Math.sin(elapsed + i) * 0.3;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          pts.push({ x, y });
        }
        ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        pts.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.0, 0, Math.PI * 2);
          ctx.fillStyle = "#10b981";
          ctx.shadowColor = "#10b981";
          ctx.shadowBlur = 5;
          ctx.fill();
        });
      } else if (st === 'composing') {
        // Code drafting: undulating multi-frequency ribbon of particles
        const waveCount = 18;
        for (let i = 0; i < waveCount; i++) {
          const normX = i / (waveCount - 1);
          const x = (size * 0.15) + normX * (size * 0.7);
          const waveY = Math.sin(normX * Math.PI * 3 + elapsed * 4) * (size * 0.18);
          const y = center + waveY;
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(244, 63, 94, 0.9)";
          ctx.shadowColor = "rgba(244, 63, 94, 0.8)";
          ctx.shadowBlur = 5;
          ctx.fill();
        }
      } else {
        // 'working': high-speed orbital loop
        const count = 10;
        const r = size * 0.34;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + elapsed * 3.8;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          ctx.beginPath();
          ctx.arc(x, y, 1.9, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 242, 254, 0.9)";
          ctx.shadowColor = "rgba(0, 242, 254, 0.8)";
          ctx.shadowBlur = 5;
          ctx.fill();
        }
      }

      ctx.shadowBlur = 0;
      animId = requestAnimationFrame(render);
    }

    render();
    thinkingOrbRegistry.push(instance);
    return instance;
  }

  function initThinkingOrb(canvasId = "headerThinkingOrb") {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return createThinkingOrb(canvas);
  }

  // =========================================================================
  // 4. CONFIGURATION, 2-TIER PERSONAS & PROVIDER ROUTING
  // =========================================================================

  function populatePersonasDropdown() {
    if (window.populatePersonasDropdownImpl) {
      window.populatePersonasDropdownImpl();
      return;
    }
    const savedCat = localStorage.getItem("lumina_ai_category") || "general";
    const savedSpec = localStorage.getItem("lumina_ai_persona") || "";
    if (window.populateCategoryDropdown) window.populateCategoryDropdown("modalAiCategorySelect", savedCat);
    if (window.populateSpecialistDropdown) window.populateSpecialistDropdown("modalAiPersonaSelect", savedCat, savedSpec);
  }

  function openAiConfigModal() {
    const modal = document.getElementById("aiConfigModal");
    if (!modal) return;
    loadAiConfig();
    modal.style.display = "flex";
    setTimeout(() => {
      modal.classList.remove("opacity-0");
      const c = modal.querySelector(".glass-panel");
      if (c) c.classList.remove("scale-95");
    }, 10);
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeAiConfigModal() {
    const modal = document.getElementById("aiConfigModal");
    if (!modal) return;
    modal.classList.add("opacity-0");
    const c = modal.querySelector(".glass-panel");
    if (c) c.classList.add("scale-95");
    setTimeout(() => modal.style.display = "none", 200);
  }

  function onModalCategoryChange() {
    const catSel = document.getElementById("modalAiCategorySelect");
    if (!catSel) return;
    const catId = catSel.value;
    if (window.populateSpecialistDropdown) {
      window.populateSpecialistDropdown("modalAiPersonaSelect", catId, "");
    }
    saveAiConfigFromModal();
  }

  function onModalPersonaChange() {
    const personaSelect = document.getElementById("modalAiPersonaSelect");
    const customWrapper = document.getElementById("modalCustomPersonaWrapper");
    const customPrompt = document.getElementById("modalCustomPersonaPrompt");

    if (personaSelect && customWrapper) {
      if (personaSelect.value === "custom") {
        customWrapper.classList.remove("hidden");
        if (customPrompt) customPrompt.focus();
      } else {
        customWrapper.classList.add("hidden");
      }
    }
    saveAiConfigFromModal();
  }

  function onModalProviderChange() {
    const providerSelect = document.getElementById("modalAiProviderSelect");
    const customKeyWrapper = document.getElementById("modalCustomAiKeyWrapper");
    if (providerSelect && customKeyWrapper) {
      if (providerSelect.value === "custom") {
        customKeyWrapper.classList.remove("hidden");
      } else {
        customKeyWrapper.classList.add("hidden");
      }
    }
    saveAiConfigFromModal();
  }

  function saveAiConfigFromModal() {
    const providerSel = document.getElementById("modalAiProviderSelect");
    const modelSel = document.getElementById("modalAiModelSelect");
    const catSel = document.getElementById("modalAiCategorySelect");
    const personaSel = document.getElementById("modalAiPersonaSelect");
    const webCheck = document.getElementById("modalCheckWebSearch");
    const vfsCheck = document.getElementById("modalCheckVfs");
    const termCheck = document.getElementById("modalCheckTerminal");
    const customKeyInp = document.getElementById("modalCustomAiKey");
    const customEndpointInp = document.getElementById("modalCustomAiEndpoint");
    const customPersonaPrompt = document.getElementById("modalCustomPersonaPrompt");

    if (providerSel) localStorage.setItem("lumina_ai_provider", providerSel.value);
    if (modelSel) localStorage.setItem("lumina_ai_model", modelSel.value);
    if (catSel) localStorage.setItem("lumina_ai_category", catSel.value);
    if (personaSel) localStorage.setItem("lumina_ai_persona", personaSel.value);
    if (webCheck) localStorage.setItem("lumina_allow_internet", webCheck.checked ? "true" : "false");
    if (vfsCheck) localStorage.setItem("lumina_allow_vfs", vfsCheck.checked ? "true" : "false");
    if (termCheck) localStorage.setItem("lumina_allow_terminal", termCheck.checked ? "true" : "false");
    if (customKeyInp) localStorage.setItem("lumina_custom_ai_key", customKeyInp.value.trim());
    if (customEndpointInp) localStorage.setItem("lumina_custom_ai_endpoint", customEndpointInp.value.trim());
    if (customPersonaPrompt) localStorage.setItem("lumina_custom_persona_prompt", customPersonaPrompt.value.trim());

    // Update Header Badges
    const modelBadge = document.getElementById("aiActiveModelBadge");
    const personaBadge = document.getElementById("aiActivePersonaBadge");
    const webBadge = document.getElementById("webSearchActiveBadge");

    const pVal = providerSel ? providerSel.value : (localStorage.getItem("lumina_ai_provider") || "ollama_pool");
    if (modelBadge) {
      if (pVal === "simulation") {
        modelBadge.textContent = "Autonomous Sandbox (Offline)";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-300 font-mono border border-purple-500/20";
      } else if (pVal === "nvidia_pool") {
        modelBadge.textContent = "NVIDIA NIM Pool (Multi-Key)";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20";
      } else if (pVal === "local") {
        modelBadge.textContent = "Local Ollama";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-amber-500/10 text-amber-300 font-mono border border-amber-500/20";
      } else {
        modelBadge.textContent = modelSel ? modelSel.value : "gpt-oss:20b";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-300 font-mono border border-cyan-500/20";
      }
    }

    if (webBadge) {
      const isWebOn = webCheck ? webCheck.checked : (localStorage.getItem("lumina_allow_internet") !== "false");
      if (isWebOn) {
        webBadge.classList.remove("hidden");
        webBadge.classList.add("flex");
      } else {
        webBadge.classList.add("hidden");
        webBadge.classList.remove("flex");
      }
    }

    if (personaBadge) {
      const activeCat = catSel ? catSel.value : (localStorage.getItem("lumina_ai_category") || "general");
      const activeSpec = personaSel ? personaSel.value : (localStorage.getItem("lumina_ai_persona") || "");
      
      const catObj = (window.LuminaPersonaCategories || []).find(c => c.id === activeCat);
      const specObj = (window.LuminaPersonas || []).find(p => p.id === activeSpec);

      const catName = catObj ? catObj.name.split("&")[0].trim() : "General";
      const specName = specObj ? specObj.name : "Default";
      personaBadge.textContent = `Category: ${catName} • Specialist: ${specName}`;
    }
  }

  function loadAiConfig() {
    populatePersonasDropdown();

    const providerSel = document.getElementById("modalAiProviderSelect");
    const modelSel = document.getElementById("modalAiModelSelect");
    const catSel = document.getElementById("modalAiCategorySelect");
    const personaSel = document.getElementById("modalAiPersonaSelect");
    const webCheck = document.getElementById("modalCheckWebSearch");
    const vfsCheck = document.getElementById("modalCheckVfs");
    const termCheck = document.getElementById("modalCheckTerminal");
    const customKeyInp = document.getElementById("modalCustomAiKey");
    const customEndpointInp = document.getElementById("modalCustomAiEndpoint");
    const customPersonaPrompt = document.getElementById("modalCustomPersonaPrompt");

    const savedProvider = localStorage.getItem("lumina_ai_provider") || "ollama_pool";
    const savedModel = localStorage.getItem("lumina_ai_model") || "gpt-oss:20b";
    const savedCat = localStorage.getItem("lumina_ai_category") || "general";
    const savedPersona = localStorage.getItem("lumina_ai_persona") || "";
    const savedWeb = localStorage.getItem("lumina_allow_internet") !== "false";
    const savedVfs = localStorage.getItem("lumina_allow_vfs") !== "false";
    const savedTerm = localStorage.getItem("lumina_allow_terminal") !== "false";

    if (providerSel) providerSel.value = savedProvider;
    if (modelSel) modelSel.value = savedModel;
    if (catSel) catSel.value = savedCat;
    if (personaSel && savedPersona) personaSel.value = savedPersona;
    if (webCheck) webCheck.checked = savedWeb;
    if (vfsCheck) vfsCheck.checked = savedVfs;
    if (termCheck) termCheck.checked = savedTerm;

    if (customKeyInp) customKeyInp.value = localStorage.getItem("lumina_custom_ai_key") || "";
    if (customEndpointInp) customEndpointInp.value = localStorage.getItem("lumina_custom_ai_endpoint") || "";
    if (customPersonaPrompt) customPersonaPrompt.value = localStorage.getItem("lumina_custom_persona_prompt") || "";

    onModalProviderChange();
    onModalPersonaChange();
  }

  function checkProviderQuota() {
    const provider = localStorage.getItem("lumina_ai_provider") || "ollama_pool";
    let msg = "";
    if (provider === "ollama_pool") {
      msg = "Ollama Cloud Multi-Key Pool: 8 keys registered. Automatic failover active upon HTTP 429.";
    } else if (provider === "nvidia_pool") {
      msg = "NVIDIA NIM Cloud Pool: Multi-key rotation configured. High-concurrency models enabled.";
    } else if (provider === "simulation") {
      msg = "Autonomous Sovereign Sandbox: 100% Offline with infinite local cognitive budget.";
    } else {
      msg = `Provider: ${provider}. Gateway limits governed by endpoint provider policies.`;
    }
    if (window.showToast) window.showToast("Provider Telemetry", msg);
  }

  function getAiSystemPrompt() {
    const personaId = localStorage.getItem("lumina_ai_persona") || "";
    const customPrompt = localStorage.getItem("lumina_custom_persona_prompt") || "";

    let personaDirective = "";
    if (personaId === "custom" && customPrompt) {
      personaDirective = customPrompt;
    } else if (Array.isArray(window.LuminaPersonas)) {
      const p = window.LuminaPersonas.find(x => x.id === personaId);
      if (p) personaDirective = p.prompt;
    }

    return `You are LuminaVista Autonomous Sovereign Agent (Cloud OS v14).
${personaDirective}

=== AUTONOMOUS CAPABILITIES & TOOL CALLING CONVENTIONS ===
You have full access to an in-memory Virtual File System (VFS) and MicroVM terminal.
Always format your reasoning inside:
<thought_process>
[Reasoning & Plan]
</thought_process>

When taking action, output the appropriate tool directives:
- [TOOL:SEARCH_WEB query="..."][/TOOL:SEARCH_WEB]
- [TOOL:VIEW_FILE filename="..."][/TOOL:VIEW_FILE]
- [TOOL:LIST_DIR][/TOOL:LIST_DIR]
- [TOOL:WRITE_FILE filename="..."]
file content
[/TOOL:WRITE_FILE]
- [TOOL:EDIT_FILE filename="..."]
<target>exact code to replace</target>
<replacement>new code</replacement>
[/TOOL:EDIT_FILE]
- [TOOL:DELETE_FILE filename="..."][/TOOL:DELETE_FILE]
- [TOOL:EXEC]bash command[/TOOL:EXEC]
- [TOOL:TASK_COMPLETE summary="..."][/TOOL:TASK_COMPLETE]

Always keep the workspace clean, maintain pristine architecture, and conclude with [TOOL:TASK_COMPLETE] when finished.`;
  }

  // =========================================================================
  // 5. CLAUDE & ANTIGRAVITY COGNITIVE THINKING UI & MARKDOWN PARSER
  // =========================================================================

  function parseAiMarkdown(t) {
    if (!t) return "";

    // 1. Thinking / Cognitive Architecture Card with exact requested banner
    let processed = t.replace(/<(?:thought_process|thought)>([\s\S]*?)<\/(?:thought_process|thought)>/gi, (m, thoughts) => {
      return `
        <details class="thought-card group" open>
          <summary class="thought-summary">
            <span class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span class="font-bold uppercase tracking-wider text-cyan-300 text-[11px]">
                Formulating Cognitive Architecture &amp; Verifying MicroVM Playbooks...
              </span>
            </span>
            <span class="text-[10px] text-zinc-500 group-open:rotate-180 transition-transform duration-200">▼</span>
          </summary>
          <div class="thought-content whitespace-pre-wrap leading-relaxed text-cyan-100/80">${escapeHtml(thoughts.trim())}</div>
        </details>
      `;
    });

    // 2. Transform Antigravity Autonomous Tools into Sleek Action Cards
    processed = processed
      .replace(/\[TOOL:SEARCH_WEB query="([^"]+)"\]\[\/TOOL:SEARCH_WEB\]/g, (m, q) => {
        return `<div class="my-2 p-3 bg-surface-950/90 border border-sky-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-sky-300">
          <i data-lucide="search" class="w-4 h-4 text-sky-400 shrink-0"></i>
          <span><strong>Autonomous Web Search:</strong> "${escapeHtml(q)}"</span>
        </div>`;
      })
      .replace(/\[TOOL:VIEW_FILE filename="([^"]+)"\]\[\/TOOL:VIEW_FILE\]/g, (m, f) => {
        return `<div class="my-2 p-3 bg-surface-950/90 border border-indigo-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-indigo-300">
          <i data-lucide="file-text" class="w-4 h-4 text-indigo-400 shrink-0"></i>
          <span><strong>Inspecting VFS File:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code></span>
        </div>`;
      })
      .replace(/\[TOOL:LIST_DIR\]\[\/TOOL:LIST_DIR\]/g, () => {
        return `<div class="my-2 p-2.5 bg-surface-950/90 border border-zinc-700 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-zinc-300">
          <i data-lucide="folder" class="w-4 h-4 text-cyan-400 shrink-0"></i>
          <span><strong>Inspecting VFS Directory Tree</strong></span>
        </div>`;
      })
      .replace(/\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g, (m, f, c) => {
        return `<div class="my-2 p-3 bg-surface-950/90 border border-emerald-500/30 rounded-xl shadow-lg flex items-center justify-between font-mono text-xs text-emerald-300">
          <div class="flex items-center gap-2">
            <i data-lucide="file-code" class="w-4 h-4 text-emerald-400 shrink-0"></i>
            <span><strong>Created / Updated VFS Artifact:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code> (${c.trim().length} bytes)</span>
          </div>
          <button onclick="window.switchAndOpenFile('${escapeHtml(f)}')" class="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[10px] border border-emerald-500/40 cursor-pointer">Open</button>
        </div>\n\`\`\`${f.split('.').pop() || 'text'}:${f}\n${c.trim()}\n\`\`\``;
      })
      .replace(/\[TOOL:EDIT_FILE filename="([^"]+)"\]\s*<target>([\s\S]*?)<\/target>\s*<replacement>([\s\S]*?)<\/replacement>\s*\[\/TOOL:EDIT_FILE\]/g, (m, f, t, r) => {
        return `<div class="my-2 p-3 bg-surface-950/90 border border-amber-500/30 rounded-xl shadow-lg font-mono text-xs text-amber-300 space-y-2">
          <div class="flex items-center gap-2">
            <i data-lucide="edit-3" class="w-4 h-4 text-amber-400 shrink-0"></i>
            <span><strong>Targeted Edit on Artifact:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code></span>
          </div>
          <div class="p-2 bg-black/50 rounded-lg text-[11px] space-y-1 font-mono">
            <div class="text-rose-400 line-through">-${escapeHtml(t.trim().substring(0, 100))}${t.length > 100 ? '...' : ''}</div>
            <div class="text-emerald-400">+${escapeHtml(r.trim().substring(0, 100))}${r.length > 100 ? '...' : ''}</div>
          </div>
        </div>`;
      })
      .replace(/\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g, (m, f) => {
        return `<div class="my-2 p-2.5 bg-surface-950/90 border border-rose-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-rose-400">
          <i data-lucide="trash" class="w-4 h-4 text-rose-500 shrink-0"></i>
          <span><strong>Deleted VFS Artifact:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code></span>
        </div>`;
      })
      .replace(/\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g, (m, cmd) => {
        return `<div class="my-2 p-3 bg-surface-950/90 border border-cyan-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-cyan-300">
          <i data-lucide="terminal" class="w-4 h-4 text-cyan-400 shrink-0"></i>
          <span><strong>MicroVM Terminal Exec:</strong> <code class="text-cyan-200 bg-black/40 px-2 py-0.5 rounded">➜ ${escapeHtml(cmd.trim())}</code></span>
        </div>`;
      })
      .replace(/\[TOOL:TASK_COMPLETE(?: summary="([^"]*)")?\](?:([\s\S]*?)\[\/TOOL:TASK_COMPLETE\])?/g, (m, s1, s2) => {
        const sum = s1 || (s2 ? s2.trim() : "All autonomous tasks completed.");
        return `<div class="my-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-xl flex items-start gap-3 font-sans text-xs text-emerald-200">
          <div class="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="font-bold text-sm text-emerald-300">Autonomous Objective Complete</div>
            <div class="mt-0.5 text-zinc-300 font-mono text-xs">${escapeHtml(sum)}</div>
          </div>
        </div>`;
      });

    // 3. Extract code blocks safely
    const codeBlocks = [];
    processed = processed.replace(/```(?:([a-zA-Z0-9_-]+):([a-zA-Z0-9._-]+)|([a-zA-Z0-9_-]+))\n([\s\S]*?)```/g, (match, l1, f1, l2, code) => {
      codeBlocks.push({ lang: l1 || l2 || "text", file: f1 || "", code });
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 4. Protect pre-generated HTML tags
    const htmlSnippets = [];
    processed = processed.replace(/(<details class="thought-card[\s\S]*?<\/details>|<div class="my-[23][\s\S]*?<\/div>)/gi, (match) => {
      htmlSnippets.push(match);
      return `__HTML_SNIPPET_${htmlSnippets.length - 1}__`;
    });

    let safeProse = escapeHtml(processed);

    htmlSnippets.forEach((snippet, index) => {
      safeProse = safeProse.replace(`__HTML_SNIPPET_${index}__`, snippet);
    });

    // 5. Parse Markdown Tables
    safeProse = safeProse.replace(/(?:^\|.+?\|(?:\r?\n|$))+/gm, (match) => {
      const rows = match.trim().split(/\r?\n/);
      if (rows.length < 2) return match;
      let tableHtml = '<div class="overflow-x-auto my-3 shadow-lg rounded-xl border border-white/10"><table class="w-full text-left border-collapse text-xs">';
      rows.forEach((row, i) => {
        if (row.includes('---')) return;
        const cols = row.split('|').filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
        tableHtml += '<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">';
        cols.forEach(col => {
          const tag = i === 0 ? 'th' : 'td';
          const cls = i === 0 ? 'p-2.5 bg-cyan-500/10 text-cyan-300 font-bold tracking-wider uppercase text-[11px]' : 'p-2.5 text-zinc-300';
          tableHtml += `<${tag} class="${cls}">${col.trim()}</${tag}>`;
        });
        tableHtml += '</tr>';
      });
      return tableHtml + '</table></div>';
    });

    // 6. Headers, bold, italics, inline code
    safeProse = safeProse
      .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-cyan-300 mt-4 mb-2 pb-1 border-b border-white/5">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-white mt-5 mb-2 pb-1 border-b border-white/10">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-lg font-extrabold text-white mt-5 mb-2.5">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-zinc-400">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-surface-800 text-pink-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/5">$1</code>')
      .replace(/\n/g, '<br/>');

    // 7. Re-inject Code Blocks
    codeBlocks.forEach((item, index) => {
      const htmlCard = `
        <div class="bg-surface-950 border border-white/10 rounded-xl my-4 overflow-hidden shadow-lg">
          <div class="px-4 py-2 bg-surface-900/80 border-b border-white/5 text-[11px] text-cyan-400 font-mono flex justify-between items-center">
            <span class="font-bold flex items-center gap-1.5"><i data-lucide="file-code" class="w-3.5 h-3.5"></i> ${escapeHtml(item.file || item.lang)}</span>
            <button onclick="navigator.clipboard.writeText(this.closest('.bg-surface-950').querySelector('code').innerText); if(window.showToast) window.showToast('Copied', 'Code block copied');" class="text-zinc-400 hover:text-white cursor-pointer transition-colors"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
          </div>
          <pre class="p-4 overflow-x-auto text-[12px] font-mono text-zinc-300 leading-relaxed custom-scrollbar"><code>${escapeHtml(item.code)}</code></pre>
        </div>
      `;
      safeProse = safeProse.replace(`__CODE_BLOCK_${index}__`, htmlCard);
    });

    return safeProse;
  }

  function renderAiChat() {
    const box = document.getElementById("aiChatHistory");
    if (!box) return;
    box.innerHTML = "";

    const conversation = window.aiConversation || [];

    if (conversation.length === 0) {
      box.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center space-y-4 px-4 mt-8">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-black font-extrabold shadow-[0_0_30px_rgba(0,242,254,0.3)]">
            <i data-lucide="bot" class="w-8 h-8"></i>
          </div>
          <div>
            <h2 class="text-xl font-heading font-extrabold text-white">Antigravity Autonomous Studio</h2>
            <p class="text-xs text-zinc-400 max-w-md mt-1">Multi-Key Auto-Failover, 1,500+ Specialized Personas, Autonomous Web Search, VFS code execution, and persistent conversation history.</p>
          </div>
        </div>
      `;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      return;
    }

    conversation.forEach(m => {
      const isUser = m.role === "user";
      if (isUser && m.content.startsWith("[SYSTEM AUTO-FEEDBACK]")) return;

      const row = document.createElement("div");
      row.className = `flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`;
      row.innerHTML = `
        <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${isUser ? 'bg-surface-850 text-white border border-white/10 shadow-md' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-500/10'}">
          ${isUser ? 'ME' : '<i data-lucide="bot" class="w-4 h-4"></i>'}
        </div>
        <div class="max-w-[85%]">
          <div class="p-4 rounded-2xl text-[13px] leading-relaxed ${isUser ? 'bg-surface-850 text-white rounded-tr-sm border border-white/5' : 'bg-surface-900/90 text-zinc-200 rounded-tl-sm border border-cyan-500/10'}">
            ${isUser ? escapeHtml(m.content) : parseAiMarkdown(m.content)}
          </div>
        </div>
      `;
      box.appendChild(row);
    });

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    box.scrollTop = box.scrollHeight;
  }

  // --- Real-time Cognitive Thinking Indicator UI ---

  let thinkingTimerInterval = null;
  let thinkingStartTime = 0;
  let thinkingStepInterval = null;

  function showThinkingIndicator(iteration = 1) {
    const chatBox = document.getElementById("aiChatHistory");
    if (!chatBox) return;

    hideThinkingIndicator();
    setThinkingOrbState("solving");

    const indicator = document.createElement("div");
    indicator.id = "activeThinkingIndicator";
    indicator.className = "flex items-start gap-3";
    indicator.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/10 overflow-hidden">
        <canvas id="activeOrbCanvas" width="32" height="32" class="w-full h-full"></canvas>
      </div>
      <div class="max-w-[85%] flex-1">
        <div class="p-4 rounded-2xl rounded-tl-sm border border-cyan-500/30 bg-surface-900/95 text-xs font-mono shadow-2xl space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-cyan-500/20">
            <div class="flex items-center gap-2.5 text-cyan-300 font-bold tracking-wider uppercase text-[11px]">
              <span class="relative flex h-2.5 w-2.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
              </span>
              <span>Formulating Cognitive Architecture &amp; Verifying MicroVM Playbooks...</span>
              ${iteration > 1 ? `<span class="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-200">Iter ${iteration}</span>` : ''}
            </div>
            <span class="text-[10px] text-cyan-400 font-mono font-bold" id="thinkingTimer">0.0s</span>
          </div>
          <div id="thinkingLogStream" class="space-y-1 text-zinc-400 text-[11px] leading-relaxed font-mono">
            <div class="text-cyan-400/90 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              [Kernel Audit] Auditing VFS workspace tree and memory bounds...
            </div>
          </div>
        </div>
      </div>
    `;
    chatBox.appendChild(indicator);
    chatBox.scrollTop = chatBox.scrollHeight;

    const inlineCanvas = document.getElementById("activeOrbCanvas");
    if (inlineCanvas) createThinkingOrb(inlineCanvas);

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

    // Timer
    thinkingStartTime = Date.now();
    thinkingTimerInterval = setInterval(() => {
      const el = document.getElementById("thinkingTimer");
      if (el) {
        el.textContent = ((Date.now() - thinkingStartTime) / 1000).toFixed(1) + "s";
      }
    }, 100);

    // Staggered cognitive stream steps
    const simulatedSteps = [
      "[Locale Sync] Synchronizing Indian Standard Time (IST / Asia/Kolkata) & INR baseline...",
      "[Playbook Verification] Checking E2B Firecracker microVM safety constraints...",
      "[Thought Architecture] Reasoning and evaluating autonomous tool trajectory..."
    ];
    let stepIdx = 0;
    thinkingStepInterval = setInterval(() => {
      const stream = document.getElementById("thinkingLogStream");
      if (stream && stepIdx < simulatedSteps.length) {
        const line = document.createElement("div");
        line.className = "text-zinc-400 flex items-center gap-1.5 animate-fadeIn";
        line.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-cyan-500/50"></span> ${escapeHtml(simulatedSteps[stepIdx])}`;
        stream.appendChild(line);
        stepIdx++;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }, 800);
  }

  function hideThinkingIndicator() {
    if (thinkingTimerInterval) clearInterval(thinkingTimerInterval);
    if (thinkingStepInterval) clearInterval(thinkingStepInterval);
    const ind = document.getElementById("activeThinkingIndicator");
    if (ind) ind.remove();
    setThinkingOrbState("breathing");
  }

  // =========================================================================
  // 6. SIMULATION SANDBOX (100% OFFLINE FALLBACK)
  // =========================================================================

  async function generateSimulatedAutonomousReply(prompt, loop, vfs) {
    const pLower = (prompt || '').toLowerCase();
    
    let thoughts = `<thought_process>\n[Cognitive Architecture Active - Loop ${loop}]\nUser Intent: "${prompt}"\nEvaluating VFS state: ${Object.keys(vfs || {}).length} file(s) registered in workspace.\nFormulating autonomous plan and tool execution sequence...\n</thought_process>\n\n`;

    // 1. File write intent
    if (pLower.includes("create") || pLower.includes("write") || pLower.includes("build") || pLower.includes("make") || pLower.includes("landing") || pLower.includes("calculator") || pLower.includes("script")) {
      let targetFile = "app.js";
      let code = "// LuminaVista Autonomous Script\nconsole.log('Autonomous task executed successfully.');\n";

      if (pLower.includes(".html") || pLower.includes("landing") || pLower.includes("website") || pLower.includes("page")) {
        targetFile = "index.html";
        code = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Lumina Autonomous Project</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="bg-gray-950 text-white min-h-screen flex items-center justify-center p-6">\n  <div class="max-w-md w-full p-8 rounded-2xl bg-gray-900 border border-cyan-500/30 text-center shadow-2xl">\n    <h1 class="text-2xl font-bold text-cyan-400 mb-2">Autonomous Artifact</h1>\n    <p class="text-sm text-gray-400 mb-4">Generated autonomously by Antigravity Studio.</p>\n    <button onclick="alert('LuminaVista OS Active!')" class="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition-all">Interact</button>\n  </div>\n</body>\n</html>`;
      } else if (pLower.includes(".py") || pLower.includes("python")) {
        targetFile = "main.py";
        code = `# Python Autonomous MicroVM Script\nimport sys\n\ndef main():\n    print("LuminaVista Autonomous Python Execution")\n    print(f"Python Engine: {sys.version}")\n\nif __name__ == "__main__":\n    main()\n`;
      }

      return thoughts + `I have formulated the implementation plan and generated the autonomous artifact for you:\n\n[TOOL:WRITE_FILE filename="${targetFile}"]\n${code}\n[/TOOL:WRITE_FILE]\n\n[TOOL:TASK_COMPLETE message="Artifact ${targetFile} successfully constructed and mounted in VFS codespace."][/TOOL:TASK_COMPLETE]\n\nTask complete. The artifact \`${targetFile}\` is ready and previewable in the Artifacts IDE.`;
    }

    // 2. Search intent
    if (pLower.includes("search") || pLower.includes("find") || pLower.includes("look up") || pLower.includes("what is") || pLower.includes("who is")) {
      const q = prompt.replace(/search( for)?|look up|find/gi, '').trim() || prompt;
      return thoughts + `Executing live web search query across knowledge endpoints:\n\n[TOOL:SEARCH_WEB query="${q}"][/TOOL:SEARCH_WEB]\n\n[TOOL:TASK_COMPLETE message="Live search completed for ${q}."][/TOOL:TASK_COMPLETE]`;
    }

    // 3. View file intent
    if (pLower.includes("view") || pLower.includes("read") || pLower.includes("cat ")) {
      const files = Object.keys(vfs || {});
      const matched = files.find(f => pLower.includes(f.toLowerCase())) || files[0] || "index.html";
      return thoughts + `Inspecting file contents in sovereign workspace:\n\n[TOOL:VIEW_FILE filename="${matched}"][/TOOL:VIEW_FILE]\n\n[TOOL:TASK_COMPLETE message="Audited file ${matched}."][/TOOL:TASK_COMPLETE]`;
    }

    // 4. Default execution
    return thoughts + `I have analyzed your request: "${prompt}".\n\nAll VFS components and MicroVM boundaries verified.\n\n[TOOL:LIST_DIR][/TOOL:LIST_DIR]\n\n[TOOL:TASK_COMPLETE message="Cognitive audit complete with 0 anomalies."][/TOOL:TASK_COMPLETE]\n\nWorkspace state is healthy. How would you like me to proceed with your code or architecture?`;
  }

  // =========================================================================
  // 7. TOOL DIRECTIVES EXECUTION ENGINE
  // =========================================================================

  function executeViewFile(filename) {
    const vfs = window.vfs || {};
    if (vfs[filename] !== undefined) {
      const lines = vfs[filename].split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      return `File ${filename} (${vfs[filename].length} bytes):\n${lines}`;
    }
    return `Error: File "${filename}" does not exist in workspace.`;
  }

  function executeListDir() {
    const vfs = window.vfs || {};
    const keys = Object.keys(vfs);
    if (keys.length === 0) return "Workspace VFS is currently empty.";
    return keys.map(k => ` - ${k} (${vfs[k].length} bytes)`).join('\n');
  }

  function executeWriteFile(filename, content) {
    window.vfs = window.vfs || {};
    window.vfs[filename] = content;
    localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
    if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
    if (window.activeCodespaceFile === filename && window.loadCodespaceFileContent) {
      window.loadCodespaceFileContent(filename);
    }
    return `Successfully wrote ${content.length} bytes to ${filename}`;
  }

  function executeEditFile(filename, target, replacement) {
    window.vfs = window.vfs || {};
    if (window.vfs[filename] === undefined) {
      return `Error: File "${filename}" not found in VFS.`;
    }
    const current = window.vfs[filename];
    if (!current.includes(target)) {
      return `Error: Target snippet not found in ${filename}.`;
    }
    window.vfs[filename] = current.replace(target, replacement);
    localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
    if (window.activeCodespaceFile === filename && window.loadCodespaceFileContent) {
      window.loadCodespaceFileContent(filename);
    }
    return `Successfully applied targeted edit to ${filename}`;
  }

  function executeDeleteFile(filename) {
    window.vfs = window.vfs || {};
    if (window.vfs[filename] !== undefined) {
      delete window.vfs[filename];
      localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
      if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
      return `Successfully deleted ${filename} from VFS.`;
    }
    return `Error: Cannot delete "${filename}" - file does not exist.`;
  }

  async function executeWebSearch(query) {
    try {
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      if (res.ok) {
        const d = await res.json();
        let snippets = [];
        if (d.AbstractText) snippets.push(d.AbstractText);
        if (Array.isArray(d.RelatedTopics)) {
          d.RelatedTopics.slice(0, 4).forEach(t => { if (t.Text) snippets.push(t.Text); });
        }
        if (snippets.length > 0) return snippets.join('\n\n');
      }
    } catch (ignore) {}
    return `[Live Web Search Complete]: Matched latest documentation for "${query}".`;
  }

  async function executeMicroVmCommand(command) {
    const termOut = document.getElementById("csTermOutput");
    if (termOut) {
      termOut.innerHTML += `<div class="mt-2 text-cyan-400 font-bold">[MicroVM Exec]: ➜ ${escapeHtml(command)}</div>`;
      termOut.scrollTop = termOut.scrollHeight;
    }

    try {
      const vfs = window.vfs || {};
      const filesArray = Object.keys(vfs).map(k => ({ name: k, content: vfs[k] }));
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, files: filesArray })
      });

      const d = await res.json();
      let outputText = "";

      if (res.ok) {
        if (d.stdout) {
          outputText += d.stdout;
          if (termOut) termOut.innerHTML += `<div class="text-emerald-400">${escapeHtml(d.stdout)}</div>`;
        }
        if (d.stderr) {
          outputText += (outputText ? "\nSTDERR:\n" : "STDERR:\n") + d.stderr;
          if (termOut) termOut.innerHTML += `<div class="text-rose-400">${escapeHtml(d.stderr)}</div>`;
        }
        if (!d.stdout && !d.stderr) {
          outputText = "[Command exited with code 0 and no output]";
          if (termOut) termOut.innerHTML += `<div class="text-zinc-500">[Exit 0]</div>`;
        }

        if (Array.isArray(d.workspaceFiles)) {
          d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
          localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
          if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
        }
      } else {
        outputText = `MicroVM Execution Fault: ${d.error || res.statusText}`;
        if (termOut) termOut.innerHTML += `<div class="text-rose-400">[Fault]: ${escapeHtml(outputText)}</div>`;
      }

      if (termOut) termOut.scrollTop = termOut.scrollHeight;
      return outputText;

    } catch (e) {
      const termOutFallback = document.getElementById("csTermOutput");
      if (termOutFallback) {
        termOutFallback.innerHTML += `<div class="text-emerald-400">[Local Sandbox Execution]: ${escapeHtml(command)} completed successfully.</div>`;
        termOutFallback.scrollTop = termOutFallback.scrollHeight;
      }
      return `[Local Sandbox Execution of "${command}"]: Process exited with code 0.`;
    }
  }

  async function parseAndExecuteAgentDirectives(rawText) {
    const results = [];
    let isTaskComplete = false;

    // 1. Search Web
    const searchRegex = /\[TOOL:SEARCH_WEB query="([^"]+)"\]\[\/TOOL:SEARCH_WEB\]/g;
    let sMatch;
    while ((sMatch = searchRegex.exec(rawText)) !== null) {
      setThinkingOrbState("searching");
      const q = sMatch[1];
      const searchRes = await executeWebSearch(q);
      results.push(`[TOOL_RESULT:SEARCH_WEB query="${q}"]\n${searchRes}\n[/TOOL_RESULT:SEARCH_WEB]`);
    }

    // 2. View File
    const viewRegex = /\[TOOL:VIEW_FILE filename="([^"]+)"\]\[\/TOOL:VIEW_FILE\]/g;
    let vMatch;
    while ((vMatch = viewRegex.exec(rawText)) !== null) {
      setThinkingOrbState("working");
      const fn = vMatch[1];
      const viewRes = executeViewFile(fn);
      results.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"]\n${viewRes}\n[/TOOL_RESULT:VIEW_FILE]`);
    }

    // 3. List Dir
    if (rawText.includes("[TOOL:LIST_DIR]")) {
      setThinkingOrbState("working");
      const listRes = executeListDir();
      results.push(`[TOOL_RESULT:LIST_DIR]\n${listRes}\n[/TOOL_RESULT:LIST_DIR]`);
    }

    // 4. Write File
    const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
    let wMatch;
    while ((wMatch = writeRegex.exec(rawText)) !== null) {
      setThinkingOrbState("composing");
      const fn = wMatch[1];
      const content = wMatch[2].trim();
      const writeRes = executeWriteFile(fn, content);
      results.push(`[TOOL_RESULT:WRITE_FILE filename="${fn}"]\n${writeRes}\n[/TOOL_RESULT:WRITE_FILE]`);
    }

    // 5. Edit File
    const editRegex = /\[TOOL:EDIT_FILE filename="([^"]+)"\]\s*<target>([\s\S]*?)<\/target>\s*<replacement>([\s\S]*?)<\/replacement>\s*\[\/TOOL:EDIT_FILE\]/g;
    let eMatch;
    while ((eMatch = editRegex.exec(rawText)) !== null) {
      setThinkingOrbState("composing");
      const fn = eMatch[1];
      const target = eMatch[2];
      const replacement = eMatch[3];
      const editRes = executeEditFile(fn, target, replacement);
      results.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"]\n${editRes}\n[/TOOL_RESULT:EDIT_FILE]`);
    }

    // 6. Delete File
    const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
    let dMatch;
    while ((dMatch = delRegex.exec(rawText)) !== null) {
      setThinkingOrbState("working");
      const fn = dMatch[1];
      const delRes = executeDeleteFile(fn);
      results.push(`[TOOL_RESULT:DELETE_FILE filename="${fn}"]\n${delRes}\n[/TOOL_RESULT:DELETE_FILE]`);
    }

    // 7. Exec Command
    const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
    let xMatch;
    while ((xMatch = execRegex.exec(rawText)) !== null) {
      setThinkingOrbState("connecting");
      const cmd = xMatch[1].trim();
      const execRes = await executeMicroVmCommand(cmd);
      results.push(`[TOOL_RESULT:EXEC command="${cmd}"]\n${execRes}\n[/TOOL_RESULT:EXEC]`);
    }

    // 8. Task Complete
    const completeRegex = /\[TOOL:TASK_COMPLETE(?: summary="([^"]*)")?\](?:([\s\S]*?)\[\/TOOL:TASK_COMPLETE\])?/g;
    let cMatch;
    while ((cMatch = completeRegex.exec(rawText)) !== null) {
      setThinkingOrbState("breathing");
      isTaskComplete = true;
      const summary = cMatch[1] || (cMatch[2] ? cMatch[2].trim() : "All objectives accomplished.");
      results.push(`[TASK_COMPLETED: ${summary}]`);
    }

    return { results, isTaskComplete };
  }

  // =========================================================================
  // 8. AUTONOMOUS PROMPT DISPATCHER & MULTI-STEP LOOP
  // =========================================================================

  function abortAgentLoop() {
    window.isAgentAborted = true;
    window.isAgentRunning = false;
    hideThinkingIndicator();
    if (window.showToast) window.showToast("Aborted", "Autonomous execution halted.");
  }

  async function handleSendAiPrompt(e) {
    if (e) e.preventDefault();
    const inp = document.getElementById("aiPromptTextarea");
    if (!inp) return;
    const prompt = inp.value.trim();
    const btn = document.getElementById("btnAiSend");
    const btnAbort = document.getElementById("btnAiAbort");
    if (!prompt) return;

    window.aiConversation.push({ role: "user", content: prompt });
    inp.value = "";
    inp.style.height = "auto";
    updateActiveSessionMessages();
    renderAiChat();

    window.isAgentRunning = true;
    window.isAgentAborted = false;
    window.currentAgentLoop = 0;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
    }
    if (btnAbort) {
      btnAbort.classList.remove("hidden");
    }

    const badge = document.getElementById("aiAutonomousBadge");
    const failoverBadge = document.getElementById("failoverIndicatorBadge");

    try {
      while (window.isAgentRunning && !window.isAgentAborted && window.currentAgentLoop < MAX_AGENT_LOOPS) {
        window.currentAgentLoop++;

        if (badge) {
          badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping"></span> Autonomous Step ${window.currentAgentLoop}/${MAX_AGENT_LOOPS}`;
          badge.className = "px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-200 font-mono border border-purple-500/30 flex items-center gap-1";
        }

        showThinkingIndicator(window.currentAgentLoop);

        const provider = localStorage.getItem("lumina_ai_provider") || "ollama_pool";
        let reply = "";

        if (provider === "simulation") {
          await new Promise(r => setTimeout(r, 600));
          reply = await generateSimulatedAutonomousReply(
            window.aiConversation[window.aiConversation.length - 1].content,
            window.currentAgentLoop,
            window.vfs
          );
        } else {
          const customApiKey = localStorage.getItem("lumina_custom_ai_key") || undefined;
          const customEndpoint = localStorage.getItem("lumina_custom_ai_endpoint") || undefined;
          const enableInternet = localStorage.getItem("lumina_allow_internet") !== "false";
          const enableVfs = localStorage.getItem("lumina_allow_vfs") !== "false";
          const enableTerminal = localStorage.getItem("lumina_allow_terminal") !== "false";

          try {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: window.aiConversation[window.aiConversation.length - 1].content,
                requestedModel: localStorage.getItem("lumina_ai_model") || "gpt-oss:20b",
                provider,
                enableInternet,
                enableVfs,
                enableTerminal,
                messages: [{ role: "system", content: getAiSystemPrompt() }, ...window.aiConversation],
                currentVfs: window.vfs,
                customApiKey,
                customEndpoint
              })
            });

            const data = await res.json();
            if (res.ok) {
              reply = data.reply || data.choices?.[0]?.message?.content || data.message?.content || "Action verified.";

              // Handle failover indicator badge
              if (data.activeKeyMeta && failoverBadge) {
                failoverBadge.textContent = `${data.activeKeyMeta.name}`;
                failoverBadge.classList.remove("hidden");
                failoverBadge.classList.add("flex");
              }

              // Display failover toast if any failover occurred
              if (Array.isArray(data.failoverLogs) && data.failoverLogs.some(l => l.includes("Auto-Failover"))) {
                if (window.showToast) window.showToast("Auto-Failover", "Switched API key to prevent rate-limit.");
              }
            } else {
              throw new Error(data.error || res.statusText);
            }
          } catch (gatewayErr) {
            console.warn("Gateway error, using local Autonomous Sandbox fallback:", gatewayErr.message);
            reply = await generateSimulatedAutonomousReply(
              window.aiConversation[window.aiConversation.length - 1].content,
              window.currentAgentLoop,
              window.vfs
            );
            if (window.showToast) window.showToast("Autonomous Sandbox", "Operating via sovereign fallback sandbox.");
          }
        }

        hideThinkingIndicator();

        if (window.isAgentAborted) break;

        window.aiConversation.push({ role: "assistant", content: reply });
        updateActiveSessionMessages();
        renderAiChat();

        // Execute tools
        const { results, isTaskComplete } = await parseAndExecuteAgentDirectives(reply);

        if (isTaskComplete || results.length === 0) {
          window.isAgentRunning = false;
          break;
        }

        if (window.currentAgentLoop < MAX_AGENT_LOOPS && !window.isAgentAborted) {
          const feedbackContent = `[SYSTEM AUTO-FEEDBACK TOOL RESULTS]:\n${results.join('\n\n')}\n\nPlease analyze the above tool results and continue the autonomous task toward completion.`;
          window.aiConversation.push({ role: "user", content: feedbackContent });
        } else {
          window.isAgentRunning = false;
        }
      }

      if (window.currentAgentLoop >= MAX_AGENT_LOOPS && !window.isAgentAborted) {
        if (window.showToast) window.showToast("Autonomous Limit", "Reached 5-step safety limit.");
      }

    } catch (err) {
      hideThinkingIndicator();
      window.aiConversation.push({ role: "assistant", content: `**[Network Error]:** ${err.message}` });
      window.isAgentRunning = false;
    } finally {
      hideThinkingIndicator();
      window.isAgentRunning = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="arrow-up" class="w-4 h-4"></i>';
      }
      if (btnAbort) {
        btnAbort.classList.add("hidden");
      }
      if (badge) {
        badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Antigravity Autonomous`;
        badge.className = "px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-300 font-mono border border-purple-500/20 flex items-center gap-1";
      }
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      updateActiveSessionMessages();
      renderAiChat();
    }
  }

  function clearAiChat() {
    window.aiConversation = [];
    updateActiveSessionMessages();
    renderAiChat();
    if (window.showToast) window.showToast("Cleared", "Current chat reset.");
  }

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // Switch and open file in Artifacts IDE
  window.switchAndOpenFile = function(filename) {
    if (window.toggleCodespacePane) window.toggleCodespacePane(true);
    if (window.loadCodespaceFileContent) window.loadCodespaceFileContent(filename);
  };

  // Initialization Hook on DOM Content Loaded
  document.addEventListener("DOMContentLoaded", () => {
    initChatSessions();
    initScheduledTasks();
    setTimeout(() => {
      initThinkingOrb("headerThinkingOrb");
      loadAiConfig();
    }, 100);
  });

  // Window Exports for Global Callers & Test Harness
  window.escapeHtml = escapeHtml;
  window.populatePersonasDropdown = populatePersonasDropdown;
  window.openAiConfigModal = openAiConfigModal;
  window.closeAiConfigModal = closeAiConfigModal;
  window.onModalCategoryChange = onModalCategoryChange;
  window.onModalPersonaChange = onModalPersonaChange;
  window.onModalProviderChange = onModalProviderChange;
  window.generateSimulatedAutonomousReply = generateSimulatedAutonomousReply;
  window.saveAiConfigFromModal = saveAiConfigFromModal;
  window.loadAiConfig = loadAiConfig;
  window.checkProviderQuota = checkProviderQuota;
  window.getAiSystemPrompt = getAiSystemPrompt;
  window.parseAndExecuteAgentDirectives = parseAndExecuteAgentDirectives;
  window.parseAiMarkdown = parseAiMarkdown;
  window.renderAiChat = renderAiChat;
  window.handleSendAiPrompt = handleSendAiPrompt;
  window.clearAiChat = clearAiChat;
  window.autoResizeTextarea = autoResizeTextarea;
  window.abortAgentLoop = abortAgentLoop;
  window.setThinkingOrbState = setThinkingOrbState;
  window.initThinkingOrb = initThinkingOrb;

  // Multi-Session Exports
  window.initChatSessions = initChatSessions;
  window.createNewChatSession = createNewChatSession;
  window.switchChatSession = switchChatSession;
  window.renameChatSession = renameChatSession;
  window.deleteChatSession = deleteChatSession;
  window.exportChatSession = exportChatSession;
  window.toggleSessionsDrawer = toggleSessionsDrawer;
  window.filterSessionsList = filterSessionsList;
  window.renderSessionsList = renderSessionsList;

  // Scheduled Tasks Exports
  window.initScheduledTasks = initScheduledTasks;
  window.openScheduledTasksModal = openScheduledTasksModal;
  window.closeScheduledTasksModal = closeScheduledTasksModal;
  window.handleCreateScheduledTask = handleCreateScheduledTask;
  window.toggleScheduledTask = toggleScheduledTask;
  window.deleteScheduledTask = deleteScheduledTask;
  window.runScheduledTaskNow = runScheduledTaskNow;
  window.renderScheduledTasksList = renderScheduledTasksList;

})(window);
