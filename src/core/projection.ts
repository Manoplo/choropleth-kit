import type { FeatureCollection } from "geojson";
import {
  geoAlbers,
  geoPath,
  geoEqualEarth,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import type { Padding } from "./bounds";
import type { CameraTransform } from "./camera";

// El registro guarda FUNCIONES que crean una proyección, no proyecciones ya creadas.
// Por qué: una proyección d3 es un objeto MUTABLE (escala, centro, traslación) y `fitSize`
// la modifica. Si el registro guardara una instancia compartida, dos mapas en la misma página
// (o un mapa que cambia de tamaño) se pisarían entre sí la escala y se verían desplazados.
// Con una fábrica, cada llamada a `createProjection` recibe su propia instancia limpia.
const PROJECTIONS = {
  // Áreas iguales: cada país ocupa el área que le corresponde. Es la recomendada para mundo.
  equalEarth: geoEqualEarth,
  // De compromiso, agradable a la vista; deforma algo las áreas.
  naturalEarth: geoNaturalEarth1,
  // Infla las zonas polares (Groenlandia ≈ África). Útil para mapas de calle, no para coropletas
  // del mundo: el ojo asocia más área pintada con más importancia.
  mercator: geoMercator,
  // Cónica para EE. UU. (con Alaska y Hawái recolocados). Sobre el mundo entero se ve mal.
  albers: geoAlbers,
  // Vista de globo: solo se ve un hemisferio.
  orthographic: geoOrthographic,
} as const satisfies Record<string, () => GeoProjection>;

export type ProjectionName = keyof typeof PROJECTIONS;

export const DEFAULT_PROJECTION: ProjectionName = "equalEarth";

export type CreateProjectionOptions = {
  /** Proyección por nombre. Por defecto `equalEarth`. */
  name?: ProjectionName;
  /** Tamaño del contenedor en píxeles. */
  width: number;
  height: number;
  /** Geometría que debe caber entera en `width × height`. */
  featureCollection: FeatureCollection;
};

/**
 * Crea una proyección d3 ya ajustada (`fitSize`) para que la geometría quepa justa en el contenedor.
 *
 * Sin el ajuste, una proyección d3 usa una escala fija pensada para 960×500: en un contenedor
 * distinto el mapa saldría cortado o diminuto. `fitSize` calcula escala y traslación por nosotros
 * (no hay que hacer cuentas de zoom ni de centro a mano).
 */
export const createProjection = ({
  name = DEFAULT_PROJECTION,
  width,
  height,
  featureCollection,
}: CreateProjectionOptions): GeoProjection => {
  // ── PASO 1: validar el tamaño. Antes de crear nada. ───────────────────────────────────────────
  // Con ancho o alto 0 (un contenedor oculto o aún sin medir), `fitSize` no falla: devuelve una
  // escala 0 o NaN, y cada `path` sale como "MNaN,NaN…". El síntoma sería un mapa invisible sin
  // ningún error en consola. Aquí se corta con un mensaje; la capa React deberá evitar llegar
  // con tamaño 0 (tarea del hook de tamaño del contenedor).
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error(
      `[choropleth] createProjection: width and height must be finite numbers > 0 (received: ${width} × ${height}).`,
    );
  }

  // ── PASO 2: instancia nueva. Antes del ajuste, porque el ajuste la modifica. ──────────────────
  const projection = PROJECTIONS[name]();

  // ── PASO 3: ajustar al contenedor. Va ÚLTIMO: necesita el tamaño validado y la instancia. ─────
  // Sin features no hay nada que encajar: `fitSize` calcularía con un área vacía (infinitos).
  // Se devuelve la proyección con su escala por defecto, que es válida y simplemente no pinta nada.
  if (featureCollection.features.length === 0) return projection;

  return projection.fitSize([width, height], featureCollection);
};

/** Proporción de la que se parte si la geometría no se puede medir (el mundo en Equal Earth). */
export const DEFAULT_ASPECT_RATIO = 960 / 500;

const MIN_ASPECT_RATIO = 0.2;
const MAX_ASPECT_RATIO = 5;

/**
 * ancho / alto que ocupa la geometría con esa proyección (`aspectRatio: "auto"`).
 *
 * Chile es muy alto y Noruega muy ancha: con una proporción fija sobraría o faltaría espacio. Se
 * ajusta la proyección a un ancho de referencia y se mide el rectángulo resultante; la proporción
 * no depende del ancho elegido. Se limita a [0,2 – 5] para que un dato raro (una sola isla)
 * no deje un contenedor de 1 px de alto.
 */
