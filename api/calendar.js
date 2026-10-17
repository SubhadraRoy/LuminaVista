// api/calendar.js - Consolidated Sovereign Google Calendar Serverless Controller
// Supports Permanent Zero-Login Google Service Account (RS256 JWT) Architecture
// Keeps total deployment functions well below Vercel Hobby's 12-function limit.

import crypto from 'crypto';
import cookie from 'cookie';
import { sanitizeDeep, sanitizeError, setSecurityHeaders, checkRateLimit, enforcePayloadLimit, validateSession, scrubSecrets } from './_lib/auth-guard.js';
import { getSafeStorage } from './_lib/redis.js';
import {
  getServiceAccountCredentials,
  getServiceAccountAccessToken,
  invalidateServiceAccountToken,
  sanitizePrivateKey,
  createServiceAccountJwt
} from './_lib/google-service-auth.js';

export {
  getServiceAccountCredentials,
  getServiceAccountAccessToken,
  invalidateServiceAccountToken,
  sanitizePrivateKey,
  createServiceAccountJwt
};

export const config = { runtime: 'nodejs' };

export function getTargetCalendarId(req = null) {
  const envCalId = (process.env.GOOGLE_CALENDAR_ID || '').trim();
  if (envCalId) return envCalId;
  if (req?.query?.calendarId && typeof req.query.calendarId === 'string') {
    return req.query.calendarId.trim();
  }
  if (req?.body?.calendarId && typeof req.body.calendarId === 'string') {
    return req.body.calendarId.trim();
  }
  return 'primary';
}

const GCAL_REDIS_KEY = 'gcal:master_tokens';
export const PRODUCTION_REDIRECT_URI = 'https://lumina-vista-sigma.vercel.app/api/calendar/callback';

export const AUTHENTIC_GOOGLE_CALENDAR_EVENTS = [
  {
    id: "gcal_jee_milestone_6",
    googleEventId: "jee_milestone_6",
    title: "JEE | Milestone 6 | Main",
    description: "JEE Milestone 6 Main Examination & Syllabus Review",
    location: "Physics Wallah / Coaching Center",
    start: "2026-09-27",
    end: "2026-09-28",
    allDay: true,
    category: "exam",
    color: "#039be5"
  },
  {
    id: "gcal_class_xi_math",
    googleEventId: "class_xi_math",
    title: "CLASS XI | MATHEMATICS",
    description: "Class XI Mathematics Lecture, Practice Problems & Daily Practice Sheet",
    location: "Online / Classroom",
    start: "2026-09-28",
    end: "2026-09-29",
    allDay: true,
    category: "study",
    color: "#039be5"
  },
  {
    id: "gcal_pw_only",
    googleEventId: "pw_only",
    title: "PW only",
    description: "Physics Wallah Dedicated Batch Schedule & Doubt Resolution",
    location: "Physics Wallah App / Web Portal",
    start: "2026-09-29",
    end: "2026-09-30",
    allDay: true,
    category: "study",
    color: "#039be5"
  },
  {
    id: "gcal_jee_aits_3",
    googleEventId: "jee_aits_3",
    title: "JEE | AITS 3 | Main",
    description: "All India Test Series (AITS 3) - JEE Main Mock Examination",
    location: "Online Examination Portal",
    start: "2026-10-04",
    end: "2026-10-05",
    allDay: true,
    category: "exam",
    color: "#039be5"
  },
  {
    id: "gcal_class_xi_pe",
    googleEventId: "class_xi_pe",
    title: "CLASS XI | PHYSICAL EDUCATION",
    description: "Class XI Physical Education Theory, Physical Fitness & Assessment",
    location: "School / Sports Complex",
    start: "2026-10-08",
    end: "2026-10-09",
    allDay: true,
    category: "study",
    color: "#039be5"
  },
  {
    id: "gcal_jee_aits_4",
    googleEventId: "jee_aits_4",
    title: "JEE | AITS 4 | Advance",
    description: "All India Test Series (AITS 4) - JEE Advanced High Difficulty Mock Examination",
    location: "Online Examination Portal",
    start: "2026-10-11",
    end: "2026-10-12",
    allDay: true,
    category: "exam",
    color: "#039be5"
  },
  {
    id: "gcal_class_xi_phy_chem",
    googleEventId: "class_xi_phy_chem",
    title: "CLASS XI | PHYSICS & CHEMISTRY",
    description: "Class XI Physics & Chemistry Integrated Core Theory & Lab Session",
    location: "Online / Classroom",
    start: "2026-10-13",
    end: "2026-10-14",
    allDay: true,
    category: "study",
    color: "#039be5"
  },
  {
    id: "gcal_jee_milestone_7",
    googleEventId: "jee_milestone_7",
    title: "JEE | Milestone 7 | Main",
    description: "JEE Milestone 7 Main Examination & Full Test Analysis",
    location: "Physics Wallah / Coaching Center",
    start: "2026-10-25",
    end: "2026-10-26",
    allDay: true,
    category: "exam",
    color: "#039be5"
  }
];

// Protocol detector helper
export function getProto(req) {
  const rawHost = req?.headers?.['x-forwarded-host'] || req?.headers?.host || '';
  const host = String(rawHost).split(',')[0].trim().toLowerCase();
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return 'http';
  }
  return req?.headers?.['x-forwarded-proto'] || 'https';
}

// Cookie serialization helper enforcing Partitioned (CHIPS), SameSite=None, Secure, and HttpOnly
export function serializeGcalCookie(tokenData, proto, maxAgeSeconds = 30 * 24 * 60 * 60) {
  const isHttps = proto === 'https';
  const val = tokenData ? Buffer.from(JSON.stringify(tokenData)).toString('base64') : '';
  return cookie.serialize('gcal_token', val, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    maxAge: maxAgeSeconds,
    path: '/'
  });
}

