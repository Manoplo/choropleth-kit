import { interpolateZoom } from "d3-interpolate";
import type { Point } from "./variants";

/**
 * La cámara (dd.md §11.0): un `transform` afín `{ k, x, y }` sobre el lienzo ya proyectado.
 * Un punto del lienzo `[px, py]` se ve en pantalla en `[px·k + x, py·k + y]`. `k = 1` es el encaje
 * del nivel (el mapa cabe justo en el contenedor).
 *
 * Todo este archivo es matemática pura, sin DOM ni d3-zoom: se testea sin navegador. Lo que escribe
 * el transform en el DOM (`use-zoom.ts`) llega en el paso siguiente.
 */
export type CameraTransform = { k: number; x: number; y: number };

/** La cámara en el encaje del nivel. */
export const FIT_TRANSFORM: CameraTransform = { k: 1, x: 0, y: 0 };

/** ¿La cámara está (casi) en el encaje? Sirve para deshabilitar «restablecer vista». */
export const isFitTransform = (t: CameraTransform, epsilon = 1e-3): boolean =>
  Math.abs(t.k - 1) < epsilon && Math.abs(t.x) < epsilon && Math.abs(t.y) < epsilon;

export type Size = { width: number; height: number };

/** Rectángulo [[x0, y0], [x1, y1]]. */
export type Extent = readonly [Point, Point];

/** Lienzo → pantalla. */
export const applyTransform = ({ k, x, y }: CameraTransform, [px, py]: Point): Point => [
  px * k + x,
  py * k + y,
];

/** Pantalla → lienzo. */
export const invertTransform = ({ k, x, y }: CameraTransform, [sx, sy]: Point): Point => [
  (sx - x) / k,
  (sy - y) / k,
];

// ── límites (`constrain`) ──────────────────────────────────────────────────────────────────────────

export type ConstrainAxisParams = {
  /** Traslación actual en este eje. */
  t: number;
  k: number;
  /** Extremos del contenido en el lienzo (antes de escalar). */
  c0: number;
  c1: number;
  /** Extremos de la vista en pantalla. */
  v0: number;
  v1: number;
  /** Holgura elástica como fracción del tamaño de la vista. Por defecto 0 (límite duro). */
  overscroll?: number;
};

/**
 * Traslación permitida en UN eje (dd.md §11.1.4). El `constrain` por defecto de d3 deja un mapa más
 * pequeño que la vista pegado a una esquina; este lo **centra** si cabe y, si no cabe, impide que
 * sus bordes entren en la vista (más una holgura elástica opcional).
 */
export const constrainAxis = ({
  t,
  k,
  c0,
  c1,
  v0,
  v1,
  overscroll = 0,
}: ConstrainAxisParams): number => {
  const size = (c1 - c0) * k;
  const view = v1 - v0;
  if (size <= view) return v0 + (view - size) / 2 - c0 * k; // cabe: centrado
  const slack = view * overscroll;
  const min = v1 - c1 * k - slack; // el borde derecho del contenido no entra en la vista
  const max = v0 - c0 * k + slack; // ni el izquierdo
  return Math.min(max, Math.max(min, t));
};

export type ConstrainTransformParams = {
  transform: CameraTransform;
  /** El lienzo: normalmente [[0, 0], [width, height]]. */
  content: Extent;
  /** La vista: normalmente [[0, 0], [width, height]]. */
  view: Extent;
  overscroll?: number;
};

/** `constrainAxis` en los dos ejes. La escala `k` no se toca. */
export const constrainTransform = ({
  transform,
  content,
  view,
  overscroll,
}: ConstrainTransformParams): CameraTransform => ({
  k: transform.k,
  x: constrainAxis({
    t: transform.x,
    k: transform.k,
    c0: content[0][0],
    c1: content[1][0],
    v0: view[0][0],
    v1: view[1][0],
    overscroll,
  }),
  y: constrainAxis({
    t: transform.y,
    k: transform.k,
    c0: content[0][1],
    c1: content[1][1],
    v0: view[0][1],
    v1: view[1][1],
    overscroll,
  }),
});

