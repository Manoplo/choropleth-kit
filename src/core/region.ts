import type { Feature, Geometry, MultiPolygon, Position } from "geojson";
import type { LonLatBounds } from "./bounds";
import type { Point } from "./variants";

/** A preset name (`"europe"`), an ISO 3166-1 alpha-2 code (`"ES"`), or a list mixing both. */
export type RegionInput = string | readonly string[];

/** Preset name → alpha-2 ids it expands to. The table itself lives in `choropleth-kit/geo`. */
export type RegionPresets = Readonly<Record<string, readonly string[]>>;

const ALPHA2 = /^[A-Za-z]{2}$/;

/**
 * `region` → the set of alpha-2 ids that stay on the map.
 *
 * Each entry is a preset name (exact, camelCase: `"westernEurope"`) or an alpha-2 code (`"ES"`, case
 * insensitive). A preset wins over a code, but no preset name is two letters long, so they never clash.
 * It does not know the geography: an id that exists in no map simply matches nothing (the React layer
 * warns if the whole region is empty).
 *
 * It throws, listing the valid preset names, on an unknown name and on an empty list: an empty region
 * would draw a blank map with no error, which is the worst symptom to debug.
 */
export const resolveRegion = (region: RegionInput, presets: RegionPresets): ReadonlySet<string> => {
  const entries = typeof region === "string" ? [region] : region;
  if (entries.length === 0) {
    throw new Error(
      `[choropleth] region: the list is empty. Pass a preset (${presetNames(presets)}) or alpha-2 codes.`,
    );
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    const preset = Object.hasOwn(presets, entry) ? presets[entry] : undefined;
    if (preset !== undefined) {
      for (const id of preset) ids.add(id);
    } else if (ALPHA2.test(entry)) {
      ids.add(entry.toUpperCase());
    } else {
      throw new Error(
        `[choropleth] region: unknown "${entry}". Use an alpha-2 code ("ES") or one of the presets: ${presetNames(presets)}.`,
      );
    }
  }
  return ids;
};

const presetNames = (presets: RegionPresets): string => Object.keys(presets).join(", ");

/** Country id → lon/lat boxes of its overseas territories. The table itself lives in `choropleth-kit/geo`. */
export type OverseasTable = Readonly<Record<string, readonly LonLatBounds[]>>;

/** Is the middle of the polygon's bounding box (its outer ring) inside `box`? Boxes do not cross the antimeridian. */
const centerInBox = (
  [ring]: readonly (readonly (readonly number[])[])[],
  [[west, south], [east, north]]: LonLatBounds,
): boolean => {
  if (ring === undefined || ring.length === 0) return false;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon = NaN, lat = NaN] of ring) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  const lon = (minLon + maxLon) / 2;
  const lat = (minLat + maxLat) / 2;
  return lon >= west && lon <= east && lat >= south && lat <= north;
};

/**
 * Drops the overseas territories listed in `territories` from the features: a polygon of country `id` goes
 * away when the middle of its bounding box falls inside one of that country's boxes (France without Guiana, Norway without
 * Svalbard, the US without Hawaii).
 *
 * Why a curated table and not a distance rule: `fitSize` frames the WHOLE geometry, so a single French
 * Guiana polygon shrinks a map of Europe into a corner of the container. But no distance threshold
 * separates Svalbard (overseas) from Peninsular Malaysia or Papua (not): measured on the world at 1:110m,
 * every threshold either keeps Svalbard or drops half of Malaysia and Indonesia. Which polygons count as
 * overseas is a political decision, so it is data.
 *
 * Boxes are in lon/lat and must not cross the antimeridian (`west <= east`). A feature that does not change
 * comes back as the SAME object (the path memoization downstream relies on identity); the input is never
 * mutated. A feature is never emptied: if the table would drop every polygon, it is returned untouched.
 */
