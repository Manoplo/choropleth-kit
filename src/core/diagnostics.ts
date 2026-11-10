export type JoinDiagnosticsInput = {
  unmatchedData: readonly string[];
  featuresWithoutData: readonly string[];
  duplicateDataIds: readonly string[];
  /** Number of data rows. With 0 (still loading) there is nothing to diagnose. */
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

/** Returns the style common to all ids, or `null` if they are mixed or not recognizable. */
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
 * Hint for error #1: the data and the geometry use different id systems. It is only given when it
 * is clear (all orphan ids with the same style and all those of regions without data with another),
 * because a wrong hint is worse than none.
 */
const hintFor = (
  unmatched: readonly string[],
  featuresWithoutData: readonly string[],
): string | null => {
  // Leading zeros: "4" in the data and "004" in the geometry (typical of Excel/CSV).
  const features = new Set(featuresWithoutData);
  const padded = unmatched.find((id) => /^\d{1,2}$/.test(id) && features.has(id.padStart(3, "0")));
  if (padded !== undefined) {
    return `Hint: ${JSON.stringify(padded)} does not match ${JSON.stringify(padded.padStart(3, "0"))}. Leading zeros matter (a spreadsheet may have dropped them).`;
  }

  // Upper/lower case: "es" versus "ES".
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
 * Turns the result of `joinData` into the warning text for the developer, or `null` if
 * there is nothing to warn about. Pure: it does not write to the console, so it is tested without mocking it.
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
