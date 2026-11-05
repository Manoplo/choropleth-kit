export type JoinDiagnosticsInput = {
  unmatchedData: readonly string[];
  featuresWithoutData: readonly string[];
  duplicateDataIds: readonly string[];
  /** Nº de filas de datos. Con 0 (aún cargando) no hay nada que diagnosticar. */
  dataCount: number;
};

const MAX_LISTED = 8;

const list = (ids: readonly string[]): string => {
  const shown = ids.slice(0, MAX_LISTED).map((id) => JSON.stringify(id));
  const rest = ids.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
};

type IdStyle = "numeric" | "alpha-2" | "alpha-3" | "other";

const styleOf = (id: string): IdStyle => {
  if (/^\d+$/.test(id)) return "numeric";
  if (/^[A-Za-z]{2}$/.test(id)) return "alpha-2";
  if (/^[A-Za-z]{3}$/.test(id)) return "alpha-3";
  return "other";
};

/** Devuelve el estilo común de todos los ids, o `null` si están mezclados o no son reconocibles. */
const commonStyle = (ids: readonly string[]): IdStyle | null => {
  const first = ids[0];
  if (first === undefined) return null;
  const style = styleOf(first);
  return style !== "other" && ids.every((id) => styleOf(id) === style) ? style : null;
};

const STYLE_NAMES: Record<IdStyle, string> = {
  numeric: 'ISO 3166-1 numeric (e.g. "724")',
  "alpha-2": 'ISO 3166-1 alpha-2 (e.g. "ES")',
  "alpha-3": 'ISO 3166-1 alpha-3 (e.g. "ESP")',
  other: "something else",
};

/**
 * Pista para el error n.º 1: el dato y la geometría usan sistemas de ids distintos. Solo se da
 * cuando es clara (todos los ids huérfanos con el mismo estilo y todos los de las regiones sin dato
 * con otro), porque una pista equivocada es peor que ninguna.
 */
const hintFor = (
  unmatched: readonly string[],
  featuresWithoutData: readonly string[],
): string | null => {
  // Ceros a la izquierda: "4" en los datos y "004" en la geometría (típico de Excel/CSV).
  const features = new Set(featuresWithoutData);
  const padded = unmatched.find((id) => /^\d{1,2}$/.test(id) && features.has(id.padStart(3, "0")));
  if (padded !== undefined) {
    return `Hint: ${JSON.stringify(padded)} does not match ${JSON.stringify(padded.padStart(3, "0"))}. Leading zeros matter (a spreadsheet may have dropped them).`;
  }

  // Mayúsculas/minúsculas: "es" frente a "ES".
  const upper = new Set(featuresWithoutData.map((id) => id.toUpperCase()));
  const lowered = unmatched.find((id) => id !== id.toUpperCase() && upper.has(id.toUpperCase()));
  if (lowered !== undefined) {
    return `Hint: ids are case-sensitive; ${JSON.stringify(lowered)} would match ${JSON.stringify(lowered.toUpperCase())}.`;
  }

  const dataStyle = commonStyle(unmatched);
  const geometryStyle = commonStyle(featuresWithoutData);
  if (dataStyle !== null && geometryStyle !== null && dataStyle !== geometryStyle) {
    return `Hint: your data ids look like ${STYLE_NAMES[dataStyle]} but the geometry ids look like ${STYLE_NAMES[geometryStyle]}. Convert one of them, or use \`getFeatureId\` to read another property of the geometry.`;
  }
  return null;
};

/**
 * Convierte el resultado de `joinData` en el texto del aviso para el desarrollador (dd.md §9.6),
 * o `null` si no hay nada que avisar. Pura: no escribe en consola, así se testea sin simularla.
 */
export const formatJoinDiagnostics = ({
  unmatchedData,
  featuresWithoutData,
  duplicateDataIds,
  dataCount,
}: JoinDiagnosticsInput): string | null => {
  if (dataCount === 0) return null;

  const lines: string[] = [];
  if (unmatchedData.length > 0) {
    lines.push(
      `${unmatchedData.length} datum(s) have no matching geometry: ${list(unmatchedData)}.`,
    );
    const hint = hintFor(unmatchedData, featuresWithoutData);
    if (hint !== null) lines.push(hint);
  }
  if (duplicateDataIds.length > 0) {
    lines.push(
      `${duplicateDataIds.length} id(s) appear more than once in \`data\` (only the first row of each is used): ${list(duplicateDataIds)}.`,
    );
  }
  if (featuresWithoutData.length > 0) {
    lines.push(`${featuresWithoutData.length} region(s) have no data and will use \`emptyFill\`.`);
  }

  return lines.length === 0 ? null : `[choropleth] ${lines.join("\n             ")}`;
};
