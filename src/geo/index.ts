import type { Topology } from "topojson-specification";
import world from "./world-110m.json";

/**
 * World at 1:110m (Natural Earth, public domain) as TopoJSON, with **ISO 3166-1 alpha-2 in `id`**
 * (`"ES"`) and the English name in `properties.name`. Use the `countries` object.
 *
 * It is `world-atlas` with the ids converted (see `scripts/build-geo/build-world-110m.mjs`), plus
 * Kosovo as `"XK"`. Northern Cyprus and Somaliland still have no id: they are painted as a
 * non-interactive layer. At this scale microstates are missing: use `worldFallbackPoints`.
 *
 * ⚠️ Disputed borders (Western Sahara, Crimea, Kashmir…) are Natural Earth's.
 * Validate them before showing a map in a product.
 */
export const world110m = world as unknown as Topology;

export { isoNumericToAlpha2 } from "./iso-numeric-to-alpha2";
export { worldFallbackPoints } from "./fallback-points";
export { REGION_PRESETS } from "./region-presets";
export type { RegionPresetName } from "./region-presets";
export { OVERSEAS_TERRITORIES } from "./overseas";
