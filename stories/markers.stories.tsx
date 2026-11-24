// HTML markers that follow the map. SYNTHETIC places and values.
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  MARKER_SHAPES,
  toFeatureCollection,
  type MarkerPulse,
  type MarkerShape,
} from "../src/core";
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

type PresetArgs = {
  shape: MarkerShape;
  size: number;
  color: string;
  stroke: string;
  strokeWidth: number;
  pulse: MarkerPulse;
  glow: number;
  scaleWithMap: boolean;
};

/** The preset look: shapes, size, color, outline, pulse and glow. Open the Controls panel. */
export const Presets: StoryObj<PresetArgs> = {
  args: {
    shape: "pin",
    size: 14,
    color: "#e11d48",
    stroke: "#ffffff",
    strokeWidth: 1.5,
    pulse: "always",
    glow: 6,
    scaleWithMap: false,
  },
  argTypes: {
    shape: { control: "select", options: MARKER_SHAPES },
    size: { control: { type: "range", min: 6, max: 40, step: 1 } },
    color: { control: "color" },
    stroke: {
      control: "color",
      description: "Outline color (use the Controls to clear it with none)",
    },
    strokeWidth: { control: { type: "range", min: 0, max: 4, step: 0.5 } },
    pulse: { control: "inline-radio", options: ["none", "hover", "always"] },
    glow: { control: { type: "range", min: 0, max: 16, step: 1 } },
    scaleWithMap: { control: "boolean" },
  },
  render: (args) => (
    <>
      <p style={caption}>
        With no <code>children</code>, any of <code>shape</code>, <code>size</code>,{" "}
        <code>color</code>, <code>stroke</code>, <code>pulse</code> or <code>glow</code> draws the
        preset. A pin has its tip on the coordinate; the other shapes are centered. The ripple stops
        with reduced motion.
      </p>
      <ChoroplethMap<Row>
        {...common}
        markers={CITIES.map((city) => ({
          id: city.id,
          coordinates: city.at,
          label: city.name,
          ...args,
        }))}
      />
    </>
  ),
};

/** Every shape side by side, without and with the ripple. */
export const Shapes: Story = {
  render: () => (
    <>
      <p style={caption}>
        Top row: plain. Bottom row: <code>pulse=&quot;always&quot;</code> and <code>glow</code>.
      </p>
      <Choropleth.Root {...common}>
        <Choropleth.Svg />
        <Choropleth.Markers>
          {MARKER_SHAPES.map((shape, i) => (
            <Choropleth.Marker
              key={`a-${shape}`}
              coordinates={[-120 + i * 45, 40]}
              shape={shape}
              size={18}
              label={shape}
            />
          ))}
          {MARKER_SHAPES.map((shape, i) => (
            <Choropleth.Marker
              key={`b-${shape}`}
              coordinates={[-120 + i * 45, 0]}
              shape={shape}
              size={18}
              color="#e11d48"
              pulse="always"
              glow={6}
              label={shape}
            />
          ))}
        </Choropleth.Markers>
        <Choropleth.ZoomControls />
      </Choropleth.Root>
    </>
  ),
};

const EUROPE: { id: string; name: string; at: [number, number] }[] = [
  { id: "lis", name: "Lisbon", at: [-9.14, 38.72] },
  { id: "mad", name: "Madrid", at: [-3.7, 40.42] },
  { id: "bcn", name: "Barcelona", at: [2.17, 41.39] },
  { id: "par", name: "Paris", at: [2.35, 48.86] },
  { id: "bru", name: "Brussels", at: [4.35, 50.85] },
  { id: "ams", name: "Amsterdam", at: [4.9, 52.37] },
  { id: "lon", name: "London", at: [-0.13, 51.51] },
  { id: "ber", name: "Berlin", at: [13.4, 52.52] },
  { id: "pra", name: "Prague", at: [14.42, 50.08] },
  { id: "vie", name: "Vienna", at: [16.37, 48.21] },
  { id: "rom", name: "Rome", at: [12.5, 41.9] },
  { id: "mil", name: "Milan", at: [9.19, 45.46] },
  { id: "ath", name: "Athens", at: [23.73, 37.98] },
];

/** `showLabel` with collisions: in a dense area, labels that overlap another are hidden. Zoom in and they come back. */
export const Labels: Story = {
  render: () => (
    <>
      <p style={caption}>
        13 European cities on the world map. Each label tries the right, then left, top and bottom
        side, and is hidden if none fits without covering another label or marker. Madrid, Paris and
        Berlin have a higher <code>labelPriority</code>, so they choose first. Zoom into Europe and
        the hidden ones return. It is resolved when a zoom or pan ends.
      </p>
      <ChoroplethMap<Row>
        {...common}
        style={{ "--cm-font-family": "system-ui, sans-serif" } as React.CSSProperties}
        zoom={{ controls: true, max: 24 }}
        markers={EUROPE.map((city) => ({
          id: city.id,
          coordinates: city.at,
          label: city.name,
          showLabel: true,
          shape: "circle",
          size: 9,
          labelPriority: ["mad", "par", "ber"].includes(city.id) ? 1 : 0,
        }))}
      />
    </>
  ),
};

/** Label positions around a pin. */
export const LabelPositions: Story = {
  render: () => (
    <>
      <p style={caption}>
        <code>labelPosition</code>: right (default), left, top and bottom.
      </p>
      <Choropleth.Root
        {...common}
        style={{ "--cm-font-family": "system-ui, sans-serif" } as React.CSSProperties}
      >
        <Choropleth.Svg />
        <Choropleth.Markers>
          {(["right", "left", "top", "bottom"] as const).map((position, i) => (
            <Choropleth.Marker
              key={position}
              coordinates={[-90 + i * 55, 20]}
              shape="pin"
              size={16}
              color="#e11d48"
              label={position}
              showLabel
              labelPosition={position}
            />
          ))}
        </Choropleth.Markers>
      </Choropleth.Root>
    </>
  ),
};

/** A tooltip on each marker: hover it, or Tab to it. It picks the side that fits inside the map. */
export const Tooltips: Story = {
  render: () => (
    <>
      <p style={caption}>
        <code>tooltip=&#123;true&#125;</code> shows the label; any content works. Hover a marker, or
        press Tab. The tooltip goes on top and, near an edge, slides or moves to a side that fits
        (Tokyo is close to the right edge).
      </p>
      <ChoroplethMap<Row>
        {...common}
        style={{ "--cm-font-family": "system-ui, sans-serif" } as React.CSSProperties}
        markers={CITIES.map((city, i) => ({
          id: city.id,
          coordinates: city.at,
          label: city.name,
          shape: "pin",
          size: 14,
          color: "#e11d48",
          showLabel: i % 2 === 0,
          tooltip:
            i % 3 === 0 ? (
              true
            ) : (
              <>
                <strong>{city.name}</strong>
                <div>{(seed(city.id) * 9301) % 90} stores</div>
              </>
            ),
        }))}
      />
    </>
  ),
};
