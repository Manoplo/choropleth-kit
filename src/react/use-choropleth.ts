import { useEffect, useMemo, useState, type MouseEventHandler } from "react";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import { geoPath } from "d3-geo";
import type { Topology } from "topojson-specification";
import {
  createBorders,
  createProjection,
  DEFAULT_EMPTY_FILL,
  defaultFormatValue,
  formatJoinDiagnostics,
  joinData,
  resolveVariant,
  toFeatureCollection,
  type Bubble,
  type ColorScale,
  type JoinResult,
  type LegendItem,
  type Point,
  type ProjectionName,
  type SizeLegendItem,
  type VariantConfig,
} from "../core";
import { useContainerSize } from "./use-container-size";

export type RegionEvent<TDatum> = {
  id: string;
  feature: Feature;
  /** `undefined` = región sin dato. */
  datum: TDatum | undefined;
};

/** Una región lista para pintar. */
export type Region<TDatum> = RegionEvent<TDatum> & {
  /** Atributo `d` del `<path>`. */
  path: string;
  fill: string;
  /** Valor del dato: número, categoría (`categorical`) o `null` si no hay dato. */
  value: number | string | null;
  /** `value` listo para mostrar («1,5 %», «Europa»); cadena vacía si no hay valor. */
  formattedValue: string;
};

export type JoinReport = Omit<JoinResult<unknown>, "joined">;

type BaseOptions<TDatum> = {
  /** TopoJSON o GeoJSON ya cargado. Mantén una referencia estable (constante de módulo o `useMemo`). */
  geography: Topology | FeatureCollection;
  objectName?: string;
  data: readonly TDatum[];
  getId: (datum: TDatum) => string;
  /** Id de la región si no es `feature.id` (p. ej. `(f) => f.properties?.iso_a2`). */
  getFeatureId?: (feature: Feature) => string | undefined;
  projection?: ProjectionName;
  emptyFill?: string;
  formatValue?: (value: number) => string;
  /** Si se pasa, la leyenda incluye un item "sin dato" con este texto. */
  emptyLabel?: string;
  /** Tamaño fijo. Si faltan, se mide el contenedor (`containerRef`). */
  width?: number;
  height?: number;
  selectedId?: string | null;
  onRegionClick?: (event: RegionEvent<TDatum>) => void;
  onRegionHover?: (event: RegionEvent<TDatum> | null) => void;
  /** Se llama cada vez que cambia el resultado del cruce datos↔regiones (también en producción). */
  onJoinReport?: (report: JoinReport) => void;
  /** Aviso en consola de ids sin cruzar. Solo fuera de producción. Por defecto `true`. */
  diagnostics?: boolean;
};

/** Opciones comunes + las de cada `variant` (unión discriminada, ver `core/variants.ts`). */
export type UseChoroplethOptions<TDatum> = BaseOptions<TDatum> & VariantConfig<TDatum>;

export type RegionProps = {
  "data-region-id": string;
  "data-selected": true | undefined;
  onClick: MouseEventHandler;
  onMouseEnter: MouseEventHandler;
  onMouseLeave: MouseEventHandler;
};

export type UseChoroplethResult<TDatum> = {
  /** Pon esta ref en el contenedor para que el mapa se adapte a su ancho. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  regions: Region<TDatum>[];
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
  /** `true` si hay `onRegionClick`: los componentes ponen cursor `pointer`. */
  clickable: boolean;
  hoveredId: string | null;
  selectedId: string | null;
  getRegionProps: (region: Region<TDatum>) => RegionProps;
};

/**
 * Nivel 3 (headless) y motor de los otros dos: `<Choropleth.Root>` y `<ChoroplethMap>` lo llaman
 * y reparten su resultado. Devuelve datos, no elementos: tú decides cómo pintarlos.
 *
 * Qué se memoiza y por qué: solo lo caro y lo que debe tener identidad estable.
 *  - Geometría (`features`, `borders`): depende solo de `geography`.
 *  - Rutas SVG: dependen de geometría, proyección y tamaño. NO de los datos, así que cambiar de
 *    indicador o de `variant` no recalcula ni una ruta (criterio de aceptación de dd.md §20).
 * El join y la escala son O(regiones) y se recalculan en cada render: memoizarlos exigiría que el
 * consumidor estabilizara `getId`/`getValue`/`classification`, y casi nadie lo hace.
 */
