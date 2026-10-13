# Task 3 — Build the frontend UI

Completed the API-connected vanilla JavaScript workbench left by the timed-out
attempt. The main editor has three trusted templates, a named request draft,
editable millimetre dimensions, live dimension readouts, linked field errors,
parameter validation and save controls. Saved parts have direct links, pagination,
rename/delete dialogs and immutable revision history. Loading an old snapshot
and saving it creates a new revision. Conflicts and failed writes preserve drafts;
unsaved navigation prompts before discarding changes.

The mobile-first design uses the documented HSL palette, Trebuchet MS/Courier New
pairing, spacing/radius tokens, visible focus, 44px controls, semantic form labels,
live announcements and reduced-motion support. Static SVG template illustrations
are explicitly labelled as reference drawings. Request text parsing, generated
3D CAD and STL export remain later tasks because those APIs do not yet exist.

Added readable malformed-response errors and request locking for history controls.
Updated README and DESIGN_SYSTEM.md. No runtime dependencies were added.

## Verification

- `npm.cmd run build`: passed.
- `npm.cmd test`: all 13 tests passed, including three new frontend regressions.
- `npm.cmd run test:acceptance`: passed production build, automatically started
  service, seven HTTP smoke checks, and all three frontend workflow tests.
- Frontend regression coverage: validation, creating/saving/restoring revisions,
  renaming, library navigation, deletion, revision conflicts, network failures,
  malformed API responses, connection retry and empty library.
- Acceptance checks use an ephemeral loopback port and in-memory SQLite, leaving
  existing user projects intact. The service closes after checks.
- `git diff --check`: passed.
- Seven primary text/background token combinations passed computed 4.5:1 contrast
  checks (ratios ranged from 5.70:1 to 13.93:1).

## Remaining verification limits

Real-browser visual/responsive checks and browser-console verification could not
run. The available Chrome connector twice returned `Unable to load browser
request-header policy`; the in-app browser was unavailable. Installing Playwright
with the required shared-cache npm command failed with EPERM on the shared cache.
No cache override or permission changes were made. Frontend tests use a small DOM
adapter and the actual HTTP API; they do not claim browser rendering coverage.

The requested `git add -A` and `git commit -m "task 3: Build the frontend UI"`
both failed because Git could not create `.git/index.lock` (Permission denied).
Source changes and this report remain in the workspace; no commit was created.
