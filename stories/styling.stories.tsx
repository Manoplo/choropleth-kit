// Styling (dd.md §12.5): from a one-line `theme="dark"` to custom classes with `classNames`.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import {
  ChoroplethMap,
  defineTheme,
  extendTheme,
  type ChoroplethClassNames,
  type ThemeName,
} from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number | null; estimated: boolean };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined || f.id === "AQ" ? [] : [String(f.id)]),
);
// Deterministic SYNTHETIC data. Roughly every 5th country is "estimated" (for `getRegionStyle`).
const data: Row[] = ids.map((id) => {
  const n = seed(id);
  return {
    id,
    value: n % 7 === 0 ? null : Math.round((((n * 9301 + 49297) % 233280) / 233280) * 100),
    estimated: n % 5 === 0,
  };
});

const common = {
  geography: world110m,
  objectName: "countries",
  filterFeatures: (f: { id?: string | number }) => f.id !== "AQ",
  data,
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.value,
  variant: "sequential",
  aspectRatio: 2,
  zoom: { controls: true },
  formatValue: (v: number) => `${v} %`,
  legend: { title: "Index (synthetic)", position: "bottom-left" },
} as const;

// ── Themes ────────────────────────────────────────────────────────────────────────────────────────

/** A custom theme: starts from `dark` and changes what matters (reusable across maps with `defineTheme`). */
const sunset = defineTheme(
  extendTheme("dark", {
    background: "#2b1b17",
    empty: { fill: "#5b3a32" },
    border: { color: "#2b1b17", width: 0.6 },
    hover: { stroke: "#ffd166", width: 2 },
    selected: { stroke: "#ef476f", width: 2.5 },
    tooltip: { background: "#ffd166", color: "#2b1b17", border: "#ffd166", radius: 8 },
    font: { family: "Georgia, serif", color: "#ffe8d6" },
  }),
);

const ThemeCell = ({ name, theme }: { name: string; theme: ThemeName | typeof sunset }) => {
  const [selected, setSelected] = useState<string | null>("ES");
  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ font: "600 13px sans-serif", margin: "0 0 6px" }}>{name}</figcaption>
      <ChoroplethMap<Row>
        {...common}
        // In dark, "viridis" reads better than "blues" (the light end does not blend into the background).
        palette={theme === "dark" || theme === sunset ? "viridis" : "blues"}
        theme={theme}
        selectedId={selected}
        onItemClick={({ id }) => setSelected((cur) => (cur === id ? null : id))}
        getRegionStyle={(r) => (r.datum?.estimated === true ? { opacity: 0.6 } : undefined)}
        ariaLabel={`Tema ${name}`}
      />
    </figure>
  );
};

const Themes = () => (
  <div
    style={{
      display: "grid",
      gap: 16,
      gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
      padding: 16,
    }}
  >
    <ThemeCell name='theme="light"' theme="light" />
    <ThemeCell name='theme="dark"' theme="dark" />
    <ThemeCell name='theme="minimal"' theme="minimal" />
    <ThemeCell name='theme="contrast"' theme="contrast" />
    <ThemeCell name="Propio: extendTheme('dark', { … })" theme={sunset} />
  </div>
);

// ── Variables from an ancestor and from your own classes ────────────────────────────────────────────

const AncestorVariables = () => (
  <div
    style={
      {
        padding: 16,
        // Level 3 of dd.md §12.5.1: `--cm-*` variables on ANY ancestor. (Until step 35 this did nothing:
        // `.cm-root` declared its own and they beat the inherited ones.)
        "--cm-empty-fill": "#fde68a",
        "--cm-border-color": "#1f2937",
        "--cm-border-width": "0.8px",
        "--cm-hover-stroke": "#dc2626",
        "--cm-selected-stroke": "#16a34a",
        "--cm-tooltip-bg": "#111827",
        "--cm-tooltip-color": "#f9fafb",
        "--cm-font-family": "Georgia, serif",
      } as React.CSSProperties
    }
  >
    <ChoroplethMap<Row> {...common} selectedId="FR" ariaLabel="Variables from an ancestor" />
  </div>
);

// ── Tailwind-like ─────────────────────────────────────────────────────────────────────────────────

/**
 * Utility classes like Tailwind's, defined here by hand so as not to depend on it. What the story teaches is
 * `classNames`: a class of YOURS on each piece, added to the `cm-*` one, with the library's base CSS intact underneath.
 */
