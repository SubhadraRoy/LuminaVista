// modules/whiteboard.js - Whiteboard Pro Advanced Vector & Freehand Studio

(function(window) {
  'use strict';

  // State
  window.wbTool = window.wbTool || 'pen';
  window.wbColor = window.wbColor || '#00f2fe';
  window.wbSize = window.wbSize || 4;
  window.wbFill = false;
  window.wbShowGrid = true;
  window.wbUndoStack = window.wbUndoStack || [];
  window.wbRedoStack = window.wbRedoStack || [];
  window.wbStickies = [];

  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let strokePoints = [];

  function initWhiteboard() {
    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap) return;

    resizeWhiteboard();
    loadWbState();
    loadStickies();

    if (window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        resizeWhiteboard();
      });
      observer.observe(wrap);
    }
    window.addEventListener("resize", resizeWhiteboard);

    // Mouse / Pointer drawing events on main canvas
    mainCv.addEventListener("mousedown", handleWbMouseDown);
    window.addEventListener("mousemove", handleWbMouseMove);
    window.addEventListener("mouseup", handleWbMouseUp);

    // Touch events for mobile/tablet
    mainCv.addEventListener("touchstart", handleWbTouchStart, { passive: false });
    window.addEventListener("touchmove", handleWbTouchMove, { passive: false });
    window.addEventListener("touchend", handleWbTouchEnd);

    // Keyboard shortcuts (Ctrl+Z, Ctrl+Y)
    window.addEventListener("keydown", (e) => {
      const activeTab = document.getElementById("tab-whiteboard");
      if (!activeTab || activeTab.classList.contains("hidden")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoWhiteboard();
        else undoWhiteboard();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoWhiteboard();
      }
    });

    updateUndoRedoButtons();
  }

  function getCanvasDpr() {
    return window.devicePixelRatio || 1;
  }

  function resizeWhiteboard() {
    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap || wrap.clientWidth === 0 || wrap.clientHeight === 0) return;

    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const dpr = getCanvasDpr();

    // Preserve existing canvas drawing
    let savedData = null;
    if (mainCv.width > 0 && mainCv.height > 0) {
      savedData = mainCv.toDataURL("image/png");
    } else {
      savedData = localStorage.getItem("lumina_wb_state");
    }

    // Set pixel dimensions
    mainCv.width = Math.floor(w * dpr);
    mainCv.height = Math.floor(h * dpr);
    mainCv.style.width = w + "px";
    mainCv.style.height = h + "px";

    tempCv.width = Math.floor(w * dpr);
    tempCv.height = Math.floor(h * dpr);
    tempCv.style.width = w + "px";
    tempCv.style.height = h + "px";

    const mCtx = mainCv.getContext("2d");
    const tCtx = tempCv.getContext("2d");
    mCtx.scale(dpr, dpr);
    tCtx.scale(dpr, dpr);

    if (savedData && savedData !== "data:,") {
      const img = new Image();
      img.src = savedData;
      img.onload = () => {
        mCtx.drawImage(img, 0, 0, w, h);
      };
    }
  }

  function loadWbState() {
    const saved = localStorage.getItem("lumina_wb_state");
    if (!saved || saved === "data:,") return;
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !wrap) return;
    const ctx = mainCv.getContext("2d");
    const img = new Image();
    img.src = saved;
    img.onload = () => {
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
    };
  }

  function saveWbState() {
    const mainCv = document.getElementById("whiteboardCanvas");
    if (!mainCv) return;
    const data = mainCv.toDataURL("image/png");
    if (!window.wbUndoStack) window.wbUndoStack = [];
    window.wbUndoStack.push(data);
    if (window.wbUndoStack.length > 35) window.wbUndoStack.shift();
    window.wbRedoStack = [];
    localStorage.setItem("lumina_wb_state", data);
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const btnUndo = document.getElementById("btnWbUndo");
    const btnRedo = document.getElementById("btnWbRedo");
    if (btnUndo) {
      btnUndo.style.opacity = (window.wbUndoStack && window.wbUndoStack.length > 0) ? "1" : "0.4";
      btnUndo.style.pointerEvents = (window.wbUndoStack && window.wbUndoStack.length > 0) ? "auto" : "none";
    }
    if (btnRedo) {
      btnRedo.style.opacity = (window.wbRedoStack && window.wbRedoStack.length > 0) ? "1" : "0.4";
      btnRedo.style.pointerEvents = (window.wbRedoStack && window.wbRedoStack.length > 0) ? "auto" : "none";
    }
  }

  function getCanvasCoords(e, cv) {
    const rect = cv.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // --- Mouse & Touch Handlers ---

  function handleWbMouseDown(e) {
    if (e.button !== 0) return; // Only primary button
    const mainCv = document.getElementById("whiteboardCanvas");
    if (!mainCv) return;
    const coords = getCanvasCoords(e, mainCv);
    startX = coords.x;
    startY = coords.y;
    lastX = coords.x;
    lastY = coords.y;

    // Handle Sticky Note creation
    if (window.wbTool === 'sticky') {
      createStickyNote(startX, startY);
      setWbTool('select');
      return;
    }

    // Handle Text tool creation
    if (window.wbTool === 'text') {
      createInlineTextInput(startX, startY);
      return;
    }

    if (window.wbTool === 'select') {
      return;
    }

    isDrawing = true;
    strokePoints = [{ x: startX, y: startY }];

    // For pen or highlighter or eraser, start path on main canvas
    if (window.wbTool === 'pen' || window.wbTool === 'highlighter' || window.wbTool === 'eraser') {
      saveWbState();
      const ctx = mainCv.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(startX, startY);
    }
  }

  function handleWbMouseMove(e) {
    if (!isDrawing) return;
    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap) return;

    const coords = getCanvasCoords(e, mainCv);
    const curX = coords.x;
    const curY = coords.y;

    const mCtx = mainCv.getContext("2d");
    const tCtx = tempCv.getContext("2d");

    if (window.wbTool === 'pen' || window.wbTool === 'highlighter' || window.wbTool === 'eraser') {
      mCtx.save();
      mCtx.lineCap = "round";
      mCtx.lineJoin = "round";

      if (window.wbTool === 'pen') {
        mCtx.strokeStyle = window.wbColor;
        mCtx.lineWidth = window.wbSize;
        mCtx.globalAlpha = 1.0;
      } else if (window.wbTool === 'highlighter') {
        mCtx.strokeStyle = window.wbColor;
        mCtx.lineWidth = Math.max(14, window.wbSize * 3);
        mCtx.globalAlpha = 0.35;
      } else if (window.wbTool === 'eraser') {
        mCtx.strokeStyle = "#030712";
        mCtx.lineWidth = Math.max(16, window.wbSize * 4);
        mCtx.globalAlpha = 1.0;
      }

      // Smooth curve using midpoints
      strokePoints.push({ x: curX, y: curY });
      if (strokePoints.length >= 3) {
        const p1 = strokePoints[strokePoints.length - 2];
        const p2 = strokePoints[strokePoints.length - 1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        mCtx.quadraticCurveTo(p1.x, p1.y, midX, midY);
        mCtx.stroke();
      } else {
        mCtx.lineTo(curX, curY);
        mCtx.stroke();
      }
      mCtx.restore();

    } else {
      // Shape tools: Draw preview onto temp canvas
      tCtx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      drawShape(tCtx, window.wbTool, startX, startY, curX, curY, window.wbColor, window.wbSize, window.wbFill);
    }

    lastX = curX;
    lastY = curY;
  }

  function handleWbMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap) return;

    const coords = getCanvasCoords(e, mainCv);
    const curX = coords.x;
    const curY = coords.y;

    const mCtx = mainCv.getContext("2d");
    const tCtx = tempCv.getContext("2d");

    if (window.wbTool !== 'pen' && window.wbTool !== 'highlighter' && window.wbTool !== 'eraser') {
      // Clear temp canvas and commit shape onto main canvas
      tCtx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      saveWbState();
      drawShape(mCtx, window.wbTool, startX, startY, curX, curY, window.wbColor, window.wbSize, window.wbFill);
    }

    strokePoints = [];
    localStorage.setItem("lumina_wb_state", mainCv.toDataURL("image/png"));
  }

  function handleWbTouchStart(e) {
    if (e.touches.length === 1) {
      e.preventDefault();
      handleWbMouseDown(e);
    }
  }

  function handleWbTouchMove(e) {
    if (e.touches.length === 1 && isDrawing) {
      e.preventDefault();
      handleWbMouseMove(e);
    }
  }

  function handleWbTouchEnd(e) {
    handleWbMouseUp(e);
  }

  // --- Shape Drawing Core ---

  function drawShape(ctx, tool, x1, y1, x2, y2, color, size, fill) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (fill) {
      // Semi-transparent fill using same hue
      ctx.fillStyle = hexToRgba(color, 0.25);
    }

    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (tool === 'arrow') {
      drawArrow(ctx, x1, y1, x2, y2, size);
    } else if (tool === 'rect') {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      if (fill) ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (tool === 'roundedRect') {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      const radius = Math.min(16, rw / 2, rh / 2);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, radius);
      } else {
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      }
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (tool === 'circle') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawArrow(ctx, fromx, fromy, tox, toy, size) {
    const headlen = Math.max(12, size * 3.5);
    const angle = Math.atan2(toy - fromy, tox - fromx);

    // Main line shaft
    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    // Arrowhead wings
    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // --- Inline Text Label ---

  function createInlineTextInput(x, y) {
    const wrap = document.getElementById("whiteboardContainer");
    if (!wrap) return;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Type label & press Enter...";
    input.className = "absolute z-30 px-2 py-1 bg-surface-900/90 text-white rounded-lg border border-cyan-400 font-sans outline-none shadow-2xl text-sm";
    input.style.left = Math.min(x, wrap.clientWidth - 200) + "px";
    input.style.top = Math.min(y, wrap.clientHeight - 40) + "px";
    input.style.color = window.wbColor;

    wrap.appendChild(input);
    input.focus();

    function commitText() {
      const val = input.value.trim();
      if (val) {
        saveWbState();
        const mainCv = document.getElementById("whiteboardCanvas");
        if (mainCv) {
          const ctx = mainCv.getContext("2d");
          ctx.save();
          ctx.fillStyle = window.wbColor;
          ctx.font = `bold ${Math.max(14, window.wbSize * 4)}px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillText(val, x, y + 16);
          ctx.restore();
          localStorage.setItem("lumina_wb_state", mainCv.toDataURL("image/png"));
        }
      }
      input.remove();
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitText();
      } else if (e.key === "Escape") {
        input.remove();
      }
    });

    input.addEventListener("blur", () => {
      commitText();
    });
  }

  // --- Interactive Sticky Notes Layer ---

  function createStickyNote(x, y, text = "", color = "#fef08a") {
    const container = document.getElementById("whiteboardStickyContainer");
    if (!container) return;

    const id = "sticky_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const sticky = { id, x, y, text, color };
    window.wbStickies.push(sticky);
    saveStickies();

    renderStickyNoteDom(sticky);
  }

  function renderStickyNoteDom(sticky) {
    const container = document.getElementById("whiteboardStickyContainer");
    if (!container) return;

    const el = document.createElement("div");
    el.id = sticky.id;
    el.className = "pointer-events-auto absolute w-48 rounded-xl shadow-2xl p-3 flex flex-col gap-2 border border-black/10 select-none transition-shadow hover:shadow-[0_10px_25px_rgba(0,0,0,0.5)]";
    el.style.left = sticky.x + "px";
    el.style.top = sticky.y + "px";
    el.style.backgroundColor = sticky.color;
    el.style.color = "#1e293b";

    el.innerHTML = `
      <div class="sticky-handle flex items-center justify-between cursor-move pb-1 border-b border-black/10">
        <div class="flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400 border border-black/20 cursor-pointer" onclick="changeStickyColor('${sticky.id}', '#fef08a')"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-300 border border-black/20 cursor-pointer" onclick="changeStickyColor('${sticky.id}', '#a5f3fc')"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-300 border border-black/20 cursor-pointer" onclick="changeStickyColor('${sticky.id}', '#a7f3d0')"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-rose-300 border border-black/20 cursor-pointer" onclick="changeStickyColor('${sticky.id}', '#fecdd3')"></span>
        </div>
        <button onclick="removeStickyNote('${sticky.id}')" class="text-black/50 hover:text-black text-xs font-bold p-0.5 cursor-pointer">✕</button>
      </div>
      <textarea class="w-full bg-transparent border-0 outline-none resize-none text-xs font-sans text-slate-800 leading-snug custom-scrollbar placeholder:text-slate-500" rows="4" placeholder="Type sticky note...">${sticky.text || ''}</textarea>
    `;

    // Input listener
    const ta = el.querySelector("textarea");
    ta.addEventListener("input", () => {
      sticky.text = ta.value;
      saveStickies();
    });

    // Dragging listener
    const handle = el.querySelector(".sticky-handle");
    let isDraggingSticky = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    handle.addEventListener("mousedown", (e) => {
      isDraggingSticky = true;
      dragOffsetX = e.clientX - el.offsetLeft;
      dragOffsetY = e.clientY - el.offsetTop;
      el.style.zIndex = "50";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDraggingSticky) return;
      const wrap = document.getElementById("whiteboardContainer");
      if (!wrap) return;
      let newX = e.clientX - dragOffsetX;
      let newY = e.clientY - dragOffsetY;
      newX = Math.max(0, Math.min(newX, wrap.clientWidth - 190));
      newY = Math.max(0, Math.min(newY, wrap.clientHeight - 130));
      el.style.left = newX + "px";
      el.style.top = newY + "px";
      sticky.x = newX;
      sticky.y = newY;
    });

    window.addEventListener("mouseup", () => {
      if (isDraggingSticky) {
        isDraggingSticky = false;
        el.style.zIndex = "20";
        saveStickies();
      }
    });

    container.appendChild(el);
    ta.focus();
  }

  function changeStickyColor(id, color) {
    const sticky = window.wbStickies.find(s => s.id === id);
    if (sticky) {
      sticky.color = color;
      const el = document.getElementById(id);
      if (el) el.style.backgroundColor = color;
      saveStickies();
    }
  }

  function removeStickyNote(id) {
    window.wbStickies = window.wbStickies.filter(s => s.id !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
    saveStickies();
  }

  function saveStickies() {
    localStorage.setItem("lumina_wb_stickies", JSON.stringify(window.wbStickies));
  }

  function loadStickies() {
    try {
      const data = localStorage.getItem("lumina_wb_stickies");
      if (data) {
        window.wbStickies = JSON.parse(data);
        const container = document.getElementById("whiteboardStickyContainer");
        if (container) container.innerHTML = "";
        window.wbStickies.forEach(s => renderStickyNoteDom(s));
      }
    } catch (e) {
      window.wbStickies = [];
    }
  }

  // --- Tool & Palette Controls ---

  function setWbTool(tool) {
    window.wbTool = tool;
    const toolIds = [
      'wbToolSelect', 'wbToolPen', 'wbToolHighlighter', 'wbToolLine',
      'wbToolArrow', 'wbToolRect', 'wbToolRoundedRect', 'wbToolCircle',
      'wbToolSticky', 'wbToolText', 'wbToolEraser'
    ];
    toolIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.className = "p-2 rounded-lg text-zinc-400 hover:text-white cursor-pointer transition-colors";
      }
    });

    const activeMap = {
      'select': 'wbToolSelect',
      'pen': 'wbToolPen',
      'highlighter': 'wbToolHighlighter',
      'line': 'wbToolLine',
      'arrow': 'wbToolArrow',
      'rect': 'wbToolRect',
      'roundedRect': 'wbToolRoundedRect',
      'circle': 'wbToolCircle',
      'sticky': 'wbToolSticky',
      'text': 'wbToolText',
      'eraser': 'wbToolEraser'
    };

    const activeEl = document.getElementById(activeMap[tool]);
    if (activeEl) {
      activeEl.className = "p-2 rounded-lg bg-cyan-500 text-black cursor-pointer transition-colors";
    }

    // Cursor indicator
    const mainCv = document.getElementById("whiteboardCanvas");
    if (mainCv) {
      if (tool === 'select') mainCv.style.cursor = 'default';
      else if (tool === 'text') mainCv.style.cursor = 'text';
      else mainCv.style.cursor = 'crosshair';
    }
  }

  function setWbPresetColor(hex) {
    window.wbColor = hex;
    const picker = document.getElementById("wbColorPicker");
    if (picker) picker.value = hex;
  }

  function updateWbColor(hex) {
    window.wbColor = hex;
  }

  function updateWbSize(val) {
    window.wbSize = parseInt(val, 10) || 4;
    const lbl = document.getElementById("wbSizeLabel");
    if (lbl) lbl.textContent = window.wbSize + "px";
    const slider = document.getElementById("wbSizeSlider");
    if (slider) slider.value = window.wbSize;
  }

  function toggleWbFill() {
    window.wbFill = !window.wbFill;
    const btn = document.getElementById("btnWbFill");
    if (btn) {
      if (window.wbFill) {
        btn.textContent = "Fill: On";
        btn.className = "px-2.5 py-1 rounded text-[11px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold cursor-pointer transition-colors";
      } else {
        btn.textContent = "Fill: Off";
        btn.className = "px-2.5 py-1 rounded text-[11px] font-mono text-zinc-400 hover:text-white cursor-pointer transition-colors";
      }
    }
  }

  function undoWhiteboard() {
    if (!window.wbUndoStack || window.wbUndoStack.length === 0) return;
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !wrap) return;

    if (!window.wbRedoStack) window.wbRedoStack = [];
    window.wbRedoStack.push(mainCv.toDataURL("image/png"));

    const last = window.wbUndoStack.pop();
    const img = new Image();
    img.src = last;
    img.onload = () => {
      const ctx = mainCv.getContext("2d");
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
      localStorage.setItem("lumina_wb_state", last);
    };
    updateUndoRedoButtons();
  }

  function redoWhiteboard() {
    if (!window.wbRedoStack || window.wbRedoStack.length === 0) return;
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !wrap) return;

    if (!window.wbUndoStack) window.wbUndoStack = [];
    window.wbUndoStack.push(mainCv.toDataURL("image/png"));

    const next = window.wbRedoStack.pop();
    const img = new Image();
    img.src = next;
    img.onload = () => {
      const ctx = mainCv.getContext("2d");
      ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
      localStorage.setItem("lumina_wb_state", next);
    };
    updateUndoRedoButtons();
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
    if (!confirm("Are you sure you want to clear the entire whiteboard?")) return;
    saveWbState();
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (mainCv && wrap) {
      mainCv.getContext("2d").clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      localStorage.removeItem("lumina_wb_state");
    }
    window.wbStickies = [];
    saveStickies();
    const stickyContainer = document.getElementById("whiteboardStickyContainer");
    if (stickyContainer) stickyContainer.innerHTML = "";
    if (window.showToast) window.showToast("Whiteboard Cleared", "Canvas reset to blank.");
  }

  function downloadWhiteboard() {
    const mainCv = document.getElementById("whiteboardCanvas");
    if (!mainCv) return;
    const a = document.createElement("a");
    a.href = mainCv.toDataURL("image/png");
    a.download = `whiteboard_pro_${Date.now()}.png`;
    a.click();
    if (window.showToast) window.showToast("Export Complete", "Whiteboard image downloaded.");
  }

  function copyWhiteboardImage() {
    const mainCv = document.getElementById("whiteboardCanvas");
    if (!mainCv) return;
    mainCv.toBlob((blob) => {
      if (!blob) return;
      try {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
          if (window.showToast) window.showToast("Clipboard Ready", "Whiteboard copied as PNG image.");
        }).catch(() => {
          if (window.showToast) window.showToast("Notice", "Clipboard image copy requires active HTTPS context.");
        });
      } catch (err) {
        if (window.showToast) window.showToast("Notice", "Clipboard image API not supported on this browser.");
      }
    });
  }

  // Window Exports
  window.initWhiteboard = initWhiteboard;
  window.resizeWhiteboard = resizeWhiteboard;
  window.loadWbState = loadWbState;
  window.saveWbState = saveWbState;
  window.setWbTool = setWbTool;
  window.setWbPresetColor = setWbPresetColor;
  window.updateWbColor = updateWbColor;
  window.updateWbSize = updateWbSize;
  window.toggleWbFill = toggleWbFill;
  window.undoWhiteboard = undoWhiteboard;
  window.redoWhiteboard = redoWhiteboard;
  window.toggleWhiteboardGrid = toggleWhiteboardGrid;
  window.clearWhiteboard = clearWhiteboard;
  window.downloadWhiteboard = downloadWhiteboard;
  window.copyWhiteboardImage = copyWhiteboardImage;
  window.createStickyNote = createStickyNote;
  window.changeStickyColor = changeStickyColor;
  window.removeStickyNote = removeStickyNote;

})(window);
