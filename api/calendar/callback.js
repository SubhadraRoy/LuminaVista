// api/calendar/callback.js - Google Calendar OAuth2 Callback & Code Exchange
// Exchanges authorization code using GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET securely on the backend.

import { serialize } from 'cookie';

export default async function handler(req, res) {
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
  const redirectUri = `${proto}://${host}/api/calendar/callback`;

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

    res.setHeader('Set-Cookie', serialize('gcal_token', Buffer.from(tokenPayload).toString('base64'), {
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