export const computeAspectRatio = ({
  name = DEFAULT_PROJECTION,
  featureCollection,
}: {
  name?: ProjectionName;
  featureCollection: FeatureCollection;
}): number => {
  if (featureCollection.features.length === 0) return DEFAULT_ASPECT_RATIO;
  const projection = PROJECTIONS[name]().fitWidth(1000, featureCollection);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(featureCollection);
  const ratio = (x1 - x0) / (y1 - y0);
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT_RATIO;
  return Math.min(MAX_ASPECT_RATIO, Math.max(MIN_ASPECT_RATIO, ratio));
};

// ── rebase (drill-down, dd.md §11.2.4) ─────────────────────────────────────────────────────────────

/**
 * La afín `R` tal que `to(p) === R(from(p))` para todo `p`, donde `R(q) = k·q + (x, y)`.
 *
 * Solo es cierta si `from` y `to` comparten TODO salvo `scale` y `translate` (misma proyección,
 * rotación, centro…). Entonces cambiar de una a otra es una transformación afín de los píxeles, y por
 * tanto se puede expresar como una cámara (`CameraTransform`): `R` es a la vez «lo que hay que mover
 * la cámara del padre» y «lo que separa los píxeles del padre de los del hijo».
 */
export const relativeTransform = (from: GeoProjection, to: GeoProjection): CameraTransform => {
  const k = to.scale() / from.scale();
  const [fx, fy] = from.translate();
  const [tx, ty] = to.translate();
  return { k, x: tx - k * fx, y: ty - k * fy };
};

export type RebaseParams = {
  /** La proyección del nivel padre (no se modifica). */
  parent: GeoProjection;
  /** Crea una proyección nueva del MISMO tipo que `parent` (las proyecciones d3 son mutables). */
  factory: () => GeoProjection;
  /** La geometría que debe llenar la vista: el cuerpo principal de la región (`getFocusGeometry`). */
  focus: GeoPermissibleObjects;
  width: number;
  height: number;
  padding: Padding;
};

export type RebaseResult = {
  /** La proyección del hijo, ajustada a `focus`. A `k = 1` la precisión es completa. */
  projection: GeoProjection;
  /** `projection(p) === relative(parent(p))`: el destino exacto del vuelo y la capa de contexto. */
  relative: CameraTransform;
};

/**
 * Proyección del nivel hijo con continuidad perfecta (dd.md §11.2.4).
 *
 * Dos soluciones ingenuas fallan: una sola proyección con `k` enorme (a `k ≈ 300` los 3 decimales de
 * `geoPath` dan dientes de sierra) y un `fitSize` nuevo por nivel (el hijo aparece a otra escala y
 * posición: salto visible). Aquí el hijo es la proyección del padre con **la misma rotación, centro y
 * demás parámetros** y solo `scale`/`translate` reajustados (`fitExtent`). Eso es una afín de la salida,
 * así que si el vuelo termina exactamente en `relative`, pasar a la proyección hija con cámara
 * identidad pinta los **mismos píxeles**.
 */
export const rebaseProjection = ({
  parent,
  factory,
  focus,
  width,
  height,
  padding,
}: RebaseParams): RebaseResult => {
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0)) {
    throw new Error(
      `[choropleth] rebaseProjection: width and height must be finite numbers > 0 (received: ${width} × ${height}).`,
    );
  }
  const child = copyShape(factory(), parent);
  child.fitExtent(
    [
      [padding.left, padding.top],
      [width - padding.right, height - padding.bottom],
    ],
    focus,
  );
  // Un foco vacío o de un solo punto no tiene tamaño: `fitExtent` da escala 0, Infinity o NaN.
  if (!(child.scale() > 0) || !Number.isFinite(child.scale())) {
    throw new Error(
      "[choropleth] rebaseProjection: the focus geometry has no extent (empty or a single point), so it cannot be fitted.",
    );
  }
  return { projection: child, relative: relativeTransform(parent, child) };
};

/**
 * Copia en `child` todo lo que no sea `scale`/`translate` (que lo fija `fitExtent`). Si faltara
 * algo (p. ej. las paralelas de una cónica) el hijo ya no sería una afín del padre.
 */
const copyShape = (child: GeoProjection, parent: GeoProjection): GeoProjection => {
  child.rotate(parent.rotate()).center(parent.center());
  child.angle(parent.angle()).reflectX(parent.reflectX()).reflectY(parent.reflectY());
  child.precision(parent.precision());
  const clipAngle = parent.clipAngle();
  if (clipAngle !== null) child.clipAngle(clipAngle);
  const conic = parent as GeoProjection & { parallels?: () => [number, number] };
  const target = child as GeoProjection & { parallels?: (p: [number, number]) => unknown };
  if (conic.parallels !== undefined && target.parallels !== undefined) {
    target.parallels(conic.parallels());
  }
  return child;
};
