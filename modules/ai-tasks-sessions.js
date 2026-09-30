// modules/ai-tasks-sessions.js - Multi-Session History & Autonomous Scheduled Tasks Engine for LuminaVista OS
(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (window.escapeHtml) return window.escapeHtml(str);
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const renderAiChat = (...args) => (window.renderAiChat ? window.renderAiChat(...args) : undefined);
  const handleSendAiPrompt = (...args) => (window.handleSendAiPrompt ? window.handleSendAiPrompt(...args) : undefined);

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
      nextRunTime: Date.now() + intervalSeconds * 1000,
      executionCount: 0
    };

    window.scheduledTasks.push(newTask);
    saveScheduledTasks();

    // Two-Way Sync to Lumina Calendar & Google Calendar
    if (window.LuminaCalendar) {
      const taskEvent = {
        id: `sched_evt_${newTask.id}`,
        scheduledTaskId: newTask.id,
        title: `[AI Task] ${name}`,
        description: prompt,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        category: 'ai_autonomous',
        color: '#00f2fe',
        isAutonomous: true,
        priority: 'high'
      };
      const events = window.LuminaCalendar.getEvents();
      if (!events.some(e => e.scheduledTaskId === newTask.id)) {
        events.push(taskEvent);
        localStorage.setItem('luminavista_calendar_events_v1', JSON.stringify(events));
        if (window.LuminaCalendar.pushEventToGoogle) {
          window.LuminaCalendar.pushEventToGoogle(taskEvent);
        }
        window.LuminaCalendar.render();
      }
    }

    // Sync schedules to Cloud Worker so it runs even if PC is shut down
    syncSchedulesToCloudWorker();

    nameInp.value = "";
    promptInp.value = "";
    if (window.showToast) window.showToast("Task Scheduled", `Registered "${name}" (Every ${intervalSeconds / 60}m)`);
  }

  function toggleScheduledTask(id) {
    const t = window.scheduledTasks.find(x => x.id === id);
    if (!t) return;
    t.enabled = !t.enabled;
    saveScheduledTasks();
    syncSchedulesToCloudWorker();
    if (window.showToast) window.showToast("Task Toggled", `Task "${t.name}" is now ${t.enabled ? 'Enabled' : 'Paused'}`);
  }

  function deleteScheduledTask(id) {
    window.scheduledTasks = window.scheduledTasks.filter(x => x.id !== id);
    saveScheduledTasks();

    // Delete associated calendar event and remove from Google Calendar
    if (window.LuminaCalendar) {
      window.LuminaCalendar.deleteEvent(`sched_evt_${id}`);
    }

    syncSchedulesToCloudWorker();
    if (window.showToast) window.showToast("Task Removed", "Scheduled task deleted and removed from Google Calendar.");
  }

  async function syncSchedulesToCloudWorker() {
    if (typeof fetch === 'undefined') return;
    try {
      await fetch('/api/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_schedules',
          schedules: window.scheduledTasks,
          currentVfs: window.vfs || {},
          userSession: localStorage.getItem('lumina_session_id') || 'sovereign_session'
        })
      });
    } catch (e) {
      console.warn('Failed syncing schedules to cloud worker:', e);
    }
  }

  async function runScheduledTaskNow(id) {
    const t = window.scheduledTasks.find(x => x.id === id);
    if (!t) return;
    t.lastRun = Date.now();
    t.nextRunTime = Date.now() + (t.intervalSeconds || 3600) * 1000;
    t.executionCount = (t.executionCount || 0) + 1;
    saveScheduledTasks();
    syncSchedulesToCloudWorker();

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

  // Window Exports for Tasks & Sessions
  window.initChatSessions = initChatSessions;
  window.saveChatSessions = saveChatSessions;
  window.getActiveSession = getActiveSession;
  window.syncActiveSessionToConversation = syncActiveSessionToConversation;
  window.updateActiveSessionMessages = updateActiveSessionMessages;
  window.createNewChatSession = createNewChatSession;
  window.switchChatSession = switchChatSession;
  window.renameChatSession = renameChatSession;
  window.deleteChatSession = deleteChatSession;
  window.exportChatSession = exportChatSession;
  window.toggleSessionsDrawer = toggleSessionsDrawer;
  window.filterSessionsList = filterSessionsList;
  window.renderSessionsList = renderSessionsList;
  window.updateSessionsBadge = updateSessionsBadge;

  window.initScheduledTasks = initScheduledTasks;
  window.saveScheduledTasks = saveScheduledTasks;
  window.updateScheduledTasksBadge = updateScheduledTasksBadge;
  window.openScheduledTasksModal = openScheduledTasksModal;
  window.closeScheduledTasksModal = closeScheduledTasksModal;
  window.handleCreateScheduledTask = handleCreateScheduledTask;
  window.toggleScheduledTask = toggleScheduledTask;
  window.deleteScheduledTask = deleteScheduledTask;
  window.runScheduledTaskNow = runScheduledTaskNow;
  window.renderScheduledTasksList = renderScheduledTasksList;
  window.syncSchedulesToCloudWorker = syncSchedulesToCloudWorker;

})(typeof window !== 'undefined' ? window : global);
