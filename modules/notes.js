// modules/notes.js - Notes Vault Pro Multi-Document Markdown Studio

(function(window) {
  'use strict';

  // State
  window.vaultNotes = [];
  window.activeNoteId = null;
  window.noteViewMode = localStorage.getItem("lumina_note_view_mode") || "split";

  function initNotes() {
    loadNotesFromStorage();
    setNoteViewMode(window.noteViewMode, false);
    renderNoteTabs();
    loadActiveNoteContent();
    updateNoteStats();

    // Keyboard shortcuts in scratchpad
    const area = document.getElementById("adminScratchpad");
    if (area) {
      area.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          insertMd('**', '**');
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          insertMd('*', '*');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          insertMd('  ');
        }
      });
    }
  }

  function loadNotesFromStorage() {
    try {
      const saved = localStorage.getItem("lumina_godx_multi_notes");
      if (saved) {
        window.vaultNotes = JSON.parse(saved);
      }
    } catch (e) {
      window.vaultNotes = [];
    }

    if (!Array.isArray(window.vaultNotes) || window.vaultNotes.length === 0) {
      window.vaultNotes = [
        {
          id: "note_welcome",
          title: "Quick Start Guide",
          content: `# LuminaVista Notes Vault Pro\n\nWelcome to your sovereign Markdown editor with real-time GitHub-flavored rendering, interactive task lists, and instant compilation.\n\n### Interactive Task Playbook\n- [x] High-performance vector whiteboard integration\n- [x] Dual-canvas shape drag preview\n- [ ] Deploy autonomous AI Agent in MicroVM\n- [ ] Export production bundle to edge\n\n### Architecture Code Sample\n\`\`\`javascript\n// LuminaVista MicroVM Runtime Bootstrapper\nasync function bootMicroVM(config) {\n  console.log("Spinning up E2B Firecracker sandbox...");\n  return { status: "ONLINE", region: "Asia-South (Mumbai)", latency: "2ms" };\n}\n\`\`\`\n\n### Metric Comparisons\n| Metric | Old VFS | Sovereign VFS |\n|---|---|---|\n| Latency | 45ms | 0.24ms |\n| Architecture | Monolith | Decomposed Modules |\n| Autonomous Loop | Single-shot | Multi-step Antigravity |\n\n> Note: Any changes made in the editor automatically sync with localStorage and trigger real-time preview updates.\n`
        },
        {
          id: "note_arch",
          title: "MicroVM Playbook",
          content: `# MicroVM Playbook & Safety Rules\n\n1. **Root Isolation**: All operations execute inside lightweight Firecracker microVMs.\n2. **Non-Blocking Daemons**: Run daemons in background with PID tracking.\n3. **Indian Standard Time**: Timestamps synced to Asia/Kolkata (IST).\n`
        }
      ];
      localStorage.setItem("lumina_godx_multi_notes", JSON.stringify(window.vaultNotes));
    }

    const savedActive = localStorage.getItem("lumina_active_note_id");
    if (savedActive && window.vaultNotes.some(n => n.id === savedActive)) {
      window.activeNoteId = savedActive;
    } else {
      window.activeNoteId = window.vaultNotes[0].id;
    }
  }

  function saveNotesToStorage() {
    localStorage.setItem("lumina_godx_multi_notes", JSON.stringify(window.vaultNotes));
    localStorage.setItem("lumina_active_note_id", window.activeNoteId);
  }

  function renderNoteTabs() {
    const c = document.getElementById("noteTabsContainer");
    if (!c) return;
    c.innerHTML = "";

    window.vaultNotes.forEach(n => {
      const isActive = n.id === window.activeNoteId;
      const tab = document.createElement("div");
      tab.className = `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
        isActive
          ? 'bg-sky-500 text-black border-sky-500 shadow-md shadow-sky-500/20'
          : 'bg-surface-900 border-white/10 text-zinc-400 hover:text-white hover:bg-surface-850'
      }`;

      const titleSpan = document.createElement("span");
      titleSpan.textContent = n.title;
      titleSpan.onclick = () => selectNote(n.id);
      tab.appendChild(titleSpan);

      if (window.vaultNotes.length > 1) {
        const closeBtn = document.createElement("button");
        closeBtn.className = `ml-1 p-0.5 rounded hover:bg-black/20 ${isActive ? 'text-black/70 hover:text-black' : 'text-zinc-500 hover:text-rose-400'} cursor-pointer`;
        closeBtn.innerHTML = "&times;";
        closeBtn.title = "Delete Note";
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          deleteNoteById(n.id);
        };
        tab.appendChild(closeBtn);
      }

      c.appendChild(tab);
    });
  }

  function selectNote(id) {
    window.activeNoteId = id;
    saveNotesToStorage();
    renderNoteTabs();
    loadActiveNoteContent();
    updateNoteStats();
    renderMarkdownPreview();
  }

  function loadActiveNoteContent() {
    const note = window.vaultNotes.find(x => x.id === window.activeNoteId);
    const area = document.getElementById("adminScratchpad");
    if (note && area) {
      area.value = note.content || "";
    }
    renderMarkdownPreview();
  }

  function onNoteContentChange() {
    const note = window.vaultNotes.find(x => x.id === window.activeNoteId);
    const area = document.getElementById("adminScratchpad");
    if (note && area) {
      note.content = area.value;
      saveNotesToStorage();
      updateNoteStats();
      renderMarkdownPreview();
    }
  }

  function createNewNote() {
    const id = "note_" + Date.now();
    const count = window.vaultNotes.length + 1;
    const newNote = {
      id,
      title: `Doc ${count}`,
      content: `# Untitled Note\n\nStart writing here in Markdown...\n`
    };
    window.vaultNotes.push(newNote);
    window.activeNoteId = id;
    saveNotesToStorage();
    renderNoteTabs();
    loadActiveNoteContent();
    updateNoteStats();

    const area = document.getElementById("adminScratchpad");
    if (area) area.focus();

    if (window.showToast) window.showToast("Note Created", `Created "${newNote.title}"`);
  }

  function renameCurrentNote() {
    const note = window.vaultNotes.find(x => x.id === window.activeNoteId);
    if (!note) return;
    const newTitle = prompt("Enter new title for note:", note.title);
    if (newTitle && newTitle.trim()) {
      note.title = newTitle.trim().substring(0, 30);
      saveNotesToStorage();
      renderNoteTabs();
      if (window.showToast) window.showToast("Renamed", `Note renamed to "${note.title}"`);
    }
  }

  function deleteCurrentNote() {
    if (!window.activeNoteId) return;
    deleteNoteById(window.activeNoteId);
  }

  function deleteNoteById(id) {
    if (window.vaultNotes.length <= 1) {
      alert("At least one note must be kept in the vault.");
      return;
    }
    const target = window.vaultNotes.find(n => n.id === id);
    if (!confirm(`Are you sure you want to delete "${target ? target.title : 'this note'}"?`)) return;

    window.vaultNotes = window.vaultNotes.filter(n => n.id !== id);
    if (window.activeNoteId === id) {
      window.activeNoteId = window.vaultNotes[0].id;
    }
    saveNotesToStorage();
    renderNoteTabs();
    loadActiveNoteContent();
    updateNoteStats();
    if (window.showToast) window.showToast("Note Deleted", "Removed from vault.");
  }

  function handleNoteUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const content = evt.target.result;
      const id = "note_" + Date.now();
      const title = file.name.replace(/\.[^/.]+$/, "").substring(0, 25);
      window.vaultNotes.push({ id, title, content });
      window.activeNoteId = id;
      saveNotesToStorage();
      renderNoteTabs();
      loadActiveNoteContent();
      updateNoteStats();
      if (window.showToast) window.showToast("Import Successful", `Imported "${file.name}"`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function downloadNoteFile() {
    const note = window.vaultNotes.find(x => x.id === window.activeNoteId);
    if (!note) return;
    const blob = new Blob([note.content], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title.toLowerCase().replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    if (window.showToast) window.showToast("Export Downloaded", `Saved ${a.download}`);
  }

  function insertMd(prefix, suffix = "") {
    const area = document.getElementById("adminScratchpad");
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = area.value.substring(start, end);
    const replacement = prefix + selected + suffix;

    area.value = area.value.substring(0, start) + replacement + area.value.substring(end);
    area.focus();
    area.selectionStart = start + prefix.length;
    area.selectionEnd = start + prefix.length + selected.length;
    onNoteContentChange();
  }

  function updateNoteStats() {
    const area = document.getElementById("adminScratchpad");
    if (!area) return;
    const text = area.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const readMin = Math.max(1, Math.ceil(words / 200));

    const wEl = document.getElementById("noteWordCount");
    const cEl = document.getElementById("noteCharCount");
    const rEl = document.getElementById("noteReadTime");

    if (wEl) wEl.textContent = `${words} words`;
    if (cEl) cEl.textContent = `${chars} chars`;
    if (rEl) rEl.textContent = `${readMin} min read`;
  }

  // View Mode: 'split' | 'editor' | 'preview'
  function setNoteViewMode(mode, save = true) {
    window.noteViewMode = mode;
    if (save) localStorage.setItem("lumina_note_view_mode", mode);

    const btnSplit = document.getElementById("btnNoteViewSplit");
    const btnEditor = document.getElementById("btnNoteViewEditor");
    const btnPreview = document.getElementById("btnNoteViewPreview");

    const grid = document.getElementById("noteLayoutGrid");
    const ed = document.getElementById("adminScratchpad");
    const pv = document.getElementById("notePreviewCol");

    const btnActiveStyle = "px-2.5 py-1 rounded bg-sky-500 text-black font-bold cursor-pointer transition-colors";
    const btnInactiveStyle = "px-2.5 py-1 rounded text-zinc-400 hover:text-white cursor-pointer transition-colors";

    if (btnSplit) btnSplit.className = mode === 'split' ? btnActiveStyle : btnInactiveStyle;
    if (btnEditor) btnEditor.className = mode === 'editor' ? btnActiveStyle : btnInactiveStyle;
    if (btnPreview) btnPreview.className = mode === 'preview' ? btnActiveStyle : btnInactiveStyle;

    if (!grid || !ed || !pv) return;

    if (mode === 'split') {
      grid.className = "grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0";
      ed.classList.remove("hidden");
      pv.classList.remove("hidden");
    } else if (mode === 'editor') {
      grid.className = "grid grid-cols-1 gap-4 flex-1 min-h-0";
      ed.classList.remove("hidden");
      pv.classList.add("hidden");
    } else if (mode === 'preview') {
      grid.className = "grid grid-cols-1 gap-4 flex-1 min-h-0";
      ed.classList.add("hidden");
      pv.classList.remove("hidden");
    }

    renderMarkdownPreview();
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderMarkdownPreview() {
    const pv = document.getElementById("notePreviewCol");
    const area = document.getElementById("adminScratchpad");
    if (!pv || !area) return;

    const raw = area.value || "";
    if (!raw.trim()) {
      pv.innerHTML = `<div class="text-zinc-500 italic p-4">Nothing to preview. Type something in the editor...</div>`;
      return;
    }

    // 1. Extract fenced code blocks first
    const codeBlocks = [];
    let text = raw.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      codeBlocks.push({ lang: lang || "text", code });
      return `__MD_CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 2. Escape raw prose HTML safely FIRST before inserting our own HTML tags!
    const parts = text.split(/(__MD_CODE_BLOCK_\d+__)/);
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('__MD_CODE_BLOCK_')) {
        parts[i] = escapeHtml(parts[i]);
      }
    }
    text = parts.join('');

    // 3. Extract and format markdown tables
    text = text.replace(/(?:^\|.+?\|(?:\r?\n|$))+/gm, (match) => {
      const rows = match.trim().split(/\r?\n/);
      if (rows.length < 2) return match;
      let tableHtml = '<div class="overflow-x-auto my-3 shadow-lg rounded-xl border border-white/10"><table class="w-full text-left border-collapse text-xs">';
      rows.forEach((row, rIdx) => {
        if (row.includes('---')) return; // Header separator line
        const cells = row.split('|').filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
        tableHtml += '<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">';
        cells.forEach(cell => {
          const isHeader = rIdx === 0;
          const tag = isHeader ? 'th' : 'td';
          const cls = isHeader
            ? 'p-2.5 bg-sky-500/10 text-sky-300 font-bold tracking-wider uppercase text-[11px]'
            : 'p-2.5 text-zinc-300';
          tableHtml += `<${tag} class="${cls}">${cell.trim()}</${tag}>`;
        });
        tableHtml += '</tr>';
      });
      return tableHtml + '</table></div>\n';
    });

    // 4. Parse Interactive Task Checkboxes (- [ ] or - [x])
    let taskIndex = 0;
    text = text.replace(/^- \[([ xX])\] (.*$)/gm, (match, check, itemText) => {
      const isChecked = check.toLowerCase() === 'x';
      const idx = taskIndex++;
      return `<div class="flex items-center gap-2 my-1 p-1 rounded hover:bg-white/5 transition-colors font-sans text-xs">
        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.toggleTaskCheckboxInEditor(${idx})" class="w-4 h-4 rounded accent-sky-400 cursor-pointer" />
        <span class="${isChecked ? 'line-through text-zinc-500' : 'text-zinc-200'}">${itemText}</span>
      </div>`;
    });

    // 5. Blockquotes (handle both &gt; and >)
    text = text.replace(/^(?:&gt;|>)\s?(.*$)/gm, '<blockquote class="border-l-4 border-sky-400/80 bg-sky-500/5 px-3 py-2 rounded-r-lg my-2 text-zinc-300 italic text-xs">$1</blockquote>');

    // 6. Headings
    text = text
      .replace(/^###### (.*$)/gm, '<h6 class="text-xs font-bold text-zinc-400 mt-2 mb-1">$1</h6>')
      .replace(/^##### (.*$)/gm, '<h5 class="text-xs font-bold text-sky-400 mt-2.5 mb-1">$1</h5>')
      .replace(/^#### (.*$)/gm, '<h4 class="text-sm font-bold text-sky-300 mt-3 mb-1.5">$1</h4>')
      .replace(/^### (.*$)/gm, '<h3 class="text-base font-bold text-cyan-300 mt-3.5 mb-1.5 pb-1 border-b border-white/5">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold text-white mt-4 mb-2 pb-1 border-b border-white/10">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-xl font-extrabold text-white mt-4 mb-2.5 pb-1 border-b border-sky-500/30">$1</h1>');

    // 7. Horizontal Rules
    text = text.replace(/^---$/gm, '<hr class="border-white/10 my-4"/>');

    // 8. Bold & Italic & Inline Code & Lists
    text = text
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="font-bold text-white"><em class="italic text-sky-300">$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-zinc-300">$1</em>')
      .replace(/~~(.*?)~~/g, '<del class="line-through text-zinc-500">$1</del>')
      .replace(/`([^`]+)`/g, '<code class="bg-surface-850 text-pink-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/10">$1</code>')
      .replace(/^\s*[-*] (.*$)/gm, '<li class="ml-4 list-disc text-zinc-300 my-0.5">$1</li>')
      .replace(/^\s*(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal text-zinc-300 my-0.5">$2</li>')
      .replace(/\n/g, '<br/>');

    // 9. Re-inject Code Blocks
    codeBlocks.forEach((b, idx) => {
      const codeHtml = `
        <div class="my-3 rounded-xl overflow-hidden border border-white/10 bg-surface-900/90 shadow-xl font-mono text-xs">
          <div class="px-3.5 py-2 bg-surface-850 border-b border-white/5 flex items-center justify-between text-[11px] text-sky-300">
            <span class="font-bold uppercase tracking-wider">${escapeHtml(b.lang)}</span>
            <button onclick="navigator.clipboard.writeText(this.closest('.bg-surface-900\\/90').querySelector('code').innerText); if (window.showToast) window.showToast('Copied', 'Code snippet copied');" class="text-zinc-400 hover:text-white cursor-pointer transition-colors p-1" title="Copy Code">
              <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            </button>
          </div>
          <pre class="p-4 overflow-x-auto text-zinc-200 leading-relaxed custom-scrollbar"><code>${escapeHtml(b.code)}</code></pre>
        </div>
      `;
      text = text.replace(`__MD_CODE_BLOCK_${idx}__`, codeHtml);
    });

    pv.innerHTML = text;
  }

  // Interactive Task Checkbox Toggle directly on Editor Text!
  function toggleTaskCheckboxInEditor(targetIndex) {
    const area = document.getElementById("adminScratchpad");
    if (!area) return;
    const text = area.value;
    let currentIndex = 0;

    const newText = text.replace(/^- \[([ xX])\] (.*$)/gm, (match, check, item) => {
      if (currentIndex === targetIndex) {
        currentIndex++;
        const nextCheck = check.toLowerCase() === 'x' ? ' ' : 'x';
        return `- [${nextCheck}] ${item}`;
      }
      currentIndex++;
      return match;
    });

    area.value = newText;
    onNoteContentChange();
  }

  // Window Exports
  window.initNotes = initNotes;
  window.renderNoteTabs = renderNoteTabs;
  window.selectNote = selectNote;
  window.loadActiveNoteContent = loadActiveNoteContent;
  window.onNoteContentChange = onNoteContentChange;
  window.createNewNote = createNewNote;
  window.renameCurrentNote = renameCurrentNote;
  window.deleteCurrentNote = deleteCurrentNote;
  window.handleNoteUpload = handleNoteUpload;
  window.downloadNoteFile = downloadNoteFile;
  window.insertMd = insertMd;
  window.updateNoteStats = updateNoteStats;
  window.setNoteViewMode = setNoteViewMode;
  window.renderMarkdownPreview = renderMarkdownPreview;
  window.toggleTaskCheckboxInEditor = toggleTaskCheckboxInEditor;

})(window);
