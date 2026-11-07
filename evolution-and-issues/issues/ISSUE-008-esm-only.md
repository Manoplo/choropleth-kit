# ISSUE-008 · ESM-only package

- **Type:** Issue
- **Status:** proposed
- **Priority (proposed):** low
- **Origin:** Step 37 (`attw`).

## What happens

`require("choropleth-kit")` fails in CommonJS (`await import()` works). It is deliberate in the MVP (React ≥ 18, modern bundlers).

## Ideas

Add a CJS output with `tsup` only if a real consumer asks for it.
