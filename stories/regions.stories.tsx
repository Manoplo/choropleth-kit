// FEAT-022: the `region` prop. A map restricted to a continent, a subregion or some countries, from the first
// frame (no zoom animation). `Playground` is the testing bench: pick a region, a data set and the features to
// exercise (legend, custom tooltip, per-region style, drill-down). SYNTHETIC, deterministic data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Component, useState, type ReactNode } from "react";
import type { Feature } from "geojson";
import { geoBounds, geoCentroid } from "d3-geo";
import {
  dropOverseas,
  toFeatureCollection,
  type DrillContext,
  type ProjectionName,
} from "../src/core";
import { OVERSEAS_TERRITORIES, REGION_PRESETS, world110m, worldFallbackPoints } from "../src/geo";
import {
  ChoroplethMap,
  defineDrillLevels,
  type JoinReport,
  type RegionProp,
  type TooltipContext,
} from "../src/react";
import { seed } from "./seed";

// ── data ────────────────────────────────────────────────────────────────────────────────────────────

type Tier = "Flagship" | "Core" | "Outlet";
type Row = {
  id: string;
  /** Absolute sales (M€); `null` = no figure. */
  sales: number | null;
  /** Year-on-year change, %. */
  growth: number;
  tier: Tier;
  estimated: boolean;
  /** Stores only: the country they belong to and where they are. */
  parentId?: string;
  at?: [number, number];
};

const features = toFeatureCollection({ geography: world110m, objectName: "countries" }).features;
const COUNTRIES = features
  .flatMap((f) =>
    f.id === undefined || f.id === "AQ"
      ? []
      : [{ id: String(f.id), name: String(f.properties?.["name"] ?? f.id) }],
  )
  .sort((a, b) => a.name.localeCompare(b.name));

const pseudo = (n: number, salt: number) => ((n * 9301 + 49297 + salt) % 233280) / 233280;
const TIERS: readonly Tier[] = ["Flagship", "Core", "Outlet"];

const rowFor = (id: string): Row => ({
  id,
  sales: seed(id) % 11 === 0 ? null : Math.round(pseudo(seed(id), 1) * pseudo(seed(id), 2) * 1000),
  growth: Math.round(pseudo(seed(id), 3) * 40 - 20),
  tier: TIERS[seed(id) % 3] ?? "Core",
  estimated: seed(id) % 5 === 0,
});

// A WORLDWIDE data set, on purpose: on a regional map the rows of other countries must be ignored without
// noise (`joinReport.outOfRegion`). It includes microstates (they need `fallbackPoints`).
const WORLD_ROWS: Row[] = [
  ...COUNTRIES.map((c) => rowFor(c.id)),
  ...Object.keys(worldFallbackPoints).map(rowFor),
];
const TYPO_ROW: Row = { ...rowFor("UK"), id: "UK" }; // "GB" is the right code: it must keep warning
const SPARSE_ROWS = WORLD_ROWS.filter((r) => seed(r.id) % 4 === 0);

const storesOf = (countryId: string): Row[] => {
  const whole = features.find((f) => f.id === countryId);
  if (whole === undefined) return [];
  // The stores go on the part of the country the region draws (France's centroid is in the Atlantic, Guiana included).
  const [feature = whole] = dropOverseas([whole], OVERSEAS_TERRITORIES);
  const [lon, lat] = geoCentroid(feature);
  const [[west, south], [east, north]] = geoBounds(feature);
  const spanLon = Math.min(Math.abs(east - west), 30);
  const spanLat = Math.min(Math.abs(north - south), 20);
  return Array.from({ length: 6 + (seed(countryId) % 6) }, (_, i) => ({
    ...rowFor(`${countryId}-S${i + 1}`),
    parentId: countryId,
    sales: 10 + (seed(`${countryId}${i}v`) % 90),
    at: [
      lon + ((seed(`${countryId}${i}a`) % 1000) / 1000 - 0.5) * spanLon * 0.7,
      lat + ((seed(`${countryId}${i}b`) % 1000) / 1000 - 0.5) * spanLat * 0.7,
    ] as [number, number],
  }));
};