// ── cambio de tamaño sin salto ─────────────────────────────────────────────────────────────────────

export type PreserveViewParams = {
  transform: CameraTransform;
  oldSize: Size;
  newSize: Size;
  /** Píxeles del lienzo ANTIGUO → [lon, lat] (`oldProjection.invert`). */
  invertOld: (point: Point) => Point | null;
  /** [lon, lat] → píxeles del lienzo NUEVO (`newProjection`). */
  projectNew: (coordinates: Point) => Point | null;
};

/**
 * Cámara equivalente tras redimensionar (dd.md §11.1.3, punto 2). Al cambiar el tamaño, la
 * proyección se reajusta y los píxeles cambian: sin esto, la vista «volvería al encaje». Se conserva
 * el **centro geográfico** y la `k`: se mira qué [lon, lat] había en el centro de la vista y se
 * coloca en el centro de la vista nueva.
 *
 * Si el centro cae fuera de la proyección (océano más allá del globo) no hay centro geográfico que
 * conservar: se devuelve el encaje.
 */
export const preserveView = ({
  transform,
  oldSize,
  newSize,
  invertOld,
  projectNew,
}: PreserveViewParams): CameraTransform => {
  const center = invertOld(invertTransform(transform, [oldSize.width / 2, oldSize.height / 2]));
  const projected = center === null ? null : projectNew(center);
  if (projected === null) return FIT_TRANSFORM;
  return {
    k: transform.k,
    x: newSize.width / 2 - transform.k * projected[0],
    y: newSize.height / 2 - transform.k * projected[1],
  };
};

// ── vuelos ─────────────────────────────────────────────────────────────────────────────────────────

/** Duración mínima y máxima de un vuelo, en ms (dd.md §11.1.5). */
export const MIN_FLIGHT_MS = 350;
export const MAX_FLIGHT_MS = 1200;

/** Curvatura (ρ) por defecto para dashboards: menos «salto» que √2 (dd.md §11.1.5: 1,2–1,3). */
export const DEFAULT_FLIGHT_CURVATURE = 1.25;

/**
 * La cámara como «vista» de `interpolateZoom` (van Wijk y Nuij): [centro x, centro y, ancho visible],
 * los tres en coordenadas del lienzo.
 */
export const transformToZoomView = (
  { k, x, y }: CameraTransform,
  { width, height }: Size,
): [number, number, number] => [(width / 2 - x) / k, (height / 2 - y) / k, width / k];

// OJO: en runtime `rho` es un método de la FUNCIÓN `interpolateZoom` (devuelve otra función con esa
// curvatura), pero `@types/d3-interpolate` lo declara en el interpolador ya creado, y ahí no existe
// (es `undefined`). Se tipa lo que hace de verdad; hay un test que lo comprueba.
export const createZoomInterpolator = (rho: number): typeof interpolateZoom =>
  (interpolateZoom as unknown as { rho: (rho: number) => typeof interpolateZoom }).rho(rho);

export type FlightDurationParams = {
  from: CameraTransform;
  to: CameraTransform;
  size: Size;
  /** Multiplicador de velocidad (> 1 = más lento). Por defecto 1. */
  speed?: number;
  curvature?: number;
};

/**
 * Duración de un vuelo entre dos cámaras: la «natural» de `interpolateZoom` (depende de la
 * distancia y del cambio de escala) × `speed`, acotada a [350, 1200] ms. Vuelos cortos, rápidos;
 * largos, legibles.
 */
export const flightDuration = ({
  from,
  to,
  size,
  speed = 1,
  curvature = DEFAULT_FLIGHT_CURVATURE,
}: FlightDurationParams): number => {
  const natural = createZoomInterpolator(curvature)(
    transformToZoomView(from, size),
    transformToZoomView(to, size),
  ).duration;
  const scaled = natural * speed;
  if (!Number.isFinite(scaled)) return MIN_FLIGHT_MS;
  return Math.min(MAX_FLIGHT_MS, Math.max(MIN_FLIGHT_MS, scaled));
};

