# Task 6: Deep QA pass, round 1

Reviewed and completed the uncommitted work left by the timed-out attempt. Tested
the implemented parameter/revision workbench; generated CAD, local-model parsing
and STL export remain explicitly outside the current implemented feature set.

## Bugs fixed

- Malformed HTTP request targets such as `//[` produced an internal error.
  URL parsing now returns structured HTTP 400 `INVALID_URL`; a raw TCP check
  verifies the response and that subsequent health requests still succeed.
- Invalid UTF-8 in JSON silently became replacement characters in saved names.
  Fatal UTF-8 decoding rejects the input with HTTP 400 `INVALID_JSON`, preserving
  valid Unicode names. Regression checks verify no corrupted project is saved.
- Bare `/api` fell through to the static response instead of the API's JSON error
  contract. It now returns HTTP 404 `NOT_FOUND` consistently with unknown routes.
- Refreshing history after an external save labelled the old revision Latest.
  Latest now reflects the highest known revision. Explicitly loading a newer
  snapshot advances the save base, allowing subsequent edits to save; refreshing
  history alone retains the old base and protects unsaved drafts with HTTP 409.
- Acceptance subprocesses had no deadline. Both smoke and deep QA now have
  30-second subprocess deadlines, with failing script/signal identified in errors.

## Product checks and regression coverage

- Installed with `npm.cmd install --no-audit --no-fund --prefer-offline`.
- Started the documented `npm.cmd run dev` and `npm.cmd start` commands on
  loopback ports 3146 and 3147 with separate disposable SQLite databases under
  `test/.tmp/`; preserved the user's database and saved projects.
- Ran 161 live HTTP assertions against each mode and the isolated production
  acceptance server: every API route, public assets, GET/HEAD, create/read/rename/
  revise/delete for all templates, immutable history, cascade deletion,
  cross-project revision access, duplicate names, pagination, missing records,
  limits, malformed/empty/oversized input, unsupported methods/media types,
  invalid geometry, and simultaneous revision writes (one 201 and one 409).
  QA creates and cleans up only its own project IDs.
- Shipped frontend logic runs against a real HTTP backend in the DOM adapter.
  Covered all templates with numeric form edits, pending-write navigation guards,
  duplicate Save suppression, dialogs, validation focus, skipped navigation,
  rename/delete, revision adoption, paginated reads/retries, stale response
  rejection, draft preservation, connection errors and escaped user text.
- Reviewed prepared SQL statements and server-side validation. Credential pattern
  scan found no matching secrets; HTTP checks deny database, environment and
  server-source paths. User text containing HTML and SQL payloads remains data.
- Updated API error documentation and README QA/lint/deadline instructions.

## Final results

`npm.cmd run lint`: green (16 JavaScript files).
`npm.cmd run test:acceptance`: green (build, production smoke, 161 HTTP checks,
34 tests passed, zero failures).
`git diff --check`: green.
Direct development and production HTTP QA: green (161 checks each).

Browser visual/physical keyboard checks remain unverified: the computer-use
connector failed to load its browser request-header policy on inventory and tab
creation. No browser layout or console verification is claimed. The documented
manual browser checklist remains in README; DOM-adapter checks do not render CSS.

Commit could not be created: both `git add -A` and
`git commit -m "task 6: Deep QA pass - test the app end-to-end and fix bugs"`
failed with `Unable to create .git/index.lock: Permission denied`. Changes remain
in the working tree for the factory to commit after Git write access is restored.