// ── the map under test ──────────────────────────────────────────────────────────────────────────────

type Kind = "sequential" | "categorical" | "bubble" | "bivariate" | "sparse";
const KINDS: { id: Kind; label: string }[] = [
  { id: "sequential", label: "Continuous (sequential)" },
  { id: "categorical", label: "Categorical (tier)" },
  { id: "bubble", label: "Bubbles (absolute sales)" },
  { id: "bivariate", label: "Bubbles + colour (sales × growth)" },
  { id: "sparse", label: "Sparse (a quarter of the countries)" },
];

const levels = defineDrillLevels<Row>([
  { id: "country", label: "Countries", geography: world110m, objectName: "countries" },
  {
    id: "store",
    geography: "inherit",
    encoding: {
      variant: "bubble",
      getValue: (r) => r.sales,
      getCoordinates: (r) => r.at ?? null,
      color: "#e4572e",
    },
  },
]);
const selectDrillData =
  (rows: readonly Row[]) =>
  ({ depth, parentId }: DrillContext): readonly Row[] =>
    depth === 0 ? rows : storesOf(parentId ?? "");

const CustomTooltip = ({ label, id, datum, formattedValue, drillable }: TooltipContext<Row>) => (
  <div style={{ font: "12px/1.5 sans-serif" }}>
    <strong>{label}</strong> <span style={{ opacity: 0.6 }}>({id})</span>
    <div>Sales: {formattedValue === "" ? "—" : formattedValue}</div>
    {datum !== undefined && (
      <div>
        Tier: {datum.tier} · YoY {datum.growth > 0 ? "+" : ""}
        {datum.growth} %{datum.estimated ? " · estimated" : ""}
      </div>
    )}
    {drillable && <div style={{ opacity: 0.6 }}>Click to open its stores</div>}
  </div>
);

type MapProps = {
  region?: RegionProp;
  kind?: Kind;
  drill?: boolean;
  typo?: boolean;
  legend?: boolean;
  customTooltip?: boolean;
  estimatedPattern?: boolean;
  projection?: ProjectionName;
  zoom?: boolean;
  onJoinReport?: (report: JoinReport) => void;
  filterFeatures?: (feature: Feature) => boolean;
};

/** One map with every knob of the playground; the fixed stories use it with fewer. */
const RegionMap = ({
  region,
  kind = "sequential",
  drill = false,
  typo = false,
  legend = true,
  customTooltip = false,
  estimatedPattern = false,
  projection,
  zoom = true,
  onJoinReport,
  filterFeatures,
}: MapProps) => {
  const base = kind === "sparse" ? SPARSE_ROWS : WORLD_ROWS;
  const rows = typo ? [...base, TYPO_ROW] : base;
  const shared = {
    ...(drill
      ? { drill: levels, data: selectDrillData(rows) }
      : { geography: world110m, objectName: "countries", data: rows }),
    region,
    getId: (r: Row) => r.id,
    projection,
    fallbackPoints: worldFallbackPoints,
    aspectRatio: "auto" as const,
    zoom: zoom ? { controls: true } : false,
    emptyLabel: "No data",
    onJoinReport,
    filterFeatures,
    renderTooltip: customTooltip ? CustomTooltip : undefined,
    getRegionStyle: estimatedPattern
      ? (r: { datum: Row | undefined }) =>
          r.datum?.estimated === true ? { pattern: "hatch" as const } : undefined
      : undefined,
    legend: legend ? { title: "Sales (M€, synthetic)", showCount: true } : (false as const),
  };

  if (kind === "categorical") {
    return (
      <ChoroplethMap<Row>
        {...shared}
        variant="categorical"
        getCategory={(r) => r.tier}
        categories={[{ id: "Flagship" }, { id: "Core" }, { id: "Outlet" }]}
        legend={legend ? { title: "Tier (synthetic)", showCount: true } : false}
      />
    );
  }
  if (kind === "bubble" || kind === "bivariate") {
    return (
      <ChoroplethMap<Row>
        {...shared}
        variant="bubble"
        getValue={(r) => r.sales}
        getColorValue={kind === "bivariate" ? (r) => r.growth : undefined}
        maxRadius={26}
        formatValue={(v) => `${Math.round(v)} M€`}
      />
    );
  }
  return (
    <ChoroplethMap<Row>
      {...shared}
      variant="sequential"
      getValue={(r) => r.sales}
      formatValue={(v) => `${Math.round(v)} M€`}
    />
  );
};

