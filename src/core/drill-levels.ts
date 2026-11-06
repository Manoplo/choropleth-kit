import { classifyDrill, type DrillDirection } from "./drill";

/**
 * Piezas puras del drill-down que no dependen de React ni del DOM (dd.md §11.2.2): el contexto de una
 * ruta, las migas, la clave de caché de la geometría, la caché LRU y la validación de niveles.
 */

export type DrillContext = {
  /** Ids desde la raíz: [] = mundo, ["ES"] = España, ["ES", "ES-MD"] = Madrid. */
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

/** Lo mínimo que se necesita de un nivel para estas funciones (así se prueban sin React). */
export type LevelShape = {
  id: string;
  label?: string;
  /** Solo importa si es `"inherit"` o una función; el resto es la geometría en sí. */
  geography: unknown;
  geographyKey?: (ctx: DrillContext) => string;
};

/**
 * Comprueba la lista de niveles al definirla. Los errores explican qué tocar (principio de DX de
 * dd.md): una lista vacía, ids repetidos (el id del nivel se usa de clave) o un primer nivel que
 * «hereda» la geometría de un padre que no existe.
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
 * Recorta una ruta a la profundidad que permiten los niveles: con N niveles, el path más largo tiene
 * N − 1 ids (el último nivel no se puede perforar más). `clamped` avisa de que hubo recorte.
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
  /** `null` en la raíz. */
  id: string | null;
  label: string;
};

/**
 * Migas de la ruta: la raíz (con la etiqueta del primer nivel o `rootLabel`) y un paso por id.
 * `getLabel` pone nombre a cada paso (por defecto, el id).
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
 * Clave de caché de la geometría del nivel de `path.length` (dd.md §11.2.2): la del consumidor
 * (`geographyKey`), o `${id}:${parentId}` si la geometría depende del padre (es una función), o solo
 * el id. Con `"inherit"` la geometría es la del padre, así que la clave también (tiendas sobre un país
 * comparten la geometría del país).
 */
export const geographyKeyFor = (levels: readonly LevelShape[], path: readonly string[]): string => {
  for (let depth = Math.min(path.length, levels.length - 1); depth >= 0; depth--) {
    const level = levels[depth];
    if (level === undefined) continue;
    const ctx = contextOf(path.slice(0, depth));
    if (level.geographyKey !== undefined) return level.geographyKey(ctx);
    if (level.geography === "inherit" && depth > 0) continue; // la del padre
    return typeof level.geography === "function" ? `${level.id}:${ctx.parentId}` : level.id;
  }
  return "";
};

/**
 * `data` como lista o como selector del nivel actual. `undefined` significa «cargando» y se
 * respeta (dd.md §11.2.6): el mapa mantiene la capa anterior, sin avisos.
 */
export const resolveDrillData = <TDatum>(
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined),
  ctx: DrillContext,
): readonly TDatum[] | undefined => (typeof data === "function" ? data(ctx) : data);

/** Qué evento de drill es un cambio de ruta; `null` si no cambia. */
export const drillDirectionBetween = (
  from: readonly string[],
  to: readonly string[],
): DrillDirection | null => {
  const direction = classifyDrill(from, to);
  return direction === "equal" ? null : direction;
};

// ── caché LRU ──────────────────────────────────────────────────────────────────────────────────────

export type LruCache<V> = {
  /** Devuelve el valor y lo marca como el más reciente. */
  get: (key: string) => V | undefined;
  /** No lo marca como reciente (para comprobar sin alterar el orden). */
  has: (key: string) => boolean;
  /** Inserta; si se supera la capacidad, expulsa el menos reciente. */
  set: (key: string, value: V) => void;
  delete: (key: string) => void;
  clear: () => void;
  readonly size: number;
};

/** Caché de los niveles ya calculados (dd.md §11.2.4: 8 entradas). Subir no recalcula nada. */
export const DEFAULT_LEVEL_CACHE_SIZE = 8;

export const createLruCache = <V>(capacity: number = DEFAULT_LEVEL_CACHE_SIZE): LruCache<V> => {
  if (!(Number.isInteger(capacity) && capacity >= 1)) {
    throw new Error(
      `[choropleth] createLruCache: capacity must be an integer ≥ 1 (received: ${capacity}).`,
    );
  }
  // Un `Map` recuerda el orden de inserción: el primero es el menos reciente.
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
