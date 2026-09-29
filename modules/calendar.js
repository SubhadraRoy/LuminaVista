// modules/calendar.js - Google Calendar Sovereign Replica & Autonomous AI Real-Life Scheduler
// Fully elevated modern UI with Google segmented controls, 6 calendar views,
// zero-frontend-credentials backend Google Calendar OAuth sync, and real-life AI heuristics.

(function(window) {
  'use strict';

  // =========================================================================
  // GOOGLE CALENDAR COLOR PALETTE (Official Google Calendar Tokens)
  // =========================================================================
  const GCAL_COLORS = {
    peacock:   { name: 'Peacock (Cyan)',     hex: '#039be5', bg: 'bg-[#039be5]', text: '#ffffff' },
    blueberry: { name: 'Blueberry (Blue)',   hex: '#3f51b5', bg: 'bg-[#3f51b5]', text: '#ffffff' },
    basil:     { name: 'Basil (Green)',      hex: '#0b8043', bg: 'bg-[#0b8043]', text: '#ffffff' },
    sage:      { name: 'Sage (Teal)',        hex: '#33b679', bg: 'bg-[#33b679]', text: '#ffffff' },
    banana:    { name: 'Banana (Yellow)',    hex: '#f6bf26', bg: 'bg-[#f6bf26]', text: '#000000' },
    tangerine: { name: 'Tangerine (Orange)', hex: '#f4511e', bg: 'bg-[#f4511e]', text: '#ffffff' },
    flamingo:  { name: 'Flamingo (Rose)',    hex: '#e67c73', bg: 'bg-[#e67c73]', text: '#ffffff' },
    tomato:    { name: 'Tomato (Red)',       hex: '#d50000', bg: 'bg-[#d50000]', text: '#ffffff' },
    grape:     { name: 'Grape (Purple)',     hex: '#8e24aa', bg: 'bg-[#8e24aa]', text: '#ffffff' },
    lavender:  { name: 'Lavender (Violet)',  hex: '#7986cb', bg: 'bg-[#7986cb]', text: '#ffffff' },
    graphite:  { name: 'Graphite (Zinc)',    hex: '#616161', bg: 'bg-[#616161]', text: '#ffffff' }
  };

  const CATEGORY_META = {
    personal:      { label: 'Personal',          color: '#039be5', defaultColor: 'peacock' },
    work:          { label: 'Work',              color: '#3f51b5', defaultColor: 'blueberry' },
    ai_autonomous: { label: 'AI Autonomous',     color: '#00f2fe', defaultColor: 'peacock' },
    focus:         { label: 'Focus & Deep Work', color: '#8e24aa', defaultColor: 'grape' },
    health:        { label: 'Health & Meals',    color: '#0b8043', defaultColor: 'basil' },
    blackout:      { label: 'Blackout / Rest',   color: '#616161', defaultColor: 'graphite' }
  };

  // =========================================================================
  // CALENDAR STATE
  // =========================================================================
  let calendarEvents = [];
  let currentDate = new Date();
  let selectedDate = new Date();
  let currentView = 'month'; // 'month' | 'week' | 'day' | 'fourday' | 'agenda' | 'year'
  let activeCategories = {
    personal: true,
    work: true,
    ai_autonomous: true,
    focus: true,
    health: true,
    blackout: true
  };
  let searchQuery = '';
  let isMiniSidebarOpen = true;
  let editingEventId = null;
  let redTimeLineTimer = null;

  // Real-Life AI Scheduling Settings (Zero frontend credentials policy)
  let calendarSettings = {
    aiSchedulingEnabled: true,
    excludeWeekends: true,
    enableHumanJitter: true,
    jitterMinutes: 5,
    blackoutStart: '23:00',
    blackoutEnd: '07:00',
    protectMeals: true,
    lunchStart: '12:30',
    lunchEnd: '13:30',
    dinnerStart: '19:30',
    dinnerEnd: '20:30',
    maxFocusDurationMinutes: 90,
    restBufferMinutes: 15,
    googleCalendarConnected: false,
    googleAccountEmail: '',
    lastSyncedAt: null
  };

  // =========================================================================
  // STORAGE & INITIALIZATION (Permanently Pristine - No Seeded Dummy Events)
  // =========================================================================
  function loadCalendarFromStorage() {
    try {
      const savedEvents = localStorage.getItem('luminavista_calendar_events_v1');
      if (savedEvents) {
        calendarEvents = JSON.parse(savedEvents);
      }
    } catch (e) {
      calendarEvents = [];
    }

    // Permanently purge any legacy pre-seeded mock events
    if (Array.isArray(calendarEvents)) {
      calendarEvents = calendarEvents.filter(e => 
        e && e.id &&
        !e.id.startsWith('evt_routine_') && 
        !e.id.startsWith('evt_work_standup') && 
        !e.id.startsWith('evt_focus_deepwork') && 
        !e.id.startsWith('evt_health_lunch') && 
        !e.id.startsWith('evt_ai_task_pipeline') && 
        !e.id.startsWith('evt_personal_evening') && 
        !e.id.startsWith('evt_tomorrow_planning')
      );
      saveCalendarEvents();
    } else {
      calendarEvents = [];
    }

    try {
      const savedSettings = localStorage.getItem('luminavista_calendar_settings_v1');
      if (savedSettings) {
        calendarSettings = Object.assign(calendarSettings, JSON.parse(savedSettings));
      }
    } catch (e) {}

    // Check backend connection status asynchronously
    checkBackendConnectionStatus();
  }

  function saveCalendarEvents() {
    try {
      localStorage.setItem('luminavista_calendar_events_v1', JSON.stringify(calendarEvents));
    } catch (e) {}
  }

  function saveCalendarSettings() {
    try {
      localStorage.setItem('luminavista_calendar_settings_v1', JSON.stringify(calendarSettings));
    } catch (e) {}
  }

  // =========================================================================
  // VIEW RENDER CONTROLLER
  // =========================================================================
  function renderCalendar() {
    updateHeaderTitle();
    updateViewSelectorPills();
    renderMiniCalendar();
    renderCategoryFilters();
    updateSyncStatusBadge();

    const container = document.getElementById('calendarViewContainer');
    if (!container) return;

    if (currentView === 'month') {
      renderMonthView(container);
    } else if (currentView === 'week') {
      renderWeekView(container);
    } else if (currentView === 'day') {
      renderDayView(container);
    } else if (currentView === 'fourday') {
      render4DayView(container);
    } else if (currentView === 'agenda') {
      renderAgendaView(container);
    } else if (currentView === 'year') {
      renderYearView(container);
    }

    startRedTimeLineTimer();

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  function setView(viewName) {
    currentView = viewName;
    updateViewSelectorPills();
    renderCalendar();
  }

  function updateViewSelectorPills() {
    // Update select dropdown if present
    const viewSelect = document.getElementById('calViewSelect');
    if (viewSelect && viewSelect.value !== currentView) {
      viewSelect.value = currentView;
    }

    // Update segmented buttons
    document.querySelectorAll('.cal-view-tab-btn').forEach(btn => {
      const v = btn.id.replace('btnCalView-', '');
      if (v === currentView) {
        btn.className = 'cal-view-tab-btn px-3 py-1.5 rounded-lg text-black font-bold btn-gradient shadow-md shadow-cyan-500/20 transition-all cursor-pointer';
      } else {
        btn.className = 'cal-view-tab-btn px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer font-medium';
      }
    });
  }

  function navigateCalendar(delta) {
    if (currentView === 'month') {
      currentDate.setMonth(currentDate.getMonth() + delta);
    } else if (currentView === 'week') {
      currentDate.setDate(currentDate.getDate() + (delta * 7));
    } else if (currentView === 'day') {
      currentDate.setDate(currentDate.getDate() + delta);
    } else if (currentView === 'fourday') {
      currentDate.setDate(currentDate.getDate() + (delta * 4));
    } else if (currentView === 'agenda') {
      currentDate.setMonth(currentDate.getMonth() + delta);
    } else if (currentView === 'year') {
      currentDate.setFullYear(currentDate.getFullYear() + delta);
    }
    renderCalendar();
  }

  function goToToday() {
    currentDate = new Date();
    selectedDate = new Date();
    renderCalendar();
  }

  function updateHeaderTitle() {
    const titleEl = document.getElementById('calHeaderTitle');
    if (!titleEl) return;

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (currentView === 'year') {
      titleEl.textContent = `${currentDate.getFullYear()}`;
    } else if (currentView === 'day') {
      titleEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
    } else {
      titleEl.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
  }

  // =========================================================================
  // 1. MONTH VIEW (Polished Google-Style Grid)
  // =========================================================================
  function renderMonthView(container) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    let html = `
      <div class="flex flex-col h-full bg-surface-950/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl select-none backdrop-blur-xl">
        <!-- Day Names Header -->
        <div class="grid grid-cols-7 border-b border-white/10 bg-surface-900/90 text-center py-2.5 text-[11px] font-mono font-bold text-zinc-400">
          ${dayNames.map(d => `<div class="tracking-wider">${d}</div>`).join('')}
        </div>
        
        <!-- Month Grid -->
        <div class="grid grid-cols-7 flex-1 min-h-0 auto-rows-fr divide-x divide-y divide-white/5 overflow-y-auto custom-scrollbar">
    `;

    const totalCells = (firstDayIndex + daysInMonth <= 35) ? 35 : 42;
    const today = new Date();
    const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

    for (let i = 0; i < totalCells; i++) {
      let cellDay, cellMonth, cellYear, isCurrentMonth;

      if (i < firstDayIndex) {
        cellDay = prevMonthDays - firstDayIndex + i + 1;
        cellMonth = month - 1;
        cellYear = year;
        isCurrentMonth = false;
      } else if (i < firstDayIndex + daysInMonth) {
        cellDay = i - firstDayIndex + 1;
        cellMonth = month;
        cellYear = year;
        isCurrentMonth = true;
      } else {
        cellDay = i - (firstDayIndex + daysInMonth) + 1;
        cellMonth = month + 1;
        cellYear = year;
        isCurrentMonth = false;
      }

      const cellDate = new Date(cellYear, cellMonth, cellDay);
      const cellDateStr = formatDateKey(cellDate);
      const isToday = isThisMonth && isCurrentMonth && cellDay === today.getDate();

      const dayEvents = getEventsForDate(cellDate);

      const todayBoxClass = isToday 
        ? 'group relative p-2.5 flex flex-col min-h-[95px] transition-all cursor-pointer bg-cyan-950/25 border-2 border-cyan-400 shadow-[inset_0_0_15px_rgba(0,242,254,0.15),0_0_20px_rgba(0,242,254,0.15)] ring-1 ring-cyan-400/40 rounded-xl z-10' 
        : 'group relative p-2 flex flex-col min-h-[90px] transition-all hover:bg-white/[0.03] cursor-pointer';

      html += `
        <div class="${todayBoxClass}"
             onclick="LuminaCalendar.handleDayCellClick('${cellDateStr}', event)">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-1.5">
              <span class="inline-flex items-center justify-center text-xs font-mono font-bold w-6 h-6 rounded-full transition-transform ${
                isToday 
                  ? 'bg-cyan-400 text-black font-extrabold shadow-md shadow-cyan-400/50 ring-2 ring-cyan-300' 
                  : isCurrentMonth 
                    ? 'text-zinc-200 group-hover:bg-white/10' 
                    : 'text-zinc-600'
              }">
                ${cellDay === 1 ? `${cellDate.toLocaleString('default', { month: 'short' })} ${cellDay}` : cellDay}
              </span>
              ${isToday ? `<span class="text-[9px] font-mono font-extrabold tracking-wider px-1.5 py-0.5 rounded bg-cyan-400 text-black shadow-sm flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-black animate-ping"></span> TODAY</span>` : ''}
            </div>
            ${dayEvents.length > 3 ? `<span class="text-[9px] font-mono text-cyan-400 font-bold px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">+${dayEvents.length - 3}</span>` : ''}
          </div>

          <!-- Event Chips -->
          <div class="flex-1 space-y-1 overflow-hidden pointer-events-none">
            ${dayEvents.slice(0, 3).map(evt => {
              const timeStr = evt.allDay ? 'All Day' : formatShortTime(evt.start);
              return `
                <div class="truncate text-[11px] px-2 py-0.5 rounded-md font-sans font-medium flex items-center gap-1.5 shadow-sm transition-all pointer-events-auto hover:brightness-125 border border-black/20"
                     style="background-color: ${evt.color || '#039be5'}; color: #ffffff;"
                     onclick="event.stopPropagation(); LuminaCalendar.openEventModal('${evt.id}')"
                     title="${evt.title} (${timeStr})">
                  <span class="text-[9px] font-mono opacity-85 shrink-0 font-semibold">${timeStr}</span>
                  <span class="truncate">${escapeHtml(evt.title)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // =========================================================================
  // 2. WEEK VIEW (24h Hourly Grid + Live Red Hairline)
  // =========================================================================
  function renderWeekView(container) {
    const startOfWeek = getStartOfWeek(currentDate);
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }

    const today = new Date();
    const todayStr = formatDateKey(today);

    let html = `
      <div class="flex flex-col h-full bg-surface-950/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl select-none backdrop-blur-xl">
        <!-- Week Header (Days + Dates) -->
        <div class="grid grid-cols-[64px_repeat(7,1fr)] border-b border-white/10 bg-surface-900/90 text-center py-2.5 text-xs font-mono divide-x divide-white/5">
          <div class="text-[10px] text-zinc-500 font-bold pt-2">TIME</div>
          ${weekDays.map(d => {
            const isToday = formatDateKey(d) === todayStr;
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            return `
              <div class="py-1 cursor-pointer hover:bg-white/5 rounded-lg transition-colors" onclick="LuminaCalendar.jumpToDate('${formatDateKey(d)}')">
                <div class="text-[10px] font-bold tracking-wider ${isToday ? 'text-cyan-400 font-extrabold' : 'text-zinc-400'}">${dayName}</div>
                <div class="inline-flex items-center justify-center w-7 h-7 text-sm font-bold rounded-full mt-0.5 ${isToday ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/40 ring-2 ring-cyan-400/30' : 'text-zinc-200'}">
                  ${d.getDate()}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 24h Hourly Scrollable Grid -->
        <div id="calWeekScrollContainer" class="flex-1 overflow-y-auto relative custom-scrollbar divide-y divide-white/5">
          <div class="relative grid grid-cols-[64px_repeat(7,1fr)] divide-x divide-white/5 min-h-[1152px]">
            <!-- Red Real-Time Indicator Line -->
            <div id="calCurrentTimeLine" class="hidden absolute left-0 right-0 z-20 pointer-events-none flex items-center">
              <span class="w-3.5 h-3.5 rounded-full bg-rose-500 ring-4 ring-rose-400/30 -ml-1.5 shadow-lg shadow-rose-500/80 animate-pulse"></span>
              <div class="flex-1 h-[2px] bg-rose-500 shadow-md shadow-rose-500"></div>
            </div>

            <!-- Hour Labels Column (00:00 - 23:00) -->
            <div class="bg-surface-950/60 text-right pr-2.5 text-[10px] font-mono text-zinc-500 select-none divide-y divide-transparent">
              ${Array.from({ length: 24 }).map((_, h) => `
                <div class="h-12 -mt-2.5 pt-0.5">${formatHourLabel(h)}</div>
              `).join('')}
            </div>

            <!-- 7 Day Columns -->
            ${weekDays.map(d => {
              const dStr = formatDateKey(d);
              const dayEvts = getEventsForDate(d);
              return `
                <div class="relative h-[1152px] transition-colors hover:bg-white/[0.015]"
                     data-date="${dStr}"
                     onclick="LuminaCalendar.handleTimeGridClick('${dStr}', event)">
                  ${Array.from({ length: 24 }).map((_, h) => `
                    <div class="h-12 border-b border-white/[0.03]" data-hour="${h}"></div>
                  `).join('')}
                  ${dayEvts.map(evt => renderTimeGridEvent(evt)).join('')}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    updateRedTimeLinePosition();
    scrollToCurrentHour();
  }

  // =========================================================================
  // 3. DAY VIEW
  // =========================================================================
  function renderDayView(container) {
    const today = new Date();
    const isToday = formatDateKey(currentDate) === formatDateKey(today);
    const dStr = formatDateKey(currentDate);
    const dayEvts = getEventsForDate(currentDate);

    let html = `
      <div class="flex flex-col h-full bg-surface-950/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl select-none backdrop-blur-xl">
        <!-- Day Banner -->
        <div class="flex items-center justify-between border-b border-white/10 bg-surface-900/90 px-6 py-3.5 text-xs font-mono">
          <div class="flex items-center gap-3">
            <span class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${isToday ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/40 ring-2 ring-cyan-400/30' : 'bg-surface-800 text-white'}">
              ${currentDate.getDate()}
            </span>
            <div>
              <div class="font-bold text-sm text-white">${currentDate.toLocaleDateString('en-US', { weekday: 'long' })}</div>
              <div class="text-[10px] text-zinc-400">${currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            </div>
          </div>
          <span class="text-[11px] text-cyan-400 bg-cyan-500/10 px-3.5 py-1 rounded-full font-mono border border-cyan-500/20">${dayEvts.length} Scheduled Events</span>
        </div>

        <!-- 24h Hourly Day Grid -->
        <div id="calDayScrollContainer" class="flex-1 overflow-y-auto relative custom-scrollbar">
          <div class="relative grid grid-cols-[80px_1fr] divide-x divide-white/5 min-h-[1152px]">
            ${isToday ? `
              <div id="calCurrentTimeLine" class="absolute left-0 right-0 z-20 pointer-events-none flex items-center">
                <span class="w-3.5 h-3.5 rounded-full bg-rose-500 ring-4 ring-rose-400/30 -ml-1.5 shadow-lg shadow-rose-500/80 animate-pulse"></span>
                <div class="flex-1 h-[2px] bg-rose-500 shadow-md shadow-rose-500"></div>
              </div>
            ` : ''}

            <!-- Hours Column -->
            <div class="bg-surface-950/60 text-right pr-3 text-[10px] font-mono text-zinc-500 select-none">
              ${Array.from({ length: 24 }).map((_, h) => `
                <div class="h-12 -mt-2.5 pt-0.5">${formatHourLabel(h)}</div>
              `).join('')}
            </div>

            <!-- Single Day Column -->
            <div class="relative h-[1152px] hover:bg-white/[0.015]"
                 data-date="${dStr}"
                 onclick="LuminaCalendar.handleTimeGridClick('${dStr}', event)">
              ${Array.from({ length: 24 }).map((_, h) => `
                <div class="h-12 border-b border-white/[0.03]" data-hour="${h}"></div>
              `).join('')}
              ${dayEvts.map(evt => renderTimeGridEvent(evt)).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    if (isToday) updateRedTimeLinePosition();
    scrollToCurrentHour();
  }

  // =========================================================================
  // 4. 4-DAY VIEW
  // =========================================================================
  function render4DayView(container) {
    const days = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const todayStr = formatDateKey(new Date());

    let html = `
      <div class="flex flex-col h-full bg-surface-950/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl select-none backdrop-blur-xl">
        <div class="grid grid-cols-[64px_repeat(4,1fr)] border-b border-white/10 bg-surface-900/90 text-center py-2.5 text-xs font-mono divide-x divide-white/5">
          <div class="text-[10px] text-zinc-500 font-bold pt-2">TIME</div>
          ${days.map(d => {
            const isToday = formatDateKey(d) === todayStr;
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            return `
              <div class="py-1">
                <div class="text-[10px] font-bold tracking-wider ${isToday ? 'text-cyan-400 font-extrabold' : 'text-zinc-400'}">${dayName}</div>
                <div class="inline-flex items-center justify-center w-7 h-7 text-sm font-bold rounded-full mt-0.5 ${isToday ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/30' : 'text-zinc-200'}">
                  ${d.getDate()}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="flex-1 overflow-y-auto relative custom-scrollbar">
          <div class="relative grid grid-cols-[64px_repeat(4,1fr)] divide-x divide-white/5 min-h-[1152px]">
            <div class="bg-surface-950/60 text-right pr-2.5 text-[10px] font-mono text-zinc-500 select-none">
              ${Array.from({ length: 24 }).map((_, h) => `
                <div class="h-12 -mt-2.5 pt-0.5">${formatHourLabel(h)}</div>
              `).join('')}
            </div>

            ${days.map(d => {
              const dStr = formatDateKey(d);
              const dayEvts = getEventsForDate(d);
              return `
                <div class="relative h-[1152px] hover:bg-white/[0.015]"
                     data-date="${dStr}"
                     onclick="LuminaCalendar.handleTimeGridClick('${dStr}', event)">
                  ${Array.from({ length: 24 }).map((_, h) => `
                    <div class="h-12 border-b border-white/[0.03]"></div>
                  `).join('')}
                  ${dayEvts.map(evt => renderTimeGridEvent(evt)).join('')}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // =========================================================================
  // 5. AGENDA / SCHEDULE VIEW
  // =========================================================================
  function renderAgendaView(container) {
    const upcomingEvents = getUpcomingEvents(30);

    let html = `
      <div class="flex flex-col h-full bg-surface-950/90 rounded-2xl border border-white/10 overflow-hidden shadow-2xl p-6 custom-scrollbar overflow-y-auto backdrop-blur-xl">
        <div class="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <i data-lucide="list-ordered" class="w-5 h-5 text-cyan-400"></i> Chronological Agenda &amp; Routines
          </h2>
          <span class="text-xs font-mono text-zinc-400 px-3 py-1 rounded-full bg-surface-900 border border-white/5">${upcomingEvents.length} items upcoming</span>
        </div>

        ${upcomingEvents.length === 0 ? `
          <div class="text-center py-20 text-zinc-500 font-mono text-xs space-y-2">
            <i data-lucide="calendar-check" class="w-12 h-12 mx-auto mb-2 text-zinc-600"></i>
            <div class="text-zinc-400 font-bold text-sm">Your schedule is completely clear!</div>
            <p class="text-zinc-600">Click <strong>+ Create</strong> or <strong>AI Smart Plan</strong> to schedule your day.</p>
          </div>
        ` : `
          <div class="space-y-6">
            ${groupEventsByDate(upcomingEvents).map(group => `
              <div class="space-y-3">
                <div class="sticky top-0 z-10 bg-surface-950/95 backdrop-blur-md py-1.5 flex items-center gap-3 border-b border-white/5">
                  <span class="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wider">${group.dateFormatted}</span>
                  <span class="text-[10px] text-zinc-500 font-mono">• ${group.relativeDay}</span>
                </div>
                <div class="space-y-2">
                  ${group.events.map(evt => `
                    <div class="p-3.5 rounded-xl border border-white/5 hover:border-cyan-500/30 bg-surface-900/60 hover:bg-surface-850/80 transition-all flex items-start justify-between group cursor-pointer shadow-sm hover:shadow-cyan-500/5"
                         onclick="LuminaCalendar.openEventModal('${evt.id}')">
                      <div class="flex items-start gap-3">
                        <span class="w-3 h-3 rounded-full mt-1 shrink-0 ring-2 ring-black/40" style="background-color: ${evt.color || '#039be5'};"></span>
                        <div>
                          <div class="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">${escapeHtml(evt.title)}</div>
                          <div class="text-[11px] font-mono text-zinc-400 mt-0.5">
                            ${evt.allDay ? 'All Day' : `${formatTime(evt.start)} – ${formatTime(evt.end)}`}
                            ${evt.location ? ` • <span class="text-zinc-500">${escapeHtml(evt.location)}</span>` : ''}
                          </div>
                          ${evt.description ? `<p class="text-[11px] text-zinc-500 mt-1 line-clamp-1">${escapeHtml(evt.description)}</p>` : ''}
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        ${evt.isAutonomous ? `<span class="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">AI Scheduled</span>` : ''}
                        <button onclick="event.stopPropagation(); LuminaCalendar.deleteEvent('${evt.id}')" class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 transition-opacity" title="Delete Event">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    container.innerHTML = html;
  }

  // =========================================================================
  // 6. YEAR VIEW (12 Month Cards)
  // =========================================================================
  function renderYearView(container) {
    const year = currentDate.getFullYear();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let html = `
      <div class="h-full bg-surface-950/90 rounded-2xl border border-white/10 overflow-y-auto p-6 shadow-2xl custom-scrollbar backdrop-blur-xl">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          ${monthNames.map((name, mIndex) => {
            const firstDay = new Date(year, mIndex, 1).getDay();
            const daysInM = new Date(year, mIndex + 1, 0).getDate();
            const today = new Date();
            const isThisM = today.getFullYear() === year && today.getMonth() === mIndex;

            return `
              <div class="p-3.5 bg-surface-900/60 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer shadow-sm hover:scale-[1.01]"
                   onclick="LuminaCalendar.jumpToMonth(${mIndex})">
                <div class="text-xs font-mono font-bold text-white mb-2.5 text-center">${name}</div>
                <div class="grid grid-cols-7 text-[9px] font-mono text-zinc-500 text-center mb-1 font-bold">
                  <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
                </div>
                <div class="grid grid-cols-7 text-[10px] font-mono text-center gap-y-1">
                  ${Array.from({ length: firstDay }).map(() => `<div></div>`).join('')}
                  ${Array.from({ length: daysInM }).map((_, dIdx) => {
                    const dayNum = dIdx + 1;
                    const isToday = isThisM && dayNum === today.getDate();
                    return `
                      <span class="inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday ? 'bg-cyan-400 text-black font-extrabold shadow-sm' : 'text-zinc-300 hover:bg-white/10'}">
                        ${dayNum}
                      </span>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // =========================================================================
  // MINI-CALENDAR DATE PICKER (Left Drawer)
  // =========================================================================
  function renderMiniCalendar() {
    const el = document.getElementById('calMiniMonthContainer');
    if (!el) return;

    const y = currentDate.getFullYear();
    const m = currentDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInM = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const isThisM = today.getFullYear() === y && today.getMonth() === m;

    const monthName = currentDate.toLocaleString('default', { month: 'short' });

    let html = `
      <div class="p-3 bg-surface-950/70 rounded-xl border border-white/5 select-none shadow-sm">
        <div class="flex items-center justify-between mb-2.5">
          <span class="text-xs font-mono font-bold text-white tracking-wide">${monthName} ${y}</span>
          <div class="flex items-center gap-1">
            <button onclick="LuminaCalendar.navigateMiniMonth(-1)" class="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" aria-label="Previous Month">
              <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="LuminaCalendar.navigateMiniMonth(1)" class="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" aria-label="Next Month">
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-7 text-[9px] font-mono text-zinc-500 text-center mb-1 font-bold">
          <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
        </div>

        <div class="grid grid-cols-7 text-[10px] font-mono text-center gap-y-1">
          ${Array.from({ length: firstDay }).map(() => `<div></div>`).join('')}
          ${Array.from({ length: daysInM }).map((_, i) => {
            const dayNum = i + 1;
            const isToday = isThisM && dayNum === today.getDate();
            const isSel = selectedDate.getFullYear() === y && selectedDate.getMonth() === m && selectedDate.getDate() === dayNum;
            return `
              <button onclick="LuminaCalendar.jumpToDate('${y}-${String(m+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}')"
                      class="inline-flex items-center justify-center w-5 h-5 mx-auto rounded-full transition-transform ${
                        isToday ? 'bg-cyan-400 text-black font-extrabold shadow-sm ring-1 ring-cyan-300' : isSel ? 'bg-white/20 text-white font-bold' : 'text-zinc-300 hover:bg-white/10'
                      }">
                ${dayNum}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    el.innerHTML = html;
  }

  // =========================================================================
  // CATEGORY FILTER CHECKLIST
  // =========================================================================
  function renderCategoryFilters() {
    const el = document.getElementById('calCategoryFiltersContainer');
    if (!el) return;

    el.innerHTML = Object.entries(CATEGORY_META).map(([key, meta]) => {
      const checked = activeCategories[key] !== false;
      return `
        <label class="flex items-center justify-between py-1 px-2.5 rounded-lg hover:bg-white/5 cursor-pointer text-xs font-mono transition-colors">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/40" style="background-color: ${meta.color};"></span>
            <span class="text-zinc-300 select-none">${meta.label}</span>
          </div>
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="LuminaCalendar.toggleCategory('${key}', this.checked)" class="w-3.5 h-3.5 accent-cyan-400 cursor-pointer rounded" />
        </label>
      `;
    }).join('');
  }

  function toggleCategory(cat, isChecked) {
    activeCategories[cat] = isChecked;
    renderCalendar();
  }

  // =========================================================================
  // TIME-GRID EVENT ELEMENT RENDERER
  // =========================================================================
  function renderTimeGridEvent(evt) {
    const { top, height } = computeEventPosition(evt.start, evt.end);
    const timeLabel = `${formatShortTime(evt.start)} - ${formatShortTime(evt.end)}`;

    return `
      <div class="absolute left-1 right-1 z-10 rounded-lg p-1.5 shadow-md border border-black/30 overflow-hidden cursor-pointer transition-all hover:brightness-110 hover:z-20 hover:scale-[1.01] group backdrop-blur-sm"
           style="top: ${top}px; height: ${Math.max(height, 24)}px; background-color: ${evt.color || '#039be5'}; color: #ffffff;"
           onclick="event.stopPropagation(); LuminaCalendar.openEventModal('${evt.id}')"
           title="${evt.title} (${timeLabel})">
        <div class="flex items-start justify-between gap-1 leading-tight">
          <div class="truncate font-sans font-semibold text-[11px] drop-shadow-sm">${escapeHtml(evt.title)}</div>
          ${evt.isAutonomous ? `<span class="shrink-0 text-[8px] font-mono px-1 rounded bg-black/40 border border-white/20">AI</span>` : ''}
        </div>
        ${height >= 36 ? `<div class="text-[9px] font-mono opacity-90 mt-0.5 truncate">${timeLabel}</div>` : ''}
        ${height >= 56 && evt.location ? `<div class="text-[9px] font-sans opacity-80 truncate">${escapeHtml(evt.location)}</div>` : ''}
      </div>
    `;
  }

  function computeEventPosition(startIso, endIso) {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const startHour = s.getHours() + (s.getMinutes() / 60);
    let endHour = e.getHours() + (e.getMinutes() / 60);
    if (endHour <= startHour) endHour = startHour + 0.5;

    const top = Math.round(startHour * 48);
    const height = Math.round((endHour - startHour) * 48);
    return { top, height };
  }

  // =========================================================================
  // REAL-TIME RED CURRENT TIME INDICATOR
  // =========================================================================
  function startRedTimeLineTimer() {
    if (redTimeLineTimer) clearInterval(redTimeLineTimer);
    redTimeLineTimer = setInterval(updateRedTimeLinePosition, 60000);
  }

  function updateRedTimeLinePosition() {
    const line = document.getElementById('calCurrentTimeLine');
    if (!line) return;

    const now = new Date();
    const currentDecimalHour = now.getHours() + (now.getMinutes() / 60);
    const topPos = Math.round(currentDecimalHour * 48);

    line.style.top = `${topPos}px`;
    line.classList.remove('hidden');
  }

  function scrollToCurrentHour() {
    setTimeout(() => {
      const scrollContainer = document.getElementById('calWeekScrollContainer') || document.getElementById('calDayScrollContainer');
      if (scrollContainer) {
        const now = new Date();
        const targetScroll = Math.max(0, (now.getHours() - 1) * 48);
        scrollContainer.scrollTop = targetScroll;
      }
    }, 50);
  }

  // =========================================================================
  // EVENT CREATION & EDIT MODAL
  // =========================================================================
  function openEventModal(eventIdOrDateStr) {
    const modal = document.getElementById('calendarEventModal');
    if (!modal) return;

    let evt = null;
    if (typeof eventIdOrDateStr === 'string' && eventIdOrDateStr.startsWith('evt_')) {
      evt = calendarEvents.find(e => e.id === eventIdOrDateStr);
    }

    editingEventId = evt ? evt.id : null;

    const modalTitle = document.getElementById('calModalHeaderTitle');
    const inputTitle = document.getElementById('calEventTitleInput');
    const inputStart = document.getElementById('calEventStartInput');
    const inputEnd = document.getElementById('calEventEndInput');
    const selectCat = document.getElementById('calEventCategorySelect');
    const selectColor = document.getElementById('calEventColorSelect');
    const inputLoc = document.getElementById('calEventLocationInput');
    const inputDesc = document.getElementById('calEventDescInput');
    const checkAllDay = document.getElementById('calEventAllDayCheck');
    const selectRecurr = document.getElementById('calEventRecurrenceSelect');
    const checkAutonomous = document.getElementById('calEventAutonomousCheck');
    const btnDelete = document.getElementById('calBtnDeleteEvent');

    if (evt) {
      if (modalTitle) modalTitle.textContent = 'Edit Calendar Event';
      if (inputTitle) inputTitle.value = evt.title || '';
      if (inputStart) inputStart.value = evt.start ? evt.start.slice(0, 16) : '';
      if (inputEnd) inputEnd.value = evt.end ? evt.end.slice(0, 16) : '';
      if (selectCat) selectCat.value = evt.category || 'work';
      if (selectColor) selectColor.value = evt.color || '#039be5';
      if (inputLoc) inputLoc.value = evt.location || '';
      if (inputDesc) inputDesc.value = evt.description || '';
      if (checkAllDay) checkAllDay.checked = !!evt.allDay;
      if (selectRecurr) selectRecurr.value = evt.recurrence ? evt.recurrence.freq : 'NONE';
      if (checkAutonomous) checkAutonomous.checked = !!evt.isAutonomous;
      if (btnDelete) btnDelete.classList.remove('hidden');
    } else {
      if (modalTitle) modalTitle.textContent = 'Create New Event';
      const baseDate = (typeof eventIdOrDateStr === 'string' && eventIdOrDateStr.includes('-')) 
        ? eventIdOrDateStr 
        : formatDateKey(selectedDate);
      
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const hPlus = String((now.getHours() + 1) % 24).padStart(2, '0');

      if (inputTitle) inputTitle.value = '';
      if (inputStart) inputStart.value = `${baseDate}T${h}:00`;
      if (inputEnd) inputEnd.value = `${baseDate}T${hPlus}:00`;
      if (selectCat) selectCat.value = 'work';
      if (selectColor) selectColor.value = '#039be5';
      if (inputLoc) inputLoc.value = '';
      if (inputDesc) inputDesc.value = '';
      if (checkAllDay) checkAllDay.checked = false;
      if (selectRecurr) selectRecurr.value = 'NONE';
      if (checkAutonomous) checkAutonomous.checked = false;
      if (btnDelete) btnDelete.classList.add('hidden');
    }

    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      if (inputTitle) inputTitle.focus();
    }, 10);
  }

  function closeEventModal() {
    const modal = document.getElementById('calendarEventModal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => {
      modal.style.display = 'none';
      editingEventId = null;
    }, 200);
  }

  function saveEventFromModal() {
    const inputTitle = document.getElementById('calEventTitleInput');
    const inputStart = document.getElementById('calEventStartInput');
    const inputEnd = document.getElementById('calEventEndInput');
    const selectCat = document.getElementById('calEventCategorySelect');
    const selectColor = document.getElementById('calEventColorSelect');
    const inputLoc = document.getElementById('calEventLocationInput');
    const inputDesc = document.getElementById('calEventDescInput');
    const checkAllDay = document.getElementById('calEventAllDayCheck');
    const selectRecurr = document.getElementById('calEventRecurrenceSelect');
    const checkAutonomous = document.getElementById('calEventAutonomousCheck');

    const title = (inputTitle && inputTitle.value.trim()) || 'Untitled Event';
    const start = (inputStart && inputStart.value) || new Date().toISOString();
    const end = (inputEnd && inputEnd.value) || new Date(Date.now() + 3600000).toISOString();
    const category = (selectCat && selectCat.value) || 'work';
    const color = (selectColor && selectColor.value) || (CATEGORY_META[category] ? CATEGORY_META[category].color : '#039be5');
    const location = inputLoc ? inputLoc.value.trim() : '';
    const description = inputDesc ? inputDesc.value.trim() : '';
    const allDay = checkAllDay ? checkAllDay.checked : false;
    const recurrenceFreq = selectRecurr ? selectRecurr.value : 'NONE';
    const isAutonomous = checkAutonomous ? checkAutonomous.checked : false;

    if (editingEventId) {
      const idx = calendarEvents.findIndex(e => e.id === editingEventId);
      if (idx !== -1) {
        calendarEvents[idx] = Object.assign(calendarEvents[idx], {
          title, start, end, category, color, location, description, allDay, isAutonomous,
          recurrence: recurrenceFreq !== 'NONE' ? { freq: recurrenceFreq, interval: 1 } : null,
          updatedAt: new Date().toISOString()
        });
      }
    } else {
      const newEvent = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        title, start, end, category, color, location, description, allDay, isAutonomous,
        priority: 'normal',
        reschedulable: true,
        recurrence: recurrenceFreq !== 'NONE' ? { freq: recurrenceFreq, interval: 1 } : null,
        createdAt: new Date().toISOString()
      };

      if (calendarSettings.aiSchedulingEnabled) {
        aiRescheduleConflicts(newEvent);
      }

      calendarEvents.push(newEvent);

      // Push to Google Calendar in background if connected
      if (calendarSettings.googleCalendarConnected) {
        pushEventToGoogle(newEvent);
      }
    }

    saveCalendarEvents();
    closeEventModal();
    renderCalendar();
  }

  function deleteEvent(id) {
    const targetId = id || editingEventId;
    if (!targetId) return;

    calendarEvents = calendarEvents.filter(e => e.id !== targetId);
    saveCalendarEvents();
    closeEventModal();
    renderCalendar();
  }

  function handleDayCellClick(dateStr, event) {
    selectedDate = new Date(dateStr);
    openEventModal(dateStr);
  }

  function handleTimeGridClick(dateStr, event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    const hour = Math.floor(clickY / 48);
    const minute = Math.floor((clickY % 48) / 12) * 15;

    const startStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const endStr = `${dateStr}T${String(Math.min(23, hour + 1)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    openEventModal(startStr);
  }

  // =========================================================================
  // AUTONOMOUS AI REAL-LIFE SCHEDULER ENGINE
  // =========================================================================
  function aiAutoPlanDay(targetDateInput, customTasks) {
    const targetDate = targetDateInput ? new Date(targetDateInput) : (selectedDate || new Date());
    const dateKey = formatDateKey(targetDate);
    const dayOfWeek = targetDate.getDay();

    if (calendarSettings.excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      console.log(`[AI Scheduler]: Weekend exclusion active for ${dateKey}.`);
      return { success: false, reason: 'weekend_excluded', message: 'Weekend scheduling excluded by user rule.' };
    }

    const defaultTasks = customTasks || [
      { title: 'Morning Cognitive Preparation & Briefing', duration: 45, category: 'health', priority: 'high' },
      { title: 'Deep Work: Core Architecture Sprint', duration: 90, category: 'focus', priority: 'urgent' },
      { title: 'Telemetry Audit & Pull Request Review', duration: 45, category: 'work', priority: 'normal' },
      { title: 'Protected Lunch & Mental Reset', duration: 60, category: 'health', priority: 'urgent', fixedTime: '12:30' },
      { title: 'Autonomous MicroVM Pipeline Execution', duration: 75, category: 'ai_autonomous', priority: 'normal' },
      { title: 'Daily Engineering Retrospective & Journaling', duration: 30, category: 'personal', priority: 'normal' }
    ];

    const plannedEvents = [];
    let currentHour = 8;
    let currentMinute = 0;

    for (const task of defaultTasks) {
      if (task.fixedTime) {
        const [fh, fm] = task.fixedTime.split(':').map(Number);
        currentHour = fh;
        currentMinute = fm;
      }

      if (currentHour >= 23 || currentHour < 7) {
        break;
      }

      let jitter = 0;
      if (calendarSettings.enableHumanJitter && !task.fixedTime) {
        jitter = Math.floor(Math.random() * (calendarSettings.jitterMinutes * 2 + 1)) - calendarSettings.jitterMinutes;
      }

      let startMinTotal = currentHour * 60 + currentMinute + jitter;
      if (startMinTotal < 7 * 60) startMinTotal = 7 * 60;
      const startH = Math.floor(startMinTotal / 60);
      const startM = startMinTotal % 60;

      const endMinTotal = startMinTotal + task.duration;
      const endH = Math.floor(endMinTotal / 60);
      const endM = endMinTotal % 60;

      if (endH >= 23) break;

      const startIso = `${dateKey}T${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}:00`;
      const endIso = `${dateKey}T${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}:00`;

      const color = CATEGORY_META[task.category] ? CATEGORY_META[task.category].color : '#039be5';

      const evt = {
        id: `evt_ai_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        title: task.title,
        description: `Autonomously synthesized by Lumina AI Scheduler for ${dateKey}`,
        start: startIso,
        end: endIso,
        allDay: false,
        category: task.category,
        color,
        isAutonomous: true,
        priority: task.priority || 'normal',
        reschedulable: true
      };

      plannedEvents.push(evt);

      const buffer = calendarSettings.restBufferMinutes || 15;
      const nextMinTotal = endMinTotal + buffer;
      currentHour = Math.floor(nextMinTotal / 60);
      currentMinute = nextMinTotal % 60;
    }

    calendarEvents.push(...plannedEvents);
    saveCalendarEvents();
    renderCalendar();

    return {
      success: true,
      count: plannedEvents.length,
      events: plannedEvents,
      message: `Autonomously scheduled ${plannedEvents.length} events for ${dateKey}.`
    };
  }

  function aiRescheduleConflicts(newEvent) {
    if (!newEvent || !newEvent.start || !newEvent.end) return;

    const newStart = new Date(newEvent.start).getTime();
    const newEnd = new Date(newEvent.end).getTime();

    calendarEvents.forEach(evt => {
      if (evt.id === newEvent.id) return;
      if (!evt.reschedulable) return;

      const evtStart = new Date(evt.start).getTime();
      const evtEnd = new Date(evt.end).getTime();

      if (newStart < evtEnd && newEnd > evtStart) {
        const shiftDuration = evtEnd - evtStart;
        const bufferMs = (calendarSettings.restBufferMinutes || 15) * 60 * 1000;
        const shiftedStart = new Date(newEnd + bufferMs);
        const shiftedEnd = new Date(shiftedStart.getTime() + shiftDuration);

        evt.start = shiftedStart.toISOString().slice(0, 19);
        evt.end = shiftedEnd.toISOString().slice(0, 19);
        evt.description = (evt.description || '') + ' [Auto-shifted to resolve collision]';
      }
    });
  }

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
      calendarEvents.push(...importedEvents);
      saveCalendarEvents();
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
  async function checkBackendConnectionStatus() {
    try {
      const res = await fetch('/api/calendar/status');
      if (res.ok) {
        const data = await res.json();
        calendarSettings.googleCalendarConnected = !!data.connected;
        updateSyncStatusBadge();
      }
    } catch (e) {}
  }

  async function connectGoogleAccount() {
    try {
      const clientRedirect = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? `${window.location.origin}/api/calendar/callback`
        : '';
      
      const statusUrl = clientRedirect 
        ? `/api/calendar/status?redirect_uri=${encodeURIComponent(clientRedirect)}`
        : '/api/calendar/status';

      const statusRes = await fetch(statusUrl);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.connected) {
          calendarSettings.googleCalendarConnected = true;
          saveCalendarSettings();
          updateSyncStatusBadge();
          await syncGoogleCalendar();
          return;
        }
      }

      // Fetch OAuth initiation authUrl from backend with client redirect URI
      const authUrl = clientRedirect 
        ? `/api/calendar/auth?redirect_uri=${encodeURIComponent(clientRedirect)}` 
        : '/api/calendar/auth';
      const authRes = await fetch(authUrl);
      const authData = await authRes.json();

      if (!authData.configured || !authData.authUrl) {
        alert("Google Calendar backend is not configured yet on Vercel.\n\nPlease add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your Vercel Project Settings > Environment Variables, then redeploy!");
        return;
      }

      // Open OAuth in centered popup
      const width = 560, height = 680;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;
      const popup = window.open(authData.authUrl, 'google_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);

      const checkInterval = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(checkInterval);
            const checkRes = await fetch(statusUrl);
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              if (checkData.connected) {
                calendarSettings.googleCalendarConnected = true;
                calendarSettings.lastSyncedAt = new Date().toISOString();
                saveCalendarSettings();
                updateSyncStatusBadge();
                await syncGoogleCalendar();
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

  async function syncGoogleCalendar() {
    updateSyncStatusBadge(true);
    try {
      const res = await fetch('/api/calendar/sync');
      if (res.ok) {
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          const gEvents = data.items.map(item => ({
            id: `gcal_${item.id}`,
            googleEventId: item.id,
            title: item.summary || 'Google Calendar Event',
            description: item.description || '',
            location: item.location || '',
            start: (item.start && (item.start.dateTime || item.start.date)) || new Date().toISOString(),
            end: (item.end && (item.end.dateTime || item.end.date)) || new Date().toISOString(),
            allDay: !item.start || !item.start.dateTime,
            category: 'work',
            color: '#3f51b5',
            isAutonomous: false
          }));

          gEvents.forEach(ge => {
            const exists = calendarEvents.find(e => e.googleEventId === ge.googleEventId);
            if (!exists) calendarEvents.push(ge);
          });

          calendarSettings.googleCalendarConnected = true;
          calendarSettings.lastSyncedAt = new Date().toISOString();
          saveCalendarEvents();
          saveCalendarSettings();
          renderCalendar();
        }
      }
    } catch (e) {
      console.warn('Sync Google Calendar error:', e);
    } finally {
      updateSyncStatusBadge(false);
    }
  }

  async function pushEventToGoogle(evt) {
    try {
      await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: evt.title,
          description: evt.description || '',
          location: evt.location || '',
          start: { dateTime: new Date(evt.start).toISOString() },
          end: { dateTime: new Date(evt.end).toISOString() }
        })
      });
    } catch (e) {}
  }

  function updateSyncStatusBadge(isSyncing = false) {
    const badge = document.getElementById('calSyncStatusBadge');
    if (!badge) return;

    if (isSyncing) {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> <span class="hidden sm:inline">Syncing...</span>`;
      badge.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30';
      return;
    }

    if (calendarSettings.googleCalendarConnected) {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> <span class="hidden sm:inline">Google Synced</span>`;
      badge.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/20';
    } else {
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400"></span> <span class="hidden sm:inline">Local Sovereign</span>`;
      badge.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-surface-900 text-zinc-400 border border-white/10 hover:text-white cursor-pointer transition-colors';
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
      const res = await fetch(statusUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.redirectUri && redirectInput) {
          redirectInput.value = data.redirectUri;
        }
        if (data.connected) {
          calendarSettings.googleCalendarConnected = true;
          if (statusBadge) {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-mono';
            statusBadge.textContent = 'Active Sync';
          }
          if (statusText) {
            statusText.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Google Calendar Connected &amp; Synced</span>`;
          }
        } else if (data.configured) {
          if (statusBadge) {
            statusBadge.className = 'text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono';
            statusBadge.textContent = 'Configured (Needs Login)';
          }
          if (statusText) {
            statusText.innerHTML = `<span class="text-cyan-300 font-sans">Credentials detected on Vercel. Make sure the redirect URI below is added to Google Cloud Console, then click <b>Sign in &amp; Sync with Google</b>.</span>`;
          }
        } else {
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

  // =========================================================================
  // AI STUDIO INTENT DIRECTIVE HANDLER
  // =========================================================================
  function handleAgentDirective(directive) {
    if (!directive || typeof directive !== 'object') return { success: false };

    const { action } = directive;

    if (action === 'auto_plan') {
      const targetDate = directive.date || formatDateKey(new Date());
      return aiAutoPlanDay(targetDate, directive.tasks);
    }

    if (action === 'create') {
      const newEvt = {
        id: `evt_agent_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        title: directive.title || 'Scheduled Event',
        start: directive.start || new Date().toISOString(),
        end: directive.end || new Date(Date.now() + 3600000).toISOString(),
        allDay: !!directive.allDay,
        category: directive.category || 'ai_autonomous',
        color: CATEGORY_META[directive.category] ? CATEGORY_META[directive.category].color : '#00f2fe',
        isAutonomous: true,
        priority: directive.priority || 'normal',
        reschedulable: directive.reschedulable !== false
      };

      if (calendarSettings.aiSchedulingEnabled) {
        aiRescheduleConflicts(newEvt);
      }

      calendarEvents.push(newEvt);
      saveCalendarEvents();
      renderCalendar();
      return { success: true, event: newEvt };
    }

    if (action === 'delete') {
      const id = directive.id;
      if (id) {
        calendarEvents = calendarEvents.filter(e => e.id !== id);
        saveCalendarEvents();
        renderCalendar();
        return { success: true };
      }
    }

    if (action === 'toggle') {
      if (directive.state !== undefined) {
        calendarSettings.aiSchedulingEnabled = (directive.state === 'on' || directive.state === true);
        saveCalendarSettings();
      }
      return { success: true, enabled: calendarSettings.aiSchedulingEnabled };
    }

    return { success: false, message: 'Unknown directive action' };
  }

  // =========================================================================
  // HELPER UTILITIES
  // =========================================================================
  function formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatHourLabel(h) {
    if (h === 0) return '12 AM';
    if (h < 12) return `${h} AM`;
    if (h === 12) return '12 PM';
    return `${h - 12} PM`;
  }

  function formatShortTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'p' : 'a';
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  }

  function getEventsForDate(dateObj) {
    const key = formatDateKey(dateObj);
    return calendarEvents.filter(evt => {
      if (evt.category && activeCategories[evt.category] === false) return false;
      if (searchQuery && !evt.title.toLowerCase().includes(searchQuery)) return false;

      const startKey = evt.start ? evt.start.slice(0, 10) : '';
      if (startKey === key) return true;

      if (evt.recurrence && evt.recurrence.freq) {
        return matchesRecurrence(evt, dateObj);
      }

      return false;
    }).sort((a, b) => (a.start > b.start ? 1 : -1));
  }

  function matchesRecurrence(evt, targetDate) {
    const s = new Date(evt.start);
    if (targetDate < s) return false;
    if (evt.recurrence.until && targetDate > new Date(evt.recurrence.until)) return false;

    const freq = evt.recurrence.freq;
    if (freq === 'DAILY') return true;
    if (freq === 'WEEKLY') {
      if (Array.isArray(evt.recurrence.daysOfWeek)) {
        return evt.recurrence.daysOfWeek.includes(targetDate.getDay());
      }
      return targetDate.getDay() === s.getDay();
    }
    if (freq === 'MONTHLY') {
      return targetDate.getDate() === s.getDate();
    }
    if (freq === 'YEARLY') {
      return targetDate.getMonth() === s.getMonth() && targetDate.getDate() === s.getDate();
    }
    return false;
  }

  function getUpcomingEvents(daysAhead = 30) {
    const now = new Date();
    const endLimit = new Date();
    endLimit.setDate(endLimit.getDate() + daysAhead);

    const matches = [];
    const step = new Date(now);
    step.setHours(0, 0, 0, 0);

    while (step <= endLimit) {
      const evts = getEventsForDate(step);
      matches.push(...evts);
      step.setDate(step.getDate() + 1);
    }

    const seen = new Set();
    return matches.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }

  function groupEventsByDate(events) {
    const groups = {};
    const todayStr = formatDateKey(new Date());

    events.forEach(evt => {
      const dStr = evt.start ? evt.start.slice(0, 10) : todayStr;
      if (!groups[dStr]) groups[dStr] = [];
      groups[dStr].push(evt);
    });

    return Object.keys(groups).sort().map(dStr => {
      const d = new Date(dStr);
      let relativeDay = d.toLocaleDateString('en-US', { weekday: 'long' });
      if (dStr === todayStr) relativeDay = 'Today';

      return {
        dateStr: dStr,
        dateFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        relativeDay,
        events: groups[dStr]
      };
    });
  }

  function jumpToDate(dateStr) {
    currentDate = new Date(dateStr);
    selectedDate = new Date(dateStr);
    renderCalendar();
  }

  function jumpToMonth(monthIndex) {
    currentDate.setMonth(monthIndex);
    currentView = 'month';
    renderCalendar();
  }

  function navigateMiniMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderMiniCalendar();
  }

  function toggleMiniSidebar() {
    isMiniSidebarOpen = !isMiniSidebarOpen;
    const drawer = document.getElementById('calMiniSidebar');
    if (drawer) {
      drawer.classList.toggle('hidden', !isMiniSidebarOpen);
    }
  }

  function handleSearchInput(e) {
    searchQuery = (e && e.target ? e.target.value : '').toLowerCase().trim();
    renderCalendar();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // PUBLIC API EXPORT ON WINDOW
  // =========================================================================
  window.LuminaCalendar = {
    init: function() {
      loadCalendarFromStorage();
      renderCalendar();
    },
    render: renderCalendar,
    setView,
    navigateCalendar,
    goToToday,
    jumpToDate,
    jumpToMonth,
    navigateMiniMonth,
    toggleMiniSidebar,
    handleSearchInput,
    handleDayCellClick,
    handleTimeGridClick,
    openEventModal,
    closeEventModal,
    saveEventFromModal,
    deleteEvent,
    toggleCategory,
    aiAutoPlanDay,
    aiRescheduleConflicts,
    handleAgentDirective,
    exportToIcs,
    importFromIcs,
    connectGoogleAccount,
    syncGoogleCalendar,
    openSyncModal,
    closeSyncModal,
    copyRedirectUri,
    saveSyncSettingsFromModal: function() {
      connectGoogleAccount();
      closeSyncModal();
    },
    getEvents: () => [...calendarEvents],
    getSettings: () => ({ ...calendarSettings }),
    setSettings: (s) => {
      calendarSettings = Object.assign(calendarSettings, s);
      saveCalendarSettings();
      renderCalendar();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
      loadCalendarFromStorage();
    });
  }

})(typeof window !== 'undefined' ? window : globalThis);
