# FEAT-011 · Ramp reversal (`palette: { name, reverse: true }`)

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Build diary, open questions; `dd.md §12.5.3`.

## What

Being able to reverse a ramp without writing another palette. The `dark` theme uses `viridis` today because it does not exist.

## Acceptance criteria

Typed in the `variant` discriminated union and tested in `src/core/palettes`.
