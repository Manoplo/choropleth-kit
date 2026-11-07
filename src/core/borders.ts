import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import type { Topology } from "topojson-specification";
import { feature as toFeature, mesh } from "topojson-client";

export type CreateBordersOptions = {
  geography: Topology | FeatureCollection;
  /** Same `objectName` that was passed to `toFeatureCollection`, so both read the same object. */
  objectName?: string;
  /**
   * The same filter applied to the regions: a border is only drawn if BOTH sides are kept (otherwise
   * the line of a country that is no longer there would remain).
   */
  filterFeatures?: (feature: Feature) => boolean;
};

/**
 * INTERIOR borders as a single line (a shared border is drawn once).
 *
 * Only possible with TopoJSON: it knows which arcs two countries share. With GeoJSON each polygon
 * carries its own outline and there is no reliable way to know which ones touch, so it returns `null`
 * and the consumer must use `stroke` on each region.
 *
 * `a !== b` discards the arcs of the outer outline (coasts): a country's border with the sea is not
 * a border and would duplicate the stroke of the silhouette.
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

  // `mesh` asks for every arc with the geometries on its two sides; they are converted to a Feature
  // only once (cached) because the user's filter works with Features.
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
