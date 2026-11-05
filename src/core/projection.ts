import type { FeatureCollection } from "geojson";
import {
  geoAlbers,
  geoEqualEarth,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  type GeoProjection,
} from "d3-geo";

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
      `createProjection: width y height deben ser números finitos > 0 (recibido: ${width} × ${height}).`,
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
