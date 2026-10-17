// modules/cloud-sync.js - Sovereign Personal Cloud Workspace Synchronizer
// Persists and synchronizes Calendar, AI Chats, Whiteboard, VFS, Notes, and Theme
// seamlessly across all devices and sessions when authenticated with the access key.

(function(window) {
  'use strict';

  const localStorage = (window && window.localStorage) ? window.localStorage : (typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null);

  let syncTimeout = null;
  let isSyncing = false;
  let hasPendingSync = false;
  let syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error'
  let lastSyncedAt = null;
  let hasRestoredInitialTab = false;

  function getSessionId() {
    try {
      return localStorage.getItem('lumina_session_id') || '';
    } catch (e) {
      return '';
    }
  }

  function getApiOrigin() {
    return (window.location && window.location.hostname && window.location.hostname.endsWith('github.io'))
      ? 'https://lumina-vista-sigma.vercel.app'
      : '';
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
      admin_passwords: (() => {
        try { return JSON.parse(localStorage.getItem('lumina_temp_vault') || '[]'); } catch { return []; }
      })(),
      updatedAt: Date.now()
    };
  }

  /**
   * Pulls master workspace state from cloud backend and hydrates all modules.
   * @param {boolean} [isInitial=false] - True during initial cold boot
   */
  async function pullFromCloud(isInitial = false) {
    if (isSyncing) return true;
    isSyncing = true;
    updateSyncUI('syncing', 'Restoring...');

    try {
      const sessionId = getSessionId();
      const res = await fetch(getApiOrigin() + '/api/sync', {
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
        const isColdBoot = Boolean(isInitial && !hasRestoredInitialTab);
        hydrateWorkspaceFromState(state, { isInitial: isColdBoot });
        if (isColdBoot) {
          hasRestoredInitialTab = true;
        }
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
   * @param {Object} state - Workspace snapshot from cloud
   * @param {Object} [options={}] - Hydration options ({ isInitial: boolean })
   */
  function hydrateWorkspaceFromState(state, options = {}) {
    if (!state || typeof state !== 'object') return;

    let hasCalendarUpdated = false;
    let hasChatUpdated = false;
    let hasWhiteboardUpdated = false;
    let hasVfsUpdated = false;
    let hasNotesUpdated = false;
    let hasProjectsUpdated = false;

    // 1. Calendar Events & Settings (Non-destructive merge to protect local & cloud events)
    if (Array.isArray(state.calendar)) {
      try {
        let localEvents = [];
        try {
          if (window.LuminaCalendar?.getEvents) {
            const evts = window.LuminaCalendar.getEvents();
            if (Array.isArray(evts) && evts.length > 0) localEvents = evts;
          }
          if (localEvents.length === 0 && Array.isArray(window.calendarEvents) && window.calendarEvents.length > 0) {
            localEvents = window.calendarEvents;
          }
          if (localEvents.length === 0) {
            localEvents = JSON.parse(
              localStorage.getItem('luminavista_calendar_events_v1') ||
              localStorage.getItem('lumina_calendar_events') ||
              '[]'
            );
          }
        } catch (_) {
          localEvents = [];
        }
        if (!Array.isArray(localEvents)) localEvents = [];

        const getEventTimestamp = (evt) => {
          if (!evt || typeof evt !== 'object') return 0;
          const ts = evt.updatedAt || evt.lastModified || evt.updated || evt.createdAt || 0;
          if (typeof ts === 'number') return ts;
          if (typeof ts === 'string') {
            const parsed = Date.parse(ts);
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        const localMap = new Map();
        const unkeyedLocal = [];
        for (const ev of localEvents) {
          if (ev && (ev.id !== undefined && ev.id !== null)) {
            localMap.set(String(ev.id), ev);
          } else if (ev) {
            unkeyedLocal.push(ev);
          }
        }

        const mergedCalendar = [];
        let hasNewCalendarFromCloud = false;

        for (const cloudEv of state.calendar) {
          if (!cloudEv || typeof cloudEv !== 'object') continue;
          if (cloudEv.id !== undefined && cloudEv.id !== null) {
            const idKey = String(cloudEv.id);
            const localEv = localMap.get(idKey);
            if (!localEv) {
              // Cloud event not present locally -> include cloud event
              mergedCalendar.push(cloudEv);
              hasNewCalendarFromCloud = true;
            } else {
              // Exists in both: compare updatedAt / lastModified
              const cloudTs = getEventTimestamp(cloudEv);
              const localTs = getEventTimestamp(localEv);
              if (cloudTs > localTs) {
                mergedCalendar.push(cloudEv);
                hasNewCalendarFromCloud = true;
              } else {
                // Local is newer or equal -> retain local event
                mergedCalendar.push(localEv);
              }
              localMap.delete(idKey);
            }
          } else {
            mergedCalendar.push(cloudEv);
            hasNewCalendarFromCloud = true;
          }
        }

        // Preserve all local events not present in cloud
        for (const remainingLocal of localMap.values()) {
          mergedCalendar.push(remainingLocal);
        }
        for (const unkeyed of unkeyedLocal) {
          mergedCalendar.push(unkeyed);
        }

        localStorage.setItem('luminavista_calendar_events_v1', JSON.stringify(mergedCalendar));
        localStorage.setItem('lumina_calendar_events', JSON.stringify(mergedCalendar));
        if (window.LuminaCalendar?.setEvents) {
          window.LuminaCalendar.setEvents(mergedCalendar);
        } else if (window.calendarEvents) {
          window.calendarEvents = mergedCalendar;
        }
        if (hasNewCalendarFromCloud || mergedCalendar.length !== localEvents.length) {
          hasCalendarUpdated = true;
        }

        // If local had events not present in stale cloud, queue a push to update cloud
        if (mergedCalendar.length > state.calendar.length) {
          queueSync(2000);
        }
      } catch (e) {
        console.warn('[CloudSync] Non-destructive calendar hydration error:', e);
      }
    }
    if (state.calendarSettings && typeof state.calendarSettings === 'object') {
      try {
        localStorage.setItem('luminavista_calendar_settings_v1', JSON.stringify(state.calendarSettings));
        if (window.LuminaCalendar?.setSettings) {
          window.LuminaCalendar.setSettings(state.calendarSettings);
        }
        hasCalendarUpdated = true;
      } catch (e) {}
    }

    // 2. AI Chat Sessions & History (Non-destructive merge to protect active conversations)
    if (Array.isArray(state.chatSessions)) {
      try {
        let localSessions = [];
        try {
          localSessions = window.aiSessions || window.chatSessions || JSON.parse(localStorage.getItem('lumina_chat_sessions') || '[]');
          if (!Array.isArray(localSessions)) localSessions = [];
        } catch (_) { localSessions = []; }

        const localMap = new Map(localSessions.map(s => [s.id, s]));
        const mergedSessions = [];
        let hasNewMessagesFromCloud = false;

        // Process incoming cloud sessions
        for (const cloudSess of state.chatSessions) {
          if (!cloudSess || !cloudSess.id) continue;
          const localSess = localMap.get(cloudSess.id);
          if (!localSess) {
            // New session from cloud
            mergedSessions.push(cloudSess);
            hasNewMessagesFromCloud = true;
          } else {
            // Session exists in both: preserve whichever has more messages or newer timestamp
            const localMsgs = Array.isArray(localSess.messages) ? localSess.messages : [];
            const cloudMsgs = Array.isArray(cloudSess.messages) ? cloudSess.messages : [];
            if (cloudMsgs.length > localMsgs.length) {
              mergedSessions.push(cloudSess);
              hasNewMessagesFromCloud = true;
            } else {
              // Local has more messages (or equal) -> keep local conversation intact!
              mergedSessions.push(localSess);
            }
            localMap.delete(cloudSess.id);
          }
        }

        // Keep any remaining local sessions that were not in incoming cloud state
        for (const remainingLocal of localMap.values()) {
          mergedSessions.push(remainingLocal);
        }

        if (mergedSessions.length > 0) {
          localStorage.setItem('lumina_chat_sessions', JSON.stringify(mergedSessions));
          window.chatSessions = mergedSessions;
          window.aiSessions = mergedSessions;
        }

        // Active conversation safety: Never overwrite active conversation if local has active messages
        const currentLocalConv = window.aiConversation || JSON.parse(localStorage.getItem('lumina_ai_history') || '[]');
        if (Array.isArray(state.aiConversation)) {
          if (!Array.isArray(currentLocalConv) || currentLocalConv.length === 0 || state.aiConversation.length > currentLocalConv.length) {
            localStorage.setItem('lumina_ai_history', JSON.stringify(state.aiConversation));
            window.aiConversation = state.aiConversation;
            hasChatUpdated = true;
          }
        }

        if (hasNewMessagesFromCloud) {
          hasChatUpdated = true;
        }

        // If local had richer conversation than stale cloud, queue a push to update cloud
        if (mergedSessions.length > state.chatSessions.length || (Array.isArray(currentLocalConv) && currentLocalConv.length > (state.aiConversation?.length || 0))) {
          queueSync(2000);
        }
      } catch (e) {
        console.warn('[CloudSync] Non-destructive chat hydration error:', e);
      }
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
        if (window.setWhiteboardTheme) window.setWhiteboardTheme(state.whiteboardTheme, true);
      } catch (e) {}
    }
    if (state.whiteboardBg) {
      try {
        localStorage.setItem('lumina_wb_bg', state.whiteboardBg);
        if (window.setWhiteboardBackground) window.setWhiteboardBackground(state.whiteboardBg, true);
      } catch (e) {}
    }

    // 4. Virtual File System (VFS) (Non-destructive merge & prototype pollution prevention)
    if (state.vfs && typeof state.vfs === 'object' && !Array.isArray(state.vfs)) {
      try {
        let localVfs = {};
        try {
          localVfs = window.vfs || JSON.parse(localStorage.getItem('lumina_codespace_vfs') || '{}');
          if (!localVfs || typeof localVfs !== 'object' || Array.isArray(localVfs)) {
            localVfs = {};
          }
        } catch (_) {
          localVfs = {};
        }

        const isForbiddenKey = (key) => {
          return key === '__proto__' || key === 'prototype' || key === 'constructor';
        };

        const getVfsTimestamp = (val) => {
          if (val && typeof val === 'object') {
            const ts = val.updatedAt || val.lastModified || val.updated || val.createdAt || 0;
            if (typeof ts === 'number') return ts;
            if (typeof ts === 'string') {
              const parsed = Date.parse(ts);
              return isNaN(parsed) ? 0 : parsed;
            }
          }
          return 0;
        };

        // Create a prototype-safe dictionary for merged VFS
        const mergedVfs = Object.create(null);
        let hasNewVfsFromCloud = false;

        // 1. Seed with safe existing local VFS files
        for (const localKey of Object.keys(localVfs)) {
          if (isForbiddenKey(localKey)) continue;
          if (Object.prototype.hasOwnProperty.call(localVfs, localKey)) {
            mergedVfs[localKey] = localVfs[localKey];
          }
        }

        // 2. Non-destructively merge cloud VFS files
        for (const cloudKey of Object.keys(state.vfs)) {
          if (isForbiddenKey(cloudKey)) {
            console.warn('[CloudSync] Blocked prototype pollution attempt in VFS key:', cloudKey);
            continue;
          }
          if (!Object.prototype.hasOwnProperty.call(state.vfs, cloudKey)) continue;

          const cloudVal = state.vfs[cloudKey];

          if (!(cloudKey in mergedVfs)) {
            // New file from cloud -> include it
            mergedVfs[cloudKey] = cloudVal;
            hasNewVfsFromCloud = true;
          } else {
            // File exists both locally and in cloud
            const localVal = mergedVfs[cloudKey];
            const cloudTs = getVfsTimestamp(cloudVal);
            const localTs = getVfsTimestamp(localVal);

            if (cloudTs > localTs) {
              mergedVfs[cloudKey] = cloudVal;
              hasNewVfsFromCloud = true;
            } else if (localTs > cloudTs) {
              // Local is newer -> retain local
            } else {
              // Timestamps equal or absent:
              // If local file is empty and cloud has content, accept cloud
              const isLocalEmpty = (typeof localVal === 'string' && localVal.trim() === '') || localVal === null || localVal === undefined;
              const isCloudNonEmpty = typeof cloudVal === 'string' && cloudVal.trim() !== '';
              if (isLocalEmpty && isCloudNonEmpty) {
                mergedVfs[cloudKey] = cloudVal;
                hasNewVfsFromCloud = true;
              }
              // Otherwise preserve local file to avoid clobbering in-progress changes
            }
          }
        }

        // Convert safe dictionary to clean standard object for window.vfs & serialization
        const safeFinalVfs = Object.assign({}, mergedVfs);

        localStorage.setItem('lumina_codespace_vfs', JSON.stringify(safeFinalVfs));
        window.vfs = safeFinalVfs;

        if (hasNewVfsFromCloud || Object.keys(safeFinalVfs).length !== Object.keys(localVfs).length) {
          hasVfsUpdated = true;
        }

        // If local had files not present in stale cloud, queue push to sync cloud
        if (Object.keys(safeFinalVfs).length > Object.keys(state.vfs).length) {
          queueSync(2000);
        }
      } catch (e) {
        console.warn('[CloudSync] Non-destructive VFS hydration error:', e);
      }
    }

    // 5. Notes Vault Markdown (Non-destructive merge by id / updatedAt without dropping local notes)
    if (Array.isArray(state.notes)) {
      try {
        let localNotes = [];
        try {
          localNotes = window.vaultNotes || JSON.parse(localStorage.getItem('lumina_godx_multi_notes') || '[]');
        } catch (_) {
          localNotes = [];
        }
        if (!Array.isArray(localNotes)) localNotes = [];

        const getNoteTimestamp = (note) => {
          if (!note || typeof note !== 'object') return 0;
          const ts = note.updatedAt || note.lastModified || note.updated || note.createdAt || 0;
          if (typeof ts === 'number') return ts;
          if (typeof ts === 'string') {
            const parsed = Date.parse(ts);
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        const localNotesMap = new Map();
        const unkeyedNotes = [];
        for (const n of localNotes) {
          if (n && (n.id !== undefined && n.id !== null)) {
            localNotesMap.set(String(n.id), n);
          } else if (n) {
            unkeyedNotes.push(n);
          }
        }

        const mergedNotes = [];
        let hasNewNotesFromCloud = false;

        for (const cloudNote of state.notes) {
          if (!cloudNote || typeof cloudNote !== 'object') continue;
          if (cloudNote.id !== undefined && cloudNote.id !== null) {
            const idKey = String(cloudNote.id);
            const localNote = localNotesMap.get(idKey);
            if (!localNote) {
              // New note from cloud -> include it
              mergedNotes.push(cloudNote);
              hasNewNotesFromCloud = true;
            } else {
              // Exists in both: compare timestamps
              const cloudTs = getNoteTimestamp(cloudNote);
              const localTs = getNoteTimestamp(localNote);
              if (cloudTs > localTs) {
                mergedNotes.push(cloudNote);
                hasNewNotesFromCloud = true;
              } else if (localTs > cloudTs) {
                mergedNotes.push(localNote);
              } else {
                // Timestamps equal or absent: protect local content if edited, or take whichever has content
                const localLen = (typeof localNote.content === 'string') ? localNote.content.length : 0;
                const cloudLen = (typeof cloudNote.content === 'string') ? cloudNote.content.length : 0;
                if (cloudLen > localLen && localLen === 0) {
                  mergedNotes.push(cloudNote);
                  hasNewNotesFromCloud = true;
                } else {
                  mergedNotes.push(localNote);
                }
              }
              localNotesMap.delete(idKey);
            }
          } else {
            mergedNotes.push(cloudNote);
            hasNewNotesFromCloud = true;
          }
        }

        // Preserve all local notes not present in cloud state
        for (const remainingLocal of localNotesMap.values()) {
          mergedNotes.push(remainingLocal);
        }
        for (const unkeyed of unkeyedNotes) {
          mergedNotes.push(unkeyed);
        }

        localStorage.setItem('lumina_godx_multi_notes', JSON.stringify(mergedNotes));
        window.vaultNotes = mergedNotes;

        if (state.activeNoteId) {
          localStorage.setItem('lumina_active_note_id', state.activeNoteId);
          window.activeNoteId = state.activeNoteId;
        }
        if (state.noteViewMode) {
          localStorage.setItem('lumina_note_view_mode', state.noteViewMode);
          window.noteViewMode = state.noteViewMode;
        }
        if (hasNewNotesFromCloud || mergedNotes.length !== localNotes.length) {
          hasNotesUpdated = true;
        }

        // If local had notes not present in stale cloud, queue push to update cloud
        if (mergedNotes.length > state.notes.length) {
          queueSync(2000);
        }
      } catch (e) {
        console.warn('[CloudSync] Non-destructive notes hydration error:', e);
      }
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
    if (hasCalendarUpdated) {
      if (window.LuminaCalendar) {
        if (window.LuminaCalendar.loadFromStorage) window.LuminaCalendar.loadFromStorage();
        if (window.LuminaCalendar.renderCalendar) window.LuminaCalendar.renderCalendar();
        else if (window.LuminaCalendar.render) window.LuminaCalendar.render();
      }
      if (window.LuminaCalendarSync?.updateSyncStatusBadge) {
        window.LuminaCalendarSync.updateSyncStatusBadge();
      }
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
    }

    if (hasNotesUpdated) {
      if (window.renderNoteTabs) window.renderNoteTabs();
      if (window.loadActiveNoteContent) window.loadActiveNoteContent();
    }

    if (hasProjectsUpdated && window.renderProjectsList) {
      window.renderProjectsList();
    }

    // 8. Admin Temporary Passwords Vault
    if (Array.isArray(state.admin_passwords) && state.admin_passwords.length > 0) {
      try {
        localStorage.setItem('lumina_temp_vault', JSON.stringify(state.admin_passwords));
        const safeCache = state.admin_passwords.map(p => ({
          id: p.id,
          label: p.label || 'Access Key',
          preview: p.preview || '••••••••',
          createdAt: p.createdAt || Date.now(),
          lastUsed: p.lastUsed || null
        }));
        localStorage.setItem('lumina_admin_passwords_cache', JSON.stringify(safeCache));
      } catch (e) {}
    }

    // 9. Reopen Exact Same Tab Where Last Closed (ONLY on initial cold boot, NEVER during periodic background sync)
    if (state.activeTabId && typeof state.activeTabId === 'string') {
      try {
        localStorage.setItem('lumina_active_tab_id', state.activeTabId);
        if (options && options.isInitial && !hasRestoredInitialTab) {
          hasRestoredInitialTab = true;
          if (window.currentActiveTab !== state.activeTabId) {
            window.currentActiveTab = state.activeTabId;
            if (typeof window.switchTab === 'function') {
              window.switchTab(state.activeTabId);
            }
          }
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

      const res = await fetch(getApiOrigin() + '/api/sync', {
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
    // Initial restore from cloud (cold boot: allowed to restore active tab)
    pullFromCloud(true);

    // Hook unload to persist final state
    window.addEventListener('beforeunload', () => {
      flushSync();
    });

    // Periodic background sync verification every 90 seconds (strictly background: NEVER hijack active tab)
    setInterval(() => {
      if (!isSyncing && !hasPendingSync) {
        pullFromCloud(false);
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
    applyCloudPayload: (s, options = {}) => { hydrateWorkspaceFromState(s, options); return true; },
    isSyncScheduled: () => syncTimeout !== null,
    getStatus: () => syncStatus,
    getLastSyncedAt: () => lastSyncedAt
  };

})(typeof window !== 'undefined' ? window : globalThis);
