import { classifyDrill, type DrillDirection } from "./drill";

/**
 * Pure drill-down pieces that depend on neither React nor the DOM (dd.md §11.2.2): a route's
 * context, the breadcrumbs, the geometry cache key, the LRU cache and level validation.
 */

export type DrillContext = {
  /** Ids from the root: [] = world, ["ES"] = Spain, ["ES", "ES-MD"] = Madrid. */
  path: readonly string[];
  /** `path.at(-1) ?? null`. */
  parentId: string | null;
  /** `path.length`. */
  depth: number;
};

export const contextOf = (path: readonly string[]): DrillContext => ({
  path,
  parentId: path.at(-1) ?? null,
  depth: path.length,
});

/** The minimum needed from a level for these functions (so they can be tested without React). */
export type LevelShape = {
  id: string;
  label?: string;
  /** Only whether it is `"inherit"` or a function matters; the rest is the geometry itself. */
  geography: unknown;
  geographyKey?: (ctx: DrillContext) => string;
};

/**
 * Validates the list of levels when it is defined. Errors explain what to change (DX principle from
 * dd.md): an empty list, repeated ids (the level id is used as a key) or a first level that
 * "inherits" geometry from a parent that does not exist.
 */
export const validateLevels = (levels: readonly LevelShape[]): void => {
  if (levels.length === 0) {
    throw new Error(
      "[choropleth] drill: at least one level is required (received an empty array).",
    );
  }
  const seen = new Set<string>();
  for (const level of levels) {
    if (seen.has(level.id)) {
      throw new Error(
        `[choropleth] drill: duplicate level id "${level.id}". Each level needs a unique id.`,
      );
    }
    seen.add(level.id);
  }
  if (levels[0]?.geography === "inherit") {
    throw new Error(
      `[choropleth] drill: the first level ("${levels[0].id}") cannot use geography: "inherit" because it has no parent. Pass its geometry.`,
    );
  }
};

/**
 * Trims a route to the depth the levels allow: with N levels, the longest path has N − 1 ids (the
 * last level cannot be drilled into any further). `clamped` signals that trimming happened.
 */
export const clampPath = (
  path: readonly string[],
  levelCount: number,
): { path: readonly string[]; clamped: boolean } => {
  const max = Math.max(0, levelCount - 1);
  return path.length <= max
    ? { path, clamped: false }
    : { path: path.slice(0, max), clamped: true };
};

export type DrillCrumb = {
  depth: number;
  /** `null` at the root. */
  id: string | null;
  label: string;
};

/**
 * Breadcrumbs of the route: the root (with the first level's label or `rootLabel`) and one step per id.
 * `getLabel` names each step (the id by default).
 */
export const buildBreadcrumbs = ({
  path,
  rootLabel,
  getLabel,
}: {
  path: readonly string[];
  rootLabel: string;
  getLabel?: (args: { id: string; depth: number }) => string;
}): DrillCrumb[] => [
  { depth: 0, id: null, label: rootLabel },
  ...path.map((id, index) => ({
    depth: index + 1,
    id,
    label: getLabel?.({ id, depth: index + 1 }) ?? id,
  })),
];

/**
 * Cache key of the geometry of the level at `path.length` (dd.md §11.2.2): the consumer's
 * (`geographyKey`), or `${id}:${parentId}` if the geometry depends on the parent (it is a function),
 * or just the id. With `"inherit"` the geometry is the parent's, so the key is too (stores over a
 * country share the country's geometry).
 */
export const geographyKeyFor = (levels: readonly LevelShape[], path: readonly string[]): string => {
  for (let depth = Math.min(path.length, levels.length - 1); depth >= 0; depth--) {
    const level = levels[depth];
    if (level === undefined) continue;
    const ctx = contextOf(path.slice(0, depth));
    if (level.geographyKey !== undefined) return level.geographyKey(ctx);
    if (level.geography === "inherit" && depth > 0) continue; // the parent's
    return typeof level.geography === "function" ? `${level.id}:${ctx.parentId}` : level.id;
  }
  return "";
};

/**
 * `data` as a list or as a selector for the current level. `undefined` means "loading" and is
 * respected (dd.md §11.2.6): the map keeps the previous layer, with no warnings.
 */
export const resolveDrillData = <TDatum>(
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined),
  ctx: DrillContext,
): readonly TDatum[] | undefined => (typeof data === "function" ? data(ctx) : data);

/** Which drill event is a route change; `null` if it does not change. */
export const drillDirectionBetween = (
  from: readonly string[],
  to: readonly string[],
): DrillDirection | null => {
  const direction = classifyDrill(from, to);
  return direction === "equal" ? null : direction;
};

// ── LRU cache ───────────────────────────────────────────────────────────────────────────────────

export type LruCache<V> = {
  /** Returns the value and marks it as the most recent. */
  get: (key: string) => V | undefined;
  /** Does not mark it as recent (to check without altering the order). */
  has: (key: string) => boolean;
  /** Inserts; if capacity is exceeded, evicts the least recent. */
  set: (key: string, value: V) => void;
  delete: (key: string) => void;
  clear: () => void;
  readonly size: number;
};

/** Cache of the levels already computed (dd.md §11.2.4: 8 entries). Going up recomputes nothing. */
export const DEFAULT_LEVEL_CACHE_SIZE = 8;

export const createLruCache = <V>(capacity: number = DEFAULT_LEVEL_CACHE_SIZE): LruCache<V> => {
  if (!(Number.isInteger(capacity) && capacity >= 1)) {
    throw new Error(
      `[choropleth] createLruCache: capacity must be an integer ≥ 1 (received: ${capacity}).`,
    );
  }
  // A `Map` remembers insertion order: the first is the least recent.
  const entries = new Map<string, V>();
  return {
    get: (key) => {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    has: (key) => entries.has(key),
    set: (key, value) => {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
    },
    delete: (key) => void entries.delete(key),
    clear: () => entries.clear(),
    get size() {
      return entries.size;
    },
  };
};
