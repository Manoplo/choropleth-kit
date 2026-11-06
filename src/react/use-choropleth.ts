import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import { geoPath } from "d3-geo";
import {
  buildProjectionChain,
  computeAspectRatio,
  constrainTransform,
  contextOf,
  createBorders,
  createProjection,
  DEFAULT_EMPTY_FILL,
  DEFAULT_FOCUS_BOUNDS,
  defaultFormatValue,
  formatJoinDiagnostics,
  getAnchorPoint,
  getFocusExtent,
  getFocusGeometry,
  joinData,
  resolveDrillData,
  resolveLabels,
  resolveVariant,
  resolveZoomOptions,
  resolveZoomTarget,
  toFeatureCollection,
  type Bubble,
  type ChoroplethLabels,
  type CameraTransform,
  type ColorScale,
  type DrillContext,
  type GeographyData,
  type GeographyInput,
  type JoinResult,
  type LegendItem,
  type LonLatBounds,
  type Padding,
  type Point,
  type ProjectionName,
  type ResolvedZoom,
  type SizeLegendItem,
  type VariantConfig,
  type ZoomOptions,
  type ZoomTarget,
} from "../core";
import { isDrillable, type DrillEvent, type DrillLevel } from "./drill-levels";
import {
  isSameItem,
  ROOT_LEVEL,
  type DrillLevelInfo,
  type ItemContext,
  type ItemRef,
  type MapItem,
} from "./map-item";
import { isProduction } from "./env";
import { createMapStore, type MapStore } from "./map-store";
import { useContainerSize } from "./use-container-size";
import { useDrillEngine } from "./use-drill-engine";
import type { DrillController } from "./use-drill-down";
import { useGeography, type GeographyStatus } from "./use-geography";

/** Una región lista para pintar. */
export type Region<TDatum> = {
  id: string;
  feature: Feature;
  /** `undefined` = región sin dato. */
  datum: TDatum | undefined;
  /** Atributo `d` del `<path>`. */
  path: string;
  fill: string;
  /** Valor del dato: número, categoría (`categorical`) o `null` si no hay dato. */
  value: number | string | null;
  /** `value` listo para mostrar («1,5 %», «Europa»); cadena vacía si no hay valor. */
  formattedValue: string;
  /** Hay un nivel por debajo y `canDrill` lo permite (siempre `false` sin `drill`). */
  drillable: boolean;
};

export type JoinReport = Omit<JoinResult<unknown>, "joined">;

/** Qué se atenúa cuando hay selección o hover (dd.md §12.1). */
export type DimOthers = "never" | "selection" | "hover-and-selection";

