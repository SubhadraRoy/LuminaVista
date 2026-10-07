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
  let activePointerId = null;

  // Premium Features State (Laser, Background, Zoom/Pan)
  let laserPoints = [];
  let laserAnimId = null;
  window.wbZoom = 1.0;
  window.wbPanX = 0;
  window.wbPanY = 0;
  window.wbBackground = 'dots';
  window.wbTheme = localStorage.getItem('lumina_wb_theme') || 'blackboard';

  function initWhiteboard() {
    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap) return;

    setWhiteboardTheme(window.wbTheme, true);
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

    // Hardware Touchscreen, Stylus/Pen & Mouse drawing events
    if (typeof window.PointerEvent !== 'undefined') {
      mainCv.addEventListener("pointerdown", handlePointerDown, { passive: false });
      window.addEventListener("pointermove", handlePointerMove, { passive: false });
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerCancel);
    }
    // Also listen for mouse events as fallback (e.g. in test runners / legacy engines)
    mainCv.addEventListener("mousedown", (e) => {
      if (!isDrawing) handlePointerDown(e);
    });
    window.addEventListener("mousemove", (e) => {
      if (isDrawing && activePointerId === null) handlePointerMove(e);
    });
    window.addEventListener("mouseup", (e) => {
      if (isDrawing && activePointerId === null) handlePointerUp(e);
    });

    // Touch events for mobile/tablet fallback
    mainCv.addEventListener("touchstart", handleWbTouchStart, { passive: false });
    window.addEventListener("touchmove", handleWbTouchMove, { passive: false });
    window.addEventListener("touchend", handleWbTouchEnd);
    window.addEventListener("touchcancel", handleWbTouchEnd);

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
    if (window.LuminaCloudSync?.queueSync) window.LuminaCloudSync.queueSync();
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
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    }
    if (clientX === undefined) clientX = 0;
    if (clientY === undefined) clientY = 0;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // --- Hardware Pointer, Stylus & Touchscreen Handlers ---

  function handlePointerDown(e) {
    if (isDrawing) return;
    // For mouse, only allow primary button (left click = 0).
    // For touch and pen/stylus, always allow drawing regardless of button property.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.button !== undefined && e.button > 0 && (e.pointerType === 'mouse' || !e.pointerType)) return;
    if (e.isPrimary === false) return; // Palm rejection: ignore secondary contact points

    if (e.cancelable && e.preventDefault) e.preventDefault();

    const mainCv = document.getElementById("whiteboardCanvas");
    if (!mainCv) return;

    activePointerId = (e.pointerId !== undefined) ? e.pointerId : null;
    if (activePointerId !== null && mainCv.setPointerCapture) {
      try {
        mainCv.setPointerCapture(activePointerId);
      } catch (ignore) {}
    }

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
    strokePoints = [{ x: startX, y: startY, pressure: e.pressure || 0.5 }];

    // For pen or highlighter or eraser, start path on main canvas
    if (window.wbTool === 'pen' || window.wbTool === 'highlighter' || window.wbTool === 'eraser') {
      saveWbState();
      const ctx = mainCv.getContext("2d");
      ctx.beginPath();
      ctx.moveTo(startX, startY);
    } else if (window.wbTool === 'laser') {
      laserPoints = [{ x: startX, y: startY, time: Date.now() }];
      if (!laserAnimId) {
        laserAnimId = requestAnimationFrame(renderLaserTrail);
      }
    }
  }

  function renderLaserTrail() {
    const tempCv = document.getElementById("whiteboardTempCanvas");
    if (!tempCv) return;
    const ctx = tempCv.getContext("2d");
    const now = Date.now();
    laserPoints = laserPoints.filter(p => now - p.time < 1100);

    ctx.clearRect(0, 0, tempCv.width, tempCv.height);

    if (laserPoints.length > 1) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 14;
      ctx.shadowColor = window.wbColor || '#f43f5e';

      for (let i = 1; i < laserPoints.length; i++) {
        const p1 = laserPoints[i - 1];
        const p2 = laserPoints[i];
        const age = now - p2.time;
        const alpha = Math.max(0, 1 - age / 1100);

        ctx.strokeStyle = hexToRgba(window.wbColor || '#f43f5e', alpha);
        ctx.lineWidth = Math.max(2, window.wbSize * 2.2 * alpha);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
      ctx.restore();
      laserAnimId = requestAnimationFrame(renderLaserTrail);
    } else {
      laserAnimId = null;
    }
  }

  function handlePointerMove(e) {
    if (!isDrawing) return;
    if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;

    if (e.cancelable && e.preventDefault) e.preventDefault();

    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap) return;

    // Process coalesced events for ultra-high-rate digitizer/stylus/touch sampling
    const events = (e.getCoalescedEvents && typeof e.getCoalescedEvents === 'function')
      ? e.getCoalescedEvents()
      : [e];

    const mCtx = mainCv.getContext("2d");
    const tCtx = tempCv.getContext("2d");

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const coords = getCanvasCoords(ev, mainCv);
      const curX = coords.x;
      const curY = coords.y;

      if (window.wbTool === 'laser') {
        laserPoints.push({ x: curX, y: curY, time: Date.now() });
        if (!laserAnimId) {
          laserAnimId = requestAnimationFrame(renderLaserTrail);
        }
      } else if (window.wbTool === 'pen' || window.wbTool === 'highlighter' || window.wbTool === 'eraser') {
        mCtx.save();
        mCtx.lineCap = "round";
        mCtx.lineJoin = "round";

        let dynamicWidth = window.wbSize;
        if (ev.pointerType === 'pen' && ev.pressure && ev.pressure > 0) {
          dynamicWidth = Math.max(1, window.wbSize * (0.35 + ev.pressure * 1.3));
        }

        if (window.wbTool === 'pen') {
          mCtx.strokeStyle = window.wbColor;
          mCtx.lineWidth = dynamicWidth;
          mCtx.globalAlpha = 1.0;
        } else if (window.wbTool === 'highlighter') {
          mCtx.strokeStyle = window.wbColor;
          mCtx.lineWidth = Math.max(14, dynamicWidth * 3);
          mCtx.globalAlpha = 0.35;
        } else if (window.wbTool === 'eraser') {
          mCtx.strokeStyle = "#030712";
          mCtx.lineWidth = Math.max(16, dynamicWidth * 4);
          mCtx.globalAlpha = 1.0;
        }

        // Smooth curve using midpoints
        strokePoints.push({ x: curX, y: curY, pressure: ev.pressure || 0.5 });
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
  }

  function handlePointerUp(e) {
    if (!isDrawing) return;
    if (activePointerId !== null && e && e.pointerId !== undefined && e.pointerId !== activePointerId) return;

    const mainCv = document.getElementById("whiteboardCanvas");
    if (mainCv && activePointerId !== null && mainCv.releasePointerCapture) {
      try {
        mainCv.releasePointerCapture(activePointerId);
      } catch (ignore) {}
    }
    activePointerId = null;
    isDrawing = false;

    const tempCv = document.getElementById("whiteboardTempCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !tempCv || !wrap) return;

    const coords = e ? getCanvasCoords(e, mainCv) : { x: lastX, y: lastY };
    const curX = coords.x;
    const curY = coords.y;

    const mCtx = mainCv.getContext("2d");
    const tCtx = tempCv.getContext("2d");

    if (window.wbTool !== 'pen' && window.wbTool !== 'highlighter' && window.wbTool !== 'eraser' && window.wbTool !== 'laser') {
      // Clear temp canvas and commit shape onto main canvas
      tCtx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
      saveWbState();
      drawShape(mCtx, window.wbTool, startX, startY, curX, curY, window.wbColor, window.wbSize, window.wbFill);
    }

    strokePoints = [];
    localStorage.setItem("lumina_wb_state", mainCv.toDataURL("image/png"));
  }

  function handlePointerCancel(e) {
    if (activePointerId !== null && e && e.pointerId !== undefined && e.pointerId === activePointerId) {
      handlePointerUp(e);
    } else if (activePointerId === null) {
      handlePointerUp(e);
    }
  }

  // --- Backward-Compatible Legacy Wrappers ---
  function handleWbMouseDown(e) {
    handlePointerDown(e);
  }

  function handleWbMouseMove(e) {
    handlePointerMove(e);
  }

  function handleWbMouseUp(e) {
    handlePointerUp(e);
  }

  function handleWbTouchStart(e) {
    if (window.PointerEvent) return; // Handled by pointerdown
    if (e.touches && e.touches.length === 1) {
      if (e.cancelable && e.preventDefault) e.preventDefault();
      handlePointerDown(e);
    }
  }

  function handleWbTouchMove(e) {
    if (window.PointerEvent) return; // Handled by pointermove
    if (e.touches && e.touches.length === 1 && isDrawing) {
      if (e.cancelable && e.preventDefault) e.preventDefault();
      handlePointerMove(e);
    }
  }

  function handleWbTouchEnd(e) {
    if (window.PointerEvent) return; // Handled by pointerup
    handlePointerUp(e);
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
    } else if (tool === 'diamond') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.moveTo(cx, Math.min(y1, y2));
      ctx.lineTo(Math.max(x1, x2), cy);
      ctx.lineTo(cx, Math.max(y1, y2));
      ctx.lineTo(Math.min(x1, x2), cy);
      ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (tool === 'cylinder') {
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.min(18, Math.abs(y2 - y1) / 4);
      const cx = Math.min(x1, x2) + rx;
      const topY = Math.min(y1, y2) + ry;
      const botY = Math.max(y1, y2) - ry;
      ctx.beginPath();
      ctx.ellipse(cx, topY, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - rx, topY);
      ctx.lineTo(cx - rx, botY);
      ctx.ellipse(cx, botY, Math.max(1, rx), Math.max(1, ry), 0, Math.PI, 0, true);
      ctx.lineTo(cx + rx, topY);
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (tool === 'cloud') {
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      const cx = minX + w / 2;
      const cy = minY + h / 2;
      const r = Math.min(w, h) / 3.2;
      ctx.beginPath();
      ctx.arc(cx - r * 0.9, cy, Math.max(1, r * 0.7), 0, Math.PI * 2);
      ctx.arc(cx, cy - r * 0.6, Math.max(1, r * 0.9), 0, Math.PI * 2);
      ctx.arc(cx + r * 0.9, cy, Math.max(1, r * 0.7), 0, Math.PI * 2);
      ctx.arc(cx, cy + r * 0.4, Math.max(1, r * 0.8), 0, Math.PI * 2);
      if (fill) ctx.fill();
      ctx.stroke();
    } else if (tool === 'star') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rOuter = Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
      const rInner = rOuter * 0.45;
      const points = 5;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? rOuter : rInner;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
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

    // Dragging listener (Hardware Touchscreen & Mouse supported)
    const handle = el.querySelector(".sticky-handle");
    handle.style.touchAction = "none";
    let isDraggingSticky = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let stickyPointerId = null;

    function startStickyDrag(clientX, clientY, pointerId) {
      isDraggingSticky = true;
      stickyPointerId = pointerId !== undefined ? pointerId : null;
      dragOffsetX = clientX - el.offsetLeft;
      dragOffsetY = clientY - el.offsetTop;
      el.style.zIndex = "50";
      if (stickyPointerId !== null && handle.setPointerCapture) {
        try { handle.setPointerCapture(stickyPointerId); } catch (err) {}
      }
    }

    function moveStickyDrag(clientX, clientY) {
      if (!isDraggingSticky) return;
      const wrap = document.getElementById("whiteboardContainer");
      if (!wrap) return;
      let newX = clientX - dragOffsetX;
      let newY = clientY - dragOffsetY;
      newX = Math.max(0, Math.min(newX, wrap.clientWidth - 190));
      newY = Math.max(0, Math.min(newY, wrap.clientHeight - 130));
      el.style.left = newX + "px";
      el.style.top = newY + "px";
      sticky.x = newX;
      sticky.y = newY;
    }

    function endStickyDrag() {
      if (isDraggingSticky) {
        isDraggingSticky = false;
        el.style.zIndex = "20";
        if (stickyPointerId !== null && handle.releasePointerCapture) {
          try { handle.releasePointerCapture(stickyPointerId); } catch (err) {}
        }
        stickyPointerId = null;
        saveStickies();
      }
    }

    handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();
      startStickyDrag(e.clientX, e.clientY, e.pointerId);
    });

    handle.addEventListener("pointermove", (e) => {
      if (!isDraggingSticky) return;
      if (e.cancelable) e.preventDefault();
      moveStickyDrag(e.clientX, e.clientY);
    });

    handle.addEventListener("pointerup", () => {
      endStickyDrag();
    });

    handle.addEventListener("pointercancel", () => {
      endStickyDrag();
    });

    // Fallback mouse listeners
    handle.addEventListener("mousedown", (e) => {
      if (!isDraggingSticky && e.button === 0) {
        startStickyDrag(e.clientX, e.clientY, null);
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (isDraggingSticky && stickyPointerId === null) {
        moveStickyDrag(e.clientX, e.clientY);
      }
    });

    window.addEventListener("mouseup", () => {
      if (isDraggingSticky && stickyPointerId === null) {
        endStickyDrag();
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
      'wbToolSelect', 'wbToolPen', 'wbToolHighlighter', 'wbToolLaser',
      'wbToolLine', 'wbToolArrow', 'wbToolRect', 'wbToolRoundedRect', 'wbToolCircle',
      'wbToolDiamond', 'wbToolCylinder', 'wbToolCloud', 'wbToolStar',
      'wbToolSticky', 'wbToolText', 'wbToolEraser'
    ];
    toolIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.className = "w-7 h-7 flex items-center justify-center rounded-md text-zinc-400 hover:text-white cursor-pointer transition-colors";
      }
    });

    const activeMap = {
      'select': 'wbToolSelect',
      'pen': 'wbToolPen',
      'highlighter': 'wbToolHighlighter',
      'laser': 'wbToolLaser',
      'line': 'wbToolLine',
      'arrow': 'wbToolArrow',
      'rect': 'wbToolRect',
      'roundedRect': 'wbToolRoundedRect',
      'circle': 'wbToolCircle',
      'diamond': 'wbToolDiamond',
      'cylinder': 'wbToolCylinder',
      'cloud': 'wbToolCloud',
      'star': 'wbToolStar',
      'sticky': 'wbToolSticky',
      'text': 'wbToolText',
      'eraser': 'wbToolEraser'
    };

    const activeEl = document.getElementById(activeMap[tool]);
    if (activeEl) {
      activeEl.className = "w-7 h-7 flex items-center justify-center rounded-md bg-cyan-500 text-black cursor-pointer transition-colors";
    }

    // Cursor indicator
    const mainCv = document.getElementById("whiteboardCanvas");
    if (mainCv) {
      if (tool === 'select') mainCv.style.cursor = 'default';
      else if (tool === 'text') mainCv.style.cursor = 'text';
      else if (tool === 'laser') mainCv.style.cursor = 'crosshair';
      else mainCv.style.cursor = 'crosshair';
    }
  }

  // --- Whiteboard vs Blackboard Theme Engine & Palette Switcher ---
  const THEME_PALETTES = {
    whiteboard: [
      { name: 'Slate Black', hex: '#0f172a' },
      { name: 'Royal Blue',  hex: '#1d4ed8' },
      { name: 'Crimson Red', hex: '#dc2626' },
      { name: 'Emerald',     hex: '#059669' },
      { name: 'Purple',      hex: '#7c3aed' },
      { name: 'Dark Amber',  hex: '#d97706' }
    ],
    blackboard: [
      { name: 'Chalk White', hex: '#ffffff' },
      { name: 'Chalk Cyan',  hex: '#00f2fe' },
      { name: 'Chalk Emerald',hex: '#10b981' },
      { name: 'Chalk Yellow', hex: '#fde047' },
      { name: 'Chalk Rose',  hex: '#f43f5e' },
      { name: 'Chalk Purple',hex: '#a855f7' }
    ]
  };

  function setWhiteboardTheme(theme, silent = false) {
    const validTheme = (theme === 'whiteboard') ? 'whiteboard' : 'blackboard';
    window.wbTheme = validTheme;
    localStorage.setItem('lumina_wb_theme', validTheme);

    const wrap = document.getElementById("whiteboardContainer");
    if (wrap) {
      if (validTheme === 'whiteboard') {
        wrap.classList.remove('wb-theme-blackboard', 'bg-surface-950');
        wrap.classList.add('wb-theme-whiteboard', 'bg-white');
      } else {
        wrap.classList.remove('wb-theme-whiteboard', 'bg-white');
        wrap.classList.add('wb-theme-blackboard', 'bg-surface-950');
      }
    }

    renderPaletteSwatches(validTheme);

    if (validTheme === 'whiteboard') {
      if (!window.wbColor || window.wbColor === '#ffffff' || window.wbColor === '#00f2fe' || window.wbColor === '#fde047') {
        window.wbColor = '#0f172a';
      }
    } else {
      if (!window.wbColor || window.wbColor === '#0f172a' || window.wbColor === '#1e293b' || window.wbColor === '#000000') {
        window.wbColor = '#00f2fe';
      }
    }

    const picker = document.getElementById("wbColorPicker");
    if (picker) picker.value = window.wbColor;

    updateThemeToggleUI(validTheme);

    if (!silent && window.showToast) {
      window.showToast(
        validTheme === 'whiteboard' ? '⚪ Whiteboard Mode' : '⚫ Blackboard Mode',
        validTheme === 'whiteboard' ? 'Crisp white canvas with dark studio markers active.' : 'Classic chalkboard canvas with luminous chalk active.'
      );
    }
  }

  function toggleWhiteboardTheme() {
    const nextTheme = window.wbTheme === 'whiteboard' ? 'blackboard' : 'whiteboard';
    setWhiteboardTheme(nextTheme);
  }

  function renderPaletteSwatches(theme) {
    const container = document.getElementById("wbColorSwatches");
    if (!container) return;

    const colors = THEME_PALETTES[theme] || THEME_PALETTES.blackboard;
    container.innerHTML = colors.map(c => {
      const isSelected = window.wbColor && window.wbColor.toLowerCase() === c.hex.toLowerCase();
      return `<button onclick="setWbPresetColor('${c.hex}')" class="w-4 h-4 rounded-full border-2 ${isSelected ? 'border-cyan-400 scale-110 shadow-md ring-2 ring-cyan-400/50' : 'border-black/20 hover:scale-110'} transition-transform cursor-pointer" style="background-color: ${c.hex};" title="${c.name}"></button>`;
    }).join('') + `
      <div class="w-px h-3.5 bg-white/10 mx-0.5"></div>
      <input type="color" id="wbColorPicker" value="${window.wbColor || (theme === 'whiteboard' ? '#0f172a' : '#00f2fe')}" onchange="updateWbColor(this.value)" class="w-5 h-5 rounded cursor-pointer border-0 bg-transparent" title="Custom Color" />
    `;
  }

  function updateThemeToggleUI(theme) {
    const btn = document.getElementById("btnWbThemeToggle");
    if (!btn) return;
    if (theme === 'whiteboard') {
      btn.innerHTML = `<i data-lucide="sun" class="w-3.5 h-3.5 text-amber-500 inline mr-1"></i> <span class="font-bold text-slate-900">Whiteboard</span>`;
      btn.className = "px-2 py-1 rounded-md bg-white text-slate-900 border border-slate-300 font-semibold cursor-pointer shadow-sm flex items-center text-[11px] transition-all";
    } else {
      btn.innerHTML = `<i data-lucide="moon" class="w-3.5 h-3.5 text-cyan-400 inline mr-1"></i> <span class="font-bold text-cyan-300">Blackboard</span>`;
      btn.className = "px-2 py-1 rounded-md bg-surface-900 hover:bg-surface-850 text-cyan-300 border border-cyan-500/20 font-semibold cursor-pointer flex items-center text-[11px] transition-all";
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function setWbPresetColor(hex) {
    window.wbColor = hex;
    const picker = document.getElementById("wbColorPicker");
    if (picker) picker.value = hex;
    renderPaletteSwatches(window.wbTheme || 'blackboard');
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

  function downloadWhiteboard(format = 'png') {
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !wrap) return;

    const normFormat = (format || 'png').toLowerCase().includes('jpg') || (format || '').toLowerCase().includes('jpeg') ? 'jpg' : 'png';
    const mime = normFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = normFormat === 'jpg' ? 'jpg' : 'png';

    const w = wrap.clientWidth || 1200;
    const h = wrap.clientHeight || 800;

    const offscreen = document.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const oCtx = offscreen.getContext("2d");

    // Solid background matching active board theme (white for Whiteboard, chalkboard dark for Blackboard)
    const bgColor = (window.wbTheme === 'whiteboard') ? '#ffffff' : '#0f172a';
    oCtx.fillStyle = bgColor;
    oCtx.fillRect(0, 0, w, h);

    // Draw main drawing canvas
    oCtx.drawImage(mainCv, 0, 0, w, h);

    // Render stickies onto the export canvas
    (window.wbStickies || []).forEach(s => {
      const sx = s.x;
      const sy = s.y;
      const sw = 192;
      const sh = 120;

      oCtx.save();
      oCtx.fillStyle = s.color || "#fef08a";
      oCtx.shadowColor = "rgba(0,0,0,0.3)";
      oCtx.shadowBlur = 8;
      oCtx.fillRect(sx, sy, sw, sh);
      oCtx.shadowBlur = 0;

      oCtx.fillStyle = "#1e293b";
      oCtx.font = "11px 'Plus Jakarta Sans', sans-serif";
      const textLines = (s.text || "").split("\n");
      textLines.forEach((line, idx) => {
        if (idx < 5) oCtx.fillText(line, sx + 12, sy + 22 + idx * 16);
      });
      oCtx.restore();
    });

    const dataUrl = normFormat === 'jpg' ? offscreen.toDataURL(mime, 0.95) : offscreen.toDataURL(mime);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `whiteboard_${window.wbTheme || 'pro'}_${Date.now()}.${ext}`;
    a.click();

    if (window.showToast) {
      window.showToast(`${normFormat.toUpperCase()} Download Ready`, `Exported whiteboard as high-quality ${normFormat.toUpperCase()}.`);
    }
  }

  function downloadWhiteboardPng() {
    downloadWhiteboard('png');
  }

  function downloadWhiteboardJpg() {
    downloadWhiteboard('jpg');
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

  function clearWhiteboardSilently() {
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
  }

  // --- Background Grid Modes ---
  function setWhiteboardBackground(bgType, silent = false) {
    const wrap = document.getElementById("whiteboardContainer");
    if (!wrap) return;
    wrap.classList.remove('bg-dot-pattern', 'bg-grid-pattern', 'bg-blueprint-pattern', 'bg-clean');
    window.wbBackground = bgType;
    if (bgType === 'grid') {
      wrap.classList.add('bg-grid-pattern');
    } else if (bgType === 'blueprint') {
      wrap.classList.add('bg-blueprint-pattern');
    } else if (bgType === 'clean') {
      wrap.classList.add('bg-clean');
    } else {
      wrap.classList.add('bg-dot-pattern');
    }
    const bgSelect = document.getElementById("wbBgSelect");
    if (bgSelect) bgSelect.value = bgType;
    localStorage.setItem('lumina_wb_bg', bgType);
    if (!silent && window.showToast) window.showToast("Canvas Background", `Grid pattern set to ${bgType}.`);
  }

  // --- Zoom & Pan Engine ---
  function setWbZoom(level) {
    const clamped = Math.max(0.25, Math.min(3.0, Math.round(level * 100) / 100));
    window.wbZoom = clamped;
    const label = document.getElementById("wbZoomLabel");
    if (label) label.textContent = `${Math.round(clamped * 100)}%`;
    applyCanvasTransform();
  }

  function zoomIn() {
    setWbZoom(window.wbZoom + 0.15);
  }

  function zoomOut() {
    setWbZoom(window.wbZoom - 0.15);
  }

  function resetZoom() {
    window.wbPanX = 0;
    window.wbPanY = 0;
    setWbZoom(1.0);
  }

  function applyCanvasTransform() {
    const mainCv = document.getElementById("whiteboardCanvas");
    const tempCv = document.getElementById("whiteboardTempCanvas");
    const stickyContainer = document.getElementById("whiteboardStickyContainer");
    const scaleStr = `scale(${window.wbZoom}) translate(${window.wbPanX}px, ${window.wbPanY}px)`;
    if (mainCv) mainCv.style.transform = scaleStr;
    if (tempCv) tempCv.style.transform = scaleStr;
    if (stickyContainer) stickyContainer.style.transform = scaleStr;
  }

  // --- Retina & Multi-Format Export Suite ---
  function downloadWhiteboardRetina(scale = 2, format = 'png') {
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !wrap) return;

    const normFormat = (format || 'png').toLowerCase().includes('jpg') || (format || '').toLowerCase().includes('jpeg') ? 'jpg' : 'png';
    const mime = normFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = normFormat === 'jpg' ? 'jpg' : 'png';

    const w = wrap.clientWidth || 1200;
    const h = wrap.clientHeight || 800;

    const offscreen = document.createElement("canvas");
    offscreen.width = w * scale;
    offscreen.height = h * scale;
    const oCtx = offscreen.getContext("2d");

    // Draw background matching active theme
    const bgColor = (window.wbTheme === 'whiteboard') ? '#ffffff' : '#0f172a';
    oCtx.fillStyle = bgColor;
    oCtx.fillRect(0, 0, offscreen.width, offscreen.height);

    // Draw main canvas content
    oCtx.drawImage(mainCv, 0, 0, offscreen.width, offscreen.height);

    // Render stickies onto the export canvas
    (window.wbStickies || []).forEach(s => {
      const sx = s.x * scale;
      const sy = s.y * scale;
      const sw = 192 * scale;
      const sh = 120 * scale;

      oCtx.save();
      oCtx.fillStyle = s.color || "#fef08a";
      oCtx.shadowColor = "rgba(0,0,0,0.4)";
      oCtx.shadowBlur = 10 * scale;
      oCtx.fillRect(sx, sy, sw, sh);
      oCtx.shadowBlur = 0;

      oCtx.fillStyle = "#1e293b";
      oCtx.font = `${Math.round(11 * scale)}px 'Plus Jakarta Sans', sans-serif`;
      const textLines = (s.text || "").split("\n");
      textLines.forEach((line, idx) => {
        if (idx < 5) oCtx.fillText(line, sx + 12 * scale, sy + (22 + idx * 16) * scale);
      });
      oCtx.restore();
    });

    const a = document.createElement("a");
    a.href = normFormat === 'jpg' ? offscreen.toDataURL(mime, 0.95) : offscreen.toDataURL(mime);
    a.download = `whiteboard_${window.wbTheme || 'pro'}_retina_${scale}x_${Date.now()}.${ext}`;
    a.click();

    if (window.showToast) window.showToast(`${normFormat.toUpperCase()} Retina Export`, `Exported at ${scale}x in ${normFormat.toUpperCase()} format.`);
  }

  function downloadWhiteboardSvg() {
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    if (!mainCv || !wrap) return;

    const w = wrap.clientWidth || 1200;
    const h = wrap.clientHeight || 800;
    const dataUrl = mainCv.toDataURL("image/png");

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#030712"/>
  <image href="${dataUrl}" width="${w}" height="${h}"/>
</svg>`;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `whiteboard_${Date.now()}.svg`;
        a.click();
        setTimeout(() => { if (URL.revokeObjectURL) URL.revokeObjectURL(url); }, 2000);
      } catch (e) {}
    }

    if (window.showToast) window.showToast("SVG Exported", "Vector SVG downloaded.");
    return svgContent;
  }

  function exportWhiteboardJson() {
    const mainCv = document.getElementById("whiteboardCanvas");
    const activeBoard = window.LuminaWhiteboardGallery ? window.LuminaWhiteboardGallery.getCurrentActiveBoard() : null;

    const sceneData = {
      version: "2.0",
      boardName: activeBoard ? activeBoard.name : "Whiteboard",
      exportedAt: new Date().toISOString(),
      stickies: window.wbStickies || [],
      background: window.wbBackground || 'dots',
      imageData: mainCv ? mainCv.toDataURL("image/png") : null
    };

    const jsonStr = JSON.stringify(sceneData, null, 2);
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `whiteboard_scene_${Date.now()}.json`;
        a.click();
        setTimeout(() => { if (URL.revokeObjectURL) URL.revokeObjectURL(url); }, 2000);
      } catch (e) {}
    }

    if (window.showToast) window.showToast("Scene Saved", "Whiteboard JSON exported.");
    return jsonStr;
  }

  function importWhiteboardJson(fileOrJson) {
    try {
      const data = typeof fileOrJson === 'string' ? JSON.parse(fileOrJson) : fileOrJson;
      if (!data) return;

      clearWhiteboardSilently();

      if (data.background) setWhiteboardBackground(data.background, true);

      if (data.imageData) {
        const mainCv = document.getElementById("whiteboardCanvas");
        const wrap = document.getElementById("whiteboardContainer");
        if (mainCv && wrap) {
          const ctx = mainCv.getContext("2d");
          const img = new Image();
          img.src = data.imageData;
          img.onload = () => {
            ctx.drawImage(img, 0, 0, wrap.clientWidth, wrap.clientHeight);
            saveWbState();
          };
        }
      }

      if (Array.isArray(data.stickies)) {
        data.stickies.forEach(s => {
          createStickyNote(s.x, s.y, s.text, s.color);
        });
      }

      if (window.showToast) window.showToast("Scene Restored", `Imported "${data.boardName || 'Whiteboard'}"`);
    } catch (err) {
      console.error("[Whiteboard] Error importing JSON scene:", err);
      if (window.showToast) window.showToast("Import Failed", "Invalid whiteboard JSON scene format.");
    }
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
  window.clearWhiteboardSilently = clearWhiteboardSilently;
  window.setWhiteboardTheme = setWhiteboardTheme;
  window.toggleWhiteboardTheme = toggleWhiteboardTheme;
  window.downloadWhiteboard = downloadWhiteboard;
  window.downloadWhiteboardPng = downloadWhiteboardPng;
  window.downloadWhiteboardJpg = downloadWhiteboardJpg;
  window.downloadWhiteboardRetina = downloadWhiteboardRetina;
  window.downloadWhiteboardSvg = downloadWhiteboardSvg;
  window.exportWhiteboardJson = exportWhiteboardJson;
  window.importWhiteboardJson = importWhiteboardJson;
  window.copyWhiteboardImage = copyWhiteboardImage;
  window.createStickyNote = createStickyNote;
  window.changeStickyColor = changeStickyColor;
  window.removeStickyNote = removeStickyNote;
  window.setWhiteboardBackground = setWhiteboardBackground;
  window.setWbZoom = setWbZoom;
  window.zoomIn = zoomIn;
  window.zoomOut = zoomOut;
  window.resetZoom = resetZoom;
  window.openWhiteboardGallery = (tab) => {
    if (window.LuminaWhiteboardGallery) window.LuminaWhiteboardGallery.openGalleryModal(tab);
  };
  window.openWhiteboardAiAssistant = () => {
    if (window.LuminaWhiteboardAi) window.LuminaWhiteboardAi.openAiModal();
  };

  // Unified LuminaWhiteboard Pro API
  window.LuminaWhiteboard = {
    init: initWhiteboard,
    setTheme: setWhiteboardTheme,
    toggleTheme: toggleWhiteboardTheme,
    downloadPng: downloadWhiteboardPng,
    downloadJpg: downloadWhiteboardJpg,
    drawShape: (tool, x1, y1, x2, y2, color, size, fill) => {
      const cv = document.getElementById("whiteboardCanvas");
      if (cv) drawShape(cv.getContext("2d"), tool, x1, y1, x2, y2, color || window.wbColor, size || window.wbSize, fill || window.wbFill);
    },
    drawDiagram: (spec) => {
      if (window.LuminaWhiteboardGallery && window.LuminaWhiteboardGallery.renderDiagramDirect) {
        window.LuminaWhiteboardGallery.renderDiagramDirect(spec);
      }
    },
    handleAgentDirective: (attrs, body) => {
      if (window.LuminaWhiteboardAi && window.LuminaWhiteboardAi.handleAgentDirective) {
        return window.LuminaWhiteboardAi.handleAgentDirective(attrs, body);
      }
      return { success: false, summary: 'AI module not mounted' };
    },
    openGallery: (tab) => {
      if (window.LuminaWhiteboardGallery) window.LuminaWhiteboardGallery.openGalleryModal(tab);
    },
    openAiAssistant: () => {
      if (window.LuminaWhiteboardAi) window.LuminaWhiteboardAi.openAiModal();
    },
    loadTemplate: (id, asNew) => {
      if (window.LuminaWhiteboardGallery) return window.LuminaWhiteboardGallery.loadTemplate(id, asNew);
      return false;
    },
    setBackground: setWhiteboardBackground,
    setZoom: setWbZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    exportRetinaPng: downloadWhiteboardRetina,
    exportSvg: downloadWhiteboardSvg,
    exportJson: exportWhiteboardJson,
    importJson: importWhiteboardJson,
    addSticky: createStickyNote,
    clearCanvas: clearWhiteboard,
    clearCanvasSilently: clearWhiteboardSilently
  };

})(window);
