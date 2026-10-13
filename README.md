# SolidDraft

> A web workbench where makers describe a bracket, enclosure, or spacer and receive an editable 3D preview with downloadable STL files. A local model converts requests into validated parameters for trusted CAD templates, while the backend renders parts and saves revisions; three templates keep the MVP within roughly 12 tasks.

_Bu loyiha AI Farm tomonidan avtonom tarzda qurilmoqda..._

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```sh
npm install --no-audit --no-fund --prefer-offline
npm run dev
```

Open http://127.0.0.1:3000. Native Node.js serves the browser frontend and API
together. The server restarts on backend changes; refresh to see frontend edits.
On PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

```sh
npm run build
npm start
npm test
```

With the service running, verify its public assets and read endpoints using
`node scripts/smoke.js http://127.0.0.1:3000`.

The production server serves the built frontend and API together at
http://127.0.0.1:3000. Set `PORT` and `HOST` to change the server address;
both development and production use the same server and origin.

## Backend and workbench scope

- `GET /api/health`: service health and version.
- `GET /api/templates`: the bracket, enclosure and spacer reference catalogue.
- `GET /api/templates/:id` and `POST /api/templates/:id/validate`: parameter
  schemas, defaults, ranges and geometry checks for the trusted templates.
- `/api/projects`: create, list, read, rename and delete saved parts.
- `/api/projects/:id/revisions`: save and read immutable parameter revisions.
- `src/`: browser JavaScript workbench and responsive styles.
- `server/`: native Node.js HTTP application and server entry point.
- `test/`: API and static-file handler checks using Node's built-in test runner.
- `DESIGN_SYSTEM.md`: palette, typography and interaction tokens.

SQLite saves projects and revisions to `data/soliddraft.sqlite` by default. Restarting
the server preserves them. Set `DB_PATH` to select another database file. The server
creates its directory and schema automatically; data is excluded from Git and static
serving. Node's built-in SQLite keeps the backend dependency-free. Keep the default
loopback host for this local MVP, which has no accounts or authentication.

See [API.md](API.md) for request/response contracts, validation, pagination and
examples. Tests use isolated databases and verify HTTP requests plus persistence
across server restarts and in a separate Node process. No sample user projects are
inserted; the three template definitions supply useful starting parameters.

The page supports template selection and a session-only request draft. Reference
illustrations are static SVG drawings, not generated CAD. Local model integration,
editable 3D geometry, STL downloads and frontend save/history controls are left
for subsequent tasks. Parameter validation and revision storage are available through
the API. No external services are required.

This scaffold has no third-party runtime or build dependencies. `npm install`
creates the lockfile without registry downloads; `npm run build` assembles the
static frontend in `dist/`. Static assets are explicitly allowlisted; repository
files and configuration are never served.
