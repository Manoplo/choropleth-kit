import type { Feature, Geometry, Polygon, Position } from "geojson";
import { geoBounds, type GeoPath } from "d3-geo";
import polylabel from "polylabel";
import type { CameraTransform, Extent, Size } from "./camera";
import type { Point } from "./variants";

export type GetFocusGeometryParams = {
  feature: Feature;
  /** `geoPath` ya proyectado: las áreas y distancias se miden en píxeles, no en grados. */
  path: GeoPath;
  /**
   * Un polígono cuenta como «del cuerpo principal» si el centro de sus límites está a menos de
   * `near × diagonal(principal)` del centro del principal. Por defecto 0,5.
   */
  near?: number;
};

const polygonsOf = (geometry: Geometry): Polygon[] | null => {
  if (geometry.type === "Polygon") return [geometry];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
  }
  return null;
};

/**
 * La sub-geometría «principal» de una feature: el polígono de mayor área proyectada más los que
 * están cerca de él (Mallorca, Córcega o Sicilia sí; Guayana, Hawái o Canarias no).
 *
 * Por qué existe (dd.md §11.1.5): `geoPath.bounds` / `centroid` de la feature entera incluyen los
 * territorios lejanos. Hacer zoom a «Francia» enseñaría medio Atlántico, y su burbuja caería en el
 * golfo de Vizcaya. Se usa para encuadrar y para anclar burbujas y etiquetas.
 *
 * Devuelve `null` si la feature no tiene geometría. Las geometrías que no son polígonos y los
 * polígonos sueltos se devuelven tal cual.
 */
export const getFocusGeometry = ({
  feature,
  path,
  near = 0.5,
}: GetFocusGeometryParams): Geometry | null => {
  const { geometry } = feature;
  if (geometry === null) return null;
  const polygons = polygonsOf(geometry);
  if (polygons === null || polygons.length <= 1) return geometry;

  const measured = polygons.map((polygon) => {
    const [[x0, y0], [x1, y1]] = path.bounds(polygon);
    return {
      polygon,
      area: path.area(polygon),
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      diagonal: Math.hypot(x1 - x0, y1 - y0),
    };
  });
  // Un polígono que no se puede medir (fuera de la proyección) no puede ser el principal.
  const usable = measured.filter((m) => Number.isFinite(m.area) && Number.isFinite(m.cx));
  const main = usable.reduce<(typeof usable)[number] | undefined>(
    (best, m) => (best === undefined || m.area > best.area ? m : best),
    undefined,
  );
  if (main === undefined) return geometry;

  const kept = usable.filter(
    (m) => m === main || Math.hypot(m.cx - main.cx, m.cy - main.cy) <= near * main.diagonal,
  );
  const [only] = kept;
  return kept.length === 1 && only !== undefined
    ? only.polygon
    : { type: "MultiPolygon", coordinates: kept.map((m) => m.polygon.coordinates) };
};

const ringArea = (ring: readonly Point[]): number => {
  let sum = 0;
  ring.forEach(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length] ?? [x, y];
    sum += x * ny - nx * y;
  });
  return Math.abs(sum / 2);
};

/**
 * Punto de anclaje de burbujas y etiquetas: el «polo de inaccesibilidad» (`polylabel`) del polígono
 * proyectado más grande de `geometry`, es decir, el punto interior más alejado del borde. A
 * diferencia del centroide, siempre cae DENTRO del polígono (Chile, Croacia, Francia).
 *
 * `project` convierte [lon, lat] en [x, y] de píxeles y devuelve `null` si no puede. `precision`
 * está en píxeles. Devuelve `null` si no hay ningún polígono proyectable.
 */