const UTILITIES = `
.tw-rounded-xl { border-radius: 14px; }
.tw-shadow-xl { box-shadow: 0 18px 40px -12px rgb(15 23 42 / .45); }
.tw-ring { outline: 1px solid rgb(15 23 42 / .12); }
.tw-bg-slate { background: linear-gradient(160deg, #f8fafc, #e2e8f0); }
.tw-p-3 { padding: 12px; }
.tw-pill { border-radius: 999px; padding: 6px 12px; font-weight: 600; letter-spacing: .02em; }
.tw-glass { background: rgb(255 255 255 / .8); backdrop-filter: blur(6px); }
.tw-uppercase { text-transform: uppercase; font-size: 11px; letter-spacing: .08em; }
.tw-region-drill:hover { filter: brightness(1.12); }
.tw-muted { opacity: .75; }
`;

const tailwindLike: ChoroplethClassNames = {
  root: "tw-rounded-xl tw-shadow-xl tw-ring tw-bg-slate tw-p-3",
  tooltip: "tw-pill tw-shadow-xl",
  legend: "tw-glass tw-rounded-xl tw-p-3 tw-shadow-xl",
  legendItem: "tw-uppercase",
  controls: "tw-glass tw-shadow-xl",
  region: "tw-region-drill",
  breadcrumb: "tw-glass tw-pill",
  gestureHint: "tw-pill",
};

const TailwindLike = () => (
  <div style={{ padding: 24, maxWidth: 1100 }}>
    <style>{UTILITIES}</style>
    <ChoroplethMap<Row>
      {...common}
      classNames={tailwindLike}
      selectedId="BR"
      ariaLabel="classNames al estilo Tailwind"
    />
  </div>
);

// ── Legend and patterns (step 36) ─────────────────────────────────────────────────────────────────

/** Two maps on the same page: each with ITS patterns (per-instance ids) and its interactive legend. */
const LegendAndPatterns = () => (
  <div
    style={{
      display: "grid",
      gap: 16,
      gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
      padding: 16,
    }}
  >
    <figure style={{ margin: 0 }}>
      <figcaption style={{ font: "600 13px sans-serif", margin: "0 0 6px" }}>
        legend=&#123;&#123; variant: "bar" &#125;&#125; · estimated hatched · "no data" dotted
      </figcaption>
      <ChoroplethMap<Row>
        {...common}
        legend={{ title: "Index (synthetic)", position: "bottom-left", variant: "bar" }}
        emptyPattern="dots"
        getRegionStyle={(r) => (r.datum?.estimated === true ? { pattern: "hatch" } : undefined)}
        ariaLabel="Bar legend and patterns"
      />
    </figure>
    <figure style={{ margin: 0 }}>
      <figcaption style={{ font: "600 13px sans-serif", margin: "0 0 6px" }}>
        theme="contrast" ("no data" is hatched) · legend in rows
      </figcaption>
      <ChoroplethMap<Row>
        {...common}
        theme="contrast"
        getRegionStyle={(r) => (r.datum?.estimated === true ? { pattern: "dots" } : undefined)}
        ariaLabel="Contrast with patterns"
      />
    </figure>
  </div>
);

const meta = {
  title: "Styling",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The four predefined themes side by side and a custom one (`extendTheme`). Check: background, borders, "no data"
 * (countries without a value), selection (Spain), the tooltip (hover), the zoom buttons and the legend in each
 * one. "Estimated" countries get `getRegionStyle` at .6 opacity. `contrast` thickens borders, highlights and the
 * focus ring (press Tab until the map).
 */
export const ThemesStory: Story = { name: "Themes", render: () => <Themes /> };

/** `--cm-*` variables on an ancestor (level 3): the "pure CSS" way of theming without touching props. */
export const AncestorVariablesStory: Story = {
  name: "Ancestor variables",
  render: () => <AncestorVariables />,
};

/** `classNames` with Tailwind-style utilities: your class on each piece, added to the `cm-*` one. */
export const TailwindLikeStory: Story = { name: "Tailwind-like", render: () => <TailwindLike /> };

/**
 * Hover a legend class (a segment of the bar or a row): its regions stand out and the rest dims, without
 * re-rendering regions. "Estimated" countries carry a pattern over their color; "no data" shows as dots
 * (left) or hatching (`contrast`, right). There are TWO maps: each references its own patterns.
 */
export const LegendAndPatternsStory: Story = {
  name: "Legend + patterns",
  render: () => <LegendAndPatterns />,
};
