import type { CameraOptions, TransitionResult, ViewState, ZoomTarget } from "../core";
import { isProduction } from "./env";
import type { MapStore } from "./map-store";

/**
 * El handle imperativo (dd.md §9.5): lo que se obtiene con `ref` en `<ChoroplethMap>` / `<Choropleth.Root>`
 * y con `useChoroplethApi()` dentro del compound. **Todo lo animado devuelve una `Promise`** que
 * resuelve al terminar, o al ser interrumpido (`completed: false`); así se pueden encadenar vuelos
 * sin temporizadores: `await map.zoomTo("ES"); await map.zoomTo("FR");`.
 *
 * `drillDown`, `drillUp` y `drillTo` (paso 34) navegan por los niveles del `drill`; resuelven al volver a reposo
 * en la ruta pedida. (`toSVGString` y `toPNG` de dd.md §9.5 llegan con la exportación.)
 */
export type ChoroplethMapHandle = {
  /** Vuela a una región (id), unos límites `{ bounds }` o un centro con zoom `{ center, zoom }`. */
  zoomTo: (target: ZoomTarget, options?: CameraOptions) => Promise<TransitionResult>;
  /** Multiplica el zoom actual (2 = acercar al doble, 0,5 = alejar a la mitad), centrado en la vista. */
  zoomBy: (factor: number, options?: Pick<CameraOptions, "duration">) => Promise<TransitionResult>;
  /** Vuelo al encaje del nivel. */
  resetView: (options?: Pick<CameraOptions, "duration">) => Promise<TransitionResult>;
  /** La vista actual (también a mitad de un vuelo). */
  getView: () => ViewState;
  /**
   * Baja al hijo `id` de lo que se está pidiendo (no de lo mostrado: encadenar `await` es seguro).
   * Resuelve `completed: true` al terminar la coreografía en esa ruta; `false` si algo la cortó (un gesto,
   * otra navegación, un error de carga) o si la petición no era válida (id inexistente, `canDrill: false`,
   * mapa sin `drill`): en esos casos, además, avisa por consola fuera de producción.
   */
  drillDown: (id: string) => Promise<TransitionResult>;
  /** Sube `steps` niveles (1 por defecto; de más = a la raíz). En la raíz resuelve `completed: true` sin hacer nada. */
  drillUp: (steps?: number) => Promise<TransitionResult>;
  /** Va a una ruta cualquiera (lateral, salto, la URL): `["ES", "ES-MD"]`; `[]` = la raíz. */
  drillTo: (path: readonly string[]) => Promise<TransitionResult>;
};

/** Solo antes de que el mapa se haya renderizado por primera vez. */
const EMPTY_VIEW: ViewState = {
  k: 1,
  x: 0,
  y: 0,
  zoom: 1,
  center: [0, 0],
  bounds: [
    [-180, -90],
    [180, 90],
  ],
  level: { id: "root", depth: 0 },
};

const NOT_AVAILABLE: Promise<TransitionResult> = Promise.resolve({ completed: false });

const noDrill = (method: string): Promise<TransitionResult> => {
  if (!isProduction()) {
    console.warn(`[choropleth] ${method}() needs the \`drill\` prop; this map has none.`);
  }
  return NOT_AVAILABLE;
};

/**
 * Handle sobre el store. Se puede crear una sola vez: busca la API de zoom en cada llamada, porque
 * `use-zoom` la registra y la des-registra al instalarse y desinstalarse. Sin zoom (`zoom={false}`)
 * o antes de que el mapa esté listo, los movimientos resuelven `completed: false` en vez de lanzar, y
 * `getView` devuelve el encaje.
 */
export const createHandle = (store: MapStore): ChoroplethMapHandle => ({
  zoomTo: (target, options) => store.getZoom()?.zoomTo(target, options) ?? NOT_AVAILABLE,
  zoomBy: (factor, options) => store.getZoom()?.zoomBy(factor, options) ?? NOT_AVAILABLE,
  resetView: (options) => store.getZoom()?.resetView(options) ?? NOT_AVAILABLE,
  getView: () => store.getZoom()?.getView() ?? store.getFallbackView() ?? EMPTY_VIEW,
  drillDown: (id) => store.getDrill()?.drillDown(id) ?? noDrill("drillDown"),
  drillUp: (steps) => store.getDrill()?.drillUp(steps) ?? noDrill("drillUp"),
  drillTo: (path) => store.getDrill()?.drillTo(path) ?? noDrill("drillTo"),
});
