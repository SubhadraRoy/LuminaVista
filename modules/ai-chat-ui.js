// modules/ai-chat-ui.js - Cognitive Thinking UI, Thinking Orbs & Markdown Chat Engine for LuminaVista OS
(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (window.escapeHtml) return window.escapeHtml(str);
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const updateActiveSessionMessages = (...args) => (window.updateActiveSessionMessages ? window.updateActiveSessionMessages(...args) : undefined);
  const autoResizeTextarea = (...args) => (window.autoResizeTextarea ? window.autoResizeTextarea(...args) : undefined);
  const handleSendAiPrompt = (...args) => (window.handleSendAiPrompt ? window.handleSendAiPrompt(...args) : undefined);
  const switchTab = (...args) => (window.switchTab ? window.switchTab(...args) : undefined);

  // 3. THINKING ORBS ENGINE (Multi-State Animated AI Thought Indicator)
  // Supports: breathing | solving | searching | connecting | composing | working
  // =========================================================================
  let currentThinkingOrbState = 'breathing';
  const thinkingOrbRegistry = [];

  function setThinkingOrbState(state) {
    currentThinkingOrbState = state;
    thinkingOrbRegistry.forEach(orb => { orb.state = state; });
  }

  function createThinkingOrb(canvas) {
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const size = canvas.width || 48;
    const center = size / 2;
    let animId = null;
    const startTime = Date.now();

    const instance = {
      canvas,
      ctx,
      state: currentThinkingOrbState,
      stop: () => { if (animId) cancelAnimationFrame(animId); }
    };

    function render() {
      const elapsed = (Date.now() - startTime) / 1000;
      ctx.clearRect(0, 0, size, size);
      const st = instance.state || 'breathing';

      if (st === 'breathing') {
        // Idle breathing rhythm: expanding/contracting dotted ring with soft glow
        const count = 16;
        const breath = Math.sin(elapsed * 2) * (size * 0.05);
        const r = (size * 0.33) + breath;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + elapsed * 0.35;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          const alpha = 0.45 + Math.sin(elapsed * 2 + i) * 0.35;
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 242, 254, ${Math.max(0.2, alpha)})`;
          ctx.shadowColor = "rgba(0, 242, 254, 0.7)";
          ctx.shadowBlur = 4;
          ctx.fill();
        }
      } else if (st === 'solving') {
        // Chain-of-thought reasoning: dual counter-rotating concentric orbital rings
        const rings = [
          { r: size * 0.20, count: 8, dir: 1, speed: 2.2, color: 'rgba(168, 85, 247, 0.9)' },
          { r: size * 0.34, count: 14, dir: -1, speed: 1.6, color: 'rgba(0, 242, 254, 0.9)' }
        ];
        rings.forEach(ring => {
          for (let i = 0; i < ring.count; i++) {
            const angle = (i / ring.count) * Math.PI * 2 + elapsed * ring.speed * ring.dir;
            const x = center + Math.cos(angle) * ring.r;
            const y = center + Math.sin(angle) * ring.r;
            ctx.beginPath();
            ctx.arc(x, y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = ring.color;
            ctx.shadowColor = ring.color;
            ctx.shadowBlur = 5;
            ctx.fill();
          }
        });
      } else if (st === 'searching') {
        // Globe scan meridian: spherical latitude dots with sweeping scan longitude line
        const count = 18;
        const r = size * 0.34;
        const scan = (Math.sin(elapsed * 3) + 1) / 2;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          const distToScan = Math.abs((x / size) - scan);
          const alpha = distToScan < 0.25 ? 0.95 : 0.25;
          ctx.beginPath();
          ctx.arc(x, y, distToScan < 0.2 ? 2.2 : 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
          ctx.shadowColor = "rgba(56, 189, 248, 0.8)";
          ctx.shadowBlur = distToScan < 0.2 ? 6 : 2;
          ctx.fill();
        }
      } else if (st === 'connecting') {
        // MicroVM handshake & network nodes connecting with lines
        const nodeCount = 6;
        const r = size * 0.33;
        const pts = [];
        for (let i = 0; i < nodeCount; i++) {
          const angle = (i / nodeCount) * Math.PI * 2 + Math.sin(elapsed + i) * 0.3;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          pts.push({ x, y });
        }
        ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
        ctx.lineWidth = 1;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        pts.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.0, 0, Math.PI * 2);
          ctx.fillStyle = "#10b981";
          ctx.shadowColor = "#10b981";
          ctx.shadowBlur = 5;
          ctx.fill();
        });
      } else if (st === 'composing') {
        // Code drafting: undulating multi-frequency ribbon of particles
        const waveCount = 18;
        for (let i = 0; i < waveCount; i++) {
          const normX = i / (waveCount - 1);
          const x = (size * 0.15) + normX * (size * 0.7);
          const waveY = Math.sin(normX * Math.PI * 3 + elapsed * 4) * (size * 0.18);
          const y = center + waveY;
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(244, 63, 94, 0.9)";
          ctx.shadowColor = "rgba(244, 63, 94, 0.8)";
          ctx.shadowBlur = 5;
          ctx.fill();
        }
      } else {
        // 'working': high-speed orbital loop
        const count = 10;
        const r = size * 0.34;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + elapsed * 3.8;
          const x = center + Math.cos(angle) * r;
          const y = center + Math.sin(angle) * r;
          ctx.beginPath();
          ctx.arc(x, y, 1.9, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 242, 254, 0.9)";
          ctx.shadowColor = "rgba(0, 242, 254, 0.8)";
          ctx.shadowBlur = 5;
          ctx.fill();
        }
      }

      ctx.shadowBlur = 0;
      animId = requestAnimationFrame(render);
    }

    render();
    thinkingOrbRegistry.push(instance);
    return instance;
  }

  function initThinkingOrb(canvasId = "headerThinkingOrb") {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return createThinkingOrb(canvas);
  }

  // =========================================================================

  // 5. CLAUDE & ANTIGRAVITY COGNITIVE THINKING UI & MARKDOWN PARSER
  // =========================================================================

  function parseAiMarkdown(t) {
    if (!t) return "";

    const htmlSnippets = [];
    const codeBlocks = [];

    function storeSnippet(html) {
      htmlSnippets.push(html);
      return `__HTML_SNIPPET_${htmlSnippets.length - 1}__`;
    }

    // 1. Thinking / Cognitive Architecture Card with exact requested banner
    let processed = t.replace(/<(?:thought_process|thought)>([\s\S]*?)<\/(?:thought_process|thought)>/gi, (m, thoughts) => {
      return storeSnippet(`
        <details class="thought-card group" open>
          <summary class="thought-summary">
            <span class="flex items-center gap-2">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span class="font-bold uppercase tracking-wider text-cyan-300 text-[11px]">
                Formulating Cognitive Architecture &amp; Verifying MicroVM Playbooks...
              </span>
            </span>
            <span class="text-[10px] text-zinc-500 group-open:rotate-180 transition-transform duration-200">▼</span>
          </summary>
          <div class="thought-content whitespace-pre-wrap leading-relaxed text-cyan-100/80">${escapeHtml(thoughts.trim())}</div>
        </details>
      `);
    });

    // 2. Transform Antigravity Autonomous Tools into Sleek Action Cards
    processed = processed
      .replace(/\[TOOL:SEARCH_WEB query="([^"]+)"\]\[\/TOOL:SEARCH_WEB\]/g, (m, q) => {
        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-sky-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-sky-300">
          <i data-lucide="search" class="w-4 h-4 text-sky-400 shrink-0"></i>
          <span><strong>Autonomous Web Search:</strong> "${escapeHtml(q)}"</span>
        </div>`);
      })
      .replace(/\[TOOL:VIEW_FILE filename="([^"]+)"\]\[\/TOOL:VIEW_FILE\]/g, (m, f) => {
        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-indigo-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-indigo-300">
          <i data-lucide="file-text" class="w-4 h-4 text-indigo-400 shrink-0"></i>
          <span><strong>Inspecting VFS File:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code></span>
        </div>`);
      })
      .replace(/\[TOOL:LIST_DIR\]\[\/TOOL:LIST_DIR\]/g, () => {
        return storeSnippet(`<div class="my-2 p-2.5 bg-surface-950/90 border border-zinc-700 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-zinc-300">
          <i data-lucide="folder" class="w-4 h-4 text-cyan-400 shrink-0"></i>
          <span><strong>Inspecting VFS Directory Tree</strong></span>
        </div>`);
      })
      .replace(/\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g, (m, f, c) => {
        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-emerald-500/30 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-emerald-300">
          <div class="flex items-center gap-2">
            <i data-lucide="file-code" class="w-4 h-4 text-emerald-400 shrink-0"></i>
            <span><strong>Created / Updated VFS Artifact:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code> (${c.trim().length} bytes)</span>
          </div>
          <button onclick="window.switchAiSubTab('artifacts'); window.switchAndOpenFile('${escapeHtml(f)}');" class="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-[11px] font-semibold border border-emerald-500/40 cursor-pointer flex items-center gap-1 transition-colors">
            <i data-lucide="folder-code" class="w-3.5 h-3.5"></i> Open in Artifacts Tab
          </button>
        </div>`);
      })
      .replace(/\[TOOL:EDIT_FILE filename="([^"]+)"\]\s*<target>([\s\S]*?)<\/target>\s*<replacement>([\s\S]*?)<\/replacement>\s*\[\/TOOL:EDIT_FILE\]/g, (m, f, t, r) => {
        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-amber-500/30 rounded-xl shadow-lg font-mono text-xs text-amber-300 space-y-2">
          <div class="flex items-center gap-2">
            <i data-lucide="edit-3" class="w-4 h-4 text-amber-400 shrink-0"></i>
            <span><strong>Targeted Edit on Artifact:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code></span>
          </div>
          <div class="p-2 bg-black/50 rounded-lg text-[11px] space-y-1 font-mono">
            <div class="text-rose-400 line-through">-${escapeHtml(t.trim().substring(0, 100))}${t.length > 100 ? '...' : ''}</div>
            <div class="text-emerald-400">+${escapeHtml(r.trim().substring(0, 100))}${r.length > 100 ? '...' : ''}</div>
          </div>
        </div>`);
      })
      .replace(/\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g, (m, f) => {
        return storeSnippet(`<div class="my-2 p-2.5 bg-surface-950/90 border border-rose-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-rose-400">
          <i data-lucide="trash" class="w-4 h-4 text-rose-500 shrink-0"></i>
          <span><strong>Deleted VFS Artifact:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(f)}</code></span>
        </div>`);
      })
      .replace(/\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g, (m, cmd) => {
        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-cyan-500/30 rounded-xl shadow-lg flex items-center gap-2.5 font-mono text-xs text-cyan-300">
          <i data-lucide="terminal" class="w-4 h-4 text-cyan-400 shrink-0"></i>
          <span><strong>MicroVM Terminal Exec:</strong> <code class="text-cyan-200 bg-black/40 px-2 py-0.5 rounded">➜ ${escapeHtml(cmd.trim())}</code></span>
        </div>`);
      })
      .replace(/\[TOOL:SCHEDULE_EVENT([^\]]*)\](?:([\s\S]*?)\[\/TOOL:SCHEDULE_EVENT\])?/g, (m, attrStr) => {
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_\-]+)="([^"]*)"/g;
        let aMatch;
        while ((aMatch = attrRegex.exec(attrStr || '')) !== null) {
          attrs[aMatch[1]] = aMatch[2];
        }
        const act = (attrs.action || 'create').toLowerCase();
        const titleStr = attrs.title || attrs.query || 'Calendar Event';
        const isPlan = act === 'auto_plan';
        const isView = act === 'view' || act === 'list';
        const isDelete = act === 'delete' || act === 'remove';
        const isEdit = act === 'edit' || act === 'update';

        let label = 'Calendar Event Scheduled';
        let detail = titleStr;
        let badgeColor = 'cyan';
        let iconName = 'calendar';
        if (isPlan) {
          label = 'Autonomous Real-Life Day Plan';
          detail = attrs.date || 'Today';
        } else if (isView) {
          label = 'Calendar Schedule Query';
          detail = attrs.range === 'next_week' ? 'Next Week Schedule' : (attrs.range || attrs.date || 'Upcoming Events');
        } else if (isDelete) {
          label = 'Calendar Event Deleted';
          detail = titleStr;
          badgeColor = 'rose';
          iconName = 'trash-2';
        } else if (isEdit) {
          label = 'Calendar Event Updated';
          detail = titleStr;
        }

        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-${badgeColor}-500/30 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-${badgeColor}-300">
          <div class="flex items-center gap-2">
            <i data-lucide="${iconName}" class="w-4 h-4 text-${badgeColor}-400 shrink-0"></i>
            <span><strong>${label}:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(detail)}</code></span>
          </div>
          <button onclick="switchTab('tab-calendar')" class="px-2.5 py-1 rounded-lg bg-${badgeColor}-500/20 hover:bg-${badgeColor}-500/30 text-${badgeColor}-200 text-[11px] font-semibold border border-${badgeColor}-500/40 cursor-pointer flex items-center gap-1 transition-colors">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Open in Calendar
          </button>
        </div>`);
      })
      .replace(/\[TOOL:WHITEBOARD([^\]]*)\](?:([\s\S]*?)\[\/TOOL:WHITEBOARD\])?/g, (m, attrStr) => {
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_\-]+)="([^"]*)"/g;
        let aMatch;
        while ((aMatch = attrRegex.exec(attrStr || '')) !== null) {
          attrs[aMatch[1]] = aMatch[2];
        }
        const act = (attrs.action || 'draw').toLowerCase();
        const titleStr = attrs.title || attrs.name || 'System Architecture';

        let badgeColor = 'fuchsia';
        let iconName = 'layout';
        let label = 'AI Whiteboard Visualized';
        if (act === 'clear') {
          label = 'Whiteboard Cleared';
          badgeColor = 'rose';
          iconName = 'trash-2';
        } else if (act === 'template') {
          label = 'Whiteboard Blueprint Loaded';
          badgeColor = 'cyan';
        }

        return storeSnippet(`<div class="my-2 p-3 bg-surface-950/90 border border-${badgeColor}-500/30 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-${badgeColor}-300">
          <div class="flex items-center gap-2">
            <i data-lucide="${iconName}" class="w-4 h-4 text-${badgeColor}-400 shrink-0"></i>
            <span><strong>${label}:</strong> <code class="text-white bg-black/40 px-1.5 py-0.5 rounded">${escapeHtml(titleStr)}</code></span>
          </div>
          <button onclick="switchTab('tab-whiteboard')" class="px-2.5 py-1 rounded-lg bg-${badgeColor}-500/20 hover:bg-${badgeColor}-500/30 text-${badgeColor}-200 text-[11px] font-semibold border border-${badgeColor}-500/40 cursor-pointer flex items-center gap-1 transition-colors">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Open Whiteboard Pro
          </button>
        </div>`);
      })
      .replace(/\[TOOL:TASK_COMPLETE(?: summary="([^"]*)")?\](?:([\s\S]*?)\[\/TOOL:TASK_COMPLETE\])?/g, (m, s1, s2) => {
        const sum = s1 || (s2 ? s2.trim() : "All autonomous tasks completed.");
        return storeSnippet(`<div class="my-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-xl flex items-start gap-3 font-sans text-xs text-emerald-200">
          <div class="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
          </div>
          <div>
            <div class="font-bold text-sm text-emerald-300">Autonomous Objective Complete</div>
            <div class="mt-0.5 text-zinc-300 font-mono text-xs">${escapeHtml(sum)}</div>
          </div>
        </div>`);
      });

    // 3. Extract code blocks safely
    processed = processed.replace(/```(?:([a-zA-Z0-9_-]+):([a-zA-Z0-9._-]+)|([a-zA-Z0-9_-]+))\n([\s\S]*?)```/g, (match, l1, f1, l2, code) => {
      codeBlocks.push({ lang: l1 || l2 || "text", file: f1 || "", code });
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 4. Escape remaining raw prose safely
    let safeProse = escapeHtml(processed);

    // 5. Parse Markdown Tables
    safeProse = safeProse.replace(/(?:^\|.+?\|(?:\r?\n|$))+/gm, (match) => {
      const rows = match.trim().split(/\r?\n/);
      if (rows.length < 2) return match;
      let tableHtml = '<div class="overflow-x-auto my-3 shadow-lg rounded-xl border border-white/10"><table class="w-full text-left border-collapse text-xs">';
      rows.forEach((row, i) => {
        if (row.includes('---')) return;
        const cols = row.split('|').filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
        tableHtml += '<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">';
        cols.forEach(col => {
          const tag = i === 0 ? 'th' : 'td';
          const cls = i === 0 ? 'p-2.5 bg-cyan-500/10 text-cyan-300 font-bold tracking-wider uppercase text-[11px]' : 'p-2.5 text-zinc-300';
          tableHtml += `<${tag} class="${cls}">${col.trim()}</${tag}>`;
        });
        tableHtml += '</tr>';
      });
      return tableHtml + '</table></div>';
    });

    // 6. Headers, bold, italics, inline code, blockquotes, line breaks
    safeProse = safeProse
      .replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-cyan-300 mt-4 mb-2 pb-1 border-b border-white/5">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-white mt-5 mb-2 pb-1 border-b border-white/10">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-lg font-extrabold text-white mt-5 mb-2.5">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-zinc-400">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-surface-800 text-pink-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/5">$1</code>')
      .replace(/(?:^&gt;\s*.*(?:\r?\n|$))+/gm, (match) => {
        const inner = match
          .split(/\r?\n/)
          .map(l => l.replace(/^&gt;\s*/, ''))
          .filter(l => l.trim().length > 0)
          .join('<br/>');
        return `<blockquote class="border-l-2 border-cyan-400 pl-3 py-1.5 my-2.5 bg-cyan-500/5 rounded-r-xl text-zinc-300 text-xs italic font-mono leading-relaxed"><i data-lucide="quote" class="w-3 h-3 text-cyan-400 inline mr-1.5"></i>${inner}</blockquote>`;
      })
      .replace(/\n/g, '<br/>');

    // 7. Re-inject Code Blocks with Codex / Antigravity styled text box
    codeBlocks.forEach((item, index) => {
      const lang = escapeHtml(item.file || item.lang || 'code');
      const htmlCard = `
        <div class="code-box-container bg-[#090d16] border border-cyan-500/20 rounded-2xl my-4 overflow-hidden shadow-2xl transition-all duration-200 hover:border-cyan-500/40">
          <div class="px-4 py-2.5 bg-surface-900/90 border-b border-white/10 flex justify-between items-center text-xs font-mono select-none">
            <div class="flex items-center gap-2.5">
              <div class="flex items-center gap-1.5 mr-1">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block shadow-sm"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block shadow-sm"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block shadow-sm"></span>
              </div>
              <span class="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 font-bold text-[11px] border border-cyan-500/30 flex items-center gap-1.5 shadow-sm">
                <i data-lucide="file-code" class="w-3.5 h-3.5"></i> ${lang}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="if(window.switchAiSubTab) window.switchAiSubTab('artifacts');" class="px-2.5 py-1 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white cursor-pointer transition-colors flex items-center gap-1 border border-white/5" title="View in Artifacts IDE">
                <i data-lucide="folder-code" class="w-3 h-3 text-cyan-400"></i> Artifacts
              </button>
              <button onclick="const c=this.closest('.code-box-container').querySelector('code').innerText; navigator.clipboard.writeText(c); const b=this; b.innerHTML='<i data-lucide=\\'check\\' class=\\'w-3 h-3 text-emerald-400\\'></i><span class=\\'text-emerald-400 font-semibold\\'>Copied!</span>'; if(window.lucide) lucide.createIcons(); setTimeout(()=>{ b.innerHTML='<i data-lucide=\\'copy\\' class=\\'w-3 h-3 text-zinc-400\\'></i><span class=\\'text-zinc-300\\'>Copy</span>'; if(window.lucide) lucide.createIcons(); }, 2000);" class="px-2.5 py-1 rounded-lg text-[11px] bg-white/5 hover:bg-cyan-500/20 text-zinc-300 hover:text-cyan-200 cursor-pointer transition-colors flex items-center gap-1 border border-white/5">
                <i data-lucide="copy" class="w-3 h-3 text-zinc-400"></i> Copy
              </button>
            </div>
          </div>
          <pre class="p-4 overflow-x-auto text-[12px] font-mono text-zinc-200 leading-relaxed custom-scrollbar bg-[#060911]"><code>${escapeHtml(item.code)}</code></pre>
        </div>
      `;
      safeProse = safeProse.replace(`__CODE_BLOCK_${index}__`, htmlCard);
    });

    // 8. Re-inject all protected HTML snippets (Thought cards and tool action cards)
    htmlSnippets.forEach((snippet, index) => {
      safeProse = safeProse.replace(`__HTML_SNIPPET_${index}__`, snippet);
    });

    return safeProse;
  }

  function formatUserMessageContent(content) {
    if (!content) return "";
    const escaped = escapeHtml(content);
    return escaped.replace(/(?:^&gt;\s*.*(?:\r?\n|$))+/gm, (match) => {
      const inner = match
        .split(/\r?\n/)
        .map(l => l.replace(/^&gt;\s*/, ''))
        .filter(l => l.trim().length > 0)
        .join('<br/>');
      return `<div class="border-l-2 border-cyan-400/80 pl-2.5 py-1.5 mb-2 bg-white/5 rounded-r-xl text-zinc-300 text-[11px] font-mono leading-relaxed"><i data-lucide="quote" class="w-3 h-3 text-cyan-400 inline mr-1.5"></i>${inner}</div>`;
    }).replace(/\n/g, '<br/>');
  }

  // --- Quoted Message Management (Antigravity-Style) ---
  function quoteChatMessage(index, role, explicitText) {
    let text = explicitText;
    if (!text) {
      const selection = (typeof window.getSelection === 'function') ? window.getSelection().toString().trim() : '';
      if (selection) {
        text = selection;
      } else if (window.aiConversation && window.aiConversation[index]) {
        text = window.aiConversation[index].content;
      }
    }
    if (!text) return;

    window.activeQuotedMessage = {
      index,
      role: role || (window.aiConversation[index] ? window.aiConversation[index].role : 'assistant'),
      text
    };

    const banner = document.getElementById("aiQuoteBanner");
    const roleLabel = document.getElementById("aiQuoteRoleLabel");
    const previewText = document.getElementById("aiQuotePreviewText");
    const textarea = document.getElementById("aiPromptTextarea");

    if (banner && roleLabel && previewText) {
      roleLabel.textContent = (window.activeQuotedMessage.role === 'user' ? 'Replying to you:' : 'Replying to AI-Studio:');
      const cleanSnippet = text
        .replace(/\[TOOL:[^\]]+\][\s\S]*?\[\/TOOL:[^\]]+\]/g, '')
        .replace(/<thought_process>[\s\S]*?<\/thought_process>/g, '')
        .replace(/\[AUTONOMOUS CLOUD TASK COMPLETED OFFLINE\]/g, '')
        .trim();
      previewText.textContent = cleanSnippet.length > 85 ? (cleanSnippet.substring(0, 85) + '...') : cleanSnippet;
      banner.classList.remove("hidden");
      banner.classList.add("flex");
    }

    if (textarea) {
      textarea.focus();
    }
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function clearQuotedMessage() {
    window.activeQuotedMessage = null;
    const banner = document.getElementById("aiQuoteBanner");
    if (banner) {
      banner.classList.add("hidden");
      banner.classList.remove("flex");
    }
  }

  // --- Prompt Edit & Copy Management (ChatGPT / Claude / Gemini Style) ---
  async function copyPromptText(index) {
    const msg = window.aiConversation && window.aiConversation[index];
    if (!msg || !msg.content) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg.content);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      if (window.showToast) window.showToast("Copied", "User prompt copied to clipboard.");
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = msg.content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (window.showToast) window.showToast("Copied", "User prompt copied to clipboard.");
      } catch (err) {}
    }
  }

  async function copyAssistantResponse(index) {
    const msg = window.aiConversation && window.aiConversation[index];
    if (!msg || !msg.content) return;
    const clean = msg.content
      .replace(/<thought_process>[\s\S]*?<\/thought_process>/g, '')
      .replace(/\[AUTONOMOUS CLOUD TASK COMPLETED OFFLINE\]/g, '')
      .trim();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(clean || msg.content);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      if (window.showToast) window.showToast("Copied", "Assistant response copied to clipboard.");
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = clean || msg.content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        if (window.showToast) window.showToast("Copied", "Assistant response copied to clipboard.");
      } catch (err) {}
    }
  }

  function startEditingPrompt(index) {
    window.editingPromptIndex = index;
    renderAiChat();
    setTimeout(() => {
      const el = document.getElementById(`inlineEditPromptTextarea_${index}`);
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 50);
  }

  function cancelEditingPrompt() {
    window.editingPromptIndex = -1;
    renderAiChat();
  }

  function saveAndSubmitEditedPrompt(index) {
    const el = document.getElementById(`inlineEditPromptTextarea_${index}`);
    if (!el) return;
    const newPrompt = el.value.trim();
    if (!newPrompt) return;

    // Truncate conversation from this turn onward (ChatGPT / Claude / Gemini branching behavior)
    window.aiConversation = (window.aiConversation || []).slice(0, index);
    window.editingPromptIndex = -1;
    updateActiveSessionMessages();
    renderAiChat();

    const mainInput = document.getElementById("aiPromptTextarea");
    if (mainInput) {
      mainInput.value = newPrompt;
      autoResizeTextarea(mainInput);
    }
    handleSendAiPrompt();
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
            <h2 class="text-xl font-heading font-extrabold text-white">Antigravity Autonomous Studio</h2>
            <p class="text-xs text-zinc-400 max-w-md mt-1">Multi-Key Auto-Failover, 1,500+ Specialized Personas, Autonomous Web Search, VFS code execution, and persistent conversation history.</p>
          </div>
        </div>
      `;
      if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
      return;
    }

    conversation.forEach((m, index) => {
      const isUser = m.role === "user";
      if (isUser && m.content.startsWith("[SYSTEM AUTO-FEEDBACK]")) return;

      const row = document.createElement("div");
      row.className = `group flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`;

      if (isUser && window.editingPromptIndex === index) {
        // Inline prompt editor
        row.innerHTML = `
          <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-md">
            ME
          </div>
          <div class="max-w-[85%] w-full">
            <div class="p-3.5 rounded-2xl bg-surface-900 border border-cyan-500/50 shadow-2xl space-y-2.5">
              <div class="text-[11px] font-mono text-cyan-300 font-semibold flex items-center justify-between">
                <span class="flex items-center gap-1.5"><i data-lucide="pencil" class="w-3.5 h-3.5"></i> Edit your prompt</span>
                <span class="text-[10px] text-zinc-400 font-normal">Subsequent turns will be regenerated</span>
              </div>
              <textarea id="inlineEditPromptTextarea_${index}" class="w-full bg-surface-950/90 border border-white/10 rounded-xl p-3 text-[13px] text-white outline-none focus:border-cyan-500/60 resize-none custom-scrollbar leading-relaxed" rows="3" onkeydown="if((event.ctrlKey || event.metaKey || (!event.shiftKey && event.key === 'Enter')) && event.key === 'Enter'){ event.preventDefault(); window.saveAndSubmitEditedPrompt(${index}); } else if(event.key === 'Escape'){ window.cancelEditingPrompt(); }">${escapeHtml(m.content)}</textarea>
              <div class="flex items-center justify-end gap-2 pt-1">
                <button type="button" onclick="window.cancelEditingPrompt()" class="px-3 py-1.5 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="button" onclick="window.saveAndSubmitEditedPrompt(${index})" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm">
                  <i data-lucide="check" class="w-3.5 h-3.5"></i> Save &amp; Submit
                </button>
              </div>
            </div>
          </div>
        `;
      } else if (isUser) {
        // User message bubble with actions
        row.innerHTML = `
          <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold bg-surface-850 text-white border border-white/10 shadow-md">
            ME
          </div>
          <div class="max-w-[85%] flex flex-col items-end">
            <div class="p-4 rounded-2xl text-[13px] leading-relaxed bg-surface-850 text-white rounded-tr-sm border border-white/5 shadow-md">
              ${formatUserMessageContent(m.content)}
            </div>
            <div class="flex items-center gap-1.5 mt-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onclick="window.copyPromptText(${index})" class="px-2 py-0.5 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer" title="Copy prompt">
                <i data-lucide="copy" class="w-3 h-3"></i> Copy
              </button>
              <button type="button" onclick="window.startEditingPrompt(${index})" class="px-2 py-0.5 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors flex items-center gap-1 cursor-pointer" title="Edit prompt">
                <i data-lucide="pencil" class="w-3 h-3"></i> Edit
              </button>
              <button type="button" onclick="window.quoteChatMessage(${index}, 'user')" class="px-2 py-0.5 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors flex items-center gap-1 cursor-pointer" title="Quote in message">
                <i data-lucide="quote" class="w-3 h-3"></i> Quote
              </button>
            </div>
          </div>
        `;
      } else {
        // Assistant message bubble with actions
        row.innerHTML = `
          <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-500/10">
            <i data-lucide="bot" class="w-4 h-4"></i>
          </div>
          <div class="max-w-[85%] flex flex-col items-start w-full">
            <div class="p-4 rounded-2xl text-[13px] leading-relaxed bg-surface-900/90 text-zinc-200 rounded-tl-sm border border-cyan-500/10 shadow-md w-full">
              ${parseAiMarkdown(m.content)}
            </div>
            <div class="flex items-center gap-1.5 mt-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
              <button type="button" onclick="window.copyAssistantResponse(${index})" class="px-2 py-0.5 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer" title="Copy response">
                <i data-lucide="copy" class="w-3 h-3"></i> Copy
              </button>
              <button type="button" onclick="window.quoteChatMessage(${index}, 'assistant')" class="px-2 py-0.5 rounded-lg text-[10px] font-mono text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors flex items-center gap-1 cursor-pointer" title="Quote in message">
                <i data-lucide="quote" class="w-3 h-3"></i> Quote
              </button>
            </div>
          </div>
        `;
      }

      box.appendChild(row);
    });

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
    box.scrollTop = box.scrollHeight;
  }

  // --- Real-time Cognitive Thinking Indicator UI ---

  let thinkingTimerInterval = null;
  let thinkingStartTime = 0;
  let thinkingStepInterval = null;

  function showThinkingIndicator(iteration = 1, currentPrompt = '') {
    const chatBox = document.getElementById("aiChatHistory");
    if (!chatBox) return;

    hideThinkingIndicator();
    setThinkingOrbState("solving");

    const jev = window.classifyJevIntentClient 
      ? window.classifyJevIntentClient(currentPrompt, window.vfs) 
      : { route: 'CONVERSATION', latencyMs: 1 };
    const vfsCount = Object.keys(window.vfs || {}).length;

    const indicator = document.createElement("div");
    indicator.id = "activeThinkingIndicator";
    indicator.className = "flex items-start gap-3";
    indicator.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/10 overflow-hidden">
        <canvas id="activeOrbCanvas" width="32" height="32" class="w-full h-full"></canvas>
      </div>
      <div class="max-w-[85%] flex-1">
        <div class="p-4 rounded-2xl rounded-tl-sm border border-cyan-500/30 bg-surface-900/95 text-xs font-mono shadow-2xl space-y-3">
          <div class="flex items-center justify-between pb-2 border-b border-cyan-500/20">
            <div class="flex items-center gap-2.5 text-cyan-300 font-bold tracking-wider uppercase text-[11px]">
              <span class="relative flex h-2.5 w-2.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
              </span>
              <span>Formulating Cognitive Architecture &amp; Verifying MicroVM Playbooks...</span>
              ${iteration > 1 ? `<span class="px-1.5 py-0.5 rounded text-[9px] bg-cyan-500/20 text-cyan-200">Iter ${iteration}</span>` : ''}
            </div>
            <span class="text-[10px] text-cyan-400 font-mono font-bold" id="thinkingTimer">0.0s</span>
          </div>
          <div id="thinkingLogStream" class="space-y-1.5 text-zinc-400 text-[11px] leading-relaxed font-mono">
            <div class="text-indigo-400 flex items-center gap-1.5 font-bold">
              <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              ⚡ [Jev S1 Decision] Intent: ${jev.route} (${jev.latencyMs}ms) • Guardrails: 100% SECURE
            </div>
            <div class="text-cyan-400/90 flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              [Kernel Audit] Auditing VFS workspace tree (${vfsCount} files) and MicroVM bounds...
            </div>
          </div>
        </div>
      </div>
    `;
    chatBox.appendChild(indicator);
    chatBox.scrollTop = chatBox.scrollHeight;

    const inlineCanvas = document.getElementById("activeOrbCanvas");
    if (inlineCanvas) createThinkingOrb(inlineCanvas);

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

    // Timer
    thinkingStartTime = Date.now();
    thinkingTimerInterval = setInterval(() => {
      const el = document.getElementById("thinkingTimer");
      if (el) {
        el.textContent = ((Date.now() - thinkingStartTime) / 1000).toFixed(1) + "s";
      }
    }, 100);

    // Staggered cognitive stream steps
    const simulatedSteps = [
      "[Locale Sync] Synchronizing Indian Standard Time (IST / Asia/Kolkata) & INR baseline...",
      "[Playbook Verification] Checking E2B Firecracker microVM safety constraints...",
      `[Thought Architecture] Evaluating autonomous tool trajectory for route: ${jev.route}...`
    ];
    let stepIdx = 0;
    thinkingStepInterval = setInterval(() => {
      const stream = document.getElementById("thinkingLogStream");
      if (stream && stepIdx < simulatedSteps.length) {
        const line = document.createElement("div");
        line.className = "text-zinc-400 flex items-center gap-1.5 animate-fadeIn";
        line.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-cyan-500/50"></span> ${escapeHtml(simulatedSteps[stepIdx])}`;
        stream.appendChild(line);
        stepIdx++;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }, 800);
  }

  function hideThinkingIndicator() {
    if (thinkingTimerInterval) clearInterval(thinkingTimerInterval);
    if (thinkingStepInterval) clearInterval(thinkingStepInterval);
    const ind = document.getElementById("activeThinkingIndicator");
    if (ind) ind.remove();
    setThinkingOrbState("breathing");
  }

  // =========================================================================

  // Window Exports for UI & Thinking Engine
  window.setThinkingOrbState = setThinkingOrbState;
  window.initThinkingOrb = initThinkingOrb;
  window.createThinkingOrb = createThinkingOrb;
  window.parseAiMarkdown = parseAiMarkdown;
  window.formatUserMessageContent = formatUserMessageContent;
  window.renderAiChat = renderAiChat;
  window.showThinkingIndicator = showThinkingIndicator;
  window.hideThinkingIndicator = hideThinkingIndicator;

  window.quoteChatMessage = quoteChatMessage;
  window.clearQuotedMessage = clearQuotedMessage;
  window.copyPromptText = copyPromptText;
  window.copyAssistantResponse = copyAssistantResponse;
  window.startEditingPrompt = startEditingPrompt;
  window.cancelEditingPrompt = cancelEditingPrompt;
  window.saveAndSubmitEditedPrompt = saveAndSubmitEditedPrompt;

})(typeof window !== 'undefined' ? window : global);
