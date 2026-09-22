// modules/codespace.js - Sovereign Artifact Codespace & Embedded Terminal

(function(window) {
  'use strict';

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function toggleCodespacePane(forceOpen = null) {
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
        // Folder
        const folderDiv = document.createElement("div");
        folderDiv.className = "mb-1";
        folderDiv.innerHTML = `<div class="flex items-center gap-1 text-zinc-400 font-bold py-1 px-1 text-[11px]"><i data-lucide="folder" class="w-3.5 h-3.5 text-cyan-400"></i><span>${key}/</span></div>`;
        const subContainer = document.createElement("div");
        subContainer.className = "pl-3 border-l border-white/5 space-y-0.5";
        
        tree[key].forEach(subFile => {
          const fullPath = `${key}/${subFile}`;
          const isActive = fullPath === window.csActiveFile;
          const item = document.createElement("button");
          item.className = `w-full px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer text-left transition-colors truncate ${isActive ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`;
          
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

  function onEditorContentChange() {
    if (window.csActiveFile && window.vfs) {
      const ed = document.getElementById("csCodeEditor");
      if (ed) {
        window.vfs[window.csActiveFile] = ed.value;
        localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
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

  // Export to window
  window.toggleCodespacePane = toggleCodespacePane;
  window.renderCodespaceFileTree = renderCodespaceFileTree;
  window.renderCodespaceFileTabs = renderCodespaceFileTabs;
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

})(window);
