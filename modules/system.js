// modules/system.js - System Services, Command Palette, Navigation, Clock & 15-Minute Idle Lock
(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  function switchTab(id) {
    if (window.closeMobileSidebar) {
      window.closeMobileSidebar();
    }

    let actualTabId = id;
    let subView = null;

    if (id === 'tab-artifacts') {
      actualTabId = 'tab-ai-studio';
      subView = 'artifacts';
    } else if (id === 'tab-ai-studio') {
      subView = 'chat';
    }

    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("nav-tab-active");
      b.classList.add("text-zinc-400");
    });

    const targetTab = document.getElementById(actualTabId);
    if (targetTab) {
      targetTab.classList.remove("hidden");
      targetTab.scrollTop = 0;
      if (window.gsap) {
        window.gsap.fromTo(targetTab, 
          { opacity: 0, y: 8, scale: 0.998 },
          { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power2.out" }
        );
      }
    }

    if (subView && window.switchAiSubTab) {
      window.switchAiSubTab(subView);
    }

    const activeBtn = document.getElementById(`btn-${id}`);
    if (activeBtn) {
      activeBtn.classList.add("nav-tab-active");
      activeBtn.classList.remove("text-zinc-400");
    }

    window.currentActiveTab = id;
    try {
      localStorage.setItem("lumina_active_tab_id", id);
      if (subView) localStorage.setItem("lumina_active_subview", subView);
      if (window.LuminaCloudSync?.queueSync) window.LuminaCloudSync.queueSync();
    } catch (e) {}
    
    if (id === "tab-overview") {
      if (window.LuminaOverview && window.LuminaOverview.refresh) {
        window.LuminaOverview.refresh();
      }
    }

    if (id === "tab-cloud-computer") {
      if (window.LuminaCloudComputer && window.LuminaCloudComputer.onTabActivated) {
        window.LuminaCloudComputer.onTabActivated();
      }
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

    if (id === "tab-calendar") {
      if (window.LuminaCalendar && typeof window.LuminaCalendar.init === 'function') {
        window.LuminaCalendar.init();
      }
    }

    if (id === "tab-adblock" && window.LuminaAdBlock?.onTabActivated) {
      window.LuminaAdBlock.onTabActivated();
    }

    if (id === "tab-smartlock" && window.LuminaSmartLock?.onTabActivated) {
      window.LuminaSmartLock.onTabActivated();
    }

    if (id === "tab-sandbox" && window.onSandboxTabActivated) {
      window.onSandboxTabActivated();
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
      { label: "Lock Session (15m Idle Protection)", act: () => lockSession(false) },
      { label: "Jump to AI-Studio", act: () => switchTab('tab-ai-studio') },
      { label: "Jump to Projects Explorer", act: () => switchTab('tab-projects') },
      { label: "Jump to Compilers & SQL", act: () => switchTab('tab-sandbox') },
      { label: "Jump to Whiteboard Pro", act: () => switchTab('tab-whiteboard') },
      { label: "Jump to UI Generator", act: () => switchTab('tab-design') },
      { label: "Jump to Split Compare", act: () => switchTab('tab-split') },
      { label: "Jump to Quantum Terminal", act: () => switchTab('tab-terminal') },
      { label: "Jump to Telemetry", act: () => switchTab('tab-analytics') },
      { label: "Jump to Notes Markdown", act: () => switchTab('tab-scratchpad') },
      { label: "Jump to Calendar", act: () => switchTab('tab-calendar') },
      { label: "Jump to ESP32 DNS Ad-Blocker", act: () => switchTab('tab-adblock') },
      { label: "Jump to Smart Door Lock & Cloud Log Viewer", act: () => switchTab('tab-smartlock') },
      { label: "AI Real-Life Daily Auto-Schedule", act: () => { switchTab('tab-calendar'); if (window.LuminaCalendar) window.LuminaCalendar.aiAutoPlanDay(); } },
      { label: "Sync Google Calendar", act: () => { if (window.LuminaCalendar) window.LuminaCalendar.openSyncModal(); } },
      { label: "Jump to Settings", act: () => switchTab('tab-controls') },
      { label: "Configure AI & Personas", act: () => { if (window.openAiConfigModal) window.openAiConfigModal(); } },
      { label: "Toggle Artifact Codespace", act: () => { if (window.toggleCodespacePane) window.toggleCodespacePane(); } },
      { label: "Run Compiler", act: () => { if (window.runSandboxCode) window.runSandboxCode(); } },
      { label: "Terminate Session (Logout)", act: () => handleLogout() }
    ];
    const res = document.getElementById("cmdResults");
    if (!res) return;
    res.innerHTML = "";
    list.filter(item => item.label.toLowerCase().includes(q)).forEach(item => {
      const row = document.createElement("button");
      row.className = "w-full px-3 py-2 text-left text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg flex items-center justify-between";
      row.innerHTML = `<span>${escapeHtml(item.label)}</span><i data-lucide="arrow-right" class="w-3.5 h-3.5 text-cyan-400"></i>`;
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
        clockEl.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 text-cyan-400"></i> ${new Date().toLocaleTimeString('en-US')}`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }
    }, 1000);
  }

  function handleLogout() {
    if (window.LuminaCloudSync?.flushSync) {
      try { window.LuminaCloudSync.flushSync(); } catch (e) {}
    }
    fetch("/api/logout", { method: "POST", credentials: "include" }).finally(() => {
      sessionStorage.clear();
      localStorage.removeItem("lumina_session_id");
      window.location.href = window.location?.hostname?.endsWith('github.io') ? "index.html" : "/index.html";
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

    let mouseX = -9999;
    let mouseY = -9999;

    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    window.addEventListener("mouseleave", () => {
      mouseX = -9999;
      mouseY = -9999;
    }, { passive: true });

    const p = Array.from({ length: 45 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: Math.random() * 1.6 + 0.8
    }));

    function anim() {
      ctx.clearRect(0, 0, w, h);

      // 1. Update & Repulse
      p.forEach(i => {
        i.x = (i.x + i.vx + w) % w;
        i.y = (i.y + i.vy + h) % h;

        // Mouse repulsion physics
        const dx = i.x - mouseX;
        const dy = i.y - mouseY;
        const dist = Math.hypot(dx, dy);
        if (dist < 130 && dist > 0) {
          const force = ((130 - dist) / 130) * 1.8;
          i.x += (dx / dist) * force;
          i.y += (dy / dist) * force;
        }

        // Draw particle node
        ctx.beginPath();
        ctx.arc(i.x, i.y, i.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 242, 254, 0.4)";
        ctx.shadowColor = "rgba(0, 242, 254, 0.7)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 2. Draw Constellation Interconnection Mesh
      for (let i = 0; i < p.length; i++) {
        for (let j = i + 1; j < p.length; j++) {
          const dx = p[i].x - p[j].x;
          const dy = p[i].y - p[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 115) {
            const alpha = (1 - dist / 115) * 0.22;
            ctx.strokeStyle = `rgba(0, 242, 254, ${alpha})`;
            ctx.lineWidth = 0.75;
            ctx.beginPath();
            ctx.moveTo(p[i].x, p[i].y);
            ctx.lineTo(p[j].x, p[j].y);
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(anim);
    }
    anim();

    window.addEventListener("resize", () => {
      w = cv.width = window.innerWidth;
      h = cv.height = window.innerHeight;
    }, { passive: true });
  }

  function startAutonomousSyncPoller() {
    setInterval(async () => {
      try {
        // Background poller hook
      } catch (e) {}
    }, 5000);
  }

  // =========================================================================
  // 20-MINUTE ACTIVE SESSION TIMEOUT, LAST TRIGGER CLOUD SAVE & AUTO-LOGOUT
  // =========================================================================
  let idleTimer = null;
  const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 Minutes (1,200,000 ms)
  let isSessionLocked = false;
  let isLoggingOut = false;

  async function handleSessionTimeout() {
    if (isLoggingOut) return;
    isLoggingOut = true;

    // Save all data to the cloud at this exact last trigger
    if (window.LuminaCloudSync?.flushSync) {
      try {
        await window.LuminaCloudSync.flushSync();
      } catch (e) {
        console.warn("Cloud flush on session timeout error:", e);
      }
    }

    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch (e) {}

    sessionStorage.clear();
    localStorage.removeItem("lumina_session_id");
    localStorage.removeItem("lumina_session_expired_notice");
    window.location.href = window.location?.hostname?.endsWith('github.io') ? "index.html" : "/index.html";
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (isSessionLocked || isLoggingOut) return;

    idleTimer = setTimeout(() => {
      handleSessionTimeout();
    }, IDLE_TIMEOUT_MS);
  }

  function initIdleTimer() {
    const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => {
      window.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  function lockSession(isAuto = false) {
    if (idleTimer) clearTimeout(idleTimer);
    isSessionLocked = true;

    const lockModal = document.getElementById("lockModal");
    const appRoot = document.getElementById("app-root");
    const passInput = document.getElementById("lockPasswordInput");
    const errEl = document.getElementById("lockErrorMessage");

    if (errEl) errEl.classList.add("hidden");
    if (passInput) passInput.value = "";

    if (appRoot) {
      appRoot.classList.add("filter", "blur-lg", "pointer-events-none", "select-none");
    }

    if (lockModal) {
      lockModal.classList.remove("hidden");
      lockModal.style.display = "flex";
      setTimeout(() => {
        lockModal.classList.remove("opacity-0");
        if (passInput) passInput.focus();
      }, 20);
    }

    if (window.showToast) {
      window.showToast("Security Lock", isAuto ? "Session auto-locked due to 15m inactivity." : "Security perimeter locked by administrator.");
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  async function computeSha256Hex(str) {
    if (!str) return '';
    try {
      if (window.crypto && window.crypto.subtle) {
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) {}
    try {
      function sha256_fallback(ascii) {
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
        let result = '';
        const words = [];
        const asciiBitLength = ascii.length * 8;
        let hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const k = [
          0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
          0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
          0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
          0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
          0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
          0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
          0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
          0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        let i = 0;
        for (; i < ascii.length; i++) words[i >> 2] |= (ascii.charCodeAt(i) & 0xff) << ((3 - (i % 4)) * 8);
        words[asciiBitLength >> 5] |= 0x80 << ((3 - ((asciiBitLength >> 3) % 4)) * 8);
        words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
        for (i = 0; i < words.length; i += 16) {
          const w = words.slice(i, i + 16);
          const oldHash = hash.slice(0);
          for (let j = 0; j < 64; j++) {
            if (j >= 16) {
              const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
              const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
              w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
            }
            const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
            const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
            const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
            const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
            const temp1 = (hash[7] + s1 + ch + k[j] + (w[j] | 0)) | 0;
            const temp2 = (s0 + maj) | 0;
            hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
          }
          for (let j = 0; j < 8; j++) hash[j] = (hash[j] + oldHash[j]) | 0;
        }
        for (let j = 0; j < 8; j++) {
          for (let b = 3; b >= 0; b--) {
            const byte = (hash[j] >> (b * 8)) & 255;
            result += (byte < 16 ? '0' : '') + byte.toString(16);
          }
        }
        return result;
      }
      return sha256_fallback(str);
    } catch (_) {}
    return '';
  }

  function performWorkspaceUnlock() {
    const lockModal = document.getElementById("lockModal");
    const appRoot = document.getElementById("app-root");
    const passInput = document.getElementById("lockPasswordInput");
    const errEl = document.getElementById("lockErrorMessage");

    if (lockModal) {
      lockModal.classList.add("opacity-0");
      setTimeout(() => {
        lockModal.classList.add("hidden");
        lockModal.style.display = "none";
      }, 300);
    }
    if (appRoot) {
      appRoot.classList.remove("filter", "blur-lg", "pointer-events-none", "select-none");
    }
    if (passInput) passInput.value = "";
    if (errEl) errEl.classList.add("hidden");
    isSessionLocked = false;
    resetIdleTimer();
    if (window.showToast) window.showToast("Perimeter Secure", "Access granted. Session resumed.");
  }

  async function unlockSession(e) {
    if (e && e.preventDefault) e.preventDefault();
    const passInput = document.getElementById("lockPasswordInput");
    const errEl = document.getElementById("lockErrorMessage");
    const btn = document.getElementById("lockUnlockBtn");
    if (!passInput) return;

    const rawPass = passInput.value;
    const password = rawPass ? rawPass.trim() : '';
    if (!password) {
      if (errEl) {
        errEl.textContent = "Please enter administrator credentials.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline mr-1"></i> Verifying...`;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    // Retrieve client-cached sovereign vault credentials
    let clientVault = [];
    try {
      clientVault = JSON.parse(localStorage.getItem('lumina_temp_vault') || '[]');
    } catch (_) {}
    if (!Array.isArray(clientVault) || clientVault.length === 0) {
      try {
        clientVault = JSON.parse(localStorage.getItem('lumina_admin_passwords_cache') || '[]');
      } catch (_) {}
    }
    if (!Array.isArray(clientVault)) clientVault = [];

    // Fast-path: Check against local sovereign vault if available
    const inputHex = await computeSha256Hex(password);
    const localMatch = inputHex && clientVault.find(v => v && typeof v.hash === 'string' && v.hash.toLowerCase() === inputHex.toLowerCase());

    if (localMatch) {
      performWorkspaceUnlock();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4 inline mr-1"></i> Unlock Workspace`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }
      // Re-validate session in background to issue fresh token if needed
      const apiOrigin = (window.location && window.location.hostname && window.location.hostname.endsWith('github.io'))
        ? 'https://lumina-vista-sigma.vercel.app'
        : '';
      fetch(apiOrigin + "/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": localStorage.getItem("lumina_session_id") || ""
        },
        credentials: "include",
        body: JSON.stringify({ password, clientKeys: clientVault })
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data && data.sessionId) {
          try {
            localStorage.setItem('lumina_session_id', data.sessionId);
            sessionStorage.setItem('lumina_workspace_attestation', data.sessionId);
          } catch (_) {}
        }
      }).catch(() => {});
      return;
    }

    try {
      const apiOrigin = (window.location && window.location.hostname && window.location.hostname.endsWith('github.io'))
        ? 'https://lumina-vista-sigma.vercel.app'
        : '';
      const res = await fetch(apiOrigin + "/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": localStorage.getItem("lumina_session_id") || ""
        },
        credentials: "include",
        body: JSON.stringify({ password, clientKeys: clientVault })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.sessionId) {
          try {
            localStorage.setItem('lumina_session_id', data.sessionId);
            sessionStorage.setItem('lumina_workspace_attestation', data.sessionId);
          } catch (e) {}
        }
        performWorkspaceUnlock();
      } else {
        if (errEl) {
          errEl.textContent = data.error || "Authentication failed. Access Denied.";
          errEl.classList.remove("hidden");
        }
        passInput.value = "";
        passInput.focus();
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = "Network error: unable to verify session.";
        errEl.classList.remove("hidden");
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4 inline mr-1"></i> Unlock Workspace`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }
    }
  }

  // Global key bindings
  window.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      lockSession(false);
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
  window.initIdleTimer = initIdleTimer;
  window.resetIdleTimer = resetIdleTimer;
  window.lockSession = lockSession;
  window.unlockSession = unlockSession;
  window.handleSessionTimeout = handleSessionTimeout;

})(window);
