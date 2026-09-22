// modules/dashboard.js - LuminaVista OS Master Bootstrapper

(function(window) {
  'use strict';

  function initDashboard() {
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }

    if (window.setDashboardTheme) {
      window.setDashboardTheme(localStorage.getItem("lumina_theme") || "cyan");
    }

    const adminNameEl = document.getElementById("headerAdminName");
    if (adminNameEl) {
      adminNameEl.textContent = sessionStorage.getItem("lumina_godx_user") || "Anish x";
    }

    if (window.populatePersonasDropdown) window.populatePersonasDropdown();
    if (window.loadAiConfig) window.loadAiConfig();
    if (window.initSidebarResize) window.initSidebarResize();
    if (window.fetchRepoProjects) window.fetchRepoProjects();
    if (window.startSystemClock) window.startSystemClock();
    if (window.initMetricsChart) window.initMetricsChart();
    if (window.initNotes) window.initNotes();
    else {
      if (window.renderNoteTabs) window.renderNoteTabs();
      if (window.loadActiveNoteContent) window.loadActiveNoteContent();
      if (window.updateNoteStats) window.updateNoteStats();
    }
    if (window.initWhiteboard) window.initWhiteboard();
    if (window.updateDesignPreview) window.updateDesignPreview();
    if (window.renderAiChat) window.renderAiChat();

    // Clean open tabs against existing VFS keys
    const vfs = window.vfs || {};
    if (window.codespaceOpenTabs) {
      window.codespaceOpenTabs = window.codespaceOpenTabs.filter(file => vfs[file] !== undefined);
      if (window.codespaceOpenTabs.length === 0 && Object.keys(vfs).length > 0) {
        window.codespaceOpenTabs.push(Object.keys(vfs)[0]);
      }
      if (!window.codespaceOpenTabs.includes(window.csActiveFile)) {
        window.csActiveFile = window.codespaceOpenTabs[0] || "";
      }
    }

    if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
    if (window.renderCodespaceFileTabs) window.renderCodespaceFileTabs();
    if (window.loadCodespaceEditor) window.loadCodespaceEditor();

    if (window.csActiveFile && (window.csActiveFile.endsWith('.html') || window.csActiveFile.endsWith('.htm'))) {
      if (window.runCodespacePreview) window.runCodespacePreview();
      if (window.setCodespaceView) window.setCodespaceView('preview');
    } else {
      if (window.setCodespaceView) window.setCodespaceView('code');
    }

    if (window.initCompilerSample) window.initCompilerSample('html');
    if (window.startAutonomousSyncPoller) window.startAutonomousSyncPoller();
    if (window.initAmbientParticles) window.initAmbientParticles();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initDashboard);
  } else {
    initDashboard();
  }

  window.initDashboard = initDashboard;

})(window);