export const dropOverseas = (features: readonly Feature[], territories: OverseasTable): Feature[] =>
  features.map((feature) => {
    const boxes = feature.id === undefined ? undefined : territories[String(feature.id)];
    const { geometry } = feature;
    if (boxes === undefined || boxes.length === 0 || geometry.type !== "MultiPolygon")
      return feature;

    const kept = geometry.coordinates.filter(
      (coordinates) => !boxes.some((box) => centerInBox(coordinates, box)),
    );
    if (kept.length === geometry.coordinates.length || kept.length === 0) return feature;
    const trimmed: MultiPolygon = { type: "MultiPolygon", coordinates: kept };
    return { ...feature, geometry: trimmed };
  });

// Longitude axis in 1° bins: bin `b` covers [b − 180°, b − 179°), so the cut d3 makes at ±180° is the boundary
// between bin 359 and bin 0.
const BINS = 360;
const binOf = (lon: number): number => Math.floor((((lon + 180) % 360) + 360) % 360);

/** Marks the bins a ring covers, following each edge by its SHORTER arc (a ring that crosses ±180° does not fill the world). */
const markRing = (ring: readonly Position[], occupied: Uint8Array) => {
  let previous: number | undefined;
  for (const [lon] of ring) {
    if (lon === undefined || !Number.isFinite(lon)) continue;
    const at = (((lon + 180) % 360) + 360) % 360;
    if (previous !== undefined) {
      const delta = ((at - previous + 540) % 360) - 180; // shortest signed step
      const steps = Math.max(1, Math.ceil(Math.abs(delta)));
      for (let i = 0; i <= steps; i++) {
        occupied[binOf(previous + (delta * i) / steps - 180)] = 1;
      }
    }
    occupied[binOf(lon)] = 1;
    previous = at;
  }
};

const markGeometry = (geometry: Geometry | null, occupied: Uint8Array) => {
  if (geometry === null) return;
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) markRing(ring, occupied);
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) markRing(ring, occupied);
    }
  }
};

/**
 * `[λ, φ]` rotation for the projection of a REGION whose geometry straddles the antimeridian, or `undefined`
 * if it does not (then the map keeps the world's orientation, and drill continuity with it).
 *
 * Why: a flat projection cuts the world at ±180°. Oceania (Fiji, New Zealand, Samoa…) and Russia's Chukotka
 * sit on both sides of that line, so `fitSize` would stretch the map over the whole world and
 * tear the region across both edges. The fix is to cut the world somewhere else: in the middle of the widest
 * stretch of longitudes the region does NOT use (the Atlantic for Oceania, the Americas for Russia).
 * `points` are extra [lon, lat] that must land on the right side too (microstates drawn as dots).
 *
 * It is longitude only (`φ = 0`): the region is never tilted.
 */
export const regionRotation = (
  features: readonly Feature[],
  points: readonly Point[] = [],
): [number, number] | undefined => {
  const occupied = new Uint8Array(BINS);
  for (const feature of features) markGeometry(feature.geometry, occupied);
  for (const [lon] of points) if (Number.isFinite(lon)) occupied[binOf(lon)] = 1;

  // The widest circular run of empty bins (scanning twice around finds a run that wraps past the end).
  let start = -1;
  let length = 0;
  let runStart = -1;
  for (let i = 0; i < BINS * 2; i++) {
    if (occupied[i % BINS] === 1) {
      runStart = -1;
      continue;
    }
    if (runStart === -1) runStart = i;
    const runLength = Math.min(i - runStart + 1, BINS);
    if (runLength > length) {
      length = runLength;
      start = runStart;
    }
  }
  if (length === 0) return undefined; // the region covers every longitude: there is nowhere better to cut

  // A run that wraps past bin 359 contains the cut d3 already makes: nothing to do.
  if (start + length > BINS || start === 0) return undefined;

  // Cut in the middle of the run: the central meridian is then the opposite one, and λ = −central.
  const lambda = -(start + length / 2);
  return [((((lambda + 180) % 360) + 360) % 360) - 180, 0];
};
