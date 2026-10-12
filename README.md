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

The production server serves the built frontend and API together at
http://127.0.0.1:3000. Set `PORT` and `HOST` to change the server address;
both development and production use the same server and origin.

## Scaffold scope

- `GET /api/health`: service health and version.
- `GET /api/templates`: the bracket, enclosure and spacer reference catalogue.
- `src/`: browser JavaScript workbench and responsive styles.
- `server/`: native Node.js HTTP application and server entry point.
- `test/`: API and static-file handler checks using Node's built-in test runner.
- `DESIGN_SYSTEM.md`: palette, typography and interaction tokens.

The page supports template selection and a session-only request draft. Reference
illustrations are static SVG drawings, not generated CAD. Local model integration,
parameter validation, editable 3D geometry, revision storage and STL downloads
are intentionally left for subsequent tasks. No external services are required.

This scaffold has no third-party runtime or build dependencies. `npm install`
creates the lockfile without registry downloads; `npm run build` assembles the
static frontend in `dist/`. Static assets are explicitly allowlisted; repository
files and configuration are never served.
