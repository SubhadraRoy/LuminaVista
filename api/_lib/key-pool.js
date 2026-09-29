// api/_lib/key-pool.js - Multi-Key Auto-Failover & Rotation Engine
// Handles Multi-Key pools across Ollama Cloud, NVIDIA NIM, Groq, OpenRouter & Gemini
// with intelligent rate-limit detection, response validation, and continuous rotation.

const keyCooldowns = new Map();

/**
 * Extract available API keys for a provider from environment variables
 * @param {string} provider - 'ollama' | 'nvidia' | 'groq' | 'openrouter' | 'gemini' | 'deepseek'
 * @returns {Array<{ index: number, key: string, name: string }>}
 */
/**
 * Validate that an environment variable string is a genuine API key token rather than configuration text
 * @param {string} v 
 * @returns {boolean}
 */
function isValidSecretToken(v) {
  if (!v || typeof v !== 'string') return false;
  const trimmed = v.trim().replace(/^["']|["']$/g, '').trim();
  if (trimmed.length < 8) return false;
  if (trimmed.includes(' ')) return false;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;
  if (/^(true|false|cpu|gpu|auto|\d{1,5})$/i.test(trimmed)) return false;
  return true;
}

/**
 * Extract available API keys for a provider from environment variables
 * @param {string} provider - 'ollama' | 'nvidia' | 'groq' | 'openrouter' | 'gemini' | 'deepseek'
 * @returns {Array<{ index: number, key: string, name: string, provider: string }>}
 */
export function getKeyPool(provider = 'ollama') {
  const pool = [];
  const p = (provider || '').toLowerCase();

  const addKey = (name, val, prov = 'ollama') => {
    if (!val || typeof val !== 'string') return;
    const tokens = val.includes(',') ? val.split(',') : [val];
    for (let idx = 0; idx < tokens.length; idx++) {
      const rawToken = tokens[idx];
      if (!isValidSecretToken(rawToken)) continue;
      const trimmed = rawToken.trim().replace(/^["']|["']$/g, '').trim();
      const tokenName = tokens.length > 1 ? `${name}_${idx + 1}` : name;
      if (!pool.some(k => k.key === trimmed && k.provider === prov)) {
        pool.push({ index: pool.length + 1, key: trimmed, name: tokenName, provider: prov });
      }
    }
  };

  if (p === 'ollama' || p === 'ollama_pool') {
    // 1. Direct indexed keys OLLAMA_API_KEY1..16, OLLAMA_KEY1..16, OLLAMA1..16
    for (let i = 1; i <= 16; i++) {
      if (process.env[`OLLAMA_API_KEY${i}`]) addKey(`OLLAMA_API_KEY${i}`, process.env[`OLLAMA_API_KEY${i}`], 'ollama');
      if (process.env[`OLLAMA_KEY${i}`]) addKey(`OLLAMA_KEY${i}`, process.env[`OLLAMA_KEY${i}`], 'ollama');
      if (process.env[`OLLAMA${i}`]) addKey(`OLLAMA${i}`, process.env[`OLLAMA${i}`], 'ollama');
      if (process.env[`ollama${i}`]) addKey(`ollama${i}`, process.env[`ollama${i}`], 'ollama');
      if (process.env[`ollama_api${i}`]) addKey(`ollama_api${i}`, process.env[`ollama_api${i}`], 'ollama');
      if (process.env[`ollamaapi${i}`]) addKey(`ollamaapi${i}`, process.env[`ollamaapi${i}`], 'ollama');
    }
    if (process.env.OLLAMA_API_KEY) addKey('OLLAMA_API_KEY', process.env.OLLAMA_API_KEY, 'ollama');
    if (process.env.OLLAMA_KEY) addKey('OLLAMA_KEY', process.env.OLLAMA_KEY, 'ollama');
    if (process.env.OLLAMA) addKey('OLLAMA', process.env.OLLAMA, 'ollama');
    if (process.env.ollama) addKey('ollama', process.env.ollama, 'ollama');

    // 2. Scan all environment variables for any variant of 'ollama' (including ollama2, OLLAMA2, ollama_2, etc.)
    for (const [k, v] of Object.entries(process.env)) {
      if (k.includes(',')) {
        const subNames = k.split(',').map(s => s.trim());
        const subVals = typeof v === 'string' && v.includes(',') ? v.split(',').map(s => s.trim()) : [v];
        for (let j = 0; j < subNames.length; j++) {
          const subName = subNames[j];
          const subVal = subVals[j] || subVals[0];
          const cleaned = subName.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleaned.includes('model') || cleaned.includes('endpoint') || cleaned.includes('url') || cleaned.includes('host') || cleaned.includes('port')) {
            continue;
          }
          if (cleaned.includes('ollama')) {
            addKey(subName.toUpperCase(), subVal, 'ollama');
          }
        }
      }
      const cleaned = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleaned.includes('model') || cleaned.includes('endpoint') || cleaned.includes('url') || cleaned.includes('host') || cleaned.includes('port')) {
        continue;
      }
      if (cleaned.includes('ollama')) {
        addKey(k.toUpperCase(), v, 'ollama');
      }
      // If user named an Ollama Cloud key for Nemotron
      if ((cleaned.includes('nematron') || cleaned.includes('nemotron')) && typeof v === 'string' && !v.trim().startsWith('nvapi-')) {
        addKey(k.toUpperCase(), v, 'ollama');
      }
    }
  } else if (p === 'nvidia' || p === 'nvidia_pool') {
    // 1. Direct indexed keys for NVIDIA & Nemotron / Nematron
    if (process.env.NVIDIA_API_KEY) addKey('NVIDIA_API_KEY', process.env.NVIDIA_API_KEY, 'nvidia');
    if (process.env.NVAPI_KEY) addKey('NVAPI_KEY', process.env.NVAPI_KEY, 'nvidia');
    if (process.env.NEMATRON_API_KEY) addKey('NEMATRON_API_KEY', process.env.NEMATRON_API_KEY, 'nvidia');
    if (process.env.NEMOTRON_API_KEY) addKey('NEMOTRON_API_KEY', process.env.NEMOTRON_API_KEY, 'nvidia');
    if (process.env.NEMATRON_KEY) addKey('NEMATRON_KEY', process.env.NEMATRON_KEY, 'nvidia');
    if (process.env.NEMOTRON_KEY) addKey('NEMOTRON_KEY', process.env.NEMOTRON_KEY, 'nvidia');
    if (process.env.NEMATRON) addKey('NEMATRON', process.env.NEMATRON, 'nvidia');
    if (process.env.NEMOTRON) addKey('NEMOTRON', process.env.NEMOTRON, 'nvidia');

    for (let i = 1; i <= 16; i++) {
      if (process.env[`NVIDIA_API_KEY${i}`]) addKey(`NVIDIA_API_KEY${i}`, process.env[`NVIDIA_API_KEY${i}`], 'nvidia');
      if (process.env[`NVAPI_KEY${i}`]) addKey(`NVAPI_KEY${i}`, process.env[`NVAPI_KEY${i}`], 'nvidia');
      if (process.env[`NEMATRON_API_KEY${i}`]) addKey(`NEMATRON_API_KEY${i}`, process.env[`NEMATRON_API_KEY${i}`], 'nvidia');
      if (process.env[`NEMOTRON_API_KEY${i}`]) addKey(`NEMOTRON_API_KEY${i}`, process.env[`NEMOTRON_API_KEY${i}`], 'nvidia');
      if (process.env[`NEMATRON${i}`]) addKey(`NEMATRON${i}`, process.env[`NEMATRON${i}`], 'nvidia');
      if (process.env[`NEMOTRON${i}`]) addKey(`NEMOTRON${i}`, process.env[`NEMOTRON${i}`], 'nvidia');
    }

    // 2. Scan all environment variables for NVIDIA, NVAPI, Nematron, Nemotron, or 'nvapi-' token prefix
    for (const [k, v] of Object.entries(process.env)) {
      const cleaned = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleaned.includes('model') || cleaned.includes('endpoint') || cleaned.includes('url') || cleaned.includes('host') || cleaned.includes('port')) {
        continue;
      }
      const isNvOrNemotron = cleaned.includes('nvidia') ||
                             cleaned.includes('nematron') ||
                             cleaned.includes('nemotron') ||
                             cleaned.startsWith('nvapi') ||
                             cleaned.startsWith('nv');
      const isNvVal = typeof v === 'string' && v.trim().startsWith('nvapi-');
      if (isNvOrNemotron || isNvVal) {
        addKey(k.toUpperCase(), v, 'nvidia');
      }
    }
  } else if (p === 'hybrid' || p === 'hybrid_pool') {
    // Aggregate both Ollama Cloud and NVIDIA/Nemotron key pools
    const oKeys = getKeyPool('ollama');
    const nKeys = getKeyPool('nvidia');
    return [...oKeys, ...nKeys];
  } else if (p === 'groq' || p === 'groq_pool') {
    if (process.env.GROQ_API_KEY) addKey('GROQ_API_KEY', process.env.GROQ_API_KEY, 'groq');
    for (let i = 1; i <= 8; i++) {
      if (process.env[`GROQ_API_KEY${i}`]) addKey(`GROQ_API_KEY${i}`, process.env[`GROQ_API_KEY${i}`], 'groq');
    }
    for (const [k, v] of Object.entries(process.env)) {
      const cleaned = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleaned.includes('groq')) {
        addKey(k.toUpperCase(), v, 'groq');
      }
    }
  } else if (p === 'openrouter' || p === 'openrouter_pool') {
    if (process.env.OPENROUTER_API_KEY) addKey('OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY, 'openrouter');
    for (let i = 1; i <= 8; i++) {
      if (process.env[`OPENROUTER_API_KEY${i}`]) addKey(`OPENROUTER_API_KEY${i}`, process.env[`OPENROUTER_API_KEY${i}`], 'openrouter');
    }
  } else if (p === 'gemini' || p === 'gemini_pool') {
    if (process.env.GEMINI_API_KEY) addKey('GEMINI_API_KEY', process.env.GEMINI_API_KEY, 'gemini');
    for (let i = 1; i <= 8; i++) {
      if (process.env[`GEMINI_API_KEY${i}`]) addKey(`GEMINI_API_KEY${i}`, process.env[`GEMINI_API_KEY${i}`], 'gemini');
    }
  } else if (p === 'deepseek' || p === 'deepseek_pool') {
    if (process.env.DEEPSEEK_API_KEY) addKey('DEEPSEEK_API_KEY', process.env.DEEPSEEK_API_KEY, 'deepseek');
    for (let i = 1; i <= 8; i++) {
      if (process.env[`DEEPSEEK_API_KEY${i}`]) addKey(`DEEPSEEK_API_KEY${i}`, process.env[`DEEPSEEK_API_KEY${i}`], 'deepseek');
    }
  }

  return pool;
}

/**
 * Check if a key is currently on temporary rate-limit cooldown
 * @param {string} key 
 * @param {string} [provider='']
 * @returns {boolean}
 */
export function isKeyInCooldown(key, provider = '') {
  if (!key) return false;
  const id = provider ? `${provider.toLowerCase()}:${key}` : key;
  const expiresAt = keyCooldowns.get(id);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    keyCooldowns.delete(id);
    return false;
  }
  return true;
}

