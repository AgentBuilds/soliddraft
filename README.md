# SolidDraft

A local workbench for brackets, enclosures and spacers. Choose a trusted template,
edit dimensions in millimetres, check its geometry rules, and save immutable
revisions in SQLite.

**Available now:** three templates, editable parameters, inline errors, a dimension
readout, saved parts, rename/delete actions, and paginated revision history.
The reference drawings are static SVG illustrations. Descriptions are stored
with revisions. Local-model parsing, generated 3D geometry and STL downloads are
planned features; they are not implemented yet.

## Main features

- Bracket, enclosure and spacer templates with editable millimetre dimensions.
- Range and geometry validation with inline feedback and dimension readouts.
- A saved-part library with rename, delete and paginated revision history.
- Immutable revisions, snapshot restoration and concurrent-save conflict handling.
- Responsive layouts, keyboard navigation and unsaved-edit protection.
- Local SQLite persistence without accounts, API keys or external services.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla JavaScript ES modules, HTML, CSS and SVG reference drawings |
| Backend | Node.js native HTTP server with a JSON REST API |
| Storage | SQLite through Node's built-in `node:sqlite` module |
| Build | Node.js scripts for syntax checks and static asset copying |
| Verification | Node's built-in test runner, HTTP smoke checks and acceptance QA |

## Requirements

- Node.js **22.13+**; Node 24 is recommended. Check with `node --version`.
  The built-in [SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html)
  became available without an experimental flag in Node 22.13.
- npm and a modern browser with JavaScript enabled.

There are no third-party runtime or build dependencies. No CAD tools, database
server, API keys or external services are needed for the current workbench.

## Setup and development

Run from the project root:

```sh
npm ci --no-audit --no-fund --prefer-offline
npm run dev
```

Open **http://127.0.0.1:3000**. The Node server serves the frontend and API on the
same origin. Backend edits restart the development server; reload the browser
after frontend edits. Stop it with **Ctrl+C**.

If PowerShell blocks `npm.ps1`, use `npm.cmd`:

```powershell
npm.cmd ci --no-audit --no-fund --prefer-offline
npm.cmd run dev
```

## Build and run

```sh
npm run build
npm start
```

The build checks JavaScript syntax and copies public frontend assets into `dist/`.
The production server serves those assets plus the API at the same address.
Rebuild after changing the frontend. `npm start` needs a build; `npm run dev`
serves source files directly.

| Setting | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Server binding; keep loopback for local use |
| `PORT` | `3000` | Integer from 1 to 65535 |
| `DB_PATH` | `data/soliddraft.sqlite` | SQLite file; relative paths use the current directory |

Settings are environment variables, not an automatically loaded `.env` file.
An optional [.env.example](.env.example) documents the defaults. Copy it to `.env`
and edit the values, then explicitly load it with Node after building:

```sh
node --env-file=.env server/index.js
```

For development with the same file:

```sh
node --env-file=.env --watch server/index.js --dev
```

The `.env` file is ignored by Git. Existing shell environment variables take
precedence over values loaded from the file.

For example, use another port and database in PowerShell:

```powershell
$env:PORT = '3100'
$env:DB_PATH = './data/workshop.sqlite'
npm.cmd run dev
```

Or on macOS/Linux:

```sh
PORT=3100 DB_PATH=./data/workshop.sqlite npm run dev
```

## Use the workbench

1. Choose Bracket, Enclosure or Spacer. Give the part a name and set dimensions.
2. Select **Check dimensions** for range and cross-field geometry validation.
   A hole diameter of `0` makes a solid spacer or a bracket without screw holes.
3. **Save part** creates revision 1 and opens the saved part. Subsequent saves
   append revisions; the saved part's template stays fixed.
4. Open **Saved parts** to resume a project. **Use revision** loads an older
   snapshot into the editor; saving creates a new revision without editing history.

