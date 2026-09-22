// modules/notes.js - Notes Vault Pro Multi-Document Markdown Editor

(function(window) {
  'use strict';

  function handleNoteUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      const content = evt.target.result;
      const id = "note_" + Date.now();
      const title = file.name.replace(/\.[^/.]+$/, "").substring(0, 20);
      if (!window.vaultNotes) window.vaultNotes = [];
      window.vaultNotes.push({ id, title, content });
      window.activeNoteId = id;
      localStorage.setItem("lumina_godx_multi_notes", JSON.stringify(window.vaultNotes));
      renderNoteTabs();
      loadActiveNoteContent();
      if (window.showToast) window.showToast("Import Successful", `Loaded ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = "";
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
    const wEl = document.getElementById("noteWordCount");
    const cEl = document.getElementById("noteCharCount");
    if (wEl) wEl.textContent = `${words} words`;
    if (cEl) cEl.textContent = `${chars} chars`;
  }

  function renderNoteTabs() {
    const c = document.getElementById("noteTabsContainer");
    if (!c) return;
    c.innerHTML = "";
    const notes = window.vaultNotes || [];
    notes.forEach(n => {
      const b = document.createElement("button");
      b.className = `px-3 py-1.5 rounded-lg border text-xs cursor-pointer font-bold transition-colors shrink-0 whitespace-nowrap ${n.id === window.activeNoteId ? 'bg-sky-500 text-black border-sky-500' : 'bg-surface-900 border-white/10 text-zinc-400 hover:text-white'}`;
      b.textContent = n.title;
      b.onclick = () => selectNote(n.id);
      c.appendChild(b);
    });
  }

  function selectNote(id) {
    window.activeNoteId = id;
    renderNoteTabs();
    loadActiveNoteContent();
    updateNoteStats();
  }

  function loadActiveNoteContent() {
    const notes = window.vaultNotes || [];
    const n = notes.find(x => x.id === window.activeNoteId);
    const area = document.getElementById("adminScratchpad");
    if (n && area) area.value = n.content;
    updateNoteStats();
  }

  function onNoteContentChange() {
    const notes = window.vaultNotes || [];
    const n = notes.find(x => x.id === window.activeNoteId);
    const area = document.getElementById("adminScratchpad");
    if (n && area) {
      n.content = area.value;
      localStorage.setItem("lumina_godx_multi_notes", JSON.stringify(notes));
      if (window.isMarkdownPreviewActive) toggleMarkdownPreview(true);
      updateNoteStats();
    }
  }

  function createNewNote() {
    const id = "note_" + Date.now();
    if (!window.vaultNotes) window.vaultNotes = [];
    window.vaultNotes.push({ id, title: `Doc ${window.vaultNotes.length + 1}`, content: "# New Document\n" });
    window.activeNoteId = id;
    localStorage.setItem("lumina_godx_multi_notes", JSON.stringify(window.vaultNotes));
    renderNoteTabs();
    loadActiveNoteContent();
  }

  function downloadNoteFile() {
    const notes = window.vaultNotes || [];
    const n = notes.find(x => x.id === window.activeNoteId);
    if (!n) return;
    const blob = new Blob([n.content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${n.title.toLowerCase().replace(/\s+/g, '_')}.md`;
    a.click();
  }

  function toggleMarkdownPreview(force = null) {
    if (typeof force === 'boolean') {
      window.isMarkdownPreviewActive = force;
    } else {
      window.isMarkdownPreviewActive = !window.isMarkdownPreviewActive;
    }
    
    const ed = document.getElementById("adminScratchpad");
    const pv = document.getElementById("notePreviewCol");
    if (!ed || !pv) return;
    
    if (window.isMarkdownPreviewActive) {
      ed.classList.add("hidden");
      pv.classList.remove("hidden");
      const raw = ed.value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      pv.innerHTML = raw
        .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-cyan-300 mt-2">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-white mt-3">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-lg font-extrabold text-cyan-400 mt-3">$1</h1>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong class="text-white font-bold">$1</strong>')
        .replace(/- \[ \] (.*$)/gim, '<div class="flex items-center gap-1.5"><input type="checkbox" disabled class="accent-cyan-400"/><span>$1</span></div>')
        .replace(/- \[x\] (.*$)/gim, '<div class="flex items-center gap-1.5"><input type="checkbox" checked disabled class="accent-cyan-400"/><span class="line-through text-zinc-500">$1</span></div>')
        .replace(/\n/gim, '<br/>');
    } else {
      ed.classList.remove("hidden");
      pv.classList.add("hidden");
    }
  }

  // Export to window
  window.handleNoteUpload = handleNoteUpload;
  window.insertMd = insertMd;
  window.updateNoteStats = updateNoteStats;
  window.renderNoteTabs = renderNoteTabs;
  window.selectNote = selectNote;
  window.loadActiveNoteContent = loadActiveNoteContent;
  window.onNoteContentChange = onNoteContentChange;
  window.createNewNote = createNewNote;
  window.downloadNoteFile = downloadNoteFile;
  window.toggleMarkdownPreview = toggleMarkdownPreview;

})(window);
