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
