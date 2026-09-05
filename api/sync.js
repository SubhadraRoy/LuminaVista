import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  
  if (!url || !token) return res.status(500).json({ error: 'Redis credentials missing.' });

  const redis = new Redis({ url, token });
  const sessionKey = "master_workspace_state"; // Centralized state key for your admin dashboard

  try {
    // GET: Retrieve the workspace state when the dashboard loads
    if (req.method === 'GET') {
      const state = await redis.get(sessionKey);
      return res.status(200).json(state || { vfs: null, notes: null, whiteboard: null, chat: null });
    }

    // POST: Update the workspace state when you draw, type, or code
    if (req.method === 'POST') {
      const { vfs, notes, whiteboard, chat } = req.body;
      const currentState = (await redis.get(sessionKey)) || {};
      
      const newState = {
        vfs: vfs !== undefined ? vfs : currentState.vfs,
        notes: notes !== undefined ? notes : currentState.notes,
        whiteboard: whiteboard !== undefined ? whiteboard : currentState.whiteboard,
        chat: chat !== undefined ? chat : currentState.chat
      };

      await redis.set(sessionKey, JSON.stringify(newState));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ error: 'Database Sync Fault', details: error.message });
  }
}