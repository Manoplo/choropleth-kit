# ISSUE-002 · The test suite is slow

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** medium
- **Origin:** Build diary, «Known technical debt».

## What happens

The diary noted it at over 120 s; on the machine used to close the MVP (step 37) it took ≈ 45 s. It is also **sensitive to wall-clock time**: in one `pnpm verify` run at step 37, `drill-choreography.test.tsx` took 290 s and a test exceeded its 5 s limit (it passes in 44 s when repeated alone, using ~9 % CPU). About 28 tests use real d3 flights that do not advance with Vitest's fake timers.

## Ideas

Split the real-choreography tests into a separate Vitest project; or inject a clock into `use-zoom`.
