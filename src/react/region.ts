import { useMemo } from "react";
import type { FeatureCollection } from "geojson";
import { dropOverseas, resolveRegion } from "../core";
// Direct imports (not `../geo`): the barrel also pulls `world-110m.json` (~100 KB), which a map with its own
// geometry must not pay for.
import { OVERSEAS_TERRITORIES } from "../geo/overseas";
import { REGION_PRESETS, type RegionPresetName } from "../geo/region-presets";

/**
 * What the `region` prop accepts: a preset (`"europe"`, `"westernEurope"`, `"eu27"`…), an ISO 3166-1 alpha-2
 * code (`"ES"`), or a list mixing both. The `(string & {})` keeps autocompletion for the presets while
 * still allowing any code.
 */
export type RegionProp =
  RegionPresetName | (string & {}) | readonly (RegionPresetName | (string & {}))[];

/** A `region` already resolved: the ids that stay, and a key that changes only when the CONTENT changes. */
export type ResolvedRegion = {
  key: string;
  ids: ReadonlySet<string>;
};

const regionKey = (region: RegionProp): string =>
  typeof region === "string" ? region : region.join("\u0000");

/**
 * Resolves `region` once per content (an inline `region={["ES", "PT"]}` is a new array on every render:
 * its identity must not matter). It throws on an unknown name or an empty list, as the other invalid
 * configurations do (a blank map with no error would be the worst symptom to debug).
 */
export const useRegion = (region: RegionProp | undefined): ResolvedRegion | undefined => {
  const key = region === undefined ? undefined : regionKey(region);
  return useMemo(
    () =>
      region === undefined || key === undefined
        ? undefined
        : { key, ids: resolveRegion(region, REGION_PRESETS) },
    // `key` summarizes the content of `region`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
};

// A collection without its overseas territories, cached by the identity of the collection and the region's
// key: the paths downstream are memoized by the identity of `features`, and a new object per render would
// recompute all of them.
const cache = new WeakMap<FeatureCollection, Map<string, FeatureCollection>>();

/** `fc` (already filtered by the region's ids) without the territories in `OVERSEAS_TERRITORIES`. */
export const withoutOverseas = (
  fc: FeatureCollection,
  region: ResolvedRegion,
): FeatureCollection => {
  const byKey = cache.get(fc) ?? new Map<string, FeatureCollection>();
  cache.set(fc, byKey);
  const found = byKey.get(region.key);
  if (found !== undefined) return found;
  const features = dropOverseas(fc.features, OVERSEAS_TERRITORIES);
  const created = features.every((feature, i) => feature === fc.features[i])
    ? fc
    : { ...fc, features };
  byKey.set(region.key, created);
  return created;
};
