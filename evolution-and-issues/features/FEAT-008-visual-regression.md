# FEAT-008 · Visual tests with Playwright

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** Build diary, «Post-MVP → Export and quality».

## What

Screenshots of the key stories compared in CI. Today visuals are reviewed by hand and `scripts/cdp-story.mjs` is a manual tool.

## Acceptance criteria

A CI job that fails on unapproved visual changes; see also ISSUE-003.
