import crypto from 'crypto';

export function verifySession(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/godx_session=([^;]+)/);
  if (!match) return false;
  
  const [payload, signature] = match[1].split('.');
  if (!payload || !signature) return false;
  
  const secret = process.env.VERCEL_SECURE_TOKEN || 'godx-secret-key';
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (signature !== expectedSig) return false;
  
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (Date.now() > data.exp) return false; // Expired 20 mins
    
    // IP Binding check
    const currentIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    if (data.ip !== currentIp) return false; 
    
    return true;
  } catch (e) { return false; }
}

export default function handler(req, res) {
  if (verifySession(req)) {
    res.status(200).json({ success: true, message: "IP Session Verified" });
  } else {
    res.status(401).json({ success: false, error: "Unauthorized IP or Session Expired" });
  }
}