export const useChoropleth = <TDatum>(
  options: UseChoroplethOptions<TDatum>,
): UseChoroplethResult<TDatum> => {
  const { geography, objectName, data, getId, getFeatureId, projection } = options;
  const isBubble = options.variant === "bubble";

  // ── tamaño ────────────────────────────────────────────────────────────────────────────────────
  const measured = useContainerSize();
  const width = options.width ?? measured.width;
  const height = options.height ?? measured.height;

  // ── geometría (depende solo de `geography`) ───────────────────────────────────────────────────
  const features = useMemo(
    () => toFeatureCollection({ geography, objectName }),
    [geography, objectName],
  );
  const bordersGeometry = useMemo<MultiLineString | null>(
    () => createBorders({ geography, objectName }),
    [geography, objectName],
  );

  // ── rutas (geometría + proyección + tamaño; nada de datos) ────────────────────────────────────
  const { paths, bordersPath, centroids, project } = useMemo(() => {
    const geoProjection = createProjection({
      name: projection,
      width,
      height,
      featureCollection: features,
    });
    const toPath = geoPath(geoProjection);
    return {
      paths: features.features.map((f) => toPath(f)),
      bordersPath: bordersGeometry === null ? null : toPath(bordersGeometry),
      // Los centroides solo se calculan para `bubble` (es lo único que los usa).
      centroids: isBubble
        ? features.features.map((f): Point | null => {
            const [x, y] = toPath.centroid(f);
            return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
          })
        : [],
      project: (coordinates: Point): Point | null => geoProjection([...coordinates]),
    };
  }, [features, bordersGeometry, projection, width, height, isBubble]);

  // ── datos → color ─────────────────────────────────────────────────────────────────────────────
  const idOf = getFeatureId ?? defaultFeatureId;
  const join = joinData({ features: features.features, data, getId, getFeatureId: idOf });

  // Burbujas con sus propias coordenadas (tiendas): los datos NO tienen por qué corresponder a una
  // región, así que «sin cruzar» no es un error y no debe avisar.
  const hasOwnCoordinates = options.variant === "bubble" && options.getCoordinates !== undefined;
  const joinReport: JoinReport = {
    unmatchedData: hasOwnCoordinates ? [] : join.unmatchedData,
    featuresWithoutData: hasOwnCoordinates ? [] : join.featuresWithoutData,
    duplicateDataIds: join.duplicateDataIds,
  };

  // Un valor por REGIÓN (no por fila de `data`): los datos huérfanos no deben influir en la escala,
  // y la leyenda cuenta regiones.
  const entries = features.features.map((feature) => {
    const id = idOf(feature);
    return { id, datum: id === undefined ? undefined : join.joined.get(id) };
  });

  const formatValue = options.formatValue ?? defaultFormatValue;
  const variant = resolveVariant<TDatum>({
    config: options,
    entries,
    data,
    getId,
    centroids,
    project,
    emptyFill: options.emptyFill ?? EMPTY_FILL_VAR,
    formatValue,
    emptyLabel: options.emptyLabel,
  });

  const regions: Region<TDatum>[] = [];
  features.features.forEach((feature, index) => {
    const path = paths[index];
    const entry = entries[index];
    // Sin ruta (geometría vacía) o sin id (no se puede seleccionar ni cruzar): no hay nada que pintar
    // con sentido. Las regiones sin id sí existen en world-atlas (p. ej. Kosovo).
    if (path == null || entry?.id === undefined) return;
    regions.push({
      id: entry.id,
      feature,
      datum: entry.datum,
      path,
      value: variant.values[index] ?? null,
      formattedValue: variant.labels[index] ?? "",
      fill: variant.fills[index] ?? "",
    });
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
    onJoinReport?.(joinReport);
    if (!diagnostics || isProduction()) return;
    const message = formatJoinDiagnostics({ ...joinReport, dataCount: data.length });
    if (message !== null) console.warn(message);
    // Solo `reportKey`: el contenido de `joinReport` ya está resumido en ella, y volver a ejecutar
    // por la identidad de `onJoinReport` (casi siempre una función inline) avisaría en cada render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  // ── interacción ───────────────────────────────────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { selectedId = null, onRegionClick, onRegionHover } = options;

  const getRegionProps = (region: Region<TDatum>): RegionProps => {
    const event: RegionEvent<TDatum> = {
      id: region.id,
      feature: region.feature,
      datum: region.datum,
    };
    return {
      "data-region-id": region.id,
      "data-selected": region.id === selectedId ? true : undefined,
      onClick: () => onRegionClick?.(event),
      onMouseEnter: () => {
        setHoveredId(region.id);
        onRegionHover?.(event);
      },
      onMouseLeave: () => {
        setHoveredId(null);
        onRegionHover?.(null);
      },
    };
  };

  return {
    containerRef: measured.ref,
    width,
    height,
    regions,
    borders: bordersPath,
    legend: variant.legend,
    sizeLegend: variant.sizeLegend,
    bubbles: variant.bubbles,
    scale: variant.scale,
    joinReport,
    formatValue,
    clickable: onRegionClick !== undefined,
    hoveredId,
    selectedId,
    getRegionProps,
  };
};

// Color de «sin dato» tematizable con `--cm-empty-fill`; el valor tras la coma es el de respaldo
// si no se ha cargado `styles.css`.
const EMPTY_FILL_VAR = `var(--cm-empty-fill, ${DEFAULT_EMPTY_FILL})`;

// `process` no existe en un navegador sin bundler; los bundlers lo sustituyen por una constante.
const isProduction = (): boolean =>
  typeof process !== "undefined" && process.env["NODE_ENV"] === "production";

const defaultFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);
