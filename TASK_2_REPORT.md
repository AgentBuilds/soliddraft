# Task 2 — Implement the backend API

Implemented a dependency-free native Node.js API with SQLite persistence using
`node:sqlite`. The existing catalogue and health response remain compatible with
the scaffold frontend. No frontend components or design tokens were changed.

## Delivered

- Trusted bracket, enclosure and spacer parameter schemas, defaults, bounded
  numeric validation, cross-field geometry checks and a validation endpoint.
- Project create/list/read/rename/delete endpoints and immutable revision
  create/list/read endpoints. Creation saves revision 1 atomically. Optional
  baseRevision prevents stale saves without changing stored history.
- SQLite schema version 1, WAL, foreign keys, cascading revision deletion,
  unique per-project revision numbers, parameter JSON checks, prepared statements,
  transactional saves and database closure during server shutdown.
- Database creation at `data/soliddraft.sqlite`, optional DB_PATH configuration,
  isolated test databases, no automatic sample-project reseeding, and ignored
  database/test artifacts. Static serving continues to expose only public assets.
- Structured errors, HTTP method/Allow handling, list pagination, strict request
  fields, JSON content-type checks and a 64 KiB payload limit including chunked
  input. Oversized chunked requests retain their socket to deliver a JSON 413.
- [API.md](API.md) documents all routes, payloads, responses, validation, snapshot
  semantics, errors, local-only deployment and storage. README includes startup,
  persistence and the reusable `scripts/smoke.js` live HTTP check.

## Verification

- `npm.cmd test`: 10 tests passed. Coverage includes real HTTP CRUD, HEAD and
  method handling, pagination, strict validation, malformed JSON, request size
  limits, unsafe geometry, revision ownership/immutability, optimistic conflicts
  and concurrent saves.
- Persistence test saves a project and multiple revisions to an isolated disk
  database, closes/reopens the server, verifies data from an independent Node
  process, then deletes the project and verifies deletion after another restart.
- `npm.cmd run build`: passed, including syntax validation for all backend modules.
- `npm.cmd start` with PORT=3102: production service started successfully.
- `node scripts/smoke.js http://127.0.0.1:3102`: public HTML/JS/CSS/favicon plus
  health/catalogue/project-list endpoints all returned HTTP 200 and expected types.
- `git diff --check`: passed. Git also reports expected LF/CRLF conversion warnings.
- No package additions were needed; verified native SQLite on Node v24.15.0.

## Environment limits

The browser open attempt failed with `Unable to load browser request-header policy`;
the fallback in-app browser returned `Browser is not available: iab`. Browser
console errors and visible page behavior remain unverified in this run. Live HTTP
and automated backend checks passed independently of that browser limitation.

Attempted `git add -A` and
`git commit -m "task 2: Implement the backend API"`. Both failed with
`Unable to create '.git/index.lock': Permission denied`. This environment grants
read-only access to `.git`; no task commit was created. Source changes remain in
the working tree.

## Scope boundaries

The backend persists validated parameter snapshots and descriptions. Model parsing,
CAD rendering, 3D preview geometry, STL generation and frontend save/history controls
belong to later tasks. The unauthenticated local MVP uses loopback by default.
