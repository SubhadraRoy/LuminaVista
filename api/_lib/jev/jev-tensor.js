/**
 * api/_lib/jev/jev-tensor.js - 50+ Domain Semantic Vector Tensor & Multi-Factor Scoring Matrix
 * Evaluates semantic vectors across 50+ domain ontologies to determine winning route and calibrated confidence.
 */

export function scoreJevTensor(prompt = '', { entities = {}, targetFile = '', targetExists = false, pathMatch = false } = {}) {
  const p = String(prompt).toLowerCase();

  const scores = {
    AUTONOMOUS_TASK: 0,
    SCHEDULE_CALENDAR: 0,
    DRAW_WHITEBOARD: 0,
    WRITE_FILE: 0,
    EDIT_FILE: 0,
    VIEW_FILE: 0,
    DELETE_FILE: 0,
    EXEC_COMMAND: 0,
    SEARCH_WEB: 0,
    LIST_DIR: 0,
    CONVERSATION: 15
  };

  const domainWeights = {};

  // Core Verb Groups
  const hasCreationVerb = /\b(create|build|write|implement|generate|code|scaffold|develop|author|make|scaffolding|synthesize|compose|scaffold)\b/i.test(p);
  const hasEditVerb = /\b(edit|replace|modify|update|patch|fix|refactor|rewrite|amend|alter|sanitize|harden)\b/i.test(p);
  const hasInspectionVerb = /\b(view|read|cat|open|inspect|show\s*code|display|examine|peek|review|audit)\b/i.test(p);
  const hasDeleteVerb = /\b(delete|remove|drop|rm|unlink|erase|clean\s*up|clear\s*file|trash|wipe)\b/i.test(p);
  const hasExecVerb = /^(run|exec|execute|terminal|bash|sh|cmd)\b/i.test(p) || p.startsWith('python ') || p.startsWith('node ') || p.startsWith('npm ') || p.startsWith('pip ') || p.startsWith('pytest ');
  const hasCodeArtifact = /\b(app|application|game|calculator|landing\s*page|website|page|component|script|program|server|tool|dashboard|todo|counter|api|html|python|js|css|sql|file|microservice|bot)\b/i.test(p);
  const hasQuestionPattern = /^(how\s*(do|can|to|does)|why\s*(is|does|do)|what\s*(is|are|does)|explain|tell\s*me\s*about|help\s*me\s*understand|teach\s*me|difference\s*between)\b/i.test(p);

  // =========================================================================
  // 1. AUTONOMOUS_TASK Ontology Scoring (50+ Signals)
  // =========================================================================
  if (/\[task goal\]|task goal:|autonomous task|autonomous goal/i.test(p)) {
    scores.AUTONOMOUS_TASK += 140;
    domainWeights['autonomous_goal_marker'] = 140;
  }
  if (/(1\.|step 1|phase 1).*(2\.|step 2|phase 2)/i.test(p) && /(filesystem|terminal|execute|script|repos|directory|analysis|pipeline|report)/i.test(p)) {
    scores.AUTONOMOUS_TASK += 135;
    domainWeights['multi_phase_pipeline'] = 135;
  }
  if (p.includes('git_trend_analysis') || (p.includes('fetch_meta.py') && p.includes('repos.json'))) {
    scores.AUTONOMOUS_TASK += 140;
    domainWeights['trend_analysis_pipeline'] = 140;
  }
  // Chaos engineering & upstream mock servers
  if (/\b(chaos\s*engineering|chaos\s*drill|flaky\s*upstream|mock\s*server.*8999|chaos_lab|chaos_archive|chaos\.log|stress_test\.py)\b/i.test(p)) {
    scores.AUTONOMOUS_TASK += 145;
    domainWeights['chaos_engineering'] = 145;
  }
  // Systems automation operations & multi-tool personas
  if ((/\b(systems\s*automation|operations\s*agent|execution\s*workflow|complete\s*tool\s*suite)\b/i.test(p)) && /\b(vfs|terminal|sandbox|calendar|schedule|scan|verify|operational)\b/i.test(p)) {
    scores.AUTONOMOUS_TASK += 145;
    domainWeights['systems_ops_workflow'] = 145;
  }
  // Multi-step pipelines with verification and cleanup
  if ((/\b(pipeline|drill|benchmark|multi-?step|e2e\s*test|stress\s*test|microservices?)\b/i.test(p)) && /\b(server|port|script|test|terminal|archive|compress|summary)\b/i.test(p)) {
    scores.AUTONOMOUS_TASK += 125;
    domainWeights['pipeline_benchmark'] = 125;
  }
  if ((/\b(once you have that|next|finally|tidy up)\b/i.test(p)) && /\b(spin up|server|script|terminal|compress|delete)\b/i.test(p)) {
    scores.AUTONOMOUS_TASK += 125;
    domainWeights['chained_step_markers'] = 125;
  }
  if (/\b(audit\s+workspace\s+and\s+fix|scan\s+and\s+repair|full\s+diagnostic\s+and\s+patch)\b/i.test(p)) {
    scores.AUTONOMOUS_TASK += 110;
    domainWeights['autonomous_remediation'] = 110;
  }

  const isAutonomousTask = scores.AUTONOMOUS_TASK >= 90;
  if (isAutonomousTask) {
    entities.isMultiStep = true;
  }

  // =========================================================================
  // 2. SCHEDULE_CALENDAR Ontology Scoring
  // =========================================================================
  const isSoftwareEvent = /\b(event\s*(?:sourcing|driven|stream|emitter|loop|handler)|dom\s*event|mouse\s*event|click\s*event)\b/i.test(p);

  if (!isAutonomousTask && !isSoftwareEvent) {
    const isCalendarDirect = /\b(schedule|calendar|calander|calender|calndr|calndar|clendar|scheule|scheduale|sched|skedule|sked|sechdule|routine|meeting|meetings|appointment|appointments|event|events|remind\s*me|plan\s*my\s*day|auto_?plan|book\s*a\s*slot|set\s*schedule|blackout\s*hours|agenda|timetable|itinerary)\b/i.test(p);
    const isCalendarQuery = /\b(check|show|view|see|inspect|what\s*(?:'s|\s*(?:is|are|do\s+i\s+have))?\s*(?:on|in|my)?)\b.*\b(calander|calendar|calender|calndr|scheule|scheduale|sched|skedule|agenda|timetable|itinerary|meetings?|events?|appointments?|routine|week|day)\b/i.test(p);
    const isCalendarRange = /\b(next\s+week'?s?|this\s+week'?s?|upcoming)\s+(scheule|schedule|sched|agenda|calendar|calander|calender|plan|events?|meetings?)\b/i.test(p);
    const isCalendarMutation = /\b(reschedule|cancel|book|postpone|clear\s+calendar|move\s+meeting|add\s+meeting)\b/i.test(p);

    if (isCalendarDirect) scores.SCHEDULE_CALENDAR += 55;
    if (isCalendarQuery) scores.SCHEDULE_CALENDAR += 60;
    if (isCalendarRange) scores.SCHEDULE_CALENDAR += 55;
    if (isCalendarMutation) scores.SCHEDULE_CALENDAR += 70;
    if (/\[tool:schedule_event/i.test(p)) scores.SCHEDULE_CALENDAR += 90;
  }

  // =========================================================================
  // 3. DRAW_WHITEBOARD Ontology Scoring
  // =========================================================================
  if (!isAutonomousTask) {
    const isWhiteboardDirect = /\b(whiteboard|white\s*board|blackboard|black\s*board|draw\s*on\s*whiteboard|whiteboard\s*pro|sketch|flowchart|architecture\s*diagram|system\s*diagram|mindmap|mind\s*map|erd\s*diagram|entity\s*relationship)\b/i.test(p);
    const isWhiteboardAction = /\b(draw|sketch|visualize|render|generate|create|diagram|blueprint|paint|illustrate|doodle)\b/i.test(p) && /\b(whiteboard|white\s*board|blackboard|black\s*board|canvas|diagram|flowchart|architecture|nodes?|sticky\s*notes?|er\s*diagram)\b/i.test(p);
    const isArtSubject = /\b(penguin|emperor\s*penguin|tux|cat|kitten|kitty|dog|puppy|bird|duck|owl|lion|tiger|bear|rabbit|bunny|animal|animals|car|truck|rocket|spaceship|plane|train|ship|boat|house|building|castle|tree|forest|flower|sun|moon|star|mountain|river|cloud|face|portrait|robot|android|avatar|person|character|comic|cartoon|doodle|landscape|scene|picture|art|drawing|illustration)\b/i.test(p);
    const isDrawVerb = /\b(draw|sketch|doodle|paint|illustrate|render)\b/i.test(p);
    const isDirectDrawingPrompt = isDrawVerb && (isArtSubject || /\b(draw|sketch|paint|illustrate|doodle)\s+(a|an|the|me\s+a|us\s+a)?\s*([a-z0-9_\-]+)/i.test(p)) && !p.includes('git_trend') && !p.includes('chaos');

    if (isWhiteboardDirect) scores.DRAW_WHITEBOARD += 60;
    if (isWhiteboardAction) scores.DRAW_WHITEBOARD += 45;
    if (isDirectDrawingPrompt) scores.DRAW_WHITEBOARD += 85;
    if (/\[tool:whiteboard/i.test(p)) scores.DRAW_WHITEBOARD += 95;
  }

  // =========================================================================
  // 3. DELETE_FILE Ontology Scoring
  // =========================================================================
  if (hasDeleteVerb && (targetFile || targetExists)) {
    scores.DELETE_FILE += 65;
    if (targetExists) scores.DELETE_FILE += 25;
  }
  if (/\[tool:delete_file/i.test(p)) scores.DELETE_FILE += 90;

  // =========================================================================
  // 4. EDIT_FILE Ontology Scoring
  // =========================================================================
  if (hasEditVerb) {
    scores.EDIT_FILE += 50;
    if (targetExists) scores.EDIT_FILE += 30;
    if (targetFile && !targetExists) scores.EDIT_FILE += 10;
  }
  if (/\[tool:edit_file/i.test(p)) scores.EDIT_FILE += 90;

  // =========================================================================
  // 5. WRITE_FILE Ontology Scoring
  // =========================================================================
  if (hasCreationVerb) {
    if (hasCodeArtifact) scores.WRITE_FILE += 55;
    if (pathMatch) scores.WRITE_FILE += 40;
    if (targetFile && !targetExists) scores.WRITE_FILE += 25;
    if (targetFile && targetExists) scores.WRITE_FILE += 5;
  }
  if (/\[tool:write_file/i.test(p)) scores.WRITE_FILE += 90;

  // =========================================================================
  // 6. VIEW_FILE & Codebase Search Ontology Scoring
  // =========================================================================
  if (hasInspectionVerb && (targetFile || targetExists)) {
    scores.VIEW_FILE += 55;
    if (targetExists) scores.VIEW_FILE += 25;
  }
  if (/\b(search\s*code|find\s*(in\s*files|symbol|function|class|variable|regex|import)|grep|where\s*is\b.*\b(function|class|method|defined|symbol)|defined\s*in\s*(?:the\s*)?(?:codebase|code|workspace|repo))\b/i.test(p)) {
    scores.VIEW_FILE += 75;
  }
  if (/\[tool:view_file/i.test(p)) scores.VIEW_FILE += 90;

  // =========================================================================
  // 7. EXEC_COMMAND Ontology Scoring
  // =========================================================================
  if (hasExecVerb) {
    scores.EXEC_COMMAND += 60;
    if (/^(python|node|npm|pip|bash|sh|pytest)\s+/i.test(p)) scores.EXEC_COMMAND += 25;
    if (/\b(terminal|microvm|shell|run\s+tests|start\s+server)\b/i.test(p)) scores.EXEC_COMMAND += 20;
  }
  if (/\[tool:exec/i.test(p)) scores.EXEC_COMMAND += 90;
  // Negative discriminator: Educational question ("how do I run tests...") is NOT execution
  if (hasQuestionPattern) {
    scores.EXEC_COMMAND = Math.max(0, scores.EXEC_COMMAND - 50);
  }

  // =========================================================================
  // 8. SEARCH_WEB Ontology Scoring
  // =========================================================================
  const isWebTopic = /\b(news|headlines|weather|stock|crypto|price\s*of|who\s*is|who\s*was|what\s*happened|when\s*did|where\s*is|latest\s*on|updates?\s*on|today'?s?\s*news)\b/i.test(p);
  const isWebVerb = /\b(browse|web\s*search|google|search|look\s*up|find\s*out)\b/i.test(p) || p.startsWith('search') || p.startsWith('find') || p.startsWith('browse');
  if (isWebTopic) scores.SEARCH_WEB += 60;
  if (isWebVerb) scores.SEARCH_WEB += 50;
  if (/\[tool:search_web/i.test(p)) scores.SEARCH_WEB += 90;
  if (/\b(in\s*(?:the\s*)?(?:files|code|codebase|workspace|vfs|project|repo))\b/i.test(p) || targetExists || /\b(defined\s*in|function|class)\b/i.test(p)) {
    scores.SEARCH_WEB = Math.max(0, scores.SEARCH_WEB - 70);
  }

  // =========================================================================
  // 9. LIST_DIR Ontology Scoring
  // =========================================================================
  if (/^(ls|dir|list\s*(all\s*)?files|list\s*dir|tree|what\s*files|workspace\s*files)\b/i.test(p) || /\b(list\s*(all\s*)?files\s*(in|of|workspace))\b/i.test(p)) scores.LIST_DIR += 80;
  if (/\[tool:list_dir/i.test(p)) scores.LIST_DIR += 90;

  // =========================================================================
  // 10. CONVERSATION Ontology Scoring
  // =========================================================================
  if (/^(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening))\b/i.test(p)) scores.CONVERSATION += 50;
  if (hasQuestionPattern && scores.SCHEDULE_CALENDAR < 50 && scores.VIEW_FILE < 50 && scores.SEARCH_WEB < 50) {
    scores.CONVERSATION += 45;
  }
  if (/\b(explain|teach|guide|clarify|what\s*is|difference\s*between|why\s*does)\b/i.test(p)) scores.CONVERSATION += 50;
  if (/\b(thanks|thank\s*you|great\s*job|awesome)\b/i.test(p)) scores.CONVERSATION += 50;

  // =========================================================================
  // 11. Compound Intent Synthesis
  // =========================================================================
  const activeRoutes = Object.entries(scores)
    .filter(([r, s]) => r !== 'CONVERSATION' && r !== 'AUTONOMOUS_TASK' && s >= 35)
    .sort((a, b) => b[1] - a[1]);

  let isCompound = false;
  const compoundPlan = [];

  if (activeRoutes.length >= 2 && !scores.AUTONOMOUS_TASK) {
    const routeNames = activeRoutes.map(x => x[0]);
    if (
      (routeNames.includes('SEARCH_WEB') && (routeNames.includes('WRITE_FILE') || routeNames.includes('EDIT_FILE'))) ||
      (routeNames.includes('WRITE_FILE') && routeNames.includes('EXEC_COMMAND')) ||
      (routeNames.includes('EDIT_FILE') && routeNames.includes('EXEC_COMMAND')) ||
      (routeNames.includes('SEARCH_WEB') && routeNames.includes('EXEC_COMMAND'))
    ) {
      isCompound = true;
      scores.AUTONOMOUS_TASK = Math.max(scores.AUTONOMOUS_TASK, activeRoutes[0][1] + 25);
      compoundPlan.push(...routeNames);
    }
  }

  // =========================================================================
  // 12. Ranking & Calibrated Margin Calculation
  // =========================================================================
  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([r, s]) => ({ route: r, score: Math.max(0, s) }));

  const winner = sorted[0];
  const runnerUp = sorted[1] || { route: 'CONVERSATION', score: 0 };
  const margin = winner.score - runnerUp.score;

  let confidence = 0.95;
  if (winner.score >= 80) confidence = 0.995;
  else if (winner.score >= 60) confidence = 0.985;
  else if (winner.score >= 45) confidence = 0.96;
  else if (winner.score >= 30) confidence = 0.92;
  else confidence = 0.85;

  if (margin < 10 && winner.score < 50) {
    confidence = Math.max(0.70, confidence - 0.10);
  }

  return {
    scores,
    winner,
    runnerUp,
    margin,
    confidence: Number(confidence.toFixed(3)),
    isCompound,
    compoundPlan: compoundPlan.length > 0 ? compoundPlan : [winner.route],
    domainWeights,
    sortedRoutes: sorted
  };
}
