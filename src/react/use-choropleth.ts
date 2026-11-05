import { useEffect, useMemo, useState, type MouseEventHandler } from "react";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import { geoPath } from "d3-geo";
import type { Topology } from "topojson-specification";
import {
  buildLegend,
  createBorders,
  createColorScale,
  createProjection,
  DEFAULT_EMPTY_FILL,
  defaultFormatValue,
  formatJoinDiagnostics,
  joinData,
  toFeatureCollection,
  type Classification,
  type ColorScale,
  type DivergingPaletteName,
  type JoinResult,
  type LegendItem,
  type ProjectionName,
  type SequentialPaletteName,
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
  /** Valor numérico del dato; `null` si no hay dato o su valor es `null`. */
  value: number | null;
};

export type JoinReport = Omit<JoinResult<unknown>, "joined">;

type BaseOptions<TDatum> = {
  /** TopoJSON o GeoJSON ya cargado. Mantén una referencia estable (constante de módulo o `useMemo`). */
  geography: Topology | FeatureCollection;
  objectName?: string;
  data: readonly TDatum[];
  getId: (datum: TDatum) => string;
  getValue: (datum: TDatum) => number | null;
  /** Id de la región si no es `feature.id` (p. ej. `(f) => f.properties?.iso_a2`). */
  getFeatureId?: (feature: Feature) => string | undefined;
  projection?: ProjectionName;
  classification?: Classification;
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

export type UseChoroplethOptions<TDatum> = BaseOptions<TDatum> &
  (
    | { variant: "sequential"; palette?: SequentialPaletteName }
    | { variant: "diverging"; palette?: DivergingPaletteName; midpoint?: number }
  );

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
  legend: LegendItem[];
  scale: ColorScale;
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
  const { geography, objectName, data, getId, getValue, getFeatureId, projection } = options;

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
  const { paths, bordersPath } = useMemo(() => {
    const toPath = geoPath(
      createProjection({ name: projection, width, height, featureCollection: features }),
    );
    return {
      paths: features.features.map((f) => toPath(f)),
      bordersPath: bordersGeometry === null ? null : toPath(bordersGeometry),
    };
  }, [features, bordersGeometry, projection, width, height]);

  // ── datos → color ─────────────────────────────────────────────────────────────────────────────
  const idOf = getFeatureId ?? defaultFeatureId;
  const { joined, ...joinReport } = joinData({
    features: features.features,
    data,
    getId,
    getFeatureId: idOf,
  });

  // Un valor por REGIÓN (no por fila de `data`): los datos huérfanos no deben influir en la escala,
  // y la leyenda cuenta regiones.
  const entries = features.features.map((feature, index) => {
    const id = idOf(feature);
    const datum = id === undefined ? undefined : joined.get(id);
    return { feature, index, id, datum, value: datum === undefined ? null : getValue(datum) };
  });
  const values = entries.map((e) => e.value);

  const scale = createColorScale({
    values,
    classification: options.classification,
    emptyFill: options.emptyFill ?? EMPTY_FILL_VAR,
    ...(options.variant === "diverging"
      ? { variant: "diverging", palette: options.palette, midpoint: options.midpoint }
      : { variant: "sequential", palette: options.palette }),
  });

  const regions: Region<TDatum>[] = [];
  for (const { feature, index, id, datum, value } of entries) {
    const path = paths[index];
    // Sin ruta (geometría vacía) o sin id (no se puede seleccionar ni cruzar): no hay nada que pintar
    // con sentido. Las regiones sin id sí existen en world-atlas (p. ej. Kosovo).
    if (path === null || path === undefined || id === undefined) continue;
    regions.push({ id, feature, datum, value, path, fill: scale.getColor(value) });
  }

  const legend = buildLegend({
    scale,
    values,
    formatValue: options.formatValue,
    emptyLabel: options.emptyLabel,
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
    legend,
    scale,
    joinReport,
    formatValue: options.formatValue ?? defaultFormatValue,
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
