// modules/system.js - System Services, Command Palette, Navigation & Clock

(function(window) {
  'use strict';

  function switchTab(id) {
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("nav-tab-active");
      b.classList.add("text-zinc-400");
    });

    const targetTab = document.getElementById(id);
    if (targetTab) targetTab.classList.remove("hidden");

    const activeBtn = document.getElementById(`btn-${id}`);
    if (activeBtn) {
      activeBtn.classList.add("nav-tab-active");
      activeBtn.classList.remove("text-zinc-400");
    }
    
    if (id === "tab-whiteboard") {
      setTimeout(() => {
        if (window.resizeWhiteboard) window.resizeWhiteboard();
        if (window.loadWbState) window.loadWbState();
      }, 50);
    }

    if (id === "tab-scratchpad") {
      setTimeout(() => {
        if (window.renderNoteTabs) window.renderNoteTabs();
        if (window.loadActiveNoteContent) window.loadActiveNoteContent();
        if (window.updateNoteStats) window.updateNoteStats();
        if (window.renderMarkdownPreview) window.renderMarkdownPreview();
      }, 50);
    }
    
    if (id === "tab-analytics") {
      setTimeout(() => {
        if (window.initMetricsChart) window.initMetricsChart();
      }, 50);
    }

    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  function openSourceInspector() {
    const modal = document.getElementById("sourceModal");
    if (!modal) return;
    modal.style.display = "flex";
    setTimeout(() => modal.classList.remove("opacity-0"), 10);
    const codeBlock = document.getElementById("sourceCodeBlock");
    if (codeBlock) codeBlock.textContent = document.documentElement.outerHTML;
  }

  function openCommandPalette() {
    const m = document.getElementById("cmdModal");
    if (!m) return;
    m.style.display = "flex";
    setTimeout(() => {
      m.classList.remove("opacity-0");
      const search = document.getElementById("cmdSearchInput");
      if (search) search.focus();
    }, 10);
    handleCmdSearch({ target: { value: '' } });
  }

  function handleCmdSearch(e) {
    const q = (e && e.target && e.target.value) ? e.target.value.toLowerCase() : '';
    const list = [
      { label: "Jump to ai-llm Studio", act: () => switchTab('tab-ai-studio') },
      { label: "Jump to Projects Explorer", act: () => switchTab('tab-projects') },
      { label: "Jump to Compilers & SQL", act: () => switchTab('tab-sandbox') },
      { label: "Jump to Whiteboard Pro", act: () => switchTab('tab-whiteboard') },
      { label: "Jump to UI Generator", act: () => switchTab('tab-design') },
      { label: "Jump to Split Compare", act: () => switchTab('tab-split') },
      { label: "Jump to Quantum Terminal", act: () => switchTab('tab-terminal') },
      { label: "Jump to Telemetry", act: () => switchTab('tab-analytics') },
      { label: "Jump to Notes Markdown", act: () => switchTab('tab-scratchpad') },
      { label: "Jump to Settings", act: () => switchTab('tab-controls') },
      { label: "Configure AI & Personas", act: () => { if (window.openAiConfigModal) window.openAiConfigModal(); } },
      { label: "Toggle Artifact Codespace", act: () => { if (window.toggleCodespacePane) window.toggleCodespacePane(); } },
      { label: "Run Compiler", act: () => { if (window.runSandboxCode) window.runSandboxCode(); } }
    ];
    const res = document.getElementById("cmdResults");
    if (!res) return;
    res.innerHTML = "";
    list.filter(item => item.label.toLowerCase().includes(q)).forEach(item => {
      const row = document.createElement("button");
      row.className = "w-full px-3 py-2 text-left text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg flex items-center justify-between";
      row.innerHTML = `<span>${item.label}</span><i data-lucide="arrow-right" class="w-3.5 h-3.5 text-cyan-400"></i>`;
      row.onclick = () => {
        const cmdModal = document.getElementById("cmdModal");
        if (cmdModal) cmdModal.style.display = "none";
        item.act();
      };
      res.appendChild(row);
    });
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function startSystemClock() {
    setInterval(() => {
      const clockEl = document.getElementById("systemClock");
      if (clockEl) {
        clockEl.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 text-cyan-400"></i> ${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' })} IST`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }
    }, 1000);
  }

  function handleLogout() {
    fetch("/api/logout", { method: "POST", credentials: "include" }).finally(() => {
      sessionStorage.clear();
      window.location.href = "/index.html";
    });
  }

  function showToast(title, msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    const titleEl = document.getElementById("toastTitle");
    const msgEl = document.getElementById("toastMsg");
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    t.classList.remove("translate-y-24", "opacity-0");
    setTimeout(() => t.classList.add("translate-y-24", "opacity-0"), 3500);
  }

  function initAmbientParticles() {
    const cv = document.getElementById("ambientCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let w = cv.width = window.innerWidth;
    let h = cv.height = window.innerHeight;
    const p = Array.from({ length: 30 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5
    }));
    function anim() {
      ctx.clearRect(0, 0, w, h);
      p.forEach(i => {
        i.x = (i.x + i.vx + w) % w;
        i.y = (i.y + i.vy + h) % h;
        ctx.beginPath();
        ctx.arc(i.x, i.y, i.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 242, 254, 0.25)";
        ctx.fill();
      });
      requestAnimationFrame(anim);
    }
    anim();
    window.addEventListener("resize", () => {
      w = cv.width = window.innerWidth;
      h = cv.height = window.innerHeight;
    });
  }

  function startAutonomousSyncPoller() {
    setInterval(async () => {
      try {
        // Future-proofing: When you map /api/sync fully, this pulls background state
      } catch (e) {}
    }, 5000);
  }

  // Global key bindings
  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
    }
    if (e.key === "Escape") {
      const cmdModal = document.getElementById("cmdModal");
      const aiConfigModal = document.getElementById("aiConfigModal");
      const sourceModal = document.getElementById("sourceModal");
      if (cmdModal) cmdModal.style.display = "none";
      if (aiConfigModal) aiConfigModal.style.display = "none";
      if (sourceModal) sourceModal.style.display = "none";
    }
  });

  // Export to window
  window.switchTab = switchTab;
  window.openSourceInspector = openSourceInspector;
  window.openCommandPalette = openCommandPalette;
  window.handleCmdSearch = handleCmdSearch;
  window.startSystemClock = startSystemClock;
  window.handleLogout = handleLogout;
  window.showToast = showToast;
  window.initAmbientParticles = initAmbientParticles;
  window.startAutonomousSyncPoller = startAutonomousSyncPoller;

})(window);
