// Presets per variant (dd.md §10): the same <ChoroplethMap>, a different `variant`.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { seed } from "./seed";
import { ChoroplethMap } from "../src/react";

type Row = { id: string; value: number | null; growth: number };

// The library's own geodata: ISO alpha-2 ids ("ES") and Kosovo included.
const world = world110m;
const ids = toFeatureCollection({ geography: world, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);

// Deterministic SYNTHETIC data per id.
const pseudo = (n: number, salt: number) => ((n * 9301 + 49297 + salt) % 233280) / 233280;
const rows: Row[] = ids.map((id) => ({
  id,
  value: seed(id) % 7 === 0 ? null : Math.round(pseudo(seed(id), 1) * pseudo(seed(id), 2) * 1000),
  growth: Math.round(pseudo(seed(id), 3) * 40 - 20),
}));

const REGIONS = ["Norte", "Sur", "Este", "Oeste"] as const;
const regionOf = (id: string) => REGIONS[seed(id) % 4] ?? "Norte";

// SYNTHETIC stores in cities (lon, lat): the position is real, the sales are made up.
type Shop = { id: string; sales: number; growth: number; at: [number, number] };
const shops: Shop[] = [
  ["madrid", -3.7, 40.4],
  ["paris", 2.35, 48.85],
  ["london", -0.12, 51.5],
  ["berlin", 13.4, 52.5],
  ["rome", 12.5, 41.9],
  ["nyc", -74, 40.7],
  ["la", -118.2, 34.05],
  ["mexico", -99.1, 19.4],
  ["saopaulo", -46.6, -23.55],
  ["lagos", 3.4, 6.5],
  ["cairo", 31.2, 30.05],
  ["dubai", 55.3, 25.2],
  ["mumbai", 72.9, 19.07],
  ["tokyo", 139.7, 35.7],
  ["sydney", 151.2, -33.9],
].map(([id, lon, lat], i) => ({
  id: String(id),
  sales: 50 + ((i * 7919) % 950),
  growth: ((i * 13) % 30) - 15,
  at: [Number(lon), Number(lat)] as [number, number],
}));

const common = { geography: world, objectName: "countries" } as const;

const meta = {
  title: "Variants/ChoroplethMap",
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

export const Categorical: Story = {
  render: () => (
    <ChoroplethMap
      {...common}
      data={rows}
      getId={(r) => r.id}
      variant="categorical"
      getCategory={(r) => regionOf(r.id)}
      categories={[
        { id: "Norte" },
        { id: "Sur" },
        { id: "Este" },
        { id: "Oeste", color: "#e11d48" },
      ]}
      legend={{ title: "Zone (synthetic)", showCount: true }}
    />
  ),
};

/** ABSOLUTE values → bubbles at each country's centroid. The regions stay neutral. */
export const BubbleOnCountries: Story = {
  render: () => (
    <ChoroplethMap
      {...common}
      data={rows}
      getId={(r) => r.id}
      variant="bubble"
      getValue={(r) => r.value}
      maxRadius={28}
      formatValue={(v) => `${v} M€`}
      legend={{ title: "Sales" }}
    />
  ),
};

/** Bivariate: size = sales, color = change. */
export const BubbleBivariate: Story = {
  render: () => (
    <ChoroplethMap
      {...common}
      data={rows}
      getId={(r) => r.id}
      variant="bubble"
      getValue={(r) => r.value}
      getColorValue={(r) => r.growth}
      formatValue={(v) => `${v}`}
      legend={{ title: "Size: sales · Color: change", position: "bottom-left" }}
    />
  ),
};

/** Points with their own coordinates (stores): they do not need to match any region. */
export const BubbleStores: Story = {
  render: () => (
    <ChoroplethMap
      {...common}
      data={shops}
      getId={(s) => s.id}
      variant="bubble"
      getValue={(s) => s.sales}
      getColorValue={(s) => s.growth}
      getCoordinates={(s) => s.at}
      maxRadius={20}
      legend={{ title: "Stores (synthetic sales)" }}
    />
  ),
};
