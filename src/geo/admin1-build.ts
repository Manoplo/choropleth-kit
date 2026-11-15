import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { geoArea } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

/**
 * Pure pieces of the admin-1 build (`scripts/build-geo/build-admin1.mjs`): the id policy and the repair
 * of polygons that quantization leaves wound the wrong way. **Build time only**: it is not exported from
 * any index, so it never reaches a consumer's bundle.
 */

/** What the build reads from a Natural Earth admin-1 feature. */
export type RawAdmin1 = Feature<
  Polygon | MultiPolygon,
  {
    iso_3166_2?: string | null;
    name?: string | null;
    /** The country's English name, as Natural Earth words it. */
    admin?: string | null;
  }
>;

/** A subdivision ready to be written: `id` is a real ISO 3166-2 code, or absent. */
export type Admin1Unit = Feature<Polygon | MultiPolygon, { name: string }>;

export type Admin1Report = {
  /** Names of the features dropped because no country could be told (`-99-X02~`: Somaliland, Dhekelia…). */
  noCountry: string[];
  /** Units written without an id (placeholders and ambiguous codes). */
  withoutId: number;
  /** Same code and same name: several polygons of one unit, merged into one feature. */
  merged: { id: string; parts: number }[];
  /** Same code but different names: the source is wrong, so none of them gets the id. */
  ambiguous: { id: string; names: string[] }[];
};

export type Admin1Normalized = {
  /** Keyed by ISO 3166-1 alpha-2 (the prefix of the subdivision code). */
  byCountry: Map<string, Admin1Unit[]>;
  report: Admin1Report;
};

const REAL_CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
const PLACEHOLDER = /^([A-Z]{2})-X\d+~$/;

/** `"US-CA"` yes; `"-99-X16~"`, `"XK-X02~"`, `""` and `null` no. */
export const isRealIsoCode = (code: string | null | undefined): code is string =>
  typeof code === "string" && REAL_CODE.test(code);

/** The country a code belongs to: the prefix of a real code or of a `CC-X01~` placeholder, else `null`. */
export const countryOfCode = (code: string | null | undefined): string | null => {
  if (typeof code !== "string") return null;
  if (REAL_CODE.test(code)) return code.slice(0, 2);
  return PLACEHOLDER.exec(code)?.[1] ?? null;
};

const polygonsOf = (geometry: Polygon | MultiPolygon): Position[][][] =>
  geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

const mergeGeometry = (parts: readonly RawAdmin1[]): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: parts.flatMap((part) => polygonsOf(part.geometry)),
});

/**
 * Applies the id policy and groups the units by country.
 *
 *  1. A real ISO 3166-2 code that belongs to one feature is the `id`.
 *  2. Features that share a code **and a name** are polygons of the same unit: merged into one.
 *  3. Features that share a code but have **different names** (Bosnia's nine cantons all carry `BA-BIH`)
 *     get no id at all: giving it to one of them would silently join the wrong row.
 *  4. Placeholders (`XK-X02~`) get no id. A unit without an id is still drawn, as a non-interactive layer.
 *  5. Features with no recognizable country (`-99-X16~`) are dropped and listed in the report.
 *
 * The country of a unit is the prefix of its code (so `FR-GF`, French Guiana, belongs to France).
 */
