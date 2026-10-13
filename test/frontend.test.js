import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createApp } from '../server/app.js';

// A small DOM adapter exercises the shipped frontend against the real HTTP API.
// This is a logic regression test, not a substitute for visual browser checks.
function dom() {
  const nodes = [];
  class Element {
    constructor(tag = 'div', attrs = {}) {
      this.tag = tag; this.attrs = attrs; this.dataset = {}; this.listeners = {};
      this.value = attrs.value || ''; this.disabled = 'disabled' in attrs;
      for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[key.slice(5)] = value;
    }
    set innerHTML(html) {
      for (const child of nodes.filter(node => node.owner === this)) nodes.splice(nodes.indexOf(child), 1);
      this.html = html; this.textContent = html.replace(/<[^>]+>/g, '');
      for (const match of html.matchAll(/<(\w+)([^>]*)>/g)) {
        const attrs = {};
        for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] || '';
        if (attrs.id || Object.keys(attrs).some(key => key.startsWith('data-')) || ['button', 'fieldset', 'h1'].includes(match[1])) {
          const child = new Element(match[1], attrs); child.owner = this; nodes.push(child);
        }
      }
    }
    get innerHTML() { return this.html || ''; }
    querySelector(selector) { return select(selector)[0] || null; }
    querySelectorAll(selector) { return select(selector); }
    setAttribute(key, value) { this.attrs[key] = value; }
    removeAttribute(key) { delete this.attrs[key]; }
    addEventListener(event, callback) { this.listeners[event] = callback; }
    replaceChildren() { this.innerHTML = ''; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    setCustomValidity() {}
    reportValidity() {}
  }
  function select(selector) {
    if (selector === '.page-heading h1') return nodes.filter(node => node.tag === 'h1');
    return nodes.filter(node => selector.split(',').some(part => {
      part = part.trim();
      if (part.startsWith('#')) return node.attrs.id === part.slice(1);
      if (part.startsWith('[')) {
        const [, key, value] = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/) || [];
        return key in node.attrs && (value === undefined || node.attrs[key] === value);
      }
      return node.tag === part;
    }));
  }
  const root = new Element();
  const document = { querySelector: () => root, getElementById: id => select(`#${id}`)[0], activeElement: null };
  return { root, document };
}

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
async function frontend(base, fetcher = fetch) {
  const { root, document } = dom();
  const location = { hash: '' };
  const context = vm.createContext({
    document, location, history: { replaceState: (_state, _title, hash) => { location.hash = hash; } },
    window: { addEventListener() {} }, AbortSignal, console,
    fetch: (path, options) => fetcher(new URL(path, base), options),
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  for (let attempt = 0; attempt < 100; attempt++) {
    if (document.getElementById('part-form') || root.querySelector('[data-action="connect"]')) return { run, root, document, context };
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Frontend failed to settle within one second');
}

test('frontend validates, saves, revises, restores, renames and opens the library through the API', async t => {
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const ui = await frontend(base);
  assert.equal(ui.run('template().id'), 'bracket');
  assert.match(ui.document.getElementById('connection').textContent, /connected/);

  await ui.run('savePart()');
  assert.match(ui.document.getElementById('error-name').textContent, /Enter a name/);
  assert.equal(ui.run('state.project'), null);
  ui.run("state.draft.name = 'Shelf support'; state.draft.parameters.thickness = 20");
  await ui.run('checkDimensions()');
  assert.match(ui.document.getElementById('form-feedback').innerHTML, /Invalid template parameters/);
  assert.equal(ui.run('state.busy'), false);

  ui.run("state.draft.parameters.thickness = 4; state.draft.description = 'Workshop shelf'");
  await ui.run('savePart()');
  assert.equal(ui.run('state.project.latestRevision.number'), 1);
  assert.equal(ui.run('dirty()'), false);
  assert.match(ui.run('location.hash'), /^#\/projects\//);
  await ui.run('loadHistory()');
  assert.equal(ui.run('state.revisions.length'), 1);
  ui.run('state.draft.parameters.width = 70');
  await ui.run('savePart()');
  await ui.run('loadHistory()');
  assert.equal(ui.run('state.project.latestRevision.number'), 2);
  await ui.run('useRevision(state.revisions[1].id)');
  assert.equal(ui.run('state.draft.parameters.width'), 30);
  assert.equal(ui.run('dirty()'), true);
  await ui.run('savePart()');
  assert.equal(ui.run('state.project.latestRevision.number'), 3);

  ui.run("confirmAction = async () => 'Shelf support — revised'");
  await ui.run('renamePart()');
  assert.equal(ui.run('state.project.name'), 'Shelf support — revised');
  assert.equal(ui.run('dirty()'), false);
  ui.run("location.hash = '#/parts'");
  await ui.run('route()');
  await ui.run('loadProjects()');
  assert.equal(ui.run('state.projects.length'), 1);
  assert.match(ui.document.getElementById('parts-content').innerHTML, /Shelf support — revised/);
  ui.run('location.hash = `#/projects/${state.projects[0].id}`');
  await ui.run('route()');
  ui.run('confirmAction = async () => true');
  await ui.run('deletePart()');
  await ui.run('route()'); await ui.run('loadProjects()');
  assert.equal(ui.run('state.projects.length'), 0);
});

test('frontend preserves drafts on network, malformed response and revision conflicts', async t => {
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const ui = await frontend(base);
  ui.run("state.draft.name = 'Spacer draft'");
  await ui.run('savePart()');
  const projectId = ui.run('state.project.id');
  await fetch(`${base}/api/projects/${projectId}/revisions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameters: { width: 90 }, baseRevision: 1 }),
  });
  ui.run('state.draft.parameters.width = 80');
  await ui.run('savePart()');
  assert.match(ui.document.getElementById('form-feedback').innerHTML, /Reload latest revision/);
  assert.equal(ui.run('state.draft.parameters.width'), 80);
  assert.equal(ui.run('state.project.latestRevision.number'), 1);
  assert.equal(ui.run('dirty()'), true);
  ui.context.fetch = async () => { throw new Error('offline'); };
  await ui.run('checkDimensions()');
  assert.match(ui.document.getElementById('form-feedback').innerHTML, /Could not reach/);
  assert.equal(ui.run('state.draft.parameters.width'), 80);
  ui.context.fetch = async () => ({ status: 200, json: async () => { throw new SyntaxError(); } });
  await ui.run('checkDimensions()');
  assert.match(ui.document.getElementById('form-feedback').innerHTML, /unreadable response/);
  assert.equal(ui.run('state.busy'), false);
});

test('frontend exposes connection retry and empty library states', async t => {
  const offline = await frontend('http://127.0.0.1', async () => { throw new Error('offline'); });
  assert.ok(offline.root.querySelector('[data-action="connect"]'));
  assert.match(offline.document.getElementById('connection').textContent, /unavailable/);
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const ui = await frontend(`http://127.0.0.1:${app.address().port}`);
  ui.run("location.hash = '#/parts'");
  await ui.run('route()'); await ui.run('loadProjects()');
  assert.match(ui.document.getElementById('parts-content').innerHTML, /A home for your first part/);
});

test('frontend cancels draft navigation and protects edited dimensions when resetting defaults', async t => {
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const ui = await frontend(`http://127.0.0.1:${app.address().port}`);
  ui.run("state.draft.name = 'Keep this draft'; state.draft.description = 'Keep this note'; state.draft.parameters.width = 70");
  ui.run("confirmAction = async () => false; location.hash = '#/parts'");
  await ui.run('route()');
  assert.equal(ui.run('location.hash'), '#/new/bracket');
  assert.equal(ui.run('state.draft.parameters.width'), 70);
  assert.equal(ui.run('dirty()'), true);
  await ui.run('resetDefaults()');
  assert.equal(ui.run('state.draft.parameters.width'), 70);
  ui.run('confirmAction = async () => true');
  await ui.run('resetDefaults()');
  assert.equal(ui.run('state.draft.parameters.width'), 30);
  assert.equal(ui.document.getElementById('field-width').value, 30);
  assert.equal(ui.run('state.draft.name'), 'Keep this draft');
  assert.equal(ui.run('state.draft.description'), 'Keep this note');
  assert.equal(ui.run('dirty()'), true);
  assert.match(ui.document.getElementById('announcement').textContent, /defaults restored/);
});

test('frontend highlights empty dimensions without writing and escapes saved user text', async t => {
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const ui = await frontend(base);
  ui.run("state.draft.name = 'a'.repeat(121); state.draft.description = 'b'.repeat(4001)");
  await ui.run('savePart()');
  assert.match(ui.document.getElementById('error-name').textContent, /120 characters/);
  assert.match(ui.document.getElementById('error-description').textContent, /4000 characters/);
  ui.run("state.draft.name = '<img src=x onerror=alert(1)>'; state.draft.description = '<script>evil()</script>'; state.draft.parameters.width = null");
  await ui.run('savePart()');
  assert.equal(ui.document.getElementById('field-width').attrs['aria-invalid'], 'true');
  assert.equal((await (await fetch(`${base}/api/projects`)).json()).total, 0);
  ui.run('state.draft.parameters.width = 35.25');
  await ui.run('savePart()');
  await ui.run('loadHistory()');
  assert.match(ui.document.getElementById('history-content').innerHTML, /&lt;script&gt;evil\(\)&lt;\/script&gt;/);
  ui.run("location.hash = '#/parts'");
  await ui.run('route()'); await ui.run('loadProjects()');
  const html = ui.document.getElementById('parts-content').innerHTML;
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});

test('frontend ignores stale library responses and prevents duplicate load-more requests', async t => {
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  // Real catalogue/project writes; deferred list reads make ordering deterministic.
  const ui = await frontend(base);
  ui.run("state.draft.name = 'First part'"); await ui.run('savePart()');
  const project = JSON.parse(ui.run('JSON.stringify(state.project)'));
  ui.run('renderLibrary()');
  const pending = [];
  ui.context.fetch = () => new Promise(resolve => pending.push(resolve));
  const older = ui.run('loadProjects()');
  assert.equal(ui.root.querySelector('[data-action="parts-refresh"]').disabled, true);
  const newer = ui.run('loadProjects()');
  const reply = projects => ({ status: 200, ok: true, json: async () => ({ projects, total: 2 }) });
  pending[1](reply([project])); await newer;
  pending[0](reply([])); await older;
  assert.equal(ui.run('state.projects.length'), 1);
  assert.equal(ui.root.querySelector('[data-action="parts-refresh"]').disabled, false);
  const more = ui.run('loadProjects(true)');
  await ui.run('loadProjects(true)');
  assert.equal(pending.length, 3, 'one append read for repeated activation');
  pending[2](reply([{ ...project, id: 'second', name: 'Second part' }])); await more;
  assert.equal(ui.run('state.projects.length'), 2);
  assert.equal(ui.document.getElementById('parts-content').attrs['aria-busy'], 'false');
});

test('skip-to-content moves focus without navigating or discarding an edited draft', async t => {
  const app = createApp({ databasePath: ':memory:' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const ui = await frontend(`http://127.0.0.1:${app.address().port}`);
  ui.run("state.draft.name = 'Keep my keyboard draft'; state.draft.parameters.width = 70");
  const before = ui.run('snapshot()');
  const hash = ui.run('location.hash');
  let prevented = false;
  const skip = ui.root.querySelector('[data-skip]');
  assert.ok(skip, 'the skip link uses the focus handler');
  await ui.root.listeners.click({
    target: { closest: selector => selector === '[data-skip]' ? skip : null },
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true, 'the browser must not change the route hash');
  assert.equal(ui.document.activeElement, ui.document.getElementById('content'));
  assert.equal(ui.run('location.hash'), hash);
  assert.equal(ui.run('snapshot()'), before);
  assert.equal(ui.run('dirty()'), true);
});
