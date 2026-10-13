import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';

// Exercise the actual HTTP request listener without opening network sockets.
async function request(app, url, method = 'GET') {
  const result = { headers: {}, status: 0, body: '' };
  const response = {
    headersSent: false,
    setHeader(name, value) { result.headers[name] = value; },
    writeHead(status, headers) {
      result.status = status;
      Object.assign(result.headers, headers);
      this.headersSent = true;
    },
    end(body) { result.body = body?.toString() || ''; },
  };
  await app.listeners('request')[0]({ url, method }, response);
  return result;
}

test('health, catalogue and unknown API routes have the expected contract', async t => {
  const app = createApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const health = await request(app, '/api/health');
  assert.equal(health.status, 200);
  assert.match(health.headers['Content-Type'], /application\/json/);
  assert.deepEqual(JSON.parse(health.body), { status: 'ok', service: 'soliddraft', version: '0.1.0' });
  const catalogue = await request(app, '/api/templates');
  assert.equal(catalogue.status, 200);
  const body = JSON.parse(catalogue.body);
  assert.equal(body.units, 'mm');
  assert.deepEqual(body.templates.map(item => item.id), ['bracket', 'enclosure', 'spacer']);
  for (const item of body.templates) assert.ok(item.name && item.reference && item.dimensions);
  const missing = await request(app, '/api/missing');
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(missing.body), { error: 'API endpoint not found', code: 'NOT_FOUND' });
});

test('static serving has correct content types and exposes only public assets', async t => {
  const app = createApp({ databasePath: ':memory:', dev: true, distDir: fileURLToPath(new URL('../', import.meta.url)) });
  t.after(() => app.close());
  for (const [url, type] of [['/', 'text/html'], ['/src/main.js', 'text/javascript'], ['/src/styles.css', 'text/css'], ['/favicon.svg', 'image/svg+xml']]) {
    const response = await request(app, url);
    assert.equal(response.status, 200, url);
    assert.ok(response.headers['Content-Type'].startsWith(type), url);
    assert.ok(response.body.length > 0, url);
  }
  for (const url of ['/package.json', '/.env', '/server/app.js', '/src/../server/app.js', '/%2e%2e/README.md']) {
    assert.equal((await request(app, url)).status, 404, url);
  }
  const head = await request(app, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  const post = await request(app, '/api/health', 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
});

test('server clearly explains missing frontend build', async t => {
  const app = createApp({ databasePath: ':memory:', distDir: fileURLToPath(new URL('./missing-dist/', import.meta.url)) });
  t.after(() => app.close());
  const response = await request(app, '/');
  assert.equal(response.status, 503);
  assert.match(response.body, /npm run build/);
  assert.equal((await request(app, '/api/health')).status, 200);
});
