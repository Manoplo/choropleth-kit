// The dot-matrix renderer. SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap, type ThemeName } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
// Every 6th country has no datum, so the "no data" dots show too.
const rows: Row[] = ids
  .filter((_, i) => i % 6 !== 0)
  .map((id) => ({ id, value: (seed(id) * 9301) % 100 }));

const caption: React.CSSProperties = {
  font: "13px/1.5 sans-serif",
  maxWidth: 760,
  margin: "0 0 12px",
};

const common = {
  geography: world110m,
  objectName: "countries",
  data: rows,
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.value,
  variant: "sequential",
  zoom: { controls: true, max: 24 },
} as const;

type PlaygroundArgs = {
  gap: number;
  size: number;
  lattice: "hex" | "square";
  theme: ThemeName;
};

const meta = {
  title: "Layers/Dot matrix",
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1100 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<PlaygroundArgs>;

/** The map as dots, with switches. Open the Controls panel. */
export const Playground: Story = {
  args: { gap: 6, size: 0.7, lattice: "hex", theme: "light" },
  argTypes: {
    gap: { control: { type: "range", min: 3, max: 16, step: 1 }, name: "Dots · gap (px)" },
    size: {
      control: { type: "range", min: 0.2, max: 1, step: 0.05 },
      name: "Dots · size (of gap)",
    },
    lattice: { control: "inline-radio", options: ["hex", "square"], name: "Dots · lattice" },
    theme: {
      control: "select",
      options: ["light", "dark", "minimal", "contrast"],
      name: "Map · theme",
    },
  },
  render: ({ gap, size, lattice, theme }) => (
    <>
      <p style={caption}>
        Hover and click a country: tooltip, selection, legend highlight and zoom work as on a filled
        map. Every country with a value has at least one dot.
      </p>
      <ChoroplethMap<Row>
        {...common}
        theme={theme}
        dots={{ gap, size, lattice }}
        defaultSelectedId={null}
      />
    </>
  ),
};

/** Other variants and a regional map use the same renderer. */
export const Variants: StoryObj = {
  render: () => (
    <>
      <p style={caption}>Square lattice, diverging scale:</p>
      <ChoroplethMap<Row>
        {...common}
        variant="diverging"
        midpoint={50}
        dots={{ gap: 7, lattice: "square" }}
      />
      <p style={caption}>
        <code>region=&quot;europe&quot;</code>: the lattice follows the canvas, not the world.
      </p>
      <ChoroplethMap<Row> {...common} region="europe" aspectRatio="auto" dots />
    </>
  ),
};
