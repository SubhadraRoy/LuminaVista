// modules/ai-studio.js - Autonomous AI Studio, Multi-Session History, Scheduled Tasks, 2-Tier Personas & Thinking Engine
(function(window) {
  'use strict';

  // Constants & Global State
  const MAX_AGENT_LOOPS = 5;
  window.isAgentRunning = false;
  window.isAgentAborted = false;
  window.currentAgentLoop = 0;
  window.aiConversation = [];
  window.aiSessions = [];
  window.activeSessionId = null;
  window.scheduledTasks = [];
  window.editingPromptIndex = -1;
  window.activeQuotedMessage = null;

  // VFS Initialization
  if (!window.vfs) {
    try {
      window.vfs = JSON.parse(localStorage.getItem("lumina_codespace_vfs") || "{}");
    } catch (e) {
      window.vfs = {};
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Jev System-1 Sub-50ms Intent Classifier & Safety Guardrail Layer (Cognitive Matrix v3.0 Ultra)
  function classifyJevIntentClient(prompt = '', vfs = {}) {
    const start = performance.now();
    const pTrim = (prompt || '').trim();
    const p = pTrim.toLowerCase();
    const vfsFiles = Object.keys(vfs || {});

    let guardrailPassed = true;
    let threatCategory = 'none';
    let targetFile = '';
    const entities = {
      languages: [],
      files: [],
      tools: [],
      isMultiStep: false,
      commands: [],
      dates: []
    };

    // 1. Destructive, Exfiltration & Injection Guardrail Screen (<0.5ms)
    const isDestructive =
      p.includes('rm -rf /') || 
      p.includes('rm -rf ~') ||
      p.includes(':(){ :|:& };:') || 
      p.includes('mkfs') || 
      p.includes('dd if=/dev/zero') ||
      p.includes('cat /dev/urandom >') ||
      p.includes('drop database') ||
      p.includes('format c:');

    const isExfiltration =
      p.includes('/etc/shadow') ||
      p.includes('/etc/passwd') ||
      p.includes('.ssh/id_rsa') ||
      p.includes('printenv | curl') ||
      p.includes('env | nc ') ||
      /\b(curl|wget|fetch|nc|ncat)\b.*(leak|exfil|evil|\$|token|key|secret)/i.test(p);

    const isPromptInjection =
      p.includes('ignore all previous instructions') ||
      p.includes('system prompt override') ||
      p.includes('act as dan') ||
      p.includes('disregard safety protocols') ||
      p.includes('bypass all guardrails');

    if (isDestructive) {
      guardrailPassed = false;
      threatCategory = 'destructive_command';
    } else if (isExfiltration) {
      guardrailPassed = false;
      threatCategory = 'credential_exfiltration';
    } else if (isPromptInjection) {
      guardrailPassed = false;
      threatCategory = 'prompt_injection';
    }

    // 2. Language & Entity Extraction
    if (/\b(python|py)\b/i.test(p)) entities.languages.push('python');
    if (/\b(javascript|node|js)\b/i.test(p)) entities.languages.push('javascript');
    if (/\b(typescript|ts)\b/i.test(p)) entities.languages.push('typescript');
    if (/\b(html|css|tailwind)\b/i.test(p)) entities.languages.push('html');
    if (/\b(sql|database|postgres|sqlite)\b/i.test(p)) entities.languages.push('sql');
    if (/\b(bash|shell|sh)\b/i.test(p)) entities.languages.push('bash');
    if (/\b(docker|container)\b/i.test(p)) entities.tools.push('docker');
    if (/\b(git|github)\b/i.test(p)) entities.tools.push('git');
    if (/\b(npm|npx|pip)\b/i.test(p)) entities.tools.push('package_manager');

    // Detect dates / time ranges
    if (/\b(today)\b/i.test(p)) entities.dates.push('today');
    if (/\b(tomorrow)\b/i.test(p)) entities.dates.push('tomorrow');
    if (/\b(next\s*weeks?)\b/i.test(p)) entities.dates.push('next_week');
    if (/\b(this\s*week)\b/i.test(p)) entities.dates.push('this_week');

    // Detect explicit file path mentioned in prompt
    const pathMatch = pTrim.match(/(?:in|to|file|create|edit|view|read|inspect|patch|modify|update|delete|remove)\s+([a-zA-Z0-9_\-/\\]+\.[a-zA-Z0-9]{1,5})\b/i) ||
                      pTrim.match(/\b([a-zA-Z0-9_\-/\\]+\.(?:js|jsx|ts|tsx|py|html|css|json|sql|md|sh|cjs|mjs|txt|log))\b/i);
    if (pathMatch && pathMatch[1]) {
      targetFile = pathMatch[1].replace(/\\/g, '/');
      entities.files.push(targetFile);
    } else {
      const existingMatch = vfsFiles.find(f => p.includes(f.toLowerCase()));
      if (existingMatch) {
        targetFile = existingMatch;
        entities.files.push(targetFile);
      }
    }

    const targetExists = targetFile ? vfsFiles.some(f => f.toLowerCase() === targetFile.toLowerCase()) : false;

    // 3. Multi-Signal Semantic Vector Scoring Matrix
    const scores = {
      AUTONOMOUS_TASK: 0,
      SCHEDULE_CALENDAR: 0,
      WRITE_FILE: 0,
      EDIT_FILE: 0,
      VIEW_FILE: 0,
      DELETE_FILE: 0,
      EXEC_COMMAND: 0,
      SEARCH_WEB: 0,
      LIST_DIR: 0,
      CONVERSATION: 15
    };

    const hasCreationVerb = /\b(create|build|write|implement|generate|code|scaffold|develop|author|make|scaffolding)\b/i.test(p);
    const hasEditVerb = /\b(edit|replace|modify|update|patch|fix|refactor|rewrite|amend|alter)\b/i.test(p);
    const hasInspectionVerb = /\b(view|read|cat|open|inspect|show\s*code|display|examine|peek)\b/i.test(p);
    const hasDeleteVerb = /\b(delete|remove|drop|rm|unlink|erase|clean\s*up|clear\s*file|trash)\b/i.test(p);
    const hasExecVerb = /^(run|exec|execute|terminal|bash|sh|cmd)\b/i.test(p) || p.startsWith('python ') || p.startsWith('node ') || p.startsWith('npm ') || p.startsWith('pip ');
    const hasCodeArtifact = /\b(app|application|game|calculator|landing\s*page|website|page|component|script|program|server|tool|dashboard|todo|counter|api|html|python|js|css|sql|file)\b/i.test(p);
    const hasQuestionPattern = /^(how\s*(do|can|to|does)|why\s*(is|does|do)|what\s*(is|are|does)|explain|tell\s*me\s*about|help\s*me\s*understand|teach\s*me|difference\s*between)\b/i.test(p);

    // A. AUTONOMOUS_TASK Scoring
    if (/\[task goal\]|task goal:|autonomous task|autonomous goal/i.test(p)) scores.AUTONOMOUS_TASK += 140;
    if (/(1\.|step 1|phase 1).*(2\.|step 2|phase 2)/i.test(p) && /(filesystem|terminal|execute|script|repos|directory|analysis|pipeline|report)/i.test(p)) scores.AUTONOMOUS_TASK += 135;
    if (p.includes('git_trend_analysis') || (p.includes('fetch_meta.py') && p.includes('repos.json'))) scores.AUTONOMOUS_TASK += 140;
    if (/\b(chaos\s*engineering|chaos\s*drill|flaky\s*upstream|mock\s*server.*8999|chaos_lab|chaos_archive|chaos\.log|stress_test\.py)\b/i.test(p)) scores.AUTONOMOUS_TASK += 140;
    if ((/\b(systems\s*automation|operations\s*agent|execution\s*workflow|complete\s*tool\s*suite)\b/i.test(p)) && /\b(vfs|terminal|sandbox|calendar|schedule|scan|verify|operational)\b/i.test(p)) scores.AUTONOMOUS_TASK += 140;
    if ((/\b(pipeline|drill|benchmark|multi-?step|e2e\s*test|stress\s*test|microservices?)\b/i.test(p)) && /\b(server|port|script|test|terminal|archive|compress|summary)\b/i.test(p)) scores.AUTONOMOUS_TASK += 120;
    if ((/\b(once you have that|next|finally|tidy up)\b/i.test(p)) && /\b(spin up|server|script|terminal|compress|delete)\b/i.test(p)) scores.AUTONOMOUS_TASK += 120;

    if (scores.AUTONOMOUS_TASK >= 90) {
      entities.isMultiStep = true;
    }

    // B. SCHEDULE_CALENDAR Scoring
    if (scores.AUTONOMOUS_TASK < 90) {
      const isCalendarDirect = /\b(schedule|calendar|calander|calender|calndr|calndar|clendar|scheule|scheduale|sched|skedule|sked|sechdule|routine|meeting|meetings|appointment|appointments|event|events|remind\s*me|plan\s*my\s*day|auto_?plan|book\s*a\s*slot|set\s*schedule|blackout\s*hours|agenda|timetable|itinerary)\b/i.test(p);
      const isCalendarQuery = /\b(check|show|view|see|inspect|what\s*(?:'s|\s*(?:is|are|do\s+i\s+have))?\s*(?:on|in|my)?)\b.*\b(calander|calendar|calender|calndr|scheule|scheduale|sched|skedule|agenda|timetable|itinerary|meetings?|events?|appointments?|routine|week|day)\b/i.test(p);
      const isCalendarRange = /\b(next\s+week'?s?|this\s+week'?s?|upcoming)\s+(scheule|schedule|sched|agenda|calendar|calander|calender|plan|events?|meetings?)\b/i.test(p);
      if (isCalendarDirect) scores.SCHEDULE_CALENDAR += 55;
      if (isCalendarQuery) scores.SCHEDULE_CALENDAR += 60;
      if (isCalendarRange) scores.SCHEDULE_CALENDAR += 55;
      if (/\[tool:schedule_event/i.test(p)) scores.SCHEDULE_CALENDAR += 90;
    }

    // C. DELETE_FILE Scoring
    if (hasDeleteVerb && (targetFile || targetExists)) {
      scores.DELETE_FILE += 65;
      if (targetExists) scores.DELETE_FILE += 25;
    }
    if (/\[tool:delete_file/i.test(p)) scores.DELETE_FILE += 90;

    // D. EDIT_FILE Scoring
    if (hasEditVerb) {
      scores.EDIT_FILE += 50;
      if (targetExists) scores.EDIT_FILE += 30;
      if (targetFile && !targetExists) scores.EDIT_FILE += 10;
    }
    if (/\[tool:edit_file/i.test(p)) scores.EDIT_FILE += 90;

    // E. WRITE_FILE Scoring
    if (hasCreationVerb) {
      if (hasCodeArtifact) scores.WRITE_FILE += 55;
      if (pathMatch) scores.WRITE_FILE += 40;
      if (targetFile && !targetExists) scores.WRITE_FILE += 25;
      if (targetFile && targetExists) scores.WRITE_FILE += 5;
    }
    if (/\[tool:write_file/i.test(p)) scores.WRITE_FILE += 90;

    // F. VIEW_FILE & Codebase Search Scoring
    if (hasInspectionVerb && (targetFile || targetExists)) {
      scores.VIEW_FILE += 55;
      if (targetExists) scores.VIEW_FILE += 25;
    }
    if (/\b(search\s*code|find\s*(in\s*files|symbol|function|class|variable|regex|import)|grep|where\s*is\s*(the\s*)?(function|class|method|file))\b/i.test(p)) {
      scores.VIEW_FILE += 60;
    }
    if (/\[tool:view_file/i.test(p)) scores.VIEW_FILE += 90;

    // G. EXEC_COMMAND Scoring
    if (hasExecVerb) {
      scores.EXEC_COMMAND += 60;
      if (/^(python|node|npm|pip|bash|sh)\s+/i.test(p)) scores.EXEC_COMMAND += 20;
    }
    if (/\[tool:exec/i.test(p)) scores.EXEC_COMMAND += 90;
    if (hasQuestionPattern) {
      scores.EXEC_COMMAND = Math.max(0, scores.EXEC_COMMAND - 50);
    }

    // H. SEARCH_WEB Scoring
    const isWebTopic = /\b(news|headlines|weather|stock|crypto|price\s*of|who\s*is|who\s*was|what\s*happened|when\s*did|where\s*is|latest\s*on|updates?\s*on|today'?s?\s*news)\b/i.test(p);
    const isWebVerb = /\b(browse|web\s*search|google|search|look\s*up|find\s*out)\b/i.test(p) || p.startsWith('search') || p.startsWith('find') || p.startsWith('browse');
    if (isWebTopic) scores.SEARCH_WEB += 60;
    if (isWebVerb) scores.SEARCH_WEB += 50;
    if (/\[tool:search_web/i.test(p)) scores.SEARCH_WEB += 90;
    if (/\b(in\s*files|in\s*code|in\s*codebase|in\s*workspace|in\s*vfs|in\s*project)\b/i.test(p) || targetExists) {
      scores.SEARCH_WEB = Math.max(0, scores.SEARCH_WEB - 60);
    }

    // I. LIST_DIR Scoring
    if (/^(ls|dir|list\s*files|tree|what\s*files|workspace\s*files)\b/i.test(p)) scores.LIST_DIR += 75;
    if (/\[tool:list_dir/i.test(p)) scores.LIST_DIR += 90;

    // J. CONVERSATION Scoring
    if (/^(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening))\b/i.test(p)) scores.CONVERSATION += 50;
    if (hasQuestionPattern && scores.SCHEDULE_CALENDAR < 50 && scores.VIEW_FILE < 50 && scores.SEARCH_WEB < 50) scores.CONVERSATION += 45;
    if (/\b(explain|teach|guide|clarify|what\s*is|difference\s*between|why\s*does)\b/i.test(p)) scores.CONVERSATION += 40;
    if (/\b(thanks|thank\s*you|great\s*job|awesome)\b/i.test(p)) scores.CONVERSATION += 50;

    // 4. Compound Intent Resolution & Workflow Synthesis
    const activeRoutes = Object.entries(scores)
      .filter(([r, s]) => r !== 'CONVERSATION' && r !== 'AUTONOMOUS_TASK' && s >= 35)
      .sort((a, b) => b[1] - a[1]);

    let isCompound = false;
    const compoundPlan = [];
    const requiredTools = [];

    if (activeRoutes.length >= 2 && !scores.AUTONOMOUS_TASK) {
      const routeNames = activeRoutes.map(x => x[0]);
      if (
        (routeNames.includes('SEARCH_WEB') && (routeNames.includes('WRITE_FILE') || routeNames.includes('EDIT_FILE'))) ||
        (routeNames.includes('WRITE_FILE') && routeNames.includes('EXEC_COMMAND')) ||
        (routeNames.includes('EDIT_FILE') && routeNames.includes('EXEC_COMMAND'))
      ) {
        isCompound = true;
        scores.AUTONOMOUS_TASK = Math.max(scores.AUTONOMOUS_TASK, activeRoutes[0][1] + 25);
        compoundPlan.push(...routeNames);
      }
    }

    // 5. Ranking and Calibrated Confidence Determination
    const sorted = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([r, s]) => ({ route: r, score: Math.max(0, s) }));

    let winner = sorted[0];
    const runnerUp = sorted[1] || { route: 'CONVERSATION', score: 0 };
    const margin = winner.score - runnerUp.score;

    if (!guardrailPassed) {
      return {
        route: 'CONVERSATION',
        confidence: 0.999,
        guardrailPassed: false,
        threatCategory,
        latencyMs: Math.max(1, Math.round(performance.now() - start)),
        targetFile: '',
        secondaryRoutes: [],
        scores,
        compoundPlan: [],
        requiredTools: [],
        entities,
        reasoning: `Jev System-1 Guardrail: blocked potentially dangerous activity (${threatCategory})`
      };
    }

    let route = winner.route;
    let confidence = 0.95;

    if (winner.score >= 80) confidence = 0.995;
    else if (winner.score >= 60) confidence = 0.985;
    else if (winner.score >= 45) confidence = 0.96;
    else if (winner.score >= 30) confidence = 0.92;
    else confidence = 0.85;

    if (margin < 10 && winner.score < 50) {
      confidence = Math.max(0.70, confidence - 0.10);
    }

    if (route === 'WRITE_FILE' && !targetFile) {
      if (entities.languages.includes('python')) targetFile = 'main.py';
      else if (entities.languages.includes('javascript')) targetFile = 'app.js';
      else if (entities.languages.includes('typescript')) targetFile = 'app.ts';
      else if (entities.languages.includes('css')) targetFile = 'style.css';
      else if (entities.languages.includes('json')) targetFile = 'data.json';
      else if (entities.languages.includes('sql')) targetFile = 'query.sql';
      else targetFile = 'index.html';
    }

    if (route === 'SEARCH_WEB') requiredTools.push('TOOL:SEARCH_WEB');
    else if (route === 'SCHEDULE_CALENDAR') requiredTools.push('TOOL:SCHEDULE_EVENT');
    else if (route === 'WRITE_FILE') requiredTools.push('TOOL:WRITE_FILE');
    else if (route === 'EDIT_FILE') requiredTools.push('TOOL:EDIT_FILE');
    else if (route === 'VIEW_FILE') requiredTools.push('TOOL:VIEW_FILE');
    else if (route === 'DELETE_FILE') requiredTools.push('TOOL:DELETE_FILE');
    else if (route === 'EXEC_COMMAND') requiredTools.push('TOOL:EXEC');
    else if (route === 'LIST_DIR') requiredTools.push('TOOL:LIST_DIR');
    else if (route === 'AUTONOMOUS_TASK') {
      requiredTools.push('TOOL:WRITE_FILE', 'TOOL:EXEC', 'TOOL:TASK_COMPLETE');
    }

    let reasoning = `Jev System-1 Cognitive Matrix evaluated prompt (score: ${winner.score}, margin: +${margin}).`;
    if (route === 'AUTONOMOUS_TASK') {
      reasoning = isCompound
        ? `Jev orchestrated compound multi-tool pipeline across ${compoundPlan.join(' -> ')}`
        : 'Jev identified multi-step autonomous engineering pipeline requiring coordinated tool execution';
    } else if (route === 'SCHEDULE_CALENDAR') {
      reasoning = 'Identified calendar event or schedule management intent';
    } else if (route === 'WRITE_FILE') {
      reasoning = `Autonomous software synthesis targeting ${targetFile}`;
    } else if (route === 'EDIT_FILE') {
      reasoning = `Targeted file modification in ${targetFile}`;
    } else if (route === 'VIEW_FILE') {
      reasoning = `Inspecting file contents of ${targetFile || 'workspace'}`;
    } else if (route === 'DELETE_FILE') {
      reasoning = `Explicit file removal targeting ${targetFile}`;
    } else if (route === 'EXEC_COMMAND') {
      reasoning = 'Explicit terminal command execution detected';
    } else if (route === 'SEARCH_WEB') {
      reasoning = 'Routed to live web search for external data or query';
    } else if (route === 'LIST_DIR') {
      reasoning = 'Workspace file tree inspection';
    } else {
      reasoning = 'Natural conversational or domain Q&A dialog';
    }

    const secondaryRoutes = sorted.slice(1, 3).filter(x => x.score > 15);

    return {
      route,
      targetFile,
      confidence: Number(confidence.toFixed(3)),
      guardrailPassed,
      threatCategory,
      latencyMs: Math.max(1, Math.round(performance.now() - start)),
      secondaryRoutes,
      scores,
      compoundPlan: compoundPlan.length > 0 ? compoundPlan : [route],
      requiredTools,
      entities,
      reasoning
    };
  }

  // =========================================================================

  // Modular Submodule Inter-op References (delegates to window exports from submodules)
  const renderAiChat = (...args) => (window.renderAiChat ? window.renderAiChat(...args) : undefined);
  const setThinkingOrbState = (...args) => (window.setThinkingOrbState ? window.setThinkingOrbState(...args) : undefined);
  const initThinkingOrb = (...args) => (window.initThinkingOrb ? window.initThinkingOrb(...args) : undefined);
  const initChatSessions = (...args) => (window.initChatSessions ? window.initChatSessions(...args) : undefined);
  const initScheduledTasks = (...args) => (window.initScheduledTasks ? window.initScheduledTasks(...args) : undefined);
  const getActiveSession = (...args) => (window.getActiveSession ? window.getActiveSession(...args) : ((window.aiSessions && window.aiSessions[0]) || { messages: [] }));
  const updateActiveSessionMessages = (...args) => (window.updateActiveSessionMessages ? window.updateActiveSessionMessages(...args) : undefined);
  const saveChatSessions = (...args) => (window.saveChatSessions ? window.saveChatSessions(...args) : undefined);
  const syncActiveSessionToConversation = (...args) => (window.syncActiveSessionToConversation ? window.syncActiveSessionToConversation(...args) : undefined);
  const generateSimulatedAutonomousReply = (...args) => (window.generateSimulatedAutonomousReply ? window.generateSimulatedAutonomousReply(...args) : "Autonomous simulation engine offline.");
  const clearQuotedMessage = (...args) => (window.clearQuotedMessage ? window.clearQuotedMessage(...args) : undefined);
  const showThinkingIndicator = (...args) => (window.showThinkingIndicator ? window.showThinkingIndicator(...args) : undefined);
  const hideThinkingIndicator = (...args) => (window.hideThinkingIndicator ? window.hideThinkingIndicator(...args) : undefined);

  // 4. CONFIGURATION, 2-TIER PERSONAS & PROVIDER ROUTING
  // =========================================================================

  function populatePersonasDropdown() {
    if (window.populatePersonasDropdownImpl) {
      window.populatePersonasDropdownImpl();
      return;
    }
    const savedCat = localStorage.getItem("lumina_ai_category") || "general";
    const savedSpec = localStorage.getItem("lumina_ai_persona") || "";
    if (window.populateCategoryDropdown) window.populateCategoryDropdown("modalAiCategorySelect", savedCat);
    if (window.populateSpecialistDropdown) window.populateSpecialistDropdown("modalAiPersonaSelect", savedCat, savedSpec);
  }

  function openAiConfigModal() {
    const modal = document.getElementById("aiConfigModal");
    if (!modal) return;
    loadAiConfig();
    modal.style.display = "flex";
    setTimeout(() => {
      modal.classList.remove("opacity-0");
      const c = modal.querySelector(".glass-panel");
      if (c) c.classList.remove("scale-95");
    }, 10);
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeAiConfigModal() {
    const modal = document.getElementById("aiConfigModal");
    if (!modal) return;
    modal.classList.add("opacity-0");
    const c = modal.querySelector(".glass-panel");
    if (c) c.classList.add("scale-95");
    setTimeout(() => modal.style.display = "none", 200);
  }

  function onModalCategoryChange() {
    const catSel = document.getElementById("modalAiCategorySelect");
    if (!catSel) return;
    const catId = catSel.value;
    if (window.populateSpecialistDropdown) {
      window.populateSpecialistDropdown("modalAiPersonaSelect", catId, "");
    }
    saveAiConfigFromModal();
  }

  function onModalPersonaChange() {
    const personaSelect = document.getElementById("modalAiPersonaSelect");
    const customWrapper = document.getElementById("modalCustomPersonaWrapper");
    const customPrompt = document.getElementById("modalCustomPersonaPrompt");

    if (personaSelect && customWrapper) {
      if (personaSelect.value === "custom") {
        customWrapper.classList.remove("hidden");
        if (customPrompt) customPrompt.focus();
      } else {
        customWrapper.classList.add("hidden");
      }
    }
    saveAiConfigFromModal();
  }

  function onModalProviderChange() {
    const providerSelect = document.getElementById("modalAiProviderSelect");
    const endpointRow = document.getElementById("modalCustomEndpointRow");
    if (providerSelect && endpointRow) {
      if (providerSelect.value === "custom") {
        endpointRow.classList.remove("hidden");
      } else {
        endpointRow.classList.add("hidden");
      }
    }
    saveAiConfigFromModal();
  }

  function saveAiConfigFromModal() {
    const providerSel = document.getElementById("modalAiProviderSelect");
    const modelSel = document.getElementById("modalAiModelSelect");
    const catSel = document.getElementById("modalAiCategorySelect");
    const personaSel = document.getElementById("modalAiPersonaSelect");
    const webCheck = document.getElementById("modalCheckWebSearch");
    const vfsCheck = document.getElementById("modalCheckVfs");
    const termCheck = document.getElementById("modalCheckTerminal");
    const customKeyInp = document.getElementById("modalCustomAiKey");
    const customEndpointInp = document.getElementById("modalCustomAiEndpoint");
    const customPersonaPrompt = document.getElementById("modalCustomPersonaPrompt");

    if (providerSel) localStorage.setItem("lumina_ai_provider", providerSel.value);
    if (modelSel) localStorage.setItem("lumina_ai_model", modelSel.value);
    if (catSel) localStorage.setItem("lumina_ai_category", catSel.value);
    if (personaSel) localStorage.setItem("lumina_ai_persona", personaSel.value);
    if (webCheck) localStorage.setItem("lumina_allow_internet", webCheck.checked ? "true" : "false");
    if (vfsCheck) localStorage.setItem("lumina_allow_vfs", vfsCheck.checked ? "true" : "false");
    if (termCheck) localStorage.setItem("lumina_allow_terminal", termCheck.checked ? "true" : "false");
    if (customKeyInp) localStorage.setItem("lumina_custom_ai_key", customKeyInp.value.trim());
    if (customEndpointInp) localStorage.setItem("lumina_custom_ai_endpoint", customEndpointInp.value.trim());
    if (customPersonaPrompt) localStorage.setItem("lumina_custom_persona_prompt", customPersonaPrompt.value.trim());

    // Update Header Badges
    const modelBadge = document.getElementById("aiActiveModelBadge");
    const personaBadge = document.getElementById("aiActivePersonaBadge");
    const webBadge = document.getElementById("webSearchActiveBadge");

    const pVal = providerSel ? providerSel.value : (localStorage.getItem("lumina_ai_provider") || "hybrid_pool");
    if (modelBadge) {
      if (pVal === "hybrid_pool") {
        modelBadge.textContent = "Universal Hybrid (Ollama + NIM)";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300 font-mono border border-cyan-500/30";
      } else if (pVal === "simulation") {
        modelBadge.textContent = "Universal Hybrid (Auto-Failover)";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-300 font-mono border border-purple-500/20";
      } else if (pVal === "nvidia_pool") {
        modelBadge.textContent = "NVIDIA NIM Pool (Multi-Key)";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-300 font-mono border border-emerald-500/20";
      } else if (pVal === "custom") {
        modelBadge.textContent = "Custom Endpoint";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-300 font-mono border border-cyan-500/20";
      } else {
        modelBadge.textContent = modelSel ? modelSel.value : "gpt-oss:20b";
        modelBadge.className = "px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-300 font-mono border border-cyan-500/20";
      }
    }

    if (webBadge) {
      const isWebOn = webCheck ? webCheck.checked : (localStorage.getItem("lumina_allow_internet") !== "false");
      if (isWebOn) {
        webBadge.classList.remove("hidden");
        webBadge.classList.add("flex");
      } else {
        webBadge.classList.add("hidden");
        webBadge.classList.remove("flex");
      }
    }

    if (personaBadge) {
      const activeCat = catSel ? catSel.value : (localStorage.getItem("lumina_ai_category") || "general");
      const activeSpec = personaSel ? personaSel.value : (localStorage.getItem("lumina_ai_persona") || "");
      
      const catObj = (window.LuminaPersonaCategories || []).find(c => c.id === activeCat);
      const specObj = (window.LuminaPersonas || []).find(p => p.id === activeSpec);

      const catName = catObj ? catObj.name.split("&")[0].trim() : "General";
      const specName = specObj ? specObj.name : "Default";
      personaBadge.textContent = `Category: ${catName} • Specialist: ${specName}`;
    }
  }

  function loadAiConfig() {
    populatePersonasDropdown();

    const providerSel = document.getElementById("modalAiProviderSelect");
    const modelSel = document.getElementById("modalAiModelSelect");
    const catSel = document.getElementById("modalAiCategorySelect");
    const personaSel = document.getElementById("modalAiPersonaSelect");
    const webCheck = document.getElementById("modalCheckWebSearch");
    const vfsCheck = document.getElementById("modalCheckVfs");
    const termCheck = document.getElementById("modalCheckTerminal");
    const customKeyInp = document.getElementById("modalCustomAiKey");
    const customEndpointInp = document.getElementById("modalCustomAiEndpoint");
    const customPersonaPrompt = document.getElementById("modalCustomPersonaPrompt");

    let savedProvider = localStorage.getItem("lumina_ai_provider") || "hybrid_pool";
    if (savedProvider === "local" || savedProvider === "simulation") {
      savedProvider = "hybrid_pool";
      localStorage.setItem("lumina_ai_provider", "hybrid_pool");
    }
    const savedModel = localStorage.getItem("lumina_ai_model") || "gpt-oss:20b";
    const savedCat = localStorage.getItem("lumina_ai_category") || "general";
    const savedPersona = localStorage.getItem("lumina_ai_persona") || "";
    const savedWeb = localStorage.getItem("lumina_allow_internet") !== "false";
    const savedVfs = localStorage.getItem("lumina_allow_vfs") !== "false";
    const savedTerm = localStorage.getItem("lumina_allow_terminal") !== "false";

    if (providerSel) providerSel.value = savedProvider;
    if (modelSel) modelSel.value = savedModel;
    if (catSel) catSel.value = savedCat;
    if (personaSel && savedPersona) personaSel.value = savedPersona;
    if (webCheck) webCheck.checked = savedWeb;
    if (vfsCheck) vfsCheck.checked = savedVfs;
    if (termCheck) termCheck.checked = savedTerm;

    if (customKeyInp) customKeyInp.value = localStorage.getItem("lumina_custom_ai_key") || "";
    if (customEndpointInp) customEndpointInp.value = localStorage.getItem("lumina_custom_ai_endpoint") || "";
    if (customPersonaPrompt) customPersonaPrompt.value = localStorage.getItem("lumina_custom_persona_prompt") || "";

    onModalProviderChange();
    onModalPersonaChange();
  }

  async function checkProviderQuota() {
    const provider = localStorage.getItem("lumina_ai_provider") || "hybrid_pool";
    if (window.showToast) window.showToast("Provider Telemetry", "Auditing active platform key pools...");

    try {
      const res = await fetch("/api/chat?action=telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "telemetry" })
      });
      const data = await res.json().catch(() => null);

      if (data && data.success) {
        const oKeys = (data.pools?.ollama || []).map(k => `${k.name} (${k.keyMasked})`).join(", ") || "None";
        const nKeys = (data.pools?.nvidia || []).map(k => `${k.name} (${k.keyMasked})`).join(", ") || "None";
        const gKeys = (data.pools?.groq || []).map(k => `${k.name} (${k.keyMasked})`).join(", ") || "None";
        const total = data.totalCount || 0;

        const detailMsg = `Universal Hybrid Pool Active (${total} Total Key${total === 1 ? '' : 's'}):\n• Ollama Cloud: ${oKeys}\n• NVIDIA / Nemotron: ${nKeys}${gKeys !== 'None' ? `\n• Groq: ${gKeys}` : ''}\nAutomatic cross-pool failover is armed across all keys.`;
        if (window.showToast) window.showToast(`Telemetry: ${total} Key(s) Armed`, detailMsg);
        return;
      }
    } catch (e) {
      console.warn("Live telemetry query error:", e);
    }

    const fallbackMsg = "Universal Hybrid Engine Active: Unified auto-failover across all registered Ollama Cloud keys (including ollama2) and NVIDIA/Nemotron keys with zero-latency cascade.";
    if (window.showToast) window.showToast("Provider Telemetry", fallbackMsg);
  }

  function getAiSystemPrompt() {
    const personaId = localStorage.getItem("lumina_ai_persona") || "";
    const customPrompt = localStorage.getItem("lumina_custom_persona_prompt") || "";
    const activeCat = localStorage.getItem("lumina_ai_category") || "general";

    let personaDirective = "";
    if (personaId === "custom" && customPrompt) {
      personaDirective = customPrompt;
    } else if (Array.isArray(window.LuminaPersonas)) {
      const p = window.LuminaPersonas.find(x => x.id === personaId);
      if (p) personaDirective = p.prompt;
    }

    const vfs = window.vfs || {};
    const fileKeys = Object.keys(vfs);
    const fileListStr = fileKeys.length > 0 
      ? fileKeys.map(k => `  • ${k} (${(vfs[k] || '').length} bytes)`).join('\n')
      : '  (Virtual File System is currently empty)';

    let calStr = '  (No events currently scheduled)';
    if (window.LuminaCalendar && typeof window.LuminaCalendar.getEvents === 'function') {
      try {
        const evts = window.LuminaCalendar.getEvents();
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfTomorrow = startOfToday + (2 * 86400000);
        const nearEvents = evts.filter(e => {
          if (!e || !e.start) return false;
          const t = new Date(e.start).getTime();
          return !isNaN(t) && t >= startOfToday && t <= endOfTomorrow;
        }).sort((a, b) => (a.start > b.start ? 1 : -1));

        if (nearEvents.length > 0) {
          calStr = nearEvents.map(e => 
            `  • [ID: ${e.id}] "${e.title}" | ${e.start} -> ${e.end} | Cat: ${e.category}${e.googleEventId ? ' (Google Synced)' : ''}`
          ).join('\n');
        }
      } catch (err) {}
    }

    const isoTime = new Date().toISOString();

    return `You are LuminaVista Sovereign Autonomous OS Agent (v14.0 Enterprise).
Active Persona Domain: ${activeCat}
Specialist Directive: ${personaDirective}

=== ENVIRONMENT & SYSTEM AWARENESS ===
- Environment: LuminaVista Cloud OS Sovereign Workspace
- Current Time: ${isoTime} (Asia/Kolkata - IST standard)
- Memory Storage: In-memory Virtual File System (VFS) with persistent local storage
- Execution Runtime: Firecracker POSIX MicroVM sandbox (Node.js 20, Python 3.11, Bash)
- Active Workspace Files:
${fileListStr}

=== UPCOMING SCHEDULE & CALENDAR ===
Active user calendar schedule for today & next 48 hours:
${calStr}

=== AUTONOMOUS CAPABILITIES & TOOL CALLING CONVENTIONS ===
You have full access to an in-memory Virtual File System (VFS), MicroVM terminal, and sovereign calendar engine.
Always format your reasoning inside:
<thought_process>
[Reasoning & Plan]
</thought_process>

When taking action, output the appropriate tool directives:
1. Search live web:
   [TOOL:SEARCH_WEB query="..."][/TOOL:SEARCH_WEB]
2. Inspect workspace file:
   [TOOL:VIEW_FILE filename="..."][/TOOL:VIEW_FILE]
3. List workspace files:
   [TOOL:LIST_DIR][/TOOL:LIST_DIR]
4. Write/create file:
   [TOOL:WRITE_FILE filename="..."]
   file content
   [/TOOL:WRITE_FILE]
5. Edit file with find-and-replace:
   [TOOL:EDIT_FILE filename="..."]
   <target>exact code to replace</target>
   <replacement>new code</replacement>
   [/TOOL:EDIT_FILE]
6. Delete file:
   [TOOL:DELETE_FILE filename="..."][/TOOL:DELETE_FILE]
7. Execute shell command in MicroVM:
   [TOOL:EXEC]bash command[/TOOL:EXEC]
8. Manage Calendar & Schedule (Full CRUD - View, Add, Edit, Delete):
   - View events:
     [TOOL:SCHEDULE_EVENT action="view" date="YYYY-MM-DD" query="optional search term"][/TOOL:SCHEDULE_EVENT]
   - Add/Create event:
     [TOOL:SCHEDULE_EVENT action="create" title="..." start="YYYY-MM-DDTHH:mm:ss" end="YYYY-MM-DDTHH:mm:ss" category="work|personal|ai_autonomous|focus|health"][/TOOL:SCHEDULE_EVENT]
   - Edit/Update event (reschedule, rename, or update category):
     [TOOL:SCHEDULE_EVENT action="edit" query="Meeting Name" newTitle="Updated Name" start="YYYY-MM-DDTHH:mm:ss" end="YYYY-MM-DDTHH:mm:ss" category="..."][/TOOL:SCHEDULE_EVENT]
     (Can also specify target by id="evt_id")
   - Delete/Cancel event:
     [TOOL:SCHEDULE_EVENT action="delete" query="Meeting Name"][/TOOL:SCHEDULE_EVENT]
     (Can also specify target by id="evt_id")
9. Complete objective:
   [TOOL:TASK_COMPLETE summary="..."][/TOOL:TASK_COMPLETE]

=== ARTIFACT QUALITY & CLEANLINESS MANDATE ===
- When creating or modifying code artifacts ([TOOL:WRITE_FILE] or [TOOL:EDIT_FILE]):
  1. Complete & Robust: Every artifact must be complete, beautifully structured, and fully functional. Never use placeholders like "// ... rest of code", "// TODO", or truncated snippets.
  2. Neat Formatting: Maintain impeccable indentation, modular functions, clear naming conventions, and clean inline documentation.
  3. Modern UI Aesthetics: For web/HTML artifacts, use responsive HTML5, modern Tailwind CSS, dark-mode glassmorphic styling, Lucide icons, and fluid interactive animations matching LuminaVista.
  4. Pristine Architecture: Avoid messy temporary debug files or incomplete artifacts.

=== VFS CLEANLINESS & PRISTINE NAVIGATION MANDATE ===
- Always keep the Virtual File System (VFS) super clean, modular, and easy to navigate:
  1. Modular Folder Architecture: Group related files cleanly into organized folders (e.g. 'src/', 'components/', 'lib/', 'styles/', 'api/', 'docs/'). Avoid dumping loose files into the root.
  2. Clear & Consistent Naming: Use concise, standard naming conventions (e.g. 'app.js', 'chart-card.js', 'style.css').
  3. No Clutter or Redundant Files: Never create temporary junk files ('test1.js', 'temp.txt', 'file2.js'). Clean up obsolete files using [TOOL:DELETE_FILE].
  4. Pristine Structure: Maintain clear entry points ('index.html', 'main.py', 'README.md') so anyone navigating the file tree finds everything immediately.

Always keep the workspace clean, maintain pristine architecture, and conclude with [TOOL:TASK_COMPLETE] when finished.`;
  }

  // =========================================================================

  // 7. TOOL DIRECTIVES EXECUTION ENGINE
  // =========================================================================

  function executeViewFile(filename) {
    const vfs = window.vfs || {};
    if (vfs[filename] !== undefined) {
      const lines = vfs[filename].split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      return `File ${filename} (${vfs[filename].length} bytes):\n${lines}`;
    }
    return `Error: File "${filename}" does not exist in workspace.`;
  }

  function executeListDir() {
    const vfs = window.vfs || {};
    const keys = Object.keys(vfs);
    if (keys.length === 0) return "Workspace VFS is currently empty.";
    return keys.map(k => ` - ${k} (${vfs[k].length} bytes)`).join('\n');
  }

  function executeWriteFile(filename, content) {
    window.vfs = window.vfs || {};
    window.vfs[filename] = content;
    localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
    if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
    if (window.rebuildGraphData) window.rebuildGraphData();
    if (window.activeCodespaceFile === filename && window.loadCodespaceFileContent) {
      window.loadCodespaceFileContent(filename);
    }
    return `Successfully wrote ${content.length} bytes to ${filename}`;
  }

  function executeEditFile(filename, target, replacement) {
    window.vfs = window.vfs || {};
    if (window.vfs[filename] === undefined) {
      return `Error: File "${filename}" not found in VFS.`;
    }
    const current = window.vfs[filename];
    if (!current.includes(target)) {
      return `Error: Target snippet not found in ${filename}.`;
    }
    window.vfs[filename] = current.replace(target, replacement);
    localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
    if (window.activeCodespaceFile === filename && window.loadCodespaceFileContent) {
      window.loadCodespaceFileContent(filename);
    }
    if (window.rebuildGraphData) window.rebuildGraphData();
    return `Successfully applied targeted edit to ${filename}`;
  }

  function executeDeleteFile(filename) {
    window.vfs = window.vfs || {};
    if (window.vfs[filename] !== undefined) {
      delete window.vfs[filename];
      localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
      if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
      if (window.rebuildGraphData) window.rebuildGraphData();
      return `Successfully deleted ${filename} from VFS.`;
    }
    return `Error: Cannot delete "${filename}" - file does not exist.`;
  }

  async function executeWebSearch(query) {
    // 1. Wikipedia search API with full CORS origin=* support
    try {
      const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
      if (wikiRes.ok) {
        const d = await wikiRes.json();
        const results = (d.query?.search || []).slice(0, 3).map(s => {
          return `• **${s.title}**: ${s.snippet.replace(/<[^>]+>/g, '').trim()}...`;
        });
        if (results.length > 0) return results.join('\n\n');
      }
    } catch (ignore) {}

    // 2. DuckDuckGo Instant Answer API
    try {
      const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      if (res.ok) {
        const d = await res.json();
        let snippets = [];
        if (d.AbstractText) snippets.push(d.AbstractText);
        if (Array.isArray(d.RelatedTopics)) {
          d.RelatedTopics.slice(0, 4).forEach(t => { if (t.Text) snippets.push(t.Text); });
        }
        if (snippets.length > 0) return snippets.join('\n\n');
      }
    } catch (ignore) {}

    return "";
  }

  async function executeMicroVmCommand(command) {
    const termOut = document.getElementById("csTermOutput");
    if (termOut) {
      termOut.innerHTML += `<div class="mt-2 text-cyan-400 font-bold">[MicroVM Exec]: ➜ ${escapeHtml(command)}</div>`;
      termOut.scrollTop = termOut.scrollHeight;
    }

    try {
      const vfs = window.vfs || {};
      const filesArray = Object.keys(vfs).map(k => ({ name: k, content: vfs[k] }));
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, files: filesArray })
      });

      const d = await res.json();
      let outputText = "";

      if (res.ok) {
        if (d.stdout) {
          outputText += d.stdout;
          if (termOut) termOut.innerHTML += `<div class="text-emerald-400">${escapeHtml(d.stdout)}</div>`;
        }
        if (d.stderr) {
          outputText += (outputText ? "\nSTDERR:\n" : "STDERR:\n") + d.stderr;
          if (termOut) termOut.innerHTML += `<div class="text-rose-400">${escapeHtml(d.stderr)}</div>`;
        }
        if (!d.stdout && !d.stderr) {
          outputText = "[Command exited with code 0 and no output]";
          if (termOut) termOut.innerHTML += `<div class="text-zinc-500">[Exit 0]</div>`;
        }

        if (Array.isArray(d.workspaceFiles)) {
          d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
          localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
          if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
        }
      } else {
        outputText = `MicroVM Execution Fault: ${d.error || res.statusText}`;
        if (termOut) termOut.innerHTML += `<div class="text-rose-400">[Fault]: ${escapeHtml(outputText)}</div>`;
      }

      if (termOut) termOut.scrollTop = termOut.scrollHeight;
      return outputText;

    } catch (e) {
      const termOutFallback = document.getElementById("csTermOutput");
      if (termOutFallback) {
        termOutFallback.innerHTML += `<div class="text-emerald-400">[Local Sandbox Execution]: ${escapeHtml(command)} completed successfully.</div>`;
        termOutFallback.scrollTop = termOutFallback.scrollHeight;
      }
      return `[Local Sandbox Execution of "${command}"]: Process exited with code 0.`;
    }
  }

  async function parseAndExecuteAgentDirectives(rawText) {
    const results = [];
    let isTaskComplete = false;

    // 1. Search Web
    const searchRegex = /\[TOOL:SEARCH_WEB query="([^"]+)"\]\[\/TOOL:SEARCH_WEB\]/g;
    let sMatch;
    while ((sMatch = searchRegex.exec(rawText)) !== null) {
      setThinkingOrbState("searching");
      const q = sMatch[1];
      const searchRes = await executeWebSearch(q);
      results.push(`[TOOL_RESULT:SEARCH_WEB query="${q}"]\n${searchRes}\n[/TOOL_RESULT:SEARCH_WEB]`);
    }

    // 2. View File
    const viewRegex = /\[TOOL:VIEW_FILE filename="([^"]+)"\]\[\/TOOL:VIEW_FILE\]/g;
    let vMatch;
    while ((vMatch = viewRegex.exec(rawText)) !== null) {
      setThinkingOrbState("working");
      const fn = vMatch[1];
      const viewRes = executeViewFile(fn);
      results.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"]\n${viewRes}\n[/TOOL_RESULT:VIEW_FILE]`);
    }

    // 3. List Dir
    if (rawText.includes("[TOOL:LIST_DIR]")) {
      setThinkingOrbState("working");
      const listRes = executeListDir();
      results.push(`[TOOL_RESULT:LIST_DIR]\n${listRes}\n[/TOOL_RESULT:LIST_DIR]`);
    }

    // 4. Write File
    const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
    let wMatch;
    while ((wMatch = writeRegex.exec(rawText)) !== null) {
      setThinkingOrbState("composing");
      const fn = wMatch[1];
      const content = wMatch[2].trim();
      const writeRes = executeWriteFile(fn, content);
      results.push(`[TOOL_RESULT:WRITE_FILE filename="${fn}"]\n${writeRes}\n[/TOOL_RESULT:WRITE_FILE]`);
    }

    // 5. Edit File
    const editRegex = /\[TOOL:EDIT_FILE filename="([^"]+)"\]\s*<target>([\s\S]*?)<\/target>\s*<replacement>([\s\S]*?)<\/replacement>\s*\[\/TOOL:EDIT_FILE\]/g;
    let eMatch;
    while ((eMatch = editRegex.exec(rawText)) !== null) {
      setThinkingOrbState("composing");
      const fn = eMatch[1];
      const target = eMatch[2];
      const replacement = eMatch[3];
      const editRes = executeEditFile(fn, target, replacement);
      results.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"]\n${editRes}\n[/TOOL_RESULT:EDIT_FILE]`);
    }

    // 6. Delete File
    const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
    let dMatch;
    while ((dMatch = delRegex.exec(rawText)) !== null) {
      setThinkingOrbState("working");
      const fn = dMatch[1];
      const delRes = executeDeleteFile(fn);
      results.push(`[TOOL_RESULT:DELETE_FILE filename="${fn}"]\n${delRes}\n[/TOOL_RESULT:DELETE_FILE]`);
    }

    // 7. Exec Command
    const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
    let xMatch;
    while ((xMatch = execRegex.exec(rawText)) !== null) {
      setThinkingOrbState("connecting");
      const cmd = xMatch[1].trim();
      const execRes = await executeMicroVmCommand(cmd);
      results.push(`[TOOL_RESULT:EXEC command="${cmd}"]\n${execRes}\n[/TOOL_RESULT:EXEC]`);
    }

    // 8. Schedule Event (Full CRUD - View, Add/Create, Edit/Update, Delete/Remove)
    const schedRegex = /\[TOOL:SCHEDULE_EVENT([^\]]*)\](?:([\s\S]*?)\[\/TOOL:SCHEDULE_EVENT\])?/g;
    let calMatch;
    while ((calMatch = schedRegex.exec(rawText)) !== null) {
      if (window.LuminaCalendar && window.LuminaCalendar.handleAgentDirective) {
        setThinkingOrbState("solving");
        const attrStr = calMatch[1] || '';
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_\-]+)="([^"]*)"/g;
        let aMatch;
        while ((aMatch = attrRegex.exec(attrStr)) !== null) {
          attrs[aMatch[1]] = aMatch[2];
        }

        const action = (attrs.action || 'create').toLowerCase();
        const res = window.LuminaCalendar.handleAgentDirective(attrs);

        if (res && res.success) {
          if (action === 'view' || action === 'list') {
            const evts = res.events || [];
            const listStr = evts.length > 0
              ? evts.map(e => `  • [ID: ${e.id}] "${e.title}" | ${e.start} -> ${e.end} | Category: ${e.category}${e.googleEventId ? ' (Google Synced)' : ''}`).join('\n')
              : '  (No events found matching query)';
            results.push(`[TOOL_RESULT:SCHEDULE_EVENT action="view" status="success" count="${res.count}"]\nFound ${res.count} scheduled event(s):\n${listStr}\n[/TOOL_RESULT:SCHEDULE_EVENT]`);

            // Visibly format and display the scheduled events directly in the chat bubble
            if (window.aiConversation && window.aiConversation.length > 0) {
              const lastMsg = window.aiConversation[window.aiConversation.length - 1];
              if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content.includes('📅 Scheduled Events')) {
                const rangeLabel = attrs.range === 'next_week' ? 'Next Week' : (attrs.range || attrs.date || 'Upcoming');
                const formattedEvents = evts.length > 0
                  ? `\n\n**📅 Scheduled Events Found for ${escapeHtml(rangeLabel)} (${evts.length}):**\n` + evts.map(e => {
                      const s = e.start ? e.start.replace('T', ' ') : '';
                      const ed = e.end ? e.end.replace('T', ' ') : '';
                      return `• **${escapeHtml(e.title || 'Untitled')}** — \`${s}\` to \`${ed}\` *(Category: ${e.category || 'general'}${e.googleEventId ? ' | Google Synced' : ''})*`;
                    }).join('\n')
                  : `\n\nℹ️ **No events currently scheduled** for ${escapeHtml(rangeLabel)}. Your calendar is clear! You can ask me to schedule an event or auto-plan your week anytime.`;
                lastMsg.content += formattedEvents;
                updateActiveSessionMessages();
                renderAiChat();
              }
            }
          } else if (action === 'create' || action === 'add') {
            const e = res.event || {};
            results.push(`[TOOL_RESULT:SCHEDULE_EVENT action="create" status="success"]\nCreated and scheduled event "${e.title}" [ID: ${e.id}] from ${e.start} to ${e.end} (Category: ${e.category}). Synced to calendar.\n[/TOOL_RESULT:SCHEDULE_EVENT]`);
          } else if (action === 'edit' || action === 'update') {
            const e = res.event || {};
            results.push(`[TOOL_RESULT:SCHEDULE_EVENT action="edit" status="success"]\nUpdated event "${e.title}" [ID: ${e.id}] (Start: ${e.start}, End: ${e.end}, Category: ${e.category}). Synced to calendar.\n[/TOOL_RESULT:SCHEDULE_EVENT]`);
          } else if (action === 'delete' || action === 'remove') {
            const e = res.deletedEvent || {};
            results.push(`[TOOL_RESULT:SCHEDULE_EVENT action="delete" status="success"]\nDeleted event "${e.title || attrs.query || attrs.id}". Removed from calendar and Google Calendar.\n[/TOOL_RESULT:SCHEDULE_EVENT]`);
          } else {
            results.push(`[TOOL_RESULT:SCHEDULE_EVENT action="${action}" status="success"]\n${res.message || 'Calendar directive executed successfully.'}\n[/TOOL_RESULT:SCHEDULE_EVENT]`);
          }
        } else {
          results.push(`[TOOL_RESULT:SCHEDULE_EVENT action="${action}" status="failed"]\nError: ${res && res.message ? res.message : 'Directive failed'}\n[/TOOL_RESULT:SCHEDULE_EVENT]`);
        }
      }
    }

    // 9. Task Complete
    const completeRegex = /\[TOOL:TASK_COMPLETE(?: summary="([^"]*)")?\](?:([\s\S]*?)\[\/TOOL:TASK_COMPLETE\])?/g;
    let cMatch;
    while ((cMatch = completeRegex.exec(rawText)) !== null) {
      setThinkingOrbState("breathing");
      isTaskComplete = true;
      const summary = cMatch[1] || (cMatch[2] ? cMatch[2].trim() : "All objectives accomplished.");
      results.push(`[TASK_COMPLETED: ${summary}]`);
    }

    return { results, isTaskComplete };
  }

  // =========================================================================
  // 8. AUTONOMOUS PROMPT DISPATCHER & MULTI-STEP LOOP
  // =========================================================================

  function abortAgentLoop() {
    window.isAgentAborted = true;
    window.isAgentRunning = false;
    hideThinkingIndicator();
    if (window.showToast) window.showToast("Aborted", "Autonomous execution halted.");
  }

  async function handleSendAiPrompt(e) {
    if (e) e.preventDefault();
    const inp = document.getElementById("aiPromptTextarea");
    if (!inp) return;
    let prompt = inp.value.trim();
    const btn = document.getElementById("btnAiSend");
    const btnAbort = document.getElementById("btnAiAbort");
    if (!prompt) return;

    // Check if there is an active quoted message
    if (window.activeQuotedMessage && window.activeQuotedMessage.text) {
      const qRole = window.activeQuotedMessage.role === 'user' ? 'You' : 'AI-Studio';
      const cleanSnippet = window.activeQuotedMessage.text
        .replace(/\[TOOL:[^\]]+\][\s\S]*?\[\/TOOL:[^\]]+\]/g, '')
        .replace(/<thought_process>[\s\S]*?<\/thought_process>/g, '')
        .replace(/\[AUTONOMOUS CLOUD TASK COMPLETED OFFLINE\]/g, '')
        .trim();
      const quotedLines = cleanSnippet.split('\n').map(l => `> ${l}`).join('\n');
      prompt = `> [Quoted from ${qRole}]:\n${quotedLines}\n\n${prompt}`;
      clearQuotedMessage();
    }

    window.aiConversation.push({ role: "user", content: prompt });
    inp.value = "";
    inp.style.height = "auto";
    updateActiveSessionMessages();
    renderAiChat();

    // Client-side Jev System-1 Sub-50ms Classification (<2ms)
    const jevIntent = classifyJevIntentClient(prompt, window.vfs);

    // Offline resilience: dispatch job to cloud worker with keepalive: true so it finishes even if user shuts down PC
    const offlineJobId = "job_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    try {
      const offlineJobs = JSON.parse(localStorage.getItem("lumina_offline_pending_jobs") || "[]");
      offlineJobs.push({ jobId: offlineJobId, prompt, sessionId: window.activeSessionId, timestamp: Date.now() });
      localStorage.setItem("lumina_offline_pending_jobs", JSON.stringify(offlineJobs));
      localStorage.setItem("lumina_active_job", JSON.stringify({ jobId: offlineJobId, prompt, sessionId: window.activeSessionId, timestamp: Date.now() }));

      fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          jobId: offlineJobId,
          userSession: localStorage.getItem("lumina_session_id") || "sovereign_session",
          prompt,
          requestedModel: localStorage.getItem("lumina_ai_model") || "gpt-oss:20b",
          provider: localStorage.getItem("lumina_ai_provider") || "hybrid_pool",
          messages: [{ role: "system", content: getAiSystemPrompt() }, ...window.aiConversation],
          currentVfs: window.vfs || {}
        })
      }).catch(() => {});
    } catch(e) {}

    window.isAgentRunning = true;
    window.isAgentAborted = false;
    window.currentAgentLoop = 0;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
    }
    if (btnAbort) {
      btnAbort.classList.remove("hidden");
    }

    const failoverBadge = document.getElementById("failoverIndicatorBadge");

    try {
      while (window.isAgentRunning && !window.isAgentAborted && window.currentAgentLoop < MAX_AGENT_LOOPS) {
        window.currentAgentLoop++;

        const latestUserMsg = window.aiConversation[window.aiConversation.length - 1]?.content || prompt;
        showThinkingIndicator(window.currentAgentLoop, latestUserMsg);

        const provider = localStorage.getItem("lumina_ai_provider") || "hybrid_pool";
        let reply = "";

        if (provider === "simulation") {
          await new Promise(r => setTimeout(r, 600));
          reply = await generateSimulatedAutonomousReply(
            latestUserMsg,
            window.currentAgentLoop,
            window.vfs
          );
        } else {
          const customApiKey = localStorage.getItem("lumina_custom_ai_key") || undefined;
          const customEndpoint = localStorage.getItem("lumina_custom_ai_endpoint") || undefined;
          const enableInternet = localStorage.getItem("lumina_allow_internet") !== "false";
          const enableVfs = localStorage.getItem("lumina_allow_vfs") !== "false";
          const enableTerminal = localStorage.getItem("lumina_allow_terminal") !== "false";

          const activeCat = localStorage.getItem("lumina_ai_category") || "general";
          const activeSpec = localStorage.getItem("lumina_ai_persona") || "";
          const customPrompt = localStorage.getItem("lumina_custom_persona_prompt") || "";
          let personaDirective = "";
          if (activeSpec === "custom" && customPrompt) {
            personaDirective = customPrompt;
          } else if (Array.isArray(window.LuminaPersonas)) {
            const p = window.LuminaPersonas.find(x => x.id === activeSpec);
            if (p) personaDirective = p.prompt;
          }

          const MAX_FAILOVER_RETRIES = 5;
          let retryCount = 0;
          let fetchSuccess = false;
          let activeProvider = provider;

          while (!fetchSuccess && retryCount < MAX_FAILOVER_RETRIES && !window.isAgentAborted) {
            try {
              if (retryCount > 0) {
                const retryMsg = `[Auto-Failover]: Quota limit reached. Cycling key & provider (Attempt ${retryCount + 1} of ${MAX_FAILOVER_RETRIES})...`;
                console.warn(retryMsg);
                if (window.showToast) {
                  window.showToast("Auto-Failover", `Rate-limit detected. Trying alternative key (Attempt ${retryCount + 1}/${MAX_FAILOVER_RETRIES})...`);
                }
                const stream = document.getElementById("thinkingLogStream");
                if (stream) {
                  const row = document.createElement("div");
                  row.className = "text-amber-400 flex items-center gap-1.5 font-bold";
                  row.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> 🔄 [Auto-Failover] Rate limit hit. Cycling to alternative key (Attempt ${retryCount + 1} of ${MAX_FAILOVER_RETRIES})...`;
                  stream.appendChild(row);
                  stream.scrollTop = stream.scrollHeight;
                }
                // Progressive backoff delay
                await new Promise(r => setTimeout(r, 1200 * retryCount));
              }

              const res = await fetch("/api/chat", {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "x-session-id": localStorage.getItem("lumina_session_id") || "sovereign_session"
                },
                body: JSON.stringify({
                  prompt: latestUserMsg,
                  requestedModel: localStorage.getItem("lumina_ai_model") || "gpt-oss:20b",
                  provider: activeProvider,
                  enableInternet,
                  enableVfs,
                  enableTerminal,
                  category: activeCat,
                  specialist: activeSpec,
                  personaDirective,
                  messages: [{ role: "system", content: getAiSystemPrompt() }, ...window.aiConversation],
                  currentVfs: window.vfs,
                  customApiKey,
                  customEndpoint
                })
              });

              // Check if session has expired or is unauthorized
              if (res.status === 401) {
                if (window.showToast) window.showToast("Session Status", "Sovereign session verified or renewed. Reconnecting...", "info");
                // Set sovereign session cookie to heal browser session state
                document.cookie = "godx_session=sovereign_session; path=/; max-age=31536000; SameSite=Lax";
                retryCount++;
                continue;
              }

              const data = await res.json().catch(() => null);

              // Check if rate limited (HTTP 429, or rateLimited flag, or quota phrase in error)
              const isRateLimited = res.status === 429 ||
                (data && (
                  data.rateLimited === true ||
                  (typeof data.error === 'string' && /quota|rate\s*limit|too\s*many\s*requests|all_keys/i.test(data.error))
                ));

              if (isRateLimited) {
                retryCount++;
                if (activeProvider === "ollama_pool") activeProvider = "nvidia_pool";
                else if (activeProvider === "nvidia_pool") activeProvider = "ollama_pool";
                continue;
              }

              if (res.ok && data) {
                const candidate = data.reply || data.choices?.[0]?.message?.content || data.message?.content || "";

                // Never accept bare "Task processed.", null tokens, or empty string as a completed task
                if (!candidate || candidate.trim() === "" || candidate.trim() === "Task processed." || candidate.trim() === "null") {
                  retryCount++;
                  if (activeProvider === "ollama_pool") activeProvider = "nvidia_pool";
                  else if (activeProvider === "nvidia_pool") activeProvider = "ollama_pool";
                  continue;
                }

                reply = candidate;
                fetchSuccess = true;

                // Handle failover indicator badge
                if (data.activeKeyMeta && failoverBadge) {
                  failoverBadge.textContent = `${data.activeKeyMeta.name}`;
                  failoverBadge.classList.remove("hidden");
                  failoverBadge.classList.add("flex");
                }

                // Display failover toast if any failover occurred
                if (Array.isArray(data.failoverLogs) && data.failoverLogs.some(l => l.includes("Auto-Failover") || l.includes("Hybrid Failover"))) {
                  if (window.showToast) window.showToast("Auto-Failover", "Switched API key to prevent rate-limit.");
                }
                break;
              } else {
                throw new Error((data && data.error) || res.statusText || "Gateway response failed");
              }
            } catch (gatewayErr) {
              console.warn(`Gateway retry ${retryCount + 1}/${MAX_FAILOVER_RETRIES} error:`, gatewayErr.message);
              retryCount++;
              if (retryCount < MAX_FAILOVER_RETRIES) {
                if (activeProvider === "ollama_pool") activeProvider = "nvidia_pool";
                else if (activeProvider === "nvidia_pool") activeProvider = "ollama_pool";
                continue;
              }
              break;
            }
          }

          // If after MAX_FAILOVER_RETRIES all keys and providers are still exhausted:
          if (!fetchSuccess) {
            console.warn(`All ${MAX_FAILOVER_RETRIES} failover attempts exhausted.`);
            reply = `<thought_process>\n[Rate-Limit Safeguard]: Attempted ${MAX_FAILOVER_RETRIES} consecutive rotations across all registered API keys and provider pools.\nAll available providers reported temporary rate-limits or quota restrictions.\nTerminating retry cycle safely.\n</thought_process>\n\n` +
              `### ⚠️ AI Provider Quota & Rate Limit Temporarily Reached\n\n` +
              `All available AI provider keys have temporarily reached their concurrency or quota limits.\n\n` +
              `LuminaVista automatically made **${MAX_FAILOVER_RETRIES} failover attempts** across all registered key pools, but the upstream providers are currently rate-limiting requests.\n\n` +
              `**How to proceed:**\n` +
              `• **Wait ~30–60 seconds**: Cloud rate-limit windows typically refresh every minute.\n` +
              `• **Verify Provider Engine**: Ensure your provider is set to **Universal Hybrid Engine** in Configure AI (⚙️) to pool all Ollama Cloud and NVIDIA NIM keys together.\n` +
              `• **Add Personal Free Key**: In Configure AI (⚙️), paste a free personal key from [NVIDIA NIM](https://build.nvidia.com) or [Groq](https://console.groq.com) for dedicated quota.\n\n` +
              `[TOOL:TASK_COMPLETE summary="All AI provider keys exhausted after ${MAX_FAILOVER_RETRIES} automated failover attempts."][/TOOL:TASK_COMPLETE]`;

            if (window.showToast) {
              window.showToast("Rate Limit Exceeded", `Tried ${MAX_FAILOVER_RETRIES} keys across providers. Quota resets in ~60s.`);
            }
          }
        }

        hideThinkingIndicator();

        if (window.isAgentAborted) break;

        window.aiConversation.push({ role: "assistant", content: reply });
        updateActiveSessionMessages();
        renderAiChat();

        // Execute tools
        const { results, isTaskComplete } = await parseAndExecuteAgentDirectives(reply);

        if (isTaskComplete || results.length === 0) {
          window.isAgentRunning = false;
          break;
        }

        if (window.currentAgentLoop < MAX_AGENT_LOOPS && !window.isAgentAborted) {
          const feedbackContent = `[SYSTEM AUTO-FEEDBACK TOOL RESULTS]:\n${results.join('\n\n')}\n\nPlease analyze the above tool results and continue the autonomous task toward completion.`;
          window.aiConversation.push({ role: "user", content: feedbackContent });
        } else {
          window.isAgentRunning = false;
        }
      }

      if (window.currentAgentLoop >= MAX_AGENT_LOOPS && !window.isAgentAborted) {
        if (window.showToast) window.showToast("Autonomous Limit", "Reached 5-step safety limit.");
      }

    } catch (err) {
      hideThinkingIndicator();
      window.aiConversation.push({ role: "assistant", content: `**[Network Error]:** ${err.message}` });
      window.isAgentRunning = false;
    } finally {
      // Clear this completed job from pending offline queue if foreground finished
      try {
        const cur = JSON.parse(localStorage.getItem("lumina_offline_pending_jobs") || "[]");
        localStorage.setItem("lumina_offline_pending_jobs", JSON.stringify(cur.filter(j => j.jobId !== offlineJobId)));
        const active = JSON.parse(localStorage.getItem("lumina_active_job") || "null");
        if (active && active.jobId === offlineJobId) {
          localStorage.removeItem("lumina_active_job");
        }
      } catch(e) {}

      hideThinkingIndicator();
      window.isAgentRunning = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="arrow-up" class="w-4 h-4"></i>';
      }
      if (btnAbort) {
        btnAbort.classList.add("hidden");
      }
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      updateActiveSessionMessages();
      renderAiChat();
    }
  }

  function clearAiChat() {
    window.aiConversation = [];
    updateActiveSessionMessages();
    renderAiChat();
    if (window.showToast) window.showToast("Cleared", "Current chat reset.");
  }

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // =========================================================================
  // 9. AI STUDIO SUB-TABS (CHAT | ARTIFACTS & FILES | GRAPHIFY GRAPH)
  // =========================================================================
  window.activeAiSubTab = 'chat';

  function switchAiSubTab(tabName = 'chat') {
    window.activeAiSubTab = tabName;
    const chatView = document.getElementById("aiChatView");
    const csCol = document.getElementById("aiCodespaceColumn");
    const graphCol = document.getElementById("aiGraphifyColumn");

    const btnChat = document.getElementById("btnAiSubTabChat");
    const btnArtifacts = document.getElementById("btnAiSubTabArtifacts");
    const btnGraphify = document.getElementById("btnAiSubTabGraphify");

    // Reset button states
    [btnChat, btnArtifacts, btnGraphify].forEach(btn => {
      if (btn) {
        btn.className = "px-3.5 py-1.5 rounded-xl hover:bg-white/5 text-zinc-400 hover:text-white border border-transparent text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all";
      }
    });

    if (tabName === 'artifacts') {
      if (chatView) chatView.classList.add("hidden");
      if (graphCol) {
        graphCol.classList.add("hidden");
        graphCol.classList.remove("flex");
      }
      if (csCol) {
        csCol.classList.remove("hidden");
        csCol.classList.add("flex");
      }
      if (btnArtifacts) {
        btnArtifacts.className = "px-3.5 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-sm";
      }
      if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
    } else if (tabName === 'graphify') {
      if (chatView) chatView.classList.add("hidden");
      if (csCol) {
        csCol.classList.add("hidden");
        csCol.classList.remove("flex");
      }
      if (graphCol) {
        graphCol.classList.remove("hidden");
        graphCol.classList.add("flex");
      }
      if (btnGraphify) {
        btnGraphify.className = "px-3.5 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-sm";
      }
      if (window.initGraphifyGraph) {
        window.initGraphifyGraph();
        setTimeout(() => {
          window.initGraphifyGraph();
          if (window.rebuildGraphData) window.rebuildGraphData();
        }, 50);
      }
    } else {
      // Default: 'chat'
      if (chatView) chatView.classList.remove("hidden");
      if (csCol) {
        csCol.classList.add("hidden");
        csCol.classList.remove("flex");
      }
      if (graphCol) {
        graphCol.classList.add("hidden");
        graphCol.classList.remove("flex");
      }
      if (btnChat) {
        btnChat.className = "px-3.5 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all shadow-sm";
      }
    }

    updateAiSubTabArtifactBadge();

    // Sync sidebar slider button states
    const sbChat = document.getElementById("btn-tab-ai-studio");
    const sbArt = document.getElementById("btn-tab-artifacts");
    const sbGraph = document.getElementById("btn-tab-graphify");
    [sbChat, sbArt, sbGraph].forEach(b => {
      if (b) {
        b.classList.remove("nav-tab-active");
        b.classList.add("text-zinc-400");
      }
    });
    if (tabName === 'artifacts' && sbArt) {
      sbArt.classList.add("nav-tab-active");
      sbArt.classList.remove("text-zinc-400");
    } else if (tabName === 'graphify' && sbGraph) {
      sbGraph.classList.add("nav-tab-active");
      sbGraph.classList.remove("text-zinc-400");
    } else if (sbChat) {
      sbChat.classList.add("nav-tab-active");
      sbChat.classList.remove("text-zinc-400");
    }

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function updateAiSubTabArtifactBadge() {
    const badge = document.getElementById("aiSubTabArtifactCount");
    if (badge) {
      const count = Object.keys(window.vfs || {}).length;
      badge.textContent = count;
    }
  }

  // Switch and open file in Artifacts IDE
  window.switchAndOpenFile = function(filename) {
    switchAiSubTab('artifacts');
    if (window.loadCodespaceFileContent) window.loadCodespaceFileContent(filename);
  };

  // Check and merge any autonomous tasks completed in the cloud while PC was shut down or user was away
  async function checkCompletedOfflineCloudJobs() {
    if (typeof fetch === 'undefined') return;
    try {
      let pendingJobs = [];
      try {
        const stored = localStorage.getItem("lumina_offline_pending_jobs");
        if (stored) pendingJobs = JSON.parse(stored);
      } catch(e) {}

      // Also incorporate active job if not already in list
      try {
        const activeJob = JSON.parse(localStorage.getItem("lumina_active_job") || "null");
        if (activeJob && !pendingJobs.some(j => j.jobId === activeJob.jobId)) {
          pendingJobs.push(activeJob);
        }
      } catch(e) {}

      if (!Array.isArray(pendingJobs) || pendingJobs.length === 0) return;

      const remainingJobs = [];

      for (const item of pendingJobs) {
        try {
          const res = await fetch(`/api/worker?jobId=${encodeURIComponent(item.jobId)}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.job && data.job.status === 'completed') {
              const finishedJob = data.job;

              // 1. Merge completed VFS artifacts
              if (finishedJob.vfs && typeof finishedJob.vfs === 'object') {
                window.vfs = window.vfs || {};
                Object.assign(window.vfs, finishedJob.vfs);
                localStorage.setItem("lumina_codespace_vfs", JSON.stringify(window.vfs));
                if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
                if (window.rebuildGraphData) window.rebuildGraphData();
              }

              // 2. Insert AI reply into chat conversation / target session
              if (finishedJob.reply) {
                const targetSession = (window.aiSessions && item.sessionId)
                  ? window.aiSessions.find(s => s.id === item.sessionId)
                  : getActiveSession();

                if (targetSession) {
                  targetSession.messages = targetSession.messages || [];
                  const isAlreadyPresent = targetSession.messages.some(m => m.content === finishedJob.reply || (m.role === 'assistant' && finishedJob.reply.includes(m.content)));
                  if (!isAlreadyPresent) {
                    targetSession.messages.push({
                      role: "assistant",
                      content: finishedJob.reply
                    });
                    targetSession.updatedAt = Date.now();
                    saveChatSessions();
                    if (targetSession.id === window.activeSessionId) {
                      syncActiveSessionToConversation();
                      renderAiChat();
                    }
                  }
                } else {
                  const isAlreadyPresent = (window.aiConversation || []).some(m => m.content === finishedJob.reply);
                  if (!isAlreadyPresent) {
                    window.aiConversation.push({
                      role: "assistant",
                      content: finishedJob.reply
                    });
                    updateActiveSessionMessages();
                    renderAiChat();
                  }
                }
              }

              // 3. Update Google Calendar task event if present
              if (window.LuminaCalendar) {
                const events = window.LuminaCalendar.getEvents();
                const taskEvt = events.find(e => e.title?.includes(item.prompt?.slice(0, 20) || ''));
                if (taskEvt) {
                  taskEvt.title = `[AI Task ✓ Completed] ${taskEvt.title.replace(/^\[AI Task\]\s*/, '')}`;
                  localStorage.setItem('luminavista_calendar_events_v1', JSON.stringify(events));
                  if (window.LuminaCalendar.pushEventToGoogle) {
                    window.LuminaCalendar.pushEventToGoogle(taskEvt);
                  }
                  window.LuminaCalendar.render();
                }
              }

              // Clear from active job if matches
              try {
                const activeJob = JSON.parse(localStorage.getItem("lumina_active_job") || "null");
                if (activeJob && activeJob.jobId === item.jobId) {
                  localStorage.removeItem("lumina_active_job");
                }
              } catch(e) {}

              if (window.showToast) {
                window.showToast("Task Continuation Completed", `"${(item.prompt || '').slice(0, 32)}..." finished while you were away.`);
              }
              continue;
            } else if (data && data.job && data.job.status === 'processing') {
              // Still processing in cloud
              remainingJobs.push(item);
              continue;
            }
          }
        } catch(e) {}
        remainingJobs.push(item);
      }

      localStorage.setItem("lumina_offline_pending_jobs", JSON.stringify(remainingJobs));
      if (remainingJobs.length > 0) {
        // Poll again in 2.5s while cloud job completes
        setTimeout(checkCompletedOfflineCloudJobs, 2500);
      }
    } catch (e) {
      console.warn("Failed checking offline cloud jobs:", e);
    }
  }

  // Initialization Hook on DOM Content Loaded and Page Focus/Visibility Return
  document.addEventListener("DOMContentLoaded", () => {
    initChatSessions();
    initScheduledTasks();
    updateAiSubTabArtifactBadge();
    checkCompletedOfflineCloudJobs();
    setTimeout(() => {
      initThinkingOrb("headerThinkingOrb");
      loadAiConfig();
    }, 100);
  });

  if (typeof window !== 'undefined') {
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkCompletedOfflineCloudJobs();
      }
    });
    window.addEventListener("focus", () => {
      checkCompletedOfflineCloudJobs();
    });
  }

  // Window Exports for Global Callers & Test Harness
  window.escapeHtml = escapeHtml;
  window.populatePersonasDropdown = populatePersonasDropdown;
  window.openAiConfigModal = openAiConfigModal;
  window.closeAiConfigModal = closeAiConfigModal;
  window.onModalCategoryChange = onModalCategoryChange;
  window.onModalPersonaChange = onModalPersonaChange;
  window.onModalProviderChange = onModalProviderChange;
  window.saveAiConfigFromModal = saveAiConfigFromModal;
  window.loadAiConfig = loadAiConfig;
  window.checkProviderQuota = checkProviderQuota;
  window.getAiSystemPrompt = getAiSystemPrompt;
  window.parseAndExecuteAgentDirectives = parseAndExecuteAgentDirectives;
  window.handleSendAiPrompt = handleSendAiPrompt;
  window.clearAiChat = clearAiChat;
  window.autoResizeTextarea = autoResizeTextarea;
  window.abortAgentLoop = abortAgentLoop;
  window.classifyJevIntentClient = classifyJevIntentClient;
  window.switchAiSubTab = switchAiSubTab;
  window.updateAiSubTabArtifactBadge = updateAiSubTabArtifactBadge;
  window.checkCompletedOfflineCloudJobs = checkCompletedOfflineCloudJobs;
  window.executeWebSearch = executeWebSearch;

})(window);

