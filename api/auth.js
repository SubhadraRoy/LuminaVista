import crypto from 'crypto';

export default async function handler(req, res) {
  // 1. Strict CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, error: "Password required" });

  // 2. Fetch the true password from Vercel's secure vault
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    return res.status(500).json({ success: false, error: "Server misconfigured: Missing ADMIN_PASSWORD in Vercel." });
  }

  // 3. Hash both inputs to ensure uniform length for timing-safe comparison
  const inputBuffer = crypto.createHash('sha256').update(password).digest();
  const expectedBuffer = crypto.createHash('sha256').update(expectedPassword).digest();

  // 4. Use timingSafeEqual to prevent side-channel timing attacks
  if (inputBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(inputBuffer, expectedBuffer)) {
    // If successful, pass the API authorization token back to the frontend
    return res.status(200).json({ 
      success: true, 
      token: process.env.VERCEL_SECURE_TOKEN || "unsecured-session" 
    });
  } else {
    return res.status(401).json({ success: false, error: "Access Denied" });
  }
}