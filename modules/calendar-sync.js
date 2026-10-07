// modules/calendar-sync.js - Google Calendar Sovereign Two-Way Sync & RFC 5545 iCal Engine for LuminaVista OS
(function(window) {
  'use strict';

  // Helper getters/setters delegating to LuminaCalendar core
  function getEvents() {
    if (window.LuminaCalendar && window.LuminaCalendar.getRawEvents) {
      return window.LuminaCalendar.getRawEvents();
    }
    if (window.LuminaCalendar && window.LuminaCalendar.getEvents) {
      return window.LuminaCalendar.getEvents();
    }
    return [];
  }

  function setEvents(evts) {
    if (window.LuminaCalendar && window.LuminaCalendar.setEvents) {
      window.LuminaCalendar.setEvents(evts);
    }
  }

  function getSettings() {
    if (window.LuminaCalendar && window.LuminaCalendar.getSettings) {
      return window.LuminaCalendar.getSettings();
    }
    try {
      const s = localStorage.getItem('luminavista_calendar_settings_v1');
      if (s) return JSON.parse(s);
    } catch (e) {}
    return {};
  }

  function setSettings(s) {
    if (window.LuminaCalendar && window.LuminaCalendar.setSettings) {
      window.LuminaCalendar.setSettings(s);
    } else {
      try {
        let cur = {};
        const raw = localStorage.getItem('luminavista_calendar_settings_v1');
        if (raw) cur = JSON.parse(raw);
        Object.assign(cur, s);
        localStorage.setItem('luminavista_calendar_settings_v1', JSON.stringify(cur));
      } catch (e) {}
    }
  }

  function saveEvents() {
    if (window.LuminaCalendar && window.LuminaCalendar.saveEvents) {
      window.LuminaCalendar.saveEvents();
    }
  }

  function saveSettings() {
    if (window.LuminaCalendar && window.LuminaCalendar.saveSettings) {
      window.LuminaCalendar.saveSettings();
    }
  }

  function renderCalendar() {
    if (window.LuminaCalendar && window.LuminaCalendar.render) {
      window.LuminaCalendar.render();
    }
  }

  function formatDateKey(d) {
    if (window.LuminaCalendar && window.LuminaCalendar.formatDateKey) {
      return window.LuminaCalendar.formatDateKey(d);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getEventLocalDateKey(str) {
    if (window.LuminaCalendar && window.LuminaCalendar.getEventLocalDateKey) {
      return window.LuminaCalendar.getEventLocalDateKey(str);
    }
    if (!str) return formatDateKey(new Date());
    if (str.length === 10 && str.charAt(4) === '-' && str.charAt(7) === '-') {
      return str;
    }
    if (str.length >= 10 && str.charAt(4) === '-' && str.charAt(7) === '-') {
      return str.slice(0, 10);
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return formatDateKey(new Date());
    return formatDateKey(d);
  }

  const CATEGORY_META = {
    work: { label: 'Deep Work & Coding', color: '#3b82f6' },
    meeting: { label: 'Client / Team Sync', color: '#8b5cf6' },
    personal: { label: 'Personal & Life', color: '#10b981' },
    health: { label: 'Health & Workout', color: '#f59e0b' },
    ai_autonomous: { label: 'AI Autonomous Task', color: '#00f2fe' },
    focus: { label: 'Focus Sprint', color: '#ec4899' },
    break: { label: 'Rest & Lunch Break', color: '#64748b' }
  };

  // =========================================================================
  // UNIVERSAL RFC 5545 iCALENDAR (.ICS) ENGINE
  // =========================================================================
  function exportToIcs() {
    let ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LuminaVista//Google Calendar Sovereign Replica//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:LuminaVista Calendar'
    ];

    const calendarEvents = getEvents();

    calendarEvents.forEach(evt => {
      const s = new Date(evt.start);
      const e = new Date(evt.end);
      const dtStamp = formatIcsDate(new Date());
      const dtStart = formatIcsDate(s);
      const dtEnd = formatIcsDate(e);

      ics.push('BEGIN:VEVENT');
      ics.push(`UID:${evt.id}@luminavista.sovereign`);
      ics.push(`DTSTAMP:${dtStamp}`);
      ics.push(`DTSTART:${dtStart}`);
      ics.push(`DTEND:${dtEnd}`);
      ics.push(`SUMMARY:${escapeIcs(evt.title)}`);
      if (evt.description) ics.push(`DESCRIPTION:${escapeIcs(evt.description)}`);
      if (evt.location) ics.push(`LOCATION:${escapeIcs(evt.location)}`);
      if (evt.category) ics.push(`CATEGORIES:${evt.category.toUpperCase()}`);
      if (evt.recurrence && evt.recurrence.freq) {
        ics.push(`RRULE:FREQ=${evt.recurrence.freq};INTERVAL=${evt.recurrence.interval || 1}`);
      }
      ics.push('END:VEVENT');
    });

    ics.push('END:VCALENDAR');
    const icsContent = ics.join('\r\n');

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof document !== 'undefined' && document.body) {
      try {
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `luminavista-calendar-${formatDateKey(new Date())}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
      } catch (e) {}
    }

    return icsContent;
  }

  function importFromIcs(icsText) {
    if (!icsText || !icsText.includes('BEGIN:VCALENDAR')) {
      return { success: false, message: 'Invalid iCal (.ics) format' };
    }

    const lines = icsText.split(/\r\n|\r|\n/);
    const importedEvents = [];
    let cur = null;

    for (let line of lines) {
      line = line.trim();
      if (line === 'BEGIN:VEVENT') {
        cur = {
          id: `evt_ics_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          title: 'Imported Event',
          allDay: false,
          category: 'work',
          color: '#3f51b5',
          isAutonomous: false
        };
      } else if (line === 'END:VEVENT' && cur) {
        if (cur.start) {
          if (!cur.end) cur.end = new Date(new Date(cur.start).getTime() + 3600000).toISOString();
          importedEvents.push(cur);
        }
        cur = null;
      } else if (cur) {
        if (line.startsWith('SUMMARY:')) cur.title = unescapeIcs(line.substring(8));
        else if (line.startsWith('DESCRIPTION:')) cur.description = unescapeIcs(line.substring(12));
        else if (line.startsWith('LOCATION:')) cur.location = unescapeIcs(line.substring(9));
        else if (line.startsWith('DTSTART:')) cur.start = parseIcsDate(line.substring(8));
        else if (line.startsWith('DTEND:')) cur.end = parseIcsDate(line.substring(6));
        else if (line.startsWith('CATEGORIES:')) {
          const cat = line.substring(11).toLowerCase();
          if (CATEGORY_META[cat]) cur.category = cat;
        }
      }
    }

    if (importedEvents.length > 0) {
      const existing = getEvents();
      existing.push(...importedEvents);
      saveEvents();
      renderCalendar();
    }

    return { success: true, count: importedEvents.length };
  }

  function formatIcsDate(d) {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function parseIcsDate(str) {
    if (/^\d{8}T\d{6}Z?$/.test(str)) {
      const y = str.slice(0, 4);
      const m = str.slice(4, 6);
      const d = str.slice(6, 8);
      const h = str.slice(9, 11);
      const min = str.slice(11, 13);
      const s = str.slice(13, 15);
      return `${y}-${m}-${d}T${h}:${min}:${s}`;
    }
    return new Date().toISOString();
  }

  function escapeIcs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function unescapeIcs(str) {
    if (!str) return '';
    return str.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  // =========================================================================
  // ZERO-FRONTEND-SECRETS BACKEND GOOGLE CALENDAR SYNC
  // =========================================================================
  function getApiOrigin() {
    if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname.endsWith('github.io')) {
      return 'https://lumina-vista-sigma.vercel.app';
    }
    return '';
  }

  function getSessionId() {
    try {
      return localStorage.getItem('lumina_session_id') || '';
    } catch (e) {
      return '';
    }
  }

  async function calendarApiFetch(endpoint, options = {}) {
    const origin = getApiOrigin();
    const url = endpoint.startsWith('http') ? endpoint : (origin + endpoint);
    const sessionId = getSessionId();

    const headers = Object.assign({
      'Content-Type': 'application/json',
      'x-session-id': sessionId
    }, options.headers || {});

    const fetchOpts = Object.assign({}, options, {
      headers,
      credentials: 'include'
    });

    return fetch(url, fetchOpts);
  }

  async function checkBackendConnectionStatus() {
    try {
      const res = await calendarApiFetch('/api/calendar/status');
      if (res.ok) {
        const data = await res.json();
        const isConnected = !!data.connected;
        const email = data.email || getSettings().googleAccountEmail || '';
        setSettings({
          googleCalendarConnected: isConnected,
          googleAccountEmail: email
        });
        updateSyncStatusBadge();
        if (isConnected) {
          await syncGoogleCalendar();
        }
      }
    } catch (e) {
      console.warn('Backend connection status check failed:', e);
    }
  }

  async function connectGoogleAccount() {
    try {
      const clientRedirect = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? `${window.location.origin}/api/calendar/callback`
        : '';
      
      const statusUrl = clientRedirect 
        ? `/api/calendar/status?redirect_uri=${encodeURIComponent(clientRedirect)}`
        : '/api/calendar/status';

      // Pre-open popup synchronously during user gesture to avoid browser popup blockers
      const width = 560, height = 680;
      const left = (typeof window !== 'undefined' && window.screen) ? (window.screen.width - width) / 2 : 100;
      const top = (typeof window !== 'undefined' && window.screen) ? (window.screen.height - height) / 2 : 100;
      let popup = null;
      try {
        popup = window.open('about:blank', 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
      } catch (e) {}

      // Fetch OAuth initiation authUrl from backend with client redirect URI
      const authUrl = clientRedirect 
        ? `/api/calendar/auth?redirect_uri=${encodeURIComponent(clientRedirect)}` 
        : '/api/calendar/auth';
      const authRes = await calendarApiFetch(authUrl);
      const authData = await authRes.json();

      if (!authData.configured || !authData.authUrl) {
        if (popup && !popup.closed) popup.close();
        alert("Google Calendar backend is not configured yet on Vercel.\n\nPlease add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your Vercel Project Settings > Environment Variables, then redeploy!");
        return;
      }

      if (popup && !popup.closed) {
        popup.location.href = authData.authUrl;
      } else {
        // Fallback to top-level navigation if popup was blocked
        window.location.href = authData.authUrl;
        return;
      }

      const checkInterval = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(checkInterval);
            const checkRes = await calendarApiFetch(statusUrl);
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.connected) {
                setSettings({
                  googleCalendarConnected: true,
                  googleAccountEmail: checkData.email || '',
                  lastSyncedAt: new Date().toISOString()
                });
                updateSyncStatusBadge();
                await syncGoogleCalendar(true);
              }
            }
          }
        } catch (e) {
          clearInterval(checkInterval);
        }
      }, 1000);
    } catch (e) {
      console.warn('Google Account Connect error:', e);
    }
  }

  async function syncGoogleCalendar(isManual = false) {
    updateSyncStatusBadge(true);
    try {
      const res = await calendarApiFetch('/api/calendar/sync');
      if (res.ok) {
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          const activeGoogleEventIds = new Set(data.items.map(item => item.id));
          let calendarEvents = getEvents();

          // 1. Two-Way Delete: If an event was deleted from Google Calendar, remove it here
          const removedEvents = calendarEvents.filter(e => e.googleEventId && !activeGoogleEventIds.has(e.googleEventId));
          removedEvents.forEach(delEvt => {
            if (delEvt.scheduledTaskId && window.scheduledTasks) {
              window.scheduledTasks = window.scheduledTasks.filter(t => t.id !== delEvt.scheduledTaskId);
              if (window.saveScheduledTasks) window.saveScheduledTasks();
              if (window.renderScheduledTasksList) window.renderScheduledTasksList();
            }
          });

          calendarEvents = calendarEvents.filter(e => {
            if (!e.googleEventId) return true; // preserve sovereign local events
            return activeGoogleEventIds.has(e.googleEventId); // keep only if it still exists in Google Calendar
          });

          // 2. Two-Way Update & Add from Google Calendar
          data.items.forEach(item => {
            const startStr = (item.start && (item.start.dateTime || item.start.date)) || new Date().toISOString();
            const endStr = (item.end && (item.end.dateTime || item.end.date)) || new Date(Date.now() + 3600000).toISOString();
            const allDay = !item.start?.dateTime;
            const isAiTask = (item.summary || '').includes('[AI Task]') || (item.description || '').includes('[AI Task]');

            const existing = calendarEvents.find(e => e.googleEventId === item.id);
            if (existing) {
              existing.title = item.summary || 'Google Calendar Event';
              existing.description = item.description || '';
              existing.location = item.location || '';
              existing.start = startStr;
              existing.end = endStr;
              existing.allDay = allDay;
              if (isAiTask) {
                existing.category = 'ai_autonomous';
                existing.color = '#00f2fe';
                existing.isAutonomous = true;
              }
            } else {
              calendarEvents.push({
                id: `gcal_${item.id}`,
                googleEventId: item.id,
                title: item.summary || 'Google Calendar Event',
                description: item.description || '',
                location: item.location || '',
                start: startStr,
                end: endStr,
                allDay: allDay,
                category: isAiTask ? 'ai_autonomous' : 'work',
                color: isAiTask ? '#00f2fe' : '#3f51b5',
                isAutonomous: isAiTask
              });
            }
          });

          // 3. Two-Way Push: Push unpushed sovereign local events to Google Calendar
          const unpushedEvents = calendarEvents.filter(e => !e.googleEventId);
          for (const localEvt of unpushedEvents) {
            await pushEventToGoogle(localEvt);
          }

          setEvents(calendarEvents);
          setSettings({
            googleCalendarConnected: true,
            lastSyncedAt: new Date().toISOString()
          });
          renderCalendar();
          // Only show toast if triggered manually by user; keep background auto-updates completely silent
          if (isManual && window.showToast) {
            window.showToast("Google Calendar Synced", `${data.items.length} active events in two-way sync.`);
          }
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401 || errData.connected === false || errData.needsReauth) {
          setSettings({ googleCalendarConnected: false });
          updateSyncStatusBadge();
          if (isManual && window.showToast) {
            window.showToast("Google Calendar Login Needed", "Google session expired. Please click 'Sign in with Google' to reconnect.");
          }
        }
      }
    } catch (e) {
      console.warn('Sync Google Calendar error:', e);
    } finally {
      updateSyncStatusBadge(false);
    }
  }

  async function pushEventToGoogle(evt) {
    const settings = getSettings();
    if (!settings.googleCalendarConnected) return;
    const fetchFn = (typeof window !== 'undefined' && typeof window.fetch === 'function') ? window.fetch : (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return;
    try {
      let startPayload, endPayload;
      if (evt.allDay) {
        const startDateStr = getEventLocalDateKey(evt.start);
        const sDate = new Date(startDateStr + 'T00:00:00Z');
        const eDate = new Date(sDate.getTime() + 86400000);
        startPayload = { date: startDateStr };
        endPayload = { date: eDate.toISOString().slice(0, 10) };
      } else {
        const sDate = new Date(evt.start);
        const eDate = new Date(evt.end || (sDate.getTime() + 3600000));
        startPayload = { dateTime: !isNaN(sDate.getTime()) ? sDate.toISOString() : new Date().toISOString() };
        endPayload = { dateTime: !isNaN(eDate.getTime()) ? eDate.toISOString() : new Date(Date.now() + 3600000).toISOString() };
      }

      const rawGoogleId = evt.googleEventId || (evt.id && evt.id.startsWith('gcal_') ? evt.id.replace(/^gcal_/, '') : undefined);

      const res = await calendarApiFetch('/api/calendar/sync', {
        method: 'POST',
        body: JSON.stringify({
          googleEventId: rawGoogleId,
          summary: evt.title,
          description: evt.description || '',
          location: evt.location || '',
          allDay: !!evt.allDay,
          start: startPayload,
          end: endPayload
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item && data.item.id) {
          evt.googleEventId = data.item.id;
          saveEvents();
        }
      }
    } catch (e) {
      console.warn('Failed to push event to Google Calendar:', e);
    }
  }

  async function deleteEventFromGoogle(googleEventId) {
    if (!googleEventId) return;
    const cleanId = String(googleEventId).replace(/^gcal_/, '');
    try {
      await calendarApiFetch(`/api/calendar/sync?eventId=${encodeURIComponent(cleanId)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Failed to delete event from Google Calendar:', e);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }

  function updateSyncStatusBadge(isSyncing = false) {
    const badge = document.getElementById('calSyncStatusBadge');
    if (!badge) return;

    if (isSyncing) {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0"></span> <span class="text-[10px]">Syncing...</span>`;
      badge.className = 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30';
      return;
    }

    const settings = getSettings();
    if (settings.googleCalendarConnected) {
      const email = settings.googleAccountEmail ? ` (${settings.googleAccountEmail})` : '';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span> <span class="inline sm:hidden text-[10px]">Google Synced</span><span class="hidden sm:inline text-[10px]">Google Synced${email}</span>`;
      badge.className = 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/20 cursor-pointer';
      badge.title = `Google Calendar Connected${email} - Click to configure`;
    } else {
      const label = settings.googleAccountEmail ? 'Sign in with Google' : 'Local Sovereign';
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span> <span class="text-[10px]">${label}</span>`;
      badge.className = 'flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-surface-900 text-amber-300 border border-amber-500/30 hover:border-amber-400 cursor-pointer transition-colors';
      badge.title = 'Google Calendar Disconnected - Click to sign in and sync';
    }
  }

  async function openSyncModal() {
    const modal = document.getElementById('calendarSyncModal');
    if (!modal) return;
    
    const computedRedirect = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? `${window.location.origin}/api/calendar/callback`
      : '';

    const redirectInput = document.getElementById('calSyncRedirectUri');
    if (redirectInput && computedRedirect) {
      redirectInput.value = computedRedirect;
    }

    const statusBadge = document.getElementById('calSyncModalStatusBadge');
    const statusText = document.getElementById('calSyncModalStatusText');

    try {
      const statusUrl = computedRedirect 
        ? `/api/calendar/status?redirect_uri=${encodeURIComponent(computedRedirect)}`
        : '/api/calendar/status';
      const res = await calendarApiFetch(statusUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.redirectUri && redirectInput) {
          redirectInput.value = data.redirectUri;
        }
        if (data.connected) {
          const emailDisplay = data.email || getSettings().googleAccountEmail || '';
          setSettings({
            googleCalendarConnected: true,
            googleAccountEmail: emailDisplay
          });
          if (statusBadge) {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono';
            statusBadge.textContent = 'Active Sync';
          }
          if (statusText) {
            const emailHtml = emailDisplay ? ` (<b class="text-white">${escapeHtml(emailDisplay)}</b>)` : '';
            statusText.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Google Calendar Connected &amp; Synced${emailHtml}</span>`;
          }
        } else if (data.configured) {
          setSettings({ googleCalendarConnected: false });
          updateSyncStatusBadge();
          if (statusBadge) {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono';
            statusBadge.textContent = data.needsReauth ? 'Re-auth Required' : 'Login Required';
          }
          if (statusText) {
            const targetEmail = data.email || getSettings().googleAccountEmail || '';
            const emailHint = targetEmail ? ` for <b class="text-white">${escapeHtml(targetEmail)}</b>` : '';
            statusText.innerHTML = `<span class="text-amber-300 font-sans">Google authentication required${emailHint}. Click <b>Sign in with Google</b> below to connect your real Google schedule.</span>`;
          }
        } else {
          setSettings({ googleCalendarConnected: false });
          updateSyncStatusBadge();
          if (statusBadge) {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono';
            statusBadge.textContent = 'Awaiting Vercel Env';
          }
          if (statusText) {
            statusText.innerHTML = `<span class="text-amber-400/90 font-sans">Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on Vercel environment variables.</span>`;
          }
        }
      }
    } catch (e) {
      if (statusText) {
        statusText.innerHTML = `<span class="text-zinc-400 font-mono">Backend status check unavailable.</span>`;
      }
    }

    modal.style.display = 'flex';
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
  }

  function copyRedirectUri() {
    const el = document.getElementById('calSyncRedirectUri');
    if (!el) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.value).then(() => showCopiedFeedback());
      } else {
        el.select();
        document.execCommand('copy');
        showCopiedFeedback();
      }
    } catch (e) {
      el.select();
    }
  }

  function showCopiedFeedback() {
    const btn = document.getElementById('btnCopyRedirectUri');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> Copied!`;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = orig;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }, 2000);
    }
  }

  function closeSyncModal() {
    const modal = document.getElementById('calendarSyncModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => modal.style.display = 'none', 200);
  }

  function saveSyncSettingsFromModal() {
    connectGoogleAccount();
    closeSyncModal();
  }

  // Cross-window and OAuth postMessage listener
  if (typeof window !== 'undefined') {
    window.addEventListener('message', async (e) => {
      if (e.data && e.data.type === 'GCAL_AUTH_SUCCESS') {
        setSettings({ googleCalendarConnected: true });
        updateSyncStatusBadge();
        await syncGoogleCalendar();
      }
    });

    if (window.location && window.location.search && window.location.search.includes('gcal_connected=true')) {
      setSettings({ googleCalendarConnected: true });
      updateSyncStatusBadge();
      setTimeout(() => syncGoogleCalendar(), 400);
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('gcal_connected');
        window.history.replaceState({}, document.title, cleanUrl.toString());
      } catch (e) {}
    }

    // Periodic 5-minute background auto-sync
    setInterval(() => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    }, 5 * 60 * 1000);

    // Auto-sync when user returns focus to the LuminaVista window/tab
    window.addEventListener('focus', () => {
      const settings = getSettings();
      if (settings.googleCalendarConnected) {
        syncGoogleCalendar();
      }
    });
  }

  // =========================================================================
  // EXPORTS
  // =========================================================================
  window.LuminaCalendarSync = {
    exportToIcs,
    importFromIcs,
    checkBackendConnectionStatus,
    connectGoogleAccount,
    syncGoogleCalendar,
    pushEventToGoogle,
    deleteEventFromGoogle,
    updateSyncStatusBadge,
    openSyncModal,
    closeSyncModal,
    copyRedirectUri,
    saveSyncSettingsFromModal
  };

  // Augment LuminaCalendar if already loaded
  if (window.LuminaCalendar) {
    Object.assign(window.LuminaCalendar, window.LuminaCalendarSync);
  }

  // Trigger immediate backend sync check on startup across all devices/incognito tabs
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        checkBackendConnectionStatus();
      });
    } else {
      checkBackendConnectionStatus();
    }
  }

})(typeof window !== 'undefined' ? window : globalThis);
