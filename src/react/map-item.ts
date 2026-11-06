import type { Feature } from "geojson";
import type { Point } from "../core";

/** Nivel del drill-down al que pertenece un item (dd.md §11.2). Sin drill: siempre la raíz. */
export type DrillLevelInfo = { id: string; depth: number };

/** Nivel por defecto mientras no exista el drill-down. */
export const ROOT_LEVEL: DrillLevelInfo = { id: "root", depth: 0 };

export type RegionItem<TDatum> = {
  kind: "region";
  id: string;
  feature: Feature;
  /** `undefined` = región sin dato. */
  datum: TDatum | undefined;
  level: DrillLevelInfo;
  /** Hay un nivel por debajo para esta región. */
  drillable: boolean;
};

export type PointItem<TDatum> = {
  kind: "point";
  id: string;
  /** [lon, lat] del dato. */
  coordinates: Point;
  /** La región de debajo, si el id del dato cruza con alguna. */
  feature: Feature | undefined;
  datum: TDatum;
  level: DrillLevelInfo;
  drillable: boolean;
};

/**
 * UN tipo para todo lo interactivo (dd.md §9.2 y §12.1). `kind` discrimina: una tienda no es una
 * región, pero el consumidor quiere un solo handler y un solo tooltip.
 */
export type MapItem<TDatum> = RegionItem<TDatum> | PointItem<TDatum>;

/** Qué item es, sin cargar con sus datos: lo que guarda el `map-store`. */
export type ItemRef = { kind: MapItem<unknown>["kind"]; id: string };

export const isSameItem = (a: ItemRef | null, b: ItemRef | null): boolean =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

/** `MapItem` + lo que el tooltip necesita para pintarse. */
export type ItemContext<TDatum> = MapItem<TDatum> & {
  /** Número, categoría (`categorical`) o `null` si no hay dato. */
  value: number | string | null;
  /** `value` formateado; cadena vacía si no hay valor. */
  formattedValue: string;
  /** Color con el que está pintado el item. */
  color: string;
  /** Nombre legible: `properties.name` de la región, o el id. */
  label: string;
};