/**
 * Place a key on temporary cooldown (default 30 seconds)
 * @param {string} key 
 * @param {number} durationMs 
 * @param {string} [provider='']
 */
export function markKeyCooldown(key, durationMs = 30000, provider = '') {
  if (!key) return;
  const id = provider ? `${provider.toLowerCase()}:${key}` : key;
  keyCooldowns.set(id, Date.now() + durationMs);
}

/**
 * Detect whether an HTTP status code or response body represents a quota / rate limit condition
 * @param {number} status 
 * @param {string} bodyText 
 * @returns {boolean}
 */
export function isRateLimitOrQuotaError(status, bodyText = '') {
  // HTTP 429: Too Many Requests
  if (status === 429) return true;
  // HTTP 402: Payment Required / Credits Expired
  if (status === 402) return true;
  // HTTP 503: Service Unavailable / Overloaded
  if (status === 503) return true;

  const lower = (bodyText || '').toLowerCase();
  const rateLimitPhrases = [
    'rate limit',
    'rate_limit',
    'rate-limit',
    'quota',
    'too many requests',
    'capacity',
    'tokens per minute',
    'requests per minute',
    'tpm',
    'rpm',
    'credit balance',
    'insufficient balance',
    'exceeded your current quota',
    'quota_exceeded',
    'resource_exhausted',
    'model is overloaded',
    'temporarily unavailable',
    'overloaded with other requests'
  ];

  return rateLimitPhrases.some(phrase => lower.includes(phrase));
}