type BaseOptions<TDatum> = {
  /**
   * TopoJSON o GeoJSON, una promesa, o `() => import("…")`. Un dato ya cargado debe tener una
   * referencia estable (constante de módulo o `useMemo`).
   */
  geography?: GeographyInput;
  /** Clave de caché para una geometría asíncrona (si no, se usa la identidad de la función). */
  geographyKey?: string;
  objectName?: string;
  /** Descarta regiones antes de todo (p. ej. la Antártida: `(f) => f.id !== "010"`). */
  filterFeatures?: (feature: Feature) => boolean;
  /**
   * `undefined` = cargando (se mantiene lo anterior, sin avisos); `[]` = cargado y vacío. Con `drill`
   * puede ser un selector del nivel actual: `({ depth, parentId }) => rows.filter(…)`.
   */
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined);
  /**
   * Drill-down (dd.md §11.2): la lista de niveles (no controlado) o un `useDrillDown` (controlado).
   * Con `drill`, la geometría sale de los niveles y `geography` se ignora.
   */
  drill?: readonly DrillLevel<TDatum>[] | DrillController<TDatum>;
  /** Al EMPEZAR un cambio de nivel (la ruta ya está actualizada). */
  onDrill?: (event: DrillEvent<TDatum>) => void;
  /** Al terminar de mostrar el nivel nuevo. */
  onDrillEnd?: (event: DrillEvent<TDatum>) => void;
  /** Si falla la geometría de un nivel (o tiene 0 regiones): se vuelve al nivel anterior. */
  onDrillError?: (event: { error: unknown; ctx: DrillContext }) => void;
  /** Fuerza el estado de carga de los datos (pulso) aunque `data` esté definido. */
  loading?: boolean;
  getId: (datum: TDatum) => string;
  /** Id de la región si no es `feature.id` (p. ej. `(f) => f.properties?.iso_a2`). */
  getFeatureId?: (feature: Feature) => string | undefined;
  projection?: ProjectionName;
  /**
   * ancho / alto del mapa. `"auto"` lo deriva de los límites de la geometría (Chile sale alto,
   * Noruega ancho). Por defecto 960 / 500, la proporción del mundo.
   */
  aspectRatio?: number | "auto";
  emptyFill?: string;
  formatValue?: (value: number) => string;
  /** Si se pasa, la leyenda incluye un item "sin dato" con este texto. */
  emptyLabel?: string;
  /** Textos de UI (i18n). Inglés por defecto; `es` está exportado. */
  labels?: Partial<ChoroplethLabels>;
  /**
   * Microestados que no existen en la geometría (Andorra, Mónaco…): `{ AD: [1.52, 42.51] }`. Un
   * dato cuyo id no cruza con ninguna región pero sí está aquí se pinta como un punto, con el
   * color del dato. En `bubble`, como una burbuja.
   */
  fallbackPoints?: Readonly<Record<string, Point>>;
  /** Tamaño fijo. Si faltan, se mide el contenedor (`containerRef`). */
  width?: number;
  height?: number;
  // ── selección (solo regiones) ───────────────────────────────────────────────────────────────
  /** Controlada: tú mandas. `null` = nada seleccionado. Sin esto, el estado lo lleva la librería. */
  selectedId?: string | null;
  /** No controlada: selección inicial. */
  defaultSelectedId?: string | null;
  /** Se llama al cambiar la selección (clic en una región; clic en la seleccionada = `null`). */
  onSelectedIdChange?: (id: string | null) => void;
  /** Atenúa el resto del mapa. Por defecto `"selection"`. */
  dimOthers?: DimOthers;
  /** Clic en una región o en un punto (`item.kind`). */
  onItemClick?: (item: MapItem<TDatum>) => void;
  /** Hover (o primer toque, en táctil). `null` al salir. Solo se llama cuando cambia el item. */
  onItemHover?: (item: MapItem<TDatum> | null) => void;
  /** Se llama cada vez que cambia el resultado del cruce datos↔regiones (también en producción). */
  onJoinReport?: (report: JoinReport) => void;
  /**
   * Vuela a esta región (id) cuando cambia; con `null` vuelve al encaje. En el **primer render** no
   * vuela: coloca la cámara directamente. Es la forma declarativa de `zoomTo` (dd.md §11.1.5).
   */
  focusId?: string | null;
  /**
   * Encuadres explícitos por región, en [[lonO, latS], [lonE, latN]]. Se fusionan con los de la
   * librería (`DEFAULT_FOCUS_BOUNDS`: España **con Canarias**). `{ ES: null }` vuelve al encuadre
   * geométrico (cuerpo principal) para esa región.
   */
  focusBounds?: Readonly<Record<string, LonLatBounds | null>>;
  /**
   * Zoom y pan (dd.md §11.1). Activo por defecto; `false` = mapa estático. La rueda hace zoom con el
   * ratón encima (`wheel: "always"`); para mapas dentro de una página larga usa `wheel: "cooperative"`.
   */
  zoom?: boolean | ZoomOptions;
  /** Se llama si falla la carga asíncrona de la geometría. Sin esto, se avisa por consola. */
  onGeographyError?: (error: Error) => void;
  /** Aviso en consola de ids sin cruzar. Solo fuera de producción. Por defecto `true`. */
  diagnostics?: boolean;
};

/** Opciones comunes + las de cada `variant` (unión discriminada, ver `core/variants.ts`). */
export type UseChoroplethOptions<TDatum> = BaseOptions<TDatum> & VariantConfig<TDatum>;

/** Props listas para esparcir en el `<path>` de una región (`<path {...getRegionProps(r)} />`). */
export type RegionProps = {
  "data-region-id": string;
  "data-selected": true | undefined;
  onClick: MouseEventHandler;
  onPointerEnter: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
};

/** Props para el `<circle>` de una burbuja con coordenadas propias (un punto). */
export type PointProps = {
  "data-point-id": string;
  onClick: MouseEventHandler;
  onPointerEnter: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
};

/** Un microestado pintado como punto (`fallbackPoints`) fuera de `bubble`. */
export type FallbackPoint<TDatum> = {
  id: string;
  x: number;
  y: number;
  r: number;
  fill: string;
  datum: TDatum;
  value: number | string | null;
  formattedValue: string;
  coordinates: Point;
};

/** Radio en píxeles de un punto de respaldo. */
export const FALLBACK_POINT_RADIUS = 4;

