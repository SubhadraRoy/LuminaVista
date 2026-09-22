// modules/terminal.js - Quantum Terminal & E2B MicroVM Execution

(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (window.escapeHtml) return window.escapeHtml(str);
    return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function handleTerminalKeyDown(e) {
    const history = window.termHistory || [];
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0 && window.termHistoryIdx > 0) {
        window.termHistoryIdx--;
        e.target.value = history[window.termHistoryIdx];
      } else if (history.length > 0 && window.termHistoryIdx === -1) {
        window.termHistoryIdx = history.length - 1;
        e.target.value = history[window.termHistoryIdx];
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (window.termHistoryIdx >= 0 && window.termHistoryIdx < history.length - 1) {
        window.termHistoryIdx++;
        e.target.value = history[window.termHistoryIdx];
      } else {
        window.termHistoryIdx = -1;
        e.target.value = "";
      }
    }
  }

  async function handleTerminalCommand(e) {
    if (e) e.preventDefault();
    const inp = document.getElementById("terminalInput");
    if (!inp) return;
    const cmd = inp.value.trim();
    if (!cmd) return;

    if (!window.termHistory) window.termHistory = [];
    window.termHistory.push(cmd);
    window.termHistoryIdx = -1;
    const scr = document.getElementById("terminalScreen");
    if (!scr) return;

    const log = document.createElement("div");
    log.className = "text-zinc-400 font-mono";
    log.innerHTML = `<span class="text-cyan-400 font-bold">anish@microvm:~$</span> ${escapeHtml(cmd)}`;
    scr.appendChild(log);

    if (cmd === "clear") {
      scr.innerHTML = "";
      inp.value = "";
      return;
    }

    if (cmd.startsWith("ai ")) {
      const agentPrompt = cmd.slice(3).trim();
      const res = document.createElement("div");
      res.className = "text-purple-300 font-mono text-[11px] my-1";
      res.innerHTML = `<i data-lucide='loader' class='w-3 h-3 animate-spin inline'></i> Agent analyzing directive & orchestrating files...`;
      scr.appendChild(res);
      scr.scrollTop = scr.scrollHeight;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

      try {
        const aiRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `[TERMINAL AGENT REQUEST]: ${agentPrompt}`,
            requestedModel: localStorage.getItem("lumina_ai_model") || "gpt-oss:20b",
            messages: [
              { role: "system", content: window.getAiSystemPrompt ? window.getAiSystemPrompt() : "" },
              { role: "user", content: agentPrompt }
            ],
            currentVfs: window.vfs || {}
          })
        });

        const data = await aiRes.json();
        if (aiRes.ok) {
          const reply = data.choices?.[0]?.message?.content || data.response || data.reply || "";
          if (window.parseAndExecuteAgentDirectives) {
            await window.parseAndExecuteAgentDirectives(reply);
          }

          res.className = "text-emerald-400 font-mono whitespace-pre-wrap my-1";
          res.textContent = `[Agent Output]:\n${reply}`;
        } else {
          res.className = "text-rose-400 font-mono my-1";
          res.textContent = `[Agent Error]: ${data.error}`;
        }
      } catch (err) {
        res.className = "text-rose-400 font-mono my-1";
        res.textContent = `[Agent Fault]: ${err.message}`;
      }
      inp.value = "";
      scr.scrollTop = scr.scrollHeight;
      return;
    }

    const res = document.createElement("div");
    res.className = "text-purple-300 font-mono text-[11px]";
    res.innerHTML = `<i data-lucide='loader' class='w-3 h-3 animate-spin inline'></i> Dispatching command to Firecracker Linux VM...`;
    scr.appendChild(res);
    scr.scrollTop = scr.scrollHeight;
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

    try {
      const vfs = window.vfs || {};
      const filesArray = Object.keys(vfs).map(k => ({ name: k, content: vfs[k] }));

      const r = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd, files: filesArray })
      });

      const d = await r.json();
      if (r.ok) {
        res.className = "text-emerald-400 font-mono whitespace-pre-wrap my-1";
        res.textContent = (d.stdout || "") + (d.stderr ? "\n" + d.stderr : "");
        if (!res.textContent.trim()) res.textContent = "[Command completed with exit status 0]";

        if (Array.isArray(d.workspaceFiles)) {
          d.workspaceFiles.forEach(f => { vfs[f.name] = f.content; });
          localStorage.setItem("lumina_codespace_vfs", JSON.stringify(vfs));
          if (window.renderCodespaceFileTree) window.renderCodespaceFileTree();
          if (window.renderCodespaceFileTabs) window.renderCodespaceFileTabs();
        }
      } else {
        res.className = "text-rose-400 font-mono my-1";
        res.textContent = `[MicroVM Failure]: ${d.error || "Execution error"}\n${d.details || ""}`;
      }
    } catch (err) {
      res.className = "text-rose-400 font-mono my-1";
      res.textContent = `[Network Fault]: Could not contact terminal serverless route.`;
    }

    inp.value = "";
    scr.scrollTop = scr.scrollHeight;
  }

  // Export to window
  window.handleTerminalKeyDown = handleTerminalKeyDown;
  window.handleTerminalCommand = handleTerminalCommand;

})(window);
