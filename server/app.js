import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { templates, getTemplate, validateParameters } from './templates.js';
import { createStore } from './store.js';
import { ApiError, readJson, validateObject, textField, pagination } from './validation.js';

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/src/main.js', ['src/main.js', 'text/javascript; charset=utf-8']],
  ['/src/styles.css', ['src/styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

export function createApp({ distDir = defaultDist, dev = false, databasePath = process.env.DB_PATH } = {}) {
  const store = createStore(databasePath);
  const server = createServer(async (req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const json = (status, body) => send(status, 'application/json; charset=utf-8', JSON.stringify(body));
    const method = allowed => {
      if (!allowed.includes(req.method)) {
        res.setHeader('Allow', allowed.join(', '));
        throw new ApiError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
      }
    };
    try {
      let url;
      try { url = new URL(req.url, 'http://localhost'); }
      catch { throw new ApiError(400, 'Request URL is invalid', 'INVALID_URL'); }
      if (url.pathname === '/api/health') {
        method(['GET', 'HEAD']);
        store.health();
        return json(200, { status: 'ok', service: 'soliddraft', version: '0.1.0' });
      }
      if (url.pathname === '/api/templates') {
        method(['GET', 'HEAD']);
        return json(200, { templates, units: 'mm' });
      }
      const templateRoute = url.pathname.match(/^\/api\/templates\/([^/]+)(\/validate)?$/);
      if (templateRoute) {
        method(templateRoute[2] ? ['POST'] : ['GET', 'HEAD']);
        const template = getTemplate(templateRoute[1]);
        if (!templateRoute[2]) return json(200, { template, units: 'mm' });
        const body = await readJson(req);
        validateObject(body, ['parameters']);
        return json(200, { templateId: template.id, templateVersion: template.version, parameters: validateParameters(template, body.parameters), units: 'mm' });
      }
      if (url.pathname === '/api/projects') {
        method(['GET', 'HEAD', 'POST']);
        if (req.method !== 'POST') return json(200, store.listProjects(pagination(url.searchParams)));
        const body = await readJson(req);
        validateObject(body, ['name', 'templateId', 'description', 'parameters']);
        const name = textField(body.name, 'name', 120, { required: true });
        const templateId = textField(body.templateId, 'templateId', 30, { required: true });
        const template = getTemplate(templateId);
        const description = textField(body.description === undefined ? '' : body.description, 'description', 4000);
        const project = store.createProject({ name, template, description, parameters: validateParameters(template, body.parameters) });
        res.setHeader('Location', `/api/projects/${project.id}`);
        return json(201, { project });
      }
      const projectRoute = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(revisions)(?:\/([^/]+))?)?$/);
      if (projectRoute) {
        const [, id, revisions, revisionId] = projectRoute;
        method(revisionId ? ['GET', 'HEAD'] : revisions ? ['GET', 'HEAD', 'POST'] : ['GET', 'HEAD', 'PATCH', 'DELETE']);
        if (!revisions) {
          if (req.method === 'DELETE') { store.deleteProject(id); return send(204, 'application/json; charset=utf-8', undefined); }
          if (req.method === 'PATCH') {
            store.getProject(id);
            const body = await readJson(req);
            validateObject(body, ['name']);
            return json(200, { project: store.renameProject(id, textField(body.name, 'name', 120, { required: true })) });
          }
          return json(200, { project: store.getProject(id) });
        }
        if (revisionId) return json(200, { revision: store.getRevision(id, revisionId) });
        if (req.method !== 'POST') return json(200, store.listRevisions(id, pagination(url.searchParams)));
        const project = store.getProject(id);
        const body = await readJson(req);
        validateObject(body, ['description', 'parameters', 'baseRevision']);
        if (!Object.hasOwn(body, 'parameters')) throw new ApiError(422, 'parameters are required when saving a revision', 'VALIDATION_ERROR');
        if (body.baseRevision !== undefined && (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 1)) {
          throw new ApiError(422, 'baseRevision must be a positive integer', 'VALIDATION_ERROR');
        }
        const template = getTemplate(project.templateId);
        const description = body.description === undefined ? undefined : textField(body.description, 'description', 4000);
        const revision = store.createRevision(id, {
          templateVersion: template.version, description, parameters: validateParameters(template, body.parameters), baseRevision: body.baseRevision,
        });
        res.setHeader('Location', `/api/projects/${id}/revisions/${revision.id}`);
        return json(201, { revision });
      }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) throw new ApiError(404, 'API endpoint not found', 'NOT_FOUND');
      method(['GET', 'HEAD']);
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
      if (error instanceof ApiError) {
        if (!res.headersSent) json(error.status, { error: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) });
        else res.end();
        return;
      }
      console.error('Request failed:', error.message);
      if (!res.headersSent) json(500, { error: 'Internal server error', code: 'INTERNAL_ERROR' });
      else res.end();
    }
  });
  server.on('close', () => store.close());
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