/**
 * Normalize an Ollama endpoint URL, ensuring proper protocol, path, and cloud fallback
 * @param {string} endpoint 
 * @returns {string}
 */
export function normalizeOllamaEndpoint(endpoint) {
  let ep = (endpoint || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!ep) return 'https://ollama.com/v1/chat/completions';

  // If running in Vercel or cloud and pointing to localhost, fallback to Ollama Cloud
  if (process.env.VERCEL && /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(ep)) {
    return 'https://ollama.com/v1/chat/completions';
  }

  // Remove trailing slashes
  ep = ep.replace(/\/+$/, '');

  // If already ends with full completion path
  if (ep.endsWith('/v1/chat/completions') || ep.endsWith('/chat/completions') || ep.endsWith('/api/chat')) {
    return ep;
  }
  if (ep.endsWith('/v1')) {
    return `${ep}/chat/completions`;
  }
  if (ep.endsWith('/api')) {
    return `${ep}/chat`;
  }
  return `${ep}/v1/chat/completions`;
}

/**
 * Robust extraction of generated content across diverse model formats:
 * OpenAI chat, Ollama native /api/chat & /api/generate, reasoning/thought models (DeepSeek-R1, Nemotron),
 * and SSE/NDJSON streaming lines.
 * 
 * @param {Object} data 
 * @param {string} [rawText='']
 * @returns {string}
 */
