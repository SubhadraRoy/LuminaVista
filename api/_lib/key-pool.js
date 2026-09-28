// api/_lib/key-pool.js - Multi-Key Auto-Failover & Rotation Engine
// Handles 8x Ollama Cloud and Multi-Key NVIDIA NIM pools with rate-limit detection

const keyCooldowns = new Map();

/**
 * Extract available API keys for a provider from environment variables
 * @param {string} provider - 'ollama' | 'nvidia'
 * @returns {Array<{ index: number, key: string, name: string }>}
 */
export function getKeyPool(provider = 'ollama') {
  const pool = [];
  const p = (provider || '').toLowerCase();

  if (p === 'ollama' || p === 'ollama_pool') {
    // Check OLLAMA_API_KEY1 through OLLAMA_API_KEY8 (and base OLLAMA_API_KEY)
    for (let i = 1; i <= 8; i++) {
      const val = process.env[`OLLAMA_API_KEY${i}`];
      if (val && val.trim()) {
        pool.push({ index: i, key: val.trim(), name: `OLLAMA_API_KEY${i}` });
      }
    }
    // Also check base OLLAMA_API_KEY if not already in pool
    if (process.env.OLLAMA_API_KEY && !pool.some(k => k.key === process.env.OLLAMA_API_KEY.trim())) {
      pool.push({ index: pool.length + 1, key: process.env.OLLAMA_API_KEY.trim(), name: 'OLLAMA_API_KEY' });
    }
  } else if (p === 'nvidia' || p === 'nvidia_pool') {
    // Check base NVIDIA_API_KEY and numbered NVIDIA_API_KEY1..8
    if (process.env.NVIDIA_API_KEY && process.env.NVIDIA_API_KEY.trim()) {
      pool.push({ index: 1, key: process.env.NVIDIA_API_KEY.trim(), name: 'NVIDIA_API_KEY' });
    }
    for (let i = 1; i <= 8; i++) {
      const val = process.env[`NVIDIA_API_KEY${i}`];
      if (val && val.trim() && !pool.some(k => k.key === val.trim())) {
        pool.push({ index: pool.length + 1, key: val.trim(), name: `NVIDIA_API_KEY${i}` });
      }
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
 * Place a key on temporary cooldown (default 60 seconds)
 * @param {string} key 
 * @param {number} durationMs 
 */
export function markKeyCooldown(key, durationMs = 60000) {
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
    'exceeded your current quota'
  ];

  return rateLimitPhrases.some(phrase => lower.includes(phrase));
}

/**
 * Executes an AI provider request with automatic key rotation and failover.
 * If Key #N encounters rate-limits, it immediately flags cooldown and tries Key #(N+1).
 * 
 * @param {Object} options
 * @param {string} options.provider - 'ollama' | 'nvidia' | 'custom'
 * @param {Function} options.makeRequest - async function(apiKey, keyMeta) => Response
 * @param {string} [options.customApiKey]
 * @returns {Promise<{ success: boolean, data?: any, keyMeta?: object, failoverLogs: string[], reason?: string }>}
 */
export async function executeWithFailover({ provider = 'ollama', makeRequest, customApiKey = '' }) {
  const failoverLogs = [];

  // If a custom API key was provided explicitly by the user, use it directly
  if (customApiKey) {
    try {
      const res = await makeRequest(customApiKey, { index: 1, name: 'Custom User Key' });
      if (res.ok) {
        const data = await res.json();
        return { success: true, data, keyMeta: { index: 1, name: 'Custom User Key' }, failoverLogs };
      }
      const rawErr = await res.text().catch(() => '');
      return { success: false, reason: `Direct Custom Key Error (HTTP ${res.status}): ${rawErr}`, failoverLogs };
    } catch (err) {
      return { success: false, reason: `Direct Custom Key Exception: ${err.message}`, failoverLogs };
    }
  }

  const pool = getKeyPool(provider);

  if (pool.length === 0) {
    return {
      success: false,
      reason: `NO_KEYS_CONFIGURED: No environment API keys found for provider "${provider}". Please configure ${provider === 'nvidia' ? 'NVIDIA_API_KEY' : 'OLLAMA_API_KEY1..8'}.`,
      failoverLogs
    };
  }

  // Filter keys not currently on cooldown, or fallback to full pool if all are cooled
  let activeKeys = pool.filter(k => !isKeyInCooldown(k.key));
  if (activeKeys.length === 0) {
    failoverLogs.push(`[KeyPool]: All ${pool.length} keys were on cooldown. Resetting pool for urgent retry.`);
    keyCooldowns.clear();
    activeKeys = pool;
  }

  for (let i = 0; i < activeKeys.length; i++) {
    const keyMeta = activeKeys[i];
    try {
      failoverLogs.push(`[KeyPool]: Dispatching request with ${keyMeta.name} (Key #${keyMeta.index} of ${pool.length})...`);
      const res = await makeRequest(keyMeta.key, keyMeta);

      if (res.ok) {
        const data = await res.json();
        failoverLogs.push(`[KeyPool]: Success from ${keyMeta.name} (HTTP 200).`);
        return { success: true, data, keyMeta, failoverLogs };
      }

      const rawErrText = await res.text().catch(() => '');

      if (isRateLimitOrQuotaError(res.status, rawErrText)) {
        markKeyCooldown(keyMeta.key, 60000);
        failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} encountered rate/quota limit (HTTP ${res.status}). Marking 60s cooldown and seamlessly switching to next key...`);
        continue; // Try next key
      }

      // If it's a 401/403 invalid key error, mark it cooled so we don't try it again
      if (res.status === 401 || res.status === 403) {
        markKeyCooldown(keyMeta.key, 300000); // 5 min cooldown for bad credentials
        failoverLogs.push(`[Auto-Failover]: ${keyMeta.name} returned authentication failure (HTTP ${res.status}). Switching to alternate key...`);
        continue;
      }

      // Non-rate-limit server error
      failoverLogs.push(`[KeyPool Error]: ${keyMeta.name} returned HTTP ${res.status}: ${rawErrText.substring(0, 150)}`);
      // If we have more keys, try next key just in case
      if (i < activeKeys.length - 1) {
        continue;
      }
      return { success: false, reason: `Provider Gateway Error (HTTP ${res.status}): ${rawErrText}`, failoverLogs };

    } catch (netErr) {
      failoverLogs.push(`[KeyPool]: Network fault with ${keyMeta.name}: ${netErr.message}. Attempting failover...`);
      if (i < activeKeys.length - 1) continue;
      return { success: false, reason: `Network connection fault across all keys: ${netErr.message}`, failoverLogs };
    }
  }

  return {
    success: false,
    reason: `ALL_KEYS_EXHAUSTED: All ${pool.length} configured keys for provider "${provider}" are currently rate-limited.`,
    failoverLogs
  };
}
