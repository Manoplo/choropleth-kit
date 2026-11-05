import type { Feature, Geometry, Polygon, Position } from "geojson";
import type { GeoPath } from "d3-geo";
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
