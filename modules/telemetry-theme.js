// modules/telemetry-theme.js - Telemetry Chart, Theme Engine & Design Studio

(function(window) {
  'use strict';

  let metricsInterval = null;

  function initMetricsChart() {
    const cv = document.getElementById("metricsChart");
    if (!cv || !cv.parentElement) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    
    if (metricsInterval) clearInterval(metricsInterval);
    
    let d = Array.from({ length: 50 }, () => Math.random() * 20 + 40);
    metricsInterval = setInterval(() => {
      if (!cv.parentElement || cv.parentElement.clientWidth === 0) return;
      cv.width = cv.parentElement.clientWidth;
      cv.height = cv.parentElement.clientHeight;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.beginPath();
      const step = cv.width / 49;
      d.forEach((v, i) => {
        const y = cv.height - (v / 100) * cv.height;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * step, y);
      });
      ctx.strokeStyle = "#00f2fe";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      d.shift();
      d.push(Math.min(100, Math.max(20, d[48] + (Math.random() - 0.5) * 10)));
    }, 1000);
  }

  function updateDesignPreview() {
    const bInput = document.getElementById("sliderBlur");
    const oInput = document.getElementById("sliderOpacity");
    const rInput = document.getElementById("sliderRadius");
    const gInput = document.getElementById("sliderGlow");
    if (!bInput || !oInput || !rInput || !gInput) return;

    const b = bInput.value;
    const o = oInput.value / 100;
    const r = rInput.value;
    const g = gInput.value / 100;

    const lblB = document.getElementById("lblBlurVal");
    const lblO = document.getElementById("lblOpacityVal");
    const lblR = document.getElementById("lblRadiusVal");
    const lblG = document.getElementById("lblGlowVal");

    if (lblB) lblB.textContent = b + "px";
    if (lblO) lblO.textContent = Math.round(o * 100) + "%";
    if (lblR) lblR.textContent = r + "px";
    if (lblG) lblG.textContent = Math.round(g * 100) + "%";

    const c = document.getElementById("glassPreviewCard");
    if (c) {
      c.style.backdropFilter = `blur(${b}px)`;
      c.style.backgroundColor = `rgba(11, 15, 25, ${o})`;
      c.style.borderRadius = `${r}px`;
      c.style.boxShadow = `0 20px 40px -15px rgba(0,0,0,0.7), 0 0 30px rgba(0, 242, 254, ${g})`;
    }
  }

  function copyGeneratedDesignCss() {
    const oInput = document.getElementById("sliderOpacity");
    const bInput = document.getElementById("sliderBlur");
    const rInput = document.getElementById("sliderRadius");
    const gInput = document.getElementById("sliderGlow");
    const o = oInput ? oInput.value / 100 : 0.75;
    const b = bInput ? bInput.value : 24;
    const r = rInput ? rInput.value : 16;
    const g = gInput ? gInput.value / 100 : 0.35;

    const cssToken = `.glass { background: rgba(11, 15, 25, ${o}); backdrop-filter: blur(${b}px); border-radius: ${r}px; box-shadow: 0 0 30px rgba(0,242,254,${g}); }`;
    navigator.clipboard.writeText(cssToken);
    if (window.showToast) window.showToast("Copied", "CSS Token copied.");
  }

  function setDashboardTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("lumina_theme", t);
  }

  function applyCustomAccentColor(h) {
    document.documentElement.style.setProperty("--primary", h);
    document.documentElement.style.setProperty("--primary-glow", h + "55");
  }

  function applySandboxPolicy() {
    const allowEl = document.getElementById("checkAllowScripts");
    const allow = allowEl ? allowEl.checked : true;
    const frame = document.getElementById("previewIframe");
    if (frame) {
      frame.setAttribute("sandbox", allow ? "allow-scripts allow-same-origin allow-popups allow-modals allow-forms" : "");
    }
    if (window.showToast) window.showToast("Policy Applied", "Iframe sandboxing updated.");
  }

  function exportDashboardConfig() {
    const configData = {
      vfs: window.vfs || {},
      notes: window.vaultNotes || [],
      projects: window.repoProjects || []
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `luminavista_config_${Date.now()}.json`;
    a.click();
  }

  function flushWorkspaceCache() {
    if (confirm("Permanently flush all local VFS and note storage?")) {
      localStorage.clear();
      window.location.reload();
    }
  }

  // Export to window
  window.initMetricsChart = initMetricsChart;
  window.updateDesignPreview = updateDesignPreview;
  window.copyGeneratedDesignCss = copyGeneratedDesignCss;
  window.setDashboardTheme = setDashboardTheme;
  window.applyCustomAccentColor = applyCustomAccentColor;
  window.applySandboxPolicy = applySandboxPolicy;
  window.exportDashboardConfig = exportDashboardConfig;
  window.flushWorkspaceCache = flushWorkspaceCache;

})(window);
