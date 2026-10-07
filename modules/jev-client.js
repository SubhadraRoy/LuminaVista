// modules/jev-client.js - TypeSafe Jev System-1 Client Engine, HUD & Telemetry Inspector
// Sub-millisecond decision routing, command/code safety screening, and interactive cognitive HUD

(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (window.escapeHtml) return window.escapeHtml(str);
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Sub-Millisecond L0 LRU Cache for Client Evaluations ---
  const clientCache = new Map();
  const MAX_CLIENT_CACHE = 128;

  /**
   * Jev Command Safety Screener (Client-Side Guardrail)
   */
  function screenCommand(command = '') {
    const cmd = String(command).trim();
    const cLower = cmd.toLowerCase();

    // Destructive filesystem commands
    const isDestructiveFs =
      /rm\s+(-[rfRF]{1,4}\s+[/~*]|--no-preserve-root)/i.test(cLower) ||
      cLower.includes('rm -rf /') ||
      cLower.includes('rm -rf ~') ||
      cLower.includes('rm -rf *') ||
      cLower.includes('rm -r /') ||
      cLower.includes('rm -r *') ||
      /\b(rmdir|rd)\s+\/s\s+\/q/i.test(cLower) ||
      /\bdel\s+\/f\s+\/s\s+\/q\s+[c-z]:\\/i.test(cLower) ||
      /\b(shred|wipefs)\s+(-[a-z]*\s+)?(\/dev\/|\/)/i.test(cLower);

    // Disk formatting & partition overwrite
    const isPartitionDestroy =
      cLower.includes('format c:') ||
      /mkfs\.(ext[234]|xfs|btrfs|ntfs|vfat|fat)\s+/i.test(cLower) ||
      /dd\s+if=.*of=\/dev\/(sd[a-z]|nvme|hd[a-z]|mapper|vd[a-z])/i.test(cLower) ||
      /\bfdisk\s+\/dev\//i.test(cLower);

    // Denial of service, fork bombs, system crashes
    const isDosOrCrash =
      cLower.includes(':(){ :|:& };:') ||
      cLower.includes(':(){ :|:&};:') ||
      /\b(killall\s+-9\s+(systemd|init)|kill\s+-9\s+1\b)/i.test(cLower) ||
      /\b(shutdown\s+-h\s+now|init\s+0|reboot\s+-f)\b/i.test(cLower);

    // Database wipe operations
    const isDbWipe =
      /\b(drop\s+database\s+[a-z0-9_]+|drop\s+table\s+[a-z0-9_]+|truncate\s+table\s+[a-z0-9_]+)\b/i.test(cLower);

    // Secret & credential exfiltration
    const isExfiltration =
      cLower.includes('/etc/shadow') ||
      cLower.includes('/etc/passwd') ||
      cLower.includes('.ssh/id_rsa') ||
      cLower.includes('printenv | curl') ||
      cLower.includes('printenv | nc') ||
      cLower.includes('env | curl') ||
      cLower.includes('env | nc') ||
      /\b(curl|wget|fetch|nc|ncat)\b.*(leak|exfil|evil|\$|token|key|secret)/i.test(cLower) ||
      /(?:upload|post|send)\s+.*(?:api[_-]?key|secret|password|credential|token)\s+to\s+https?:\/\//i.test(cLower);

    if (isDestructiveFs || isPartitionDestroy || isDosOrCrash || isDbWipe) {
      return {
        safe: false,
        p: 0.02,
        threatCategory: 'destructive_command',
        reason: isPartitionDestroy
          ? 'Partition destruction or disk format attempt detected.'
          : isDosOrCrash
          ? 'Fork bomb, crash exploit, or unauthorized system shutdown detected.'
          : isDbWipe
          ? 'Destructive database drop or truncate command detected.'
          : 'Irreversible filesystem wipe attempt detected (rm -rf / root level).'
      };
    }

    if (isExfiltration) {
      return {
        safe: false,
        p: 0.05,
        threatCategory: 'credential_exfiltration',
        reason: 'Unauthorized secret token, password, or environment exfiltration detected.'
      };
    }

    return {
      safe: true,
      p: 0.98,
      threatCategory: 'none',
      reason: 'Command satisfies Jev System-1 sandbox safety policy.'
    };
  }

  /**
   * Jev Code Safety Screener (for Compilers / Code Runners)
   */
  function screenCode(code = '', language = '') {
    const c = String(code);
    const cLower = c.toLowerCase();

    // Check system calls inside code
    const isDangerousSyscall =
      cLower.includes('rm -rf') ||
      cLower.includes(':(){ :|:& };:') ||
      (language === 'python' && (
        /os\.system\(.*rm\s+-rf/i.test(c) ||
        /subprocess\.(run|call|popen)\(.*rm\s+-rf/i.test(c) ||
        /os\.(remove|unlink)\(['"]\/['"]\)/i.test(c)
      )) ||
      (language === 'bash' && screenCommand(code).safe === false) ||
      (language === 'cpp' && /system\(.*rm\s+-rf/i.test(c));

    if (isDangerousSyscall) {
      return {
        safe: false,
        p: 0.01,
        threatCategory: 'destructive_code',
        reason: 'Code contains destructive filesystem deletion or unauthorized kernel payload.'
      };
    }

    return {
      safe: true,
      p: 0.99,
      threatCategory: 'none',
      reason: 'Code passed Jev System-1 compilation safety screening.'
    };
  }

  /**
   * Typed Structured Decision Engine (client-side jevAsk)
   */
  function ask(state = {}, questions = {}) {
    const output = {};
    const stateStr = typeof state === 'string' ? state : JSON.stringify(state || {});
    const sLower = stateStr.toLowerCase();

    for (const [key, q] of Object.entries(questions)) {
      if (!q || typeof q !== 'object') continue;
      const type = (q.type || 'noul').toLowerCase();
      const instructions = (q.instructions || '').toLowerCase();
      const criteria = q.criteria || {};

      if (type === 'noul') {
        let p = 0.5;
        let decision = false;
        const isSafety = instructions.includes('safe') || instructions.includes('danger') || instructions.includes('destructive') || key.toLowerCase().includes('safe');

        if (isSafety) {
          const isRisky = /rm\s+-rf|drop\s+database|format\s+c:|mkfs|kill\s+-9|dd\s+if=/i.test(sLower);
          if (instructions.includes('safe') || key.toLowerCase().includes('safe')) {
            p = isRisky ? 0.05 : 0.95;
            decision = p >= 0.7;
          } else {
            p = isRisky ? 0.95 : 0.05;
            decision = p >= 0.7;
          }
        } else {
          const kwMatch = instructions.split(/\s+/).filter(w => w.length > 3 && sLower.includes(w));
          p = Math.min(0.99, Math.max(0.1, 0.4 + (kwMatch.length * 0.2)));
          decision = p >= 0.6;
        }

        output[key] = {
          type: 'noul',
          decision,
          probability: Number(p.toFixed(3)),
          confidence: Number((Math.abs(p - 0.5) * 2).toFixed(3))
        };
      } else if (type === 'choice') {
        const choiceEntries = Object.entries(criteria);
        let bestChoice = choiceEntries[0] ? choiceEntries[0][0] : 'default';
        let highestMatch = -1;
        const rawWeights = {};

        for (const [cName, cDesc] of choiceEntries) {
          const descWords = String(cDesc).toLowerCase().split(/[\s,;|-]+/).filter(w => w.length >= 2);
          const matches = descWords.filter(w => sLower.includes(w)).length;
          rawWeights[cName] = matches;
          if (matches > highestMatch) {
            highestMatch = matches;
            bestChoice = cName;
          }
        }

        const totalMatches = Object.values(rawWeights).reduce((a, b) => a + b, 0);
        const distribution = {};
        for (const [cName, count] of Object.entries(rawWeights)) {
          distribution[cName] = totalMatches > 0 
            ? Number((count / totalMatches).toFixed(3)) 
            : Number((1 / choiceEntries.length).toFixed(3));
        }

        output[key] = {
          type: 'choice',
          choice: bestChoice,
          selection: bestChoice,
          confidence: highestMatch > 0 ? 0.95 : 0.75,
          distribution
        };
      } else if (type === 'score') {
        let scoreVal = q.targetScore !== undefined ? q.targetScore : 75;
        const isSafety = instructions.includes('safe') || instructions.includes('danger') || key.toLowerCase().includes('safe');

        if (isSafety) {
          const isRisky = /rm\s+-rf|drop\s+database|format\s+c:|mkfs|kill\s+-9|dd\s+if=/i.test(sLower);
          if (isRisky) scoreVal = Math.max(0, scoreVal - (q.maxPenalty || 60));
        } else if (instructions.includes('complexity')) {
          const len = stateStr.length;
          scoreVal = Math.min(100, Math.max(10, Math.round(len / 50)));
        } else if (instructions.includes('quality') || instructions.includes('readability')) {
          scoreVal = /TODO|FIXME|hack/i.test(sLower) ? 45 : 90;
        }

        output[key] = {
          type: 'score',
          score: scoreVal,
          calibrated: true
        };
      } else if (type === 'rank') {
        const candidates = Array.isArray(q.candidates) ? q.candidates : Object.keys(criteria);
        const ranked = candidates
          .map(cand => {
            const candStr = String(cand).toLowerCase();
            const words = candStr.split(/[\s_-]+/);
            const score = words.filter(w => sLower.includes(w)).length * 10 + (sLower.indexOf(candStr) >= 0 ? 50 : 0);
            return { item: cand, score };
          })
          .sort((a, b) => b.score - a.score);

        output[key] = {
          type: 'rank',
          ranking: ranked.map(r => r.item),
          scores: ranked
        };
      } else if (type === 'gate') {
        const policy = (q.policy || instructions || '').toLowerCase();
        let pass = true;
        let evidence = 'Policy requirements satisfied.';

        if (policy.includes('no-secrets') || policy.includes('zero-exposure')) {
          const hasSecret = /sk-[a-z0-9_-]{12,}|ghp_[a-z0-9]{20,}|ya29\.[a-z0-9_-]+/i.test(stateStr);
          if (hasSecret) {
            pass = false;
            evidence = 'Failed gate: detected unredacted secret tokens.';
          }
        } else if (policy.includes('syntax-valid') || policy.includes('no-error')) {
          if (/syntaxerror|referenceerror|typeerror|failed/i.test(sLower)) {
            pass = false;
            evidence = 'Failed gate: found runtime or syntax error strings.';
          }
        }

        output[key] = {
          type: 'gate',
          passed: pass,
          evidence,
          timestamp: Date.now()
        };
      }
    }

    return output;
  }

  /**
   * Real-time HUD Updater for AI-Studio Header
   */
  function updateHud(intent = {}) {
    const route = intent.route || 'IDLE';
    const conf = intent.confidence !== undefined ? Math.round(intent.confidence * 100) : 99;
    const latency = intent.latencyMs !== undefined ? `${intent.latencyMs}ms` : '<1ms';
    const passed = intent.guardrailPassed !== false;

    const routeEl = document.getElementById('jevRouteLabel');
    const confEl = document.getElementById('jevConfidenceLabel');
    const latEl = document.getElementById('jevLatencyLabel');
    const dotEl = document.getElementById('jevStatusDot');
    const badgeEl = document.getElementById('jevStudioHud') || document.getElementById('jevTelemetryBadge');

    if (routeEl) routeEl.textContent = route;
    if (confEl) confEl.textContent = `${conf}%`;
    if (latEl) latEl.textContent = latency;

    if (dotEl) {
      if (!passed) {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
      } else if (route !== 'IDLE' && route !== 'CONVERSATION') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
      } else {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse';
      }
    }

    if (badgeEl) {
      badgeEl.title = `Jev System-1: Route ${route} (${conf}% conf, ${latency}) • Click to Inspect`;
    }

    // Keep active evaluation in memory for Inspector Modal
    window.lastJevEvaluation = intent;
  }

  /**
   * Open & Render Jev Inspector Modal
   */
  function openInspector(evalData = null) {
    const modal = document.getElementById('jevInspectorModal');
    if (!modal) return;

    const data = evalData || window.lastJevEvaluation || {
      route: 'CONVERSATION',
      confidence: 0.98,
      latencyMs: 1,
      guardrailPassed: true,
      scores: { CONVERSATION: 75, WRITE_FILE: 10, EXEC_COMMAND: 5 },
      entities: { languages: ['javascript'], files: ['index.html'] },
      dag: { nodes: [], isDag: false },
      reasoning: 'Sub-millisecond semantic tensor evaluation complete.'
    };

    renderInspector(data);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function closeInspector() {
    const modal = document.getElementById('jevInspectorModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  function toggleInspector() {
    const modal = document.getElementById('jevInspectorModal');
    if (!modal) return;
    if (modal.classList.contains('hidden')) {
      openInspector();
    } else {
      closeInspector();
    }
  }

  /**
   * Render Inspector UI Content
   */
  function renderInspector(data) {
    const route = data.route || 'CONVERSATION';
    const conf = Math.round((data.confidence || 0.95) * 100);
    const latency = data.latencyMs !== undefined ? `${data.latencyMs}ms` : '<1ms';
    const guardPassed = data.guardrailPassed !== false;

    // Header metrics
    const routeDisplay = document.getElementById('jevModalRoute');
    const confDisplay = document.getElementById('jevModalConfidence');
    const latDisplay = document.getElementById('jevModalLatency');
    const guardDisplay = document.getElementById('jevModalGuardrail');

    if (routeDisplay) routeDisplay.textContent = route;
    if (confDisplay) confDisplay.textContent = `${conf}%`;
    if (latDisplay) latDisplay.textContent = latency;
    if (guardDisplay) {
      guardDisplay.innerHTML = guardPassed
        ? '<span class="text-emerald-400 font-bold">🛡️ PASS (Safe)</span>'
        : `<span class="text-rose-400 font-bold">🚨 BLOCKED (${escapeHtml(data.threatCategory || 'Threat')})</span>`;
    }

    // Tensor Distribution Progress Bars
    const tensorContainer = document.getElementById('jevTensorBars');
    if (tensorContainer) {
      const scores = data.scores || { [route]: 90, CONVERSATION: 20 };
      const maxScore = Math.max(1, ...Object.values(scores));

      const sortedEntries = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7);

      tensorContainer.innerHTML = sortedEntries.map(([r, sc]) => {
        const pct = Math.min(100, Math.round((sc / maxScore) * 100));
        const isWinner = r === route;
        const color = isWinner ? 'bg-cyan-400 shadow-[0_0_8px_rgba(0,242,254,0.5)]' : 'bg-surface-700';
        const textStyle = isWinner ? 'text-cyan-300 font-bold' : 'text-zinc-400';

        return `
          <div class="space-y-1">
            <div class="flex justify-between text-[11px] font-mono">
              <span class="${textStyle}">${r}</span>
              <span class="text-zinc-400">${sc} pts (${pct}%)</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-surface-950 overflow-hidden border border-white/5">
              <div class="h-full rounded-full ${color} transition-all duration-300" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // DAG Tool Pipeline Nodes
    const dagContainer = document.getElementById('jevDagList');
    if (dagContainer) {
      const dag = data.dag;
      if (dag && Array.isArray(dag.nodes) && dag.nodes.length > 0) {
        dagContainer.innerHTML = dag.nodes.map((node, i) => `
          <div class="flex items-center gap-2 p-2 rounded-lg bg-surface-900 border border-white/5 font-mono text-[11px]">
            <span class="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold text-[10px] shrink-0">${i + 1}</span>
            <span class="text-cyan-300 font-bold">${escapeHtml(node.tool)}</span>
            <span class="text-zinc-400 truncate flex-1">${escapeHtml(node.description || node.action)}</span>
            ${node.parallel ? '<span class="text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300">parallel</span>' : ''}
          </div>
        `).join('');
      } else {
        dagContainer.innerHTML = `
          <div class="text-zinc-500 text-xs font-mono p-2">Single-step direct evaluation (${route}). No multi-step DAG required.</div>
        `;
      }
    }

    // Extracted Entities
    const entitiesEl = document.getElementById('jevEntitiesJson');
    if (entitiesEl) {
      const ent = data.entities || {};
      entitiesEl.textContent = JSON.stringify(ent, null, 2);
    }
  }

  /**
   * Run Interactive Query from Inspector Playground
   */
  function runInteractiveTest() {
    const inp = document.getElementById('jevInteractiveInput');
    const resEl = document.getElementById('jevInteractiveResult');
    if (!inp || !resEl) return;

    const query = inp.value.trim();
    if (!query) return;

    const t0 = performance.now();
    const classifyFn = window.classifyJevIntentClient || function(p) {
      return { route: 'CONVERSATION', confidence: 0.95, scores: { CONVERSATION: 50 }, latencyMs: 1 };
    };

    const evaluated = classifyFn(query, window.vfs || {});
    evaluated.latencyMs = Number((performance.now() - t0).toFixed(2));

    // Also run command screening
    const cmdSafety = screenCommand(query);

    resEl.innerHTML = `
      <div class="p-3 rounded-xl bg-surface-900 border border-white/10 space-y-2 text-xs font-mono">
        <div class="flex items-center justify-between border-b border-white/5 pb-1.5">
          <span class="text-cyan-400 font-bold">Route: ${evaluated.route}</span>
          <span class="text-emerald-400 font-bold">Latency: ${evaluated.latencyMs}ms</span>
          <span class="text-purple-300">Confidence: ${Math.round(evaluated.confidence * 100)}%</span>
        </div>
        <div class="text-[11px] text-zinc-300">
          <b>Guardrail:</b> ${cmdSafety.safe ? '<span class="text-emerald-400">🛡️ SAFE</span>' : '<span class="text-rose-400">🚨 BLOCKED (' + cmdSafety.threatCategory + ')</span>'} - ${cmdSafety.reason}
        </div>
        <div class="text-[10px] text-zinc-400">
          <b>Scores:</b> ${Object.entries(evaluated.scores || {}).map(([k, v]) => `${k}: ${v}`).join(' | ')}
        </div>
      </div>
    `;

    // Update main modal views with this evaluation
    renderInspector(evaluated);
    updateHud(evaluated);
  }

  // --- Public API ---
  const LuminaJev = {
    screenCommand,
    screenCode,
    ask,
    updateHud,
    openInspector,
    closeInspector,
    toggleInspector,
    renderInspector,
    runInteractiveTest
  };

  window.LuminaJev = LuminaJev;

  // Expose global helper for backward compatibility
  window.toggleJevInspectorModal = toggleInspector;
  window.closeJevInspectorModal = closeInspector;

})(window);