export type UseChoroplethResult<TDatum> = {
  /** Pon esta ref en el contenedor para que el mapa se adapte a su ancho. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  /** `loading` mientras llega la geometría asíncrona; `error` si falló. */
  status: GeographyStatus;
  /** `true` mientras `data` es `undefined` (o `loading`): se mantiene el último dato. */
  dataLoading: boolean;
  regions: Region<TDatum>[];
  /** `d` de las regiones SIN id: se pintan en `emptyFill`, sin interacción (Kosovo en world-atlas). */
  anonymousPaths: string[];
  /** Color de «sin dato» ya resuelto (`emptyFill` o la variable CSS). */
  emptyFill: string;
  /** Microestados pintados como punto (vacío en `bubble`: ahí son burbujas). */
  fallbackPoints: FallbackPoint<TDatum>[];
  labels: ChoroplethLabels;
  /** Opciones de zoom ya resueltas; `null` si `zoom={false}`. */
  zoom: ResolvedZoom | null;
  /** `onViewChange` del usuario (no forma parte de `zoom`: no debe reinstalar el comportamiento). */
  onViewChange: ZoomOptions["onViewChange"];
  /** Píxeles del lienzo → [lon, lat] (`projection.invert`); `null` si cae fuera del globo. */
  invert: (point: Point) => Point | null;
  /** [lon, lat] → píxeles del lienzo; `null` si no proyecta. */
  project: (coordinates: Point) => Point | null;
  /** `focusId` tal cual, para que `useZoom` lo aplique (volar o colocar la cámara). */
  focusId: string | null | undefined;
  /**
   * `ZoomTarget` → cámara (ya limitada por `constrain`), o `null` si no se puede resolver (región
   * inexistente). Es lo que usan `zoomTo`, `focusId` e `initialView`.
   */
  resolveCamera: (
    target: ZoomTarget,
    options?: { padding?: number | Padding },
  ) => CameraTransform | null;
  /** Fronteras interiores (`d` de un `<path>`). `null` con GeoJSON: usa `stroke` en cada región. */
  borders: string | null;
  /** Leyenda de color (swatches con conteos). Vacía en `bubble` sin `getColorValue`. */
  legend: LegendItem[];
  /** Círculos de referencia del tamaño (solo `bubble`). */
  sizeLegend: SizeLegendItem[];
  /** Burbujas ya posicionadas, de mayor a menor (solo `bubble`). */
  bubbles: Bubble<TDatum>[];
  /** Escala numérica de color. `null` en `categorical` y en `bubble` sin `getColorValue`. */
  scale: ColorScale | null;
  joinReport: JoinReport;
  /** Formateador efectivo (el del usuario o el de por defecto), para tooltip y leyenda. */
  formatValue: (value: number) => string;
  /** `true` si hay `onItemClick`: los componentes ponen cursor `pointer`. */
  clickable: boolean;
  /**
   * Estado de interacción (hover, puntero) fuera de React. Léelo con `useMapStore(store, s => s.hoveredId)`:
   * así cambiar de región no re-renderiza el componente que llama a `useChoropleth`.
   */
  store: MapStore;
  selectedId: string | null;
  /** Selecciona una región (`null` la quita). Respeta el modo controlado: solo avisa. */
  setSelectedId: (id: string | null) => void;
  /** Hover de un item (o `null`). Actualiza el store y llama a `onItemHover` solo si cambia. */
  hoverItem: (ref: ItemRef | null) => void;
  /** Clic en un item: llama a `onItemClick`. */
  clickItem: (ref: ItemRef) => void;
  /** El item completo (con valor, color y nombre) para el tooltip; `undefined` si ya no existe. */
  getItemContext: (ref: ItemRef) => ItemContext<TDatum> | undefined;
  getRegionProps: (region: Region<TDatum>) => RegionProps;
  getPointProps: (point: { id: string }) => PointProps;
};

/**
 * Nivel 3 (headless) y motor de los otros dos: `<Choropleth.Root>` y `<ChoroplethMap>` lo llaman
 * y reparten su resultado. Devuelve datos, no elementos: tú decides cómo pintarlos.
 *
 * Qué se memoiza y por qué: solo lo caro y lo que debe tener identidad estable.
 *  - Geometría (`features`, `borders`): depende solo de `geography` (y del filtro, por su RESULTADO).
 *  - Rutas SVG: dependen de geometría, proyección y tamaño. NO de los datos, así que cambiar de
 *    indicador o de `variant` no recalcula ni una ruta (criterio de aceptación de dd.md §20).
 * El join y la escala son O(regiones) y se recalculan en cada render: memoizarlos exigiría que el
 * consumidor estabilizara `getId`/`getValue`/`classification`, y casi nadie lo hace.
 */
