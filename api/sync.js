import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  let userSession = "admin_workspace"; // Centralized state key

  try {
    const redis = new Redis({ url, token });

    // Handle GET: Retrieve the workspace state when the dashboard loads
    if (req.method === 'GET') {
      const state = await redis.get(userSession);
      return res.status(200).json(state || { vfs: null, notes: null, whiteboard: null, chat: null });
    }

    // Handle POST: Update the workspace state when the user edits something
    if (req.method === 'POST') {
      const { vfs, notes, whiteboard, chat } = req.body;
      const currentState = (await redis.get(userSession)) || {};
      
      const newState = {
        vfs: vfs !== undefined ? vfs : currentState.vfs,
        notes: notes !== undefined ? notes : currentState.notes,
        whiteboard: whiteboard !== undefined ? whiteboard : currentState.whiteboard,
        chat: chat !== undefined ? chat : currentState.chat
      };

      await redis.set(userSession, JSON.stringify(newState));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    return res.status(500).json({ error: 'Database Sync Fault', details: error.message });
  }
}