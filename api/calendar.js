// api/calendar.js - Consolidated Sovereign Google Calendar Serverless Controller
// Unifies auth, callback, status, and sync into ONE single Serverless Function
// Keeps total deployment functions well below Vercel Hobby's 12-function limit.

import cookie from 'cookie';

// Helper to set robust CORS headers across edge and serverless environments
function setCorsHeaders(req, res) {
  if (!res || typeof res.setHeader !== 'function') return;
  const origin = req?.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
}

// 1. OAuth2 Authorization URL Initiation
async function handleAuth(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(200).json({
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

  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

  return res.status(200).json({
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
    const errorMsg = error || 'Authorization denied';
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
    return res.status(500).send('Server missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in Vercel environment variables.');
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
      const errMsg = tokenData.error_description || tokenData.error || 'Token exchange failed';
      return res.status(400).send(`Token exchange failed: ${errMsg}`);
    }

    // Preserve existing refresh_token if Google does not return a new one on re-auth
    let existingRefreshToken = null;
    const existingCookies = cookie.parse(req.headers?.cookie || '');
    if (existingCookies.gcal_token) {
      try {
        const prev = JSON.parse(Buffer.from(existingCookies.gcal_token, 'base64').toString('utf8'));
        if (prev.refresh_token) existingRefreshToken = prev.refresh_token;
      } catch (e) {}
    }

    const finalRefreshToken = tokenData.refresh_token || existingRefreshToken || null;

    // Store tokens securely in an HttpOnly cookie
    const tokenPayload = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: finalRefreshToken,
      expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000)
    });

    res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(tokenPayload).toString('base64'), {
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
              window.opener.postMessage({ type: 'GCAL_AUTH_SUCCESS' }, '*');
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
  // Verify token is genuinely valid and refreshable
  const accessToken = await getValidAccessToken(req, res);
  const connected = !!accessToken;
  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const host = rawHost.split(',')[0].trim();
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

  return res.status(200).json({
    configured,
    connected,
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  });
}

// 4. Token Refresh Helper
async function getValidAccessToken(req, res) {
  const cookies = cookie.parse(req.headers?.cookie || '');
  if (!cookies.gcal_token) return null;

  try {
    const tokenData = JSON.parse(Buffer.from(cookies.gcal_token, 'base64').toString('utf8'));
    if (Date.now() < (tokenData.expires_at || 0) - 60000) {
      return tokenData.access_token;
    }

    if (tokenData.refresh_token && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token'
        }).toString()
      });

      if (refreshRes.ok) {
        const freshData = await refreshRes.json();
        tokenData.access_token = freshData.access_token;
        tokenData.expires_at = Date.now() + ((freshData.expires_in || 3600) * 1000);

        const rawHost = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
        const host = rawHost.split(',')[0].trim();
        const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');

        res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(tokenData)).toString('base64'), {
          httpOnly: true,
          secure: proto === 'https',
          sameSite: proto === 'https' ? 'none' : 'lax',
          maxAge: 30 * 24 * 60 * 60,
          path: '/'
        }));

        return freshData.access_token;
      }
    }

    // Do NOT return expired token if refresh failed or no refresh token is present
    return null;
  } catch (e) {
    return null;
  }
}

// 5. Two-Way Sync (Pull, Push, and Delete)
async function handleSync(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const accessToken = await getValidAccessToken(req, res);

  if (!accessToken) {
    return res.status(401).json({
      connected: false,
      error: 'Not connected to Google Calendar. Please authenticate.'
    });
  }

  // GET: Pull events from Google Calendar
  if (req.method === 'GET') {
    try {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;

      const gcalRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!gcalRes.ok) {
        const errText = await gcalRes.text();
        return res.status(gcalRes.status).json({ error: 'Failed to fetch from Google Calendar', details: errText });
      }

      const data = await gcalRes.json();
      return res.status(200).json({
        success: true,
        items: data.items || []
      });
    } catch (err) {
      console.error('Google Calendar Sync GET error:', err);
      return res.status(500).json({ error: 'Failed to pull Google Calendar events' });
    }
  }

  // POST: Push single event or update to Google Calendar
  if (req.method === 'POST') {
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

      if (!gcalRes.ok) {
        const errText = await gcalRes.text();
        return res.status(gcalRes.status).json({ error: 'Failed to push to Google Calendar', details: errText });
      }

      const createdItem = await gcalRes.json();
      return res.status(200).json({
        success: true,
        item: createdItem
      });
    } catch (err) {
      console.error('Google Calendar Sync POST error:', err);
      return res.status(500).json({ error: 'Failed to push Google Calendar event' });
    }
  }

  // DELETE: Delete event from Google Calendar
  if (req.method === 'DELETE') {
    try {
      const rawEventId = req.query?.eventId || req.body?.eventId;
      if (!rawEventId) {
        return res.status(400).json({ error: 'Missing eventId to delete from Google Calendar' });
      }
      const eventId = String(rawEventId).replace(/^gcal_/, '');

      const gcalRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!gcalRes.ok && gcalRes.status !== 404 && gcalRes.status !== 410) {
        const errText = await gcalRes.text();
        return res.status(gcalRes.status).json({ error: 'Failed to delete Google Calendar event', details: errText });
      }

      return res.status(200).json({ success: true, deletedEventId: eventId });
    } catch (err) {
      console.error('Google Calendar Sync DELETE error:', err);
      return res.status(500).json({ error: 'Failed to delete event from Google Calendar' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
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