export const useChoropleth = <TDatum>(
  rawOptions: UseChoroplethOptions<TDatum>,
): UseChoroplethResult<TDatum> => {
  // ── drill-down: el nivel que se muestra manda sobre las opciones del mapa ──────────────────────
  // Para el resto del hook, un mapa con `drill` es un mapa de UN nivel con otras opciones.
  const engine = useDrillEngine<TDatum>({
    drill: rawOptions.drill,
    data: rawOptions.data,
    filterFeatures: rawOptions.filterFeatures,
    onDrill: rawOptions.onDrill,
    onDrillEnd: rawOptions.onDrillEnd,
    onDrillError: rawOptions.onDrillError,
  });
  const encoding = engine.level?.encoding;
  const options = (
    engine.active
      ? {
          ...rawOptions,
          ...encoding,
          getId: encoding?.getId ?? rawOptions.getId,
          data: engine.data,
          getFeatureId: engine.getFeatureId ?? rawOptions.getFeatureId,
        }
      : { ...rawOptions, data: resolveDrillData(rawOptions.data, contextOf([])) }
  ) as UseChoroplethOptions<TDatum> & { data: readonly TDatum[] | undefined };

  const { getId, getFeatureId, projection, fallbackPoints } = options;
  const isBubble = options.variant === "bubble";
  const labels = resolveLabels(options.labels);

  // ── geometría (depende solo de `geography`) ───────────────────────────────────────────────────
  // Con `drill` la geometría la carga el motor (por nivel, con caché); aquí se le pasa una vacía.
  const single = useGeography(
    engine.active ? NO_GEOGRAPHY : (options.geography ?? NO_GEOGRAPHY),
    options.geographyKey,
    options.onGeographyError,
  );
  if (!engine.active && options.geography === undefined) {
    throw new Error(
      "[choropleth] Missing `geography`: pass `geography` (TopoJSON/GeoJSON) or `drill` (a list of levels).",
    );
  }
  const geography: GeographyData | undefined = engine.active ? engine.geography : single.geography;
  const status: GeographyStatus = engine.active ? engine.status : single.status;
  const objectName = engine.active ? engine.objectName : options.objectName;
  const filterFeatures = engine.active ? engine.filterFeatures : options.filterFeatures;
  const allFeatures = useMemo(
    () =>
      engine.active
        ? (engine.features ?? EMPTY_FEATURES)
        : geography === undefined
          ? EMPTY_FEATURES
          : toFeatureCollection({ geography, objectName }),
    // `engine.features` ya viene filtrado y es estable (cachés del motor).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [engine.active, engine.features, geography, objectName],
  );

  // El filtro se aplica a CADA render (es O(regiones)) pero se memoiza por su RESULTADO: un
  // `filterFeatures` en línea cambia de identidad en cada render, y si fuera la dependencia
  // recalcularía todas las rutas. Los índices que sobreviven sí son un valor estable.
  const keptIndexes =
    filterFeatures === undefined
      ? null
      : allFeatures.features.flatMap((f, index) => (filterFeatures(f) ? [index] : []));
  const keptKey = keptIndexes === null ? "" : keptIndexes.join(",");
  const features = useMemo<FeatureCollection>(
    () =>
      keptIndexes === null
        ? allFeatures
        : {
            ...allFeatures,
            features: keptIndexes.flatMap((index) => {
              const feature = allFeatures.features[index];
              return feature === undefined ? [] : [feature];
            }),
          },
    // `keptIndexes` está resumido en `keptKey` (ver arriba).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [allFeatures, keptKey],
  );
  const bordersGeometry = useMemo<MultiLineString | null>(
    () =>
      geography === undefined ? null : createBorders({ geography, objectName, filterFeatures }),
    // `filterFeatures` queda resumido en `keptKey`: su identidad no debe relanzar el cálculo.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [geography, objectName, keptKey],
  );

  // ── tamaño ────────────────────────────────────────────────────────────────────────────────────
  const autoAspect = useMemo(
    () =>
      options.aspectRatio === "auto"
        ? computeAspectRatio({
            name: projection,
            // Con drill la proporción es la de la raíz: no debe cambiar al bajar de nivel.
            featureCollection: (engine.active ? engine.rootFeatures : undefined) ?? features,
          })
        : undefined,
    [options.aspectRatio, projection, features, engine.active, engine.rootFeatures],
  );
  const measured = useContainerSize({
    aspectRatio: options.aspectRatio === "auto" ? autoAspect : options.aspectRatio,
  });
  const width = options.width ?? measured.width;
  const height = options.height ?? measured.height;

  // ── cadena de proyecciones del drill (rebase, dd.md §11.2.4) ───────────────────────────────────
  // La raíz se ajusta al mundo y cada nivel es la del padre reajustada al cuerpo principal de la región
  // elegida: así el hijo se pinta a k = 1 con precisión completa y el vuelo termina en el mismo píxel.
  const rebasePadding = typeof options.zoom === "object" ? (options.zoom.padding ?? 24) : 24;
  const drillFocusBounds = engine.levels.reduce<Record<string, LonLatBounds | null | undefined>>(
    (all, level) => ({ ...all, ...level.focusBounds }),
    { ...DEFAULT_FOCUS_BOUNDS, ...options.focusBounds },
  );
  const focusKey = JSON.stringify(drillFocusBounds);
  const chain = useMemo(
    () =>
      engine.active && engine.chain.length > 0 && width > 0 && height > 0
        ? buildProjectionChain({
            levels: engine.chain,
            path: engine.shownPath,
            name: projection,
            width,
            height,
            padding: rebasePadding,
            focusBounds: drillFocusBounds,
          })
        : null,
    // `chainSig` resume el contenido de `engine.chain`; `focusKey`, el de `drillFocusBounds`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [engine.active, engine.chainSig, projection, width, height, rebasePadding, focusKey],
  );
  const chainMissing = chain?.missing ?? null;
  useEffect(() => {
    if (chainMissing !== null && !isProduction()) {
      console.warn(
        `[choropleth] drill: could not frame region "${chainMissing}" (it is not in its parent level, or it has no extent). The map keeps the parent's framing.`,
      );
    }
  }, [chainMissing]);

  // ── rutas (geometría + proyección + tamaño; nada de datos) ────────────────────────────────────
  const { paths, bordersPath, anchors, project, invert, toPath } = useMemo(() => {
    const geoProjection =
      chain?.projections[chain.projections.length - 1] ??
      createProjection({
        name: projection,
        width,
        height,
        featureCollection: features,
      });
    const toPath = geoPath(geoProjection);
    // d3 devuelve [NaN, NaN] (no null) para lo que no sabe proyectar: se normaliza aquí, una vez.
    const toPoint = (coordinates: Point): Point | null => {
      const at = geoProjection([...coordinates]);
      return at !== null && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? at : null;
    };
    return {
      paths: features.features.map((f) => toPath(f)),
      bordersPath: bordersGeometry === null ? null : toPath(bordersGeometry),
      // Las anclas solo se calculan para `bubble` (es lo único que las usa). El centroide de
      // `geoPath` cuenta los territorios lejanos (la burbuja de Francia caería en el Atlántico):
      // se ancla en el polo de inaccesibilidad del cuerpo principal. El centroide queda de respaldo.
      anchors: isBubble
        ? features.features.map((f): Point | null => {
            const anchor = getAnchorPoint({
              geometry: getFocusGeometry({ feature: f, path: toPath }),
              project: toPoint,
            });
            if (anchor !== null) return anchor;
            const [x, y] = toPath.centroid(f);
            return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
          })
        : [],
      project: toPoint,
      toPath,
      // Lo contrario: píxeles → [lon, lat]. Lo usa `toViewState` para el `ViewState` público.
      invert: (point: Point): Point | null => {
        const at = geoProjection.invert?.([point[0], point[1]]);
        return at != null && Number.isFinite(at[0]) && Number.isFinite(at[1])
          ? [at[0], at[1]]
          : null;
      },
    };
  }, [features, bordersGeometry, projection, width, height, isBubble, chain]);

  // ── datos → color ─────────────────────────────────────────────────────────────────────────────
  // `data: undefined` = cargando. Se conserva el último dato definido para no vaciar el mapa (ni
  // avisar por consola) mientras llega el siguiente. Una ref (y no estado) porque `data` suele
  // llegar con identidad nueva en cada render: guardarlo en estado provocaría un render por cada
  // uno. Escribir siempre «el último definido» es idempotente, así que es seguro en el render.
  const lastData = useRef<readonly TDatum[] | undefined>(options.data);
  if (options.data !== undefined) lastData.current = options.data;
  const data: readonly TDatum[] = options.data ?? lastData.current ?? NO_DATA;
  const dataLoading = options.loading ?? options.data === undefined;

  const idOf = getFeatureId ?? defaultFeatureId;
  const join = joinData({ features: features.features, data, getId, getFeatureId: idOf });

  // Microestados: datos sin región cuyo id tiene un punto de respaldo.
  const fallbacks: { id: string; datum: TDatum; coordinates: Point; at: Point }[] = [];
  if (fallbackPoints !== undefined && join.unmatchedData.length > 0) {
    const wanted = new Set(join.unmatchedData.filter((id) => fallbackPoints[id] !== undefined));
    const seen = new Set<string>();
    for (const datum of data) {
      const id = getId(datum);
      const coordinates = fallbackPoints[id];
      const at = coordinates === undefined ? null : project(coordinates);
      if (wanted.has(id) && !seen.has(id) && coordinates !== undefined && at !== null) {
        seen.add(id);
        fallbacks.push({ id, datum, coordinates, at });
      }
    }
  }
  const fallbackIds = new Set(fallbacks.map((f) => f.id));

  // Burbujas con sus propias coordenadas (tiendas): los datos NO tienen por qué corresponder a una
  // región, así que «sin cruzar» no es un error y no debe avisar.
  const hasOwnCoordinates = options.variant === "bubble" && options.getCoordinates !== undefined;
  const joinReport: JoinReport = {
    unmatchedData: hasOwnCoordinates ? [] : join.unmatchedData.filter((id) => !fallbackIds.has(id)),
    featuresWithoutData: hasOwnCoordinates ? [] : join.featuresWithoutData,
    duplicateDataIds: join.duplicateDataIds,
  };

  // Un valor por REGIÓN (no por fila de `data`): los datos huérfanos no deben influir en la escala,
  // y la leyenda cuenta regiones. Los microestados se añaden DESPUÉS de las regiones, para que los
  // índices de las regiones no cambien.
  const entries = features.features.map((feature) => {
    const id = idOf(feature);
    return { id, datum: id === undefined ? undefined : join.joined.get(id) };
  });
  const allEntries = [...entries, ...fallbacks.map(({ id, datum }) => ({ id, datum }))];

  const formatValue = options.formatValue ?? defaultFormatValue;
  const emptyFill = options.emptyFill ?? EMPTY_FILL_VAR;
  const variant = resolveVariant<TDatum>({
    config: options,
    entries: allEntries,
    data,
    getId,
    centroids: [...anchors, ...fallbacks.map((f) => f.at)],
    project,
    emptyFill,
    formatValue,
    emptyLabel: options.emptyLabel,
  });

  const levelInfo: DrillLevelInfo = engine.active
    ? { id: engine.level?.id ?? ROOT_LEVEL.id, depth: engine.depth }
    : ROOT_LEVEL;
  const regions: Region<TDatum>[] = [];
  const anonymousPaths: string[] = [];
  features.features.forEach((feature, index) => {
    const path = paths[index];
    const entry = entries[index];
    // Sin ruta (geometría vacía): no hay nada que pintar.
    if (path == null) return;
    // Sin id no se puede seleccionar ni cruzar, pero SÍ debe verse: si no, quedan agujeros en el
    // mapa (Kosovo, Chipre del Norte y Somalilandia en world-atlas). Capa no interactiva.
    if (entry?.id === undefined) {
      anonymousPaths.push(path);
      return;
    }
    const datum = entry.datum;
    regions.push({
      id: entry.id,
      feature,
      datum,
      path,
      value: variant.values[index] ?? null,
      formattedValue: variant.labels[index] ?? "",
      fill: variant.fills[index] ?? "",
      drillable:
        engine.active &&
        isDrillable(engine.levels, engine.depth, {
          kind: "region",
          id: entry.id,
          feature,
          datum,
          level: levelInfo,
          drillable: true,
        }),
    });
  });

  // Los microestados son burbujas en `bubble` (con sus coordenadas) y puntos sueltos en el resto.
  const fallbackCoordinates = new Map(fallbacks.map((f) => [f.id, f.coordinates]));
  const bubbles = isBubble
    ? variant.bubbles.map((bubble) => {
        const coordinates = fallbackCoordinates.get(bubble.id);
        return bubble.coordinates === null && coordinates !== undefined
          ? { ...bubble, coordinates }
          : bubble;
      })
    : variant.bubbles;
  const fallbackMarks: FallbackPoint<TDatum>[] = isBubble
    ? []
    : fallbacks.map((f, index) => {
        const at = features.features.length + index;
        return {
          id: f.id,
          x: f.at[0],
          y: f.at[1],
          r: FALLBACK_POINT_RADIUS,
          fill: variant.fills[at] ?? emptyFill,
          datum: f.datum,
          value: variant.values[at] ?? null,
          formattedValue: variant.labels[at] ?? "",
          coordinates: f.coordinates,
        };
      });

  // ── diagnóstico ───────────────────────────────────────────────────────────────────────────────
  // Es un efecto de verdad (escribe en la consola y llama a un callback externo), así que no puede
  // ir en el render: React puede renderizar varias veces y el hover renderiza en cada movimiento.
  // La clave hace que solo se ejecute cuando cambia el RESULTADO del cruce, no en cada render.
  const reportKey = [
    data.length,
    joinReport.unmatchedData.join("\u0001"),
    joinReport.featuresWithoutData.join("\u0001"),
    joinReport.duplicateDataIds.join("\u0001"),
  ].join("\u0000");
  const { onJoinReport, diagnostics = true } = options;
  useEffect(() => {
    // Sin geometría (cargando) o sin datos todavía, el cruce no significa nada.
    if (status !== "ready") return;
    onJoinReport?.(joinReport);
    if (!diagnostics || isProduction()) return;
    const message = formatJoinDiagnostics({ ...joinReport, dataCount: data.length });
    if (message !== null) console.warn(message);
    // Solo `reportKey`: el contenido de `joinReport` ya está resumido en ella, y volver a ejecutar
    // por la identidad de `onJoinReport` (casi siempre una función inline) avisaría en cada render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, status]);

  // ── selección (solo regiones) ─────────────────────────────────────────────────────────────────
  // Controlada si se pasa `selectedId` (aunque sea `null`); si no, la lleva la librería. Sin
  // ninguna de las tres props la selección no está activa: un clic no selecciona ni cambia el cursor.
  const { onSelectedIdChange } = options;
  const controlled = options.selectedId !== undefined;
  const selectable =
    controlled || options.defaultSelectedId !== undefined || onSelectedIdChange !== undefined;
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    options.defaultSelectedId ?? null,
  );
  const selectedId = controlled ? (options.selectedId ?? null) : internalSelectedId;
  // Una selección es de UN nivel: al cambiar de nivel se limpia (ajuste de estado durante el render).
  const [selectionLevel, setSelectionLevel] = useState(engine.shownKey);
  if (selectionLevel !== engine.shownKey) {
    setSelectionLevel(engine.shownKey);
    if (!controlled && internalSelectedId !== null) setInternalSelectedId(null);
  }

  const setSelectedId = (id: string | null) => {
    if (!controlled) setInternalSelectedId(id);
    onSelectedIdChange?.(id);
  };

  // ── interacción ───────────────────────────────────────────────────────────────────────────────
  const [store] = useState(createMapStore);
  const { onItemClick, onItemHover } = options;

  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const featuresById = new Map<string, Feature>();
  features.features.forEach((feature) => {
    const id = idOf(feature);
    if (id !== undefined) featuresById.set(id, feature);
  });
  const bubblesById = new Map(bubbles.filter((b) => b.coordinates !== null).map((b) => [b.id, b]));
  const fallbackMarksById = new Map(fallbackMarks.map((f) => [f.id, f]));

  const getItemContext = (ref: ItemRef): ItemContext<TDatum> | undefined => {
    if (ref.kind === "region") {
      const region = regionsById.get(ref.id);
      if (region === undefined) return undefined;
      return {
        kind: "region",
        id: region.id,
        feature: region.feature,
        datum: region.datum,
        level: levelInfo,
        drillable: region.drillable,
        value: region.value,
        formattedValue: region.formattedValue,
        color: region.fill,
        label: nameOf(region.feature) ?? region.id,
      };
    }
    const bubble = bubblesById.get(ref.id);
    const mark = bubble === undefined ? fallbackMarksById.get(ref.id) : undefined;
    const coordinates = bubble?.coordinates ?? mark?.coordinates;
    const source = bubble ?? mark;
    if (source === undefined || coordinates == null) return undefined;
    const feature = featuresById.get(source.id);
    const value = bubble === undefined ? (mark?.value ?? null) : bubble.value;
    return {
      kind: "point",
      id: source.id,
      coordinates,
      feature,
      datum: source.datum,
      level: levelInfo,
      drillable: false,
      value,
      formattedValue:
        bubble === undefined ? (mark?.formattedValue ?? "") : formatValue(bubble.value),
      color: bubble === undefined ? (mark?.fill ?? emptyFill) : bubble.fill,
      label: (feature === undefined ? undefined : nameOf(feature)) ?? source.id,
    };
  };

  const hoverItem = (ref: ItemRef | null) => {
    // Sin cambio no hay nada que contar: ni el store ni el consumidor se enteran.
    if (isSameItem(store.getState().hovered, ref)) return;
    store.setState({ hovered: ref });
    onItemHover?.(ref === null ? null : (getItemContext(ref) ?? null));
  };

  const clickItem = (ref: ItemRef) => {
    const item = getItemContext(ref);
    if (item === undefined) return;
    if (ref.kind === "region" && item.drillable && engine.controller !== null) {
      // Con `drill`, un item navegable BAJA (no se selecciona); uno que no lo es, selecciona. La ruta
      // se arma sobre lo que se está MOSTRANDO: si el nivel nuevo aún carga, un segundo clic redirige.
      engine.noteItem(item);
      engine.controller.drillTo([...engine.shownPath, ref.id]);
    } else if (ref.kind === "region" && selectable) {
      // Clic en la seleccionada la deselecciona. Los puntos no se seleccionan (su id puede coincidir
      // con el de una región).
      setSelectedId(ref.id === selectedId ? null : ref.id);
    }
    onItemClick?.(item);
  };

  // En táctil no hay «salir»: el navegador manda `pointerleave` justo al levantar el dedo, y
  // quitaría la vista previa al instante. El hover se retira al tocar fuera de cualquier item.
  const leaveHandler =
    (ref: ItemRef): PointerEventHandler =>
    (event) => {
      if (event.pointerType !== "touch" && isSameItem(store.getState().hovered, ref)) {
        hoverItem(null);
      }
    };

  const getRegionProps = (region: Region<TDatum>): RegionProps => {
    const ref: ItemRef = { kind: "region", id: region.id };
    return {
      "data-region-id": region.id,
      "data-selected": region.id === selectedId ? true : undefined,
      onClick: () => clickItem(ref),
      onPointerEnter: () => hoverItem(ref),
      onPointerLeave: leaveHandler(ref),
    };
  };

  const getPointProps = (point: { id: string }): PointProps => {
    const ref: ItemRef = { kind: "point", id: point.id };
    return {
      "data-point-id": point.id,
      onClick: () => clickItem(ref),
      onPointerEnter: () => hoverItem(ref),
      onPointerLeave: leaveHandler(ref),
    };
  };

  // Al cambiar de nivel la proyección es otra y la cámara vuelve al encaje (el rebase deja el hijo a
  // k = 1). Antes de pintar (`useLayoutEffect`): con un efecto normal se vería un fotograma con la
  // cámara vieja sobre la geometría nueva. Sin animar ni avisar a `onViewChange`.
  const shownKey = engine.shownKey;
  const previousLevel = useRef(shownKey);
  useIsoLayoutEffect(() => {
    if (!engine.active || previousLevel.current === shownKey) return;
    previousLevel.current = shownKey;
    void store.getZoom()?.resetView({ duration: 0, silent: true });
  }, [engine.active, shownKey, store]);

  // ── cámara: ZoomTarget → transform ────────────────────────────────────────────────────────────
  const zoomOptions = resolveZoomOptions(options.zoom, {
    clickIsBusy: onItemClick !== undefined || selectable,
  });
  const focusBounds = { ...DEFAULT_FOCUS_BOUNDS, ...options.focusBounds };

  /** Límites en píxeles del cuerpo principal de una región (Francia sin la Guayana). Perezoso. */
  const getRegionExtent = (id: string) => {
    const feature = featuresById.get(id);
    return feature === undefined ? null : getFocusExtent({ feature, path: toPath, project });
  };

  const resolveCamera: UseChoroplethResult<TDatum>["resolveCamera"] = (target, cameraOptions) => {
    if (zoomOptions === null) return null;
    const size = { width, height };
    const transform = resolveZoomTarget({
      target,
      size,
      padding: cameraOptions?.padding ?? zoomOptions.padding,
      scaleExtent: [zoomOptions.min, zoomOptions.max],
      project,
      getRegionExtent,
      focusBounds,
    });
    // `d3-zoom` solo aplica `constrain` a los gestos, no a las transiciones programáticas.
    return transform !== null && zoomOptions.constrain === "contain"
      ? constrainTransform({
          transform,
          content: [
            [0, 0],
            [width, height],
          ],
          view: [
            [0, 0],
            [width, height],
          ],
        })
      : transform;
  };

  return {
    containerRef: measured.ref,
    width,
    height,
    status,
    dataLoading,
    regions,
    anonymousPaths,
    emptyFill,
    fallbackPoints: fallbackMarks,
    labels,
    zoom: zoomOptions,
    onViewChange: typeof options.zoom === "object" ? options.zoom.onViewChange : undefined,
    invert,
    project,
    focusId: options.focusId,
    resolveCamera,
    borders: bordersPath,
    legend: variant.legend,
    sizeLegend: variant.sizeLegend,
    bubbles,
    scale: variant.scale,
    joinReport,
    formatValue,
    clickable: onItemClick !== undefined || selectable,
    store,
    selectedId,
    setSelectedId,
    hoverItem,
    clickItem,
    getItemContext,
    getRegionProps,
    getPointProps,
  };
};

// `useLayoutEffect` avisa en el servidor; allí no hay cámara que reiniciar.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const NO_GEOGRAPHY: GeographyData = { type: "FeatureCollection", features: [] };
const EMPTY_FEATURES: FeatureCollection = { type: "FeatureCollection", features: [] };
const NO_DATA: readonly never[] = [];

// Color de «sin dato» tematizable con `--cm-empty-fill`; el valor tras la coma es el de respaldo
// si no se ha cargado `styles.css`.
const EMPTY_FILL_VAR = `var(--cm-empty-fill, ${DEFAULT_EMPTY_FILL})`;

const nameOf = (feature: Feature): string | undefined => {
  const name = (feature.properties as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : undefined;
};

const defaultFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);