export function extractCompletionContent(data, rawText = '') {
  if (!data && rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      // Check for NDJSON / SSE chunks
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.startsWith('{') || l.startsWith('data: '));
      let acc = '';
      for (let line of lines) {
        if (line.startsWith('data: ')) line = line.substring(6).trim();
        if (line === '[DONE]') continue;
        try {
          const parsed = JSON.parse(line);
          const chunk = parsed.choices?.[0]?.delta?.content ||
                        parsed.choices?.[0]?.message?.content ||
                        parsed.message?.content ||
                        parsed.response || '';
          acc += chunk;
        } catch (ignore) {}
      }
      if (acc.trim()) return acc.trim();
    }
  }

  if (!data || typeof data !== 'object') return '';

  const choice = Array.isArray(data.choices) && data.choices[0] ? data.choices[0] : null;
  const msg = choice?.message || data.message;

  // 1. Standard chat message content
  if (msg) {
    if (typeof msg.content === 'string' && msg.content.trim()) return msg.content.trim();
    if (Array.isArray(msg.content)) {
      const parts = msg.content.map(p => typeof p === 'string' ? p : (p?.text || '')).filter(Boolean);
      if (parts.length > 0) return parts.join('\n').trim();
    }
    // Reasoning / Thought fields from DeepSeek R1, Nemotron, etc.
    if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim()) return msg.reasoning_content.trim();
    if (typeof msg.thought === 'string' && msg.thought.trim()) return msg.thought.trim();
  }

  // 2. Direct choice text or delta
  if (choice) {
    if (typeof choice.text === 'string' && choice.text.trim()) return choice.text.trim();
    if (typeof choice.delta?.content === 'string' && choice.delta.content.trim()) return choice.delta.content.trim();
    if (typeof choice.delta?.reasoning_content === 'string' && choice.delta.reasoning_content.trim()) return choice.delta.reasoning_content.trim();
  }

  // 3. Ollama native generate / chat format (data.response)
  if (typeof data.response === 'string' && data.response.trim()) return data.response.trim();
  if (typeof data.reply === 'string' && data.reply.trim()) return data.reply.trim();
  if (typeof data.content === 'string' && data.content.trim()) return data.content.trim();
  if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
  if (typeof data.reasoning_content === 'string' && data.reasoning_content.trim()) return data.reasoning_content.trim();

  return '';
}

