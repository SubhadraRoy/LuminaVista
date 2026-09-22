// modules/state.js - LuminaVista Centralized Workspace State

(function(window) {
  'use strict';

  window.REPO_API_URL = "https://api.github.com/repos/SubhadraRoy/LuminaVista/contents/EXM";

  window.repoProjects = JSON.parse(localStorage.getItem("lumina_exm_projects") || "[]");
  window.currentSelectedProject = window.repoProjects[0] || null;
  window.aiConversation = JSON.parse(localStorage.getItem("lumina_ai_history") || "[]");
  window.vaultNotes = JSON.parse(localStorage.getItem("lumina_godx_multi_notes") || JSON.stringify([
    { id: "note_1", title: "Workspace Checklist", content: "# LuminaVista Cloud Workspace\n- [x] Initialized virtual disk\n- [ ] Deploy microVM functions" }
  ]));
  window.activeNoteId = window.vaultNotes[0] ? window.vaultNotes[0].id : "note_1";
  window.isMarkdownPreviewActive = false;
  window.termHistory = [];
  window.termHistoryIdx = -1;

  // Virtual File System (VFS)
  window.vfs = JSON.parse(localStorage.getItem("lumina_codespace_vfs") || JSON.stringify({
    "index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <div class=\"card\">\n    <h1>ai-llm Sovereign Codespace</h1>\n    <p>AI creates, edits, and executes files live in this workspace.</p>\n    <button id=\"btnAction\">Run Trigger</button>\n  </div>\n  <script src=\"script.js\"><\/script>\n</body>\n</html>",
    "style.css": "body { margin: 0; padding: 40px; background: #0b0f19; color: #fff; font-family: sans-serif; display: flex; justify-content: center; }\n.card { background: #111827; padding: 30px; border-radius: 16px; border: 1px solid #1f2937; text-align: center; }\nh1 { color: #00f2fe; margin-top: 0; }\nbutton { background: #00f2fe; color: #000; border: 0; padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; }",
    "script.js": "document.getElementById('btnAction').addEventListener('click', () => {\n  alert('Artifact logic functioning in real-time!');\n});"
  }));

  // Codespace & Artifact Tab State
  window.codespaceOpenTabs = JSON.parse(localStorage.getItem("lumina_open_tabs") || '["index.html"]');
  window.csActiveFile = window.codespaceOpenTabs.includes("index.html") ? "index.html" : (window.codespaceOpenTabs[0] || "");
  window.isCodespaceOpen = false;
  window.csViewMode = "preview";

  // Whiteboard Canvas State
  window.isDrawing = false;
  window.wbTool = 'pen';
  window.wbColor = '#00f2fe';
  window.wbSize = 3;
  window.wbStartX = 0;
  window.wbStartY = 0;
  window.wbUndoStack = [];
  window.wbRedoStack = [];
  window.wbShowGrid = true;

  // Compiler State
  window.currentSbLang = "python";

  // Sidebar State
  window.isSidebarMinimized = false;
  window.lastSidebarWidth = 250;

})(window);
