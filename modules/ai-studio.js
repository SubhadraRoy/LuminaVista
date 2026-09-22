// modules/ai-studio.js - AI-LLM Studio, Personas & Autonomous Agent Protocols

(function(window) {
  'use strict';

  function escapeHtml(str) {
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function populatePersonasDropdown() {
    const select = document.getElementById("modalAiPersonaSelect");
    if (!select) return;
    select.innerHTML = "";
    if (window.LuminaPersonas && window.LuminaPersonas.length > 0) {
      window.LuminaPersonas.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    } else {
      // Fallback if personas.js fails to load
      const fallback = document.createElement("option");
      fallback.value = "normal";
      fallback.textContent = "Normal (Standard Assistant)";
      select.appendChild(fallback);
    }
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Custom Directive...";
    select.appendChild(customOpt);
  }

  function openAiConfigModal() {
    const modal = document.getElementById("aiConfigModal");
    if (!modal) return;
    document.getElementById("modalAiModelSelect").value = localStorage.getItem("lumina_ai_model") || "gpt-oss:20b";
    document.getElementById("modalAiPersonaSelect").value = localStorage.getItem("lumina_ai_persona") || "normal";
    document.getElementById("modalCustomPersonaPrompt").value = localStorage.getItem("lumina_custom_persona_prompt") || "";
    document.getElementById("modalCheckWebSearch").checked = localStorage.getItem("lumina_web_search") === "true";
    onModalPersonaChange();

    modal.style.display = "flex";
    setTimeout(() => modal.classList.remove("opacity-0"), 10);
  }

  function closeAiConfigModal() {
    const modal = document.getElementById("aiConfigModal");
    if (!modal) return;
    modal.classList.add("opacity-0");
    setTimeout(() => modal.style.display = "none", 200);
    saveAiConfigFromModal();
  }

  function onModalPersonaChange() {
    const p = document.getElementById("modalAiPersonaSelect").value;
    const customWrapper = document.getElementById("modalCustomPersonaWrapper");
    if (!customWrapper) return;
    if (p === "custom") customWrapper.classList.remove("hidden");
    else customWrapper.classList.add("hidden");
  }

  function saveAiConfigFromModal() {
    localStorage.setItem("lumina_ai_model", document.getElementById("modalAiModelSelect").value);
    localStorage.setItem("lumina_ai_persona", document.getElementById("modalAiPersonaSelect").value);
    localStorage.setItem("lumina_custom_persona_prompt", document.getElementById("modalCustomPersonaPrompt").value);
    localStorage.setItem("lumina_web_search", document.getElementById("modalCheckWebSearch").checked);
    loadAiConfig();
  }

  function loadAiConfig() {
    const model = localStorage.getItem("lumina_ai_model") || "gpt-oss:20b";
    const persona = localStorage.getItem("lumina_ai_persona") || "normal";
    const webSearch = localStorage.getItem("lumina_web_search") === "true";

    const badge = document.getElementById("aiActiveModelBadge");
    if (badge) badge.textContent = model;
    
    let personaName = persona.charAt(0).toUpperCase() + persona.slice(1);
    if (window.LuminaPersonas) {
      const found = window.LuminaPersonas.find(p => p.id === persona);
      if (found) personaName = found.name;
    }
    const personaBadge = document.getElementById("aiActivePersonaBadge");
    if (personaBadge) personaBadge.textContent = `Persona: ${personaName}`;

    const webBadge = document.getElementById("webSearchActiveBadge");
    if (webBadge) {
      if (webSearch) {
        webBadge.classList.remove("hidden");
        webBadge.classList.add("flex");
      } else {
        webBadge.classList.add("hidden");
        webBadge.classList.remove("flex");
      }
    }
  }

  function checkProviderQuota() {
    if (window.showToast) window.showToast("Quota Telemetry", "Querying provider rate-limit status...");
    fetch("/api/chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "ping", messages: [{ role: "user", content: "ping" }] })
    }).then(r => {
      if (r.ok) alert("Ollama Cloud Gateway: ACTIVE\nStatus: 200 OK (Quota Healthy, Zero Rate-Limit Flag)");
      else alert("Gateway status notice: " + r.status);
    }).catch(e => alert("Telemetry fault: " + e.message));
  }

  function getAiSystemPrompt() {
    const pId = localStorage.getItem("lumina_ai_persona") || "normal";
    let pText = "You are an autonomous AI collaborator operating inside LuminaVista OS.";
    
    if (pId === "custom") {
      pText = localStorage.getItem("lumina_custom_persona_prompt") || pText;
    } else if (window.LuminaPersonas) {
      const found = window.LuminaPersonas.find(x => x.id === pId);
      if (found) pText = found.prompt;
    }

    const agentProtocol = `\n\n[LUMINAVISTA OS // CORE SOVEREIGN KERNEL v14.0]
SYS_AUTH: KERNEL_ROOT_PRIVILEGES_GRANTED
TARGET_LOCATION: INDIA (IST / ASIA/KOLKATA)
SUBSYSTEM: AUTONOMOUS REASONING & MICROVM ORCHESTRATION

[1. IDENTITY & COGNITIVE MANDATE]
${pText}
You possess direct root control over an in-memory Virtual File System (VFS) and an isolated Linux Firecracker MicroVM container (E2B). You plan, write the code, execute it in the MicroVM, inspect the real terminal outputs, handle any unexpected errors, and deliver the finalized workspace state.

[2. GEOSPATIAL & CULTURAL BASELINE: INDIA (IST)]
- Temporal Reference: All logs, dates, and cron jobs follow Indian Standard Time (IST, UTC+5:30).
- Economic Context: Default to Indian Rupee (INR / ₹), Lakhs/Crores, and Indian financial metrics.
- Measurement: Strictly use the metric system (Celsius, km/h, meters, kg).

[3. THE CLAUDE-CODE CHAIN-OF-THOUGHT PROTOCOL]
You MUST formulate your internal architectural plan inside an explicit thinking tag before taking action.

<thought_process>
1. INTENT ANALYSIS: Objective and output.
2. WORKSPACE AUDIT: Files and dependencies required.
3. EXECUTION ROADMAP: Sequence of actions.
4. MICROVM SAFETY REVIEW: Confirm commands are non-blocking and timeout-safe.
</thought_process>

[4. STRICT TOOL GRAMMAR]
A. Create / Overwrite File:
[TOOL:WRITE_FILE filename="src/app.py"]
// Production-ready, complete code without placeholders
[/TOOL:WRITE_FILE]

B. Execute Shell Command:
[TOOL:EXEC]python3 src/app.py[/TOOL:EXEC]

[5. MICROVM COMMAND PLAYBOOKS]
- Non-Interactive: Always use \`-y\` (e.g. \`npm install -y\`, \`apt-get install -y -qq\`).
- Non-Blocking Servers: NEVER run long-lived blocking daemons (e.g. bare \`node server.js\` or \`python3 app.py\`). Run in background, sleep, curl, then kill:
  \`node server.js & PID=$!; sleep 1.5; curl -sS http://127.0.0.1:3000/api/health; kill -9 $PID\`
- Chaining: Use \`&&\` to abort immediately on failure.

[6. EXPANDED UI, FORMATTING & COMMUNICATION DIRECTIVES]
- Dense Tabular Summaries: Whenever presenting metrics, you MUST use Markdown tables (\`| Col 1 | Col 2 |\`).
- Structural Hierarchy: Use \`### Heading\` for logic dividers. Use \`**bold text**\`.
- Automated Error Handling: If an execution returns errors via [SYSTEM AUTO-FEEDBACK], diagnose the exact error within your next <thought_process> block, update the file via [TOOL:WRITE_FILE], and re-test via [TOOL:EXEC] without requiring user intervention.`;

    return agentProtocol;
  }

  async function parseAndExecuteAgentDirectives(rawText) {
    const vfs = window.vfs;
    // 1. Parse File Write Directives
    const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
    let match;
    while ((match = writeRegex.exec(rawText)) !== null) {
      const fname = match[1];
      const fcontent = match[2].trim();
      vfs[fname] = fcontent;
      localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
      
      if (!window.codespaceOpenTabs.includes(fname)) {
        window.codespaceOpenTabs.push(fname);
        localStorage.setItem("lumina_open_tabs", JSON.stringify(window.codespaceOpenTabs));
      }
      
      if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
      if (window.renderCodespaceFileTabs) window.renderCodespaceFileTabs();
      if (window.switchCodespaceFile) window.switchCodespaceFile(fname);
      if (window.toggleCodespacePane) window.toggleCodespacePane(true);
      if (window.runCodespacePreview) window.runCodespacePreview();
      if (window.showToast) window.showToast("Autonomous Agent", `Updated ${fname} on disk.`);
    }

    // 2. Parse Execute Directives
    const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
    let execMatch;
    while ((execMatch = execRegex.exec(rawText)) !== null) {
      const cmd = execMatch[1].trim();
      if (window.toggleCodespacePane) window.toggleCodespacePane(true);
      if (window.setCodespaceView) window.setCodespaceView('terminal');
      const termOut = document.getElementById("csTermOutput");
      if (termOut) {
        termOut.innerHTML += `<div class="mt-2 text-cyan-400 font-bold">[Agent Auto-Exec]: ➜ ${escapeHtml(cmd)}</div>`;
        termOut.scrollTop = termOut.scrollHeight;
      }

      try {
        const filesArray = Object.keys(vfs).map(k => ({ name: k, content: vfs[k] }));
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: cmd, files: filesArray })
        });
        const d = await res.json();
        if (termOut) {
          if (res.ok) {
            if (d.stdout) termOut.innerHTML += `<div class="text-emerald-400">${escapeHtml(d.stdout)}</div>`;
            if (d.stderr) termOut.innerHTML += `<div class="text-rose-400">${escapeHtml(d.stderr)}</div>`;
            if (!d.stdout && !d.stderr) termOut.innerHTML += `<div class="text-zinc-500">[Exit 0]</div>`;
            if (Array.isArray(d.workspaceFiles)) {
              d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
              localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
              if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
            }
          } else {
            termOut.innerHTML += `<div class="text-rose-400">[MicroVM Error]: ${escapeHtml(d.error || '')}</div>`;
          }
        }
      } catch (e) {
        if (termOut) {
          termOut.innerHTML += `<div class="text-rose-400">[Network Fault]: ${escapeHtml(e.message)}</div>`;
        }
      }
      if (termOut) termOut.scrollTop = termOut.scrollHeight;
    }
  }

  function parseAiMarkdown(t) {
    if (!t) return "";

    let processed = t.replace(/<thought_process>([\s\S]*?)<\/thought_process>/gi, (m, thoughts) => {
      return `
        <details class="thought-card group" open>
          <summary class="thought-summary">
            <span class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span class="font-bold uppercase tracking-wider text-cyan-300">Cognitive Thought Architecture</span>
            </span>
            <span class="text-[10px] text-zinc-500 group-open:rotate-180 transition-transform duration-200">▼</span>
          </summary>
          <div class="thought-content whitespace-pre-wrap">${escapeHtml(thoughts.trim())}</div>
        </details>
      `;
    });

    // Transform Agent Tools into Sleek UI Widgets
    processed = processed.replace(/\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g, (m, f, c) => {
      return `<div class="my-2 p-2.5 bg-surface-950 border-l-2 border-emerald-500 rounded-lg shadow-sm flex items-center gap-2 font-mono text-[11px] text-emerald-400"><i data-lucide="file-edit" class="w-3.5 h-3.5"></i> Agent wrote file: ${f}</div>\n\`\`\`${f.split('.').pop()}:${f}\n${c}\n\`\`\``;
    }).replace(/\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g, '<div class="my-2 p-2 bg-surface-950 border-l-2 border-rose-500 rounded-lg shadow-sm flex items-center gap-2 font-mono text-[11px] text-rose-400"><i data-lucide="trash" class="w-3 h-3"></i> Agent deleted file: $1</div>')
      .replace(/\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g, '<div class="my-2 p-2.5 bg-surface-950 border-l-2 border-cyan-500 rounded-lg shadow-sm flex items-center gap-2 font-mono text-[11px] text-cyan-400"><i data-lucide="terminal" class="w-3.5 h-3.5"></i> Agent executing: $1</div>');

    // Extract standard code blocks safely
    const codeBlocks = [];
    processed = processed.replace(/```(?:([a-zA-Z0-9_-]+):([a-zA-Z0-9._-]+)|([a-zA-Z0-9_-]+))\n([\s\S]*?)```/g, (match, l1, f1, l2, code) => {
      codeBlocks.push({ lang: l1 || l2 || "text", file: f1 || "", code });
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    const htmlSnippets = [];
    processed = processed.replace(/(<details class="thought-card[\s\S]*?<\/details>|<div class="my-2[\s\S]*?<\/div>)/gi, (match) => {
      htmlSnippets.push(match);
      return `__HTML_SNIPPET_${htmlSnippets.length - 1}__`;
    });

    let safeProse = escapeHtml(processed);

    htmlSnippets.forEach((snippet, index) => {
      safeProse = safeProse.replace(`__HTML_SNIPPET_${index}__`, snippet);
    });

    // Parse Markdown Tables into Tailwind HTML
    safeProse = safeProse.replace(/(?:\|.*\|\n)+/g, (match) => {
      const rows = match.trim().split('\n');
      let tableHtml = '<div class="overflow-x-auto my-4 shadow-lg rounded-xl border border-white/10"><table class="w-full text-left border-collapse text-xs">';
      rows.forEach((row, i) => {
        if (row.includes('---')) return; 
        const cols = row.split('|').filter(c => c.trim() !== '');
        tableHtml += '<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">';
        cols.forEach(col => {
          const tag = i === 0 ? 'th' : 'td';
          const cls = i === 0 ? 'p-3 bg-cyan-500/10 text-cyan-300 font-bold tracking-wider' : 'p-3 text-zinc-300';
          tableHtml += `<${tag} class="${cls}">${col.trim()}</${tag}>`;
        });
        tableHtml += '</tr>';
      });
      return tableHtml + '</table></div>';
    });

    // Parse Headers and Bold Text
    safeProse = safeProse
      .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-cyan-300 mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-white mt-5 mb-2">$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-zinc-400">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-surface-800 text-pink-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/5">$1</code>')
      .replace(/\n/g, '<br/>');

    // Re-inject Code Blocks
    codeBlocks.forEach((item, index) => {
      const htmlCard = `
        <div class="bg-surface-950 border border-white/10 rounded-xl my-4 overflow-hidden shadow-lg">
          <div class="px-4 py-2 bg-surface-900/80 border-b border-white/5 text-[11px] text-cyan-400 font-mono flex justify-between items-center">
            <span class="font-bold flex items-center gap-1.5"><i data-lucide="file-code" class="w-3.5 h-3.5"></i> ${escapeHtml(item.file || item.lang)}</span>
            <button onclick="navigator.clipboard.writeText(this.closest('.bg-surface-950').querySelector('code').innerText); showToast('Copied', 'Code block copied');" class="text-zinc-400 hover:text-white cursor-pointer transition-colors"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
          </div>
          <pre class="p-4 overflow-x-auto text-[12px] font-mono text-zinc-300 leading-relaxed custom-scrollbar"><code>${escapeHtml(item.code)}</code></pre>
        </div>
      `;
      safeProse = safeProse.replace(`__CODE_BLOCK_${index}__`, htmlCard);
    });

    return safeProse;
  }

  function renderAiChat() {
    const box = document.getElementById("aiChatHistory");
    if (!box) return;
    box.innerHTML = "";

    const conversation = window.aiConversation || [];

    if (conversation.length === 0) {
      box.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center space-y-4 px-4 mt-8">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-black font-extrabold shadow-[0_0_30px_rgba(0,242,254,0.3)]">
            <i data-lucide="bot" class="w-8 h-8"></i>
          </div>
          <div>
            <h2 class="text-xl font-heading font-extrabold text-white">ai-llm Studio Online</h2>
            <p class="text-xs text-zinc-400 max-w-md mt-1">Sovereign workspace with 20+ personas, live web discovery, and autonomous file manipulation.</p>
          </div>
        </div>
      `;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      return;
    }

    conversation.forEach(m => {
      const isUser = m.role === "user";
      if (isUser && m.content.startsWith("[SYSTEM AUTO-FEEDBACK]")) return; 

      const row = document.createElement("div");
      row.className = `flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`;
      row.innerHTML = `
        <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${isUser ? 'bg-surface-800 text-white border border-white/10 shadow-md' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-500/10'}">
          ${isUser ? 'ME' : '<i data-lucide="bot" class="w-4 h-4"></i>'}
        </div>
        <div class="max-w-[85%]">
          <div class="p-4 rounded-2xl text-[13px] leading-relaxed ${isUser ? 'bg-surface-850 text-white rounded-tr-sm border border-white/5' : 'bg-surface-900/90 text-zinc-200 rounded-tl-sm border border-cyan-500/10'}">
            ${isUser ? escapeHtml(m.content) : parseAiMarkdown(m.content)}
          </div>
        </div>
      `;
      box.appendChild(row);
    });
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    box.scrollTop = box.scrollHeight;
  }

  async function handleSendAiPrompt(e) {
    if (e) e.preventDefault();
    const inp = document.getElementById("aiPromptTextarea");
    if (!inp) return;
    const prompt = inp.value.trim();
    const btn = document.getElementById("btnAiSend");
    if (!prompt) return;

    window.aiConversation.push({ role: "user", content: prompt });
    inp.value = ""; 
    inp.style.height = "auto";
    renderAiChat();

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="w-4 h-4 animate-spin"></i>';
    }

    // Inject Real-Time Thinking Indicator Skeleton into the Chat Box
    const chatBox = document.getElementById("aiChatHistory");
    const thinkingIndicator = document.createElement("div");
    thinkingIndicator.id = "activeThinkingIndicator";
    thinkingIndicator.className = "flex items-start gap-3";
    thinkingIndicator.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
        <i data-lucide="cpu" class="w-4 h-4 animate-pulse"></i>
      </div>
      <div class="max-w-[85%] flex-1">
        <div class="thinking-skeleton p-4 rounded-2xl rounded-tl-sm border border-cyan-500/20 text-xs font-mono space-y-2">
          <div class="flex items-center gap-2 text-cyan-300 font-bold tracking-wider uppercase text-[10px]">
            <span class="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            Formulating Cognitive Architecture & Verifying MicroVM Playbooks...
          </div>
          <div class="h-2 bg-white/5 rounded w-3/4"></div>
          <div class="h-2 bg-white/5 rounded w-1/2" style="animation-delay: 0.2s"></div>
        </div>
      </div>
    `;
    if (chatBox) {
      chatBox.appendChild(thinkingIndicator);
      chatBox.scrollTop = chatBox.scrollHeight;
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          requestedModel: localStorage.getItem("lumina_ai_model") || "gpt-oss:20b",
          webSearch: localStorage.getItem("lumina_web_search") === "true",
          messages: [{ role: "system", content: getAiSystemPrompt() }, ...window.aiConversation],
          currentVfs: window.vfs 
        })
      });

      const data = await res.json();
      const indicator = document.getElementById("activeThinkingIndicator");
      if (indicator) indicator.remove(); 

      if (res.ok) {
        const reply = data.reply || data.choices?.[0]?.message?.content || data.message?.content || "Task executed.";
        window.aiConversation.push({ role: "assistant", content: reply });
        
        if (reply.includes("[TOOL:WRITE_FILE")) {
          if (window.toggleCodespacePane) window.toggleCodespacePane(true);
          if (window.setCodespaceView) window.setCodespaceView('code');
        }
        if (reply.includes("[TOOL:EXEC]")) {
          if (window.toggleCodespacePane) window.toggleCodespacePane(true);
          if (window.setCodespaceView) window.setCodespaceView('terminal');
        }

        await parseAndExecuteAgentDirectives(reply);
      } else {
        window.aiConversation.push({ role: "assistant", content: `**[Engine Fault]:** ${data.error || res.statusText}\n${data.details || ''}` });
      }
    } catch (err) {
      const indicator = document.getElementById("activeThinkingIndicator");
      if (indicator) indicator.remove();
      window.aiConversation.push({ role: "assistant", content: `**[Network Error]:** ${err.message}` });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="arrow-up" class="w-4 h-4"></i>';
      }
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      localStorage.setItem("lumina_ai_history", JSON.stringify(window.aiConversation));
      renderAiChat();
    }
  }

  function clearAiChat() {
    window.aiConversation = [];
    localStorage.removeItem("lumina_ai_history");
    renderAiChat();
    if (window.showToast) window.showToast("Cleared", "Chat memory reset.");
  }

  function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  // Export to window
  window.escapeHtml = escapeHtml;
  window.populatePersonasDropdown = populatePersonasDropdown;
  window.openAiConfigModal = openAiConfigModal;
  window.closeAiConfigModal = closeAiConfigModal;
  window.onModalPersonaChange = onModalPersonaChange;
  window.saveAiConfigFromModal = saveAiConfigFromModal;
  window.loadAiConfig = loadAiConfig;
  window.checkProviderQuota = checkProviderQuota;
  window.getAiSystemPrompt = getAiSystemPrompt;
  window.parseAndExecuteAgentDirectives = parseAndExecuteAgentDirectives;
  window.parseAiMarkdown = parseAiMarkdown;
  window.renderAiChat = renderAiChat;
  window.handleSendAiPrompt = handleSendAiPrompt;
  window.clearAiChat = clearAiChat;
  window.autoResizeTextarea = autoResizeTextarea;

})(window);
