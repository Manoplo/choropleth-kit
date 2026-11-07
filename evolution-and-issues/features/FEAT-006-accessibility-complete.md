# FEAT-006 · Full accessibility

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** high
- **Origin:** `dd.md §13`; build diary, human decision: accessibility **last**, outside the MVP.

## What

- `role="img"` and `aria-label` on the `<svg>`, a `DataTable` (alternative table with the same data).
- Spatial arrow-key navigation between regions; focusable regions; visible focus on layers.
- `Enter` on a focused region (drill down); focus as an intent to drill (`dd.md §11.2.2`).
- `aria-live` for drill and selection announcements.
- A legend that is keyboard-focusable.

## Why

Today there is only semantic structure in the breadcrumb, `Escape`/Backspace and keyboard zoom. It is the biggest gap for corporate use.

## Acceptance criteria

Pass a screen-reader review (VoiceOver) and axe with no critical errors; keyboard tests in jsdom and a check in real Chrome.
