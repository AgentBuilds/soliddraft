import assert from 'node:assert/strict';
import { connect } from 'node:net';

// Writes only uniquely identified QA projects and removes them in finally.
// Run against an isolated local server; acceptance.js supplies one automatically.
const base = new URL(process.argv[2] || 'http://127.0.0.1:3000');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'QA requires a loopback server');
const created = new Set();
let checks = 0;
async function request(path, status, { method = 'GET', body, raw, headers = {} } = {}) {
  const response = await fetch(new URL(path, base), {
    method, headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), signal: AbortSignal.timeout(5000),
  });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text.slice(0, 200)}`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  if (method === 'HEAD' || status === 204) assert.equal(text, '');
  checks++;
  return { data: text && response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(text) : text, headers: response.headers };
}
async function create(body) {
  const { data, headers } = await request('/api/projects', 201, { method: 'POST', body });
  created.add(data.project.id);
  assert.equal(headers.get('location'), `/api/projects/${data.project.id}`);
  return data.project;
}
try {
  for (const path of ['/', '/index.html', '/src/main.js', '/src/styles.css', '/favicon.svg']) {
    const { data } = await request(path, 200);
    assert.ok(data.length);
    await request(path, 200, { method: 'HEAD' });
  }
  assert.equal((await request('/api/health', 200)).data.status, 'ok');
  const catalogue = (await request('/api/templates', 200)).data;
  assert.deepEqual(catalogue.templates.map(template => template.id), ['bracket', 'enclosure', 'spacer']);
  for (const template of catalogue.templates) {
    const { data } = await request(`/api/templates/${template.id}`, 200);
    assert.deepEqual(data.template, template);
    await request(`/api/templates/${template.id}`, 200, { method: 'HEAD' });
    const checked = (await request(`/api/templates/${template.id}/validate`, 200, { method: 'POST', body: { parameters: {} } })).data;
    const defaults = Object.fromEntries(Object.entries(template.parameters).map(([key, rule]) => [key, rule.default]));
    assert.deepEqual(checked.parameters, defaults);
    const project = await create({ name: `QA ${template.id}`, templateId: template.id, description: 'Round 1' });
    const path = `/api/projects/${project.id}`;
    assert.deepEqual(project.latestRevision.parameters, defaults);
    assert.deepEqual((await request(path, 200)).data.project, project);
    await request(path, 200, { method: 'HEAD' });
    const name = "QA <script>alert(1)</script> '; DROP TABLE projects; --";
    const renamed = (await request(path, 200, { method: 'PATCH', body: { name } })).data.project;
    assert.equal(renamed.name, name);
    assert.equal(renamed.latestRevision.number, 1);
    const modified = { ...defaults, height: defaults.height + 0.25 };
    const saved = (await request(`${path}/revisions`, 201, { method: 'POST', body: { parameters: modified, description: '', baseRevision: 1 } })).data.revision;
    assert.equal(saved.number, 2);
    assert.equal(saved.description, '');
    assert.deepEqual(saved.parameters, modified);
    assert.deepEqual((await request(`${path}/revisions/${project.latestRevision.id}`, 200)).data.revision, project.latestRevision);
    await request(`${path}/revisions/${saved.id}`, 200, { method: 'HEAD' });
    const history = (await request(`${path}/revisions?limit=1&offset=1`, 200)).data;
    assert.equal(history.total, 2);
    assert.equal(history.revisions[0].number, 1);
    for (const body of [{}, { parameters: null }, { parameters: {}, baseRevision: 0 }, { parameters: {}, description: null }, { parameters: {}, templateId: 'bracket' }]) {
      await request(`${path}/revisions`, 422, { method: 'POST', body });
    }
    const concurrent = await Promise.all([3, 4].map(async bump => {
      const response = await fetch(new URL(`${path}/revisions`, base), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters: { ...defaults, height: defaults.height + bump }, baseRevision: 2 }),
        signal: AbortSignal.timeout(5000),
      });
      return { status: response.status, data: await response.json() };
    }));
    assert.deepEqual(concurrent.map(result => result.status).sort(), [201, 409]);
    assert.equal(concurrent.find(result => result.status === 409).data.code, 'REVISION_CONFLICT');
    checks += 2;
    assert.equal((await request(`${path}/revisions`, 200)).data.total, 3);
    await request(`${path}/revisions`, 200, { method: 'HEAD' });
    await request(`${path}/revisions/missing`, 404);
    await request(`${path}/revisions/${saved.id}`, 405, { method: 'PATCH', body: {} });
    await request(path, 422, { method: 'PATCH', body: { name: ' ' } });
    await request(path, 422, { method: 'PATCH', body: { name: 'x'.repeat(121) } });
  }
  const sample = { name: 'QA duplicates are independent', templateId: 'spacer' };
  const one = await create(sample), two = await create(sample);
  assert.notEqual(one.id, two.id);
  await request(`/api/projects/${one.id}/revisions/${two.latestRevision.id}`, 404);
  const limits = await create({ name: 'Q'.repeat(120), templateId: 'spacer', description: 'D'.repeat(4000) });
  assert.equal(limits.name.length, 120);
  assert.equal(limits.latestRevision.description.length, 4000);
  const before = (await request('/api/projects', 200)).data.total;
  for (const body of [null, [], {}, { ...sample, name: '' }, { ...sample, name: ' ' }, { ...sample, name: 'Q'.repeat(121) }, { ...sample, description: 'D'.repeat(4001) }, { ...sample, extra: true }, { ...sample, parameters: { height: '12' } }]) {
    await request('/api/projects', 422, { method: 'POST', body });
  }
  for (const [id, parameters] of [['bracket', { thickness: 20 }], ['enclosure', { width: 10, wallThickness: 5 }], ['spacer', { outerDiameter: 5, innerDiameter: 4 }]]) {
    await request(`/api/templates/${id}/validate`, 422, { method: 'POST', body: { parameters } });
  }
  await request('/api/projects', 400, { method: 'POST', raw: '{' });
  await request('/api/projects', 400, { method: 'POST', raw: '' });
  const brokenEncoding = Buffer.concat([Buffer.from('{"name":"'), Buffer.from([0xff]), Buffer.from('","templateId":"spacer"}')]);
  await request('/api/projects', 400, { method: 'POST', raw: brokenEncoding });
  await request('/api/projects', 413, { method: 'POST', raw: JSON.stringify({ name: 'a'.repeat(65536) }) });
  await request('/api/projects', 415, { method: 'POST', raw: '{}', headers: { 'Content-Type': 'text/plain' } });
  assert.equal((await request('/api/projects', 200)).data.total, before);
  for (const query of ['limit=0', 'limit=101', 'limit=1.2', 'offset=-1', 'offset=9007199254740992', 'limit=1&limit=2', 'extra=x']) {
    await request(`/api/projects?${query}`, 400);
    await request(`/api/projects/${one.id}/revisions?${query}`, 400);
  }
  const page = (await request('/api/projects?limit=2&offset=0', 200)).data;
  assert.equal(page.projects.length, 2);
  const next = (await request('/api/projects?limit=2&offset=2', 200)).data;
  assert.equal(new Set([...page.projects, ...next.projects].map(project => project.id)).size, 4);
  for (const path of ['/api/health', '/api/templates', '/api/projects']) await request(path, 200, { method: 'HEAD' });
  for (const path of ['/api/templates/missing', '/api/projects/missing', '/api/projects/missing/revisions', '/api/projects/missing/revisions/missing', '/api/unknown', '/.env', '/data/soliddraft.sqlite', '/server/store.js']) await request(path, 404);
  const wrongMethod = await request('/api/projects', 405, { method: 'PUT', body: {} });
  assert.equal(wrongMethod.headers.get('allow'), 'GET, HEAD, POST');
  // Raw TCP avoids URL normalization by fetch/proxies when testing request targets.
  const rawResponse = await new Promise((resolve, reject) => {
    const socket = connect({ host: base.hostname === 'localhost' ? '127.0.0.1' : base.hostname.replace(/^\[|\]$/g, ''), port: Number(base.port || 80) });
    let response = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('Raw HTTP QA timed out')));
    socket.on('connect', () => socket.end('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
    socket.on('data', chunk => { response += chunk; });
    socket.on('error', reject);
    socket.on('end', () => resolve(response));
  });
  assert.match(rawResponse, /^HTTP\/1\.1 400/);
  assert.match(rawResponse, /INVALID_URL/);
  checks++;
  await request('/api/health', 200);
} finally {
  for (const id of created) {
    await request(`/api/projects/${id}`, 204, { method: 'DELETE' });
    await request(`/api/projects/${id}`, 404);
    await request(`/api/projects/${id}/revisions`, 404);
    await request(`/api/projects/${id}`, 404, { method: 'DELETE' });
  }
}
console.log(`Deep HTTP QA passed: ${checks} checks across all routes; QA projects cleaned up.`);
