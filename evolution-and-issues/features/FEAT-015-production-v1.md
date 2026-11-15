# FEAT-015 · Production and v1.0

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** high
- **Origin:** `dd.md §17`, §18; build diary, «Post-MVP → Production and v1.0».

## What

**Where we are:** `0.1.0` was published **by hand** on 2026-11-12 ([npm](https://www.npmjs.com/package/choropleth-kit)). What is left is
to automate it and to harden what surrounds it.

- Public Storybook / docs (see FEAT-014).
- `changesets` (versioning and changelog) and publishing from CI with provenance.
- **Legal review of geodata and disputed borders** (Northern Cyprus, Somaliland, Western Sahara…).
- Inventory of dependency and geodata licenses (Natural Earth, `world-atlas`).

## Acceptance criteria

A release published by CI with provenance (the first one, `0.1.0`, was manual); a license inventory in the repo; a link to the public docs in the README.
