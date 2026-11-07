/**
 * Piezas puras del cierre del drill (paso 34): la «intención» de bajar (hover sostenido) y los avisos de
 * desarrollo de las peticiones de navegación. Sin React ni DOM: los temporizadores se inyectan.
 */

/** Cuánto hay que permanecer sobre una región navegable para que cuente como intención (dd.md §12.1). */
export const DRILL_INTENT_MS = 150;

export type IntentTimer = {
  /**
   * Sobre qué está el puntero ahora. Un `key` distinto reinicia la espera; el mismo no la prolonga;
   * `null` la cancela. Al cumplirse, `onIntent(key)` se llama UNA vez por permanencia.
   */
  hover: (key: string | null) => void;
  /** Cancela cualquier espera pendiente (al desmontar). */
  dispose: () => void;
};

export type IntentTimerOptions = {
  onIntent: (key: string) => void;
  delay?: number;
  /** Inyectables para los tests; por defecto, los globales. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * Temporizador de intención. «Una vez por permanencia»: salir y volver a entrar en la misma región
 * (pasando por otra o por `null`) cuenta como una permanencia nueva.
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

// ── avisos de desarrollo ──────────────────────────────────────────────────────────────────────────

export type DrillRequestProblem =
  /** El id no existe en el nivel desde el que se baja. */
  | { kind: "unknown-id"; id: string; depth: number; levelId: string }
  /** El nivel tiene `canDrill` en `false` para esa región. */
  | { kind: "cannot-drill"; id: string; depth: number; levelId: string };

/**
 * ¿Es válido bajar a `id` desde un nivel cuyas regiones son `knownIds`? Devuelve el problema o `null`.
 * `knownIds` es `undefined` si ese nivel aún no está cargado: no se puede juzgar y se deja pasar.
 * `drillable` es `undefined` si no se puede evaluar `canDrill` (no hay item con su dato).
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

/** Texto del aviso (en inglés, para el desarrollador). `source` dice quién pidió la navegación. */
export const formatDrillRequestProblem = (problem: DrillRequestProblem, source: string): string => {
  const where = `level "${problem.levelId}" (depth ${problem.depth})`;
  return problem.kind === "unknown-id"
    ? `[choropleth] ${source}: region ${JSON.stringify(problem.id)} does not exist in ${where}. Hint: ids come from \`getFeatureId\` / \`feature.id\`; navigation was ignored.`
    : `[choropleth] ${source}: region ${JSON.stringify(problem.id)} cannot be drilled into: \`canDrill\` is false for it in ${where}; navigation was ignored.`;
};

/** Pedir una ruta más profunda que los niveles definidos: se ignora (el último nivel no se puede perforar). */
export const formatTooDeepRequest = (
  path: readonly string[],
  levelCount: number,
  source: string,
): string =>
  `[choropleth] ${source}: cannot go to ${JSON.stringify(path)}: only ${levelCount} level(s) are defined (max depth ${Math.max(0, levelCount - 1)}); navigation was ignored.`;

/**
 * Aviso de que NINGUNA región del nivel tiene id (así que ningún dato puede cruzar): casi siempre es un
 * `getFeatureId` que lee una propiedad que no existe. `null` si no hay nada que avisar.
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
 * Pista extra del cruce cuando hay `drill` y NINGÚN dato cruza con la geometría mostrada: lo normal es
 * pasar una lista fija de otro nivel. `null` si no procede.
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
