/**
 * tests/suite-whiteboard.cjs - Comprehensive Test Suite for Whiteboard Pro Multi-Board Gallery,
 * AI Diagram Directives, Jev Routing, Smart Shapes, Laser Pointer, and Retina/SVG/JSON Export Engine.
 */

module.exports = async function runWhiteboardSuite({ assert, window, document, rootDir }) {
  console.log("\n--- SUITE 26: Whiteboard Pro Multi-Board Gallery, AI Directives & Premium Features ---");

  // 1. Module Exports & Verification
  assert(typeof window.LuminaWhiteboard === 'object', "window.LuminaWhiteboard API is exposed");
  assert(typeof window.LuminaWhiteboardGallery === 'object', "window.LuminaWhiteboardGallery API is exposed");
  assert(typeof window.LuminaWhiteboardAi === 'object', "window.LuminaWhiteboardAi API is exposed");

  // 2. Blueprint Templates Integrity
  const templates = window.LuminaWhiteboardGallery.templates || [];
  assert(templates.length >= 7, "Gallery contains at least 7 built-in blueprints");
  const templateIds = templates.map(t => t.id);
  assert(templateIds.includes('template_microservices'), "Contains Microservices Blueprint");
  assert(templateIds.includes('template_serverless_ai'), "Contains Serverless AI & Vector Pipeline Blueprint");
  assert(templateIds.includes('template_zero_trust'), "Contains Zero-Trust Secure Enclaves Blueprint");
  assert(templateIds.includes('template_ecommerce_erd'), "Contains E-Commerce Database ERD Blueprint");
  assert(templateIds.includes('template_oauth_flow'), "Contains OAuth2 / OIDC & PKCE Blueprint");
  assert(templateIds.includes('template_kanban'), "Contains Agile Sprint Kanban Blueprint");
  assert(templateIds.includes('template_mindmap'), "Contains Cognitive Mind Map Blueprint");

  // 3. Multi-Board Management & Persistence
  const initialBoards = window.LuminaWhiteboardGallery.getStoredBoards();
  assert(Array.isArray(initialBoards) && initialBoards.length >= 1, "Initial stored boards list has at least default board");
  
  const createdBoard = window.LuminaWhiteboardGallery.createNewBoard("Cloud Infrastructure Blueprint");
  assert(createdBoard && createdBoard.name === "Cloud Infrastructure Blueprint", "New board created with specified title");
  assert(window.LuminaWhiteboardGallery.getActiveBoardId() === createdBoard.id, "Active board ID switched to newly created board");

  // Switch back and verify
  window.LuminaWhiteboardGallery.switchBoard('board_default');
  assert(window.LuminaWhiteboardGallery.getActiveBoardId() === 'board_default', "Successfully switched back to main board");

  // 4. AI Whiteboard Directives Execution
  assert(typeof window.LuminaWhiteboard.handleAgentDirective === 'function', "LuminaWhiteboard exposes handleAgentDirective");

  // Directive: Load Template
  const tmplRes = window.LuminaWhiteboard.handleAgentDirective({
    action: 'template',
    template: 'template_microservices',
    title: 'Distributed Microservices Mesh'
  });
  assert(tmplRes.success === true, "AI directive loads built-in template successfully");
  assert(tmplRes.summary.includes('template_microservices'), "Directive summary confirms loaded template");

  // Directive: Generative Custom Diagram from Natural Language
  const customPrompt = "API Gateway routes traffic to User Service and Order Service connected to PostgreSQL database";
  const genRes = window.LuminaWhiteboard.handleAgentDirective({
    action: 'draw',
    title: 'Core E-Commerce Services'
  }, customPrompt);
  assert(genRes.success === true, "AI directive generates custom diagram from natural language prompt");
  assert(genRes.nodeCount > 0, "Custom diagram synthesized at least 1 node");
  assert(genRes.connectorCount > 0, "Custom diagram synthesized at least 1 connector");

  // Directive: Inspect / Status
  const inspectRes = window.LuminaWhiteboard.handleAgentDirective({ action: 'inspect' });
  assert(inspectRes.success === true, "AI directive inspects whiteboard canvas state");
  assert(typeof inspectRes.boardName === 'string', "Inspect returns active board name");

  // Directive: Clear Canvas
  const clearRes = window.LuminaWhiteboard.handleAgentDirective({ action: 'clear' });
  assert(clearRes.success === true, "AI directive clears canvas cleanly");

  // 5. Jev Cognitive Matrix & DRAW_WHITEBOARD Intent Classification
  const { scoreJevTensor } = await import('../api/_lib/jev/jev-tensor.js');
  const { jevClassifyIntent, jevGenerateBespokeResponse } = await import('../api/_lib/jev-engine.js');

  const whiteboardPrompts = [
    "draw microservices architecture diagram on whiteboard",
    "render database ERD flowchart on whiteboard",
    "sketch OAuth2 authentication sequence on whiteboard",
    "open whiteboard and generate kanban board",
    "[TOOL:WHITEBOARD action=\"template\" template=\"template_zero_trust\"][/TOOL:WHITEBOARD]"
  ];

  for (const prompt of whiteboardPrompts) {
    const scored = scoreJevTensor(prompt, {});
    assert(scored.winner.route === 'DRAW_WHITEBOARD', `Tensor scores "${prompt.slice(0, 35)}..." as DRAW_WHITEBOARD`);

    const classified = jevClassifyIntent(prompt, {});
    assert(classified.route === 'DRAW_WHITEBOARD', `Jev classifies "${prompt.slice(0, 35)}..." to DRAW_WHITEBOARD route`);
    assert(classified.requiredTools.includes('TOOL:WHITEBOARD'), "DRAW_WHITEBOARD route requires TOOL:WHITEBOARD");
  }

  // 6. Server & Client Response Generators
  const bespokeReply = jevGenerateBespokeResponse("draw microservices architecture on whiteboard", 1, {});
  assert(bespokeReply.includes('[TOOL:WHITEBOARD'), "Server generator includes TOOL:WHITEBOARD directive");
  assert(bespokeReply.includes('template_microservices'), "Server generator matches template_microservices blueprint");
  assert(bespokeReply.includes('[TOOL:TASK_COMPLETE'), "Server generator completes task cleanly");

  const clientSimulatedReply = await window.generateSimulatedAutonomousReply("draw database ERD on whiteboard", 1, {});
  assert(clientSimulatedReply.includes('[TOOL:WHITEBOARD'), "Client simulated generator includes TOOL:WHITEBOARD directive");
  assert(clientSimulatedReply.includes('template_ecommerce_erd'), "Client generator matches template_ecommerce_erd blueprint");

  // 7. Smart Shapes Tool Selection
  const smartShapes = ['diamond', 'cylinder', 'cloud', 'star', 'laser'];
  for (const tool of smartShapes) {
    window.setWbTool(tool);
    assert(window.wbTool === tool, `Tool switched to smart shape: ${tool}`);
  }

  // Reset to pen
  window.setWbTool('pen');
  assert(window.wbTool === 'pen', "Reset tool to pen brush");

  // 8. Background Pattern Switcher
  assert(typeof window.setWhiteboardBackground === 'function', "setWhiteboardBackground is exposed");
  window.setWhiteboardBackground('grid');
  const container = document.getElementById('whiteboardContainer');
  assert(container && container.classList.contains('bg-grid-pattern'), "Container reflects grid background pattern");
  
  window.setWhiteboardBackground('blueprint');
  assert(container && container.classList.contains('bg-blueprint-pattern'), "Container reflects blueprint background pattern");

  window.setWhiteboardBackground('dots');
  assert(container && container.classList.contains('bg-dot-pattern'), "Container reverts to dot background pattern");

  // 9. Zoom & Pan Engine
  assert(typeof window.zoomIn === 'function' && typeof window.zoomOut === 'function' && typeof window.resetZoom === 'function', "Zoom controls exposed");
  window.resetZoom();
  assert(window.wbZoom === 1.0, "Reset zoom sets scale to 1.0");

  window.zoomIn();
  assert(window.wbZoom > 1.0, "zoomIn increases scale above 1.0");

  window.zoomOut();
  assert(window.wbZoom <= 1.05, "zoomOut decreases scale");

  window.resetZoom();
  assert(window.wbZoom === 1.0, "resetZoom restores scale to 1.0");

  // 10. Multi-Format Exports (SVG, Retina PNG, JSON Scene)
  assert(typeof window.downloadWhiteboardRetina === 'function', "downloadWhiteboardRetina is exposed");
  assert(typeof window.downloadWhiteboardSvg === 'function', "downloadWhiteboardSvg is exposed");
  assert(typeof window.exportWhiteboardJson === 'function', "exportWhiteboardJson is exposed");
  assert(typeof window.importWhiteboardJson === 'function', "importWhiteboardJson is exposed");

  // Test SVG Export
  const svgOutput = window.downloadWhiteboardSvg();
  assert(typeof svgOutput === 'string' && svgOutput.startsWith('<svg') && svgOutput.endsWith('</svg>'), "downloadWhiteboardSvg produces valid SVG string");

  // Test JSON Scene Export & Import
  const exportedJson = window.exportWhiteboardJson();
  assert(typeof exportedJson === 'string', "exportWhiteboardJson produces string");
  const parsedJson = JSON.parse(exportedJson);
  assert(parsedJson.version && Array.isArray(parsedJson.stickies), "Exported JSON contains version and stickies");

  // 11. Modal UI Elements Integrity
  const galleryModal = document.getElementById('whiteboardGalleryModal');
  const aiModal = document.getElementById('whiteboardAiModal');
  assert(galleryModal !== null, "whiteboardGalleryModal markup mounted in DOM");
  assert(aiModal !== null, "whiteboardAiModal markup mounted in DOM");

  const boardSelector = document.getElementById('wbBoardSelector');
  assert(boardSelector !== null, "wbBoardSelector dropdown mounted in DOM");

  console.log("✓ Whiteboard Pro sub-suite completed successfully!");
};
