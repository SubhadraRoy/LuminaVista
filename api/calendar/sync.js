// api/calendar/sync.js - Serverless Google Calendar Two-Way Sync Endpoint
// Handles token refresh, event pulling, and event pushing on the server with zero client secrets.

import cookie from 'cookie';

async function getValidAccessToken(req, res) {
  const cookies = cookie.parse(req.headers?.cookie || '');
  if (!cookies.gcal_token) return null;

  try {
    const tokenData = JSON.parse(Buffer.from(cookies.gcal_token, 'base64').toString('utf8'));
    if (Date.now() < (tokenData.expires_at || 0) - 60000) {
      return tokenData.access_token;
    }

    // Token expired, refresh using GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
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

export default async function handler(req, res) {
  const accessToken = await getValidAccessToken(req, res);

  if (!accessToken) {
    return res.status(401).json({
      connected: false,
      error: 'Not connected to Google Calendar. Please authenticate.'
    });
  }

  if (req.method === 'GET') {
    try {
      const now = new Date();
      const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const gRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&singleEvents=true&maxResults=250`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!gRes.ok) {
        const errData = await gRes.json();
        return res.status(gRes.status).json({ error: errData.error?.message || 'Failed to fetch events from Google' });
      }

      const data = await gRes.json();
      return res.status(200).json({
        connected: true,
        items: data.items || []
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const eventBody = req.body;
      const gRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      });

      const data = await gRes.json();
      if (!gRes.ok) {
        return res.status(gRes.status).json({ error: data.error?.message || 'Failed to insert event into Google' });
      }

      return res.status(200).json({ success: true, event: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
