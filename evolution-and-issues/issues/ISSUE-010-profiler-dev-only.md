# ISSUE-010 · The `Profiler` in the performance story only measures in development

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Step 37 (`Performance/AdminLevel`).

## What happens

React disables `onRender` in production builds, so the static Storybook shows no commits. The «Root renders» counter (calls to `getId`) works in both.

## Ideas

Serve the public Storybook with React's profiling build, or document `pnpm storybook` for measuring.
