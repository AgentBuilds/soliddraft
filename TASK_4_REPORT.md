# Task 4: Polish, tests and README

## Changes

- Added core tests for defaults, finite numbers, unknown fields, decimal geometry
  boundaries, zero holes, text limits, pagination and exact UTF-8 request size limits.
- Fixed spacer validation rejecting a mathematically valid 1 mm radial wall
  (`outerDiameter: 3.01`, `innerDiameter: 1.01`) due to binary rounding. Tolerance
  is restricted to floating-point precision; visibly thinner walls still fail.
- Added storage tests for complete transaction rollback after failed writes,
  recovery after failure, independent snapshots, clearing/inheriting descriptions,
  revision conflicts, history pagination and deletion.
- Added frontend regressions for canceling draft navigation, protected dimension
  resets, empty dimensions, oversized text, escaped user content, stale list reads
  and repeated pagination activation.
- Reset defaults now confirms before replacing edited dimensions while keeping
  part text. Loading disables library refresh and blocks duplicate history/library
  append requests. Name/description limits have actionable inline feedback.
- Added a JavaScript-disabled message. Updated the Node engine requirement to
  22.13+, matching unflagged built-in SQLite support.
- Rewrote README with development/production commands, PowerShell alternatives,
  configuration, workbench instructions, tests, storage backups and troubleshooting.
  Current features and planned model/CAD/STL features are clearly distinguished.
- Production acceptance now runs the complete suite after build and live smoke checks.

## Verification

On Node v24.15.0:

- `npm.cmd install --no-audit --no-fund --prefer-offline`: passed, no new dependencies.
- `npm.cmd test`: passed after the initial regression fixes.
- `npm.cmd run test:acceptance`: production build, live HTTP smoke and all 26 tests passed.
- `git diff --check`: passed.

All tests and the temporary browser-check server use isolated storage. Existing
`data/soliddraft.sqlite` was not used or changed by verification. The temporary
server was stopped after the browser attempt.

## Limits

Real-browser verification could not run: the in-app browser was unavailable, and
the available Chrome surface failed twice with “Unable to load browser
request-header policy.” DOM-adapter workflow tests passed, but visual layout,
native dialog focus and browser-console checks remain unverified.

The requested `git add -A` and `git commit -m "task 4: Polish, tests and README"`
were attempted. Git cannot create `.git/index.lock` because `.git` is read-only
under the workspace permissions, so no commit was created. Changes remain in the
working tree for a writable Git environment.
