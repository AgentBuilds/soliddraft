import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ApiError } from './validation.js';

export const defaultDatabasePath = fileURLToPath(new URL('../data/soliddraft.sqlite', import.meta.url));

export function createStore(databasePath = defaultDatabasePath) {
  if (databasePath !== ':memory:') mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
    `);
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Database schema is newer than this server supports');
    if (version === 0) db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, template_id TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE revisions (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        number INTEGER NOT NULL CHECK(number > 0), template_version INTEGER NOT NULL,
        description TEXT NOT NULL, parameters TEXT NOT NULL CHECK(json_valid(parameters)),
        created_at TEXT NOT NULL, UNIQUE(project_id, number)
      ) STRICT;
      CREATE INDEX projects_updated ON projects(updated_at DESC, id);
      PRAGMA user_version = 1;
      COMMIT;
    `);
  } catch (error) {
    db.close();
    throw error;
  }
  const revision = row => row && ({
    id: row.id, projectId: row.project_id, number: row.number, templateVersion: row.template_version,
    description: row.description, parameters: JSON.parse(row.parameters), createdAt: row.created_at,
  });
  const latest = id => revision(db.prepare('SELECT * FROM revisions WHERE project_id = ? ORDER BY number DESC LIMIT 1').get(id));
  const project = row => ({ id: row.id, name: row.name, templateId: row.template_id, createdAt: row.created_at, updatedAt: row.updated_at, latestRevision: latest(row.id) });
  const requireProject = id => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) throw new ApiError(404, 'Project not found', 'NOT_FOUND');
    return row;
  };
  const transaction = action => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const insertRevision = (projectId, number, templateVersion, description, parameters, now) => {
    const id = randomUUID();
    db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, projectId, number, templateVersion, description, JSON.stringify(parameters), now);
    return revision(db.prepare('SELECT * FROM revisions WHERE id = ?').get(id));
  };
  let closed = false;
  return {
    close() { if (!closed) { db.close(); closed = true; } },
    health() { db.prepare('SELECT 1').get(); },
    getProject(id) { return project(requireProject(id)); },
    listProjects({ limit, offset }) {
      return { projects: db.prepare('SELECT * FROM projects ORDER BY updated_at DESC, id LIMIT ? OFFSET ?').all(limit, offset).map(project), total: db.prepare('SELECT count(*) AS total FROM projects').get().total, limit, offset };
    },
    createProject({ name, template, description, parameters }) {
      return transaction(() => {
        const id = randomUUID(); const now = new Date().toISOString();
        db.prepare('INSERT INTO projects VALUES (?, ?, ?, ?, ?)').run(id, name, template.id, now, now);
        insertRevision(id, 1, template.version, description, parameters, now);
        return project(requireProject(id));
      });
    },
    renameProject(id, name) {
      requireProject(id);
      db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name, new Date().toISOString(), id);
      return project(requireProject(id));
    },
    deleteProject(id) { requireProject(id); db.prepare('DELETE FROM projects WHERE id = ?').run(id); },
    listRevisions(id, { limit, offset }) {
      requireProject(id);
      return { revisions: db.prepare('SELECT * FROM revisions WHERE project_id = ? ORDER BY number DESC LIMIT ? OFFSET ?').all(id, limit, offset).map(revision), total: db.prepare('SELECT count(*) AS total FROM revisions WHERE project_id = ?').get(id).total, limit, offset };
    },
    getRevision(id, revisionId) {
      requireProject(id);
      const row = db.prepare('SELECT * FROM revisions WHERE project_id = ? AND id = ?').get(id, revisionId);
      if (!row) throw new ApiError(404, 'Revision not found', 'NOT_FOUND');
      return revision(row);
    },
    createRevision(id, { templateVersion, description, parameters, baseRevision }) {
      return transaction(() => {
        requireProject(id);
        const previous = latest(id);
        if (baseRevision !== undefined && previous.number !== baseRevision) throw new ApiError(409, 'Project has a newer revision; reload before saving', 'REVISION_CONFLICT');
        const now = new Date().toISOString();
        const saved = insertRevision(id, previous.number + 1, templateVersion, description ?? previous.description, parameters, now);
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, id);
        return saved;
      });
    },
  };
}
