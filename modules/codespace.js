// modules/codespace.js - Sovereign Artifact Codespace & Embedded Terminal

(function(window) {
  'use strict';

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toggleCodespacePane(forceOpen = null) {
    if (window.switchAiSubTab) {
      const shouldOpen = (forceOpen !== null) ? forceOpen : (window.activeAiSubTab !== 'artifacts');
      window.switchAiSubTab(shouldOpen ? 'artifacts' : 'chat');
      return;
    }
    const pane = document.getElementById("aiCodespaceColumn");
    const btnText = document.getElementById("btnCodespaceToggleText");
    if (!pane) return;

    window.isCodespaceOpen = (forceOpen !== null) ? forceOpen : !window.isCodespaceOpen;

    if (window.isCodespaceOpen) {
      pane.classList.remove("hidden");
      pane.classList.add("flex");
      if (btnText) btnText.textContent = "Close Artifacts";
    } else {
      pane.classList.add("hidden");
      pane.classList.remove("flex");
      if (btnText) btnText.textContent = "Artifacts IDE";
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function renderCodespaceFileTree() {
    const container = document.getElementById("vfsTreeContainer");
    if (!container) return;
    container.innerHTML = "";
    const vfs = window.vfs || {};
    const filenames = Object.keys(vfs);
    const countBadge = document.getElementById("vfsFileCount");
    if (countBadge) countBadge.textContent = `${filenames.length} files`;
    if (window.updateAiSubTabArtifactBadge) window.updateAiSubTabArtifactBadge();
    if (window.rebuildGraphData) window.rebuildGraphData();
    updateStorageQuotaMeter();

    const tree = {};
    filenames.forEach(file => {
      const parts = file.split('/');
      if (parts.length === 1) {
        tree[parts[0]] = '__FILE__';
      } else {
        const folder = parts[0];
        if (!tree[folder]) tree[folder] = [];
        tree[folder].push(parts.slice(1).join('/'));
      }
    });

    // Initialize or load collapsed folders
    if (!window.csCollapsedFolders) {
      try {
        const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem("lumina_collapsed_folders") : null;
        window.csCollapsedFolders = saved ? new Set(JSON.parse(saved)) : new Set();
      } catch (e) {
        window.csCollapsedFolders = new Set();
      }
    }

    Object.keys(tree).sort().forEach(key => {
      if (tree[key] === '__FILE__') {
        const isActive = key === window.csActiveFile;
        const item = document.createElement("button");
        item.className = `w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer text-left transition-colors truncate ${isActive ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`;
        
        let iconName = "file-code";
        if (key.endsWith(".html")) iconName = "file-code-2";
        else if (key.endsWith(".css")) iconName = "file-spreadsheet";
        else if (key.endsWith(".js") || key.endsWith(".ts") || key.endsWith(".py")) iconName = "terminal";
        
        item.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}"></i><span class="truncate">${key}</span>`;
        item.onclick = () => switchCodespaceFile(key);
        container.appendChild(item);
      } else {
        // Collapsible Folder
        const folder = key;
        const subFiles = tree[folder] || [];
        const containsActive = subFiles.some(sub => `${folder}/${sub}` === window.csActiveFile);

        // Auto-expand folder if active file is inside
        if (containsActive && window.csCollapsedFolders.has(folder)) {
          window.csCollapsedFolders.delete(folder);
        }

        const isCollapsed = window.csCollapsedFolders.has(folder);

        const folderDiv = document.createElement("div");
        folderDiv.className = "mb-1";

        const folderHeader = document.createElement("button");
        folderHeader.className = "w-full flex items-center justify-between text-zinc-400 hover:text-white font-bold py-1 px-1.5 text-[11px] cursor-pointer rounded-lg hover:bg-white/5 transition-colors group select-none";
        folderHeader.title = isCollapsed ? `Expand ${folder}/` : `Collapse ${folder}/`;
        folderHeader.innerHTML = `
          <div class="flex items-center gap-1.5 truncate">
            <i data-lucide="${isCollapsed ? 'folder' : 'folder-open'}" class="w-3.5 h-3.5 text-cyan-400 shrink-0"></i>
            <span class="truncate">${folder}/</span>
            <span class="text-[9px] text-zinc-500 font-mono">(${subFiles.length})</span>
          </div>
          <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" class="w-3 h-3 text-zinc-500 group-hover:text-cyan-400 shrink-0 transition-transform"></i>
        `;
        folderHeader.onclick = () => toggleFolderCollapse(folder);
        folderDiv.appendChild(folderHeader);

        const subContainer = document.createElement("div");
        subContainer.className = `pl-2.5 ml-1.5 border-l border-white/10 space-y-0.5 mt-0.5 ${isCollapsed ? 'hidden' : ''}`;
        
        subFiles.forEach(subFile => {
          const fullPath = `${folder}/${subFile}`;
          const isActive = fullPath === window.csActiveFile;
          const item = document.createElement("button");
          item.className = `w-full px-2 py-1 rounded-lg flex items-center gap-2 cursor-pointer text-left transition-colors truncate text-xs ${isActive ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`;
          
          let iconName = "file-code";
          if (subFile.endsWith(".html")) iconName = "file-code-2";
          else if (subFile.endsWith(".css")) iconName = "file-spreadsheet";
          else if (subFile.endsWith(".js") || subFile.endsWith(".ts") || subFile.endsWith(".py") || subFile.endsWith(".sh")) iconName = "terminal";
          
          item.innerHTML = `<i data-lucide="${iconName}" class="w-3.5 h-3.5 shrink-0 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}"></i><span class="truncate">${subFile}</span>`;
          item.onclick = () => switchCodespaceFile(fullPath);
          subContainer.appendChild(item);
        });
        folderDiv.appendChild(subContainer);
        container.appendChild(folderDiv);
      }
    });
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function toggleFolderCollapse(folderName) {
    if (!window.csCollapsedFolders) window.csCollapsedFolders = new Set();
    if (window.csCollapsedFolders.has(folderName)) {
      window.csCollapsedFolders.delete(folderName);
    } else {
      window.csCollapsedFolders.add(folderName);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem("lumina_collapsed_folders", JSON.stringify([...window.csCollapsedFolders]));
      }
    } catch (e) {}
    renderCodespaceFileTree();
  }

  function renderCodespaceFileTabs() {
    const container = document.getElementById("codespaceFileTabs");
    if (!container) return;
    container.innerHTML = "";
    const openTabs = window.codespaceOpenTabs || [];
    openTabs.forEach(file => {
      const isActive = file === window.csActiveFile;
      const tab = document.createElement("div");
      tab.className = `px-3 py-1.5 rounded-t-lg border-t border-x text-xs font-mono flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${isActive ? 'codespace-tab-active bg-surface-950 border-white/20 font-bold' : 'bg-surface-900/60 border-transparent text-zinc-500 hover:text-zinc-300'}`;
      tab.innerHTML = `<span>${file.split('/').pop()}</span><button onclick="event.stopPropagation(); removeSpecificTab('${file}')" class="hover:text-rose-400 text-[10px]">×</button>`;
      tab.onclick = () => switchCodespaceFile(file);
      container.appendChild(tab);
    });
    const breadcrumb = document.getElementById("csBreadcrumbFile");
    if (breadcrumb) breadcrumb.textContent = window.csActiveFile || "";
  }

  function removeSpecificTab(file) {
    window.codespaceOpenTabs = (window.codespaceOpenTabs || []).filter(f => f !== file);
    if (window.csActiveFile === file) {
      window.csActiveFile = window.codespaceOpenTabs.length > 0 ? window.codespaceOpenTabs[0] : "";
    }
    localStorage.setItem("lumina_open_tabs", JSON.stringify(window.codespaceOpenTabs));
    renderCodespaceFileTabs();
    renderCodespaceFileTree();
    loadCodespaceEditor();
    if (window.csActiveFile) {
      if (window.csActiveFile.endsWith('.html')) {
        updatePreview();
        setCodespaceView('preview');
      } else {
        setCodespaceView('code');
      }
    }
  }

  function switchCodespaceFile(file) {
    if (!window.codespaceOpenTabs.includes(file)) {
      window.codespaceOpenTabs.push(file);
      localStorage.setItem("lumina_open_tabs", JSON.stringify(window.codespaceOpenTabs));
    }
    window.csActiveFile = file;
    const breadcrumb = document.getElementById("csBreadcrumbFile");
    if (breadcrumb) breadcrumb.textContent = file;
    
    loadCodespaceEditor();
    renderCodespaceFileTree();
    renderCodespaceFileTabs();

    if (file.endsWith('.html') || file.endsWith('.htm')) {
      setCodespaceView('preview');
      updatePreview();
    } else {
      setCodespaceView('code');
    }
  }

  function loadCodespaceEditor() {
    const ed = document.getElementById("csCodeEditor");
    if (ed) ed.value = (window.vfs && window.vfs[window.csActiveFile]) || "";
  }

  function updateStorageQuotaMeter() {
    const vfs = window.vfs || {};
    const filenames = Object.keys(vfs);
    let totalBytes = 0;
    let totalChars = 0;

    filenames.forEach(f => {
      const content = vfs[f] || "";
      totalChars += content.length;
      try {
        totalBytes += (typeof Blob !== 'undefined') ? new Blob([content]).size : content.length;
      } catch (e) {
        totalBytes += content.length;
      }
    });

    const MAX_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB (1,024 MB) Sovereign Free Tier
    const pct = Math.min(100, Math.max(0.01, (totalBytes / MAX_STORAGE_BYTES) * 100));

    let usedDisplay = "0 B";
    if (totalBytes < 1024) {
      usedDisplay = `${totalBytes} B`;
    } else if (totalBytes < 1024 * 1024) {
      usedDisplay = `${(totalBytes / 1024).toFixed(1)} KB`;
    } else if (totalBytes < 1024 * 1024 * 1024) {
      usedDisplay = `${(totalBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      usedDisplay = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    const storageTextEl = document.getElementById("vfsStorageText");
    if (storageTextEl) storageTextEl.textContent = `${usedDisplay} / 1 GB (Free)`;

    const storageBarEl = document.getElementById("vfsStorageBar");
    if (storageBarEl) storageBarEl.style.width = `${Math.max(1, pct.toFixed(2))}%`;

    const storagePercentEl = document.getElementById("vfsStoragePercent");
    if (storagePercentEl) storagePercentEl.textContent = `${pct < 0.1 ? '<0.1' : pct.toFixed(1)}%`;

    const storageCharsEl = document.getElementById("vfsStorageChars");
    if (storageCharsEl) storageCharsEl.textContent = `${totalChars.toLocaleString()} chars`;
  }

  function onEditorContentChange() {
    if (window.csActiveFile && window.vfs) {
      const ed = document.getElementById("csCodeEditor");
      if (ed) {
        window.vfs[window.csActiveFile] = ed.value;
        localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
        updateStorageQuotaMeter();
        if (window.rebuildGraphData) window.rebuildGraphData();
      }
    }
  }

  function setCodespaceView(mode) {
    window.csViewMode = mode;
    const editor = document.getElementById("csEditorContainer");
    const preview = document.getElementById("csPreviewContainer");
    const terminal = document.getElementById("csTerminalContainer");

    ["btnCsViewPreview", "btnCsViewEditor", "btnCsViewTerminal", "btnCsViewSplit"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = "px-2.5 py-1 rounded text-zinc-400 hover:text-white cursor-pointer";
    });

    if (editor) { editor.classList.add("hidden"); editor.classList.remove("flex"); }
    if (preview) { preview.classList.add("hidden"); preview.classList.remove("flex"); }
    if (terminal) { terminal.classList.add("hidden"); terminal.classList.remove("flex"); }

    if (mode === "preview") {
      if (preview) { preview.classList.remove("hidden"); preview.classList.add("flex"); }
      const btn = document.getElementById("btnCsViewPreview");
      if (btn) btn.className = "px-2.5 py-1 rounded bg-cyan-500 text-black font-bold cursor-pointer";
    } else if (mode === "editor" || mode === "code") {
      if (editor) { editor.classList.remove("hidden"); editor.classList.add("flex"); }
      const btn = document.getElementById("btnCsViewEditor");
      if (btn) btn.className = "px-2.5 py-1 rounded bg-cyan-500 text-black font-bold cursor-pointer";
    } else if (mode === "terminal") {
      if (terminal) { terminal.classList.remove("hidden"); terminal.classList.add("flex"); }
      const btn = document.getElementById("btnCsViewTerminal");
      if (btn) btn.className = "px-2.5 py-1 rounded bg-cyan-500 text-black font-bold cursor-pointer";
    }
  }

  function bundleCodespaceHTML() {
    const vfs = window.vfs || {};
    let main = vfs["index.html"] || "<!DOCTYPE html><html><body><h1>Empty Workspace</h1></body></html>";
    
    if (vfs["style.css"]) {
      if (main.includes('href="style.css"')) {
        main = main.replace(/<link[^>]*href=["']style\.css["'][^>]*>/gi, `<style>\n${vfs["style.css"]}\n</style>`);
      } else {
        main = main.replace("</head>", `<style>\n${vfs["style.css"]}\n</style></head>`);
      }
    }

    if (vfs["script.js"]) {
      if (main.includes('src="script.js"')) {
        main = main.replace(/<script[^>]*src=["']script\.js["'][^>]*><\/script>/gi, `<script>\n${vfs["script.js"]}\n<\/script>`);
      } else {
        main = main.replace("</body>", `<script>\n${vfs["script.js"]}\n<\/script></body>`);
      }
    }

    return main;
  }

  function updatePreview() {
    const frame = document.getElementById("csPreviewFrame");
    if (frame) frame.srcdoc = bundleCodespaceHTML();
  }

  function runCodespacePreview() {
    updatePreview();
    setCodespaceView('preview');
    if (window.showToast) window.showToast("Codespace Compiled", "Artifact preview active.");
  }

  // THE UNIVERSAL IDE RUN BUTTON
  async function runActiveFile() {
    if (!window.csActiveFile) return;
    
    // If HTML, hot-reload DOM and switch to preview
    if (window.csActiveFile.endsWith('.html') || window.csActiveFile.endsWith('.htm')) {
      runCodespacePreview();
      return;
    }
    
    // If Code, boot terminal and execute via E2B
    setCodespaceView('terminal');
    const termOut = document.getElementById("csTermOutput");
    
    let cmd = `python3 "${window.csActiveFile}"`;
    if (window.csActiveFile.endsWith('.js')) cmd = `node "${window.csActiveFile}"`;
    if (window.csActiveFile.endsWith('.sh')) cmd = `bash "${window.csActiveFile}"`;
    if (window.csActiveFile.endsWith('.cpp')) cmd = `g++ -O2 "${window.csActiveFile}" -o out && ./out`;
    if (window.csActiveFile.endsWith('.java')) cmd = `javac "${window.csActiveFile}" && java Main`;

    if (termOut) {
      termOut.innerHTML += `<div class="mt-2 text-cyan-400 font-bold">➜ Executing: ${escapeHtml(cmd)}</div>`;
      termOut.scrollTop = termOut.scrollHeight;
    }

    try {
      const vfs = window.vfs || {};
      const filesArray = Object.keys(vfs).map(k => ({ name: k, content: vfs[k] }));
      const r = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, files: filesArray })
      });
      const d = await r.json();
      if (termOut) {
        if (r.ok) {
          if (d.stdout) termOut.innerHTML += `<div class="text-zinc-200">${escapeHtml(d.stdout)}</div>`;
          if (d.stderr) termOut.innerHTML += `<div class="text-rose-400">${escapeHtml(d.stderr)}</div>`;
          if (!d.stdout && !d.stderr) termOut.innerHTML += `<div class="text-zinc-500">[Exit 0]</div>`;
        } else {
          termOut.innerHTML += `<div class="text-rose-400">[MicroVM Error]: ${escapeHtml(d.error || '')}</div>`;
        }
      }
    } catch (err) {
      if (termOut) {
        termOut.innerHTML += `<div class="text-rose-400">[Network Fault]: ${escapeHtml(err.message)}</div>`;
      }
    }
    if (termOut) termOut.scrollTop = termOut.scrollHeight;
  }

  function promptCreateFile() {
    const name = prompt("Enter new filename (e.g. app.py, server.js, styles.css):");
    if (name && name.trim()) {
      const clean = name.trim();
      if (!window.vfs[clean]) {
        window.vfs[clean] = `// File: ${clean}\n`;
        localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
        switchCodespaceFile(clean);
        if (window.rebuildGraphData) window.rebuildGraphData();
        if (window.showToast) window.showToast("File Created", clean);
      }
    }
  }

  function promptCreateFolder() {
    const folder = prompt("Folder name (e.g. models):");
    if (folder && folder.trim()) {
      const clean = `${folder.trim().replace(/\/$/, '')}/README.md`;
      if (!window.vfs[clean]) {
        window.vfs[clean] = `# ${folder.trim()}`;
        localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
        switchCodespaceFile(clean);
        if (window.rebuildGraphData) window.rebuildGraphData();
      }
    }
  }

  function renameActiveFile() {
    if (window.csActiveFile === "index.html") return alert("Root entry index.html cannot be renamed.");
    const nextName = prompt("Rename " + window.csActiveFile + " to:", window.csActiveFile);
    if (nextName && nextName.trim() && nextName !== window.csActiveFile) {
      window.vfs[nextName.trim()] = window.vfs[window.csActiveFile];
      delete window.vfs[window.csActiveFile];
      
      window.codespaceOpenTabs = window.codespaceOpenTabs.filter(f => f !== window.csActiveFile);
      localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
      switchCodespaceFile(nextName.trim());
      if (window.rebuildGraphData) window.rebuildGraphData();
    }
  }

  function deleteActiveFile() {
    deleteSpecificFile(window.csActiveFile);
  }

  function deleteSpecificFile(file) {
    if (file === "index.html") return alert("Root index.html cannot be removed.");
    if (confirm(`Delete ${file}?`)) {
      delete window.vfs[file];
      localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
      removeSpecificTab(file);
      if (window.rebuildGraphData) window.rebuildGraphData();
      if (window.showToast) window.showToast("Deleted", file);
    }
  }

  function openCodespacePopout() {
    const blob = new Blob([bundleCodespaceHTML()], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  }

  function exportCodespaceZip() {
    const blob = new Blob([JSON.stringify(window.vfs, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lumina_codespace_${Date.now()}.json`;
    a.click();
  }

  async function handleIdeTerminalCommand(e) {
    if (e) e.preventDefault();
    const inp = document.getElementById("csTermInput");
    if (!inp) return;
    const cmd = inp.value.trim();
    if (!cmd) return;
    inp.value = "";

    const out = document.getElementById("csTermOutput");
    if (out) {
      out.innerHTML += `<div class="mt-2 text-emerald-400 font-bold">➜ ${escapeHtml(cmd)}</div>`;
      out.scrollTop = out.scrollHeight;
    }

    try {
      const vfs = window.vfs || {};
      const filesArray = Object.keys(vfs).map(k => ({ name: k, content: vfs[k] }));
      const r = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, files: filesArray })
      });
      const d = await r.json();
      if (out) {
        if (r.ok) {
          if (d.stdout) out.innerHTML += `<div class="text-zinc-200">${escapeHtml(d.stdout)}</div>`;
          if (d.stderr) out.innerHTML += `<div class="text-rose-400">${escapeHtml(d.stderr)}</div>`;
          if (!d.stdout && !d.stderr) out.innerHTML += `<div class="text-zinc-500">[Exit 0]</div>`;
          if (Array.isArray(d.workspaceFiles)) {
            d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
            localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
            renderCodespaceFileTree();
          }
        } else {
          out.innerHTML += `<div class="text-rose-400">[MicroVM Error]: ${escapeHtml(d.error || '')}</div>`;
        }
      }
    } catch (err) {
      if (out) {
        out.innerHTML += `<div class="text-rose-400">[Network Fault]: ${escapeHtml(err.message)}</div>`;
      }
    }
    if (out) out.scrollTop = out.scrollHeight;
  }

  async function uploadVfsFiles(files) {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    window.vfs = window.vfs || {};

    let uploadedCount = 0;
    for (const file of fileList) {
      try {
        const text = await readFileAsText(file);
        const fileName = file.name;
        window.vfs[fileName] = text;
        if (!window.codespaceOpenTabs) window.codespaceOpenTabs = [];
        if (!window.codespaceOpenTabs.includes(fileName)) {
          window.codespaceOpenTabs.push(fileName);
        }
        window.csActiveFile = fileName;
        uploadedCount++;
      } catch (err) {
        console.warn("Failed to read uploaded file:", file.name, err);
      }
    }

    try {
      localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
      localStorage.setItem("lumina_open_tabs", JSON.stringify(window.codespaceOpenTabs));
    } catch (e) {}

    renderCodespaceFileTree();
    renderCodespaceFileTabs();
    loadCodespaceEditor();
    updateStorageQuotaMeter();
    if (window.rebuildGraphData) window.rebuildGraphData();

    if (window.csActiveFile) {
      if (window.csActiveFile.endsWith('.html') || window.csActiveFile.endsWith('.htm')) {
        setCodespaceView('preview');
        updatePreview();
      } else {
        setCodespaceView('code');
      }
    }

    if (window.showToast) {
      window.showToast("Files Uploaded", `${uploadedCount} file(s) mounted in Sovereign VFS.`);
    }

    // Reset input elements
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach(inp => { if (inp.id === 'vfsUploadInput' || inp.getAttribute('onchange')?.includes('uploadVfsFiles')) inp.value = ''; });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const isBinary = /\.(png|jpg|jpeg|gif|webp|ico|pdf|wasm|bin)$/i.test(file.name);
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      if (isBinary) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  // Export to window
  window.toggleCodespacePane = toggleCodespacePane;
  window.renderCodespaceFileTree = renderCodespaceFileTree;
  window.renderCodespaceFileTabs = renderCodespaceFileTabs;
  window.toggleFolderCollapse = toggleFolderCollapse;
  window.uploadVfsFiles = uploadVfsFiles;
  window.removeSpecificTab = removeSpecificTab;
  window.switchCodespaceFile = switchCodespaceFile;
  window.loadCodespaceEditor = loadCodespaceEditor;
  window.onEditorContentChange = onEditorContentChange;
  window.setCodespaceView = setCodespaceView;
  window.bundleCodespaceHTML = bundleCodespaceHTML;
  window.updatePreview = updatePreview;
  window.runCodespacePreview = runCodespacePreview;
  window.runActiveFile = runActiveFile;
  window.promptCreateFile = promptCreateFile;
  window.promptCreateFolder = promptCreateFolder;
  window.renameActiveFile = renameActiveFile;
  window.deleteActiveFile = deleteActiveFile;
  window.deleteSpecificFile = deleteSpecificFile;
  window.openCodespacePopout = openCodespacePopout;
  window.exportCodespaceZip = exportCodespaceZip;
  window.handleIdeTerminalCommand = handleIdeTerminalCommand;
  window.updateStorageQuotaMeter = updateStorageQuotaMeter;

})(window);
