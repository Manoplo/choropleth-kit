import type { Feature, Geometry, Polygon, Position } from "geojson";
import type { GeoPath } from "d3-geo";
import polylabel from "polylabel";
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