Navigation asks before discarding edits. Resetting edited dimensions asks for
confirmation and retains the name and description. Closing/reloading the page
can warn about unsaved work; drafts are not persisted until saved.
Keyboard users can select **Skip to content** to focus the workbench while
keeping the current draft and route.
Concurrent revision writes preserve the losing draft and offer **Reload latest
revision**. Copy edits you need before accepting that reload. Deleting a part
also deletes all its revisions and requires confirmation.
Refreshing history shows the newest known snapshot without rebasing unsaved edits.
Choosing **Use revision** on a newer snapshot advances the save base; edits to that
snapshot can then be saved normally. Another intervening save still returns a conflict.

Direct links use `#/parts`, `#/new/bracket`, `#/new/enclosure`, `#/new/spacer`,
and `#/projects/<id>`. Parameter validation does not certify strength or printability.

## Tests and verification

```sh
npm run lint
npm test
npm run test:acceptance
```

`npm run lint` checks JavaScript syntax in the server, frontend, scripts and tests
using Node; it does not require a separate lint dependency.

`npm test` uses Node's built-in runner for core validation, exact request limits,
SQLite transaction rollback/snapshot isolation, HTTP contracts and persistence,
concurrent saves, and frontend workflows. It requires no running service.
Regressions cover decimal geometry boundaries and keyboard skip navigation
preserving unsaved edits.

`npm run test:acceptance` builds the app, starts a temporary production HTTP
service, checks public assets and every API route including CRUD, pagination,
concurrent saves and invalid requests, shuts it down, and runs the entire
test suite. Tests use in-memory databases or disposable files under `test/.tmp/`
and ephemeral ports; they preserve your saved parts. The frontend regression
tests use a DOM adapter with the real API, not a full browser engine.

For a running service, a read-only smoke check is also available:

```sh
node scripts/smoke.js http://127.0.0.1:3000
```

For the deeper HTTP checks against a running **isolated local test server**, use
`node scripts/qa.js http://127.0.0.1:3000`. This creates QA parts and deletes only
those created IDs on completion; `test:acceptance` runs it in memory automatically.
Each acceptance subprocess has a 30-second deadline; individual deep HTTP requests
have a 5-second timeout, so stalled checks fail instead of running indefinitely.

For visual and keyboard checks, open the app in a real browser: try all templates,
submit an empty name or dimension, cancel/confirm a dimension reset, save and
restore a revision, navigate with unsaved edits, and inspect the library at a
narrow viewport. Tab through controls and check the browser console for errors.

## Storage and troubleshooting

SQLite initializes its directory/schema on startup. Saved parts survive server
restarts; no sample projects are inserted. `data/`, `dist/` and test scratch files
are excluded from Git. The static server allowlists public assets and does not
expose database or repository files.

For a backup, stop every server using the database before copying the SQLite file.
If backing up a live database, use a SQLite backup tool that handles WAL state;
copying only the main file can omit recent saves. Restore to another file and
select it with `DB_PATH`. The local app has no accounts or authentication.

| Symptom | Action |
| --- | --- |
| `node:sqlite` cannot be imported | Upgrade to Node 22.13+ (prefer Node 24), then retry |
| “Frontend not built” | Run `npm run build`, then restart with `npm start`, or use `npm run dev` |
| `EADDRINUSE` | Stop the other server or choose a different `PORT` |
| Workbench says API unavailable | Check the terminal/server address, then select **Retry connection** |
| SQLite cannot open the file | Ensure the `DB_PATH` directory is writable and has free space |
| Newer database schema error | Use a compatible server version or another database; do not erase saved data |

## Project layout

- `src/`: browser workbench and responsive styles.
- `index.html` and `public/`: frontend entry point and favicon.
- `server/`: native HTTP application, SQLite store, template catalogue and validation.
- `scripts/`: syntax/build, smoke and production acceptance checks.
- `test/`: core, storage, API and frontend regression tests.
- `.env.example`: optional server configuration defaults.
- `dist/` and `data/`: generated frontend assets and local databases (Git-ignored).
- [API.md](API.md): routes, JSON contracts, pagination and geometry rules.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): palette, typography and interaction tokens.
