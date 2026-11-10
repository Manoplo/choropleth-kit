import type { Feature } from "geojson";
import type { Point } from "../core";

/** Drill-down level an item belongs to. Without drill: always the root. */
export type DrillLevelInfo = { id: string; depth: number };

/** Default level while the drill-down does not exist. */
export const ROOT_LEVEL: DrillLevelInfo = { id: "root", depth: 0 };

export type RegionItem<TDatum> = {
  kind: "region";
  id: string;
  feature: Feature;
  /** `undefined` = region without data. */
  datum: TDatum | undefined;
  level: DrillLevelInfo;
  /** There is a level below for this region. */
  drillable: boolean;
};

export type PointItem<TDatum> = {
  kind: "point";
  id: string;
  /** The datum's [lon, lat]. */
  coordinates: Point;
  /** The region underneath, if the datum's id joins with one. */
  feature: Feature | undefined;
  datum: TDatum;
  level: DrillLevelInfo;
  drillable: boolean;
};

/**
 * ONE type for everything interactive. `kind` discriminates: a store is not a
 * region, but the consumer wants a single handler and a single tooltip.
 */
export type MapItem<TDatum> = RegionItem<TDatum> | PointItem<TDatum>;

/** Which item it is, without carrying its data: what the `map-store` keeps. */
export type ItemRef = { kind: MapItem<unknown>["kind"]; id: string };

export const isSameItem = (a: ItemRef | null, b: ItemRef | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/** `MapItem` + what the tooltip needs to render. */
export type ItemContext<TDatum> = MapItem<TDatum> & {
  /** Number, category (`categorical`) or `null` if there is no datum. */
  value: number | string | null;
  /** `value` formatted; empty string if there is no value. */
  formattedValue: string;
  /** Color the item is painted with. */
  color: string;
  /** Readable name: the region's `properties.name`, or the id. */
  label: string;
};
