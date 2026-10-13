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
- Fixed the keyboard skip link triggering hash-based navigation. It now focuses
  the workbench without changing the route or prompting to discard an edited draft.
- Fixed bracket hole clearance accepting decimal equality because the sum rounded
  below the strict boundary. Only floating-point precision is treated as equality;
  positive measurable margins still pass. Added core and HTTP regression coverage.
- Added a skip-link regression for focus, route stability and unsaved draft
  preservation. Updated README and API documentation to describe these behaviors.

## Verification

On Node v24.15.0:

- `npm.cmd install --no-audit --no-fund --prefer-offline`: passed, no new dependencies.
- `npm.cmd test`: all 26 inherited tests passed before this completion pass.
- The two new regressions failed against the old implementation, reproducing both
  defects. After fixes, the focused core/frontend/backend run passed all 22 tests.
- `npm.cmd run test:acceptance`: production build, live HTTP smoke and all 28 tests passed.
- `git diff --check`: passed.

All tests and the acceptance service use isolated storage and disposable ports.
Existing `data/soliddraft.sqlite` was not used by verification. The acceptance
service was shut down after the HTTP checks.

## Limits

DOM-adapter workflow tests passed; real-browser visual layout, native dialog
focus and browser-console checks remain unverified. The earlier task 4 browser
attempt was blocked by unavailable browser surfaces/request-header policy.
The README includes a manual browser verification checklist.

The requested `git add -A` and
`git commit -m "task 4: Polish, tests and README"` both failed with
`Unable to create .../.git/index.lock: Permission denied`. No task 4 commit was
created; the completed changes remain in the working tree. The environment's
read-only Git permissions could not be changed within this task.
