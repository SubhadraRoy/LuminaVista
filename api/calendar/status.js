// api/calendar/status.js - Returns Google Calendar connection and Vercel environment configuration status
import cookie from 'cookie';

export default async function handler(req, res) {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const cookies = cookie.parse(req.headers?.cookie || '');
  const connected = !!cookies.gcal_token;

  return res.status(200).json({
    configured,
    connected,
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET
  });
}
