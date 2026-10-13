# Task 5: Fix review findings (#3)

The reported skip-link defect is already fixed in the inherited task 4 code.
The link has `data-skip`; the delegated click handler calls `preventDefault()`,
focuses `#content`, and returns before any navigation handling. The main content
has `tabindex="-1"` so it can receive focus. No further runtime change is needed.

Expanded the existing regression in `test/frontend.test.js` to activate the
shipped skip-link handler in four states: an edited new draft, a saved part,
an edited saved part, and the saved-parts library. Each activation checks default
navigation cancellation, content focus, unchanged hash, router token, full editor
state and page markup, and absence of a discard dialog.

Verification: `npm.cmd run test:acceptance` passed the production build, live HTTP
smoke checks and all 28 tests. Checks used isolated databases and disposable
ports. The skip-link test uses the existing DOM adapter; native browser keyboard
activation was not separately verified during this task.

`git diff --check` passed. Both the requested `git add -A` and
`git commit -m "task 5: Fix review findings (#3)"` failed because Git could not
create `.git/index.lock` (permission denied). The test and report changes remain
uncommitted in the working tree.
