# ISSUE-003 · `scripts/cdp-story.mjs` is neither wired up nor in CI

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** Build diary, «Known technical debt».

## What happens

The check in real Chrome (mouse, touch, `getComputedStyle`) is manual and tied to specific stories and to Chrome's macOS path.

## Ideas

Solve it with FEAT-008 (Playwright) and retire the script.
