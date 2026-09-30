// modules/whiteboard-ai.js - AI Whiteboard Agent Directives & Cognitive Diagram Synthesizer
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
          // If JSON parsing fails, fall back to algorithmic synthesizer
        }
      }

      // If no valid JSON provided, synthesize diagram from intent & prompt
      if (!parsedSpec) {
        parsedSpec = synthesizeDiagramFromPrompt(title + ' ' + cleanBody, type);
      }

      if (parsedSpec) {
        parsedSpec.title = parsedSpec.title || title;
        parsedSpec.clearFirst = clearFirst;

        // Render onto canvas
        if (window.LuminaWhiteboard && window.LuminaWhiteboard.drawDiagram) {
          window.LuminaWhiteboard.drawDiagram(parsedSpec);
        } else if (window.LuminaWhiteboardGallery && window.LuminaWhiteboardGallery.renderDiagramDirect) {
          window.LuminaWhiteboardGallery.renderDiagramDirect(parsedSpec);
        }

        result.nodeCount = (parsedSpec.nodes || []).length;
        result.connectorCount = (parsedSpec.connectors || []).length;
        result.stickyCount = (parsedSpec.stickies || []).length;
        result.summary = `Rendered "${parsedSpec.title}" with ${result.nodeCount} node(s), ${result.connectorCount} connector(s), and ${result.stickyCount} sticky note(s).`;

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
  // 2. Cognitive Diagram Synthesizer (Rule-Based & Semantic Generator)
  // ---------------------------------------------------------------------------
  function synthesizeDiagramFromPrompt(prompt = '', categoryHint = 'architecture') {
    const p = prompt.toLowerCase();

    // Check for matched template keyword
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

    // Dynamic Generic Flowchart Synthesis
    return generateCustomFlowchart(prompt);
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
  // 3. Interactive AI Assistant Modal & Quick Generate Controls
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
      if (window.showToast) window.showToast('Notice', 'Please type a diagram description or choose a blueprint.');
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
        btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 inline mr-1"></i> Generate Diagram`;
        if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      }

      closeAiModal();
      if (window.switchTab) window.switchTab('tab-whiteboard');
    }, 350);
  }

  // ---------------------------------------------------------------------------
  // 4. Global Export Namespace
  // ---------------------------------------------------------------------------
  window.LuminaWhiteboardAi = {
    handleAgentDirective,
    synthesizeDiagramFromPrompt,
    openAiModal,
    closeAiModal,
    setAiPromptPreset,
    triggerAiDiagramGeneration
  };

})(typeof window !== 'undefined' ? window : global);