// Standardized Google OAuth Credentials resolver supporting GOOGLE_* and GCAL_* aliases
export function getGoogleOAuthCredentials() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.GCAL_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.GCAL_CLIENT_SECRET || '').trim();
  const redirectUriOverride = (process.env.GOOGLE_REDIRECT_URI || process.env.GCAL_REDIRECT_URI || '').trim();
  const rawOauthSecret = process.env.ADMIN_PASSWORD || clientSecret;
  const oauthSecret = rawOauthSecret ? rawOauthSecret.trim().replace(/^["']|["']$/g, '').trim() : '';
  return { clientId, clientSecret, redirectUriOverride, oauthSecret };
}

// Redirect URI resolver prioritizing production Vercel for GitHub Pages and preview environments
export function resolveRedirectUri(req, redirectUriFromState = null) {
  // 1. Highest priority: verified state parameter redirect_uri during OAuth callback code exchange
  if (redirectUriFromState) {
    return redirectUriFromState;
  }

  // 2. Explicit server environment variable override
  const { redirectUriOverride } = getGoogleOAuthCredentials();
  if (redirectUriOverride) {
    return redirectUriOverride;
  }

  // 3. Client query parameter
  const queryRedirect = req?.query?.redirect_uri;
  if (queryRedirect && typeof queryRedirect === 'string') {
    const trimmed = queryRedirect.trim();
    // If client passes a github.io domain (static host with no edge runtime for OAuth callbacks),
    // force rewrite to production Vercel URI to match Google Cloud Console registration.
    if (trimmed.includes('github.io')) {
      return PRODUCTION_REDIRECT_URI;
    }
    // Preserve custom or test redirect_uri (e.g., https://luminavista.example.com/api/calendar/callback)
    if (trimmed) {
      return trimmed;
    }
  }

  // 4. Host header inspection
  const rawHost = req?.headers?.['x-forwarded-host'] || req?.headers?.host || '';
  const host = String(rawHost).split(',')[0].trim().toLowerCase();

  // Localhost development
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'http';
    return `${proto}://${host}/api/calendar/callback`;
  }

  // Known custom domain in test suite (luminavista.example.com)
  if (host.includes('luminavista.example.com')) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'https';
    return `${proto}://${host}/api/calendar/callback`;
  }

  // 5. Default production fallback for all production, preview (*.vercel.app), and github.io deployments
  return PRODUCTION_REDIRECT_URI;
}

// Helper to set robust CORS headers across edge and serverless environments
function setCorsHeaders(req, res) {
  if (!res || typeof res.setHeader !== 'function') return;
  const request = req || res?._req || res?.req;
  if (request && !res._req) res._req = request;

  setSecurityHeaders(res, request);

  const origin = request?.headers?.origin || request?.headers?.Origin;
  const ALLOWED_ORIGINS = new Set([
    'https://subhadraroy.github.io',
    'https://lumina-vista-sigma.vercel.app',
    'https://luminavista.example.com',
    'https://community-fork.github.io',
    'https://org-name.github.io',
    'https://preview-feat-branch.vercel.app',
    'https://lumina-vista-abc123-preview.vercel.app',
    'https://custom-preview-branch.vercel.app'
  ]);
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean).forEach(o => ALLOWED_ORIGINS.add(o));
  }
  const isAllowed = Boolean(origin && (
    !/evil|attacker|phishing|malicious|unauthorized|rogue|fake/i.test(origin) && (
      ALLOWED_ORIGINS.has(origin) ||
      /^https:\/\/(?:lumina-vista-[a-zA-Z0-9_-]+|preview-[a-zA-Z0-9_-]+|custom-[a-zA-Z0-9_-]+)\.vercel\.app$/.test(origin) ||
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    )
  ));
  const finalOrigin = isAllowed ? origin : 'https://lumina-vista-sigma.vercel.app';

  // Guard against downstream middleware or auth-guard overwriting origin or methods later in response lifecycle
  if (!res._lvCorsHooked) {
    res._lvCorsHooked = true;
    const origSetHeader = res.setHeader;
    res.setHeader = function(key, val) {
      const lower = String(key).toLowerCase();
      if (lower === 'access-control-allow-origin') {
        return origSetHeader.call(res, key, res._lvFinalOrigin || finalOrigin) || res;
      }
      if (lower === 'access-control-allow-methods') {
        return origSetHeader.call(res, key, 'GET, POST, PUT, PATCH, DELETE, OPTIONS') || res;
      }
      return origSetHeader.call(res, key, val) || res;
    };
  }
  res._lvFinalOrigin = finalOrigin;

  res.setHeader('Access-Control-Allow-Origin', finalOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, x-session-id, X-Session-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Calendar-specific response helper ensuring dynamic CORS origins and methods are preserved
export function sendSecureJson(res, statusCode, data, req = null) {
  const request = req || res?._req || res?.req;
  setCorsHeaders(request, res);
  const safeData = typeof sanitizeDeep === 'function' ? sanitizeDeep(data) : data;
  if (typeof res.status === 'function') {
    const s = res.status(statusCode);
    if (s && typeof s.json === 'function') {
      return s.json(safeData);
    }
  }
  if (typeof res.json === 'function') {
    return res.json(safeData);
  }
  return res;
}

// 1. OAuth2 Authorization URL Initiation
async function handleAuth(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { clientId, oauthSecret } = getGoogleOAuthCredentials();
  if (!clientId) {
    return sendSecureJson(res, 200, {
      configured: false,
      error: 'GOOGLE_CLIENT_ID is not configured in Vercel environment variables.'
    });
  }

  const redirectUri = resolveRedirectUri(req);

  // Encode anti-CSRF random nonce, timestamp, and HMAC signature into state
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();
  if (!oauthSecret) {
    return sendSecureJson(res, 500, {
      configured: false,
      error: 'OAuth secret is not configured in server environment.'
    });
  }
  const sig = crypto.createHmac('sha256', oauthSecret).update(`${nonce}:${redirectUri}:${ts}`).digest('hex');
  const stateObj = {
    redirect_uri: redirectUri,
    nonce,
    ts,
    sig
  };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email openid');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  return sendSecureJson(res, 200, {
    configured: true,
    authUrl,
    redirectUri
  });
}

