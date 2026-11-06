import type { Feature, FeatureCollection, MultiPoint } from "geojson";
import { geoBounds, geoPath, type GeoPermissibleObjects, type GeoProjection } from "d3-geo";
import { getFocusGeometry, normalizePadding, type LonLatBounds, type Padding } from "./bounds";
import {
  createProjection,
  projectionFactory,
  rebaseProjection,
  type ProjectionName,
} from "./projection";

/** Lo que se dibuja a cada profundidad: las features (ya filtradas) y cómo se identifican. */
export type ChainLevel = {
  features: readonly Feature[];
  idOf: (feature: Feature) => string | undefined;
};

export type BuildProjectionChainParams = {
  /** `levels[d]` = lo que se muestra a profundidad `d`. Tiene `path.length + 1` elementos. */
  levels: readonly ChainLevel[];
  /** Ids desde la raíz: `path[d]` es la región de `levels[d]` en la que se entra. */
  path: readonly string[];
  name?: ProjectionName;
  width: number;
  height: number;
  padding?: number | Padding;
  /** Encuadres explícitos por id en lon/lat (España con Canarias). Anula el cuerpo principal. */
  focusBounds?: Readonly<Record<string, LonLatBounds | null | undefined>>;
};

export type ProjectionChain = {
  /** `projections[d]` encuadra la región `path[d − 1]` dentro de `projections[d − 1]` (la 0, el mundo). */
  projections: GeoProjection[];
  /**
   * Id de la región que no se pudo encuadrar (no está en el nivel padre, o no tiene extensión).
   * Desde ahí las proyecciones repiten la última válida, para no romper el mapa.
   */
  missing: string | null;
};

/** Unos límites lon/lat como un objeto que `fitExtent` entiende: 4 esquinas y 4 puntos medios. */
const boundsToObject = ([[west, south], [east, north]]: LonLatBounds): MultiPoint => ({
  type: "MultiPoint",
  coordinates: [
    [west, south],
    [(west + east) / 2, south],
    [east, south],
    [east, (south + north) / 2],
    [east, north],
    [(west + east) / 2, north],
    [west, north],
    [west, (south + north) / 2],
  ],
});

/**
 * Si unos límites cruzan el antimeridiano (`oeste > este`: Rusia, Fiyi), en un mapa plano no existe un
 * rectángulo que contenga las dos mitades —saldría uno del ancho del mundo—. Se queda la mitad más ancha,
 * igual que `getFocusExtent` para `zoomTo`.
 */
const widerHalf = ([[west, south], [east, north]]: LonLatBounds): LonLatBounds => {
  if (west <= east)
    return [
      [west, south],
      [east, north],
    ];
  return 180 - west >= east + 180
    ? [
        [west, south],
        [180, north],
      ]
    : [
        [-180, south],
        [east, north],
      ];
};

/** El foco de una geometría: ella misma, o (si cruza el antimeridiano) la caja de su mitad más ancha. */
const mainBody = (geometry: GeoPermissibleObjects | null): GeoPermissibleObjects | null => {
  if (geometry === null) return null;
  const [[west, south], [east, north]] = geoBounds(geometry);
  return west > east
    ? boundsToObject(
        widerHalf([
          [west, south],
          [east, north],
        ]),
      )
    : geometry;
};

/**
 * La cadena de proyecciones de toda la ruta (dd.md §11.2.4): la raíz se ajusta al mundo y cada nivel
 * es la del padre con `scale`/`translate` reajustados al cuerpo principal de la región elegida
 * (`rebaseProjection`). Función pura de (niveles, ruta, tamaño, padding). Al redimensionar se recalcula
 * entera: es un `fitExtent` por nivel.
 */
export const buildProjectionChain = ({
  levels,
  path,
  name,
  width,
  height,
  padding,
  focusBounds,
}: BuildProjectionChainParams): ProjectionChain => {
  const root = levels[0];
  const collection = (features: readonly Feature[]): FeatureCollection => ({
    type: "FeatureCollection",
    features: [...features],
  });
  const projections: GeoProjection[] = [
    createProjection({
      name,
      width,
      height,
      featureCollection: collection(root?.features ?? []),
    }),
  ];
  const factory = projectionFactory(name);
  const pad = normalizePadding(padding);

  let missing: string | null = null;
  for (let depth = 1; depth <= path.length; depth++) {
    const parent = projections[depth - 1] as GeoProjection;
    const id = path[depth - 1] as string;
    if (missing !== null) {
      projections.push(parent);
      continue;
    }
    const level = levels[depth - 1];
    const feature = level?.features.find((f) => level.idOf(f) === id);
    const bounds = focusBounds?.[id];
    const focus: GeoPermissibleObjects | null =
      bounds != null
        ? boundsToObject(widerHalf(bounds))
        : feature === undefined
          ? null
          : mainBody(getFocusGeometry({ feature, path: geoPath(parent) }));
    if (focus === null) {
      missing = id;
      projections.push(parent);
      continue;
    }
    try {
      projections.push(
        rebaseProjection({ parent, factory, focus, width, height, padding: pad }).projection,
      );
    } catch {
      missing = id;
      projections.push(parent);
    }
  }
  return { projections, missing };
};
