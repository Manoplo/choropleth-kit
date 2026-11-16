// FEAT-024: your own colors and a fixed domain. France by department (Natural Earth admin-1, ISO 3166-2 ids).
// SYNTHETIC, deterministic data: the share of sales made online per department, between 31 % and 74 %.
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Feature } from "geojson";
import type { Topology } from "topojson-specification";
import { toFeatureCollection, type CustomRamp } from "../src/core";
import frAdmin1 from "../src/geo/admin1/fr.json";
import { ChoroplethMap } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; onlineShare: number };

const geography = frAdmin1 as unknown as Topology;

// Overseas departments are left out of the direct view: they would shrink mainland France (FEAT-023).
const OVERSEAS = new Set(["FR-GF", "FR-MQ", "FR-GP", "FR-RE", "FR-YT"]);
const mainland = (f: Feature) => !OVERSEAS.has(String(f.id));

const PARIS_AREA = new Set([
  "FR-75",
  "FR-92",
  "FR-93",
  "FR-94",
  "FR-78",
  "FR-91",
  "FR-95",
  "FR-77",
]);
const LOW = 31;
const HIGH = 74;

// A pseudo-random share between LOW and HIGH; the Paris area is pushed to the top, to give the map a story.
const shareOf = (id: string): number => {
  const unit = ((seed(id) * 9301) % 1000) / 1000;
  return Math.round(PARIS_AREA.has(id) ? HIGH - unit * 6 : LOW + unit * 26);
};

const DATA: Row[] = toFeatureCollection({ geography, objectName: "admin1" })
  .features.flatMap((f) => (f.id === undefined ? [] : [String(f.id)]))
  .filter((id) => !OVERSEAS.has(id))
  .map((id) => ({ id, onlineShare: shareOf(id) }));

const common = {
  geography,
  objectName: "admin1",
  data: DATA,
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.onlineShare,
  filterFeatures: mainland,
  variant: "sequential",
  aspectRatio: "auto",
  formatValue: (v: number) => `${Math.round(v)} %`,
  emptyLabel: "No data",
} as const;

const caption: React.CSSProperties = {
  font: "13px/1.5 sans-serif",
  maxWidth: 720,
  margin: "0 0 12px",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 24,
};
const title: React.CSSProperties = { font: "600 13px/1.4 sans-serif", margin: "0 0 4px" };

const BLACK_TO_BLUE = { from: "#0a0a0a", to: "#2563eb" } as const;
const WHITE_TO_BLUE = { from: "#ffffff", to: "#2563eb" } as const;

const Panel = ({
  heading,
  note,
  ...props
}: { heading: string; note?: string } & Record<string, unknown>) => (
  <div>
    <p style={title}>{heading}</p>
    {note !== undefined && <p style={{ ...caption, margin: "0 0 8px" }}>{note}</p>}
    <ChoroplethMap<Row> {...common} zoom={{ controls: true }} {...props} />
  </div>
);

const meta = {
  title: "Color/Custom ramps (FEAT-024)",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The case that started it: black = physical stores, blue = online, over a fixed 0 … 100 %. */
export const BlackToBlueStory: Story = {
  name: "Black → blue, fixed 0–100 %",
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <p style={caption}>
        <code>
          palette=&#123;&#123; from: &quot;#0a0a0a&quot;, to: &quot;#2563eb&quot; &#125;&#125;
        </code>{" "}
        with <code>domain=&#123;[0, 100]&#125;</code>. The legend shows the fixed ends, 0 % and 100
        %, not the data&apos;s 31 % and 74 %. Both ends are dark, so the lower half of the range is
        hard to tell apart: see &quot;Interpolation spaces&quot; and the white → blue version.
      </p>
      <ChoroplethMap<Row>
        {...common}
        palette={{ ...BLACK_TO_BLUE, space: "lab" }}
        domain={[0, 100]}
        classification={{ method: "linear" }}
        legend={{ title: "Online share of sales" }}
        zoom={{ controls: true }}
      />
    </div>
  ),
};

/** The safe version: a light → dark ramp, where more is always darker. */
export const WhiteToBlueStory: Story = {
  name: "White → blue, fixed 0–100 %",
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <p style={caption}>
        Light → dark: more online sales is always darker, and the &quot;no data&quot; gray never
        gets confused with the low end because the ramp starts white, not gray.
      </p>
      <ChoroplethMap<Row>
        {...common}
        palette={WHITE_TO_BLUE}
        domain={[0, 100]}
        classification={{ method: "linear" }}
        legend={{ title: "Online share of sales" }}
        zoom={{ controls: true }}
      />
    </div>
  ),
};

