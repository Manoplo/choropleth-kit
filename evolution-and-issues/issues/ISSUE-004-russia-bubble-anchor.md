# ISSUE-004 · Anchor of Russia's bubbles (antimeridian)

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** Build diary, open questions (§26.8).

## What happens

`getAnchorPoint` projects the ring that crosses ±180° vertex by vertex. Visually it looked plausible, but it is not guaranteed.

## Criteria to close it

A specific test (Russia and Fiji) with the expected anchor inside the main polygon.
