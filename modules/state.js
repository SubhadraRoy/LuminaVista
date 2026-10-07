// modules/state.js - LuminaVista Centralized Workspace State

(function(window) {
  'use strict';

  // 1. Client-Side Authentication Guard for GitHub Pages & Static Mirrors
  if (window.location && window.location.hostname && window.location.hostname.endsWith('github.io')) {
    let sid = null;
    try { sid = localStorage.getItem('lumina_session_id'); } catch (e) {}
    if (!sid) {
      window.location.replace('index.html');
      return;
    }
  }

  // 2. Dual-Origin API Interceptor (Resolves /api/* to Vercel when running on GitHub Pages + Auto-Injects x-session-id)
  const isGhPages = Boolean(window.location?.hostname?.endsWith('github.io'));
  const vercelApiOrigin = 'https://lumina-vista-sigma.vercel.app';
  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function(input, init = {}) {
      let url = input;
      let headers = init.headers || {};
      let sid = null;
      try { sid = window.localStorage?.getItem('lumina_session_id'); } catch (e) {}

      if (typeof url === 'string' && url.startsWith('/api/')) {
        if (isGhPages) {
          url = vercelApiOrigin + url;
        }
        if (sid) {
          if (typeof Headers !== 'undefined' && headers instanceof Headers) {
            if (!headers.has('x-session-id')) headers.set('x-session-id', sid);
          } else if (Array.isArray(headers)) {
            if (!headers.some(([k]) => k.toLowerCase() === 'x-session-id')) headers.push(['x-session-id', sid]);
          } else if (typeof headers === 'object') {
            if (!headers['x-session-id'] && !headers['X-Session-Id']) headers = { ...headers, 'x-session-id': sid };
          }
        }
      }

      return nativeFetch(url, { ...init, headers });
    };
  }

  window.REPO_API_URL = "";

  const DEFAULT_EXM_PROJECTS = [
    { name: "404 Page Not Found", path: "EXM/404 Page Not Found/", type: "dir" },
    { name: "BackGrounds For Login Page", path: "EXM/BackGrounds For Login Page/", type: "dir" },
    { name: "Book portfolio website", path: "EXM/Book portfolio website/", type: "dir" },
    { name: "Car Slider Animation", path: "EXM/Car Slider Animation/", type: "dir" },
    { name: "Customized Cursor CSS", path: "EXM/Customized Cursor CSS/", type: "dir" },
    { name: "Dragon Cursor Animation", path: "EXM/Dragon Cursor Animation/", type: "dir" },
    { name: "Flower Animation", path: "EXM/Flower Animation/", type: "dir" },
    { name: "Glassmorphism Login Form", path: "EXM/Glassmorphism Login Form/", type: "dir" },
    { name: "Heart Animation", path: "EXM/Heart Animation/", type: "dir" },
    { name: "Heart Partical Animation", path: "EXM/Heart Partical Animation/", type: "dir" },
    { name: "Impossible LightBulb", path: "EXM/Impossible LightBulb/", type: "dir" },
    { name: "Interactive Flower Animation", path: "EXM/Interactive Flower Animation/", type: "dir" },
    { name: "Interactive Galaxy", path: "EXM/Interactive Galaxy/", type: "dir" },
    { name: "Interactive Reptile Cursor", path: "EXM/Interactive Reptile Cursor/", type: "dir" },
    { name: "Interactive Spider Clock", path: "EXM/Interactive Spider Clock/", type: "dir" },
    { name: "Liquid Glass Effect CSS", path: "EXM/Liquid Glass Effect CSS/", type: "dir" },
    { name: "Login Page Backgrounds", path: "EXM/Login Page Backgrounds/", type: "dir" },
    { name: "Quantum Neural Network", path: "EXM/Quantum Neural Network/", type: "dir" },
    { name: "Tubes Cursor Animation", path: "EXM/Tubes Cursor Animation/", type: "dir" }
  ];

  let savedProjects = [];
  try {
    savedProjects = JSON.parse(localStorage.getItem("lumina_exm_projects") || "[]");
  } catch (e) {
    savedProjects = [];
  }
  window.DEFAULT_EXM_PROJECTS = DEFAULT_EXM_PROJECTS;
  window.repoProjects = (savedProjects && savedProjects.length > 0) ? savedProjects : [...DEFAULT_EXM_PROJECTS];
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