// ── inercia ────────────────────────────────────────────────────────────────────────────────────────

/** Constante de tiempo de la inercia, en ms: la de iOS (dd.md §11.1.4). */
export const INERTIA_TAU_MS = 325;

export type InertiaOffsetParams = {
  /** Velocidad al soltar en este eje, px/ms. */
  velocity: number;
  /** ms desde que se soltó. */
  elapsed: number;
  tau?: number;
};

/**
 * Desplazamiento acumulado (px) `elapsed` ms después de soltar, con decaimiento exponencial:
 * `v·τ·(1 − e^(−t/τ))`. Tiende a `v·τ` y nunca lo supera; con `elapsed` negativo o `NaN` no se mueve.
 */
export const inertiaOffset = ({
  velocity,
  elapsed,
  tau = INERTIA_TAU_MS,
}: InertiaOffsetParams): number => {
  if (!(elapsed > 0) || !Number.isFinite(velocity)) return 0;
  return velocity * tau * (1 - Math.exp(-elapsed / tau));
};

// ── estado público de la vista ─────────────────────────────────────────────────────────────────────

/** Nivel del drill-down (dd.md §11.2). Igual que `DrillLevelInfo` de `react/map-item.ts`. */
export type ViewLevel = { id: string; depth: number };

/** Lo que recibe `onViewChange` (dd.md §11.1.7). */
export type ViewState = {
  /** Transform de cámara, en píxeles del nivel. */
  k: number;
  x: number;
  y: number;
  /** = `k` (1 = encaje del nivel): alias legible. */
  zoom: number;
  /** [lon, lat] del centro de la vista. */
  center: Point;
  /** [[lonO, latS], [lonE, latN]] visibles. Aproximado: no contempla el antimeridiano. */
  bounds: readonly [Point, Point];
  level: ViewLevel;
};

export type ToViewStateParams = {
  transform: CameraTransform;
  size: Size;
  /** Píxeles del lienzo → [lon, lat] (`projection.invert`); `null` si cae fuera del globo. */
  invert: (point: Point) => Point | null;
  level?: ViewLevel;
};

const WORLD_BOUNDS: readonly [Point, Point] = [
  [-180, -90],
  [180, 90],
];

/** Puntos por lado con los que se muestrea la vista para estimar los límites geográficos. */
const BOUNDS_SAMPLES = 5;

/**
 * Convierte la cámara en un `ViewState` con coordenadas geográficas. Las esquinas de la vista a
 * menudo caen fuera del globo (un mapa del mundo en Equal Earth no es un rectángulo), así que los
 * límites se estiman muestreando una rejilla de la vista y quedándose con los puntos que sí
 * proyectan. Si ninguno lo hace, devuelve el mundo entero y el centro `[0, 0]`.
 */
export const toViewState = ({
  transform,
  size,
  invert,
  level = { id: "root", depth: 0 },
}: ToViewStateParams): ViewState => {
  const toCoordinates = (screen: Point): Point | null => {
    const at = invert(invertTransform(transform, screen));
    return at !== null && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? at : null;
  };

  const samples: Point[] = [];
  for (let i = 0; i < BOUNDS_SAMPLES; i += 1) {
    for (let j = 0; j < BOUNDS_SAMPLES; j += 1) {
      const at = toCoordinates([
        (size.width * i) / (BOUNDS_SAMPLES - 1),
        (size.height * j) / (BOUNDS_SAMPLES - 1),
      ]);
      if (at !== null) samples.push(at);
    }
  }

  const lons = samples.map(([lon]) => lon);
  const lats = samples.map(([, lat]) => lat);
  const bounds: readonly [Point, Point] =
    samples.length === 0
      ? WORLD_BOUNDS
      : [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ];
  const center = toCoordinates([size.width / 2, size.height / 2]) ?? [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];

  return {
    k: transform.k,
    x: transform.x,
    y: transform.y,
    zoom: transform.k,
    center,
    bounds,
    level,
  };
};
