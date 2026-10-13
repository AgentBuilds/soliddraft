# SolidDraft design system

## Direction
A practical maker's workbench: an asymmetric editor beside a technical reference
canvas. Keep CAD controls clear and label unfinished capabilities honestly.

## Color and hierarchy
Use HSL tokens in `src/styles.css`. Allocate roughly 60% warm canvas
(`hsl(45 24% 95%)`), 30% graphite preview (`hsl(155 12% 15%)`) and 10% forest
canvas accents. Reserve the 10% accent share for forest validation and selection
(`hsl(155 42% 28%)`) and amber primary actions (`hsl(38 85% 64%)`) on graphite.
Paper panels use `hsl(45 30% 98%)`.
Ink is `hsl(155 15% 15%)`, secondary text `hsl(155 8% 35%)`.
Light-on-dark copy uses `hsl(45 24% 95%)`. Error copy uses `hsl(8 65% 35%)`.
Normal text must meet 4.5:1 contrast. Never communicate state through color alone.

## Typography
Trebuchet MS for navigation, headings and prose; Courier New for measurements,
labels and technical annotations. These deliberate locally available font families
avoid network font loading; sans-serif/monospace fallbacks preserve the hierarchy.
Body and textarea: 16px / 1.6. Headings: compact and left-aligned; labels and
annotations: at least 12px. Header and field labels wrap on narrow screens.

## Rhythm, shape and elevation
Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px. Panel radius: 16px; controls:
8px; status pills: 999px. Use subtle borders for grouping and one soft shadow
on the primary workbench. Do not stack elevated cards.

## Interaction and accessibility
Minimum 44px tap targets. Hover changes border/background, active changes
background, focus-visible uses a 3px ring with 3px offset. Disabled controls
use native disabled semantics with nearby reasons. Requests show loading,
empty and error states with a retry action. Use polite live announcements.
Transitions last 180ms and affect color/opacity only. Honor reduced motion.
Layout starts as one column, then becomes two columns at 980px. Ensure long
content wraps and every flex/grid child can shrink. Keyboard operation is native.

## Workbench structure
The header provides Workbench and Saved parts navigation. The workbench has an
API-driven template selector, named part/request form, dimension fields, validation
summary and save action. A graphite reference panel shows the selected template,
current dimension readout and saved revision history. Saved parts use compact
rows with real revision numbers, dates and pagination; never fabricated metrics.
On mobile, form, reference and history stack in reading order. Errors appear next
to fields and in a linked, focusable summary. Native dialogs confirm discarding
drafts, renaming and permanent deletion; Escape cancels and focus returns to the
trigger. Loading locks affected controls without losing entered values. History
and library pagination preserve loaded rows on failure. A snapshot currently
being edited stays available in history while its next page is loading.

## Task 3 boundaries
The illustration is a static template reference, not generated or validated CAD.
Dimension readouts reflect the draft, while API validation checks parameter rules.
Request descriptions are saved verbatim; they do not produce parameters. Projects
and immutable revisions persist through the API. Selecting history copies a
snapshot into the editor; saving appends a new revision using the latest known
base revision. Stale writes retain the draft and offer to reload. Local-model
parsing, generated 3D geometry and STL export remain later tasks.