/**
 * Executes an AI provider request with automatic key rotation and continuous failover.
 * If Key #N encounters rate-limits or empty response, it immediately flags cooldown,
 * switches to Key #(N+1), and continues across multi-round retry cycles.
 * 
 * @param {Object} options
 * @param {string} options.provider - 'ollama' | 'nvidia' | 'groq' | 'openrouter' | 'custom'
 * @param {Function} options.makeRequest - async function(apiKey, keyMeta) => Response
 * @param {string} [options.customApiKey]
 * @param {number} [options.maxCycles=2]
 * @returns {Promise<{ success: boolean, data?: any, content?: string, keyMeta?: object, failoverLogs: string[], reason?: string }>}
 */
export async function executeWithFailover({ provider = 'ollama', makeRequest, customApiKey = '', maxCycles = 2 }) {
  const failoverLogs = [];
  let hadRateLimit = false;
  let hadAuthFailure = false;
  let lastErrorDetail = '';

  // If a custom API key was provided explicitly by the user, try it first
  if (customApiKey) {
    try {
      failoverLogs.push('[KeyPool]: Trying custom API key from AI Studio configuration...');
      const cleanCustomKey = customApiKey.trim().replace(/^["']|["']$/g, '').trim();
      const res = await makeRequest(cleanCustomKey, { index: 1, name: 'Custom User Key' });
      const rawText = await res.text().catch(() => '');

      if (res.ok) {
        let data = null;
        try { data = JSON.parse(rawText); } catch (e) {}

        if (data && !data.error && !isRateLimitOrQuotaError(res.status, rawText)) {
          const content = extractCompletionContent(data, rawText);
          if (content && content !== 'Task processed.') {
            return { success: true, data, content, keyMeta: { index: 1, name: 'Custom User Key' }, failoverLogs };
          }
        }
      }

      failoverLogs.push(`[KeyPool]: Custom Key rate-limited or returned empty response. Cascading to platform key pool...`);
    } catch (err) {
      failoverLogs.push(`[KeyPool]: Custom Key error (${err.message}). Cascading to platform pool...`);
    }
  }

  const pool = getKeyPool(provider);

  if (pool.length === 0) {
    return {
      success: false,
      reason: `NO_KEYS_CONFIGURED: No environment API keys found for provider "${provider}". Please configure ${provider.toUpperCase()}_API_KEY in Vercel settings.`,
      failoverLogs
    };
  }

  // Multi-cycle retry loop across all keys in the pool
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    // Filter keys not currently on cooldown for this provider
    let activeKeys = pool.filter(k => !isKeyInCooldown(k.key, k.provider || provider));

    if (activeKeys.length === 0) {
      if (cycle < maxCycles) {
        failoverLogs.push(`[KeyPool Cycle ${cycle}]: All ${pool.length} keys on cooldown for ${provider}. Waiting 1.2s for quota window before retry cycle ${cycle + 1}...`);
        await new Promise(r => setTimeout(r, 1200));
        keyCooldowns.clear();
        activeKeys = pool;
      } else {
        break;
      }
    }

    for (let i = 0; i < activeKeys.length; i++) {
      const keyMeta = activeKeys[i];
      const keyProv = keyMeta.provider || provider;
      try {
        failoverLogs.push(`[KeyPool Cycle ${cycle}]: Dispatching with ${keyMeta.name} (${keyProv}, Key #${keyMeta.index} of ${pool.length})...`);
        const res = await makeRequest(keyMeta.key, keyMeta);
        const rawText = await res.text().catch(() => '');

        if (res.ok) {
          let data = null;
          try { data = JSON.parse(rawText); } catch (e) {}

          // Verify that the response is not an error disguised as HTTP 200
          if (data) {
            if (data.error || isRateLimitOrQuotaError(res.status, rawText)) {
              hadRateLimit = true;
              markKeyCooldown(keyMeta.key, 30000, keyProv);
              failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} (${keyProv}) returned rate-limit in JSON. Switching to next key...`);
              continue;
            }

            const content = extractCompletionContent(data, rawText);
            // If the model returned completely blank text or dummy "Task processed.", treat as quota glitch and rotate
            if (!content || content === 'Task processed.') {
              hadRateLimit = true;
              markKeyCooldown(keyMeta.key, 15000, keyProv);
              const preview = rawText ? rawText.substring(0, 100).replace(/\s+/g, ' ') : '';
              failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} (${keyProv}) returned empty completion (${preview}). Rotating to next key...`);
              continue;
            }

            failoverLogs.push(`[KeyPool]: Success from ${keyMeta.name} (${keyProv}, HTTP 200).`);
            return { success: true, data, content, keyMeta, failoverLogs };
          }
        }

        // Handle HTTP Rate Limit or Quota
        if (isRateLimitOrQuotaError(res.status, rawText)) {
          hadRateLimit = true;
          markKeyCooldown(keyMeta.key, 30000, keyProv);
          failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} (${keyProv}) hit rate/quota limit (HTTP ${res.status}). Switching to next key...`);
          continue;
        }

        // Handle Authentication failure
        if (res.status === 401 || res.status === 403) {
          hadAuthFailure = true;
          lastErrorDetail = `${keyMeta.name} (${keyProv}) unauthorized (HTTP ${res.status})`;
          markKeyCooldown(keyMeta.key, 300000, keyProv);
          failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} (${keyProv}) auth failure (HTTP ${res.status}). Switching to alternate key...`);
          continue;
        }

        // Other HTTP error (e.g. 400 bad payload or 404 endpoint not found)
        lastErrorDetail = `${keyMeta.name} (${keyProv}) returned HTTP ${res.status}: ${rawText.substring(0, 120)}`;
        failoverLogs.push(`[KeyPool Error]: ${lastErrorDetail}`);
        continue;

      } catch (netErr) {
        lastErrorDetail = `${keyMeta.name} (${keyProv}) network error: ${netErr.message}`;
        failoverLogs.push(`[KeyPool]: Network error with ${keyMeta.name} (${keyProv}): ${netErr.message}. Attempting failover...`);
        continue;
      }
    }

    if (cycle < maxCycles) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  let failureReason = '';
  if (hadRateLimit) {
    failureReason = `ALL_KEYS_EXHAUSTED: All ${pool.length} configured keys for provider "${provider}" are currently rate-limited.`;
  } else if (hadAuthFailure) {
    failureReason = `AUTH_FAILED: Authentication rejected for provider "${provider}". ${lastErrorDetail || 'Please verify API key credentials.'}`;
  } else if (lastErrorDetail) {
    failureReason = `GATEWAY_DISPATCH_FAILED: Provider "${provider}" error: ${lastErrorDetail}`;
  } else {
    failureReason = `PROVIDER_UNAVAILABLE: Provider "${provider}" did not return a valid response.`;
  }

  return {
    success: false,
    reason: failureReason,
    failoverLogs
  };
}