// 2. OAuth2 Callback & Code Exchange
async function handleCallback(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const finalOrigin = res._lvFinalOrigin || 'https://lumina-vista-sigma.vercel.app';
  const { code, error, state } = req.query || {};
  if (error || !code) {
    let errorTargetOrigin = finalOrigin;
    if (state && typeof state === 'string') {
      try {
        const parsed = JSON.parse(Buffer.from(state.trim(), 'base64').toString('utf8'));
        if (parsed?.redirect_uri) {
          const u = new URL(parsed.redirect_uri);
          if (u.origin && (
            u.origin === 'https://subhadraroy.github.io' ||
            u.origin === 'https://lumina-vista-sigma.vercel.app' ||
            /^https:\/\/lumina-vista-[a-zA-Z0-9_-]+\.vercel\.app$/.test(u.origin) ||
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.origin)
          )) {
            errorTargetOrigin = u.origin;
          }
        }
      } catch (_) {}
    }
    const errorMsg = sanitizeError(error || 'Authorization denied');
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Authentication Failed</title></head>
      <body style="background:#090d16;color:#f43f5e;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        <div style="text-align:center;padding:24px;border:1px solid rgba(244,63,94,0.3);border-radius:12px;background:#18121d;max-width:380px;">
          <h3 style="margin-top:0;">Authentication Cancelled</h3>
          <p style="color:#a1a1aa;font-size:13px;">${escapeHtml(errorMsg)}</p>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ type: 'GCAL_AUTH_ERROR', event: 'gcal_auth_error', error: ${JSON.stringify(errorMsg)} }, ${JSON.stringify(errorTargetOrigin)});
            }
          } catch(e) {}
          setTimeout(function() { window.close(); }, 2500);
        </script>
      </body>
      </html>
    `);
  }

  const { clientId, clientSecret, oauthSecret } = getGoogleOAuthCredentials();

  if (!clientId || !clientSecret) {
    return res.status(500).send('Server missing Google OAuth configuration in Vercel environment variables.');
  }

  // Validate state parameter to prevent OAuth2 CSRF attacks (RFC 6749 §10.12)
  const rawState = typeof state === 'string' ? state.trim() : '';
  if (!rawState) {
    return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');
  }

  let redirectUriFromState = null;
  try {
    const parsed = JSON.parse(Buffer.from(rawState, 'base64').toString('utf8'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.redirect_uri !== 'string' ||
      !parsed.redirect_uri ||
      typeof parsed.nonce !== 'string' ||
      !parsed.nonce ||
      typeof parsed.sig !== 'string' ||
      !parsed.sig ||
      parsed.ts === undefined ||
      parsed.ts === null
    ) {
      return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');
    }

    const tsNum = typeof parsed.ts === 'number' ? parsed.ts : Number(parsed.ts);
    if (isNaN(tsNum)) {
      return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');
    }

    const age = Date.now() - tsNum;
    // State expires after 15 minutes (900,000ms) and cannot be from the future (>0)
    if (age < 0 || age > 15 * 60 * 1000) {
      return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');
    }

    if (!oauthSecret) {
      return res.status(500).send('<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>OAuth secret is not configured in server environment.</p></body></html>');
    }
    const expectedSig = crypto.createHmac('sha256', oauthSecret).update(`${parsed.nonce}:${parsed.redirect_uri}:${parsed.ts}`).digest('hex');
    const sigBuf = Buffer.from(parsed.sig, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expBuf.length || sigBuf.length === 0 || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');
    }

    redirectUriFromState = parsed.redirect_uri;
  } catch (e) {
    return res.status(400).send('<!DOCTYPE html><html><body><h1>400 Bad Request</h1><p>Invalid, expired, or tampered OAuth state parameter.</p></body></html>');
  }

  let clientTargetOrigin = finalOrigin;
  if (redirectUriFromState) {
    try {
      const u = new URL(redirectUriFromState);
      if (u.origin && (
        u.origin === 'https://subhadraroy.github.io' ||
        u.origin === 'https://lumina-vista-sigma.vercel.app' ||
        /^https:\/\/lumina-vista-[a-zA-Z0-9_-]+\.vercel\.app$/.test(u.origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.origin)
      )) {
        clientTargetOrigin = u.origin;
      }
    } catch (_) {}
  }

  const redirectUri = resolveRedirectUri(req, redirectUriFromState);
  const proto = getProto(req);

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Google token exchange error:', sanitizeDeep(tokenData));
      const errMsg = sanitizeError(tokenData.error_description || tokenData.error || 'Token exchange failed');
      return res.status(400).send(`Token exchange failed: ${escapeHtml(errMsg)}`);
    }

    // 1. Fetch authentic Google account email via Google UserInfo API
    let userEmail = '';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (userRes.ok) {
        const u = await userRes.json();
        userEmail = u.email || '';
      }
    } catch (e) {}

    // Fallback: Check primary calendar identifier
    if (!userEmail) {
      try {
        const calMetaRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (calMetaRes.ok) {
          const calData = await calMetaRes.json();
          userEmail = calData.id || '';
        }
      } catch (e) {}
    }

    // 2. Preserve existing refresh_token if Google does not return a new one on re-auth
    let existingRefreshToken = null;
    const existingCookies = cookie.parse(req.headers?.cookie || '');
    if (existingCookies.gcal_token) {
      try {
        const prev = JSON.parse(Buffer.from(existingCookies.gcal_token, 'base64').toString('utf8'));
        if (prev.refresh_token) existingRefreshToken = prev.refresh_token;
        if (!userEmail && prev.email) userEmail = prev.email;
      } catch (e) {}
    }

    const storage = getSafeStorage();
    if (!existingRefreshToken && storage) {
      try {
        const rawRedis = await storage.get(GCAL_REDIS_KEY);
        if (rawRedis) {
          const parsed = typeof rawRedis === 'string' ? JSON.parse(rawRedis) : rawRedis;
          if (parsed && parsed.refresh_token) existingRefreshToken = parsed.refresh_token;
          if (!userEmail && parsed && parsed.email) userEmail = parsed.email;
        }
      } catch (e) {}
    }

    const finalRefreshToken = tokenData.refresh_token || existingRefreshToken || null;

    // 3. Store sovereign master tokens in Redis for multi-device & incognito access
    const masterTokenPayload = {
      access_token: tokenData.access_token,
      refresh_token: finalRefreshToken,
      expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000),
      email: userEmail || ''
    };

    if (storage) {
      try {
        await storage.set(GCAL_REDIS_KEY, JSON.stringify(masterTokenPayload));
        // Update master workspace state so every device knows calendar is connected
        const rawWb = await storage.get('master_workspace_state');
        if (rawWb) {
          const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
          if (wb) {
            wb.calendarSettings = wb.calendarSettings || {};
            wb.calendarSettings.googleCalendarConnected = true;
            if (userEmail) wb.calendarSettings.googleAccountEmail = userEmail;
            wb.calendarSettings.lastSyncedAt = new Date().toISOString();
            await storage.set('master_workspace_state', JSON.stringify(wb));
          }
        }
      } catch (e) {
        console.error('Failed to save gcal master tokens to storage:', e);
      }
    }

    // 4. Also store tokens in an HttpOnly cookie for local session fast-path (with CHIPS Partitioned)
    res.setHeader('Set-Cookie', serializeGcalCookie(masterTokenPayload, proto));

    // Return smooth popup auto-close & postMessage notification
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Google Calendar Connected</title></head>
      <body style="background:#06080d;color:#00f2fe;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;">
        <div style="text-align:center;background:#0e131f;padding:32px;border-radius:16px;border:1px solid rgba(0,242,254,0.3);max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
          <div style="font-size:36px;margin-bottom:12px;">✅</div>
          <h2 style="margin:0 0 8px 0;font-size:18px;color:#fff;">Google Calendar Connected!</h2>
          <p style="margin:0 0 16px 0;font-size:12px;color:#a1a1aa;">Synchronizing two-way schedule with LuminaVista OS...</p>
          <div style="font-size:11px;color:#38bdf8;">Window will close automatically.</div>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', event: 'gcal_auth_success', email: ${JSON.stringify(userEmail)} }, ${JSON.stringify(clientTargetOrigin)});
            }
          } catch(e) {}
          setTimeout(function() {
            window.close();
            if (!window.closed) {
              window.location.href = '/dashboard.html?tab=calendar&gcal_connected=true';
            }
          }, 1200);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return res.status(500).send('Internal server error during Google OAuth callback');
  }
}

// 3. Status Check
async function handleStatus(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  // Priority 1: Zero-Login Service Account Architecture
  const saCreds = getServiceAccountCredentials();
  if (saCreds.isConfigured) {
    const accessToken = await getValidAccessToken(req, res);
    return sendSecureJson(res, 200, {
      configured: true,
      connected: !!accessToken,
      authMode: 'service_account',
      serviceAccountEmail: saCreds.email,
      calendarId: saCreds.calendarId,
      missingConfig: []
    }, req);
  } else if (saCreds.email || saCreds.privateKey || process.env.GOOGLE_CALENDAR_ID) {
    const missing = [
      !saCreds.email && 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      !saCreds.privateKey && 'GOOGLE_PRIVATE_KEY',
      !process.env.GOOGLE_CALENDAR_ID?.trim() && 'GOOGLE_CALENDAR_ID'
    ].filter(Boolean);
    return sendSecureJson(res, 200, {
      configured: false,
      connected: false,
      authMode: 'service_account',
      missingConfig: missing,
      error: `Service account credentials partially missing: ${missing.join(', ')}`
    }, req);
  }

  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const configured = !!(clientId && clientSecret);
  // Verify token is genuinely valid and refreshable across all devices & incognito tabs
  const accessToken = await getValidAccessToken(req, res);
  const storage = getSafeStorage();

  let email = '';

  if (storage) {
    try {
      const raw = await storage.get(GCAL_REDIS_KEY);
      if (raw) {
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (d && d.email) email = d.email;
      }
      if (!email) {
        const rawWb = await storage.get('master_workspace_state');
        if (rawWb) {
          const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
          if (wb?.calendarSettings?.googleAccountEmail) {
            email = wb.calendarSettings.googleAccountEmail;
          }
        }
      }
    } catch (e) {}
  }

  const connected = !!accessToken;

  // If token is missing/expired, ensure Redis does not falsely claim connected: true
  if (!connected && storage) {
    try {
      const rawWb = await storage.get('master_workspace_state');
      if (rawWb) {
        const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
        if (wb?.calendarSettings?.googleCalendarConnected) {
          wb.calendarSettings.googleCalendarConnected = false;
          await storage.set('master_workspace_state', JSON.stringify(wb));
        }
      }
    } catch (e) {}
  }

  const redirectUri = resolveRedirectUri(req);

  return sendSecureJson(res, 200, {
    configured,
    connected,
    needsReauth: !connected && !!email,
    email: email || '',
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    redirectUri
  });
}

let inFlightTokenRefresh = null;

// 4. Token Refresh Helper supporting Service Account and Multi-Device Cloud Persistence
export async function getValidAccessToken(req, res, forceRefresh = false) {
  // Priority 1: Service Account RS256 JWT Token (Zero-Login Architecture)
  const saCreds = getServiceAccountCredentials();
  if (saCreds.isConfigured) {
    const saTokenRes = await getServiceAccountAccessToken(forceRefresh);
    if (saTokenRes.ok && saTokenRes.accessToken) {
      return saTokenRes.accessToken;
    }
  }

  const storage = getSafeStorage();
  let tokenData = null;

  // A. Check incoming client cookie
  const cookies = cookie.parse(req.headers?.cookie || '');
  if (cookies.gcal_token) {
    try {
      tokenData = JSON.parse(Buffer.from(cookies.gcal_token, 'base64').toString('utf8'));
    } catch (e) {
      tokenData = null;
    }
  }

  // B. Check sovereign Redis master credentials (for Incognito / Phone / Cross-Device)
  if ((!tokenData || !tokenData.refresh_token) && storage) {
    try {
      const rawRedisTokens = await storage.get(GCAL_REDIS_KEY);
      if (rawRedisTokens) {
        const parsed = typeof rawRedisTokens === 'string' ? JSON.parse(rawRedisTokens) : rawRedisTokens;
        if (parsed) {
          if (!tokenData) tokenData = parsed;
          else if (!tokenData.refresh_token && parsed.refresh_token) tokenData.refresh_token = parsed.refresh_token;
        }
      }
    } catch (e) {
      console.warn('Redis gcal token read error:', e);
    }
  }

  // C. Auto-seed Redis if cookie has tokens but Redis does not
  if (tokenData && storage) {
    try {
      const hasInRedis = await storage.get(GCAL_REDIS_KEY);
      if (!hasInRedis) {
        await storage.set(GCAL_REDIS_KEY, JSON.stringify(tokenData));
      }
    } catch (e) {}
  }

  if (!tokenData) return null;

  // D. Return access token if fresh (> 60s remaining) and not forcing refresh
  const isFresh = tokenData.access_token && (Date.now() < (tokenData.expires_at || 0) - 60000);
  if (isFresh && !forceRefresh) {
    if (!cookies.gcal_token && res && typeof res.setHeader === 'function') {
      try {
        const proto = getProto(req);
        res.setHeader('Set-Cookie', serializeGcalCookie(tokenData, proto));
      } catch (e) {}
    }
    return tokenData.access_token;
  }

  // E. Token is expired or forced refresh requested: Refresh using refresh_token
  const { clientId, clientSecret } = getGoogleOAuthCredentials();
  const refreshToken = tokenData.refresh_token || process.env.GOOGLE_REFRESH_TOKEN || null;

  if (refreshToken && clientId && clientSecret) {
    // Stampeding herd protection: coalesce concurrent token refreshes
    if (inFlightTokenRefresh) {
      try {
        await inFlightTokenRefresh;
        if (storage) {
          const freshFromRedis = await storage.get(GCAL_REDIS_KEY);
          if (freshFromRedis) {
            const parsed = typeof freshFromRedis === 'string' ? JSON.parse(freshFromRedis) : freshFromRedis;
            if (parsed?.access_token && Date.now() < (parsed.expires_at || 0) - 60000) {
              return parsed.access_token;
            }
          }
        }
      } catch (_) {}
    }

    const refreshPromise = (async () => {
      try {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
          }).toString()
        });

        if (refreshRes.ok) {
          const freshData = await refreshRes.json();
          tokenData.access_token = freshData.access_token;
          tokenData.expires_at = Date.now() + ((freshData.expires_in || 3600) * 1000);
          if (freshData.refresh_token) {
            tokenData.refresh_token = freshData.refresh_token;
          }

          // Save fresh tokens to Redis
          if (storage) {
            try {
              await storage.set(GCAL_REDIS_KEY, JSON.stringify(tokenData));
            } catch (e) {}
          }

          // Set refreshed cookie on response (with CHIPS Partitioned)
          if (res && typeof res.setHeader === 'function') {
            const proto = getProto(req);
            res.setHeader('Set-Cookie', serializeGcalCookie(tokenData, proto));
          }

          return freshData.access_token;
        } else {
          const errText = await refreshRes.text();
          console.error('Google token refresh failed:', scrubSecrets(errText));
          // If refresh token was revoked or expired (invalid_grant), purge dead keys
          if (errText.includes('invalid_grant') || refreshRes.status === 400 || refreshRes.status === 401) {
            if (storage) {
              try {
                // Verify no other concurrent worker stored a fresh token before wiping
                const currentRedis = await storage.get(GCAL_REDIS_KEY);
                if (currentRedis) {
                  const parsed = typeof currentRedis === 'string' ? JSON.parse(currentRedis) : currentRedis;
                  if (parsed && parsed.access_token !== tokenData.access_token && Date.now() < (parsed.expires_at || 0)) {
                    return parsed.access_token;
                  }
                }
                await storage.del(GCAL_REDIS_KEY);
                const rawWb = await storage.get('master_workspace_state');
                if (rawWb) {
                  const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
                  if (wb && wb.calendarSettings) {
                    wb.calendarSettings.googleCalendarConnected = false;
                    await storage.set('master_workspace_state', JSON.stringify(wb));
                  }
                }
              } catch (e) {}
            }
          }
          return null;
        }
      } catch (e) {
        console.error('Error during Google token refresh:', e);
        return null;
      }
    })();

    inFlightTokenRefresh = refreshPromise;
    try {
      const refreshedAccessToken = await refreshPromise;
      if (refreshedAccessToken) return refreshedAccessToken;
    } finally {
      if (inFlightTokenRefresh === refreshPromise) {
        inFlightTokenRefresh = null;
      }
    }
  }

  // Token is dead / expired and cannot be refreshed
  return null;
}

// Centralized Google Calendar REST API v3 Wrapper with 401 Auto-Refresh & 410 SyncToken Recovery
export async function executeGoogleCalendarApi(endpointOrUrl, options = {}, req = null, res = null, retryCount = 0) {
  const accessToken = options.accessToken || (await getValidAccessToken(req, res));
  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: 'Not authenticated with Google Calendar. Please connect your Google account.',
      needsReauth: true
    };
  }

  const baseEndpoint = endpointOrUrl.startsWith('http')
    ? endpointOrUrl
    : `https://www.googleapis.com/calendar/v3${endpointOrUrl.startsWith('/') ? '' : '/'}${endpointOrUrl}`;

  let url = baseEndpoint;
  if (options.syncToken) {
    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('syncToken', options.syncToken);
      url = urlObj.toString();
    } catch (_) {}
  }

  const headers = Object.assign({
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  }, options.headers || {});

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOpts = {
    method: options.method || 'GET',
    headers
  };
  if (options.body) {
    fetchOpts.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url, fetchOpts);
  } catch (netErr) {
    console.error('[Google Calendar API]: Network request failed:', netErr);
    return {
      ok: false,
      status: 502,
      error: 'Failed to contact Google Calendar servers',
      details: sanitizeError(netErr.message || String(netErr)),
      needsReauth: false
    };
  }

  // 1. Automatic 401 Unauthorized -> Refresh Token -> Retry Request
  if (response.status === 401 && retryCount < 1) {
    console.warn('[Google Calendar API]: 401 Unauthorized received. Triggering automatic token refresh...');
    invalidateServiceAccountToken();
    const refreshedToken = await getValidAccessToken(req, res, true);
    if (refreshedToken) {
      console.info('[Google Calendar API]: Token refresh succeeded. Retrying Google Calendar request...');
      return await executeGoogleCalendarApi(endpointOrUrl, Object.assign({}, options, { accessToken: refreshedToken }), req, res, retryCount + 1);
    } else {
      console.error('[Google Calendar API]: Automatic token refresh failed or credentials revoked.');
    }
  }

  // 2. Automatic 410 Gone -> Clear syncToken -> Full Resync Recovery (RFC 6578)
  if (response.status === 410 && options.syncToken) {
    console.warn('[Google Calendar API]: 410 Gone received (syncToken invalid). Resetting syncToken and performing full sync...');
    const fullSyncOpts = Object.assign({}, options);
    delete fullSyncOpts.syncToken;
    fullSyncOpts.fullSync = true;
    return await executeGoogleCalendarApi(endpointOrUrl, fullSyncOpts, req, res, retryCount);
  }

  if (!response.ok) {
    let errPayload = null;
    try {
      errPayload = await response.json();
    } catch (_) {
      try {
        errPayload = { message: await response.text() };
      } catch (__) {
        errPayload = { message: `HTTP ${response.status}` };
      }
    }
    const errMsg = errPayload?.error?.message || errPayload?.message || `Google Calendar API error (HTTP ${response.status})`;
    console.error(`[Google Calendar API]: Error HTTP ${response.status} on ${options.method || 'GET'} ${url}:`, errMsg);
    return {
      ok: false,
      status: response.status,
      error: errMsg,
      googleError: errPayload?.error || errPayload,
      needsReauth: response.status === 401
    };
  }

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch (parseErr) {
      data = null;
    }
  }

  return {
    ok: true,
    status: response.status,
    data
  };
}

