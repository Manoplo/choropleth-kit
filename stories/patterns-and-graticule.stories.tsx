// Pattern presets (regions and background) and the graticule. SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection, PATTERN_PRESET_IDS, type PatternPresetId } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap } from "../src/react";
import { PatternTileDef } from "../src/react/components/pattern-tile";
import { seed } from "./seed";

type Row = { id: string; value: number };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
// Every 6th country has no datum, so "no data" patterns have something to show.
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
  legend: false,
} as const;

type Target = "no data" | "low values" | "high values" | "all regions";

type PlaygroundArgs = {
  projection: "equalEarth" | "naturalEarth" | "mercator" | "orthographic" | "albers";
  antarctica: boolean;
  // Regions
  regionPattern: PatternPresetId | "none";
  regionTarget: Target;
  regionPatternColor: string;
  // Background
  backgroundPattern: PatternPresetId | "none";
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundScale: number;
  fadeHorizontal: boolean;
  fadeVertical: boolean;
  fadeLength: number;
  // Graticule
  graticule: boolean;
  graticuleStep: number;
  graticuleOutline: boolean;
  graticuleAbove: boolean;
  graticuleColor: string;
};

const patternOptions = ["none", ...PATTERN_PRESET_IDS] as const;

const meta = {
  title: "Layers/Patterns and graticule",
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

/** Everything on one map, with switches. Open the Controls panel. */
export const Playground: Story = {
  args: {
    projection: "equalEarth",
    antarctica: false,
    regionPattern: "diagonal-up",
    regionTarget: "no data",
    regionPatternColor: "",
    backgroundPattern: "dots",
    backgroundColor: "",
    backgroundOpacity: 1,
    backgroundScale: 1,
    fadeHorizontal: true,
    fadeVertical: true,
    fadeLength: 10,
    graticule: true,
    graticuleStep: 15,
    graticuleOutline: true,
    graticuleAbove: false,
    graticuleColor: "",
  },
  argTypes: {
    projection: {
      control: "select",
      options: ["equalEarth", "naturalEarth", "mercator", "orthographic", "albers"],
      name: "Map · projection",
    },
    antarctica: { control: "boolean", name: "Map · showAntarctica" },
    regionPattern: { control: "select", options: patternOptions, name: "Regions · preset" },
    regionTarget: {
      control: "inline-radio",
      options: ["no data", "low values", "high values", "all regions"],
      name: "Regions · applied to",
    },
    regionPatternColor: { control: "color", name: "Regions · color (empty = theme)" },
    backgroundPattern: { control: "select", options: patternOptions, name: "Background · preset" },
    backgroundColor: { control: "color", name: "Background · color (empty = theme)" },
    backgroundOpacity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      name: "Background · opacity",
    },
    backgroundScale: {
      control: { type: "range", min: 0.5, max: 4, step: 0.25 },
      name: "Background · scale",
    },
    fadeHorizontal: { control: "boolean", name: "Background · fade left/right" },
    fadeVertical: { control: "boolean", name: "Background · fade top/bottom" },
    fadeLength: {
      control: { type: "range", min: 0, max: 45, step: 1 },
      name: "Background · fade length (%)",
    },
    graticule: { control: "boolean", name: "Graticule · on" },
    graticuleStep: {
      control: { type: "range", min: 5, max: 45, step: 5 },
      name: "Graticule · step (°)",
    },
    graticuleOutline: { control: "boolean", name: "Graticule · world outline" },
    graticuleAbove: { control: "boolean", name: "Graticule · over the regions" },
    graticuleColor: { control: "color", name: "Graticule · color (empty = theme)" },
  },
  render: (args) => {
    const regionOn = args.regionPattern !== "none";
    const matches = (r: { datum?: Row }): boolean => {
      if (args.regionTarget === "all regions") return true;
      if (r.datum === undefined) return args.regionTarget === "no data";
      if (args.regionTarget === "low values") return r.datum.value < 33;
      if (args.regionTarget === "high values") return r.datum.value >= 66;
      return false;
    };
    return (
      <>
        <p style={caption}>
          Zoom and pan: the background stays put, the graticule moves with the map and keeps its
          line width. Every region pattern sits on top of the datum&apos;s color.
        </p>
        <ChoroplethMap<Row>
          {...common}
          projection={args.projection}
          showAntarctica={args.antarctica}
          style={
            args.regionPatternColor === ""
              ? undefined
              : ({ "--cm-pattern-color": args.regionPatternColor } as React.CSSProperties)
          }
          emptyPattern={regionOn && args.regionTarget === "no data" ? args.regionPattern : "none"}
          getRegionStyle={(r) =>
            regionOn && args.regionTarget !== "no data" && matches(r)
              ? { pattern: args.regionPattern }
              : undefined
          }
          background={
            args.backgroundPattern === "none"
              ? false
              : {
                  pattern: args.backgroundPattern,
                  color: args.backgroundColor === "" ? undefined : args.backgroundColor,
                  opacity: args.backgroundOpacity,
                  scale: args.backgroundScale,
                  fadeHorizontal: args.fadeHorizontal,
                  fadeVertical: args.fadeVertical,
                  fadeHorizontalLength: args.fadeLength,
                  fadeVerticalLength: args.fadeLength,
                }
          }
          graticule={
            args.graticule
              ? {
                  step: args.graticuleStep,
                  outline: args.graticuleOutline,
                  above: args.graticuleAbove,
                  stroke: args.graticuleColor === "" ? undefined : args.graticuleColor,
                }
              : false
          }
        />
      </>
    );
  },
};

/** Every preset of the catalogue, by id: the tiles regions and backgrounds draw from. */
export const Catalogue: StoryObj = {
  render: () => (
    <>
      <p style={caption}>
        {PATTERN_PRESET_IDS.length} presets. The id is what you pass to <code>background</code>,{" "}
        <code>emptyPattern</code> or <code>getRegionStyle().pattern</code>.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 12,
          font: "12px/1.4 monospace",
        }}
      >
        {PATTERN_PRESET_IDS.map((id) => (
          <figure key={id} style={{ margin: 0 }}>
            <svg width="100%" height="72" style={{ border: "1px solid #ccc", borderRadius: 4 }}>
              <defs>
                <PatternTileDef id={`catalogue-${id}`} preset={id} color="#222" />
              </defs>
              <rect width="100%" height="100%" fill={`url(#catalogue-${id})`} />
            </svg>
            <figcaption>{id}</figcaption>
          </figure>
        ))}
      </div>
    </>
  ),
};

/** The graticule alone, at three steps, under and over the regions. */
export const Graticule: StoryObj = {
  render: () => (
    <>
      <p style={caption}>
        <code>graticule</code> accepts <code>true</code>, a step in degrees or options. The grid is
        a single path; line width does not change when you zoom.
      </p>
      <ChoroplethMap<Row> {...common} graticule={30} />
      <p style={caption}>Every 10°, over the regions, with the world outline:</p>
      <ChoroplethMap<Row> {...common} graticule={{ step: 10, above: true, outline: true }} />
    </>
  ),
};
