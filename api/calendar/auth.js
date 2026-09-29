// api/calendar/auth.js - Google Calendar OAuth2 Initiation Endpoint
// Uses process.env.GOOGLE_CLIENT_ID on the server — ZERO credentials in the frontend!

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(200).json({
      configured: false,
      error: 'GOOGLE_CLIENT_ID is not configured in Vercel environment variables.'
    });
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
  const redirectUri = `${proto}://${host}/api/calendar/callback`;

  const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  return res.status(200).json({
    configured: true,
    authUrl,
    redirectUri
  });
}