// ── playground chrome ───────────────────────────────────────────────────────────────────────────────

/** Shows a thrown message (an unknown preset, say) instead of a blank story; remount it with `key` to retry. */
class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError = (error: Error) => ({ error });
  override render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <pre style={{ color: "#b91c1c", whiteSpace: "pre-wrap", font: "12px monospace" }}>
        {this.state.error.message}
      </pre>
    );
  }
}

const PRESET_GROUPS: { label: string; names: string[] }[] = [
  {
    label: "Continents",
    names: ["africa", "asia", "europe", "northAmerica", "southAmerica", "oceania"],
  },
  {
    label: "Subregions",
    names: Object.keys(REGION_PRESETS).filter(
      (n) =>
        !["africa", "asia", "europe", "northAmerica", "southAmerica", "oceania"].includes(n) &&
        !["eu27", "nordics", "iberia", "latam", "mena"].includes(n),
    ),
  },
  { label: "Groupings", names: ["eu27", "nordics", "iberia", "latam", "mena"] },
];

const parseList = (text: string): string[] =>
  text
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
    <span style={{ opacity: 0.7 }}>{label}</span>
    {children}
  </label>
);

const Playground = () => {
  const [select, setSelect] = useState("europe");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("sequential");
  const [projection, setProjection] = useState<ProjectionName>("equalEarth");
  const [flags, setFlags] = useState({
    drill: false,
    typo: false,
    legend: true,
    customTooltip: true,
    estimatedPattern: false,
  });
  const [report, setReport] = useState<JoinReport | null>(null);

  const list = parseList(text);
  const region: RegionProp | undefined =
    list.length > 0 ? list : select === "" ? undefined : select;
  const resetKey = JSON.stringify([region, kind, flags.drill]);
  const toggle = (key: keyof typeof flags) => (
    <label key={key} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
      <input
        type="checkbox"
        checked={flags[key]}
        onChange={(e) => setFlags((f) => ({ ...f, [key]: e.target.checked }))}
      />
      {
        {
          drill: "Drill-down (stores)",
          typo: 'Add a typo row ("UK")',
          legend: "Legend",
          customTooltip: "Custom tooltip",
          estimatedPattern: "Hatch the estimated ones",
        }[key]
      }
    </label>
  );

  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginBottom: 8 }}
      >
        <Field label="Region">
          <select value={select} onChange={(e) => setSelect(e.target.value)}>
            <option value="">(whole world: no region)</option>
            {PRESET_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Countries">
              {COUNTRIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="…or a list (overrides the select): ES, PT, iberia, MA">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ES, PT, MA" />
        </Field>
        <Field label="Data">
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Projection">
          <select
            value={projection}
            onChange={(e) => setProjection(e.target.value as ProjectionName)}
          >
            {(["equalEarth", "naturalEarth", "mercator"] as const).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        {(Object.keys(flags) as (keyof typeof flags)[]).map(toggle)}
      </div>
      <Boundary key={resetKey}>
        {/* Tall regions (Oceania, Iberia + Morocco) would be taller than the screen at full width. */}
        <div style={{ maxWidth: 760 }}>
          <RegionMap
            key={flags.drill ? "drill" : "plain"}
            region={region}
            kind={kind}
            projection={projection}
            onJoinReport={setReport}
            {...flags}
          />
        </div>
      </Boundary>
      <pre style={{ font: "12px/1.5 monospace", opacity: 0.85, whiteSpace: "pre-wrap" }}>
        {report === null
          ? "—"
          : `outOfRegion (${report.outOfRegion.length}): ${report.outOfRegion.slice(0, 12).join(" ")}${report.outOfRegion.length > 12 ? " …" : ""}\n` +
            `unmatchedData: ${report.unmatchedData.join(" ") || "—"}\n` +
            `featuresWithoutData (${report.featuresWithoutData.length}): ${report.featuresWithoutData.slice(0, 12).join(" ")}${report.featuresWithoutData.length > 12 ? " …" : ""}`}
      </pre>
    </div>
  );
};

// ── stories ─────────────────────────────────────────────────────────────────────────────────────────

const meta = {
  title: "Regions/region prop",
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The bench: every region and preset, every data set, and the features to exercise on them. */
export const Playground_: Story = { name: "Playground", render: () => <Playground /> };

export const Europe: Story = { render: () => <RegionMap region="europe" /> };

export const WesternEurope: Story = {
  name: "Subregion: westernEurope",
  render: () => <RegionMap region="westernEurope" />,
};

export const EU27: Story = {
  name: "Grouping: eu27",
  render: () => <RegionMap region="eu27" kind="categorical" />,
};

export const SoutheastAsia: Story = {
  name: "Subregion: southeasternAsia",
  render: () => <RegionMap region="southeasternAsia" />,
};

export const NorthAmerica: Story = {
  name: "Continent: northAmerica (Alaska in, Hawaii out)",
  render: () => <RegionMap region="northAmerica" />,
};

export const LatinAmerica: Story = {
  name: "Grouping: latam",
  render: () => <RegionMap region="latam" kind="bubble" />,
};

export const SingleCountry: Story = {
  name: "One country: FR (no Guiana)",
  render: () => <RegionMap region="FR" kind="bubble" />,
};

export const Russia: Story = {
  name: 'Russia lives in no preset: region="RU"',
  render: () => <RegionMap region="RU" />,
};

export const CustomList: Story = {
  name: 'List: ["iberia", "MA"]',
  render: () => <RegionMap region={["iberia", "MA"]} />,
};

/** A worldwide data set + a typo row: the rows of other continents are silent, "UK" still warns. */
export const WorldwideDataSilentlyIgnored: Story = {
  name: "Worldwide data + typo row (see the report and the console)",
  render: () => {
    const Inner = () => {
      const [report, setReport] = useState<JoinReport | null>(null);
      return (
        <>
          <RegionMap region="europe" typo onJoinReport={setReport} />
          <pre style={{ font: "12px/1.5 monospace" }}>
            {report === null
              ? "—"
              : `outOfRegion: ${report.outOfRegion.length} rows (silent)\nunmatchedData: ${report.unmatchedData.join(" ")}  ← the typo`}
          </pre>
        </>
      );
    };
    return <Inner />;
  },
};

/** Europe → click a country → its stores (bubbles) → back up: the root is the region, never the world. */
export const DrillDownFromEurope: Story = {
  name: "Drill-down: Europe → country → stores",
  render: () => <RegionMap region="europe" drill customTooltip />,
};

/** What a consumer had to do before (left) and what `region` does now (right). */
export const BeforeAndAfter: Story = {
  name: "Before (filterFeatures) vs after (region)",
  render: () => {
    const europe = new Set<string>(REGION_PRESETS.europe);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <b>filterFeatures with the Europe ids</b>
          <RegionMap legend={false} zoom={false} filterFeatures={(f) => europe.has(String(f.id))} />
        </div>
        <div>
          <b>region=&quot;europe&quot;</b>
          <RegionMap region="europe" legend={false} zoom={false} />
        </div>
      </div>
    );
  },
};

/** Every continent, static, as small multiples. */
export const AllContinents: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
      {(["africa", "asia", "europe", "northAmerica", "southAmerica", "oceania"] as const).map(
        (name) => (
          <div key={name}>
            <b>{name}</b>
            <RegionMap region={name} legend={false} zoom={false} />
          </div>
        ),
      )}
    </div>
  ),
};
