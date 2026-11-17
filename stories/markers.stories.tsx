// HTML markers that follow the map. SYNTHETIC places and values.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { Choropleth, ChoroplethMap } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
const rows: Row[] = ids.map((id) => ({ id, value: (seed(id) * 9301) % 100 }));

const CITIES: { id: string; name: string; at: [number, number] }[] = [
  { id: "madrid", name: "Madrid", at: [-3.7, 40.4] },
  { id: "nyc", name: "New York", at: [-74, 40.7] },
  { id: "saopaulo", name: "São Paulo", at: [-46.6, -23.55] },
  { id: "cairo", name: "Cairo", at: [31.2, 30.05] },
  { id: "tokyo", name: "Tokyo", at: [139.7, 35.7] },
  { id: "sydney", name: "Sydney", at: [151.2, -33.9] },
];

const caption: React.CSSProperties = {
  font: "13px/1.5 sans-serif",
  maxWidth: 760,
  margin: "0 0 12px",
};

const card: React.CSSProperties = {
  background: "#fff",
  color: "#111",
  border: "1px solid #ccc",
  borderRadius: 4,
  padding: "2px 6px",
  font: "12px/1.4 sans-serif",
  whiteSpace: "nowrap",
  boxShadow: "0 1px 3px rgb(0 0 0 / 0.25)",
};

const common = {
  geography: world110m,
  objectName: "countries",
  data: rows,
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.value,
  variant: "sequential",
  zoom: { controls: true, max: 24 },
  legend: false,
} as const;

const meta = {
  title: "Layers/Markers",
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

/** The `markers` prop on the preset: a default dot, and your own content when you give `children`. */
export const Preset: Story = {
  render: () => (
    <>
      <p style={caption}>
        Zoom and pan: the markers follow with no React work per frame. They keep their size and are
        clipped at the map&apos;s edge.
      </p>
      <ChoroplethMap<Row>
        {...common}
        markers={CITIES.map((city, i) =>
          i % 2 === 0
            ? { id: city.id, coordinates: city.at, anchor: "center", label: city.name }
            : {
                id: city.id,
                coordinates: city.at,
                children: <div style={card}>{city.name}</div>,
              },
        )}
      />
    </>
  ),
};

/** Level 2: `<Choropleth.Marker>` next to `<Choropleth.Svg>`, with whatever HTML you like. */
export const Compound: Story = {
  render: () => (
    <>
      <p style={caption}>
        <code>scaleWithMap</code> makes the marker grow with the map, like something drawn on it.
        The cards on the left do not; the dots on the right do.
      </p>
      <Choropleth.Root {...common}>
        <Choropleth.Svg />
        <Choropleth.Markers>
          <Choropleth.Marker coordinates={CITIES[0]?.at ?? [0, 0]}>
            <div style={card}>Madrid</div>
          </Choropleth.Marker>
          <Choropleth.Marker coordinates={CITIES[1]?.at ?? [0, 0]}>
            <div style={card}>New York</div>
          </Choropleth.Marker>
          <Choropleth.Marker coordinates={CITIES[4]?.at ?? [0, 0]} anchor="center" scaleWithMap />
          <Choropleth.Marker coordinates={CITIES[5]?.at ?? [0, 0]} anchor="center" scaleWithMap />
        </Choropleth.Markers>
        <Choropleth.ZoomControls />
      </Choropleth.Root>
    </>
  ),
};
