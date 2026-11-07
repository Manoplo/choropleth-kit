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
 * Un nivel del drill-down (dd.md §11.2.2): geometría + datos + codificación visual de UNA profundidad
 * (mundo, país, región…). Los niveles se describen UNA vez; la librería se encarga del vuelo, la carga,
 * el fundido, las migas y el teclado.
 */
export type DrillLevel<TDatum> = {
  /** `"country"`, `"region"`, `"store"`… Único dentro de la lista; es la clave del nivel. */
  id: string;
  /** Nombre del NIVEL («Países»): raíz de las migas y anuncios de accesibilidad. */
  label?: string;
  geography:
    | GeographyInput
    | "inherit" // la del padre (p. ej. tiendas sobre el país)
    | ((ctx: DrillContext) => GeographyInput); // ({ parentId }) => import(`./admin1/${parentId}.json`)
  objectName?: string;
  /** Subconjunto para este padre: un admin-1 mundial filtrado por país. */
  filterFeatures?: (feature: Feature, ctx: DrillContext) => boolean;
  getFeatureId?: (feature: Feature) => string | undefined;
  /** Clave de caché de la geometría. Default: `${id}:${parentId}` si `geography` es función. */
  geographyKey?: (ctx: DrillContext) => string;
  /** Codificación visual de ESTE nivel. Si falta, se usan las props del mapa (variant, getValue…). */
  encoding?: VariantConfig<TDatum> & { getId?: (datum: TDatum) => string };
  /** ¿Se puede bajar desde este item? Default: `true` si existe un nivel siguiente. */
  canDrill?: boolean | ((item: MapItem<TDatum>) => boolean);
  /** `"inherit"` (default): continuidad perfecta (§11.2.4). Otra: fundido tras el vuelo. */
  projection?: "inherit" | ProjectionName | (() => GeoProjection);
  /** Qué queda visible del padre. Default `"siblings"`. */
  context?: "siblings" | "none";
  /** Encuadre explícito por id en [lon, lat] (España con o sin Canarias…). */
  focusBounds?: Readonly<Record<string, [[number, number], [number, number]]>>;
};

/**
 * Identidad con comprobación: existe para que TypeScript infiera `TDatum` sin anotaciones
 * (`defineDrillLevels<Row>([...])`) y para que una lista mal formada (vacía, ids repetidos) falle al
 * DEFINIRLA, con un mensaje que dice qué tocar, y no a mitad de un clic.
 */
export const defineDrillLevels = <TDatum>(
  levels: readonly DrillLevel<TDatum>[],
): readonly DrillLevel<TDatum>[] => {
  validateLevels(levels);
  return levels;
};

/** Lo que reciben `onDrill` y `onDrillEnd`. */
export type DrillEvent<TDatum> = {
  direction: DrillDirection;
  from: DrillContext;
  to: DrillContext;
  /** El item pulsado, si lo hubo (no hay en el breadcrumb, el teclado ni la URL). */
  item?: MapItem<TDatum>;
};

/** El evento de pasar de `from` a `to`, o `null` si la ruta no cambia. */
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
 * ¿Se puede bajar desde este item? (`data-drillable`, cursor, pista del tooltip.) Hace falta un nivel
 * por debajo del actual, y `canDrill` del nivel (booleano o función) no debe prohibirlo.
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
 * Profundidad cuya geometría se dibuja a `depth`: un nivel `"inherit"` dibuja la de su padre, así que
 * sube hasta el primero que no hereda. Dos profundidades con la misma fuente dibujan las mismas regiones
 * (tiendas sobre un país), y no hace falta una capa de contexto aparte.
 */
export const sourceDepth = <TDatum>(
  levels: readonly DrillLevel<TDatum>[],
  depth: number,
): number => {
  let source = Math.min(depth, levels.length - 1);
  while (source > 0 && levels[source]?.geography === "inherit") source--;
  return source;
};
