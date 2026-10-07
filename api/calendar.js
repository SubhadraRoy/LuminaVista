// api/calendar.js - Consolidated Sovereign Google Calendar Serverless Controller
// Unifies auth, callback, status, and sync into ONE single Serverless Function
// Keeps total deployment functions well below Vercel Hobby's 12-function limit.

import cookie from 'cookie';
import { sendSecureJson, sanitizeError, setSecurityHeaders, validateSession } from './_lib/auth-guard.js';
import { getSafeStorage } from './_lib/redis.js';

const GCAL_REDIS_KEY = 'gcal:master_tokens';

// Helper to set robust CORS headers across edge and serverless environments
function setCorsHeaders(req, res) {
  if (!res || typeof res.setHeader !== 'function') return;
  setSecurityHeaders(res);
  const origin = req?.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, x-session-id');
}

// 1. OAuth2 Authorization URL Initiation
async function handleAuth(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return sendSecureJson(res, 200, {
      configured: false,
      error: 'GOOGLE_CLIENT_ID is not configured in Vercel environment variables.'
    });
  }

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

  // Encode redirect_uri into state so the callback exchange is guaranteed to match
  const stateObj = {
    redirect_uri: redirectUri,
    ts: Date.now()
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

  const { code, error, state } = req.query || {};
  if (error || !code) {
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
          try { if (window.opener) window.opener.postMessage({ type: 'GCAL_AUTH_ERROR', error: ${JSON.stringify(errorMsg)} }, '*'); } catch(e) {}
          setTimeout(function() { window.close(); }, 2500);
        </script>
      </body>
      </html>
    `);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send('Server missing Google OAuth configuration in Vercel environment variables.');
  }

  let redirectUriFromState = null;
  if (state) {
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      if (parsed.redirect_uri) redirectUriFromState = parsed.redirect_uri;
    } catch (e) {}
  }

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = redirectUriFromState || process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

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
      console.error('Google token exchange error:', tokenData);
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

    // 4. Also store tokens in an HttpOnly cookie for local session fast-path
    res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(masterTokenPayload)).toString('base64'), {
      httpOnly: true,
      secure: proto === 'https',
      sameSite: proto === 'https' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    }));

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
              window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS', email: ${JSON.stringify(userEmail)} }, '*');
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

  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
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

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

  return sendSecureJson(res, 200, {
    configured,
    connected,
    needsReauth: !connected && !!email,
    email: email || '',
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  });
}

// 4. Token Refresh Helper with Sovereign Multi-Device Cloud Persistence
async function getValidAccessToken(req, res, forceRefresh = false) {
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
        const proto = req.headers['x-forwarded-proto'] || 'https';
        res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(tokenData)).toString('base64'), {
          httpOnly: true,
          secure: proto === 'https',
          sameSite: proto === 'https' ? 'none' : 'lax',
          maxAge: 30 * 24 * 60 * 60,
          path: '/'
        }));
      } catch (e) {}
    }
    return tokenData.access_token;
  }

  // E. Token is expired or forced refresh requested: Refresh using refresh_token
  const refreshToken = tokenData.refresh_token || process.env.GOOGLE_REFRESH_TOKEN || null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
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

        // Set refreshed cookie on response
        if (res && typeof res.setHeader === 'function') {
          const proto = req.headers['x-forwarded-proto'] || 'https';
          res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(tokenData)).toString('base64'), {
            httpOnly: true,
            secure: proto === 'https',
            sameSite: proto === 'https' ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60,
            path: '/'
          }));
        }

        return freshData.access_token;
      } else {
        const errText = await refreshRes.text();
        console.error('Google token refresh failed:', errText);
        // If refresh token was revoked or expired (invalid_grant), purge dead keys
        if (errText.includes('invalid_grant') || refreshRes.status === 400 || refreshRes.status === 401) {
          if (storage) {
            try {
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
      }
    } catch (e) {
      console.error('Error during Google token refresh:', e);
    }
  }

  // Token is dead / expired and cannot be refreshed
  return null;
}

// 5. Two-Way Sync (Pull, Push, and Delete)
async function handleSync(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const accessToken = await getValidAccessToken(req, res);

  // GET: Pull events from Google Calendar
  if (req.method === 'GET') {
    if (!accessToken) {
      // Fallback: Return cached sovereign Google Calendar events from Redis so unlogged devices still see all schedules
      const storage = getSafeStorage();
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
        } catch (e) {}
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

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;

      let gcalRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!gcalRes.ok && gcalRes.status === 401) {
        // Token rejected by Google: force refresh and retry once
        const refreshedToken = await getValidAccessToken(req, res, true);
        if (refreshedToken) {
          gcalRes = await fetch(url, {
            headers: { Authorization: `Bearer ${refreshedToken}` }
          });
        }
      }

      if (!gcalRes.ok) {
        const errText = await gcalRes.text();
        return sendSecureJson(res, gcalRes.status, {
          connected: false,
          needsReauth: gcalRes.status === 401,
          error: 'Failed to fetch from Google Calendar',
          details: sanitizeError(errText)
        });
      }

      const data = await gcalRes.json();
      const items = data.items || [];

      // Seamlessly cache Google Calendar events in master workspace state in Redis for multi-device sync
      const storage = getSafeStorage();
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
        } catch (e) {}
      }

      return sendSecureJson(res, 200, {
        success: true,
        items
      });
    } catch (err) {
      console.error('Google Calendar Sync GET error:', err);
      return sendSecureJson(res, 500, { error: 'Failed to pull Google Calendar events' });
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
        payload.start = body.start || { dateTime: new Date().toISOString() };
        payload.end = body.end || { dateTime: new Date(Date.now() + 3600000).toISOString() };
      }

      let gcalRes;
      if (targetEventId) {
        // Update existing event
        gcalRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(targetEventId)}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Create new event
        gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }

      if (!gcalRes.ok && gcalRes.status === 401) {
        const refreshedToken = await getValidAccessToken(req, res, true);
        if (refreshedToken) {
          const retryMethod = targetEventId ? 'PATCH' : 'POST';
          const retryUrl = targetEventId 
            ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(targetEventId)}`
            : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
          gcalRes = await fetch(retryUrl, {
            method: retryMethod,
            headers: {
              Authorization: `Bearer ${refreshedToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });
        }
      }

      if (!gcalRes.ok) {
        const errText = await gcalRes.text();
        return sendSecureJson(res, gcalRes.status, {
          connected: false,
          needsReauth: gcalRes.status === 401,
          error: 'Failed to push to Google Calendar',
          details: sanitizeError(errText)
        });
      }

      const createdItem = await gcalRes.json();
      return sendSecureJson(res, 200, {
        success: true,
        item: createdItem
      });
    } catch (err) {
      console.error('Google Calendar Sync POST error:', err);
      return sendSecureJson(res, 500, { error: 'Failed to push Google Calendar event' });
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

      let gcalRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!gcalRes.ok && gcalRes.status === 401) {
        const refreshedToken = await getValidAccessToken(req, res, true);
        if (refreshedToken) {
          gcalRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${refreshedToken}` }
          });
        }
      }

      if (!gcalRes.ok && gcalRes.status !== 404 && gcalRes.status !== 410) {
        const errText = await gcalRes.text();
        return sendSecureJson(res, gcalRes.status, {
          connected: false,
          needsReauth: gcalRes.status === 401,
          error: 'Failed to delete Google Calendar event',
          details: sanitizeError(errText)
        });
      }

      return sendSecureJson(res, 200, { success: true, deletedEventId: eventId });
    } catch (err) {
      console.error('Google Calendar Sync DELETE error:', err);
      return sendSecureJson(res, 500, { error: 'Failed to delete event from Google Calendar' });
    }
  }

  return sendSecureJson(res, 405, { error: 'Method not allowed' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// Master Dispatcher
export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  let action = req.query?.action;
  if (!action && req.url) {
    const rawPath = req.url.split('?')[0];
    const parts = rawPath.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[1] === 'calendar') {
      action = parts[2];
    }
  }

  if (action !== 'callback') {
    const storage = getSafeStorage();
    const auth = await validateSession(req, storage);
    if (!auth.valid) {
      return sendSecureJson(res, auth.status || 401, { error: auth.error || 'Unauthorized' });
    }
    if (auth.role !== 'master') {
      return sendSecureJson(res, 403, { error: 'Forbidden: Master Administrator access required for calendar.' });
    }
  }

  if (action === 'auth') {
    return handleAuth(req, res);
  }
  if (action === 'callback') {
    return handleCallback(req, res);
  }
  if (action === 'status') {
    return handleStatus(req, res);
  }
  if (action === 'sync') {
    return handleSync(req, res);
  }

  if (req.method === 'POST' || req.method === 'DELETE') {
    return handleSync(req, res);
  }
  return handleStatus(req, res);
}
