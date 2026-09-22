// modules/projects.js - GitHub EXM Workspaces & Dual Split View

(function(window) {
  'use strict';

  function resolveProjectUrl(raw) {
    let c = raw.replace(/^\.\//, "").replace(/^\//, "");
    if (!c.startsWith("EXM/")) c = "EXM/" + c;
    if (c.endsWith("/")) c += "index.html";
    else if (!c.includes(".html") && !c.includes(".")) c += "/index.html";
    return window.location.origin + window.location.pathname.substring(0, window.location.pathname.lastIndexOf("/") + 1) + c;
  }

  async function fetchRepoProjects() {
    const i = document.getElementById("refreshIcon");
    if (i) i.classList.add("animate-spin");
    try {
      const r = await fetch(window.REPO_API_URL);
      if (r.ok) {
        const d = await r.json();
        if (!window.repoProjects) window.repoProjects = [];
        d.filter(x => !x.name.startsWith(".")).forEach(x => {
          const p = { name: x.name, path: `EXM/${x.name}${x.type === "dir" ? "/" : ""}`, type: x.type };
          if (!window.repoProjects.some(e => e.name === p.name)) window.repoProjects.push(p);
        });
        localStorage.setItem("lumina_exm_projects", JSON.stringify(window.repoProjects));
      }
    } catch (e) {
      // Ignore network errors on scanning
    } finally {
      if (i) i.classList.remove("animate-spin");
      renderProjectList();
      updateSplitDropdowns();
    }
  }

  function filterProjectList() {
    const inp = document.getElementById("projectFilterInput");
    renderProjectList(inp ? inp.value.toLowerCase() : "");
  }

  function renderProjectList(q = "") {
    const c = document.getElementById("projectChipsContainer");
    if (!c) return;
    c.innerHTML = "";
    const projects = window.repoProjects || [];
    const countBadge = document.getElementById("projectCountBadge");
    if (countBadge) countBadge.textContent = `${projects.length} Detected`;

    projects.filter(p => p.name.toLowerCase().includes(q)).forEach(p => {
      const isS = window.currentSelectedProject && p.name === window.currentSelectedProject.name;
      const b = document.createElement("button");
      b.className = `w-full px-3 py-2 rounded-xl text-xs font-mono border flex items-center gap-2 cursor-pointer text-left transition-colors ${isS ? "bg-cyan-500/20 border-cyan-500 text-cyan-300" : "bg-surface-900 border-white/5 text-zinc-400 hover:text-zinc-200"}`;
      b.innerHTML = `<i data-lucide="${p.type === 'dir' ? 'folder' : 'file-code'}" class="w-3.5 h-3.5"></i><span class="truncate">${p.name}</span>`;
      b.onclick = () => selectProject(p);
      c.appendChild(b);
    });
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function selectProject(p) {
    window.currentSelectedProject = p;
    const title = document.getElementById("activeProjectTitle");
    if (title) title.textContent = `EXM/${p.name}/`;
    renderProjectList();
    const frame = document.getElementById("previewIframe");
    if (frame) frame.src = resolveProjectUrl(p.path);
    const overlay = document.getElementById("iframeOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function addCustomProject() {
    const inp = document.getElementById("customProjectInput");
    if (!inp) return;
    const v = inp.value.trim();
    if (!v) return;
    const n = v.replace(/^EXM\//i, "").replace(/^\/+|\/+$/g, "");
    const p = { name: n, path: `EXM/${n}${n.endsWith(".html") ? "" : "/"}`, type: n.endsWith(".html") ? "file" : "dir" };
    if (!window.repoProjects) window.repoProjects = [];
    if (!window.repoProjects.some(x => x.name === p.name)) {
      window.repoProjects.push(p);
      localStorage.setItem("lumina_exm_projects", JSON.stringify(window.repoProjects));
    }
    selectProject(p);
    inp.value = "";
  }

  function setViewportDevice(w) {
    const wrap = document.getElementById("iframeWrapper");
    if (wrap) wrap.style.maxWidth = w;
  }

  function updateSplitDropdowns() {
    const l = document.getElementById("splitLeftSelect");
    const r = document.getElementById("splitRightSelect");
    if (!l || !r) return;
    l.innerHTML = "";
    r.innerHTML = "";
    const projects = window.repoProjects || [];
    projects.forEach((p, i) => {
      const o1 = document.createElement("option");
      const o2 = document.createElement("option");
      o1.value = o2.value = p.name;
      o1.textContent = o2.textContent = `EXM/${p.name}`;
      l.appendChild(o1);
      r.appendChild(o2);
      if (i === 1) o2.selected = true;
    });
    updateSplitFrames();
  }

  function updateSplitFrames() {
    const lSelect = document.getElementById("splitLeftSelect");
    const rSelect = document.getElementById("splitRightSelect");
    if (!lSelect || !rSelect) return;
    const projects = window.repoProjects || [];
    const l = projects.find(p => p.name === lSelect.value);
    const r = projects.find(p => p.name === rSelect.value);
    const lFrame = document.getElementById("splitLeftFrame");
    const rFrame = document.getElementById("splitRightFrame");
    if (l && lFrame) lFrame.src = resolveProjectUrl(l.path);
    if (r && rFrame) rFrame.src = resolveProjectUrl(r.path);
  }

  // Export to window
  window.resolveProjectUrl = resolveProjectUrl;
  window.fetchRepoProjects = fetchRepoProjects;
  window.filterProjectList = filterProjectList;
  window.renderProjectList = renderProjectList;
  window.selectProject = selectProject;
  window.addCustomProject = addCustomProject;
  window.setViewportDevice = setViewportDevice;
  window.updateSplitDropdowns = updateSplitDropdowns;
  window.updateSplitFrames = updateSplitFrames;

})(window);