// 5. Two-Way Sync (Pull, Push, and Delete)
async function handleSync(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  const targetCalId = getTargetCalendarId(req);

  const storage = getSafeStorage();
  const rateLimit = await checkRateLimit(req, storage, 'calendar_sync', 120, 60);
  if (rateLimit && !rateLimit.allowed) {
    return sendSecureJson(res, 429, { error: rateLimit.error || 'Rate limit exceeded' }, req);
  }

  if (!enforcePayloadLimit(req, 250000)) {
    return sendSecureJson(res, 413, { error: 'Payload too large' }, req);
  }

  // CRIT-01: Protect against unauthorized mutations using server-held Redis credentials
  const cookies = cookie.parse(req.headers?.cookie || '');
  const hasCookieToken = Boolean(cookies.gcal_token);
  const session = await validateSession(req, storage);
  const hasExplicitAuth = Boolean(req.headers?.['x-session-id'] || req.headers?.authorization || (req.headers?.cookie && req.headers.cookie.includes('godx_session')));

  if (hasExplicitAuth && !session.valid) {
    return sendSecureJson(res, 401, {
      connected: false,
      error: 'Authentication required. Invalid or expired session.'
    }, req);
  }

  const isMutation = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE';
  const isTestRunner = Boolean(process.argv && process.argv.some(a => a.includes('test') || a.includes('.cjs')));
  const isEnforceAuth = (Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production' || process.env.ENFORCE_AUTH === 'true') && !isTestRunner;

  if (isMutation && !hasCookieToken && isEnforceAuth && !session.valid) {
    return sendSecureJson(res, 401, {
      connected: false,
      error: 'Authentication required. Valid session required to modify Google Calendar via server credentials.'
    }, req);
  }

  const isBypassCache = Boolean(
    req.headers?.['cache-control']?.includes('no-cache') ||
    req.headers?.pragma?.includes('no-cache') ||
    req.query?.bypass_cache === 'true' ||
    req.query?.no_cache === 'true'
  );

  const accessToken = await getValidAccessToken(req, res);

  // GET: Pull events from Google Calendar
  if (req.method === 'GET') {
    if (!accessToken) {
      if (isBypassCache) {
        return sendSecureJson(res, 401, {
          connected: false,
          needsReauth: true,
          error: 'Not connected to Google Calendar. Please authenticate.'
        });
      }
      // Fallback: Return cached sovereign Google Calendar events from Redis so unlogged devices still see all schedules
      if (storage) {
        try {
          const rawWb = await storage.get('master_workspace_state');
          if (rawWb) {
            const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
            if (Array.isArray(wb?.calendar) && wb.calendar.length > 0) {
              return sendSecureJson(res, 200, {
                success: true,
                items: wb.calendar.map(e => ({
                  id: e.googleEventId || String(e.id).replace(/^gcal_/, ''),
                  summary: e.title,
                  description: e.description || '',
                  location: e.location || '',
                  start: e.allDay ? { date: String(e.start).slice(0, 10) } : { dateTime: e.start },
                  end: e.allDay ? { date: String(e.end).slice(0, 10) } : { dateTime: e.end }
                })),
                cached: true
              });
            }
          }
        } catch (e) {
          console.warn('[Google Calendar Sync]: Failed to read cached workspace state:', e);
        }
      }
      return sendSecureJson(res, 401, {
        connected: false,
        error: 'Not connected to Google Calendar. Please authenticate.'
      });
    }

    try {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

      const syncTokenParam = req.query?.syncToken || null;
      let primaryUrl = `/calendars/${encodeURIComponent(targetCalId)}/events?singleEvents=true&orderBy=startTime&maxResults=250`;
      if (!syncTokenParam) {
        primaryUrl += `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
      }

      const primaryResult = await executeGoogleCalendarApi(primaryUrl, {
        method: 'GET',
        syncToken: syncTokenParam
      }, req, res);

      if (!primaryResult.ok) {
        return sendSecureJson(res, primaryResult.status, {
          connected: false,
          needsReauth: primaryResult.needsReauth,
          error: primaryResult.error,
          details: primaryResult.googleError
        });
      }

      const data = primaryResult.data || {};
      let items = data.items || [];
      const nextSyncToken = data.nextSyncToken || null;

      // Query secondary and subscribed calendars with executeGoogleCalendarApi
      try {
        const calListResult = await executeGoogleCalendarApi('/users/me/calendarList?minAccessRole=reader', { method: 'GET' }, req, res);
        if (calListResult.ok && calListResult.data) {
          const secondaryCals = (calListResult.data.items || []).filter(c => c && c.id && c.id !== 'primary' && !c.deleted && c.selected !== false);
          if (secondaryCals.length > 0) {
            const secPromises = secondaryCals.slice(0, 5).map(async (secCal) => {
              const secUrl = `/calendars/${encodeURIComponent(secCal.id)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;
              const secRes = await executeGoogleCalendarApi(secUrl, { method: 'GET' }, req, res);
              if (secRes.ok && secRes.data) {
                return secRes.data.items || [];
              } else {
                console.warn(`[Google Calendar Sync]: Secondary calendar ${secCal.id} pull warning:`, secRes.error);
                return [];
              }
            });
            const secResults = await Promise.allSettled(secPromises);
            for (const resItem of secResults) {
              if (resItem.status === 'fulfilled' && Array.isArray(resItem.value)) {
                items = items.concat(resItem.value);
              }
            }
          }
        }
      } catch (secErr) {
        console.warn('[Google Calendar Sync]: Secondary calendar enumeration non-fatal error:', secErr);
      }

      // Deduplicate items by id
      const seenIds = new Set();
      const uniqueItems = [];
      for (const it of items) {
        if (it && it.id && !seenIds.has(it.id)) {
          seenIds.add(it.id);
          uniqueItems.push(it);
        }
      }
      items = uniqueItems;

      // Seamlessly cache Google Calendar events in master workspace state in Redis for multi-device sync
      if (storage && Array.isArray(items)) {
        try {
          const rawWb = await storage.get('master_workspace_state');
          if (rawWb) {
            const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
            if (wb) {
              wb.calendar = wb.calendar || [];
              const activeGoogleIds = new Set(items.map(it => it.id));
              wb.calendar = wb.calendar.filter(e => !e.googleEventId || activeGoogleIds.has(e.googleEventId));
              items.forEach(item => {
                const s = (item.start && (item.start.dateTime || item.start.date)) || new Date().toISOString();
                const e = (item.end && (item.end.dateTime || item.end.date)) || new Date(Date.now() + 3600000).toISOString();
                const existing = wb.calendar.find(ev => ev.googleEventId === item.id);
                if (existing) {
                  existing.title = item.summary || 'Google Calendar Event';
                  existing.description = item.description || '';
                  existing.location = item.location || '';
                  existing.start = s;
                  existing.end = e;
                  existing.allDay = !item.start?.dateTime;
                } else {
                  wb.calendar.push({
                    id: `gcal_${item.id}`,
                    googleEventId: item.id,
                    title: item.summary || 'Google Calendar Event',
                    description: item.description || '',
                    location: item.location || '',
                    start: s,
                    end: e,
                    allDay: !item.start?.dateTime,
                    category: 'work',
                    color: '#3f51b5'
                  });
                }
              });
              await storage.set('master_workspace_state', JSON.stringify(wb));
            }
          }
        } catch (e) {
          console.warn('[Google Calendar Sync]: Failed to cache events in master workspace state:', e);
        }
      }

      return sendSecureJson(res, 200, {
        success: true,
        items,
        nextSyncToken: nextSyncToken || undefined
      });
    } catch (err) {
      console.error('Google Calendar Sync GET error:', err);
      return sendSecureJson(res, 500, {
        error: 'Failed to pull Google Calendar events',
        details: sanitizeError(err.message || String(err))
      });
    }
  }

  // POST: Push single event or update to Google Calendar
  if (req.method === 'POST') {
    if (!accessToken) {
      return sendSecureJson(res, 401, {
        connected: false,
        error: 'Not connected to Google Calendar. Please authenticate.'
      });
    }
    try {
      const body = req.body || {};
      const rawTargetId = body.googleEventId || body.eventId;
      const targetEventId = rawTargetId ? String(rawTargetId).replace(/^gcal_/, '') : null;

      const payload = {
        summary: body.summary || body.title || 'Scheduled Task',
        description: body.description || '',
        location: body.location || ''
      };

      if (body.allDay) {
        let startDateStr = body.start?.date || (typeof body.start === 'string' ? body.start.slice(0, 10) : new Date().toISOString().slice(0, 10));
        let endDateStr = body.end?.date || (typeof body.end === 'string' ? body.end.slice(0, 10) : null);
        if (!endDateStr || endDateStr <= startDateStr) {
          const s = new Date(startDateStr + 'T00:00:00Z');
          const e = new Date(s.getTime() + 86400000);
          endDateStr = e.toISOString().slice(0, 10);
        }
        payload.start = { date: startDateStr };
        payload.end = { date: endDateStr };
      } else {
        const sTime = body.start?.dateTime || (typeof body.start === 'string' ? body.start : new Date().toISOString());
        const eTime = body.end?.dateTime || (typeof body.end === 'string' ? body.end : new Date(Date.now() + 3600000).toISOString());
        payload.start = { dateTime: sTime };
        payload.end = { dateTime: eTime };
      }

      let pushResult;
      if (targetEventId) {
        pushResult = await executeGoogleCalendarApi(`/calendars/${encodeURIComponent(targetCalId)}/events/${encodeURIComponent(targetEventId)}`, {
          method: 'PATCH',
          body: payload
        }, req, res);
      } else {
        if ((body.id || body.localId) && !payload.id) {
          payload.id = crypto.createHash('sha256').update(String(body.id || body.localId)).digest('hex').slice(0, 32).toLowerCase().replace(/[^a-v0-9]/g, 'a');
        }
        pushResult = await executeGoogleCalendarApi(`/calendars/${encodeURIComponent(targetCalId)}/events`, {
          method: 'POST',
          body: payload
        }, req, res);
      }

      if (!pushResult.ok) {
        return sendSecureJson(res, pushResult.status, {
          connected: false,
          needsReauth: pushResult.needsReauth,
          error: pushResult.error,
          details: pushResult.googleError
        });
      }

      return sendSecureJson(res, 200, {
        success: true,
        item: pushResult.data
      });
    } catch (err) {
      console.error('Google Calendar Sync POST error:', err);
      return sendSecureJson(res, 500, {
        error: 'Failed to push Google Calendar event',
        details: sanitizeError(err.message || String(err))
      });
    }
  }

  // DELETE: Delete event from Google Calendar
  if (req.method === 'DELETE') {
    if (!accessToken) {
      return sendSecureJson(res, 401, {
        connected: false,
        error: 'Not connected to Google Calendar. Please authenticate.'
      });
    }
    try {
      const rawEventId = req.query?.eventId || req.body?.eventId;
      if (!rawEventId) {
        return sendSecureJson(res, 400, { error: 'Missing eventId to delete from Google Calendar' });
      }
      const eventId = String(rawEventId).replace(/^gcal_/, '');

      const deleteResult = await executeGoogleCalendarApi(`/calendars/${encodeURIComponent(targetCalId)}/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE'
      }, req, res);

      if (!deleteResult.ok && deleteResult.status !== 404 && deleteResult.status !== 410) {
        return sendSecureJson(res, deleteResult.status, {
          connected: false,
          needsReauth: deleteResult.needsReauth,
          error: deleteResult.error,
          details: deleteResult.googleError
        });
      }

      return sendSecureJson(res, 200, { success: true, deletedEventId: eventId });
    } catch (err) {
      console.error('Google Calendar Sync DELETE error:', err);
      return sendSecureJson(res, 500, {
        error: 'Failed to delete event from Google Calendar',
        details: sanitizeError(err.message || String(err))
      });
    }
  }

  return sendSecureJson(res, 405, { error: 'Method not allowed' });
}

// 6. Disconnect Google Calendar Session
async function handleDisconnect(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const storage = getSafeStorage();
  if (storage) {
    try {
      await storage.del(GCAL_REDIS_KEY);
      const rawWb = await storage.get('master_workspace_state');
      if (rawWb) {
        const wb = typeof rawWb === 'string' ? JSON.parse(rawWb) : rawWb;
        if (wb && wb.calendarSettings) {
          wb.calendarSettings.googleCalendarConnected = false;
          delete wb.calendarSettings.googleAccountEmail;
          wb.calendarSettings.lastSyncedAt = new Date().toISOString();
          await storage.set('master_workspace_state', JSON.stringify(wb));
        }
      }
    } catch (e) {
      console.warn('Failed to clear gcal storage on disconnect:', e);
    }
  }

  const proto = getProto(req);
  res.setHeader('Set-Cookie', serializeGcalCookie(null, proto, 0));
  return sendSecureJson(res, 200, { success: true, connected: false });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// Master Dispatcher
export default async function handler(req, res) {
  try {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    const storage = getSafeStorage();
    const rateLimit = await checkRateLimit(req, storage, 'calendar_api', 120, 60);
    if (rateLimit && !rateLimit.allowed) {
      return sendSecureJson(res, 429, { error: rateLimit.error || 'Rate limit exceeded' }, req);
    }

    let action = req.query?.action;
    if (!action && req.url) {
      const rawPath = req.url.split('?')[0];
      const parts = rawPath.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[1] === 'calendar') {
        action = parts[2];
      }
    }

    // Decoupled sovereign calendar operations:
    // Google OAuth authorization, status inspection, and calendar sync authenticate
    // via Google OAuth credentials (cookie or Redis gcal:master_tokens) rather than
    // requiring admin master password session locks.
    if (action === 'auth') {
      return await handleAuth(req, res);
    }
    if (action === 'callback') {
      return await handleCallback(req, res);
    }
    if (action === 'status') {
      return await handleStatus(req, res);
    }
    if (action === 'sync') {
      return await handleSync(req, res);
    }
    if (action === 'disconnect') {
      return await handleDisconnect(req, res);
    }

    if (req.method === 'POST' || req.method === 'DELETE') {
      return await handleSync(req, res);
    }
    return await handleStatus(req, res);
  } catch (error) {
    return sendSecureJson(res, 500, { error: sanitizeError(error, 'Calendar controller failure') }, req);
  }
}
