import type { Feature } from "geojson";
import type { GeoProjection } from "d3-geo";
import {
  contextOf,
  drillDirectionBetween,
  validateLevels,
  type DrillContext,
  type DrillDirection,
  type GeographyInput,
  type ProjectionName,
  type VariantConfig,
} from "../core";
import type { MapItem } from "./map-item";

/**
 * A drill-down level: geometry + data + visual encoding of ONE depth (world, country,
 * region…). Levels are described ONCE; the library takes care of the flight, the loading, the fade, the
 * breadcrumbs and the keyboard.
 */
export type DrillLevel<TDatum> = {
  /** `"country"`, `"region"`, `"store"`… Unique within the list; it is the level's key. */
  id: string;
  /** Name of the LEVEL ("Countries"): root of the breadcrumbs and accessibility announcements. */
  label?: string;
  geography:
    | GeographyInput
    | "inherit" // the parent's (e.g. stores over the country)
    | ((ctx: DrillContext) => GeographyInput); // ({ parentId }) => import(`./admin1/${parentId}.json`)
  objectName?: string;
  /** Subset for this parent: a world admin-1 filtered by country. */
  filterFeatures?: (feature: Feature, ctx: DrillContext) => boolean;
  getFeatureId?: (feature: Feature) => string | undefined;
  /** Geometry cache key. Default: `${id}:${parentId}` if `geography` is a function. */
  geographyKey?: (ctx: DrillContext) => string;
  /** Visual encoding of THIS level. If missing, the map's props are used (variant, getValue…). */
  encoding?: VariantConfig<TDatum> & { getId?: (datum: TDatum) => string };
  /** Can you drill down from this item? Default: `true` if a next level exists. */
  canDrill?: boolean | ((item: MapItem<TDatum>) => boolean);
  /** `"inherit"` (default): perfect continuity (§11.2.4). Anything else: a fade after the flight. */
  projection?: "inherit" | ProjectionName | (() => GeoProjection);
  /** What stays visible of the parent. Default `"siblings"`. */
  context?: "siblings" | "none";
  /** Explicit framing by id in [lon, lat] (Spain with or without the Canary Islands…). */
  focusBounds?: Readonly<Record<string, [[number, number], [number, number]]>>;
};

/**
 * Identity with validation: it exists so TypeScript infers `TDatum` without annotations
 * (`defineDrillLevels<Row>([...])`) and so a malformed list (empty, repeated ids) fails when it is
 * DEFINED, with a message saying what to change, and not in the middle of a click.
 */
export const defineDrillLevels = <TDatum>(
  levels: readonly DrillLevel<TDatum>[],
): readonly DrillLevel<TDatum>[] => {
  validateLevels(levels);
  return levels;
};

/** What `onDrill` and `onDrillEnd` receive. */
export type DrillEvent<TDatum> = {
  direction: DrillDirection;
  from: DrillContext;
  to: DrillContext;
  /** The clicked item, if any (there is none for the breadcrumb, the keyboard or the URL). */
  item?: MapItem<TDatum>;
};

/** The event of going from `from` to `to`, or `null` if the route does not change. */
export const buildDrillEvent = <TDatum>({
  from,
  to,
  item,
}: {
  from: readonly string[];
  to: readonly string[];
  item?: MapItem<TDatum>;
}): DrillEvent<TDatum> | null => {
  const direction = drillDirectionBetween(from, to);
  if (direction === null) return null;
  return {
    direction,
    from: contextOf(from),
    to: contextOf(to),
    ...(item === undefined ? {} : { item }),
  };
};

/**
 * Can you drill down from this item? (`data-drillable`, cursor, tooltip hint.) It needs a level below
 * the current one, and the level's `canDrill` (boolean or function) must not forbid it.
 */
export const isDrillable = <TDatum>(
  levels: readonly DrillLevel<TDatum>[],
  depth: number,
  item: MapItem<TDatum>,
): boolean => {
  const level = levels[depth];
  if (level === undefined || depth >= levels.length - 1) return false;
  const { canDrill } = level;
  if (canDrill === undefined) return true;
  return typeof canDrill === "function" ? canDrill(item) : canDrill;
};

/**
 * Depth whose geometry is drawn at `depth`: an `"inherit"` level draws its parent's, so it climbs up to
 * the first one that does not inherit. Two depths with the same source draw the same regions (stores
 * over a country), and no separate context layer is needed.
 */
export const sourceDepth = <TDatum>(
  levels: readonly DrillLevel<TDatum>[],
  depth: number,
): number => {
  let source = Math.min(depth, levels.length - 1);
  while (source > 0 && levels[source]?.geography === "inherit") source--;
  return source;
};
