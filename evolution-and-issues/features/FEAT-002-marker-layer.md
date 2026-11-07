# FEAT-002 · `Marker` layer (HTML that follows the map)

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** `dd.md §21` task 24; build diary, «Post-MVP → Decorative layers».

## What

An HTML element (pin, card) anchored to a `[lon, lat]` coordinate that follows the map on zoom and pan without re-rendering React per frame.

## Acceptance criteria

- Position written straight to the DOM from the zoom (the «nothing per frame in React» rule).
- Optional counter-scaling and clipping outside the view.
- A story, and a test that moving the camera does not re-render the marker.