/** Same data, no custom ramp: for comparison. */
export const NamedPaletteStory: Story = {
  name: "Same data, named palette",
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <p style={caption}>
        The default: the <code>blues</code> palette, quantile classes, range taken from the data.
        The colors say &quot;high or low relative to the others&quot;, not &quot;this share of
        sales&quot;.
      </p>
      <ChoroplethMap<Row>
        {...common}
        legend={{ title: "Online share of sales", variant: "bar" }}
        zoom={{ controls: true }}
      />
    </div>
  ),
};

/** The same ramp over the data's range and over a fixed one. */
export const FixedDomainStory: Story = {
  name: "Fixed vs data-driven domain",
  render: () => (
    <div>
      <p style={caption}>
        Same ramp, same data (31 % to 74 %). On the left the colors stretch over the data&apos;s
        range, so the lowest department is as light as 0 % would be. On the right{" "}
        <code>domain=&#123;[0, 100]&#125;</code>: a color always means the same share, and two maps
        built this way can be compared.
      </p>
      <div style={grid}>
        <Panel
          heading="Data range (default)"
          palette={WHITE_TO_BLUE}
          classification={{ method: "linear" }}
        />
        <Panel
          heading="domain [0, 100]"
          palette={WHITE_TO_BLUE}
          domain={[0, 100]}
          classification={{ method: "linear" }}
        />
      </div>
    </div>
  ),
};

/** Five equal classes over a fixed range, with the bar legend. */
export const ClassesStory: Story = {
  name: "Classes over a fixed range",
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <p style={caption}>
        <code>quantize</code> with 5 classes over <code>domain=&#123;[0, 100]&#125;</code>: the
        breaks are 20 %, 40 %, 60 % and 80 %, whatever the data are. With data from 31 % to 74 %,
        the first and the last class stay empty on purpose.
      </p>
      <ChoroplethMap<Row>
        {...common}
        palette={WHITE_TO_BLUE}
        domain={[0, 100]}
        classification={{ method: "quantize", classes: 5 }}
        legend={{ title: "Online share of sales", variant: "bar", showCount: true }}
        zoom={{ controls: true }}
      />
    </div>
  ),
};

const SPACES = ["rgb", "lab", "hcl"] as const;

/** Black → blue in the three spaces. */
export const SpacesStory: Story = {
  name: "Interpolation spaces",
  render: () => (
    <div>
      <p style={caption}>
        The same black → blue ramp interpolated in <code>rgb</code> (what a CSS gradient does),{" "}
        <code>lab</code> and <code>hcl</code>. The ends are identical; the steps between them are
        not. <code>rgb</code> is the default.
      </p>
      <div style={grid}>
        {SPACES.map((space) => {
          const palette: CustomRamp = { ...BLACK_TO_BLUE, space };
          return (
            <Panel
              key={space}
              heading={`space: "${space}"`}
              palette={palette}
              domain={[0, 100]}
              classification={{ method: "linear" }}
            />
          );
        })}
      </div>
    </div>
  ),
};

/** A diverging ramp of your own, centered on 50 %: who dominates, and by how much. */
export const DivergingStory: Story = {
  name: "Diverging: stores vs online, centered on 50 %",
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <p style={caption}>
        <code>
          palette=&#123;&#123; negative: &quot;#dc2626&quot;, neutral: &quot;#f5f5f5&quot;,
          positive: &quot;#2563eb&quot; &#125;&#125;
        </code>{" "}
        with <code>domain=&#123;[0, 100]&#125;</code> and <code>midpoint=&#123;50&#125;</code>. Red
        means stores dominate, blue means online dominates, and the neutral color is an even split.
        The data (31 % to 74 %) never reaches the extremes, so the colors stay moderate: that is the
        honest reading of a 0–100 % scale.
      </p>
      <ChoroplethMap<Row>
        {...common}
        variant="diverging"
        palette={{ negative: "#dc2626", neutral: "#f5f5f5", positive: "#2563eb" }}
        domain={[0, 100]}
        midpoint={50}
        classification={{ method: "linear" }}
        legend={{ title: "Online share of sales" }}
        zoom={{ controls: true }}
      />
    </div>
  ),
};

/** Three or more stops. */
export const StopsStory: Story = {
  name: "Three stops",
  render: () => (
    <div style={{ maxWidth: 760 }}>
      <p style={caption}>
        A list of colors is a ramp with several stops, evenly spaced:{" "}
        <code>[&quot;#fff7bc&quot;, &quot;#fe9929&quot;, &quot;#7a0177&quot;]</code>.
      </p>
      <ChoroplethMap<Row>
        {...common}
        palette={["#fff7bc", "#fe9929", "#7a0177"]}
        domain={[0, 100]}
        classification={{ method: "linear" }}
        legend={{ title: "Online share of sales" }}
        zoom={{ controls: true }}
      />
    </div>
  ),
};
