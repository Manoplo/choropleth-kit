# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 7 + Starlight (docs) + `@astrojs/react` islands. Static output, hosted free on Vercel (Root Directory = `website`). English only. The site consumes the published npm package `choropleth-kit`; it is isolated from the library (no monorepo).

## Users

Primary: React developers in a hurry who need a choropleth (thematic) map inside a dashboard or app. They land, must grasp "a map in ten lines" within seconds, and copy the install command. Secondary: developers comparing libraries (react-simple-maps, visx, d3 by hand).

## Product Purpose

choropleth-kit builds choropleth maps for React: SVG on top of d3-geo with zoom, drill-down, legends, tooltips and theming. The common case is ten lines; when more is needed the developer drops down a level without rewriting. The site must get a developer from "what is this" to a working map, then into a real documentation set.

## Positioning

Unlike react-simple-maps (a composable wrapper over d3), choropleth-kit is centred on getting a finished choropleth quickly: variants (sequential, diverging, categorical, bubble), camera, drill-down, legends and themes are included. Three API levels over one implementation: `<ChoroplethMap>` preset, `<Choropleth.*>` compound, `useChoropleth` headless.

## Capabilities and Constraints

- Four variants, cooperative zoom/pan with programmatic flights, drill-down (world → country → region), region labels, HTML markers, four themes (light, dark, minimal, contrast), `--cm-*` CSS variables, Tailwind `classNames`.
- ESM only, React >= 18 peer dependency, ships its own types. Geodata under `choropleth-kit/geo` (about 40 KB gzip) and per-country admin1 modules.
- Pre-1.0 (currently 0.3.0): the API may change.
- First delivery scope: landing, getting started, guides, gallery. Playground and generated API reference come later.

## Brand Commitments

Name: choropleth-kit (lowercase, hyphenated). Author: Manuel Martín. MIT licence. Everything is written in English.

## Evidence on Hand

Real: the library itself, the Storybook stories in `../stories`, the theme screenshot `../docs/assets/themes.png`, the README examples. Absent and must not be fabricated: users, testimonials, download counts, benchmarks. Any demonstration data (e.g. sales per country) must be labelled synthetic.

## Product Principles

1. Show the working map first; prose second.
2. Ten lines is the promise: the code on the page must be real, runnable and copyable.
3. Progressive depth: preset, then compound, then headless, never a rewrite.
4. Honest about status: pre-1.0, no invented social proof.
5. The page itself is performant: static HTML, map islands hydrate on demand.

## Accessibility & Inclusion

Keyboard-reachable code copy and theme controls, visible focus, WCAG AA contrast in every theme the page offers, respect `prefers-reduced-motion`.

## Standing design preference

For the landing, the user chose the category standard played straight (monochrome product marketing) and named react-simple-maps.io, Linear / Resend and Recharts / visx / TanStack as the craft bar. Colour lives in the map itself, the one saturated element.
