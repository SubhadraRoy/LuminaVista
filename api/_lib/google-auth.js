// api/_lib/google-auth.js
// Native Zero-Dependency Google Service Account RS256 JWT Authentication Engine
// Implements RFC 7523 OAuth 2.0 JWT Bearer Token Profile using Node.js built-in 'crypto'

import crypto from 'crypto';

let cachedToken = null;
let tokenExpiresAt = 0; // Epoch milliseconds

/**
 * Encodes a string or Buffer into RFC 7515 URL-safe Base64 without padding
 * @param {Buffer | string} input
 * @returns {string}
 */
export function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Sanitizes raw private key string from process.env to handle all Vercel/cloud formats
 * Strips enclosing single or double quotes and unescapes literal \n characters
 * @param {string} rawKey
 * @returns {string}
 */
export function sanitizePrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  return rawKey
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .trim();
}

/**
 * Lazily retrieves runtime Service Account credentials from environment variables.
 * Build-safe: Returns empty values rather than throwing if env vars are unset.
 * @returns {{ email: string, privateKey: string, calendarId: string, isConfigured: boolean }}
 */
export function getServiceAccountCredentials() {
  const email = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const privateKey = sanitizePrivateKey(rawKey);
  const calendarId = (process.env.GOOGLE_CALENDAR_ID || '').trim() || 'roysubhadra40@gmail.com';

  return {
    email,
    privateKey,
    calendarId,
    isConfigured: !!(email && privateKey)
  };
}

/**
 * Generates an RS256 signed JWT for Google OAuth2 Service Account assertion.
 * Header: {"alg":"RS256","typ":"JWT"}
 * Claims: iss, scope, aud, iat, exp (now + 3600)
 *
 * @param {string} email Service account client email
 * @param {string} privateKey RSA private key in PEM format
 * @returns {string} Signed JWT assertion string
 */
export function createServiceAccountJwt(email, privateKey) {
  if (!email || !privateKey) {
    throw new Error('Both service account email and private key are required to construct JWT');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };

  const claimSet = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(privateKey);
  const encodedSignature = base64UrlEncode(signature);

  return `${unsignedToken}.${encodedSignature}`;
}

/**
 * Exchanges RS256 JWT for a short-lived Google OAuth2 access_token.
 * Caches access_token in memory until 5 minutes before expiration (tokenExpiresAt - now > 300000).
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{ ok: boolean, accessToken?: string, cached?: boolean, expiresAt?: number, error?: string, missing?: string[], details?: any }>}
 */
export async function getServiceAccountAccessToken(forceRefresh = false) {
  const { email, privateKey, calendarId, isConfigured } = getServiceAccountCredentials();

  if (!isConfigured || !email || !privateKey) {
    return {
      ok: false,
      error: 'Google Service Account credentials unconfigured in process.env',
      missing: [
        !email && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
        !privateKey && 'GOOGLE_PRIVATE_KEY'
      ].filter(Boolean)
    };
  }

  const now = Date.now();
  // Return cached token if valid for at least 5 more minutes (300,000 ms)
  if (!forceRefresh && cachedToken && (tokenExpiresAt - now > 300000)) {
    return {
      ok: true,
      accessToken: cachedToken,
      cached: true,
      expiresAt: tokenExpiresAt
    };
  }

  try {
    const jwt = createServiceAccountJwt(email, privateKey);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!res.ok) {
      const errText = await res.text();
      let parsedErr = errText;
      try { parsedErr = JSON.parse(errText); } catch (_) {}
      return {
        ok: false,
        status: res.status,
        error: 'Failed to exchange Service Account JWT for Google access token',
        details: parsedErr
      };
    }

    const data = await res.json();
    const expiresIn = data.expires_in || 3600;
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (expiresIn * 1000);

    return {
      ok: true,
      accessToken: cachedToken,
      cached: false,
      expiresAt: tokenExpiresAt
    };
  } catch (err) {
    return {
      ok: false,
      error: 'Exception during Service Account JWT generation or token exchange',
      details: err.message || String(err)
    };
  }
}

/**
 * Resolves to the Google Service Account Bearer access token string if configured,
 * or null if unconfigured/missing/failed.
 * Build-safe: returns null rather than throwing when credentials are not configured.
 *
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<string | null>}
 */
export async function getGoogleServiceAccountToken(forceRefresh = false) {
  try {
    const res = await getServiceAccountAccessToken(forceRefresh);
    if (res && res.ok && res.accessToken) {
      return res.accessToken;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Clears in-memory cached token (e.g. on 401 retry)
 */
export function invalidateServiceAccountToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export default getGoogleServiceAccountToken;
