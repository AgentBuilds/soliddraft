import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';

async function serve(t, options = {}) {
  const app = createApp({ databasePath: ':memory:', ...options });
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });
  const close = () => new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
  t.after(async () => { if (app.listening) await close(); });
  return { app, close, url: `http://127.0.0.1:${app.address().port}` };
}

async function api(server, route, { method = 'GET', body, raw, headers } = {}) {
  const response = await fetch(server.url + route, {
    method, headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : undefined };
}
const draft = { name: 'Shelf support', templateId: 'bracket', description: 'A bracket for a small shelf', parameters: { width: 50 } };

test('project lifecycle, immutable revision history, conflicts and cascade deletion over HTTP', async t => {
  const server = await serve(t);
  assert.deepEqual((await api(server, '/api/projects')).body, { projects: [], total: 0, limit: 50, offset: 0 });
  const created = await api(server, '/api/projects', { method: 'POST', body: draft });
  assert.equal(created.status, 201);
  const project = created.body.project;
  const route = `/api/projects/${project.id}`;
  assert.equal(created.headers.get('location'), route);
  assert.equal(project.latestRevision.number, 1);
  assert.equal(project.latestRevision.parameters.width, 50);
  assert.equal(project.latestRevision.parameters.height, 40);
  assert.equal(project.latestRevision.templateVersion, 1);
  assert.deepEqual((await api(server, route)).body.project, project);
  assert.equal((await api(server, '/api/projects?limit=1&offset=0')).body.total, 1);
  assert.deepEqual((await api(server, '/api/projects?offset=1')).body.projects, []);
  const head = await api(server, route, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, undefined);
  const rename = await api(server, route, { method: 'PATCH', body: { name: ' Revised support ' } });
  assert.equal(rename.body.project.name, 'Revised support');
  assert.equal(rename.body.project.latestRevision.number, 1);
  const saved = await api(server, `${route}/revisions`, { method: 'POST', body: { parameters: { width: 70 }, baseRevision: 1 } });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.revision.number, 2);
  assert.equal(saved.body.revision.description, draft.description);
  const history = await api(server, `${route}/revisions?limit=1`);
  assert.equal(history.body.total, 2);
  assert.equal(history.body.revisions[0].number, 2);
  assert.deepEqual((await api(server, `${route}/revisions/${project.latestRevision.id}`)).body.revision, project.latestRevision);
  assert.equal((await api(server, route)).body.project.latestRevision.parameters.width, 70);
  const conflict = await api(server, `${route}/revisions`, { method: 'POST', body: { parameters: {}, baseRevision: 1 } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'REVISION_CONFLICT');
  assert.equal((await api(server, `${route}/revisions`)).body.total, 2);
  const other = (await api(server, '/api/projects', { method: 'POST', body: { name: 'Board case', templateId: 'enclosure' } })).body.project;
  assert.equal((await api(server, `/api/projects/${other.id}/revisions/${project.latestRevision.id}`)).status, 404);
  assert.equal((await api(server, `${route}/revisions/${project.latestRevision.id}`, { method: 'PATCH', body: {} })).status, 405);
  const deleted = await api(server, route, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  assert.equal(deleted.body, undefined);
  assert.equal((await api(server, route)).status, 404);
  assert.equal((await api(server, `${route}/revisions`)).status, 404);
  assert.equal((await api(server, route, { method: 'DELETE' })).status, 404);
  assert.equal((await api(server, '/api/projects')).body.total, 1);
});

test('catalogue schemas and validation reject unsafe geometry and complete defaults', async t => {
  const server = await serve(t);
  for (const id of ['bracket', 'enclosure', 'spacer']) {
    const detail = await api(server, `/api/templates/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.template.version, 1);
    const checked = await api(server, `/api/templates/${id}/validate`, { method: 'POST', body: { parameters: {} } });
    assert.equal(checked.status, 200);
    for (const [key, rule] of Object.entries(detail.body.template.parameters)) assert.equal(checked.body.parameters[key], rule.default);
  }
  const invalid = [
    ['bracket', { width: '40' }], ['bracket', { width: null }], ['bracket', { width: -1 }],
    ['bracket', { thickness: 20 }], ['bracket', { width: 10, holeDiameter: 5 }],
    ['bracket', { width: 14.4, thickness: 1.4, holeDiameter: 11.6 }],
    ['bracket', { script: 'anything' }], ['bracket', []], ['bracket', null],
    ['enclosure', { width: 10, wallThickness: 5 }], ['enclosure', { height: 5, wallThickness: 5 }],
    ['spacer', { outerDiameter: 8, innerDiameter: 8 }], ['spacer', { outerDiameter: 8, innerDiameter: 7 }],
  ];
  for (const [id, parameters] of invalid) {
    const response = await api(server, `/api/templates/${id}/validate`, { method: 'POST', body: { parameters } });
    assert.equal(response.status, 422, `${id}: ${JSON.stringify(parameters)}`);
    assert.equal(response.body.code, 'VALIDATION_ERROR');
  }
  const infinity = await api(server, '/api/templates/spacer/validate', { method: 'POST', raw: '{"parameters":{"height":1e400}}' });
  assert.equal(infinity.status, 422);
  assert.equal((await api(server, '/api/templates/missing')).status, 404);
  assert.equal((await api(server, '/api/projects')).body.total, 0);
});

test('invalid requests return consistent errors without creating projects or revisions', async t => {
  const server = await serve(t);
  for (const body of [null, [], {}, { ...draft, name: ' ' }, { ...draft, name: 'a'.repeat(121) }, { ...draft, description: null }, { ...draft, description: 'a'.repeat(4001) }, { ...draft, extra: true }, { ...draft, parameters: { width: 400 } }]) {
    const result = await api(server, '/api/projects', { method: 'POST', body });
    assert.equal(result.status, 422);
    assert.equal(result.body.code, 'VALIDATION_ERROR');
    assert.equal(typeof result.body.error, 'string');
  }
  assert.equal((await api(server, '/api/projects', { method: 'POST', body: { ...draft, templateId: 'unknown' } })).status, 404);
  assert.equal((await api(server, '/api/projects', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await api(server, '/api/projects', { method: 'POST', raw: '' })).status, 400);
  assert.equal((await api(server, '/api/projects', { method: 'POST', raw: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await api(server, '/api/projects', { method: 'POST', raw: JSON.stringify({ name: 'a'.repeat(65536) }) })).status, 413);
  assert.equal((await api(server, '/api/projects')).body.total, 0);
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'offset=-1', 'offset=9007199254740992', 'limit=', 'limit=1&limit=2', 'sort=name']) {
    assert.equal((await api(server, `/api/projects?${query}`)).status, 400, query);
  }
  const method = await api(server, '/api/projects', { method: 'PUT', body: {} });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET, HEAD, POST');
  assert.equal((await api(server, '/api/projects/missing')).status, 404);
  const project = (await api(server, '/api/projects', { method: 'POST', body: draft })).body.project;
  const route = `/api/projects/${project.id}`;
  for (const body of [{}, { parameters: {} , baseRevision: 0 }, { parameters: {}, description: null }, { parameters: { width: 999 } }, { parameters: {}, templateId: 'spacer' }]) {
    assert.equal((await api(server, `${route}/revisions`, { method: 'POST', body })).status, 422);
  }
  assert.equal((await api(server, route, { method: 'PATCH', body: {} })).status, 422);
  assert.equal((await api(server, `${route}/revisions`)).body.total, 1);
});

test('concurrent saves with the same base revision permit one writer', async t => {
  const server = await serve(t);
  const project = (await api(server, '/api/projects', { method: 'POST', body: draft })).body.project;
  const route = `/api/projects/${project.id}/revisions`;
  const results = await Promise.all([60, 80].map(width => api(server, route, { method: 'POST', body: { parameters: { width }, baseRevision: 1 } })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal((await api(server, route)).body.total, 2);
});

test('SQLite projects and revisions survive server restart and an independent Node process', async t => {
  const tempRoot = fileURLToPath(new URL('./.tmp/', import.meta.url));
  await mkdir(tempRoot, { recursive: true });
  const dir = await mkdtemp(path.join(tempRoot, 'persistence-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const databasePath = path.join(dir, 'nested', 'drafts.sqlite');
  const first = await serve(t, { databasePath });
  const project = (await api(first, '/api/projects', { method: 'POST', body: draft })).body.project;
  const route = `/api/projects/${project.id}`;
  await api(first, `${route}/revisions`, { method: 'POST', body: { parameters: { width: 85 }, description: 'Wider bracket', baseRevision: 1 } });
  await api(first, route, { method: 'PATCH', body: { name: "Shelf's final support" } });
  await first.close();
  const second = await serve(t, { databasePath });
  const restored = (await api(second, route)).body.project;
  assert.equal(restored.name, "Shelf's final support");
  assert.equal(restored.latestRevision.number, 2);
  assert.equal(restored.latestRevision.parameters.width, 85);
  assert.equal((await api(second, `${route}/revisions`)).body.total, 2);
  await second.close();
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createStore } from './server/store.js';
    const store = createStore(process.argv[1]);
    console.log(JSON.stringify(store.getProject(process.argv[2])));
    store.close();
  `, databasePath, project.id], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  assert.deepEqual(JSON.parse(probe.stdout), restored);
  const third = await serve(t, { databasePath });
  await api(third, route, { method: 'DELETE' });
  await third.close();
  const fourth = await serve(t, { databasePath });
  assert.equal((await api(fourth, '/api/projects')).body.total, 0);
  assert.equal((await api(fourth, `${route}/revisions`)).status, 404);
  await fourth.close();
});

test('chunked request body limit is enforced even without Content-Length', async t => {
  const app = createApp({ databasePath: ':memory:' });
  t.after(() => app.close());
  const req = Readable.from([Buffer.alloc(40000, 32), Buffer.alloc(40000, 32)]);
  Object.assign(req, { url: '/api/projects', method: 'POST', headers: { 'content-type': 'application/json' } });
  let status; let body;
  await app.listeners('request')[0](req, {
    headersSent: false,
    setHeader() {},
    writeHead(value) { status = value; this.headersSent = true; },
    end(value) { body = JSON.parse(value); },
  });
  assert.equal(status, 413);
  assert.equal(body.code, 'BODY_TOO_LARGE');
});

test('oversized chunked HTTP input receives JSON 413 without resetting the socket', async t => {
  const server = await serve(t);
  const result = await new Promise((resolve, reject) => {
    const req = httpRequest(`${server.url}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(Buffer.alloc(40000, 32));
    req.end(Buffer.alloc(40000, 32));
  });
  assert.equal(result.status, 413);
  assert.equal(result.body.code, 'BODY_TOO_LARGE');
  assert.equal((await api(server, '/api/health')).status, 200);
});