export const normalizeAdmin1 = (features: readonly RawAdmin1[]): Admin1Normalized => {
  const report: Admin1Report = { noCountry: [], withoutId: 0, merged: [], ambiguous: [] };
  const byCountry = new Map<string, Admin1Unit[]>();
  const nameOf = (raw: RawAdmin1): string => raw.properties.name ?? "";

  const groups = new Map<string, RawAdmin1[]>();
  for (const raw of features) {
    const code = raw.properties.iso_3166_2;
    if (isRealIsoCode(code)) groups.set(code, [...(groups.get(code) ?? []), raw]);
  }

  const push = (country: string, unit: Admin1Unit): void => {
    byCountry.set(country, [...(byCountry.get(country) ?? []), unit]);
    if (unit.id === undefined) report.withoutId += 1;
  };

  const done = new Set<string>();
  for (const raw of features) {
    const code = raw.properties.iso_3166_2;
    const country = countryOfCode(code);
    if (country === null) {
      report.noCountry.push(nameOf(raw));
      continue;
    }
    if (!isRealIsoCode(code)) {
      push(country, { type: "Feature", properties: { name: nameOf(raw) }, geometry: raw.geometry });
      continue;
    }
    const group = groups.get(code) ?? [raw];
    const names = [...new Set(group.map(nameOf))];
    if (group.length === 1) {
      push(country, {
        type: "Feature",
        id: code,
        properties: { name: nameOf(raw) },
        geometry: raw.geometry,
      });
    } else if (names.length === 1) {
      if (done.has(code)) continue;
      done.add(code);
      report.merged.push({ id: code, parts: group.length });
      push(country, {
        type: "Feature",
        id: code,
        properties: { name: nameOf(raw) },
        geometry: mergeGeometry(group),
      });
    } else {
      if (!done.has(code)) report.ambiguous.push({ id: code, names });
      done.add(code);
      push(country, { type: "Feature", properties: { name: nameOf(raw) }, geometry: raw.geometry });
    }
  }
  return { byCountry, report };
};

/** d3 reads a polygon wound the wrong way as "the whole sphere minus the polygon": area close to 4π. */
const HEMISPHERE = 2 * Math.PI;

/**
 * Quantization can leave a sliver (a 5-point island of North Carolina's Outer Banks) with its ring
 * reversed, and d3 then paints the whole map with it. Drops every polygon of `objectName` whose spherical
 * area exceeds a hemisphere, and the units left with no polygon. **Mutates `topology`.**
 *
 * Returns how many polygons were dropped and the ids (or `null`) of the units removed entirely.
 */
export const pruneInvertedPolygons = (
  topology: Topology,
  objectName: string,
): { polygons: number; droppedUnits: (string | number | undefined)[] } => {
  const collection = topology.objects[objectName] as GeometryCollection;
  let polygons = 0;
  const droppedUnits: (string | number | undefined)[] = [];
  const inverted = (arcs: number[][]): boolean =>
    geoArea(feature(topology, { type: "Polygon", arcs })) > HEMISPHERE;

  collection.geometries = collection.geometries.filter((geometry) => {
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return true;
    const all = geometry.type === "Polygon" ? [geometry.arcs] : geometry.arcs;
    const kept = all.filter((arcs) => !inverted(arcs));
    polygons += all.length - kept.length;
    if (kept.length === 0) {
      droppedUnits.push(geometry.id);
      return false;
    }
    if (geometry.type === "Polygon") return true;
    geometry.arcs = kept;
    return true;
  });
  return { polygons, droppedUnits };
};

/** Features of `objectName` whose spherical area exceeds a hemisphere. Empty if the data is sound. */
export const findInvertedUnits = (topology: Topology, objectName: string): string[] => {
  const collection = topology.objects[objectName] as GeometryCollection;
  return feature(topology, collection as GeometryCollection<{ name?: string }>)
    .features.filter((f) => geoArea(f) > HEMISPHERE)
    .map((f) => String(f.id ?? f.properties?.name ?? "?"));
};

const mostCommon = (values: readonly string[]): string | null => {
  const tally = new Map<string, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  return [...tally].sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0]?.[0] ?? null;
};

/**
 * The English name of each country, as Natural Earth words it, keyed by the prefix of the code (like
 * `normalizeAdmin1`). Placeholders count too, so Kosovo, whose units have no real code, still gets its name.
 * Ties go to the alphabetically first value.
 *
 * It deliberately says nothing about the KIND of subdivision: Natural Earth's `type_en` calls Spain's 52 provinces
 * "Autonomous Community", which would contradict the data.
 */
export const countryNames = (features: readonly RawAdmin1[]): Map<string, string> => {
  const names = new Map<string, string[]>();
  for (const raw of features) {
    const country = countryOfCode(raw.properties.iso_3166_2);
    const name = raw.properties.admin;
    if (country !== null && name) names.set(country, [...(names.get(country) ?? []), name]);
  }
  return new Map(
    [...names].map(([country, all]) => [country, mostCommon(all) ?? country] as const),
  );
};
