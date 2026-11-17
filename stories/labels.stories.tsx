// FEAT-001: region names with collision avoidance and a halo. SYNTHETIC, deterministic data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection, type ThemeName } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
const rows: Row[] = ids.map((id) => ({ id, value: (seed(id) * 9301) % 100 }));

const caption: React.CSSProperties = { font: "13px/1.5 sans-serif", maxWidth: 760, margin: "0 0 12px" };

const meta = {
  title: "Layers/Labels",
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
type Story = StoryObj<typeof meta>;

const WorldMap = ({ theme, palette = "blues" }: { theme?: ThemeName; palette?: string }) => (
  <ChoroplethMap<Row>
    geography={world110m}
    objectName="countries"
    data={rows}
    getId={(r) => r.id}
    getValue={(r) => r.value}
    variant="sequential"
    palette={palette as "blues"}
    theme={theme}
    regionLabels
    zoom={{ controls: true, max: 24 }}
    legend={{ title: "Index (synthetic)" }}
  />
);

/** Zoom in: the big countries are named first and smaller ones appear as there is room. */
export const Default: Story = {
  render: () => (
    <>
      <p style={caption}>
        Labels keep the same size at any zoom. Where two names would overlap, the one on the larger
        region wins; zoom in (wheel, buttons or double click) and the hidden ones come back.
      </p>
      <WorldMap />
    </>
  ),
};

/** The halo takes the background color, so the text reads over light and dark fills alike. */
export const DarkTheme: Story = {
  render: () => (
    <>
      <p style={caption}>
        <code>theme=&quot;dark&quot;</code>: light text with a dark halo.
      </p>
      <WorldMap theme="dark" palette="viridis" />
    </>
  ),
};

/** Bold text and a thicker halo. */
export const ContrastTheme: Story = {
  render: () => (
    <>
      <p style={caption}>
        <code>theme=&quot;contrast&quot;</code>: black bold text on a white halo.
      </p>
      <WorldMap theme="contrast" palette="viridis" />
    </>
  ),
};

/** Your own text and your own priority: here, the countries with the highest value win a collision. */
export const CustomTextAndPriority: Story = {
  render: () => (
    <>
      <p style={caption}>
        <code>format</code> prints the id and <code>priority</code> ranks by the data value, so the
        highest values keep their label when two collide.
      </p>
      <ChoroplethMap<Row>
        geography={world110m}
        objectName="countries"
        data={rows}
        getId={(r) => r.id}
        getValue={(r) => r.value}
        variant="sequential"
        regionLabels={{
          format: (region) => (region.value === null ? null : region.id),
          priority: (region) => Number(region.value ?? 0),
        }}
        zoom={{ controls: true, max: 24 }}
        legend={{ title: "Index (synthetic)" }}
      />
    </>
  ),
};
