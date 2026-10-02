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
        let combinedPrompt = cleanBody || title || '';
        if (title && cleanBody && !cleanBody.toLowerCase().includes(title.toLowerCase())) {
          combinedPrompt = `${title} ${cleanBody}`;
        }
        parsedSpec = synthesizeDiagramFromPrompt(combinedPrompt, type);
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

    // 1. Check for Illustration / Drawing requests (Animals, Objects, Brands, Scenes, Cartoons)
    const isArtSubject = /\b(penguin|emperor\s*penguin|tux|pencil|pen|crayon|marker|cake|birthday\s*cake|cupcake|pastry|dessert|google|google\s*icon|google\s*logo|apple|apple\s*logo|github|octocat|python|python\s*logo|cat|kitten|kitty|dog|puppy|bird|duck|owl|lion|tiger|bear|rabbit|bunny|animal|animals|car|truck|rocket|spaceship|plane|train|ship|boat|house|home|building|castle|tree|forest|flower|sun|moon|star|mountain|river|cloud|face|smile|portrait|robot|android|avatar|person|character|comic|cartoon|doodle|landscape|scene|picture|art|drawing|illustration|icon|logo)\b/i.test(p);
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
    let stickyDetails = '• Handcrafted Vector AI Drawing\n• Mode: Multi-layer vector rendering';

    if (p.includes('penguin') || p.includes('tux') || p.includes('pingu')) {
      illustrationType = 'penguin';
      title = 'Emperor Penguin';
      stickyDetails = '• Species: Emperor Penguin (Aptenodytes forsteri)\n• Mode: Multi-layer vector rendering\n• Anatomy: Tuxedo coat, golden patches, flippers & feet';
    } else if (p.includes('pencil') || p.includes('sketching pencil') || p.includes('lead pencil') || p.includes('pen') || p.includes('crayon') || p.includes('marker')) {
      illustrationType = 'pencil';
      title = 'Artist Pencil';
      stickyDetails = '• Handcrafted Vector AI Drawing\n• Spec: Hexagonal HB graphite pencil with faceted wood, metallic ferrule & eraser\n• Dynamic expressive graphite doodle stroke';
    } else if (p.includes('cake') || p.includes('birthday cake') || p.includes('cupcake') || p.includes('pastry') || p.includes('dessert') || p.includes('gateau')) {
      illustrationType = 'cake';
      title = 'Celebration Cake';
      stickyDetails = '• Handcrafted Vector AI Drawing\n• Spec: Multi-tiered frosted cake with dripping chocolate ganache, glazed cherries & lit candle\n• Illuminated glowing flame with ambient light';
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
    } else if (typeof window !== 'undefined' && window.LuminaWhiteboardVision) {
      const vision = window.LuminaWhiteboardVision;
      const jevAnalysis = vision.jevAnalyzeVisualPrompt ? vision.jevAnalyzeVisualPrompt(prompt) : null;
      const key = jevAnalysis ? jevAnalysis.subjectKey : (vision.resolveSubject(prompt)?.key || 'subject');
      const dispTitle = jevAnalysis ? jevAnalysis.displayTitle : (vision.resolveSubject(prompt)?.title || 'Artwork');
      const category = jevAnalysis ? jevAnalysis.entityCategory : 'general_object';

      illustrationType = key;
      title = dispTitle;

      const tsRes = vision.searchTsLibrary ? vision.searchTsLibrary(key, category) : { found: false };

      if (tsRes && tsRes.found) {
        stickyDetails = `• 🏛️ TypeSafe Blueprint Library Hit\n• Subject: ${dispTitle} (${key})\n• Blueprint: ${tsRes.name || category}\n• Precision Vector Specifications & Multi-layer Rendering`;
      } else {
        stickyDetails = `• 🔬 Jev Autonomous Visual Intelligence\n• Subject: ${dispTitle} (${key})\n• Entity Domain: ${category}\n• Pipeline: Querying Web Visual Knowledge & Reference Imagery\n• Real-time Web-Informed Vector Synthesis`;
      }
    } else {
      illustrationType = 'procedural';
      let clean = prompt.replace(/\b(draw|sketch|paint|doodle|illustrate|me|a|an|the|on|canvas|whiteboard|blackboard|pro)\b/gi, '').trim();
      title = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Creative Artwork';
      stickyDetails = `• Handcrafted Vector Studio Drawing\n• Subject: ${title}\n• Mode: Multi-layer vector rendering`;
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
          text: `🎨 ${title}\n${stickyDetails}`,
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
        if (!ctx.bezierCurveTo) ctx.bezierCurveTo = (cp1x, cp1y, cp2x, cp2y, x, y) => { if (ctx.quadraticCurveTo) ctx.quadraticCurveTo(cp1x, cp1y, x, y); else if (ctx.lineTo) ctx.lineTo(x, y); };
        if (!ctx.rotate) ctx.rotate = () => {};
        if (!ctx.clip) ctx.clip = () => {};
        if (!ctx.createRadialGradient) ctx.createRadialGradient = () => ({ addColorStop: () => {} });

        const w = wrap.clientWidth || 1200;
        const h = wrap.clientHeight || 800;
        const cx = Math.floor(w * 0.45);
        const cy = Math.floor(h * 0.48);
        const isWhiteboard = (window.wbTheme === 'whiteboard');

        ctx.save();
        if (iType === 'penguin') {
          drawnCount = drawPenguin(ctx, cx, cy, isWhiteboard) || 16;
        } else if (iType === 'pencil') {
          drawnCount = drawPencil(ctx, cx, cy, isWhiteboard) || 16;
        } else if (iType === 'cake') {
          drawnCount = drawCake(ctx, cx, cy, isWhiteboard) || 18;
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
        } else if (window.LuminaWhiteboardVision && window.LuminaWhiteboardVision.drawIllustration) {
          drawnCount = window.LuminaWhiteboardVision.drawIllustration(ctx, cx, cy, spec, isWhiteboard) || 16;
        } else {
          drawnCount = drawProceduralArt(ctx, cx, cy, spec.title || 'Creative Art', isWhiteboard) || 14;
        }
        ctx.restore();
      }

      // Render stickies
      if (Array.isArray(spec.stickies) && window.createStickyNote) {
        const wrapW = wrap.clientWidth || 1200;
        spec.stickies.forEach(s => {
          const stickyX = (!s.x || s.x <= 540) ? Math.min(wrapW - 270, Math.floor(wrapW * 0.72)) : s.x;
          const stickyY = (!s.y || s.y <= 180) ? 120 : s.y;
          window.createStickyNote(stickyX, stickyY, s.text, s.color || '#fef08a');
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

  // --- Handcrafted Drawing Routine: Artist Pencil ---
  function drawPencil(ctx, cx, cy, isWb) {
    ctx.save();

    // Slanted artist pencil angle (-35 degrees)
    const angle = -0.62;
    const bodyLen = 220;
    const bodyW = 34;
    const ferruleLen = 30;
    const eraserLen = 38;
    const coneLen = 65;

    // Draw wavy sketch stroke curling out from the pencil tip first
    const tipX = cx - 135;
    const tipY = cy + 90;

    // 1. Expressive Graphite Sketch Line curving on the canvas
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.bezierCurveTo(tipX - 60, tipY + 45, tipX - 110, tipY - 20, tipX - 80, tipY - 80);
    ctx.bezierCurveTo(tipX - 50, tipY - 140, tipX + 20, tipY - 110, tipX + 50, tipY - 150);
    ctx.strokeStyle = isWb ? '#334155' : 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Graphite accent sketch hatch marks
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const hx = tipX - 40 - i * 14;
      const hy = tipY + 15 + i * 8;
      ctx.moveTo(hx - 8, hy - 8);
      ctx.lineTo(hx + 8, hy + 8);
    }
    ctx.strokeStyle = isWb ? '#64748b' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Move to pencil anchor and rotate
    ctx.translate(cx + 30, cy - 20);
    ctx.rotate(angle);

    // 2. Rubber Eraser End Cap
    const eraserX = bodyLen / 2 + ferruleLen;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(eraserX, -bodyW / 2, eraserLen, bodyW, [0, 8, 8, 0]) : ctx.rect(eraserX, -bodyW / 2, eraserLen, bodyW);
    ctx.fillStyle = '#f43f5e'; // Vibrant pink eraser
    ctx.fill();
    ctx.strokeStyle = '#be123c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Eraser highlight
    ctx.beginPath();
    ctx.moveTo(eraserX + 4, -bodyW / 2 + 5);
    ctx.lineTo(eraserX + eraserLen - 6, -bodyW / 2 + 5);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 3. Polished Metallic Ferrule Band
    const ferruleX = bodyLen / 2;
    ctx.beginPath();
    ctx.rect(ferruleX, -bodyW / 2, ferruleLen, bodyW);
    ctx.fillStyle = '#cbd5e1'; // Silver/aluminum metal
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Ferrule crimped ribs / ring grooves
    [-ferruleLen * 0.25, 0, ferruleLen * 0.25].forEach(offset => {
      ctx.beginPath();
      ctx.moveTo(ferruleX + ferruleLen / 2 + offset, -bodyW / 2);
      ctx.lineTo(ferruleX + ferruleLen / 2 + offset, bodyW / 2);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 4. Hexagonal Wooden Pencil Body (3-D faceted bevels)
    const shaftX = -bodyLen / 2;
    const facetH = bodyW / 3;

    // Top Facet (Highlighted bevel)
    ctx.beginPath();
    ctx.rect(shaftX, -bodyW / 2, bodyLen, facetH);
    ctx.fillStyle = '#fcd34d'; // bright golden amber
    ctx.fill();

    // Center Facet (Main face)
    ctx.beginPath();
    ctx.rect(shaftX, -bodyW / 2 + facetH, bodyLen, facetH);
    ctx.fillStyle = '#f59e0b'; // rich amber
    ctx.fill();

    // Bottom Facet (Shaded bevel)
    ctx.beginPath();
    ctx.rect(shaftX, -bodyW / 2 + facetH * 2, bodyLen, facetH);
    ctx.fillStyle = '#d97706'; // darker amber shadow
    ctx.fill();

    // Shaft Outer Border
    ctx.beginPath();
    ctx.rect(shaftX, -bodyW / 2, bodyLen, bodyW);
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Facet Divider Lines
    ctx.beginPath();
    ctx.moveTo(shaftX, -bodyW / 2 + facetH);
    ctx.lineTo(shaftX + bodyLen, -bodyW / 2 + facetH);
    ctx.moveTo(shaftX, -bodyW / 2 + facetH * 2);
    ctx.lineTo(shaftX + bodyLen, -bodyW / 2 + facetH * 2);
    ctx.strokeStyle = 'rgba(180, 83, 9, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gold Foil Stamped Lettering
    ctx.save();
    ctx.fillStyle = '#78350f';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LUMINA NO. 2 • HB SOFT GRAPHITE', 0, 3);
    ctx.restore();

    // 5. Sharpened Wood Cone Collar (Cedar Wood Grain)
    const collarTipX = shaftX - coneLen;
    ctx.beginPath();
    ctx.moveTo(shaftX, -bodyW / 2);
    // Scalloped cut where sharpener met wood
    ctx.quadraticCurveTo(shaftX - 6, -bodyW / 4, shaftX, 0);
    ctx.quadraticCurveTo(shaftX - 6, bodyW / 4, shaftX, bodyW / 2);
    ctx.lineTo(collarTipX, 0);
    ctx.closePath();
    ctx.fillStyle = '#fde68a'; // Natural cedar wood
    ctx.fill();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Wood shaving grain lines
    ctx.beginPath();
    ctx.moveTo(shaftX - 12, -bodyW / 3); ctx.lineTo(collarTipX + 18, -3);
    ctx.moveTo(shaftX - 12, bodyW / 3); ctx.lineTo(collarTipX + 18, 3);
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 6. Sharpened Graphite Lead Cone Tip
    ctx.beginPath();
    ctx.moveTo(collarTipX + 18, -bodyW * 0.16);
    ctx.lineTo(collarTipX - 6, 0);
    ctx.lineTo(collarTipX + 18, bodyW * 0.16);
    ctx.closePath();
    ctx.fillStyle = '#1e293b'; // Dark graphite
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Graphite metallic shine reflection
    ctx.beginPath();
    ctx.moveTo(collarTipX + 14, -bodyW * 0.08);
    ctx.lineTo(collarTipX, 0);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
    return 16;
  }

  // --- Handcrafted Drawing Routine: Celebration Cake ---
  function drawCake(ctx, cx, cy, isWb) {
    ctx.save();
    const s = 1.0;

    // 1. Ceramic Pedestal Cake Stand Base & Stem
    // Foot
    ctx.beginPath();
    ctx.ellipse(cx, cy + 130 * s, 65 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#e2e8f0' : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#94a3b8' : '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Pedestal stem column
    ctx.beginPath();
    ctx.moveTo(cx - 16 * s, cy + 128 * s);
    ctx.quadraticCurveTo(cx - 8 * s, cy + 110 * s, cx - 18 * s, cy + 96 * s);
    ctx.lineTo(cx + 18 * s, cy + 96 * s);
    ctx.quadraticCurveTo(cx + 8 * s, cy + 110 * s, cx + 16 * s, cy + 128 * s);
    ctx.closePath();
    ctx.fillStyle = isWb ? '#f1f5f9' : '#334155';
    ctx.fill();
    ctx.stroke();

    // Main serving platter plate
    ctx.beginPath();
    ctx.ellipse(cx, cy + 96 * s, 130 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#ffffff' : '#0f172a';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#94a3b8' : '#00f2fe';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 2. Bottom Cake Tier (Spacious Layer)
    const bW = 190 * s;
    const bH = 65 * s;
    const bY = cy + 32 * s;

    // Cylinder body
    ctx.beginPath();
    ctx.rect(cx - bW / 2, bY, bW, bH);
    ctx.fillStyle = isWb ? '#fdf2f8' : '#831843'; // Rose cream / berry sponge
    ctx.fill();
    ctx.strokeStyle = isWb ? '#f472b6' : '#ec4899';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Bottom tier top surface
    ctx.beginPath();
    ctx.ellipse(cx, bY, bW / 2, 18 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#fce7f3' : '#9d174d';
    ctx.fill();
    ctx.stroke();

    // Decorative piping bead border along platter
    const beads = 12;
    for (let i = 0; i <= beads; i++) {
      const bx = cx - bW / 2 + (i * bW) / beads;
      ctx.beginPath();
      ctx.arc(bx, bY + bH, 6 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 3. Top Cake Tier (Upper Layer)
    const tW = 125 * s;
    const tH = 55 * s;
    const tY = cy - 25 * s;

    // Cylinder body
    ctx.beginPath();
    ctx.rect(cx - tW / 2, tY, tW, tH);
    ctx.fillStyle = isWb ? '#fce7f3' : '#be185d';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#ec4899' : '#f472b6';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Top tier surface
    ctx.beginPath();
    ctx.ellipse(cx, tY, tW / 2, 14 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#ffffff' : '#f472b6';
    ctx.fill();
    ctx.stroke();

    // 4. Dripping Chocolate Ganache
    ctx.beginPath();
    ctx.moveTo(cx - tW / 2, tY + 2);
    // Flowing drips across front
    const drips = [14, 26, 12, 32, 16, 28, 10];
    const segW = tW / (drips.length - 1);
    for (let i = 0; i < drips.length - 1; i++) {
      const x0 = cx - tW / 2 + i * segW;
      const x1 = x0 + segW;
      const dripLen = drips[i] * s;
      ctx.bezierCurveTo(x0 + segW * 0.3, tY + dripLen, x0 + segW * 0.7, tY + dripLen, x1, tY + 2);
    }
    ctx.lineTo(cx + tW / 2, tY);
    ctx.ellipse(cx, tY, tW / 2, 14 * s, 0, 0, Math.PI, true);
    ctx.closePath();
    ctx.fillStyle = '#78350f'; // Rich chocolate ganache
    ctx.fill();

    // 5. Whipped Cream Rosettes & Glazed Red Cherries along top rim
    const rosetteCount = 5;
    for (let i = 0; i < rosetteCount; i++) {
      const rx = cx - 44 * s + i * 22 * s;
      const ry = tY - 4 * s;

      // Puffy cream swirl
      ctx.beginPath();
      ctx.arc(rx, ry, 7 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Shiny red cherry
      ctx.beginPath();
      ctx.arc(rx, ry - 6 * s, 5.5 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#b91c1c';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Specular highlight on cherry
      ctx.beginPath();
      ctx.arc(rx - 1.8 * s, ry - 7.5 * s, 1.5 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Curved green cherry stem
      ctx.beginPath();
      ctx.moveTo(rx, ry - 11 * s);
      ctx.quadraticCurveTo(rx + 4 * s, ry - 16 * s, rx + 7 * s, ry - 18 * s);
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 6. Central Festive Birthday Candle
    const cW = 10 * s;
    const cH = 46 * s;
    const cX = cx - cW / 2;
    const cY = tY - cH - 5 * s;

    // Candle body
    ctx.beginPath();
    ctx.rect(cX, cY, cW, cH);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Diagonal candy-cane stripes
    ctx.save();
    ctx.beginPath();
    ctx.rect(cX, cY, cW, cH);
    ctx.clip();
    for (let y = cY - 10; y < cY + cH + 10; y += 10) {
      ctx.beginPath();
      ctx.moveTo(cX - 2, y);
      ctx.lineTo(cX + cW + 2, y + 8);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
    ctx.restore();

    // Candle black wick
    ctx.beginPath();
    ctx.moveTo(cx, cY);
    ctx.lineTo(cx, cY - 7 * s);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 7. Ambient Golden Light Halo Aura
    const flameBaseY = cY - 8 * s;
    const grad = ctx.createRadialGradient(cx, flameBaseY - 10 * s, 4 * s, cx, flameBaseY - 10 * s, 32 * s);
    grad.addColorStop(0, 'rgba(254, 240, 138, 0.6)');
    grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.25)');
    grad.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.beginPath();
    ctx.arc(cx, flameBaseY - 10 * s, 32 * s, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 8. Glowing Teardrop Flame (Outer amber, inner bright gold)
    ctx.beginPath();
    ctx.moveTo(cx, flameBaseY);
    ctx.quadraticCurveTo(cx - 9 * s, flameBaseY - 10 * s, cx, flameBaseY - 26 * s);
    ctx.quadraticCurveTo(cx + 9 * s, flameBaseY - 10 * s, cx, flameBaseY);
    ctx.closePath();
    ctx.fillStyle = '#f97316'; // Vivid orange flame
    ctx.fill();

    // Inner bright yellow flame core
    ctx.beginPath();
    ctx.moveTo(cx, flameBaseY - 2 * s);
    ctx.quadraticCurveTo(cx - 5 * s, flameBaseY - 9 * s, cx, flameBaseY - 20 * s);
    ctx.quadraticCurveTo(cx + 5 * s, flameBaseY - 9 * s, cx, flameBaseY - 2 * s);
    ctx.closePath();
    ctx.fillStyle = '#fef08a'; // White-hot core
    ctx.fill();

    // 9. Floating Confetti Celebratory Sparkles
    const confetti = [
      { x: cx - 110 * s, y: cy - 70 * s, color: '#f43f5e', r: 4 },
      { x: cx + 115 * s, y: cy - 60 * s, color: '#fbbf24', r: 3.5 },
      { x: cx - 80 * s, y: cy - 110 * s, color: '#00f2fe', r: 4.5 },
      { x: cx + 85 * s, y: cy - 100 * s, color: '#a855f7', r: 3 },
      { x: cx - 125 * s, y: cy + 10 * s, color: '#10b981', r: 4 },
      { x: cx + 120 * s, y: cy + 20 * s, color: '#f43f5e', r: 3.5 }
    ];
    confetti.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
    });

    ctx.restore();
    return 18;
  }

  // --- Procedural Art Synthesizer: Authentic Studio Easel & Canvas ---
  function drawProceduralArt(ctx, cx, cy, title, isWb) {
    ctx.save();

    // 1. Artist Wooden Easel Legs
    ctx.beginPath();
    // Left leg
    ctx.moveTo(cx - 5, cy - 120); ctx.lineTo(cx - 105, cy + 135);
    // Right leg
    ctx.moveTo(cx + 5, cy - 120); ctx.lineTo(cx + 105, cy + 135);
    // Center back leg
    ctx.moveTo(cx, cy - 120); ctx.lineTo(cx, cy + 130);
    // Shelf crossbar
    ctx.moveTo(cx - 115, cy + 50); ctx.lineTo(cx + 115, cy + 50);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 2. Stretched Art Canvas Board sitting on easel shelf
    const cW = 200;
    const cH = 140;
    const cX = cx - cW / 2;
    const cY = cy - 75;

    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cX, cY, cW, cH, 8) : ctx.rect(cX, cY, cW, cH);
    ctx.fillStyle = isWb ? '#ffffff' : '#0f172a';
    ctx.fill();
    ctx.strokeStyle = isWb ? '#cbd5e1' : '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 3. Canvas Landscape Sunset / Artistic Sky Painting
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(cX + 6, cY + 6, cW - 12, cH - 12, 4) : ctx.rect(cX + 6, cY + 6, cW - 12, cH - 12);
    ctx.clip();

    // Sunset gradient sky
    const skyGrad = ctx.createLinearGradient(cX, cY, cX, cY + cH);
    skyGrad.addColorStop(0, '#f43f5e');
    skyGrad.addColorStop(0.4, '#fb923c');
    skyGrad.addColorStop(0.7, '#fde047');
    skyGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(cX, cY, cW, cH);

    // Golden sun setting
    ctx.beginPath();
    ctx.arc(cx, cY + 70, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fill();

    // Silhouette mountains
    ctx.beginPath();
    ctx.moveTo(cX, cY + cH);
    ctx.lineTo(cX + 40, cY + 65);
    ctx.lineTo(cX + 90, cY + 95);
    ctx.lineTo(cX + 140, cY + 55);
    ctx.lineTo(cX + cW, cY + 90);
    ctx.lineTo(cX + cW, cY + cH);
    ctx.closePath();
    ctx.fillStyle = '#1e1b4b';
    ctx.fill();
    ctx.restore();

    // 4. Wooden Artist Painter's Palette (Resting by the easel shelf)
    const px = cx + 85;
    const py = cy + 65;
    ctx.beginPath();
    ctx.ellipse(px, py, 38, 26, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#d97706';
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Thumbhole
    ctx.beginPath();
    ctx.arc(px - 16, py + 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = isWb ? '#f8fafc' : '#020617';
    ctx.fill();
    ctx.stroke();

    // Paint Blobs on palette (Crimson, Gold, Cyan, Emerald, Violet)
    const blobs = [
      { dx: -10, dy: -12, c: '#ef4444' },
      { dx: 6, dy: -14, c: '#f59e0b' },
      { dx: 20, dy: -8, c: '#00f2fe' },
      { dx: 22, dy: 8, c: '#10b981' },
      { dx: 8, dy: 14, c: '#a855f7' }
    ];
    blobs.forEach(b => {
      ctx.beginPath();
      ctx.arc(px + b.dx, py + b.dy, 4, 0, Math.PI * 2);
      ctx.fillStyle = b.c;
      ctx.fill();
    });

    // 5. Paintbrush resting across palette
    ctx.beginPath();
    ctx.moveTo(px - 32, py + 26);
    ctx.lineTo(px + 36, py - 24);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Metal ferrule
    ctx.beginPath();
    ctx.moveTo(px + 26, py - 16); ctx.lineTo(px + 32, py - 21);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 4; ctx.stroke();
    // Blue tip
    ctx.beginPath();
    ctx.arc(px + 37, py - 25, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00f2fe'; ctx.fill();

    // Title label
    ctx.fillStyle = isWb ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, cy + 115);

    ctx.restore();
    return 14;
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
