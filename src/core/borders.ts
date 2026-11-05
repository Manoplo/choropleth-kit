import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import type { Topology } from "topojson-specification";
import { feature as toFeature, mesh } from "topojson-client";

export type CreateBordersOptions = {
  geography: Topology | FeatureCollection;
  /** Mismo `objectName` que se pasó a `toFeatureCollection`, para que ambas lean el mismo objeto. */
  objectName?: string;
  /**
   * El mismo filtro que se aplicó a las regiones: una frontera solo se dibuja si AMBOS lados se
   * conservan (si no, quedaría la línea de un país que ya no está).
   */
  filterFeatures?: (feature: Feature) => boolean;
};

/**
 * Fronteras INTERIORES como una sola línea (una frontera compartida se dibuja una vez).
 *
 * Solo es posible con TopoJSON: sabe qué arcos comparten dos países. Con GeoJSON cada polígono
 * lleva su propio contorno y no hay forma fiable de saber cuáles se tocan, así que devuelve `null`
 * y el consumidor debe usar `stroke` en cada región.
 *
 * `a !== b` descarta los arcos del contorno exterior (costas): el borde del país con el mar
 * no es una frontera y duplicaría el trazo de la silueta.
 */
export const createBorders = ({
  geography,
  objectName,
  filterFeatures,
}: CreateBordersOptions): MultiLineString | null => {
  if ((geography as { type?: unknown }).type !== "Topology") return null;

  const topology = geography as Topology;
  const name = objectName ?? Object.keys(topology.objects)[0];
  const object = name === undefined ? undefined : topology.objects[name];
  if (object === undefined) return null;

  if (filterFeatures === undefined) {
    return mesh(topology, object as Parameters<typeof mesh>[1], (a, b) => a !== b);
  }

  // `mesh` pregunta por cada arco con las geometrías de sus dos lados; se convierten a Feature una
  // sola vez (caché) porque el filtro del usuario trabaja con Features.
  const kept = new Map<unknown, boolean>();
  const keep = (geometry: unknown): boolean => {
    let result = kept.get(geometry);
    if (result === undefined) {
      result = filterFeatures(toFeature(topology, geometry as never) as unknown as Feature);
      kept.set(geometry, result);
    }
    return result;
  };
  return mesh(
    topology,
    object as Parameters<typeof mesh>[1],
    (a, b) => a !== b && keep(a) && keep(b),
  );
};