export const getAnchorPoint = ({
  geometry,
  project,
  precision = 1,
}: {
  geometry: Geometry | null;
  project: (coordinates: Point) => Point | null;
  precision?: number;
}): Point | null => {
  if (geometry === null) return null;
  const polygons = polygonsOf(geometry)?.map((p) => p.coordinates);
  if (polygons === undefined) return null;

  const projected = polygons
    .map((rings) =>
      rings.map((ring: Position[]) =>
        ring.flatMap(([lon, lat]) => {
          const at = lon === undefined || lat === undefined ? null : project([lon, lat]);
          return at === null ? [] : [at];
        }),
      ),
    )
    .filter(([outer]) => outer !== undefined && outer.length >= 3);

  const biggest = projected.reduce<(typeof projected)[number] | undefined>((best, rings) => {
    const outer = rings[0] ?? [];
    return best === undefined || ringArea(outer) > ringArea(best[0] ?? []) ? rings : best;
  }, undefined);
  if (biggest === undefined) return null;

  const [x, y] = polylabel(
    biggest.map((ring) => ring.map(([px, py]): [number, number] => [px, py])),
    precision,
  );
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

export type Padding = { top: number; right: number; bottom: number; left: number };

/** Margen por defecto al encajar y al volar a una región, en px (dd.md §11.1.1). */
export const DEFAULT_PADDING = 24;

/** `number` = el mismo margen en los cuatro lados. */
export const normalizePadding = (padding: number | Padding = DEFAULT_PADDING): Padding =>
  typeof padding === "number"
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding;

export type BoundsToTransformParams = {
  /** Lo que hay que encajar, en píxeles del lienzo: [[x0, y0], [x1, y1]]. */
  bounds: Extent;
  /** La vista (el contenedor). */
  size: Size;
  padding?: number | Padding;
  /** [mínimo, máximo] de `k`. Por defecto sin límites. */
  scaleExtent?: readonly [number, number];
};

/**
 * Cámara que encaja unos límites en la vista, con margen en píxeles (dd.md §11.1.5). Es el destino
 * de «zoom a un país» y del encuadre inicial. Respeta `scaleExtent`: si el país es tan pequeño que
 * haría falta más zoom del permitido, se queda en el máximo (y el país queda centrado).
 *
 * Límites degenerados (un punto): `k` sube hasta el máximo en vez de dar `Infinity`. Si el margen
 * se come toda la vista, `k` baja al mínimo.
 */
export const boundsToTransform = ({
  bounds,
  size,
  padding = DEFAULT_PADDING,
  scaleExtent = [0, Infinity],
}: BoundsToTransformParams): CameraTransform => {
  const [[x0, y0], [x1, y1]] = bounds;
  const { top, right, bottom, left } = normalizePadding(padding);
  const innerW = size.width - left - right;
  const innerH = size.height - top - bottom;
  const raw = Math.min(innerW / (x1 - x0), innerH / (y1 - y0));
  const k = Math.min(scaleExtent[1], Math.max(scaleExtent[0], Number.isNaN(raw) ? 1 : raw));
  return {
    k,
    x: left + innerW / 2 - k * ((x0 + x1) / 2),
    y: top + innerH / 2 - k * ((y0 + y1) / 2),
  };
};

/** Límites geográficos [[lonO, latS], [lonE, latN]]. Si `lonE < lonO`, cruzan el antimeridiano. */
export type LonLatBounds = readonly [Point, Point];

/** Puntos por lado con los que se muestrea un rectángulo geográfico al proyectarlo. */
const EDGE_SAMPLES = 9;

/**
 * Rectángulo geográfico → rectángulo en píxeles que lo contiene. Un rectángulo de lon/lat NO es un
 * rectángulo en pantalla (los paralelos se curvan en Equal Earth, el globo se estrecha en los
 * polos), así que se proyectan puntos a lo largo de sus cuatro lados y se toma el mínimo que los
 * contiene. Los puntos que la proyección no sabe proyectar se descartan; si no queda ninguno,
 * devuelve `null`.
 *
 * Si `lonE < lonO` el rectángulo cruza el antimeridiano (Fiyi, el Pacífico). En un mapa plano esa
 * región aparece partida en los dos bordes y **no existe un rectángulo que contenga las dos mitades**
 * (saldría un caja del ancho del mundo entero): se encuadra la mitad más ancha, igual que
 * `getFocusGeometry` se queda con el cuerpo principal.
 */
export const projectBounds = (
  bounds: LonLatBounds,
  project: (coordinates: Point) => Point | null,
): Extent | null => {
  const [[west, south], [east, north]] = bounds;
  if (east < west) {
    const eastHalf: LonLatBounds = [
      [west, south],
      [180, north],
    ];
    const westHalf: LonLatBounds = [
      [-180, south],
      [east, north],
    ];
    return projectBounds(180 - west >= east + 180 ? eastHalf : westHalf, project);
  }
  const samples: Point[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i += 1) {
    const t = i / (EDGE_SAMPLES - 1);
    const lon = west + (east - west) * t;
    const lat = south + (north - south) * t;
    samples.push([lon, south], [lon, north], [west, lat], [east, lat]);
  }
  const projected = samples.flatMap((at) => {
    const p = project(at);
    return p === null ? [] : [p];
  });
  if (projected.length === 0) return null;
  const xs = projected.map(([x]) => x);
  const ys = projected.map(([, y]) => y);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
};

export type GetFocusExtentParams = GetFocusGeometryParams & {
  /** [lon, lat] → píxeles del lienzo; `null` si no proyecta. */
  project: (coordinates: Point) => Point | null;
};

/**
 * Límites en píxeles del cuerpo principal de una región: lo que se encuadra al volar a ella
 * (dd.md §11.1.5). Es `getFocusGeometry` + sus límites proyectados, con un caso aparte:
 *
 * **Antimeridiano.** El polígono principal de Rusia (y el de Fiyi o Alaska) cruza la línea ±180° sin
 * partirse, y `path.bounds` mide las dos mitades: el encuadre abarcaría el mapa de borde a borde, con
 * Chukotka asomando por el lado contrario. Se detecta con `geoBounds` (que devuelve `oeste > este`
 * cuando se cruza) y se encuadra la mitad más ancha (`projectBounds`).
 *
 * Devuelve `null` si la feature no tiene geometría o sus límites no son finitos.
 */
export const getFocusExtent = ({
  feature,
  path,
  project,
  near,
}: GetFocusExtentParams): Extent | null => {
  const geometry = getFocusGeometry({ feature, path, near });
  if (geometry === null) return null;

  const [[west, south], [east, north]] = geoBounds(geometry);
  if (west > east)
    return projectBounds(
      [
        [west, south],
        [east, north],
      ],
      project,
    );

  const [[x0, y0], [x1, y1]] = path.bounds(geometry);
  return [x0, y0, x1, y1].every(Number.isFinite)
    ? [
        [x0, y0],
        [x1, y1],
      ]
    : null;
};
