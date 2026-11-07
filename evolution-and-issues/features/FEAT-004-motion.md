# FEAT-004 · Motion ⭐: animations and the `animation` prop

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** `dd.md §12.4.4` and §21 task 23; build diary, «Post-MVP → Motion».

## What

Motion tokens, `use-motion`, the `animation` prop and the effects catalog: wave, staggered entrance, explosion, a selection that draws itself, bubble pop/FLIP, liquid tooltip, lift.

## Prior decision

Are `hoverEffect: "lift"` and `animation.reveal: "stagger"` on by default or opt-in in the preset? (`dd.md §21`, «ask the human»).

## Acceptance criteria

- No animation libraries (`dd.md §12.6`).
- With `prefers-reduced-motion` there is no movement (only fades ≤ 100 ms).
- Stories `Motion/Showcase` and `Motion/ReducedMotion`.
