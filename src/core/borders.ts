import type { FeatureCollection, MultiLineString } from "geojson";
import type { Topology } from "topojson-specification";
import { mesh } from "topojson-client";

export type CreateBordersOptions = {
  geography: Topology | FeatureCollection;
  /** Mismo `objectName` que se pasó a `toFeatureCollection`, para que ambas lean el mismo objeto. */
  objectName?: string;
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
}: CreateBordersOptions): MultiLineString | null => {
  if ((geography as { type?: unknown }).type !== "Topology") return null;

  const topology = geography as Topology;
  const name = objectName ?? Object.keys(topology.objects)[0];
  const object = name === undefined ? undefined : topology.objects[name];
  if (object === undefined) return null;

  return mesh(topology, object as Parameters<typeof mesh>[1], (a, b) => a !== b);
};
