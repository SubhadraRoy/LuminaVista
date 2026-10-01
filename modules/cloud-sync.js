// modules/cloud-sync.js - Sovereign Personal Cloud Workspace Synchronizer
// Persists and synchronizes Calendar, AI Chats, Whiteboard, VFS, Notes, and Theme
// seamlessly across all devices and sessions when authenticated with the access key.

(function(window) {
  'use strict';

  let syncTimeout = null;
  let isSyncing = false;
  let hasPendingSync = false;
  let syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
  let lastSyncedAt = null;

  function getSessionId() {
    try {
      return localStorage.getItem('lumina_session_id') || '';
    } catch (e) {
      return '';
    }
  }

  function updateSyncUI(status, message) {
    syncStatus = status;
    const dot = document.getElementById('cloudSyncDot');
    const label = document.getElementById('cloudSyncLabel') || document.getElementById('cloudSyncText');
    const container = document.getElementById('cloudSyncIndicator');

    if (!container || !dot || !label) return;

    container.classList.remove('opacity-50');

    if (status === 'syncing') {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping';
      label.textContent = message || 'Syncing...';
      label.className = 'text-cyan-300 font-mono hidden md:inline';
    } else if (status === 'synced') {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]';
      label.textContent = message || 'Cloud Synced';
      label.className = 'text-emerald-300 font-mono hidden md:inline';
    } else if (status === 'error') {
      dot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]';
      label.textContent = message || 'Local Cache';
      label.className = 'text-amber-300 font-mono hidden md:inline';
    }
  }

  /**
   * Serializes a snapshot of the workspace across all domains.
   */
  function getSyncPayload() {
    let calendar = [];
    let calendarSettings = {};
    let chatSessions = [];
    let activeSessionId = '';
    let aiConversation = [];
    let aiConfig = {};
    let whiteboard = null;
    let whiteboardBoards = [];
    let whiteboardActiveBoardId = 'board_default';
    let whiteboardStickies = [];
    let whiteboardTheme = 'blackboard';
    let whiteboardBg = 'dot';
    let vfs = {};
    let notes = [];
    let activeNoteId = 'note_1';
    let noteViewMode = 'split';
    let projects = [];
    let theme = 'cyan';

    try {
      if (window.LuminaCalendar?.getEvents) {
        const evts = window.LuminaCalendar.getEvents();
        if (Array.isArray(evts) && evts.length > 0) {
          calendar = evts;
        }
      }
      if (!calendar || calendar.length === 0) {
        calendar = JSON.parse(
          localStorage.getItem('luminavista_calendar_events_v1') ||
          localStorage.getItem('lumina_calendar_events') ||
          '[]'
        );
      }
    } catch (e) {
      calendar = [];
    }

    try {
      calendarSettings = JSON.parse(localStorage.getItem('luminavista_calendar_settings_v1') || '{}');
    } catch (e) {}

    try {
      chatSessions = window.chatSessions || window.aiSessions || JSON.parse(localStorage.getItem('lumina_chat_sessions') || '[]');
    } catch (e) {}

    try {
      activeSessionId = window.activeSessionId || localStorage.getItem('lumina_active_session_id') || '';
    } catch (e) {}

    try {
      aiConversation = window.aiConversation || JSON.parse(localStorage.getItem('lumina_ai_history') || '[]');
    } catch (e) {}

    try {
      aiConfig = {
        category: localStorage.getItem('lumina_ai_category') || '',
        persona: localStorage.getItem('lumina_ai_persona') || '',
        provider: localStorage.getItem('lumina_ai_provider') || '',
        model: localStorage.getItem('lumina_ai_model') || ''
      };
    } catch (e) {}

    try { whiteboard = localStorage.getItem('lumina_wb_state'); } catch (e) {}
    try { whiteboardBoards = JSON.parse(localStorage.getItem('lumina_wb_boards') || '[]'); } catch (e) {}
    try { whiteboardActiveBoardId = localStorage.getItem('lumina_wb_active_board_id') || 'board_default'; } catch (e) {}
    try { whiteboardStickies = JSON.parse(localStorage.getItem('lumina_wb_stickies') || '[]'); } catch (e) {}
    try { whiteboardTheme = localStorage.getItem('lumina_wb_theme') || localStorage.getItem('lumina_whiteboard_theme') || 'blackboard'; } catch (e) {}
    try { whiteboardBg = localStorage.getItem('lumina_wb_bg') || 'dot'; } catch (e) {}

    try { vfs = window.vfs || JSON.parse(localStorage.getItem('lumina_codespace_vfs') || '{}'); } catch (e) {}
    try { notes = window.vaultNotes || JSON.parse(localStorage.getItem('lumina_godx_multi_notes') || '[]'); } catch (e) {}
    try { activeNoteId = window.activeNoteId || localStorage.getItem('lumina_active_note_id') || 'note_1'; } catch (e) {}
    try { noteViewMode = localStorage.getItem('lumina_note_view_mode') || 'split'; } catch (e) {}
    try { projects = window.repoProjects || JSON.parse(localStorage.getItem('lumina_exm_projects') || '[]'); } catch (e) {}
    try { theme = localStorage.getItem('lumina_theme') || 'cyan'; } catch (e) {}

    return {
      calendar,
      calendarSettings,
      chatSessions,
      activeSessionId,
      aiConversation,
      aiConfig,
      whiteboard,
      whiteboardBoards,
      whiteboardActiveBoardId,
      whiteboardStickies,
      whiteboardTheme,
      whiteboardBg,
      vfs,
      notes,
      activeNoteId,
      noteViewMode,
      projects,
      theme,
      activeTabId: localStorage.getItem('lumina_active_tab_id') || window.currentActiveTab || 'tab-ai-studio',
      updatedAt: Date.now()
    };
  }

  /**
   * Pulls master workspace state from cloud backend and hydrates all modules.
   */
  async function pullFromCloud() {
    if (isSyncing) return true;
    isSyncing = true;
    updateSyncUI('syncing', 'Restoring...');

    try {
      const sessionId = getSessionId();
      const res = await fetch('/api/sync', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(`Cloud sync HTTP ${res.status}`);
      }

      const payload = await res.json();
      const state = (payload && payload.data) ? payload.data : (payload.state || payload);

      // If cloud has an existing saved workspace state, hydrate local storage & DOM
      if (state && typeof state === 'object' && !payload.empty && Object.keys(state).length > 0) {
        hydrateWorkspaceFromState(state);
        lastSyncedAt = state.updatedAt || Date.now();
        updateSyncUI('synced', 'Cloud Synced');
        return true;
      } else {
        // Cloud is empty (first-time deployment): Seed cloud with existing local data
        updateSyncUI('syncing', 'Seeding Cloud...');
        await pushToCloud();
        return true;
      }
    } catch (err) {
      console.warn('[LuminaCloudSync] Pull error (using resilient local cache):', err.message);
      updateSyncUI('error', 'Local Mode');
      return false;
    } finally {
      isSyncing = false;
    }
  }

  /**
   * Hydrates all domain modules and localStorage from the downloaded cloud state.
   */
  function hydrateWorkspaceFromState(state) {
    if (!state || typeof state !== 'object') return;

    let hasCalendarUpdated = false;
    let hasChatUpdated = false;
    let hasWhiteboardUpdated = false;
    let hasVfsUpdated = false;
    let hasNotesUpdated = false;
    let hasProjectsUpdated = false;

    // 1. Calendar Events & Settings
    if (Array.isArray(state.calendar)) {
      try {
        localStorage.setItem('luminavista_calendar_events_v1', JSON.stringify(state.calendar));
        localStorage.setItem('lumina_calendar_events', JSON.stringify(state.calendar));
        if (window.LuminaCalendar?.setEvents) {
          window.LuminaCalendar.setEvents(state.calendar);
        } else if (window.calendarEvents) {
          window.calendarEvents = state.calendar;
        }
        hasCalendarUpdated = true;
      } catch (e) {}
    }
    if (state.calendarSettings && typeof state.calendarSettings === 'object') {
      try {
        localStorage.setItem('luminavista_calendar_settings_v1', JSON.stringify(state.calendarSettings));
        if (window.LuminaCalendar?.setSettings) {
          window.LuminaCalendar.setSettings(state.calendarSettings);
        }
      } catch (e) {}
    }

    // 2. AI Chat Sessions & History
    if (Array.isArray(state.chatSessions)) {
      try {
        localStorage.setItem('lumina_chat_sessions', JSON.stringify(state.chatSessions));
        window.chatSessions = state.chatSessions;
        window.aiSessions = state.chatSessions;
        if (state.activeSessionId) {
          localStorage.setItem('lumina_active_session_id', state.activeSessionId);
          window.activeSessionId = state.activeSessionId;
        }
        if (Array.isArray(state.aiConversation)) {
          localStorage.setItem('lumina_ai_history', JSON.stringify(state.aiConversation));
          window.aiConversation = state.aiConversation;
        }
        hasChatUpdated = true;
      } catch (e) {}
    }

    // AI Config
    if (state.aiConfig && typeof state.aiConfig === 'object') {
      try {
        if (state.aiConfig.category) localStorage.setItem('lumina_ai_category', state.aiConfig.category);
        if (state.aiConfig.persona) localStorage.setItem('lumina_ai_persona', state.aiConfig.persona);
        if (state.aiConfig.provider) localStorage.setItem('lumina_ai_provider', state.aiConfig.provider);
        if (state.aiConfig.model) localStorage.setItem('lumina_ai_model', state.aiConfig.model);
      } catch (e) {}
    }

    // 3. Whiteboard Pro Multi-Board Gallery & Canvas
    if (Array.isArray(state.whiteboardBoards) && state.whiteboardBoards.length > 0) {
      try {
        localStorage.setItem('lumina_wb_boards', JSON.stringify(state.whiteboardBoards));
        if (state.whiteboardActiveBoardId) {
          localStorage.setItem('lumina_wb_active_board_id', state.whiteboardActiveBoardId);
        }
        hasWhiteboardUpdated = true;
      } catch (e) {}
    }
    if (state.whiteboard) {
      try {
        localStorage.setItem('lumina_wb_state', state.whiteboard);
        hasWhiteboardUpdated = true;
      } catch (e) {}
    }
    if (Array.isArray(state.whiteboardStickies)) {
      try {
        localStorage.setItem('lumina_wb_stickies', JSON.stringify(state.whiteboardStickies));
      } catch (e) {}
    }
    if (state.whiteboardTheme) {
      try {
        localStorage.setItem('lumina_wb_theme', state.whiteboardTheme);
        localStorage.setItem('lumina_whiteboard_theme', state.whiteboardTheme);
        if (window.setWhiteboardTheme) window.setWhiteboardTheme(state.whiteboardTheme);
      } catch (e) {}
    }
    if (state.whiteboardBg) {
      try {
        localStorage.setItem('lumina_wb_bg', state.whiteboardBg);
        if (window.setWhiteboardBackground) window.setWhiteboardBackground(state.whiteboardBg);
      } catch (e) {}
    }

    // 4. Virtual File System (VFS)
    if (state.vfs && typeof state.vfs === 'object') {
      try {
        localStorage.setItem('lumina_codespace_vfs', JSON.stringify(state.vfs));
        window.vfs = state.vfs;
        hasVfsUpdated = true;
      } catch (e) {}
    }

    // 5. Notes Vault Markdown
    if (Array.isArray(state.notes)) {
      try {
        localStorage.setItem('lumina_godx_multi_notes', JSON.stringify(state.notes));
        window.vaultNotes = state.notes;
        if (state.activeNoteId) {
          localStorage.setItem('lumina_active_note_id', state.activeNoteId);
          window.activeNoteId = state.activeNoteId;
        }
        if (state.noteViewMode) {
          localStorage.setItem('lumina_note_view_mode', state.noteViewMode);
          window.noteViewMode = state.noteViewMode;
        }
        hasNotesUpdated = true;
      } catch (e) {}
    }

    // 6. Projects Catalog
    if (Array.isArray(state.projects) && state.projects.length > 0) {
      try {
        localStorage.setItem('lumina_exm_projects', JSON.stringify(state.projects));
        window.repoProjects = state.projects;
        hasProjectsUpdated = true;
      } catch (e) {}
    }

    // 7. System Theme
    if (state.theme && typeof state.theme === 'string') {
      try {
        localStorage.setItem('lumina_theme', state.theme);
        if (window.setDashboardTheme) window.setDashboardTheme(state.theme);
        else if (window.applyLuminaTheme) window.applyLuminaTheme(state.theme);
      } catch (e) {}
    }

    // Render updated views if active
    if (hasCalendarUpdated && window.LuminaCalendar) {
      if (window.LuminaCalendar.loadFromStorage) window.LuminaCalendar.loadFromStorage();
      if (window.LuminaCalendar.renderCalendar) window.LuminaCalendar.renderCalendar();
      else if (window.LuminaCalendar.render) window.LuminaCalendar.render();
    }

    if (hasChatUpdated) {
      if (window.initChatSessions) window.initChatSessions();
      if (window.renderAiChat) window.renderAiChat();
    }

    if (hasWhiteboardUpdated) {
      if (window.LuminaWhiteboardGallery?.loadGalleryFromStorage) window.LuminaWhiteboardGallery.loadGalleryFromStorage();
      if (window.loadWbState) window.loadWbState();
    }

    if (hasVfsUpdated) {
      if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
      if (window.rebuildGraphData) window.rebuildGraphData();
    }

    if (hasNotesUpdated) {
      if (window.renderNoteTabs) window.renderNoteTabs();
      if (window.loadActiveNoteContent) window.loadActiveNoteContent();
    }

    if (hasProjectsUpdated && window.renderProjectsList) {
      window.renderProjectsList();
    }

    // 8. Reopen Exact Same Tab Where Last Closed
    if (state.activeTabId && typeof state.activeTabId === 'string') {
      try {
        localStorage.setItem('lumina_active_tab_id', state.activeTabId);
        window.currentActiveTab = state.activeTabId;
        if (window.switchTab) {
          window.switchTab(state.activeTabId);
        }
      } catch (e) {}
    }
  }

  /**
   * Pushes current local workspace state across all domains to the cloud backend.
   */
  async function pushToCloud() {
    if (isSyncing) {
      hasPendingSync = true;
      return true;
    }
    isSyncing = true;
    updateSyncUI('syncing', 'Saving to Cloud...');

    try {
      const sessionId = getSessionId();
      const payload = getSyncPayload();

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId
        },
        credentials: 'include',
        body: JSON.stringify({ data: payload })
      });

      if (!res.ok) {
        throw new Error(`Cloud save HTTP ${res.status}`);
      }

      lastSyncedAt = Date.now();
      updateSyncUI('synced', 'Cloud Synced');
      return true;
    } catch (err) {
      console.warn('[LuminaCloudSync] Push error (cached locally):', err.message);
      updateSyncUI('error', 'Local Mode');
      return false;
    } finally {
      isSyncing = false;
      if (hasPendingSync) {
        hasPendingSync = false;
        queueSync(500);
      }
    }
  }

  /**
   * Debounces pushes to cloud backend so rapid user changes batch smoothly.
   */
  function queueSync(delayMs = 1500) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      pushToCloud();
    }, delayMs);
  }

  /**
   * Flush sync immediately (e.g. before page unload or explicit user action).
   */
  function flushSync() {
    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }
    return pushToCloud();
  }

  function init() {
    // Initial restore from cloud
    pullFromCloud();

    // Hook unload to persist final state
    window.addEventListener('beforeunload', () => {
      flushSync();
    });

    // Periodic background sync verification every 90 seconds
    setInterval(() => {
      if (!isSyncing && !hasPendingSync) {
        pullFromCloud();
      }
    }, 90000);
  }

  // Auto-initialize when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 100);
    }
  }

  // Global API
  window.LuminaCloudSync = {
    init,
    pullFromCloud,
    pushToCloud,
    queueSync,
    flushSync,
    getSyncPayload,
    applyCloudPayload: (s) => { hydrateWorkspaceFromState(s); return true; },
    isSyncScheduled: () => syncTimeout !== null,
    getStatus: () => syncStatus,
    getLastSyncedAt: () => lastSyncedAt
  };

})(typeof window !== 'undefined' ? window : globalThis);
