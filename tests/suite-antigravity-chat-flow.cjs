/**
 * Suite 27: Antigravity Collapsible Chat UI, Private System Feedback & Pristine Bulk File Deletion
 * 
 * Verifies:
 * 1. Cognitive thoughts and autonomous tool calls are collapsed by default into Antigravity-style cards.
 * 2. System feedback ([SYSTEM AUTO-FEEDBACK...]) and tool results ([TOOL_RESULT:...]) never leak to chat bubbles or user 'ME'.
 * 3. Jev Engine correctly routes collective cleanup requests ('remove all files', 'clean all the files') to DELETE_FILE.
 * 4. MicroVM VFS executes bulk file deletion without conversational stalling.
 * 5. Persistent chat sessions sanitize legacy leaked feedback on load.
 */

const { scoreJevTensor } = require('../api/_lib/jev/jev-tensor.js');
const { jevClassifyIntent, jevGenerateBespokeResponse } = require('../api/_lib/jev-engine.js');

module.exports = async function runAntigravityChatFlowSuite({ assert, window, document, rootDir }) {
  console.log("\n--- SUITE 27: Antigravity Collapsible UI, Feedback Privacy & Deletion Engine ---");

  // 1. Cognitive Architecture & Thinking Card Collapsed by Default
  const sampleThoughtMsg = "<thought>Analyzing codebase dependency graphs and MicroVM configurations.</thought>Hello, architect!";
  const parsedThoughtHtml = window.parseAiMarkdown(sampleThoughtMsg);
  assert(parsedThoughtHtml.includes('class="thought-card group"'), "Thought card renders with thought-card CSS class");
  assert(!parsedThoughtHtml.includes('class="thought-card group" open'), "Thought card is collapsed by default (no open attribute)");
  assert(parsedThoughtHtml.includes("Formulating Cognitive Architecture"), "Thought card has Antigravity banner");
  assert(parsedThoughtHtml.includes("Hello, architect!"), "Prose text outside thought card renders normally");

  // 2. Antigravity Work Done Container for Tool Directives
  const sampleToolsMsg = `
<thought>Planning file generation</thought>
[TOOL:LIST_DIR][/TOOL:LIST_DIR]
[TOOL:WRITE_FILE filename="app.py"]
print("LuminaVista")
[/TOOL:WRITE_FILE]
[TOOL:TASK_COMPLETE summary="Script synthesized successfully."]
Artifact app.py is ready.
`;
  const parsedToolsHtml = window.parseAiMarkdown(sampleToolsMsg);
  assert(parsedToolsHtml.includes('class="work-done-card group"'), "Tool calls are bundled inside work-done-card");
  assert(!parsedToolsHtml.includes('class="work-done-card group" open'), "Work Done card is collapsed by default (no open attribute)");
  assert(parsedToolsHtml.includes("work-done-summary"), "Work Done card includes sleek summary header");
  assert(parsedToolsHtml.includes("work-done-content"), "Work Done card contains expandable content block");
  assert(parsedToolsHtml.includes("3 actions completed"), "Work Done header displays exact actions count");
  assert(parsedToolsHtml.includes("Inspecting VFS Directory Tree"), "Contains List Dir tool action card");
  assert(parsedToolsHtml.includes("Created / Updated VFS Artifact"), "Contains Write File tool action card");
  assert(parsedToolsHtml.includes("Autonomous Objective Complete"), "Contains Task Complete action card");
  assert(parsedToolsHtml.includes("Artifact app.py is ready."), "Assistant conversational prose is preserved outside the cards");

  // 3. Stripping of Raw Tool Results & System Feedback Echoes
  const leakedRawMsg = `
[TOOL_RESULT:LIST_DIR]
- index.html (100 bytes)
- old.js (50 bytes)
[/TOOL_RESULT:LIST_DIR]
[SYSTEM AUTO-FEEDBACK TOOL RESULTS]:
Completed step.
Please analyze the above tool results and continue the autonomous task toward completion.
All operations have concluded safely.
`;
  const sanitizedProseHtml = window.parseAiMarkdown(leakedRawMsg);
  assert(!sanitizedProseHtml.includes("[TOOL_RESULT:LIST_DIR]"), "Raw TOOL_RESULT markers are cleanly stripped");
  assert(!sanitizedProseHtml.includes("SYSTEM AUTO-FEEDBACK TOOL RESULTS"), "Raw SYSTEM AUTO-FEEDBACK markers are stripped from prose");
  assert(sanitizedProseHtml.includes("All operations have concluded safely."), "Legitimate prose message remains intact");

  // 4. Chat UI Message Filtering: Leaked Loop Feedback Never Shows Under ME or Assistant
  const chatContainer = document.getElementById("aiChatHistory");
  assert(chatContainer !== null, "AI Chat History container is present in DOM");

  window.aiConversation = [
    { role: "user", content: "remove all the files i want full clean" },
    { role: "assistant", content: "<thought>Cleaning VFS</thought>[TOOL:DELETE_FILE filename=\"index.html\"][/TOOL:DELETE_FILE]\nWorkspace files have been cleaned." },
    {
      role: "user",
      content: "[SYSTEM AUTO-FEEDBACK TOOL RESULTS]:\n[TOOL_RESULT:DELETE_FILE filename=\"index.html\"]\nSuccessfully deleted.\n[/TOOL_RESULT:DELETE_FILE]\n\nPlease analyze the above tool results and continue the autonomous task toward completion.",
      isSystemFeedback: true,
      isAutonomousFeedback: true
    },
    { role: "assistant", content: "[TOOL:TASK_COMPLETE summary=\"Clean slate established.\"]All files removed." }
  ];

  window.renderAiChat();

  const renderedUserMessages = chatContainer.querySelectorAll(".flex-row-reverse");
  assert(renderedUserMessages.length === 1, "Only legitimate user prompt is rendered under user bubbles (Found: 1)");
  assert(renderedUserMessages[0].textContent.includes("remove all the files"), "User bubble contains user prompt");
  assert(!chatContainer.innerHTML.includes("[SYSTEM AUTO-FEEDBACK"), "Chat HTML never displays [SYSTEM AUTO-FEEDBACK");
  assert(!chatContainer.innerHTML.includes("[TOOL_RESULT:"), "Chat HTML never displays [TOOL_RESULT:");

  // 5. Jev Tensor Intent Routing for Bulk Workspace Cleanup
  const deletePrompts = [
    "remove all the files i want full clean",
    "clean all the files in vfs,allllll i am srious",
    "delete all files",
    "wipe the workspace clean",
    "clean slate for vfs"
  ];

  deletePrompts.forEach(p => {
    const classification = jevClassifyIntent(p, { "index.html": "", "task_runner.py": "", "task_summary.md": "" });
    assert(classification.route === "DELETE_FILE", `Jev correctly classifies "${p}" as DELETE_FILE (got: ${classification.route})`);
    assert(classification.requiredTools.includes("TOOL:DELETE_FILE"), `Requires TOOL:DELETE_FILE for "${p}"`);
  });

  // 6. Collective File Deletion Directives in Autonomous Generation
  const vfsMock = { "index.html": "", "task_runner.py": "", "task_summary.md": "", ".bashrc": "" };
  const autonomousReply = jevGenerateBespokeResponse("remove all the files i want full clean", 1, vfsMock);

  assert(autonomousReply.includes('[TOOL:DELETE_FILE filename="index.html"]'), "Emits DELETE_FILE for index.html");
  assert(autonomousReply.includes('[TOOL:DELETE_FILE filename="task_runner.py"]'), "Emits DELETE_FILE for task_runner.py");
  assert(autonomousReply.includes('[TOOL:DELETE_FILE filename="task_summary.md"]'), "Emits DELETE_FILE for task_summary.md");
  assert(autonomousReply.includes('[TOOL:DELETE_FILE filename=".bashrc"]'), "Emits DELETE_FILE for .bashrc");
  assert(autonomousReply.includes('[TOOL:TASK_COMPLETE'), "Emits TASK_COMPLETE upon bulk deletion");

  // 7. MicroVM VFS Bulk Cleanup Execution
  window.vfs = {
    "index.html": "<html></html>",
    "task_runner.py": "import os",
    "task_summary.md": "# Summary",
    ".bashrc": "export PATH"
  };

  const deleteResultWildcard = window.executeDeleteFile("*");
  assert(deleteResultWildcard.includes("Successfully wiped all 4 files"), "executeDeleteFile('*') cleanly wipes all files");
  assert(Object.keys(window.vfs).length === 0, "window.vfs is completely empty after bulk wipe");

  // 8. Session Sanitization on Load
  const dirtyHistory = [
    { role: "user", content: "clean vfs" },
    { role: "assistant", content: "wiped" },
    { role: "user", content: "[SYSTEM AUTO-FEEDBACK TOOL RESULTS]:\n[TOOL_RESULT:DELETE_FILE]done[/TOOL_RESULT:DELETE_FILE]" },
    { role: "tool", content: "Internal tool data" }
  ];

  window.localStorage.setItem("lumina_chat_sessions", JSON.stringify([
    { id: "test_dirty_sess", title: "Test Dirty", createdAt: Date.now(), updatedAt: Date.now(), messages: dirtyHistory }
  ]));
  window.localStorage.setItem("lumina_active_session_id", "test_dirty_sess");

  window.initChatSessions();

  const activeSess = window.aiSessions.find(s => s.id === "test_dirty_sess");
  assert(activeSess !== undefined, "Loaded test session from storage");
  assert(activeSess.messages.length === 2, "Sanitized dirty session to remove leaked feedback messages (Found: 2)");
  assert(activeSess.messages.every(m => !m.content.includes("SYSTEM AUTO-FEEDBACK")), "All messages in active session are clean");

  console.log("✓ Antigravity Collapsible UI, Feedback Privacy & Deletion Engine verified!");
};
