// Estilado (dd.md §12.5): del `theme="dark"` de una línea a las clases propias con `classNames`.
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
// Datos SINTÉTICOS deterministas. Cada ~5.º país es «estimado» (para `getRegionStyle`).
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
  legend: { title: "Índice (sintético)", position: "bottom-left" },
} as const;

// ── Themes ────────────────────────────────────────────────────────────────────────────────────────

/** Un tema propio: parte de `dark` y cambia lo que importa (reutilizable entre mapas con `defineTheme`). */
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
        // En oscuro, «viridis» se lee mejor que «blues» (el extremo claro no se confunde con el fondo).
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

// ── Variables desde un ancestro y desde clases propias ────────────────────────────────────────────

const AncestorVariables = () => (
  <div
    style={
      {
        padding: 16,
        // Nivel 3 de dd.md §12.5.1: variables `--cm-*` en CUALQUIER ancestro. (Hasta el paso 35 esto no
        // hacía nada: `.cm-root` declaraba las suyas y ganaban a las heredadas.)
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
    <ChoroplethMap<Row> {...common} selectedId="FR" ariaLabel="Variables desde un ancestro" />
  </div>
);

// ── Tailwind-like ─────────────────────────────────────────────────────────────────────────────────

/**
 * Clases de utilidad como las de Tailwind, definidas aquí a mano para no depender de él. Lo que enseña la story es
 * `classNames`: una clase TUYA en cada pieza, sumada a la `cm-*`, con el CSS base de la librería intacto debajo.
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

const meta = {
  title: "Styling",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Los cuatro temas predefinidos lado a lado y uno propio (`extendTheme`). Comprueba: fondo, fronteras, «sin dato»
 * (los países sin valor), selección (España), el tooltip (pasa el ratón), los botones de zoom y la leyenda en cada
 * uno. Los países «estimados» van con `getRegionStyle` a opacidad .6. `contrast` engorda fronteras, resaltes y el
 * anillo de foco (pulsa Tab hasta el mapa).
 */
export const ThemesStory: Story = { name: "Themes", render: () => <Themes /> };

/** Variables `--cm-*` en un ancestro (nivel 3): la forma «de CSS puro» de tematizar sin tocar props. */
export const AncestorVariablesStory: Story = {
  name: "Ancestor variables",
  render: () => <AncestorVariables />,
};

/** `classNames` con utilidades al estilo Tailwind: tu clase en cada pieza, sumada a la `cm-*`. */
export const TailwindLikeStory: Story = { name: "Tailwind-like", render: () => <TailwindLike /> };
