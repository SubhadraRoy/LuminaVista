// modules/whiteboard.js - Whiteboard Pro Persistent Canvas Engine

(function(window) {
  'use strict';

  function initWhiteboard() {
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    
    resizeWhiteboard();
    loadWbState();
    
    const wrap = document.getElementById("whiteboardContainer");
    if (wrap && window.ResizeObserver) {
      const observer = new ResizeObserver(() => { resizeWhiteboard(); });
      observer.observe(wrap);
    }
    window.addEventListener("resize", resizeWhiteboard);

    cv.addEventListener("mousedown", startWbDrawing);
    cv.addEventListener("mousemove", drawWb);
    cv.addEventListener("mouseup", stopWbDrawing);
    cv.addEventListener("mouseleave", stopWbDrawing);
  }

  function loadWbState() {
    const saved = localStorage.getItem("lumina_wb_state");
    if (!saved || saved === "data:,") return;
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const img = new Image();
    img.src = saved;
    img.onload = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0);
    };
  }

  function saveWbState() {
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    const data = cv.toDataURL("image/png");
    if (!window.wbUndoStack) window.wbUndoStack = [];
    window.wbUndoStack.push(data);
    if (window.wbUndoStack.length > 25) window.wbUndoStack.shift();
    window.wbRedoStack = [];
    localStorage.setItem("lumina_wb_state", data);
  }

  function resizeWhiteboard() {
    const cv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!cv || !wrap || wrap.clientWidth === 0) return;
    
    const savedData = localStorage.getItem("lumina_wb_state");
    cv.width = wrap.clientWidth;
    cv.height = wrap.clientHeight;
    
    if (savedData && savedData !== "data:,") {
      const img = new Image();
      img.src = savedData;
      img.onload = () => {
        const ctx = cv.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0);
      };
    }
  }

  function startWbDrawing(e) {
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    saveWbState();

    window.isDrawing = true;
    const rect = cv.getBoundingClientRect();
    window.wbStartX = e.clientX - rect.left;
    window.wbStartY = e.clientY - rect.top;

    if (window.wbTool === "text") {
      const text = prompt("Enter text label:");
      if (text) {
        ctx.fillStyle = window.wbColor || '#00f2fe';
        ctx.font = `${Math.max(14, (window.wbSize || 3) * 4)}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillText(text, window.wbStartX, window.wbStartY);
        localStorage.setItem("lumina_wb_state", cv.toDataURL("image/png"));
      }
      window.isDrawing = false;
      return;
    }

    if (window.wbTool === "pen" || window.wbTool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(window.wbStartX, window.wbStartY);
    }
  }

  function drawWb(e) {
    if (!window.isDrawing) return;
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const rect = cv.getBoundingClientRect();

    ctx.lineWidth = window.wbSize || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (window.wbTool === "pen") {
      ctx.strokeStyle = window.wbColor || '#00f2fe';
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    } else if (window.wbTool === "eraser") {
      ctx.strokeStyle = "#030712";
      ctx.lineWidth = (window.wbSize || 3) * 4;
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  }

  function stopWbDrawing(e) {
    if (!window.isDrawing) return;
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    const ctx = cv.getContext("2d");
    window.isDrawing = false;

    ctx.lineWidth = window.wbSize || 3;
    ctx.strokeStyle = window.wbColor || '#00f2fe';

    const rect = cv.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;

    if (window.wbTool === "line") {
      ctx.beginPath();
      ctx.moveTo(window.wbStartX, window.wbStartY);
      ctx.lineTo(curX, curY);
      ctx.stroke();
    } else if (window.wbTool === "rect") {
      ctx.strokeRect(Math.min(window.wbStartX, curX), Math.min(window.wbStartY, curY), Math.abs(curX - window.wbStartX), Math.abs(curY - window.wbStartY));
    } else if (window.wbTool === "circle") {
      const radius = Math.hypot(curX - window.wbStartX, curY - window.wbStartY);
      ctx.beginPath();
      ctx.arc(window.wbStartX, window.wbStartY, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (window.wbTool === "arrow") {
      drawWbArrow(ctx, window.wbStartX, window.wbStartY, curX, curY);
    }
    
    localStorage.setItem("lumina_wb_state", cv.toDataURL("image/png"));
  }

  function drawWbArrow(ctx, fromx, fromy, tox, toy) {
    const headlen = Math.max(10, (window.wbSize || 3) * 3);
    const angle = Math.atan2(toy - fromy, tox - fromx);
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function setWbTool(tool) {
    window.wbTool = tool;
    ["wbToolPen", "wbToolLine", "wbToolArrow", "wbToolRect", "wbToolCircle", "wbToolText", "wbToolEraser"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = "p-2 rounded-lg text-zinc-400 hover:text-white cursor-pointer";
    });
    const activeBtnMap = {
      'pen': 'wbToolPen', 'line': 'wbToolLine', 'arrow': 'wbToolArrow',
      'rect': 'wbToolRect', 'circle': 'wbToolCircle', 'text': 'wbToolText',
      'eraser': 'wbToolEraser'
    };
    const activeEl = document.getElementById(activeBtnMap[tool]);
    if (activeEl) activeEl.className = "p-2 rounded-lg bg-cyan-500 text-black cursor-pointer";
  }

  function updateWbColor(val) { window.wbColor = val; }
  function updateWbSize(val) {
    window.wbSize = parseInt(val, 10);
    const lbl = document.getElementById("wbSizeLabel");
    if (lbl) lbl.textContent = val + "px";
  }

  function undoWhiteboard() {
    if (!window.wbUndoStack || window.wbUndoStack.length === 0) return;
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    if (!window.wbRedoStack) window.wbRedoStack = [];
    window.wbRedoStack.push(cv.toDataURL("image/png"));
    const last = window.wbUndoStack.pop();
    const img = new Image();
    img.src = last;
    img.onload = () => {
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0);
      localStorage.setItem("lumina_wb_state", last);
    };
  }

  function redoWhiteboard() {
    if (!window.wbRedoStack || window.wbRedoStack.length === 0) return;
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    if (!window.wbUndoStack) window.wbUndoStack = [];
    window.wbUndoStack.push(cv.toDataURL("image/png"));
    const next = window.wbRedoStack.pop();
    const img = new Image();
    img.src = next;
    img.onload = () => {
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0);
      localStorage.setItem("lumina_wb_state", next);
    };
  }

  function toggleWhiteboardGrid() {
    window.wbShowGrid = !window.wbShowGrid;
    const wrap = document.getElementById("whiteboardContainer");
    const btn = document.getElementById("btnWbGrid");
    if (window.wbShowGrid) {
      if (wrap) wrap.classList.add("bg-dot-pattern");
      if (btn) btn.textContent = "Grid: On";
    } else {
      if (wrap) wrap.classList.remove("bg-dot-pattern");
      if (btn) btn.textContent = "Grid: Off";
    }
  }

  function clearWhiteboard() {
    saveWbState();
    const cv = document.getElementById("whiteboardCanvas");
    if (cv) {
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      localStorage.removeItem("lumina_wb_state");
    }
  }

  function downloadWhiteboard() {
    const cv = document.getElementById("whiteboardCanvas");
    if (!cv) return;
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `whiteboard_${Date.now()}.png`;
    a.click();
  }

  // Export to window
  window.initWhiteboard = initWhiteboard;
  window.loadWbState = loadWbState;
  window.saveWbState = saveWbState;
  window.resizeWhiteboard = resizeWhiteboard;
  window.startWbDrawing = startWbDrawing;
  window.drawWb = drawWb;
  window.stopWbDrawing = stopWbDrawing;
  window.drawWbArrow = drawWbArrow;
  window.setWbTool = setWbTool;
  window.updateWbColor = updateWbColor;
  window.updateWbSize = updateWbSize;
  window.undoWhiteboard = undoWhiteboard;
  window.redoWhiteboard = redoWhiteboard;
  window.toggleWhiteboardGrid = toggleWhiteboardGrid;
  window.clearWhiteboard = clearWhiteboard;
  window.downloadWhiteboard = downloadWhiteboard;

})(window);
