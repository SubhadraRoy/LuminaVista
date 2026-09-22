// modules/sidebar.js - Sidebar Resize & Minimize Controls

(function(window) {
  'use strict';

  function initSidebarResize() {
    const sb = document.getElementById("mainSidebar");
    const resizer = document.getElementById("sidebarResizer");
    if (!sb || !resizer) return;
    let isResizing = false;

    resizer.addEventListener("mousedown", (e) => {
      if (window.isSidebarMinimized) return;
      isResizing = true;
      resizer.classList.add("resizing");
      document.body.style.cursor = "col-resize";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 180) newWidth = 180;
      if (newWidth > 480) newWidth = 480;
      sb.style.width = newWidth + "px";
      window.lastSidebarWidth = newWidth;
    });

    window.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove("resizing");
        document.body.style.cursor = "default";
      }
    });
  }

  function toggleSidebarMinimize() {
    const sb = document.getElementById("mainSidebar");
    const icon = document.getElementById("sidebarToggleIcon");
    const labels = document.querySelectorAll(".sidebar-label");
    if (!sb || !icon) return;

    window.isSidebarMinimized = !window.isSidebarMinimized;

    if (window.isSidebarMinimized) {
      sb.style.width = "68px";
      labels.forEach(el => el.classList.add("hidden"));
      icon.setAttribute("data-lucide", "chevrons-right");
    } else {
      sb.style.width = (window.lastSidebarWidth || 250) + "px";
      labels.forEach(el => el.classList.remove("hidden"));
      icon.setAttribute("data-lucide", "chevrons-left");
    }
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  window.initSidebarResize = initSidebarResize;
  window.toggleSidebarMinimize = toggleSidebarMinimize;

})(window);
