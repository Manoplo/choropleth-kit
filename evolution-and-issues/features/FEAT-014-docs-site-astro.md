# FEAT-014 · Landing page and documentation site (Astro)

- **Type:** Feature
- **Status:** proposed
- **Priority (proposed):** high
- **Origin:** Author's decision (Manuel Martín), at the close of the MVP.

## What

A small landing page and a real, detailed documentation site built with Astro. It must serve two audiences:
other people adopting the library, and the author himself, as a place to try things out (a playground).

## Ideas

- Live examples that embed the library (the stories are a good starting point; Storybook could stay as the internal workbench).
- API reference generated from the TypeScript types and JSDoc (everything is now in English).
- Guides: getting started, variants, camera, drill-down, theming, geodata and borders, migrating between the three API levels.
- A playground page where props can be edited live.
- Public hosting (GitHub Pages or similar); link it from the README and from `package.json` (`homepage`).
- Decide where it lives: a `docs/` folder in this repo or a separate one (changesets and versioning notes in FEAT-015).

## Acceptance criteria

A deployed site with the landing page, the getting-started guide, one live example per variant and the API reference; linked from the README.
