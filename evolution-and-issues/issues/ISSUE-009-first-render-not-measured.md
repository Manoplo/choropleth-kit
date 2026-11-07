# ISSUE-009 · Render budgets not rigorously measured

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Step 37; `dd.md §14.2`.

## What happens

Measured in real Chrome (3,600 regions and 1,000 bubbles): `Root` does not re-render on hover, zoom or pan, and there are no long animation frames. **Not rigorously measured:** «first render of the world < 50 ms» and «60 fps with world + 500 bubbles».

## Ideas

A measurement script in real Chrome with `performance.mark` and traces, ideally inside FEAT-008.
