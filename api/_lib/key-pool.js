// api/_lib/key-pool.js - Multi-Key Auto-Failover & Rotation Engine
// Handles Multi-Key pools across Ollama Cloud, NVIDIA NIM, Groq, OpenRouter & Gemini
// with intelligent rate-limit detection, response validation, and continuous rotation.

const keyCooldowns = new Map();

/**
 * Extract available API keys for a provider from environment variables
 * @param {string} provider - 'ollama' | 'nvidia' | 'groq' | 'openrouter' | 'gemini' | 'deepseek'
 * @returns {Array<{ index: number, key: string, name: string }>}
 */
export function getKeyPool(provider = 'ollama') {
  const pool = [];
  const p = (provider || '').toLowerCase();

  const addKey = (name, val, prov = 'ollama') => {
    if (!val || typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed) return;
    if (!pool.some(k => k.key === trimmed)) {
      pool.push({ index: pool.length + 1, key: trimmed, name, provider: prov });
    }
  };

  if (p === 'ollama' || p === 'ollama_pool') {
    // 1. Direct indexed keys OLLAMA_API_KEY1..16 and OLLAMA_API_KEY
    for (let i = 1; i <= 16; i++) {
      if (process.env[`OLLAMA_API_KEY${i}`]) addKey(`OLLAMA_API_KEY${i}`, process.env[`OLLAMA_API_KEY${i}`], 'ollama');
    }
    if (process.env.OLLAMA_API_KEY) addKey('OLLAMA_API_KEY', process.env.OLLAMA_API_KEY, 'ollama');

    // 2. Scan all environment variables for flexible patterns (e.g. ollamaapi2, OLLAMAAPI2, ollama_api2, OLLAMA_KEY2)
    for (const [k, v] of Object.entries(process.env)) {
      const lowerKey = k.toLowerCase();
      if (/^ollamaapi\d*$/i.test(k) || /^ollama_api\d*$/i.test(k) || (lowerKey.includes('ollama') && (lowerKey.includes('api') || lowerKey.includes('key')))) {
        addKey(k.toUpperCase(), v, 'ollama');
      }
    }
  } else if (p === 'nvidia' || p === 'nvidia_pool') {
    // 1. Direct indexed keys NVIDIA_API_KEY, NVIDIA_API_KEY1..16, NVAPI_KEY1..16
    if (process.env.NVIDIA_API_KEY) addKey('NVIDIA_API_KEY', process.env.NVIDIA_API_KEY, 'nvidia');
    if (process.env.NVAPI_KEY) addKey('NVAPI_KEY', process.env.NVAPI_KEY, 'nvidia');
    for (let i = 1; i <= 16; i++) {
      if (process.env[`NVIDIA_API_KEY${i}`]) addKey(`NVIDIA_API_KEY${i}`, process.env[`NVIDIA_API_KEY${i}`], 'nvidia');
      if (process.env[`NVAPI_KEY${i}`]) addKey(`NVAPI_KEY${i}`, process.env[`NVAPI_KEY${i}`], 'nvidia');
    }

    // 2. Scan all environment variables for NVIDIA NIM patterns or nvapi- token prefixes
    for (const [k, v] of Object.entries(process.env)) {
      const lowerKey = k.toLowerCase();
      const isNvKey = (lowerKey.includes('nvidia') || lowerKey.startsWith('nvapi') || lowerKey.startsWith('nv_')) &&
                      (lowerKey.includes('api') || lowerKey.includes('key'));
      const isNvVal = typeof v === 'string' && v.trim().startsWith('nvapi-');
      if (isNvKey || isNvVal) {
        addKey(k.toUpperCase(), v, 'nvidia');
      }
    }
  } else if (p === 'hybrid' || p === 'hybrid_pool') {
    // Aggregate both Ollama Cloud and NVIDIA NIM key pools
    const oKeys = getKeyPool('ollama');
    const nKeys = getKeyPool('nvidia');
    return [...oKeys, ...nKeys];
  } else if (p === 'groq' || p === 'groq_pool') {
    if (process.env.GROQ_API_KEY) addKey('GROQ_API_KEY', process.env.GROQ_API_KEY, 'groq');
    for (let i = 1; i <= 8; i++) {
      if (process.env[`GROQ_API_KEY${i}`]) addKey(`GROQ_API_KEY${i}`, process.env[`GROQ_API_KEY${i}`], 'groq');
    }
    for (const [k, v] of Object.entries(process.env)) {
      if (k.toLowerCase().includes('groq') && (k.toLowerCase().includes('api') || k.toLowerCase().includes('key'))) {
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
 * @returns {boolean}
 */
export function isKeyInCooldown(key) {
  if (!key) return false;
  const expiresAt = keyCooldowns.get(key);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    keyCooldowns.delete(key);
    return false;
  }
  return true;
}

/**
 * Place a key on temporary cooldown (default 30 seconds)
 * @param {string} key 
 * @param {number} durationMs 
 */
export function markKeyCooldown(key, durationMs = 30000) {
  if (!key) return;
  keyCooldowns.set(key, Date.now() + durationMs);
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
 * Executes an AI provider request with automatic key rotation and continuous failover.
 * If Key #N encounters rate-limits or empty response, it immediately flags cooldown,
 * switches to Key #(N+1), and continues across multi-round retry cycles.
 * 
 * @param {Object} options
 * @param {string} options.provider - 'ollama' | 'nvidia' | 'groq' | 'openrouter' | 'custom'
 * @param {Function} options.makeRequest - async function(apiKey, keyMeta) => Response
 * @param {string} [options.customApiKey]
 * @param {number} [options.maxCycles=2]
 * @returns {Promise<{ success: boolean, data?: any, keyMeta?: object, failoverLogs: string[], reason?: string }>}
 */
export async function executeWithFailover({ provider = 'ollama', makeRequest, customApiKey = '', maxCycles = 2 }) {
  const failoverLogs = [];

  // If a custom API key was provided explicitly by the user, try it first
  if (customApiKey) {
    try {
      failoverLogs.push('[KeyPool]: Trying custom API key from AI Studio configuration...');
      const res = await makeRequest(customApiKey, { index: 1, name: 'Custom User Key' });
      const rawText = await res.text().catch(() => '');

      if (res.ok) {
        let data = null;
        try { data = JSON.parse(rawText); } catch (e) {}

        if (data && !data.error && !isRateLimitOrQuotaError(res.status, rawText)) {
          const content = data.choices?.[0]?.message?.content || data.message?.content || data.reply || '';
          if (content && content.trim() !== '' && content.trim() !== 'Task processed.') {
            return { success: true, data, keyMeta: { index: 1, name: 'Custom User Key' }, failoverLogs };
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
    // Filter keys not currently on cooldown
    let activeKeys = pool.filter(k => !isKeyInCooldown(k.key));

    if (activeKeys.length === 0) {
      if (cycle < maxCycles) {
        failoverLogs.push(`[KeyPool Cycle ${cycle}]: All ${pool.length} keys on cooldown. Waiting 1.2s for quota window before retry cycle ${cycle + 1}...`);
        await new Promise(r => setTimeout(r, 1200));
        keyCooldowns.clear();
        activeKeys = pool;
      } else {
        break;
      }
    }

    for (let i = 0; i < activeKeys.length; i++) {
      const keyMeta = activeKeys[i];
      try {
        failoverLogs.push(`[KeyPool Cycle ${cycle}]: Dispatching with ${keyMeta.name} (Key #${keyMeta.index} of ${pool.length})...`);
        const res = await makeRequest(keyMeta.key, keyMeta);
        const rawText = await res.text().catch(() => '');

        if (res.ok) {
          let data = null;
          try { data = JSON.parse(rawText); } catch (e) {}

          // Verify that the response is not an error disguised as HTTP 200
          if (data) {
            if (data.error || isRateLimitOrQuotaError(res.status, rawText)) {
              markKeyCooldown(keyMeta.key, 30000);
              failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} returned rate-limit in JSON. Switching to next key...`);
              continue;
            }

            const content = data.choices?.[0]?.message?.content || data.message?.content || data.reply || '';
            // If the model returned completely blank text or dummy "Task processed.", treat as quota glitch and rotate
            if (!content || content.trim() === '' || content.trim() === 'Task processed.') {
              markKeyCooldown(keyMeta.key, 15000);
              failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} returned empty completion. Rotating to next key...`);
              continue;
            }

            failoverLogs.push(`[KeyPool]: Success from ${keyMeta.name} (HTTP 200).`);
            return { success: true, data, keyMeta, failoverLogs };
          }
        }

        // Handle HTTP Rate Limit or Quota
        if (isRateLimitOrQuotaError(res.status, rawText)) {
          markKeyCooldown(keyMeta.key, 30000);
          failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} hit rate/quota limit (HTTP ${res.status}). Switching to next key...`);
          continue;
        }

        // Handle Authentication failure
        if (res.status === 401 || res.status === 403) {
          markKeyCooldown(keyMeta.key, 300000);
          failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} auth failure (HTTP ${res.status}). Switching to alternate key...`);
          continue;
        }

        failoverLogs.push(`[KeyPool Error]: ${keyMeta.name} returned HTTP ${res.status}: ${rawText.substring(0, 120)}`);
        if (i < activeKeys.length - 1) continue;

      } catch (netErr) {
        failoverLogs.push(`[KeyPool]: Network error with ${keyMeta.name}: ${netErr.message}. Attempting failover...`);
        if (i < activeKeys.length - 1) continue;
      }
    }

    if (cycle < maxCycles) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return {
    success: false,
    reason: `ALL_KEYS_EXHAUSTED: All ${pool.length} configured keys for provider "${provider}" are currently rate-limited.`,
    failoverLogs
  };
}
