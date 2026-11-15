// FEAT-025: subnational geographies. The states of the US and the provinces of Spain (Natural Earth admin-1,
// ISO 3166-2 ids), the way a consumer uses them: each country is its own module, loaded on demand.
// SYNTHETIC, deterministic data. China is left out of the stories on purpose (it is in the data).
//
// In an app the specifier is the package subpath: `import("choropleth-kit/geo/admin1/us")`. Here the same files
// are read from `src/geo/admin1/`. Write each country out (one `import()` per country); a template with a
// variable does not get split into chunks by Vite.
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Feature } from "geojson";
import type { Topology } from "topojson-specification";
import { toFeatureCollection, type DrillContext } from "../src/core";
import { world110m } from "../src/geo";
import usAdmin1 from "../src/geo/admin1/us.json";
import esAdmin1 from "../src/geo/admin1/es.json";
import { ChoroplethMap, defineDrillLevels } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

// The recipe: one explicit loader per country. The engine unwraps the module's `default` and caches it by parent id.
const lazy = (load: () => Promise<unknown>) => load as () => Promise<{ default: Topology }>;
const admin1 = {
  US: lazy(() => import("../src/geo/admin1/us.json")),
  ES: lazy(() => import("../src/geo/admin1/es.json")),
};
type Loadable = keyof typeof admin1;
const isLoadable = (id: string | null): id is Loadable => id !== null && id in admin1;

// ── synthetic data ───────────────────────────────────────────────────────────────────────────────────
// The unit ids are read from the same files, statically, only to invent one row per unit: a real app has its own.
const idsOf = (geography: unknown): string[] =>
  toFeatureCollection({ geography: geography as Topology, objectName: "admin1" }).features.flatMap(
    (f) => (f.id === undefined ? [] : [String(f.id)]),
  );
const valueOf = (id: string): number => Math.round(((seed(id) * 9301) % 1000) / 10);
const rowsOf = (ids: readonly string[]): Row[] => ids.map((id) => ({ id, value: valueOf(id) }));

const US_ROWS = rowsOf(idsOf(usAdmin1));
const ES_ROWS = rowsOf(idsOf(esAdmin1));

const worldIds = toFeatureCollection({
  geography: world110m,
  objectName: "countries",
}).features.flatMap((f) => (f.id === undefined || f.id === "AQ" ? [] : [String(f.id)]));
const WORLD_ROWS = rowsOf(worldIds);

// ── direct use: a country on its own ───────────────────────────────────────────────────────────────────
// A projection fitted to ALL the units would shrink the contiguous US to a corner because of Alaska and
// Hawaii: leave the remote ones out with `filterFeatures`. (Showing them is FEAT-023.)
const REMOTE_US = new Set(["US-AK", "US-HI", "US-PR"]);
const CANARY_ISLANDS = new Set(["ES-GC", "ES-TF"]);

const common = {
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.value,
  variant: "sequential",
  aspectRatio: "auto",
  emptyLabel: "No data",
} as const;

const caption: React.CSSProperties = {
  font: "13px/1.5 sans-serif",
  maxWidth: 720,
  margin: "0 0 12px",
};

const ContiguousUs = () => (
  <div style={{ maxWidth: 1000 }}>
    <p style={caption}>
      The 48 contiguous states plus DC. Ids are ISO 3166-2 (<code>US-CA</code>). Alaska, Hawaii and
      Puerto Rico are left out with <code>filterFeatures</code>.
    </p>
    <ChoroplethMap<Row>
      {...common}
      geography={usAdmin1 as unknown as Topology}
      objectName="admin1"
      data={US_ROWS}
      filterFeatures={(f: Feature) => !REMOTE_US.has(String(f.id))}
      zoom={{ controls: true }}
    />
  </div>
);

const SpainProvinces = () => (
  <div style={{ maxWidth: 1000 }}>
    <p style={caption}>
      Natural Earth gives Spain as its <b>52 provinces</b>, not the 17 autonomous communities:
      Madrid is <code>ES-M</code> (the province), and <code>ES-MD</code> does not exist in this
      data. The Canary Islands are left out here (<code>ES-GC</code>, <code>ES-TF</code>); the drill
      story frames them.
    </p>
    <ChoroplethMap<Row>
      {...common}
      geography={esAdmin1 as unknown as Topology}
      objectName="admin1"
      data={ES_ROWS}
      filterFeatures={(f: Feature) => !CANARY_ISLANDS.has(String(f.id))}
      zoom={{ controls: true }}
    />
  </div>
);

// ── drill-down: world → country → its subdivisions ──────────────────────────────────────────────────────
const levels = defineDrillLevels<Row>([
  {
    id: "country",
    label: "World",
    geography: world110m,
    objectName: "countries",
    filterFeatures: (f) => f.id !== "AQ",
    // Only the countries with admin-1 data wired in this story are navigable.
    canDrill: (item) => isLoadable(item.id),
  },
  {
    id: "subdivision",
    objectName: "admin1",
    geography: (ctx: DrillContext) => {
      if (!isLoadable(ctx.parentId))
        return Promise.reject(new Error(`no admin-1 for ${ctx.parentId}`));
      return admin1[ctx.parentId]();
    },
  },
]);

const select = ({ depth, parentId }: DrillContext): readonly Row[] =>
  depth === 0 ? WORLD_ROWS : parentId === "US" ? US_ROWS : parentId === "ES" ? ES_ROWS : [];

const DrillToSubdivisions = () => (
  <div style={{ maxWidth: 1100 }}>
    <p style={caption}>
      Click the <b>United States</b> or <b>Spain</b> (the only ones wired here): the camera flies in
      and that country&apos;s states or provinces load on demand. Going up returns to the world. The
      other countries are not navigable.
    </p>
    <ChoroplethMap<Row> {...common} drill={levels} data={select} zoom={{ controls: true }} />
  </div>
);

const meta = {
  title: "Geo/Admin1 (subnational)",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** World → United States → its 52 units (50 states, DC, Puerto Rico), or World → Spain → its 52 provinces. */
export const DrillToSubdivisionsStory: Story = {
  name: "Drill: US states and Spanish provinces",
  render: () => <DrillToSubdivisions />,
};

/** A country on its own, without the world: the contiguous US with `filterFeatures`. */
export const ContiguousUsStory: Story = {
  name: "United States (direct)",
  render: () => <ContiguousUs />,
};

/** A country on its own: Spain's provinces, with the Canary Islands filtered out. */
export const SpainProvincesStory: Story = {
  name: "Spain provinces (direct)",
  render: () => <SpainProvinces />,
};
