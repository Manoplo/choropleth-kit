import { toFeatureCollection } from "choropleth-kit/core";
import { world110m } from "choropleth-kit/geo";

// SYNTHETIC data. The country ids are real (from the library's own geodata); every number is
// generated deterministically from the id so the demo never changes between builds.
export type Row = { country: string; sales: number | null; growth: number; zone: string };

const hash = (id: string): number =>
  [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 100003, 7);
const unit = (n: number, salt: number) => ((n * 9301 + 49297 + salt * 7919) % 233280) / 233280;

const ZONES = ["North", "South", "East", "West"] as const;

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);

export const sales: Row[] = ids.map((country) => {
  const n = hash(country);
  return {
    country,
    sales: n % 9 === 0 ? null : Math.round(unit(n, 1) * unit(n, 2) * 1000),
    growth: Math.round(unit(n, 3) * 40 - 20),
    zone: ZONES[n % 4] ?? "North",
  };
});

export const zones = ZONES.map((id) => ({ id }));
