import { Sandbox } from '@e2b/code-interpreter';
import { getRedisClient } from './_lib/redis.js';
import {
  validateSession,
  checkRateLimit,
  sanitizeError,
  enforcePayloadLimit,
  auditLog
} from './_lib/auth-guard.js';
import { executeWithFailover, getKeyPool, normalizeOllamaEndpoint } from './_lib/key-pool.js';
import {
  jevClassifyIntent,
  buildLuminaSystemPrompt,
  jevGenerateBespokeResponse
} from './_lib/jev-engine.js';

/**
 * Sanitize and format messages for OpenAI / NVIDIA NIM / Ollama specifications:
 * - Only includes role and content properties
 * - Combines multiple system messages into a single system message at index 0
 * - Merges consecutive messages of the same role (prevents NVIDIA HTTP 400 errors)
 * - Ignores empty messages
 */
export function sanitizeProviderMessages(rawMessages, fallbackPrompt = '') {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return fallbackPrompt ? [{ role: 'user', content: String(fallbackPrompt) }] : [];
  }

  const combined = [];
  let systemParts = [];

  for (const m of rawMessages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m.role || 'user').toLowerCase();
    let content = typeof m.content === 'string' ? m.content : (m.content ? JSON.stringify(m.content) : '');
    content = content.trim();
    if (!content) continue;

    if (role === 'system') {
      systemParts.push(content);
    } else {
      const validRole = (role === 'assistant') ? 'assistant' : 'user';
      if (combined.length > 0 && combined[combined.length - 1].role === validRole) {
        combined[combined.length - 1].content += `\n\n${content}`;
      } else {
        combined.push({ role: validRole, content });
      }
    }
  }

  const result = [];
  if (systemParts.length > 0) {
    result.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  for (const msg of combined) {
    result.push(msg);
  }

  if (result.length === 0 && fallbackPrompt) {
    result.push({ role: 'user', content: String(fallbackPrompt) });
  }

  return result;
}

export const maxDuration = 60; // Max execution time for Vercel

