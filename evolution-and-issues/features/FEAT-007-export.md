# FEAT-007 · Export: `toSVGString` and `toPNG`

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** `dd.md §9.5`; build diary, «Post-MVP → Export and quality».

## What

Handle methods to export the current map (with the current camera and theme) to SVG and PNG.

## Acceptance criteria

The exported SVG looks the same outside the page (inline styles, not depending on `styles.css`); a smoke test in real Chrome.
