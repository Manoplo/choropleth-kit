import type { Feature } from "geojson";

export type JoinDataOptions<TDatum> = {
  features: readonly Feature[];
  data: readonly TDatum[];
  /** Id de cada dato del usuario (p. ej. `(d) => d.countryCode`). */
  getId: (datum: TDatum) => string;
  /**
   * Id de cada región si no es `feature.id` (p. ej. `(f) => f.properties?.iso_a2`).
   * Devolver `undefined` significa "esta región no tiene id": no se puede cruzar y se ignora.
   */
  getFeatureId?: (feature: Feature) => string | undefined;
};

export type JoinResult<TDatum> = {
  /** id de región → dato. Solo contiene cruces que SÍ ocurrieron. */
  joined: Map<string, TDatum>;
  /** ids de datos que no corresponden a ninguna región (p. ej. "ES" cuando la geometría usa "724"). */
  unmatchedData: string[];
  /** ids de regiones que se quedaron sin dato (se pintarán con `emptyFill`). */
  featuresWithoutData: string[];
  /** ids repetidos en `data`: solo se conserva el primero de cada uno. */
  duplicateDataIds: string[];
};

// GeoJSON permite que `feature.id` sea string O number, pero nuestros ids de datos son string.
// Sin esta conversión, el `724` numérico de una geometría nunca igualaría al "724" de los datos
// (Map y Set comparan con ===, y 724 !== "724"): todo el mapa saldría gris sin ningún error.
const defaultGetFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);

/**
 * Cruza los datos del usuario con las regiones del mapa por un identificador común.
 *
 * Es el paso donde nace la causa n.º 1 de "mi mapa sale gris": el dato dice "ES" y la geometría
 * dice "724". Esta función NO intenta adivinar ni corregir ids (eso sería esconder el error):
 * los cruza tal cual y **informa** de lo que no ha cruzado. Quien muestre el aviso al desarrollador
 * (console.warn, `onJoinReport`) lo hará con este resultado, en otra capa.
 *
 * Es pura: no escribe en consola ni lee `process.env`. Complejidad O(regiones + datos) gracias
 * a Map/Set; con `data.find(...)` por región sería O(regiones × datos).
 */
export const joinData = <TDatum>({
  features,
  data,
  getId,
  getFeatureId = defaultGetFeatureId,
}: JoinDataOptions<TDatum>): JoinResult<TDatum> => {
  // ── PASO 1: sacar los ids de las regiones. Va PRIMERO. ────────────────────────────────────────
  // Hasta que no sabemos qué ids existen en la geometría no se puede decir si un dato "sobra".
  // Un Set (en vez de array) da pertenencia en O(1) y, de paso, absorbe ids repetidos en la
  // geometría. Orden de inserción = orden de las features, así que la salida es determinista.
  // Las regiones sin id (world-atlas tiene algunos territorios así) se saltan: no hay forma de
  // cruzarlas ni de nombrarlas en un aviso. Se pintarán con `emptyFill` igualmente.
  const featureIds = new Set<string>();
  for (const feature of features) {
    const id = getFeatureId(feature);
    if (id !== undefined) featureIds.add(id);
  }

  // ── PASO 2: indexar los datos por id. Va SEGUNDO, antes de comparar. ──────────────────────────
  // Convertimos el array del usuario en un Map para poder preguntar "¿hay dato para este id?" sin
  // recorrerlo cada vez. Aquí también se detectan duplicados: dos filas con el mismo id es un
  // error silencioso típico (una fila pisaría a la otra y el color dependería del orden). Nos
  // quedamos con la PRIMERA y lo reportamos, en vez de dejar que la última gane sin avisar.
  const dataById = new Map<string, TDatum>();
  const duplicates = new Set<string>();
  for (const datum of data) {
    const id = getId(datum);
    if (dataById.has(id)) duplicates.add(id);
    else dataById.set(id, datum);
  }

  // ── PASO 3: clasificar. Va ÚLTIMO porque necesita los dos índices ya construidos. ─────────────
  // `joined` solo guarda ids que existen en la geometría: es lo que el render consultará por región
  // (`joined.get(regionId)`), así que no arrastra datos huérfanos.
  const joined = new Map<string, TDatum>();
  const unmatchedData: string[] = [];
  for (const [id, datum] of dataById) {
    if (featureIds.has(id)) joined.set(id, datum);
    else unmatchedData.push(id);
  }

  // Ojo: "sin dato" ≠ "dato con valor 0" ≠ "dato con valor null". Aquí solo se decide lo primero
  // (no hay fila para esa región). Un dato con `value: null` SÍ cruza y se queda en `joined`;
  // convertirlo en `emptyFill` es trabajo de la escala de color (paso posterior).
  const featuresWithoutData = [...featureIds].filter((id) => !dataById.has(id));

  return { joined, unmatchedData, featuresWithoutData, duplicateDataIds: [...duplicates] };
};
