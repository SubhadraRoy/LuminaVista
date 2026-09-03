import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, error: "Password required" });

  // Hash the incoming password securely on the server
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  
  // Hash the expected password (xps@admin) or use an environment variable for max security
  const expectedPassword = process.env.ADMIN_PASSWORD || "xps@admin";
  const expectedHash = crypto.createHash('sha256').update(expectedPassword).digest('hex');

  if (inputHash === expectedHash) {
    return res.status(200).json({ success: true, token: "godx-secure-session" });
  } else {
    return res.status(401).json({ success: false, error: "Access Denied" });
  }
}