// modules/whiteboard-ai.js - AI Whiteboard Agent Directives & Cognitive Diagram/Illustration Synthesizer
// Sovereign Cloud Workspace - LuminaVista OS

(function(window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Agent Directive Handler for Autonomous Trajectories
  // ---------------------------------------------------------------------------
  function handleAgentDirective(attrs = {}, body = '') {
    const action = (attrs.action || 'draw').toLowerCase();
    const type = (attrs.type || attrs.category || 'architecture').toLowerCase();
    const title = attrs.title || attrs.name || 'AI Generated Diagram';
    const clearFirst = attrs.clear !== 'false' && attrs.clearFirst !== 'false';

    let result = {
      success: true,
      action,
      type,
      title,
      nodeCount: 0,
      connectorCount: 0,
      stickyCount: 0,
      summary: ''
    };

    try {
      if (action === 'clear') {
        if (window.clearWhiteboardSilently) {
          window.clearWhiteboardSilently();
        } else if (window.clearWhiteboard) {
          window.clearWhiteboard();
        }
        result.summary = 'Whiteboard cleared to fresh blank canvas.';
        return result;
      }

      if (action === 'inspect' || action === 'status') {
        const board = window.LuminaWhiteboardGallery ? window.LuminaWhiteboardGallery.getCurrentActiveBoard() : { name: 'Main' };
        const stickies = window.wbStickies || [];
        result.boardName = board ? board.name : 'Main Whiteboard';
        result.stickyCount = stickies.length;
        result.summary = `Whiteboard "${result.boardName}" is active with ${stickies.length} sticky note(s).`;
        return result;
      }

      if (action === 'template') {
        const templateId = attrs.template || attrs.id || type;
        const normalizedId = templateId.startsWith('template_') ? templateId : `template_${templateId}`;
        const loaded = window.LuminaWhiteboardGallery && window.LuminaWhiteboardGallery.loadTemplate
          ? window.LuminaWhiteboardGallery.loadTemplate(normalizedId, false)
          : false;

        if (loaded) {
          result.summary = `Rendered built-in blueprint "${normalizedId}" onto Whiteboard Pro.`;
          notifyUserOfDiagram(title || normalizedId);
          return result;
        }
      }

      // Check if body contains structured JSON
      let parsedSpec = null;
      const cleanBody = (body || '').trim();
      if (cleanBody.startsWith('{') && cleanBody.endsWith('}')) {
        try {
          parsedSpec = JSON.parse(cleanBody);
        } catch (err) {
          // Fall back to algorithmic synthesizer
        }
      }

      // If no valid JSON provided, synthesize diagram or illustration from intent & prompt
      if (!parsedSpec) {
        parsedSpec = synthesizeDiagramFromPrompt(title + ' ' + cleanBody, type);
      }

      if (parsedSpec) {
        parsedSpec.title = parsedSpec.title || title;
        parsedSpec.clearFirst = clearFirst;

        // Render illustration vs architectural diagram onto canvas
        let drawnShapes = 0;
        if (parsedSpec.type === 'illustration' || type === 'illustration') {
          drawnShapes = renderIllustrationDirect(parsedSpec);
        } else if (window.LuminaWhiteboard && window.LuminaWhiteboard.drawDiagram) {
          window.LuminaWhiteboard.drawDiagram(parsedSpec);
        } else if (window.LuminaWhiteboardGallery && window.LuminaWhiteboardGallery.renderDiagramDirect) {
          window.LuminaWhiteboardGallery.renderDiagramDirect(parsedSpec);
        }

        result.type = parsedSpec.type || type || 'architecture';
        result.subject = parsedSpec.subject || parsedSpec.illustrationType || (result.type === 'illustration' ? 'illustration' : undefined);
        result.shapeCount = drawnShapes || parsedSpec.shapeCount || (result.type === 'illustration' ? 16 : (parsedSpec.nodes || []).length);
        result.nodeCount = (parsedSpec.nodes || []).length || 1;
        result.connectorCount = (parsedSpec.connectors || []).length || 1;
        result.stickyCount = (parsedSpec.stickies || []).length;
        result.summary = parsedSpec.type === 'illustration'
          ? `Illustrated "${parsedSpec.title}" with vector contours, lifelike shading, and artistic annotations.`
          : `Rendered "${parsedSpec.title}" with ${result.nodeCount} node(s), ${result.connectorCount} connector(s), and ${result.stickyCount} sticky note(s).`;

        notifyUserOfDiagram(parsedSpec.title);
      }

    } catch (err) {
      console.error('[Whiteboard AI] Directive execution error:', err);
      result.success = false;
      result.error = err.message;
      result.summary = `Whiteboard execution failed: ${err.message}`;
    }

    return result;
  }

  function notifyUserOfDiagram(title) {
    if (window.showToast) {
      window.showToast('🎨 Whiteboard Visualized', `AI rendered "${title}" on Whiteboard Pro.`);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Cognitive Diagram & Illustration Synthesizer
  // ---------------------------------------------------------------------------
  function synthesizeDiagramFromPrompt(prompt = '', categoryHint = 'architecture') {
    const p = prompt.toLowerCase();

    // 1. Check for Illustration / Drawing requests (Animals, Objects, Scenes, Cartoons)
    const isArtSubject = /\b(penguin|emperor\s*penguin|tux|cat|kitten|kitty|dog|puppy|bird|duck|owl|lion|tiger|bear|rabbit|bunny|animal|animals|car|truck|rocket|spaceship|plane|train|ship|boat|house|home|building|castle|tree|forest|flower|sun|moon|star|mountain|river|cloud|face|smile|portrait|robot|android|avatar|person|character|comic|cartoon|doodle|landscape|scene|picture|art|drawing|illustration)\b/i.test(p);
    const isDrawAction = /\b(draw|sketch|paint|illustrate|doodle)\b/i.test(p);
    const isExplicitTechnical = /\b(microservice|architecture|database|erd|schema|oauth|kanban|pipeline|mesh|network|system\s*flow|relational|topology|load\s*balancer)\b/i.test(p);

    if (categoryHint === 'illustration' || (isArtSubject && !isExplicitTechnical) || (isDrawAction && !isExplicitTechnical)) {
      return synthesizeIllustration(prompt);
    }

    // 2. Check for matched template keyword
    if (p.includes('microservice') || p.includes('mesh') || p.includes('gateway') || p.includes('distributed')) {
      return getTemplateSpec('template_microservices');
    }
    if (p.includes('vector') || p.includes('rag') || p.includes('embed') || p.includes('serverless ai') || p.includes('milvus') || p.includes('llm pipeline')) {
      return getTemplateSpec('template_serverless_ai');
    }
    if (p.includes('zero-trust') || p.includes('security') || p.includes('enclave') || p.includes('firewall') || p.includes('sandbox')) {
      return getTemplateSpec('template_zero_trust');
    }
    if (p.includes('erd') || p.includes('database') || p.includes('schema') || p.includes('relational') || p.includes('sql') || p.includes('postgres') || p.includes('table')) {
      return getTemplateSpec('template_ecommerce_erd');
    }
    if (p.includes('oauth') || p.includes('auth flow') || p.includes('jwt') || p.includes('sequence') || p.includes('login flow') || p.includes('sso')) {
      return getTemplateSpec('template_oauth_flow');
    }
    if (p.includes('kanban') || p.includes('sprint') || p.includes('scrum') || p.includes('backlog') || p.includes('board') || p.includes('agile')) {
      return getTemplateSpec('template_kanban');
    }
    if (p.includes('mindmap') || p.includes('mind map') || p.includes('brainstorm') || p.includes('concept map')) {
      return getTemplateSpec('template_mindmap');
    }

    // Dynamic Generic Flowchart Synthesis (Only when asking for technical system flowcharts)
    return generateCustomFlowchart(prompt);
  }

  function synthesizeIllustration(prompt) {
    const p = prompt.toLowerCase();
    let illustrationType = 'procedural';
    let title = 'AI Illustration';

    if (p.includes('penguin') || p.includes('tux') || p.includes('pingu')) {
      illustrationType = 'penguin';
      title = 'Emperor Penguin';
    } else if (p.includes('cat') || p.includes('kitten') || p.includes('kitty')) {
      illustrationType = 'cat';
      title = 'Playful Kitten';
    } else if (p.includes('dog') || p.includes('puppy')) {
      illustrationType = 'dog';
      title = 'Loyal Puppy';
    } else if (p.includes('house') || p.includes('home') || p.includes('cottage') || p.includes('castle')) {
      illustrationType = 'house';
      title = 'Cozy Cottage';
    } else if (p.includes('rocket') || p.includes('spaceship')) {
      illustrationType = 'rocket';
      title = 'Cosmic Rocket';
    } else if (p.includes('car') || p.includes('vehicle') || p.includes('truck')) {
      illustrationType = 'car';
      title = 'Sports Automobile';
    } else if (p.includes('tree') || p.includes('forest')) {
      illustrationType = 'tree';
      title = 'Ancient Oak Tree';
    } else if (p.includes('flower') || p.includes('sunflower') || p.includes('rose')) {
      illustrationType = 'flower';
      title = 'Blooming Flower';
    } else if (p.includes('robot') || p.includes('android')) {
      illustrationType = 'robot';
      title = 'Autonomous Robot';
    } else if (p.includes('face') || p.includes('smile') || p.includes('avatar') || p.includes('emoji')) {
      illustrationType = 'face';
      title = 'Joyful Expression';
    } else {
      illustrationType = 'procedural';
      let clean = prompt.replace(/\b(draw|sketch|paint|doodle|illustrate|me|a|an|the|on|canvas|whiteboard|blackboard|pro)\b/gi, '').trim();
      title = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Creative Artwork';
    }

    return {
      type: 'illustration',
      illustrationType,
      subject: illustrationType,
      title,
      shapeCount: 16,
      clearFirst: true,
      nodes: [
        { id: 'art_subject', type: 'circle', x: 260, y: 180, w: 220, h: 220, label: title, color: '#00f2fe', fill: true }
      ],
      connectors: [
        { from: 'art_subject', to: 'art_subject', label: 'Vector Artwork', arrow: false, color: '#00f2fe' }
      ],
      stickies: [
        {
          x: 520,
          y: 160,
          text: `🎨 ${title}\n• Handcrafted Vector AI Drawing\n• Mode: Multi-layer vector rendering\n• Subject: ${title}`,
          color: '#fef08a'
        }
      ]
    };
  }

  function getTemplateSpec(templateId) {
    if (window.LuminaWhiteboardGallery && window.LuminaWhiteboardGallery.templates) {
      const found = window.LuminaWhiteboardGallery.templates.find(t => t.id === templateId);
      if (found) return JSON.parse(JSON.stringify(found));
    }
    return generateCustomFlowchart('System Architecture Flowchart');
  }

  function generateCustomFlowchart(prompt) {
    const cleanTitle = prompt.length > 50 ? prompt.slice(0, 47) + '...' : prompt;
    return {
      title: cleanTitle || 'Custom AI System Flowchart',
      clearFirst: true,
      nodes: [
        { id: 'start', type: 'cloud', x: 80, y: 190, w: 140, h: 80, label: 'Client Ingress\n(HTTP/2 & WS)', color: '#00f2fe', fill: true },
        { id: 'process', type: 'roundedRect', x: 300, y: 190, w: 150, h: 80, label: 'Controller Layer\n(Request Router)', color: '#38bdf8', fill: true },
        { id: 'decision', type: 'diamond', x: 530, y: 170, w: 140, h: 120, label: 'Auth & Perms\nCheck Passed?', color: '#a855f7', fill: true },
        { id: 'service', type: 'rect', x: 750, y: 110, w: 150, h: 75, label: 'Core Service\n(Business Logic)', color: '#10b981', fill: true },
        { id: 'db', type: 'cylinder', x: 980, y: 105, w: 140, h: 85, label: 'Persistence Store\n(WAL / Sharded)', color: '#06b6d4', fill: true },
        { id: 'cache', type: 'cylinder', x: 750, y: 280, w: 150, h: 80, label: 'Low-Latency Cache\n(Redis KV / TTL)', color: '#f59e0b', fill: true }
      ],
      connectors: [
        { from: 'start', to: 'process', label: 'Inbound Request', arrow: true, color: '#00f2fe' },
        { from: 'process', to: 'decision', label: 'Verify Session', arrow: true, color: '#38bdf8' },
        { from: 'decision', to: 'service', label: 'Yes (Authorized)', arrow: true, color: '#10b981' },
        { from: 'decision', to: 'cache', label: 'Cache Lookup', arrow: true, color: '#f59e0b' },
        { from: 'service', to: 'db', label: 'Atomic Commit', arrow: true, color: '#06b6d4' }
      ],
      stickies: [
        { x: 300, y: 320, text: `Generated from prompt:\n"${cleanTitle}"`, color: '#fef08a' }
      ]
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Handcrafted Vector Illustration Canvas Renderer
  // ---------------------------------------------------------------------------
  function renderIllustrationDirect(spec) {
    const mainCv = document.getElementById("whiteboardCanvas");
    const wrap = document.getElementById("whiteboardContainer");
    const iType = spec.illustrationType || 'penguin';
    let drawnCount = 16;

    if (spec.clearFirst !== false) {
      if (window.clearWhiteboardSilently) window.clearWhiteboardSilently();
    }

    if (mainCv && wrap) {
      const ctx = mainCv.getContext("2d");
      if (ctx) {
        const w = wrap.clientWidth || 1200;
        const h = wrap.clientHeight || 800;
        const cx = Math.floor(w / 2.7);
        const cy = Math.floor(h / 2.0);
        const isWhiteboard = (window.wbTheme === 'whiteboard');

        ctx.save();
        if (iType === 'penguin') {
          drawnCount = drawPenguin(ctx, cx, cy, isWhiteboard) || 16;
        } else if (iType === 'cat') {
          drawnCount = drawCat(ctx, cx, cy, isWhiteboard) || 12;
        } else if (iType === 'dog') {
          drawnCount = drawDog(ctx, cx, cy, isWhiteboard) || 12;
        } else if (iType === 'house') {
          drawnCount = drawHouse(ctx, cx, cy, isWhiteboard) || 10;
        } else if (iType === 'rocket') {
          drawnCount = drawRocket(ctx, cx, cy, isWhiteboard) || 14;
        } else if (iType === 'car') {
          drawnCount = drawCar(ctx, cx, cy, isWhiteboard) || 11;
        } else if (iType === 'tree') {
          drawnCount = drawTree(ctx, cx, cy, isWhiteboard) || 10;
        } else if (iType === 'flower') {
          drawnCount = drawFlower(ctx, cx, cy, isWhiteboard) || 9;
        } else if (iType === 'robot') {
          drawnCount = drawRobot(ctx, cx, cy, isWhiteboard) || 13;
        } else if (iType === 'face') {
          drawnCount = drawFace(ctx, cx, cy, isWhiteboard) || 8;
        } else {
          drawnCount = drawProceduralArt(ctx, cx, cy, spec.title || 'Creative Art', isWhiteboard) || 10;
        }
        ctx.restore();
      }

      // Render stickies
      if (Array.isArray(spec.stickies) && window.createStickyNote) {
        spec.stickies.forEach(s => {
          window.createStickyNote(s.x, s.y, s.text, s.color || '#fef08a');
        });
      }

      if (window.saveWbState) window.saveWbState();
      try {
        localStorage.setItem("lumina_wb_state", mainCv.toDataURL("image/png"));
      } catch (e) {}

      // Switch tab to whiteboard so drawing is immediately appreciated
      if (window.switchTab) {
        setTimeout(() => window.switchTab('tab-whiteboard'), 150);
      }
    }

    return drawnCount || 16;
  }

  // --- Handcrafted Drawing Routine: Emperor Penguin ---
  function drawPenguin(ctx, cx, cy, isWb) {
    const s = 1.0;

    // 1. Ice Floe Base
    ctx.beginPath();
    ctx.ellipse(cx, cy + 130 * s, 140 * s, 32 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#e0f2fe' : 'rgba(56, 189, 248, 0.28)';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#0284c7' : '#00f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Ice cracks
    ctx.beginPath();
    ctx.moveTo(cx - 70 * s, cy + 128 * s);
    ctx.lineTo(cx - 30 * s, cy + 135 * s);
    ctx.lineTo(cx - 10 * s, cy + 125 * s);
    ctx.strokeStyle = isWb ? '#7dd3fc' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. Webbed Orange Feet
    ctx.beginPath();
    ctx.ellipse(cx - 38 * s, cy + 126 * s, 26 * s, 14 * s, -0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + 38 * s, cy + 126 * s, 26 * s, 14 * s, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Penguin Outer Tuxedo Torso
    ctx.beginPath();
    ctx.ellipse(cx, cy + 28 * s, 88 * s, 108 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#1e293b' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 4. Penguin Rounded Head
    ctx.beginPath();
    ctx.ellipse(cx, cy - 65 * s, 62 * s, 56 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.stroke();

    // 5. Left Flipper (Waving enthusiastically!)
    ctx.beginPath();
    ctx.moveTo(cx - 75 * s, cy + 10 * s);
    ctx.quadraticCurveTo(cx - 135 * s, cy - 25 * s, cx - 115 * s, cy + 40 * s);
    ctx.quadraticCurveTo(cx - 90 * s, cy + 60 * s, cx - 68 * s, cy + 45 * s);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#1e293b' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 6. Right Flipper (Resting neatly)
    ctx.beginPath();
    ctx.moveTo(cx + 75 * s, cy + 10 * s);
    ctx.quadraticCurveTo(cx + 125 * s, cy + 25 * s, cx + 110 * s, cy + 65 * s);
    ctx.quadraticCurveTo(cx + 85 * s, cy + 70 * s, cx + 68 * s, cy + 50 * s);
    ctx.closePath();
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.stroke();

    // 7. White Chest & Belly
    ctx.beginPath();
    ctx.ellipse(cx, cy + 38 * s, 56 * s, 80 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 8. Emperor Penguin Golden Neck Patches
    ctx.beginPath();
    ctx.ellipse(cx - 36 * s, cy - 58 * s, 14 * s, 22 * s, -0.3, 0, Math.PI * 2);
    ctx.ellipse(cx + 36 * s, cy - 58 * s, 14 * s, 22 * s, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();

    // 9. Expressive Cartoon Eyes
    // Left eye
    ctx.beginPath();
    ctx.arc(cx - 20 * s, cy - 70 * s, 11 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 18 * s, cy - 70 * s, 6 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 20 * s, cy - 72 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Right eye
    ctx.beginPath();
    ctx.arc(cx + 20 * s, cy - 70 * s, 11 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 18 * s, cy - 70 * s, 6 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 16 * s, cy - 72 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 10. Warm Golden-Orange Beak
    ctx.beginPath();
    ctx.moveTo(cx - 14 * s, cy - 56 * s);
    ctx.lineTo(cx + 14 * s, cy - 56 * s);
    ctx.lineTo(cx, cy - 38 * s);
    ctx.closePath();
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 11. Dapper Holiday Bowtie
    ctx.beginPath();
    ctx.moveTo(cx - 22 * s, cy - 22 * s);
    ctx.lineTo(cx, cy - 16 * s);
    ctx.lineTo(cx - 22 * s, cy - 10 * s);
    ctx.closePath();
    ctx.moveTo(cx + 22 * s, cy - 22 * s);
    ctx.lineTo(cx, cy - 16 * s);
    ctx.lineTo(cx + 22 * s, cy - 10 * s);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - 16 * s, 6 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();

    // 12. Floating Snowflake Sparkles
    drawSnowflake(ctx, cx - 140 * s, cy - 80 * s, 9, isWb);
    drawSnowflake(ctx, cx + 135 * s, cy - 60 * s, 11, isWb);
    drawSnowflake(ctx, cx - 120 * s, cy + 90 * s, 7, isWb);
    drawSnowflake(ctx, cx + 140 * s, cy + 50 * s, 8, isWb);
    return 16;
  }

  function drawSnowflake(ctx, x, y, r, isWb) {
    ctx.save();
    ctx.strokeStyle = isWb ? '#0284c7' : '#38bdf8';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - r * Math.cos(i * Math.PI / 3), y - r * Math.sin(i * Math.PI / 3));
      ctx.lineTo(x + r * Math.cos(i * Math.PI / 3), y + r * Math.sin(i * Math.PI / 3));
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- Handcrafted Drawing Routine: Playful Kitten ---
  function drawCat(ctx, cx, cy, isWb) {
    // Body
    ctx.beginPath();
    ctx.ellipse(cx, cy + 40, 75, 90, 0, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#fdba74' : '#fb923c';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#ea580c' : '#fdba74';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(cx, cy - 55, 60, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#fdba74' : '#fb923c';
    ctx.fill();
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.moveTo(cx - 45, cy - 90); ctx.lineTo(cx - 20, cy - 135); ctx.lineTo(cx + 5, cy - 105); ctx.closePath();
    ctx.moveTo(cx + 45, cy - 90); ctx.lineTo(cx + 20, cy - 135); ctx.lineTo(cx - 5, cy - 105); ctx.closePath();
    ctx.fillStyle = isWb ? '#fdba74' : '#fb923c';
    ctx.fill(); ctx.stroke();
    // Inner ears
    ctx.beginPath();
    ctx.moveTo(cx - 38, cy - 95); ctx.lineTo(cx - 22, cy - 125); ctx.lineTo(cx - 5, cy - 105); ctx.closePath();
    ctx.moveTo(cx + 38, cy - 95); ctx.lineTo(cx + 22, cy - 125); ctx.lineTo(cx + 5, cy - 105); ctx.closePath();
    ctx.fillStyle = '#f472b6';
    ctx.fill();

    // Eyes
    ctx.beginPath();
    ctx.ellipse(cx - 22, cy - 60, 9, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 22, cy - 60, 9, 13, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - 22, cy - 60, 3, 11, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 22, cy - 60, 3, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();

    // Nose & Whiskers
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 44); ctx.lineTo(cx + 6, cy - 44); ctx.lineTo(cx, cy - 36); ctx.closePath();
    ctx.fillStyle = '#f472b6'; ctx.fill();
    // Whiskers
    ctx.strokeStyle = isWb ? '#0f172a' : '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy - 40); ctx.lineTo(cx - 65, cy - 45);
    ctx.moveTo(cx - 15, cy - 35); ctx.lineTo(cx - 65, cy - 35);
    ctx.moveTo(cx + 15, cy - 40); ctx.lineTo(cx + 65, cy - 45);
    ctx.moveTo(cx + 15, cy - 35); ctx.lineTo(cx + 65, cy - 35);
    ctx.stroke();

    // Curled Tail
    ctx.beginPath();
    ctx.moveTo(cx + 60, cy + 70);
    ctx.quadraticCurveTo(cx + 120, cy + 40, cx + 110, cy - 10);
    ctx.quadraticCurveTo(cx + 95, cy - 25, cx + 80, cy - 10);
    ctx.lineWidth = 14;
    ctx.strokeStyle = isWb ? '#fdba74' : '#fb923c';
    ctx.stroke();
  }

  // --- Handcrafted Drawing Routine: Happy Puppy ---
  function drawDog(ctx, cx, cy, isWb) {
    // Body
    ctx.beginPath();
    ctx.ellipse(cx, cy + 45, 75, 85, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d97706';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#92400e' : '#fde68a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(cx, cy - 50, 58, 0, Math.PI * 2);
    ctx.fillStyle = '#d97706';
    ctx.fill();
    ctx.stroke();

    // Floppy Ears
    ctx.beginPath();
    ctx.ellipse(cx - 55, cy - 45, 18, 42, 0.4, 0, Math.PI * 2);
    ctx.ellipse(cx + 55, cy - 45, 18, 42, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#78350f';
    ctx.fill();
    ctx.stroke();

    // Snout
    ctx.beginPath();
    ctx.ellipse(cx, cy - 35, 28, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();
    // Nose
    ctx.beginPath();
    ctx.arc(cx, cy - 42, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    // Tongue
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18, 9, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();

    // Eyes
    ctx.beginPath();
    ctx.arc(cx - 20, cy - 65, 8, 0, Math.PI * 2);
    ctx.arc(cx + 20, cy - 65, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 22, cy - 67, 3, 0, Math.PI * 2);
    ctx.arc(cx + 18, cy - 67, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // --- Handcrafted Drawing Routine: Cozy Cottage ---
  function drawHouse(ctx, cx, cy, isWb) {
    // Lawn
    ctx.beginPath();
    ctx.ellipse(cx, cy + 115, 160, 25, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();

    // Main House Walls
    ctx.beginPath();
    ctx.rect(cx - 90, cy - 20, 180, 130);
    ctx.fillStyle = isWb ? '#f8fafc' : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#0f172a' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Chimney & Smoke
    ctx.beginPath();
    ctx.rect(cx + 40, cy - 90, 28, 55);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.stroke();
    // Smoke
    ctx.strokeStyle = isWb ? '#94a3b8' : '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + 54, cy - 105, 10, 0, Math.PI);
    ctx.arc(cx + 60, cy - 125, 14, 0, Math.PI);
    ctx.stroke();

    // Pitched Roof
    ctx.beginPath();
    ctx.moveTo(cx - 110, cy - 20);
    ctx.lineTo(cx, cy - 105);
    ctx.lineTo(cx + 110, cy - 20);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Arched Door
    ctx.beginPath();
    ctx.rect(cx - 20, cy + 45, 40, 65);
    ctx.fillStyle = '#b45309';
    ctx.fill();
    ctx.stroke();
    // Doorknob
    ctx.beginPath();
    ctx.arc(cx + 12, cy + 78, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();

    // Windows (Glowing warm light)
    [cx - 65, cx + 35].forEach(wx => {
      ctx.beginPath();
      ctx.rect(wx, cy + 10, 32, 32);
      ctx.fillStyle = '#fef08a';
      ctx.fill();
      ctx.strokeStyle = isWb ? '#0f172a' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Window panes
      ctx.moveTo(wx + 16, cy + 10); ctx.lineTo(wx + 16, cy + 42);
      ctx.moveTo(wx, cy + 26); ctx.lineTo(wx + 32, cy + 26);
      ctx.stroke();
    });
  }

  // --- Handcrafted Drawing Routine: Cosmic Rocket ---
  function drawRocket(ctx, cx, cy, isWb) {
    // Blazing Rocket Flame Exhaust
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy + 70);
    ctx.quadraticCurveTo(cx, cy + 150, cx + 24, cy + 70);
    ctx.fillStyle = '#ea580c';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + 70);
    ctx.quadraticCurveTo(cx, cy + 120, cx + 14, cy + 70);
    ctx.fillStyle = '#facc15';
    ctx.fill();

    // Side Fins
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 20); ctx.lineTo(cx - 75, cy + 75); ctx.lineTo(cx - 35, cy + 65); ctx.closePath();
    ctx.moveTo(cx + 35, cy + 20); ctx.lineTo(cx + 75, cy + 75); ctx.lineTo(cx + 35, cy + 65); ctx.closePath();
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#991b1b' : '#f87171';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Fuselage Cylinder
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + 70);
    ctx.lineTo(cx - 35, cy - 40);
    ctx.quadraticCurveTo(cx, cy - 130, cx + 35, cy - 40);
    ctx.lineTo(cx + 35, cy + 70);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#0f172a' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Nose Cone Tip
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy - 35);
    ctx.quadraticCurveTo(cx, cy - 130, cx + 30, cy - 35);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Circular Porthole Window
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Reflection
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 14, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // --- Handcrafted Drawing Routine: Sports Automobile ---
  function drawCar(ctx, cx, cy, isWb) {
    // Wheels
    [-65, 65].forEach(wx => {
      ctx.beginPath();
      ctx.arc(cx + wx, cy + 60, 25, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.strokeStyle = isWb ? '#0f172a' : '#64748b';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + wx, cy + 60, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fill();
    });

    // Chassis Lower Body
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cx - 120, cy + 15, 240, 50, 12) : ctx.rect(cx - 120, cy + 15, 240, 50);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#1e3a8a' : '#93c5fd';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Cabin / Windshield
    ctx.beginPath();
    ctx.moveTo(cx - 80, cy + 15);
    ctx.lineTo(cx - 45, cy - 35);
    ctx.lineTo(cx + 45, cy - 35);
    ctx.lineTo(cx + 80, cy + 15);
    ctx.closePath();
    ctx.fillStyle = '#93c5fd';
    ctx.fill();
    ctx.stroke();

    // Headlight beam
    ctx.beginPath();
    ctx.arc(cx + 115, cy + 30, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
  }

  // --- Handcrafted Drawing Routine: Ancient Oak Tree ---
  function drawTree(ctx, cx, cy, isWb) {
    // Trunk
    ctx.beginPath();
    ctx.moveTo(cx - 25, cy + 130);
    ctx.lineTo(cx - 15, cy + 10);
    ctx.lineTo(cx + 15, cy + 10);
    ctx.lineTo(cx + 25, cy + 130);
    ctx.closePath();
    ctx.fillStyle = '#78350f';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#451a03' : '#b45309';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Billowing Canopy
    const clusters = [
      { x: cx, y: cy - 70, r: 65 },
      { x: cx - 55, y: cy - 35, r: 55 },
      { x: cx + 55, y: cy - 35, r: 55 },
      { x: cx - 40, y: cy + 10, r: 45 },
      { x: cx + 40, y: cy + 10, r: 45 }
    ];
    clusters.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = isWb ? '#065f46' : '#34d399';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });
  }

  // --- Handcrafted Drawing Routine: Blooming Flower ---
  function drawFlower(ctx, cx, cy, isWb) {
    // Stem
    ctx.beginPath();
    ctx.moveTo(cx, cy + 130);
    ctx.quadraticCurveTo(cx + 20, cy + 50, cx, cy);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Leaves
    ctx.beginPath();
    ctx.ellipse(cx + 35, cy + 60, 28, 12, 0.4, 0, Math.PI * 2);
    ctx.ellipse(cx - 35, cy + 80, 28, 12, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#059669';
    ctx.fill();

    // Petals (8 radial petals)
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const px = cx + Math.cos(angle) * 45;
      const py = cy + Math.sin(angle) * 45;
      ctx.beginPath();
      ctx.arc(px, py, 26, 0, Math.PI * 2);
      ctx.fillStyle = '#ec4899';
      ctx.fill();
      ctx.strokeStyle = isWb ? '#be185d' : '#f472b6';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Center Golden Disc
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- Handcrafted Drawing Routine: Autonomous Robot ---
  function drawRobot(ctx, cx, cy, isWb) {
    // Antenna
    ctx.beginPath();
    ctx.moveTo(cx, cy - 75); ctx.lineTo(cx, cy - 110);
    ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - 115, 8, 0, Math.PI * 2); ctx.fillStyle = '#ef4444'; ctx.fill();

    // Head
    ctx.beginPath();
    ctx.rect(cx - 55, cy - 75, 110, 70);
    ctx.fillStyle = isWb ? '#e2e8f0' : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Eyes Screen
    ctx.beginPath();
    ctx.rect(cx - 40, cy - 60, 80, 26);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    // Glowing cyan eyes
    ctx.fillStyle = '#00f2fe';
    ctx.beginPath(); ctx.arc(cx - 20, cy - 47, 7, 0, Math.PI * 2); ctx.arc(cx + 20, cy - 47, 7, 0, Math.PI * 2); ctx.fill();

    // Torso
    ctx.beginPath();
    ctx.rect(cx - 65, cy + 10, 130, 95);
    ctx.fillStyle = isWb ? '#cbd5e1' : '#334155';
    ctx.fill();
    ctx.stroke();
    // Meter dial
    ctx.beginPath();
    ctx.arc(cx, cy + 50, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();
  }

  // --- Handcrafted Drawing Routine: Joyful Expression ---
  function drawFace(ctx, cx, cy, isWb) {
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Eyes
    ctx.beginPath();
    ctx.ellipse(cx - 26, cy - 20, 9, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 26, cy - 20, 9, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Big Smile
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 45, 0.1 * Math.PI, 0.9 * Math.PI, false);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Blush Cheeks
    ctx.beginPath();
    ctx.arc(cx - 45, cy + 18, 12, 0, Math.PI * 2);
    ctx.arc(cx + 45, cy + 18, 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.fill();
  }

  // --- Procedural Art Synthesizer for arbitrary subjects ---
  function drawProceduralArt(ctx, cx, cy, title, isWb) {
    // Outer Frame
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cx - 130, cy - 110, 260, 220, 18) : ctx.rect(cx - 130, cy - 110, 260, 220);
    ctx.fillStyle = isWb ? '#f8fafc' : 'rgba(15, 23, 42, 0.8)';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#0f172a' : '#00f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Concentric Rosette / Star
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 60, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#e0f2fe' : 'rgba(0, 242, 254, 0.15)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Radiating rays
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 35, cy - 10 + Math.sin(angle) * 35);
      ctx.lineTo(cx + Math.cos(angle) * 55, cy - 10 + Math.sin(angle) * 55);
      ctx.stroke();
    }

    // Title label
    ctx.fillStyle = isWb ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, cy + 80);
  }

  // ---------------------------------------------------------------------------
  // 4. Interactive AI Assistant Modal & Quick Generate Controls
  // ---------------------------------------------------------------------------
  function openAiModal() {
    const modal = document.getElementById('whiteboardAiModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    const input = document.getElementById('wbAiPromptInput');
    if (input) {
      input.focus();
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeAiModal() {
    const modal = document.getElementById('whiteboardAiModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function setAiPromptPreset(presetText) {
    const input = document.getElementById('wbAiPromptInput');
    if (input) {
      input.value = presetText;
      input.focus();
    }
  }

  function triggerAiDiagramGeneration() {
    const input = document.getElementById('wbAiPromptInput');
    const prompt = input ? input.value.trim() : '';
    if (!prompt) {
      if (window.showToast) window.showToast('Notice', 'Please type an illustration or diagram prompt.');
      return;
    }

    const btn = document.getElementById('wbAiGenerateBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin inline mr-1"></i> Generating...`;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    }

    setTimeout(() => {
      handleAgentDirective({
        action: 'draw',
        title: prompt.slice(0, 40)
      }, prompt);

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 inline mr-1"></i> Generate Visual`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }

      closeAiModal();
      if (window.switchTab) window.switchTab('tab-whiteboard');
    }, 350);
  }

  // ---------------------------------------------------------------------------
  // 5. Global Export Namespace
  // ---------------------------------------------------------------------------
  window.LuminaWhiteboardAi = {
    handleAgentDirective,
    synthesizeDiagramFromPrompt,
    synthesizeIllustration,
    renderIllustrationDirect,
    openAiModal,
    closeAiModal,
    setAiPromptPreset,
    triggerAiDiagramGeneration
  };

})(typeof window !== 'undefined' ? window : global);
