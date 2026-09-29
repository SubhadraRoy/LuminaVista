// api/calendar.js - Consolidated Sovereign Google Calendar Serverless Controller
// Unifies auth, callback, status, and sync into ONE single Serverless Function
// Keeps total deployment functions well below Vercel Hobby's 12-function limit.

import cookie from 'cookie';

// 1. OAuth2 Authorization URL Initiation
async function handleAuth(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(200).json({
      configured: false,
      error: 'GOOGLE_CLIENT_ID is not configured in Vercel environment variables.'
    });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  return res.status(200).json({
    configured: true,
    authUrl,
    redirectUri
  });
}

// 2. OAuth2 Callback & Code Exchange
async function handleCallback(req, res) {
  const { code, error } = req.query || {};
  if (error || !code) {
    return res.redirect(`/dashboard.html?gcal_error=${encodeURIComponent(error || 'Authorization denied')}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.redirect('/dashboard.html?gcal_error=Server+missing+Google+OAuth+credentials');
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || req.query?.redirect_uri || `${proto}://${host}/api/calendar/callback`;

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
      return res.redirect(`/dashboard.html?gcal_error=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`);
    }

    // Store tokens securely in an HttpOnly cookie
    const tokenPayload = JSON.stringify({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + ((tokenData.expires_in || 3600) * 1000)
    });

    res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(tokenPayload).toString('base64'), {
      httpOnly: true,
      secure: proto === 'https',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
    }));

    return res.redirect('/dashboard.html?gcal_connected=true');
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return res.redirect('/dashboard.html?gcal_error=Internal+server+error');
  }
}

// 3. Status Check
async function handleStatus(req, res) {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const cookies = cookie.parse(req.headers?.cookie || '');
  const connected = !!cookies.gcal_token;
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
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

        res.setHeader('Set-Cookie', cookie.serialize('gcal_token', Buffer.from(JSON.stringify(tokenData)).toString('base64'), {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60,
          path: '/'
        }));

        return freshData.access_token;
      }
    }

    return tokenData.access_token || null;
  } catch (e) {
    return null;
  }
}

// 5. Two-Way Sync (Pull and Push)
async function handleSync(req, res) {
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
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

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

  // POST: Push single event to Google Calendar
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: body.summary || 'Scheduled Task',
          description: body.description || '',
          location: body.location || '',
          start: body.start || { dateTime: new Date().toISOString() },
          end: body.end || { dateTime: new Date(Date.now() + 3600000).toISOString() }
        })
      });

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

  return res.status(405).json({ error: 'Method not allowed' });
}

// Master Dispatcher
export default async function handler(req, res) {
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

  if (req.method === 'POST') {
    return handleSync(req, res);
  }
  return handleStatus(req, res);
}
