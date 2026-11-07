/**
 * Pure pieces of the drill's closing (step 34): the "intent" to go down (sustained hover) and the
 * development warnings for navigation requests. No React or DOM: timers are injected.
 */

/** How long the pointer must stay over a drillable region to count as intent (dd.md §12.1). */
export const DRILL_INTENT_MS = 150;

export type IntentTimer = {
  /**
   * What the pointer is over now. A different `key` restarts the wait; the same one does not extend
   * it; `null` cancels it. When it elapses, `onIntent(key)` is called ONCE per dwell.
   */
  hover: (key: string | null) => void;
  /** Cancels any pending wait (on unmount). */
  dispose: () => void;
};

export type IntentTimerOptions = {
  onIntent: (key: string) => void;
  delay?: number;
  /** Injectable for tests; the globals by default. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Intent timer. "Once per dwell": leaving and re-entering the same region (via another one or via
 * `null`) counts as a new dwell.
 */
export const createIntentTimer = ({
  onIntent,
  delay = DRILL_INTENT_MS,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: IntentTimerOptions): IntentTimer => {
  let current: string | null = null;
  let handle: unknown;
  let armed = false;
  const cancel = () => {
    if (armed) clearTimer(handle);
    armed = false;
  };
  return {
    hover: (key) => {
      if (key === current) return;
      cancel();
      current = key;
      if (key === null) return;
      armed = true;
      handle = setTimer(() => {
        armed = false;
        onIntent(key);
      }, delay);
    },
    dispose: () => {
      cancel();
      current = null;
    },
  };
};

// ── development warnings ──────────────────────────────────────────────────────────────────────────

export type DrillRequestProblem =
  /** The id does not exist at the level being drilled from. */
  | { kind: "unknown-id"; id: string; depth: number; levelId: string }
  /** The level has `canDrill` set to `false` for that region. */
  | { kind: "cannot-drill"; id: string; depth: number; levelId: string };

/**
 * Is it valid to go down to `id` from a level whose regions are `knownIds`? Returns the problem or
 * `null`. `knownIds` is `undefined` if that level is not loaded yet: it cannot be judged and is let
 * through. `drillable` is `undefined` if `canDrill` cannot be evaluated (no item with its datum).
 */
export const checkDrillStep = ({
  id,
  depth,
  levelId,
  knownIds,
  drillable,
}: {
  id: string;
  depth: number;
  levelId: string;
  knownIds: ReadonlySet<string> | undefined;
  drillable: boolean | undefined;
}): DrillRequestProblem | null => {
  if (knownIds !== undefined && !knownIds.has(id)) {
    return { kind: "unknown-id", id, depth, levelId };
  }
  if (drillable === false) return { kind: "cannot-drill", id, depth, levelId };
  return null;
};

/** Warning text (in English, for the developer). `source` says who requested the navigation. */
export const formatDrillRequestProblem = (problem: DrillRequestProblem, source: string): string => {
  const where = `level "${problem.levelId}" (depth ${problem.depth})`;
  return problem.kind === "unknown-id"
    ? `[choropleth] ${source}: region ${JSON.stringify(problem.id)} does not exist in ${where}. Hint: ids come from \`getFeatureId\` / \`feature.id\`; navigation was ignored.`
    : `[choropleth] ${source}: region ${JSON.stringify(problem.id)} cannot be drilled into: \`canDrill\` is false for it in ${where}; navigation was ignored.`;
};

/** Requesting a route deeper than the defined levels: ignored (the last level cannot be drilled into). */
export const formatTooDeepRequest = (
  path: readonly string[],
  levelCount: number,
  source: string,
): string =>
  `[choropleth] ${source}: cannot go to ${JSON.stringify(path)}: only ${levelCount} level(s) are defined (max depth ${Math.max(0, levelCount - 1)}); navigation was ignored.`;

/**
 * Warning that NO region of the level has an id (so no datum can join): almost always a
 * `getFeatureId` that reads a property that does not exist. `null` if there is nothing to warn about.
 */
export const formatNoIdsDiagnostic = ({
  featureCount,
  idCount,
  levelId,
  customGetFeatureId,
}: {
  featureCount: number;
  idCount: number;
  levelId: string | null;
  customGetFeatureId: boolean;
}): string | null => {
  if (featureCount === 0 || idCount > 0) return null;
  const level = levelId === null ? "" : ` in level "${levelId}"`;
  const hint = customGetFeatureId
    ? "`getFeatureId` returned `undefined` for every one; check the property it reads."
    : "none has a `feature.id`; pass `getFeatureId` to read another property.";
  return `[choropleth] none of the ${featureCount} region(s)${level} has an id, so no data can match: ${hint}`;
};

/**
 * Extra hint for the join when there is a `drill` and NO datum joins with the displayed geometry: the
 * usual cause is passing a fixed list from another level. `null` if it does not apply.
 */
export const formatWrongLevelDataHint = ({
  drillActive,
  dataIsSelector,
  dataCount,
  unmatchedCount,
  levelId,
}: {
  drillActive: boolean;
  dataIsSelector: boolean;
  dataCount: number;
  unmatchedCount: number;
  levelId: string | null;
}): string | null => {
  if (!drillActive || dataIsSelector || dataCount === 0 || unmatchedCount < dataCount) return null;
  const level = levelId === null ? "this level" : `level "${levelId}"`;
  return `Hint: with \`drill\`, a fixed \`data\` array is used for every level and none of its rows match ${level}. Pass \`data\` as a selector to give each level its own rows: \`data={(ctx) => rowsFor(ctx)}\`.`;
};
