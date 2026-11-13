import type { LonLatBounds } from "../core";

/**
 * Overseas territories that `region` drops, by country: lon/lat boxes `[[west, south], [east, north]]`. A
 * polygon of the country whose middle (of its bounding box) falls inside a box is not drawn (nor framed).
 *
 * It is CURATED, not computed: no distance rule separates Svalbard (overseas) from Peninsular Malaysia
 * (not). It only lists what `world110m` actually draws, and each entry is covered by a test. At 1:110m
 * Spain, Portugal and the Netherlands have no overseas polygons (the Canary Islands, the Azores and the
 * Caribbean are not in the data); when a 1:50m geometry is added, its territories are added here.
 *
 * Alaska stays on purpose: it is part of the North American mass and a `northAmerica` map without it
 * would be wrong. Showing or hiding territories per country is FEAT-023.
 */
export const OVERSEAS_TERRITORIES: Readonly<Record<string, readonly LonLatBounds[]>> = {
  // French Guiana.
  FR: [
    [
      [-56, 1],
      [-51, 7],
    ],
  ],
  // Svalbard.
  NO: [
    [
      [0, 73],
      [40, 82],
    ],
  ],
  // Hawaii.
  US: [
    [
      [-162, 18],
      [-154, 23],
    ],
  ],
};
