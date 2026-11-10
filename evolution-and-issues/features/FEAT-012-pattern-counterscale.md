# FEAT-012 · Patterns that do not scale with zoom

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Build diary, step 36.3 and open questions.

## What

Counter-scale the `<pattern>` from `use-zoom` so the «no data» hatching keeps its density when zooming in.

## Acceptance criteria

The hatching's stroke width and spacing are constant in screen pixels; no React renders per frame.
