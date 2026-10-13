import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.js';
import { getTemplate, validateParameters } from '../server/templates.js';

function setup(t) {
  const store = createStore(':memory:');
  t.after(() => store.close());
  const template = getTemplate('spacer');
  const part = { name: 'Board spacer', description: 'First note', template, parameters: validateParameters(template) };
  return { store, part };
}

test('failed project and revision writes roll back completely and release the transaction', t => {
  const { store, part } = setup(t);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => store.createProject({ ...part, parameters: cyclic }), TypeError);
  assert.equal(store.listProjects({ limit: 10, offset: 0 }).total, 0);
  const project = store.createProject(part);
  assert.throws(() => store.createRevision(project.id, { templateVersion: 1, parameters: cyclic, baseRevision: 1 }), TypeError);
  assert.deepEqual(store.getProject(project.id), project);
  assert.equal(store.listRevisions(project.id, { limit: 10, offset: 0 }).total, 1);
  const saved = store.createRevision(project.id, { templateVersion: 1, parameters: { ...part.parameters, height: 20 }, baseRevision: 1 });
  assert.equal(saved.number, 2);
  assert.equal(saved.description, part.description);
});

test('revision snapshots are independent, empty descriptions clear and conflicts leave storage untouched', t => {
  const { store, part } = setup(t);
  const project = store.createProject(part);
  part.parameters.height = 99;
  project.latestRevision.parameters.height = 88;
  const original = store.getRevision(project.id, project.latestRevision.id);
  assert.equal(original.parameters.height, 12);
  const saved = store.createRevision(project.id, { templateVersion: 1, parameters: { ...part.parameters, height: 22 }, description: '', baseRevision: 1 });
  assert.equal(saved.description, '');
  assert.equal(store.getRevision(project.id, original.id).description, 'First note');
  const before = store.getProject(project.id);
  assert.throws(() => store.createRevision(project.id, { templateVersion: 1, parameters: part.parameters, baseRevision: 1 }), { status: 409, code: 'REVISION_CONFLICT' });
  assert.deepEqual(store.getProject(project.id), before);
  const next = store.createRevision(project.id, { templateVersion: 1, parameters: part.parameters, baseRevision: 2 });
  assert.equal(next.number, 3);
  assert.equal(next.description, '');
});

test('paginated revision history is newest first and deletion removes every snapshot', t => {
  const { store, part } = setup(t);
  const project = store.createProject(part);
  for (let number = 2; number <= 13; number++) {
    store.createRevision(project.id, { templateVersion: 1, parameters: { ...part.parameters, height: number }, baseRevision: number - 1 });
  }
  const first = store.listRevisions(project.id, { limit: 10, offset: 0 });
  const older = store.listRevisions(project.id, { limit: 10, offset: 10 });
  assert.equal(first.total, 13);
  assert.deepEqual([...first.revisions, ...older.revisions].map(revision => revision.number), Array.from({ length: 13 }, (_, i) => 13 - i));
  const revisionId = first.revisions[0].id;
  store.deleteProject(project.id);
  assert.throws(() => store.getRevision(project.id, revisionId), { status: 404 });
  assert.equal(store.listProjects({ limit: 10, offset: 0 }).total, 0);
  store.close(); store.close(); // Cleanup remains safe when called more than once.
});
