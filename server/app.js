import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const templates = [
  { id: 'bracket', name: 'Bracket', description: 'Mount and support at a right angle.', reference: 'L-shaped mounting bracket', dimensions: '40 × 40 × 30 mm' },
  { id: 'enclosure', name: 'Enclosure', description: 'Give your electronics a home.', reference: 'Open electronics enclosure', dimensions: '80 × 60 × 30 mm' },
  { id: 'spacer', name: 'Spacer', description: 'Keep a precise distance between parts.', reference: 'Cylindrical through-hole spacer', dimensions: 'Ø 16 × 12 mm' },
];
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/src/main.js', ['src/main.js', 'text/javascript; charset=utf-8']],
  ['/src/styles.css', ['src/styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

export function createApp({ distDir = defaultDist, dev = false } = {}) {
  return createServer(async (req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const json = (status, body) => send(status, 'application/json; charset=utf-8', JSON.stringify(body));
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        return json(405, { error: 'Method not allowed' });
      }
      if (url.pathname === '/api/health') return json(200, { status: 'ok', service: 'soliddraft', version: '0.1.0' });
      if (url.pathname === '/api/templates') return json(200, { templates, units: 'mm' });
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return json(404, { error: 'API endpoint not found' });
      const asset = assets.get(url.pathname);
      if (!asset) return send(404, 'text/plain; charset=utf-8', 'Not found');
      const [relative, type] = asset;
      const location = dev && relative === 'favicon.svg' ? 'public/favicon.svg' : relative;
      try {
        const content = await readFile(path.join(distDir, location));
        send(200, type, content);
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
        if (relative === 'index.html') return send(503, 'text/plain; charset=utf-8', 'Frontend not built. Run npm run build or use npm run dev.');
        send(404, 'text/plain; charset=utf-8', 'Not found');
      }
    } catch (error) {
      console.error('Request failed:', error.message);
      if (!res.headersSent) send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'Internal server error' }));
      else res.end();
    }
  });
}
