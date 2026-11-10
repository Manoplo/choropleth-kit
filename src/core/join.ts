import type { Feature } from "geojson";

export type JoinDataOptions<TDatum> = {
  features: readonly Feature[];
  data: readonly TDatum[];
  /** Id of each user datum (e.g. `(d) => d.countryCode`). */
  getId: (datum: TDatum) => string;
  /**
   * Id of each region if it is not `feature.id` (e.g. `(f) => f.properties?.iso_a2`).
   * Returning `undefined` means "this region has no id": it cannot be joined and is ignored.
   */
  getFeatureId?: (feature: Feature) => string | undefined;
};

export type JoinResult<TDatum> = {
  /** region id → datum. Only contains joins that DID happen. */
  joined: Map<string, TDatum>;
  /** ids of data that do not match any region (e.g. "ES" when the geometry uses "724"). */
  unmatchedData: string[];
  /** ids of regions left without data (they will be painted with `emptyFill`). */
  featuresWithoutData: string[];
  /** repeated ids in `data`: only the first of each is kept. */
  duplicateDataIds: string[];
};

// GeoJSON allows `feature.id` to be a string OR a number, but our data ids are strings.
// Without this conversion, a geometry's numeric `724` would never equal the data's "724"
// (Map and Set compare with ===, and 724 !== "724"): the whole map would come out gray with no error.
const defaultGetFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);

/**
 * Joins the user's data with the map's regions by a common identifier.
 *
 * This is the step where the #1 cause of "my map is gray" is born: the datum says "ES" and the
 * geometry says "724". This function does NOT try to guess or fix ids (that would hide the error):
 * it joins them as they are and **reports** what did not join. Whoever shows the warning to the
 * developer (console.warn, `onJoinReport`) will do it with this result, in another layer.
 *
 * It is pure: it does not write to the console or read `process.env`. Complexity O(regions + data)
 * thanks to Map/Set; with `data.find(...)` per region it would be O(regions × data).
 */
export const joinData = <TDatum>({
  features,
  data,
  getId,
  getFeatureId = defaultGetFeatureId,
}: JoinDataOptions<TDatum>): JoinResult<TDatum> => {
  // ── STEP 1: extract the region ids. FIRST. ───────────────────────────────────────────────────
  // Until we know which ids exist in the geometry we cannot say whether a datum is "extra".
  // A Set (rather than an array) gives O(1) membership and, incidentally, absorbs repeated ids in the
  // geometry. Insertion order = feature order, so the output is deterministic.
  // Regions without an id (world-atlas has a few such territories) are skipped: there is no way to
  // join them or name them in a warning. They will be painted with `emptyFill` regardless.
  const featureIds = new Set<string>();
  for (const feature of features) {
    const id = getFeatureId(feature);
    if (id !== undefined) featureIds.add(id);
  }

  // ── STEP 2: index the data by id. SECOND, before comparing. ──────────────────────────────────
  // We turn the user's array into a Map so we can ask "is there data for this id?" without scanning
  // it every time. Duplicates are also detected here: two rows with the same id is a typical silent
  // error (one row would overwrite the other and the color would depend on order). We keep the FIRST
  // and report it, instead of letting the last one win silently.
  const dataById = new Map<string, TDatum>();
  const duplicates = new Set<string>();
  for (const datum of data) {
    const id = getId(datum);
    if (dataById.has(id)) duplicates.add(id);
    else dataById.set(id, datum);
  }

  // ── STEP 3: classify. LAST because it needs both indexes already built. ─────────────────────
  // `joined` only keeps ids that exist in the geometry: it is what rendering will query per region
  // (`joined.get(regionId)`), so it does not drag along orphan data.
  const joined = new Map<string, TDatum>();
  const unmatchedData: string[] = [];
  for (const [id, datum] of dataById) {
    if (featureIds.has(id)) joined.set(id, datum);
    else unmatchedData.push(id);
  }

  // Careful: "no data" ≠ "datum with value 0" ≠ "datum with value null". Only the first is decided here
  // (there is no row for that region). A datum with `value: null` DOES join and stays in `joined`;
  // turning it into `emptyFill` is the color scale's job (a later step).
  const featuresWithoutData = [...featureIds].filter((id) => !dataById.has(id));

  return { joined, unmatchedData, featuresWithoutData, duplicateDataIds: [...duplicates] };
};
