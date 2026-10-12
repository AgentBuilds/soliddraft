# SolidDraft design system

## Direction
A practical maker's workbench: an asymmetric editor beside a technical reference
canvas. Keep CAD controls clear and label unfinished capabilities honestly.

## Color and hierarchy
Use HSL tokens in `src/styles.css`. Allocate roughly 60% warm canvas
(`hsl(45 24% 95%)`), 30% graphite preview (`hsl(155 12% 15%)`) and 10% forest
accent (`hsl(155 42% 28%)`). Paper panels use `hsl(45 30% 98%)`.
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
Layout starts as one column, then becomes two columns at 900px. Ensure long
content wraps and every flex/grid child can shrink. Keyboard operation is native.

## Scaffold boundaries
The illustration is a static template reference, not generated or validated CAD.
Template selection reads the API. Request text is a session-only draft. Generation,
editable geometry, persistence and STL export are later tasks.
