const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(urlObj.pathname);

  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Mock API endpoints for local testing
  if (pathname === '/api/chat') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            reply: `<thought_process>\nEvaluating request in local mock environment.\n</thought_process>\nLocal Sovereign Gateway online. Processed: "${parsed.prompt || ''}"`,
            vfs: parsed.currentVfs || {}
          }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (pathname === '/api/terminal') {
    if (req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stdout: 'Linux 5.15.0-x86_64 microVM online. Command executed.', stderr: '' }));
      return;
    }
  }

  let mockCloudWorkspace = null;

  if (pathname === '/api/sync') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id, authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: mockCloudWorkspace,
        timestamp: mockCloudWorkspace ? mockCloudWorkspace.updatedAt : Date.now()
      }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          mockCloudWorkspace = {
            ...(parsed.data || {}),
            updatedAt: Date.now()
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Cloud sync updated', timestamp: mockCloudWorkspace.updatedAt }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (pathname === '/api/auth') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'godx_session=mock_dev_session; Path=/;' });
    res.end(JSON.stringify({ success: true, message: 'Authenticated', sessionId: 'mock_dev_session' }));
    return;
  }

  if (pathname === '/api/calendar/status' || pathname === '/api/calendar') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured: true, connected: false }));
    return;
  }

  if (pathname === '/api/calendar/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, items: [] }));
    return;
  }

  if (pathname === '/api/calendar/auth') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ configured: true, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=true' }));
    return;
  }

  if (pathname === '/api/iot') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        req.rawBody = body;
        if (body) {
          try { req.body = JSON.parse(body); } catch { req.body = body; }
        } else {
          req.body = {};
        }
        const iotMod = await import('../api/iot.js');
        let statusCode = 200;
        const vercelRes = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (code) => {
            statusCode = code;
            return vercelRes;
          },
          json: (obj) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.writeHead(statusCode);
            res.end(JSON.stringify(obj));
          },
          send: (str) => {
            res.writeHead(statusCode);
            res.end(str);
          },
          end: (str) => {
            res.writeHead(statusCode);
            res.end(str);
          }
        };
        await iotMod.default(req, vercelRes);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname === '/api/admin') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        req.rawBody = body;
        if (body) {
          try { req.body = JSON.parse(body); } catch { req.body = body; }
        } else {
          req.body = {};
        }
        const adminMod = await import('../api/admin.js');
        let statusCode = 200;
        const vercelRes = {
          setHeader: (k, v) => res.setHeader(k, v),
          status: (code) => {
            statusCode = code;
            return vercelRes;
          },
          json: (obj) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.writeHead(statusCode);
            res.end(JSON.stringify(obj));
          },
          send: (str) => {
            res.writeHead(statusCode);
            res.end(str);
          },
          end: (str) => {
            res.writeHead(statusCode);
            res.end(str);
          }
        };
        await adminMod.default(req, vercelRes);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Static files
  const safePath = path.normalize(path.join(ROOT, pathname));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LuminaVista dev server active at http://127.0.0.1:${PORT}`);
});