async function searchDuckDuckGo(query) {
  const isNews = /\b(news|headlines|today'?s?|updates?|happened|events?)\b/i.test(query);

  // 1. Live Google News RSS Feed for breaking news and headlines
  if (isNews) {
    try {
      const isTopic = query && !/^(today|latest|news|headlines|world|current)/i.test(query.trim());
      const url = isTopic 
        ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
        : "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en";
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      if (res.ok) {
        const xml = await res.text();
        const items = [];
        const regex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<source[^>]*>([\s\S]*?)<\/source>/g;
        let m;
        while ((m = regex.exec(xml)) !== null && items.length < 6) {
          let t = m[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").replace(/ - [^-]+$/, "").trim();
          let s = m[2].trim();
          items.push(`• **${t}** (${s})`);
        }
        if (items.length > 0) {
          return `Top Breaking News & Headlines:\n` + items.join('\n');
        }
      }
    } catch (ignore) {}
  }

  // 2. Wikipedia Search API for knowledge, entities, and technical documentation
  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`);
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      const results = (data.query?.search || []).slice(0, 3).map(s => {
        return `• **${s.title}**: ${s.snippet.replace(/<[^>]+>/g, '').trim()}...`;
      });
      if (results.length > 0) return results.join('\n\n');
    }
  } catch (ignore) {}

  // 3. DuckDuckGo Instant Answer API fallback
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
    if (res.ok) {
      const data = await res.json();
      let snippets = [];
      if (data.AbstractText) snippets.push(data.AbstractText);
      if (Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.slice(0, 4).forEach(t => {
          if (t.Text) snippets.push(t.Text);
        });
      }
      if (snippets.length > 0) return snippets.join('\n\n');
    }
  } catch (ignore) {}

  return "";
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Live telemetry endpoint (GET /api/chat?action=telemetry or POST with action: 'telemetry')
  const isTelemetry = (req.method === 'GET' && (req.query?.action === 'telemetry' || req.url?.includes('action=telemetry'))) ||
                      (req.method === 'POST' && req.body?.action === 'telemetry');
  if (isTelemetry) {
    const oPool = getKeyPool('ollama');
    const nPool = getKeyPool('nvidia');
    const gPool = getKeyPool('groq');
    const mask = (k) => (!k || k.length <= 6) ? '***' : `${k.substring(0, 3)}...${k.substring(k.length - 4)}`;

    return res.status(200).json({
      success: true,
      provider: 'hybrid_pool',
      summary: `Universal Hybrid Pool: ${oPool.length} Ollama key(s), ${nPool.length} NVIDIA/Nemotron key(s) detected.`,
      endpoint: normalizeOllamaEndpoint(process.env.OLLAMA_ENDPOINT || 'https://ollama.com/v1/chat/completions'),
      configuredModel: process.env.OLLAMA_MODEL || 'gpt-oss:20b',
      pools: {
        ollama: oPool.map(k => ({ name: k.name, keyMasked: mask(k.key), provider: 'ollama' })),
        nvidia: nPool.map(k => ({ name: k.name, keyMasked: mask(k.key), provider: 'nvidia' })),
        groq: gPool.map(k => ({ name: k.name, keyMasked: mask(k.key), provider: 'groq' }))
      },
      totalCount: oPool.length + nPool.length + gPool.length
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // 1. Enforce payload size cap (250 KB)
  if (!enforcePayloadLimit(req, 250000)) {
    return res.status(413).json({ error: 'Payload Limit Exceeded (Max 250KB)' });
  }

  const redis = getRedisClient();

  // 2. Zero-Trust Session Verification
  const auth = await validateSession(req, redis);
  if (!auth.valid) {
    auditLog('UNAUTHORIZED_ACCESS_ATTEMPT', req, 'Endpoint: /api/chat');
    return res.status(auth.status).json({ error: auth.error });
  }

  // 3. Sliding IP Rate Limiting (30 requests / 5 minutes)
  const rate = await checkRateLimit(req, redis, 'chat', 30, 300);
  if (!rate.allowed) {
    auditLog('RATE_LIMIT_EXCEEDED', req, 'Endpoint: /api/chat');
    return res.status(rate.status).json({ error: rate.error });
  }

  try {
    let {
      requestedModel,
      messages,
      currentVfs,
      webSearch,
      prompt,
      customApiKey,
      customEndpoint,
      provider = 'hybrid_pool',
      enableInternet = true,
      enableVfs = true,
      enableTerminal = true,
      category = 'General',
      specialist = 'Omni-Disciplinary Executive Assistant',
      personaDirective = ''
    } = req.body || {};

    currentVfs = currentVfs || {};
    messages = messages || [];
    prompt = prompt || (messages.length > 0 ? messages[messages.length - 1].content : '');

    // Jev System-1 Guardrail & Intent Classification (<2ms)
    const jevTelemetry = jevClassifyIntent(prompt, currentVfs);
    if (!jevTelemetry.guardrailPassed) {
      auditLog('SECURITY_GUARDRAIL_TRIGGERED', req, `Blocked malicious payload in prompt: ${(prompt || '').substring(0, 100)}`);
      return res.status(400).json({
        error: 'Security Guardrail Violation: Potentially destructive system command blocked by Jev System-1 safety layer.',
        jevTelemetry
      });
    }

    // Build comprehensive LuminaVista OS system prompt with live VFS snapshot and environment awareness
    const dynamicSystemPrompt = buildLuminaSystemPrompt({
      vfs: currentVfs,
      personaDirective,
      category,
      specialist
    });

    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0].content = dynamicSystemPrompt + (personaDirective ? `\n\n[Persona Directive]:\n${personaDirective}` : '');
    } else {
      messages.unshift({ role: 'system', content: dynamicSystemPrompt });
    }

    let terminalLogs = [];
    let allFailoverLogs = [];
    let lastActiveKeyMeta = null;
    let failoverResult = null;
    let isTaskComplete = false;
    let loopCount = 0;
    const MAX_LOOPS = 2; // Prevents timeout in single serverless execution
    let aiReply = "";

    // Normalize capability permissions
    const allowInternet = enableInternet !== false && webSearch !== false;
    const allowVfs = enableVfs !== false;
    const allowTerminal = enableTerminal !== false;

    // 0. Initial Web Search Context Injection if permitted and requested
    let liveSearchResultsText = '';
    if (allowInternet && prompt && loopCount === 0 && jevTelemetry.route === 'SEARCH_WEB') {
      let q = prompt.replace(/^(can (you|i|we) (please )?(give|tell|show|get|provide|bring) (me|us)|could you (please )?|please (give|tell|show|get|provide)|what (is|are) (the )?latest|search( for)?|look up|find out|what is the latest on|get me|tell me|give me|show me)\s+/gi, '').trim() || prompt;
      if (q.length > 120) q = q.split('\n')[0].substring(0, 120).trim();
      liveSearchResultsText = await searchDuckDuckGo(q);
      if (liveSearchResultsText && liveSearchResultsText.trim().length > 10) {
        messages.push({
          role: "user",
          content: `[LIVE INTERNET DISCOVERY CONTEXT]:\nSearch query: "${q}"\nResults:\n${liveSearchResultsText}\n\nPlease use this live information to answer the user's prompt directly and thoroughly.`
        });
      }
    }

    // Helper to normalize model names for provider endpoints
    function resolveModelForProvider(model, prov) {
      const m = (model || '').trim();
      const lower = m.toLowerCase();

      if (prov === 'nvidia') {
        // Direct NIM catalog endpoints in namespace/model format
        if (m.includes('/') && (m.startsWith('nvidia/') || m.startsWith('meta/'))) {
          if (m === 'nvidia/llama-3.1-nemotron-70b-instruct' ||
              m === 'nvidia/llama-3.1-nemotron-51b-instruct' ||
              m === 'nvidia/nemotron-nano-3-30b-a3b' ||
              m === 'nvidia/nemotron-3-super-120b-a12b' ||
              m === 'nvidia/nemotron-3-ultra-550b-a55b' ||
              m === 'meta/codellama-70b') {
            return m;
          }
        }
        if (lower.includes('nano') || lower.includes('30b') || lower.includes('20b') || lower.includes('fast') || lower.includes('cheap')) {
          return 'nvidia/nemotron-nano-3-30b-a3b';
        }
        if (lower.includes('ultra') || lower.includes('550b') || lower.includes('deepseek') || lower.includes('heavy')) {
          return 'nvidia/nemotron-3-ultra-550b-a55b';
        }
        if (lower.includes('super') || lower.includes('120b') || lower.includes('medium')) {
          return 'nvidia/nemotron-3-super-120b-a12b';
        }
        if (lower.includes('code') || lower.includes('coder') || lower.includes('dev')) {
          return 'meta/codellama-70b';
        }
        return 'nvidia/llama-3.1-nemotron-70b-instruct';
      } else {
        // Ollama Cloud: preserve exact model tags!
        if (m === 'gemma4:31b' ||
            m === 'gpt-oss:120b' ||
            m === 'gpt-oss:20b' ||
            m === 'nemotron-3-nano:30b' ||
            m === 'nemotron-3-super' ||
            m === 'nemotron-3-ultra' ||
            m === 'qwen2.5-coder:32b' ||
            m === 'qwen2.5:72b' ||
            m === 'deepseek-r1') {
          return m;
        }
        if (lower.includes('nemotron-3-nano') || lower.includes('nematron-3-nano') || lower.includes('nano')) return 'nemotron-3-nano:30b';
        if (lower.includes('nemotron-3-ultra') || lower.includes('nematron-3-ultra') || lower.includes('ultra')) return 'nemotron-3-ultra';
        if (lower.includes('nemotron') || lower.includes('nematron')) return 'nemotron-3-super';
        if (lower.includes('gemma4') || lower.includes('gemma-4')) return 'gemma4:31b';
        if (lower.includes('gpt-oss-120b') || lower.includes('120b')) return 'gpt-oss:120b';
        if (lower.includes('gpt-oss') || lower.includes('20b')) return 'gpt-oss:20b';
        if (lower.includes('deepseek-r1') || (lower.includes('deepseek') && lower.includes('r1'))) return 'deepseek-r1';
        if (lower.includes('qwen') && lower.includes('code')) return 'qwen2.5-coder:32b';
        if (lower.includes('qwen')) return 'qwen2.5:72b';
        return m || 'gpt-oss:20b';
      }
    }

    // === AUTONOMOUS AGENT SERVERLESS DISPATCH LOOP ===
    while (!isTaskComplete && loopCount < MAX_LOOPS) {
      loopCount++;

      // Check available pools (with flexible env key discovery)
      const oPool = getKeyPool('ollama');
      const nPool = getKeyPool('nvidia');

      if (loopCount === 1) {
        terminalLogs.push(`[Hybrid Engine]: Discovered ${oPool.length} Ollama key(s) [${oPool.map(k => k.name).join(', ') || 'None'}] and ${nPool.length} NVIDIA/Nemotron key(s) [${nPool.map(k => k.name).join(', ') || 'None'}].`);
      }

      failoverResult = null;
      const isNvidiaExplicit = (provider === 'nvidia_pool' || provider === 'nvidia');
      const isOllamaExplicit = (provider === 'ollama_pool' || provider === 'ollama');
      const isNvidiaModelSelected = requestedModel && (
        requestedModel.startsWith('nvidia/') ||
        requestedModel.startsWith('meta/') ||
        requestedModel.startsWith('google/') ||
        requestedModel.startsWith('mistralai/')
      );

      // Determine preference: if provider is nvidia, or hybrid engine with nvidia model, or no ollama keys configured
      const preferNvidia = isNvidiaExplicit || (!isOllamaExplicit && isNvidiaModelSelected) || (oPool.length === 0 && nPool.length > 0);

      const makeOllamaFetch = async (apiKey) => {
        const ollamaModel = resolveModelForProvider(requestedModel, 'ollama');
        const endpoint = normalizeOllamaEndpoint(customEndpoint || process.env.OLLAMA_ENDPOINT || 'https://ollama.com/v1/chat/completions');
        const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
        const payloadMessages = sanitizeProviderMessages(messages, prompt);
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(cleanKey ? { 'Authorization': `Bearer ${cleanKey}` } : {})
          },
          body: JSON.stringify({
            model: ollamaModel,
            messages: payloadMessages,
            stream: false
          })
        });
      };

      const makeNvidiaFetch = async (apiKey) => {
        const nvidiaModel = resolveModelForProvider(requestedModel, 'nvidia');
        const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
        const payloadMessages = sanitizeProviderMessages(messages, prompt);
        return fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanKey}`
          },
          body: JSON.stringify({
            model: nvidiaModel,
            messages: payloadMessages,
            temperature: 0.6,
            top_p: 0.95,
            max_tokens: 4096,
            stream: false
          })
        });
      };

      if (provider === 'custom') {
        failoverResult = await executeWithFailover({
          provider: 'custom',
          customApiKey,
          makeRequest: async (apiKey) => {
            const endpoint = normalizeOllamaEndpoint(customEndpoint);
            const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
            const headers = { 'Content-Type': 'application/json' };
            if (cleanKey) headers['Authorization'] = `Bearer ${cleanKey}`;
            const payloadMessages = sanitizeProviderMessages(messages, prompt);
            return fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: requestedModel || 'gpt-oss:20b',
                messages: payloadMessages,
                stream: false
              })
            });
          }
        });
      } else if (preferNvidia) {
        // Primary: NVIDIA NIM Cloud Pool
        failoverResult = await executeWithFailover({
          provider: 'nvidia',
          customApiKey,
          makeRequest: async (apiKey) => makeNvidiaFetch(apiKey)
        });

        // Cross-pool cascade to Ollama if NVIDIA exhausted/rate-limited
        if (!failoverResult.success && oPool.length > 0) {
          allFailoverLogs.push('[Cross-Pool Auto-Failover]: Cascading from NVIDIA NIM to Ollama Cloud pool...');
          terminalLogs.push('[Cross-Pool Auto-Failover]: Cascading to Ollama Cloud pool...');
          failoverResult = await executeWithFailover({
            provider: 'ollama',
            customApiKey,
            makeRequest: async (apiKey) => makeOllamaFetch(apiKey)
          });
        }
      } else {
        // Primary: Ollama Cloud Pool (including all discovered ollamaapi keys)
        failoverResult = await executeWithFailover({
          provider: 'ollama',
          customApiKey,
          makeRequest: async (apiKey) => makeOllamaFetch(apiKey)
        });

        // Cross-pool cascade to NVIDIA NIM if Ollama pool exhausted/rate-limited
        if (!failoverResult.success && nPool.length > 0) {
          allFailoverLogs.push('[Universal Hybrid Failover]: Ollama Cloud keys reached quota/rate-limit. Cascading to NVIDIA NIM pool...');
          terminalLogs.push('[Universal Hybrid Failover]: Cascading to NVIDIA NIM pool...');
          failoverResult = await executeWithFailover({
            provider: 'nvidia',
            customApiKey,
            makeRequest: async (apiKey) => makeNvidiaFetch(apiKey)
          });
        }
      }

      // Final cross-pool cascade to Groq if configured and previous pools were exhausted
      const gPool = getKeyPool('groq');
      if (!failoverResult.success && gPool.length > 0) {
        allFailoverLogs.push('[Cross-Pool Auto-Failover]: Cascading to Groq Cloud pool (Llama 3.3 70B)...');
        terminalLogs.push('[Cross-Pool Auto-Failover]: Cascading to Groq Cloud pool...');
        failoverResult = await executeWithFailover({
          provider: 'groq',
          customApiKey,
          makeRequest: async (apiKey) => {
            const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '').trim();
            const payloadMessages = sanitizeProviderMessages(messages, prompt);
            return fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cleanKey}`
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: payloadMessages,
                temperature: 0.6,
                max_tokens: 4096,
                stream: false
              })
            });
          }
        });
      }

      if (failoverResult.failoverLogs) {
        allFailoverLogs.push(...failoverResult.failoverLogs);
        terminalLogs.push(...failoverResult.failoverLogs);
      }
      if (failoverResult.keyMeta) {
        lastActiveKeyMeta = failoverResult.keyMeta;
      }

      if (!failoverResult.success) {
        // Graceful failover to dynamic Jev bespoke autonomous response if external cloud is completely exhausted
        terminalLogs.push(`[Failover Engine]: ${failoverResult.reason}. Activating Jev Sovereign Autonomous Sandbox.`);
        aiReply = jevGenerateBespokeResponse(prompt, loopCount, currentVfs, liveSearchResultsText);
      } else {
        const aiData = failoverResult.data;
        aiReply = aiData?.choices?.[0]?.message?.content || aiData?.message?.content || "";
        if (!aiReply || aiReply.trim() === '' || aiReply.trim() === 'Task processed.') {
          terminalLogs.push('[Response Guard]: Model returned empty or placeholder completion. Falling back to sovereign generator.');
          aiReply = jevGenerateBespokeResponse(prompt, loopCount, currentVfs, liveSearchResultsText);
        }
      }

      messages.push({ role: "assistant", content: aiReply });

      // 3. Parse and Execute Tools from Model Output
      let toolFeedback = [];

      // A. Web Search Tool (Gated by allowInternet)
      const searchRegex = /\[TOOL:SEARCH_WEB query="([^"]+)"\]\[\/TOOL:SEARCH_WEB\]/g;
      let sMatch;
      while ((sMatch = searchRegex.exec(aiReply)) !== null) {
        const query = sMatch[1];
        if (!allowInternet) {
          toolFeedback.push(`[TOOL_RESULT:SEARCH_WEB query="${query}"] Permission Denied: Live Internet access is disabled in Studio Settings. [/TOOL_RESULT:SEARCH_WEB]`);
          terminalLogs.push(`[Security Gate]: Blocked web search for "${query}" (Internet disabled)`);
        } else {
          const searchResults = await searchDuckDuckGo(query);
          toolFeedback.push(`[TOOL_RESULT:SEARCH_WEB query="${query}"]\n${searchResults}\n[/TOOL_RESULT:SEARCH_WEB]`);
          terminalLogs.push(`[Agent Action]: Queried web for "${query}"`);
        }
      }

      // B. View File Tool (Gated by allowVfs)
      const viewRegex = /\[TOOL:VIEW_FILE filename="([^"]+)"\]\[\/TOOL:VIEW_FILE\]/g;
      let vMatch;
      while ((vMatch = viewRegex.exec(aiReply)) !== null) {
        const fn = vMatch[1];
        if (!allowVfs) {
          toolFeedback.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"] Permission Denied: VFS File System access is disabled in Studio Settings. [/TOOL_RESULT:VIEW_FILE]`);
        } else if (currentVfs[fn] !== undefined) {
          const lines = currentVfs[fn].split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
          toolFeedback.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"]\n${lines}\n[/TOOL_RESULT:VIEW_FILE]`);
          terminalLogs.push(`[Agent Action]: Inspected file ${fn}`);
        } else {
          toolFeedback.push(`[TOOL_RESULT:VIEW_FILE filename="${fn}"] Error: File not found in workspace [/TOOL_RESULT:VIEW_FILE]`);
        }
      }

      // C. List Directory Tool
      if (aiReply.includes("[TOOL:LIST_DIR]")) {
        if (!allowVfs) {
          toolFeedback.push(`[TOOL_RESULT:LIST_DIR] Permission Denied: VFS File System access is disabled. [/TOOL_RESULT:LIST_DIR]`);
        } else {
          const keys = Object.keys(currentVfs);
          const listStr = keys.map(k => ` - ${k} (${currentVfs[k].length} bytes)`).join('\n');
          toolFeedback.push(`[TOOL_RESULT:LIST_DIR]\n${listStr || "No files in VFS."}\n[/TOOL_RESULT:LIST_DIR]`);
          terminalLogs.push(`[Agent Action]: Listed VFS directory`);
        }
      }

      // D. Write File Tool (Gated by allowVfs)
      const writeRegex = /\[TOOL:WRITE_FILE filename="([^"]+)"\]([\s\S]*?)\[\/TOOL:WRITE_FILE\]/g;
      let wMatch;
      while ((wMatch = writeRegex.exec(aiReply)) !== null) {
        const fn = wMatch[1];
        const content = wMatch[2].trim();
        if (!allowVfs) {
          toolFeedback.push(`[TOOL_RESULT:WRITE_FILE filename="${fn}"] Permission Denied: VFS File System access is disabled. [/TOOL_RESULT:WRITE_FILE]`);
        } else {
          currentVfs[fn] = content;
          toolFeedback.push(`[TOOL_RESULT:WRITE_FILE filename="${fn}"] Wrote ${content.length} bytes to ${fn} [/TOOL_RESULT:WRITE_FILE]`);
          terminalLogs.push(`[Agent Action]: Wrote artifact ${fn}`);
        }
      }

      // E. Edit File Tool (Gated by allowVfs)
      const editRegex = /\[TOOL:EDIT_FILE filename="([^"]+)"\]\s*<target>([\s\S]*?)<\/target>\s*<replacement>([\s\S]*?)<\/replacement>\s*\[\/TOOL:EDIT_FILE\]/g;
      let eMatch;
      while ((eMatch = editRegex.exec(aiReply)) !== null) {
        const fn = eMatch[1];
        const target = eMatch[2];
        const replacement = eMatch[3];
        if (!allowVfs) {
          toolFeedback.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"] Permission Denied: VFS File System access is disabled. [/TOOL_RESULT:EDIT_FILE]`);
        } else if (currentVfs[fn] && currentVfs[fn].includes(target)) {
          currentVfs[fn] = currentVfs[fn].replace(target, replacement);
          toolFeedback.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"] Applied targeted edit to ${fn} [/TOOL_RESULT:EDIT_FILE]`);
          terminalLogs.push(`[Agent Action]: Edited artifact ${fn}`);
        } else {
          toolFeedback.push(`[TOOL_RESULT:EDIT_FILE filename="${fn}"] Error: Target block not found in ${fn} [/TOOL_RESULT:EDIT_FILE]`);
        }
      }

      // F. Delete File Tool (Gated by allowVfs)
      const delRegex = /\[TOOL:DELETE_FILE filename="([^"]+)"\]\[\/TOOL:DELETE_FILE\]/g;
      let dMatch;
      while ((dMatch = delRegex.exec(aiReply)) !== null) {
        const fn = dMatch[1];
        if (!allowVfs) {
          toolFeedback.push(`[TOOL_RESULT:DELETE_FILE filename="${fn}"] Permission Denied: VFS File System access is disabled. [/TOOL_RESULT:DELETE_FILE]`);
        } else if (currentVfs[fn] !== undefined) {
          delete currentVfs[fn];
          toolFeedback.push(`[TOOL_RESULT:DELETE_FILE filename="${fn}"] Deleted ${fn} [/TOOL_RESULT:DELETE_FILE]`);
          terminalLogs.push(`[Agent Action]: Deleted artifact ${fn}`);
        }
      }

      // G. Execute Shell Commands in E2B MicroVM (Gated by allowTerminal)
      const execRegex = /\[TOOL:EXEC\]([\s\S]*?)\[\/TOOL:EXEC\]/g;
      let xMatch;
      let cmdsToRun = [];
      while ((xMatch = execRegex.exec(aiReply)) !== null) {
        cmdsToRun.push(xMatch[1].trim());
      }

      if (cmdsToRun.length > 0) {
        if (!allowTerminal) {
          toolFeedback.push(`[TOOL_RESULT:EXEC] Permission Denied: Terminal & MicroVM execution is disabled in Studio Settings. [/TOOL_RESULT:EXEC]`);
          terminalLogs.push(`[Security Gate]: Blocked MicroVM execution (Terminal disabled)`);
        } else if (process.env.E2B_API_KEY) {
          let sbx = null;
          try {
            terminalLogs.push(`[System]: Booting isolated E2B microVM for execution...`);
            sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });

            for (const [name, content] of Object.entries(currentVfs)) {
              await sbx.files.write(name, content);
            }

            let loopFailed = false;
            let commandOutputCombined = "";

            for (const cmd of cmdsToRun) {
              terminalLogs.push(`➜ ${cmd}`);
              const execution = await sbx.commands.run(cmd, { timeoutMs: 15000 });

              if (execution.stdout) {
                terminalLogs.push(execution.stdout);
                commandOutputCombined += `[STDOUT]:\n${execution.stdout}\n`;
              }

              if (execution.stderr || execution.error) {
                const errStr = execution.stderr || execution.error.message;
                terminalLogs.push(`[Crash Detected]: ${sanitizeError(errStr)}`);
                commandOutputCombined += `[STDERR / CRASH]:\n${sanitizeError(errStr)}\n`;
                loopFailed = true;
                break;
              }
            }

            try {
              const list = await sbx.files.list('.');
              for (const item of list) {
                if (item.type === 'file') currentVfs[item.name] = await sbx.files.read(item.name);
              }
            } catch (ignore) {}

            toolFeedback.push(`[TOOL_RESULT:EXEC]\n${commandOutputCombined || "Command exited with code 0."}\n[/TOOL_RESULT:EXEC]`);

            if (loopFailed) {
              messages.push({
                role: "user",
                content: `[SYSTEM AUTO-FEEDBACK]:\n${toolFeedback.join('\n\n')}\nCommand crashed. Please diagnose the error, modify the files using [TOOL:WRITE_FILE] or [TOOL:EDIT_FILE], and re-test.`
              });
              continue;
            }
          } catch (sbxErr) {
            terminalLogs.push(`[MicroVM Fault]: ${sanitizeError(sbxErr, 'MicroVM execution error')}`);
            toolFeedback.push(`[TOOL_RESULT:EXEC] MicroVM Fault: ${sanitizeError(sbxErr.message)} [/TOOL_RESULT:EXEC]`);
          } finally {
            if (sbx) await sbx.kill().catch(() => {});
          }
        } else {
          // Local fallback simulation
          cmdsToRun.forEach(cmd => {
            terminalLogs.push(`[Local Sandbox]: Simulated execution of: ${cmd}`);
            toolFeedback.push(`[TOOL_RESULT:EXEC command="${cmd}"] Process completed with code 0 (Sandbox). [/TOOL_RESULT:EXEC]`);
          });
        }
      }

      // Check if Task Complete
      if (aiReply.includes("[TOOL:TASK_COMPLETE]") || toolFeedback.length === 0) {
        isTaskComplete = true;
      } else if (loopCount < MAX_LOOPS) {
        // Feed tool results back into context
        messages.push({
          role: "user",
          content: `[SYSTEM AUTO-FEEDBACK]:\n${toolFeedback.join('\n\n')}\nContinue autonomous execution.`
        });
      } else {
        isTaskComplete = true;
      }
    }

    return res.status(200).json({
      reply: aiReply,
      vfs: currentVfs,
      logs: terminalLogs,
      messages,
      failoverLogs: allFailoverLogs,
      activeKeyMeta: lastActiveKeyMeta,
      rateLimited: !failoverResult?.success && !!(failoverResult?.reason?.includes('ALL_KEYS_EXHAUSTED')),
      jevTelemetry
    });

  } catch (error) {
    auditLog('CHAT_ERROR', req, error.message);
    return res.status(500).json({ error: sanitizeError(error, 'Autonomous agent processing failure.') });
  }
}