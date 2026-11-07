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
import { geoPath, type GeoProjection } from "d3-geo";
import {
  buildProjectionChain,
  FIT_TRANSFORM,
  relativeTransform,
  computeAspectRatio,
  constrainTransform,
  contextOf,
  createBorders,
  createProjection,
  DEFAULT_EMPTY_FILL,
  DEFAULT_FOCUS_BOUNDS,
  defaultFormatValue,
  checkDrillStep,
  clampPath,
  createIntentTimer,
  formatDrillRequestProblem,
  formatJoinDiagnostics,
  formatNoIdsDiagnostic,
  formatTooDeepRequest,
  formatWrongLevelDataHint,
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
  type ChainLevel,
  type ChoroplethLabels,
  type CameraTransform,
  type ColorScale,
  type DrillContext,
  type DrillRequestProblem,
  type GeographyData,
  type GeographyInput,
  type JoinResult,
  type LegendItem,
  type LonLatBounds,
  type Padding,
  type Point,
  type ProjectionChain,
  type ProjectionName,
  type ResolvedZoom,
  type SizeLegendItem,
  type VariantConfig,
  type ZoomOptions,
  type ZoomTarget,
} from "../core";
import { isDrillable, sourceDepth, type DrillEvent, type DrillLevel } from "./drill-levels";
import { useDrillChoreography } from "./use-drill-choreography";
import {
  isSameItem,
  ROOT_LEVEL,
  type DrillLevelInfo,
  type ItemContext,
  type ItemRef,
  type MapItem,
} from "./map-item";
import { isProduction } from "./env";
import { createMapStore, type DrillApi, type MapStore } from "./map-store";
import { useContainerSize } from "./use-container-size";
import { useDrillEngine } from "./use-drill-engine";
import type { DrillController } from "./use-drill-down";
import { useGeography, type GeographyStatus } from "./use-geography";

/** A region ready to paint. */
export type Region<TDatum> = {
  id: string;
  feature: Feature;
  /** `undefined` = region without data. */
  datum: TDatum | undefined;
  /** The `<path>`'s `d` attribute. */
  path: string;
  fill: string;
  /** The datum's value: number, category (`categorical`) or `null` if there is no datum. */
  value: number | string | null;
  /** `value` ready to display ("1.5 %", "Europe"); empty string if there is no value. */
  formattedValue: string;
  /** There is a level below and `canDrill` allows it (always `false` without `drill`). */
  drillable: boolean;
  /** 0…1: how much its entrance is delayed in the reveal (distance from the center). Only while revealing. */
  wave: number | undefined;
  /** From `getRegionStyle`; `undefined` = the CSS one (1). */
  opacity: number | undefined;
  /** From `getRegionStyle`: a class of its own for this region. */
  className: string | undefined;
  /** From `getRegionStyle`: a pattern drawn ON TOP of the color (`"hatch"`, `"dots"` or the name of your own in `<Choropleth.Defs>`). */
  pattern: string | undefined;
  /** Legend class it belongs to (`data-class`), or `null` (no data, continuous scale, `bubble`). */
  classIndex: number | null;
};

/**
 * Per-region style (dd.md §12.5.6): data-based exceptions the scale cannot express. It is evaluated in
 * render and its fields reach the `<path>` as primitives, so it does not break the regions' `memo`.
 */
export type RegionStyle = {
  /** Replaces the scale's color (and `emptyFill`). */
  fill?: string;
  opacity?: number;
  /** A class of its own; it is added to `classNames.region`. */
  className?: string;
  /**
   * Pattern drawn over the color (the datum still shows through): `"hatch"` or `"dots"`, or the name of
   * your own `<pattern>` defined in `<Choropleth.Defs>` with `useDefId(name)`. It needs `<Choropleth.Defs>`
   * and `<Choropleth.Patterns>` (the preset and `Choropleth.Svg` already include them).
   */
  pattern?: "hatch" | "dots" | (string & {});
};

/**
 * A drill layer that is NOT the active one (dd.md §11.2.5). `context`: the levels above, in gray and
 * with no data (the parent's scale and the child's are not comparable). `exiting`: the level that was
 * just left, fading out. The paths are in the pixels of THEIR projection; `transform` carries them to
 * those of the active level (it is the affine map `R` between the two projections), so the cached paths are reused.
 */
export type DrillLayerView = {
  key: string;
  role: "context" | "exiting";
  depth: number;
  transform: CameraTransform;
  paths: {
    id: string | undefined;
    d: string;
    focus: boolean;
    drillable: boolean;
    /** `exiting` only: the color the region had (it fades with it). */
    fill: string | undefined;
  }[];
};

/** A crumb of the drill route (dd.md §11.2.5). */
export type DrillNavItem = {
  depth: number;
  /** `null` at the root. */
  id: string | null;
  label: string;
  /** The last one: the level being gone to (or being at). */
  current: boolean;
};

/** What a breadcrumb needs (the preset's or yours). `null` without `drill`. */
export type DrillNav = {
  items: DrillNavItem[];
  canDrillUp: boolean;
  /** Goes to the crumb at that depth (0 = root). */
  drillTo: (depth: number) => void;
  drillUp: (steps?: number) => void;
};

export type JoinReport = Omit<JoinResult<unknown>, "joined">;

/** What is dimmed when there is a selection or hover (dd.md §12.1). */
export type DimOthers = "never" | "selection" | "hover-and-selection";

type BaseOptions<TDatum> = {
  /**
   * TopoJSON or GeoJSON, a promise, or `() => import("…")`. Already-loaded data must have a stable
   * reference (a module constant or `useMemo`).
   */
  geography?: GeographyInput;
  /** Cache key for an async geometry (otherwise the function's identity is used). */
  geographyKey?: string;
  objectName?: string;
  /** Discards regions before anything else (e.g. Antarctica: `(f) => f.id !== "010"`). */
  filterFeatures?: (feature: Feature) => boolean;
  /**
   * `undefined` = loading (the previous data is kept, no warnings); `[]` = loaded and empty. With `drill`
   * it can be a selector for the current level: `({ depth, parentId }) => rows.filter(…)`.
   */
  data: readonly TDatum[] | undefined | ((ctx: DrillContext) => readonly TDatum[] | undefined);
  /**
   * Drill-down (dd.md §11.2): the list of levels (uncontrolled) or a `useDrillDown` (controlled).
   * With `drill`, the geometry comes from the levels and `geography` is ignored.
   */
  drill?: readonly DrillLevel<TDatum>[] | DrillController<TDatum>;
  /** When a level change STARTS (the route is already updated). */
  onDrill?: (event: DrillEvent<TDatum>) => void;
  /** When the new level has finished being shown. */
  onDrillEnd?: (event: DrillEvent<TDatum>) => void;
  /** If a level's geometry fails (or has 0 regions): it goes back to the previous level. */
  onDrillError?: (event: { error: unknown; ctx: DrillContext }) => void;
  /**
   * The pointer has stayed 150 ms over a region you can drill into (or, on touch, it was tapped once):
   * `ctx` is that of the level it would go down to. Use it to preload data (`queryClient.prefetchQuery`);
   * that level's geometry is already preloaded by the map. Called once per dwell.
   */
  onDrillIntent?: (ctx: DrillContext) => void;
  /** Forces the data loading state (pulse) even if `data` is defined. */
  loading?: boolean;
  getId: (datum: TDatum) => string;
  /** The region's id if it is not `feature.id` (e.g. `(f) => f.properties?.iso_a2`). */
  getFeatureId?: (feature: Feature) => string | undefined;
  projection?: ProjectionName;
  /**
   * Width / height of the map. `"auto"` derives it from the geometry's bounds (Chile comes out tall,
   * Norway wide). 960 / 500 by default, the world's proportion.
   */
  aspectRatio?: number | "auto";
  emptyFill?: string;
  formatValue?: (value: number) => string;
  /** If given, the legend includes a "no data" item with this text. */
  emptyLabel?: string;
  /** UI texts (i18n). English by default; `es` is exported. */
  labels?: Partial<ChoroplethLabels>;
  /**
   * Microstates that do not exist in the geometry (Andorra, Monaco…): `{ AD: [1.52, 42.51] }`. A datum
   * whose id joins no region but is listed here is painted as a dot, with the datum's color. In
   * `bubble`, as a bubble.
   */
  fallbackPoints?: Readonly<Record<string, Point>>;
  /** Fixed size. If missing, the container (`containerRef`) is measured. */
  width?: number;
  height?: number;
  // ── selection (regions only) ────────────────────────────────────────────────────────────────
  /** Controlled: you are in charge. `null` = nothing selected. Without this, the library holds the state. */
  selectedId?: string | null;
  /** Uncontrolled: the initial selection. */
  defaultSelectedId?: string | null;
  /** Called when the selection changes (click on a region; click on the selected one = `null`). */
  onSelectedIdChange?: (id: string | null) => void;
  /** Dims the rest of the map. Defaults to `"selection"`. */
  dimOthers?: DimOthers;
  /** Click on a region or a point (`item.kind`). */
  onItemClick?: (item: MapItem<TDatum>) => void;
  /** Hover (or first tap, on touch). `null` on leaving. Only called when the item changes. */
  onItemHover?: (item: MapItem<TDatum> | null) => void;
  /**
   * Per-region style based on its data: `(r) => r.datum?.estimated ? { opacity: 0.6 } : undefined`. Priority:
   * `getRegionStyle` > scale color > `emptyFill`. Do not define `fill` on `.cm-region` in CSS: it would beat the datum.
   */
  getRegionStyle?: (region: Region<TDatum>) => RegionStyle | undefined;
  /** Called every time the data↔regions join result changes (also in production). */
  onJoinReport?: (report: JoinReport) => void;
  /**
   * Flies to this region (id) when it changes; with `null` it returns to the fit. On the **first render**
   * it does not fly: it places the camera directly. It is the declarative form of `zoomTo` (dd.md §11.1.5).
   */
  focusId?: string | null;
  /**
   * Explicit framings per region, in [[lonW, latS], [lonE, latN]]. They are merged with the library's
   * (`DEFAULT_FOCUS_BOUNDS`: Spain **with the Canary Islands**). `{ ES: null }` returns to the geometric
   * framing (main body) for that region.
   */
  focusBounds?: Readonly<Record<string, LonLatBounds | null>>;
  /**
   * Zoom and pan (dd.md §11.1). On by default; `false` = static map. The wheel zooms with the mouse over
   * the map (`wheel: "always"`); for maps inside a long page use `wheel: "cooperative"`.
   */
  zoom?: boolean | ZoomOptions;
  /** Called if the async geometry load fails. Without this, a console warning is issued. */
  onGeographyError?: (error: Error) => void;
  /** Console warning about ids that did not join. Outside production only. Defaults to `true`. */
  diagnostics?: boolean;
};

/** Common options + those of each `variant` (a discriminated union, see `core/variants.ts`). */
export type UseChoroplethOptions<TDatum> = BaseOptions<TDatum> & VariantConfig<TDatum>;

/** Props ready to spread onto a region's `<path>` (`<path {...getRegionProps(r)} />`). */
export type RegionProps = {
  "data-region-id": string;
  "data-selected": true | undefined;
  onClick: MouseEventHandler;
  onPointerEnter: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
};

/** Props for the `<circle>` of a bubble with its own coordinates (a point). */
export type PointProps = {
  "data-point-id": string;
  onClick: MouseEventHandler;
  onPointerEnter: PointerEventHandler;
  onPointerLeave: PointerEventHandler;
};

/** A microstate painted as a dot (`fallbackPoints`) outside `bubble`. */
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

/** Radius in pixels of a fallback point. */
export const FALLBACK_POINT_RADIUS = 4;

export type UseChoroplethResult<TDatum> = {
  /** Put this ref on the container so the map adapts to its width. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  /** Phase of the drill choreography (`null` without `drill`). Published as `data-drill-phase`. */
  drillPhase: "idle" | "flying" | "loading" | "revealing" | null;
  /** Region being drilled into while the flight / load lasts (the rest is dimmed). */
  drillFocusId: string | null;
  /** Context layers (levels above, in gray) and the one that leaves. Empty without `drill`. */
  drillLayers: DrillLayerView[];
  /** Click on a region of a context layer (lateral navigation or jump). */
  selectContextItem: (depth: number, id: string) => void;
  /** Drill breadcrumbs and navigation (`null` without `drill`). */
  drillNav: DrillNav | null;
  /** `loading` while the async geometry arrives; `error` if it failed. */
  status: GeographyStatus;
  /** `true` while `data` is `undefined` (or `loading`): the last data is kept. */
  dataLoading: boolean;
  regions: Region<TDatum>[];
  /** `d` of the regions WITHOUT an id: they are painted with `emptyFill`, with no interaction (Kosovo in world-atlas). */
  anonymousPaths: string[];
  /** Already-resolved "no data" color (`emptyFill` or the CSS variable). */
  emptyFill: string;
  /** Microstates painted as a dot (empty in `bubble`: there they are bubbles). */
  fallbackPoints: FallbackPoint<TDatum>[];
  labels: ChoroplethLabels;
  /** Already-resolved zoom options; `null` if `zoom={false}`. */
  zoom: ResolvedZoom | null;
  /** The user's `onViewChange` (not part of `zoom`: it must not reinstall the behavior). */
  onViewChange: ZoomOptions["onViewChange"];
  /** Canvas pixels → [lon, lat] (`projection.invert`); `null` if it falls outside the globe. */
  invert: (point: Point) => Point | null;
  /** [lon, lat] → canvas pixels; `null` if it does not project. */
  project: (coordinates: Point) => Point | null;
  /** `focusId` as is, so `useZoom` applies it (fly or place the camera). */
  focusId: string | null | undefined;
  /**
   * `ZoomTarget` → camera (already limited by `constrain`), or `null` if it cannot be resolved
   * (nonexistent region). It is what `zoomTo`, `focusId` and `initialView` use.
   */
  resolveCamera: (
    target: ZoomTarget,
    options?: { padding?: number | Padding },
  ) => CameraTransform | null;
  /** Interior borders (a `<path>`'s `d`). `null` with GeoJSON: use `stroke` on each region. */
  borders: string | null;
  /** Color legend (swatches with counts). Empty in `bubble` without `getColorValue`. */
  legend: LegendItem[];
  /** Size reference circles (`bubble` only). */
  sizeLegend: SizeLegendItem[];
  /** Already-positioned bubbles, from largest to smallest (`bubble` only). */
  bubbles: Bubble<TDatum>[];
  /** Numeric color scale. `null` in `categorical` and in `bubble` without `getColorValue`. */
  scale: ColorScale | null;
  joinReport: JoinReport;
  /** Effective formatter (the user's or the default), for tooltip and legend. */
  formatValue: (value: number) => string;
  /** `true` if there is `onItemClick`: components set a `pointer` cursor. */
  clickable: boolean;
  /**
   * Interaction state (hover, pointer) outside React. Read it with `useMapStore(store, s => s.hoveredId)`:
   * that way changing region does not re-render the component that calls `useChoropleth`.
   */
  store: MapStore;
  selectedId: string | null;
  /** Selects a region (`null` clears it). It respects controlled mode: it only notifies. */
  setSelectedId: (id: string | null) => void;
  /** Hover of an item (or `null`). Updates the store and calls `onItemHover` only if it changes. */
  hoverItem: (ref: ItemRef | null) => void;
  /** Clic en un item: llama a `onItemClick`. */
  clickItem: (ref: ItemRef) => void;
  /** The complete item (with value, color and name) for the tooltip; `undefined` if it no longer exists. */
  getItemContext: (ref: ItemRef) => ItemContext<TDatum> | undefined;
  getRegionProps: (region: Region<TDatum>) => RegionProps;
  getPointProps: (point: { id: string }) => PointProps;
};

/**
 * Level 3 (headless) and the engine of the other two: `<Choropleth.Root>` and `<ChoroplethMap>` call it
 * and distribute its result. It returns data, not elements: you decide how to paint them.
 *
 * What is memoized and why: only what is expensive and what must have a stable identity.
 *  - Geometry (`features`, `borders`): depends only on `geography` (and on the filter, by its RESULT).
 *  - SVG paths: depend on geometry, projection and size. NOT on the data, so changing indicator or
 *    `variant` recomputes not a single path (acceptance criterion of dd.md §20).
 * The join and the scale are O(regions) and are recomputed on every render: memoizing them would
 * require the consumer to stabilize `getId`/`getValue`/`classification`, and almost nobody does.
 */
export const useChoropleth = <TDatum>(
  rawOptions: UseChoroplethOptions<TDatum>,
): UseChoroplethResult<TDatum> => {
  // Interaction state (hover, pointer, camera) outside React. It goes first: the drill reads the camera.
  const [store] = useState(createMapStore);

  // ── drill-down: the level being shown overrides the map's options ───────────────────────────────
  // To the rest of the hook, a map with `drill` is a ONE-level map with different options.
  const engine = useDrillEngine<TDatum>({
    drill: rawOptions.drill,
    data: rawOptions.data,
    filterFeatures: rawOptions.filterFeatures,
    store,
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

  // ── geometry (depends only on `geography`) ──────────────────────────────────────────────────────
  // With `drill` the geometry is loaded by the engine (per level, with a cache); an empty one is passed here.
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
    // `engine.features` already comes filtered and is stable (the engine's caches).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [engine.active, engine.features, geography, objectName],
  );

  // The filter is applied on EVERY render (it is O(regions)) but memoized by its RESULT: an inline
  // `filterFeatures` changes identity on every render, and if it were the dependency it would recompute
  // all the paths. The indexes that survive are a stable value.
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
    // `keptIndexes` is summarized in `keptKey` (see above).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [allFeatures, keptKey],
  );
  const bordersGeometry = useMemo<MultiLineString | null>(
    () =>
      geography === undefined ? null : createBorders({ geography, objectName, filterFeatures }),
    // `filterFeatures` is summarized in `keptKey`: its identity must not relaunch the computation.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [geography, objectName, keptKey],
  );

  // ── size ────────────────────────────────────────────────────────────────────────────────────────
  const autoAspect = useMemo(
    () =>
      options.aspectRatio === "auto"
        ? computeAspectRatio({
            name: projection,
            // With drill the proportion is the root's: it must not change when going down a level.
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

  // ── drill projection chain (rebase, dd.md §11.2.4) ──────────────────────────────────────────────
  // The root is fitted to the world and each level is its parent's readjusted to the chosen region's
  // main body: that way the child is painted at k = 1 with full precision and the flight ends on the same pixel.
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
    // `chainSig` summarizes the content of `engine.chain`; `focusKey`, that of `drillFocusBounds`.
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

  /** The projection chain of another route with the current size and framings (where the camera flies to). */
  const chainFor = (levels: ChainLevel[], path: readonly string[]): ProjectionChain =>
    buildProjectionChain({
      levels,
      path,
      name: projection,
      width,
      height,
      padding: rebasePadding,
      focusBounds: drillFocusBounds,
    });
  useDrillChoreography({ engine, store, shownChain: chain, chainFor });

  // What was left behind (the exiting layer) and its projection, only while needed.
  const { machine, previous } = engine;
  const leaving = machine.layers.some((layer) => layer.role === "exiting");
  const previousChain = useMemo(
    () =>
      engine.active &&
      previous !== null &&
      width > 0 &&
      height > 0 &&
      (leaving || machine.direction === "up")
        ? buildProjectionChain({
            levels: [...previous.chain],
            path: previous.path,
            name: projection,
            width,
            height,
            padding: rebasePadding,
            focusBounds: drillFocusBounds,
          })
        : null,
    // `previous` changes only when the level changes; `focusKey` summarizes `drillFocusBounds`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      engine.active,
      previous,
      leaving,
      machine.direction,
      projection,
      width,
      height,
      rebasePadding,
      focusKey,
    ],
  );
  const activeProjection = chain?.projections[chain.projections.length - 1];
  const layersKey = machine.layers.map((layer) => `${layer.key}:${layer.role}`).join("|");
  const contextMode = engine.level?.context ?? "siblings";
  const drillLayers = useMemo<DrillLayerView[]>(() => {
    if (!engine.active || chain === null || activeProjection === undefined) return [];
    const views: DrillLayerView[] = [];
    const activeSource = sourceDepth(engine.levels, engine.depth);
    for (const layer of machine.layers) {
      let features: readonly Feature[] | undefined;
      let projectionOf: GeoProjection | undefined;
      let idOf: ((f: Feature) => string | undefined) | undefined;
      let focusId: string | undefined;
      if (layer.role === "context") {
        // A level that draws the same regions as the active one (`"inherit"`) needs no separate layer.
        if (contextMode === "none" || layer.depth >= engine.depth) continue;
        if (sourceDepth(engine.levels, layer.depth) === activeSource) continue;
        features = engine.levelFeatures[layer.depth]?.features;
        projectionOf = chain.projections[layer.depth];
        idOf = engine.chain[layer.depth]?.idOf;
        focusId = engine.shownPath[layer.depth];
      } else if (layer.role === "exiting") {
        features = previous?.chain[layer.depth]?.features;
        projectionOf = previousChain?.projections[layer.depth];
        idOf = previous?.chain[layer.depth]?.idOf;
      } else {
        continue;
      }
      if (features === undefined || projectionOf === undefined || idOf === undefined) continue;
      const path = geoPath(projectionOf);
      const level = engine.levels[layer.depth];
      const paths = features.flatMap((feature) => {
        const d = path(feature);
        if (d == null) return [];
        const id = idOf(feature);
        const drillable =
          layer.role === "context" &&
          id !== undefined &&
          isDrillable(engine.levels, layer.depth, {
            kind: "region",
            id,
            feature,
            datum: undefined,
            level: { id: level?.id ?? ROOT_LEVEL.id, depth: layer.depth },
            drillable: true,
          });
        const fill =
          layer.role === "exiting" && id !== undefined ? previous?.fills.get(id) : undefined;
        return [{ id, d, focus: id !== undefined && id === focusId, drillable, fill }];
      });
      views.push({
        key: layer.key,
        role: layer.role,
        depth: layer.depth,
        transform: relativeTransform(projectionOf, activeProjection),
        paths,
      });
    }
    return views;
    // `layersKey` summarizes `machine.layers`; the rest changes only when the level or the size changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.active, chain, previousChain, previous, layersKey, engine.chainSig, contextMode]);

  // Breadcrumbs: the REQUESTED route (optimistic), with each region's real name (`properties.name`)
  // unless the consumer gave a `getLabel`. Each step is looked up in the level above, which is already loaded.
  const controller = engine.controller;
  const drillNav = useMemo<DrillNav | null>(() => {
    if (!engine.active || controller === null) return null;
    const rootLabel = engine.levels[0]?.label ?? labels.breadcrumbRoot;
    const items = controller.breadcrumbs.map((crumb): DrillNavItem => {
      let label = crumb.label;
      if (crumb.id === null) label = rootLabel;
      else if (crumb.label === crumb.id) {
        const parent = engine.chain[crumb.depth - 1];
        const feature = parent?.features.find((f) => parent.idOf(f) === crumb.id);
        label = (feature === undefined ? undefined : nameOf(feature)) ?? crumb.id;
      }
      return {
        depth: crumb.depth,
        id: crumb.id,
        label,
        current: crumb.depth === controller.path.length,
      };
    });
    return {
      items,
      canDrillUp: controller.canDrillUp,
      drillTo: (depth) => controller.drillTo(controller.path.slice(0, depth)),
      drillUp: (steps) => controller.drillUp(steps),
    };
    // `engine.chain` changes only with `chainSig`; `labels` is a new object per render: it is summarized in the text.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engine.active,
    controller,
    controller?.path,
    engine.chainSig,
    engine.levels,
    labels.breadcrumbRoot,
  ]);

  /** The region being drilled into (the rest is dimmed; if it takes long, it "breathes"). */
  const drillFocusId =
    engine.active &&
    (machine.phase === "flying" || machine.phase === "loading") &&
    machine.direction !== "up" &&
    machine.direction !== null
      ? (machine.path.at(-1) ?? null)
      : null;

  // ── paths (geometry + projection + size; no data) ───────────────────────────────────────────────
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
    // d3 returns [NaN, NaN] (not null) for what it cannot project: it is normalized here, once.
    const toPoint = (coordinates: Point): Point | null => {
      const at = geoProjection([...coordinates]);
      return at !== null && Number.isFinite(at[0]) && Number.isFinite(at[1]) ? at : null;
    };
    return {
      paths: features.features.map((f) => toPath(f)),
      bordersPath: bordersGeometry === null ? null : toPath(bordersGeometry),
      // Anchors are only computed for `bubble` (the only thing that uses them). `geoPath`'s centroid counts
      // distant territories (France's bubble would land in the Atlantic): the anchor is the pole of
      // inaccessibility of the main body. The centroid remains as a fallback.
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
      // The reverse: pixels → [lon, lat]. Used by `toViewState` for the public `ViewState`.
      invert: (point: Point): Point | null => {
        const at = geoProjection.invert?.([point[0], point[1]]);
        return at != null && Number.isFinite(at[0]) && Number.isFinite(at[1])
          ? [at[0], at[1]]
          : null;
      },
    };
  }, [features, bordersGeometry, projection, width, height, isBubble, chain]);

  // ── data → color ────────────────────────────────────────────────────────────────────────────────
  // `data: undefined` = loading. The last defined data is kept so as not to empty the map (nor warn on
  // the console) while the next arrives. A ref (not state) because `data` usually arrives with a new
  // identity on every render: storing it in state would cause one render for each. Always writing "the
  // last defined" is idempotent, so it is safe during render.
  const lastData = useRef<readonly TDatum[] | undefined>(options.data);
  if (options.data !== undefined) lastData.current = options.data;
  const data: readonly TDatum[] = options.data ?? lastData.current ?? NO_DATA;
  const dataLoading = options.loading ?? options.data === undefined;

  const idOf = getFeatureId ?? defaultFeatureId;
  const join = joinData({ features: features.features, data, getId, getFeatureId: idOf });

  // Microstates: data without a region whose id has a fallback point.
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

  // Bubbles with their own coordinates (stores): the data need NOT correspond to a region, so
  // "unjoined" is not an error and must not warn.
  const hasOwnCoordinates = options.variant === "bubble" && options.getCoordinates !== undefined;
  const joinReport: JoinReport = {
    unmatchedData: hasOwnCoordinates ? [] : join.unmatchedData.filter((id) => !fallbackIds.has(id)),
    featuresWithoutData: hasOwnCoordinates ? [] : join.featuresWithoutData,
    duplicateDataIds: join.duplicateDataIds,
  };

  // One value per REGION (not per `data` row): orphan data must not influence the scale, and the legend
  // counts regions. Microstates are added AFTER the regions, so the regions' indexes do not change.
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
    // No path (empty geometry): there is nothing to paint.
    if (path == null) return;
    // Without an id it cannot be selected or joined, but it MUST be visible: otherwise there are holes in
    // the map (Kosovo, Northern Cyprus and Somaliland in world-atlas). A non-interactive layer.
    if (entry?.id === undefined) {
      anonymousPaths.push(path);
      return;
    }
    const datum = entry.datum;
    // "Explosion" reveal: regions enter earlier the closer they are to the center (where the click landed).
    let wave: number | undefined;
    if (engine.active && machine.phase === "revealing") {
      const [cx, cy] = toPath.centroid(feature);
      const reach = Math.hypot(width, height) / 2;
      wave =
        Number.isFinite(cx) && Number.isFinite(cy)
          ? Math.min(1, Math.hypot(cx - width / 2, cy - height / 2) / reach)
          : 0;
    }
    const base: Region<TDatum> = {
      id: entry.id,
      feature,
      datum,
      path,
      value: variant.values[index] ?? null,
      formattedValue: variant.labels[index] ?? "",
      fill: variant.fills[index] ?? "",
      wave,
      opacity: undefined,
      className: undefined,
      pattern: undefined,
      classIndex: variant.classes[index] ?? null,
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
    };
    const custom = options.getRegionStyle?.(base);
    regions.push(
      custom === undefined
        ? base
        : {
            ...base,
            fill: custom.fill ?? base.fill,
            opacity: custom.opacity,
            className: custom.className,
            pattern: custom.pattern,
          },
    );
  });
  // Microstates are bubbles in `bubble` (with their coordinates) and loose dots elsewhere.
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

  // ── diagnostics ─────────────────────────────────────────────────────────────────────────────────
  // It is a real effect (it writes to the console and calls an external callback), so it cannot go in
  // render: React may render several times and hover renders on every move. The key makes it run only
  // when the join RESULT changes, not on every render.
  const reportKey = [
    data.length,
    joinReport.unmatchedData.join("\u0001"),
    joinReport.featuresWithoutData.join("\u0001"),
    joinReport.duplicateDataIds.join("\u0001"),
  ].join("\u0000");
  const { onJoinReport, diagnostics = true } = options;
  useEffect(() => {
    // Without geometry (loading) or without data yet, the join means nothing.
    if (status !== "ready") return;
    onJoinReport?.(joinReport);
    if (!diagnostics || isProduction()) return;
    const message = formatJoinDiagnostics({ ...joinReport, dataCount: data.length });
    const levelHint = formatWrongLevelDataHint({
      drillActive: engine.active,
      dataIsSelector: typeof rawOptions.data === "function",
      dataCount: data.length,
      unmatchedCount: joinReport.unmatchedData.length,
      levelId: engine.level?.id ?? null,
    });
    if (message !== null) {
      console.warn(levelHint === null ? message : `${message}\n             ${levelHint}`);
    }
    // Only `reportKey`: the content of `joinReport` is already summarized in it, and re-running on the
    // identity of `onJoinReport` (almost always an inline function) would warn on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey, status]);

  // No region with an id: no datum can join (almost always a `getFeatureId` reading something else).
  const noIdsMessage = formatNoIdsDiagnostic({
    featureCount: features.features.length,
    idCount: regions.length,
    levelId: engine.level?.id ?? null,
    customGetFeatureId: getFeatureId !== undefined,
  });
  useEffect(() => {
    if (status === "ready" && noIdsMessage !== null && diagnostics && !isProduction()) {
      console.warn(noIdsMessage);
    }
  }, [noIdsMessage, status, diagnostics]);

  // ── selection (regions only) ────────────────────────────────────────────────────────────────────
  // Controlled if `selectedId` is passed (even `null`); otherwise the library holds it. Without any of
  // the three props the selection is not active: a click neither selects nor changes the cursor.
  const { onSelectedIdChange } = options;
  const controlled = options.selectedId !== undefined;
  const selectable =
    controlled || options.defaultSelectedId !== undefined || onSelectedIdChange !== undefined;
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    options.defaultSelectedId ?? null,
  );
  const selectedId = controlled ? (options.selectedId ?? null) : internalSelectedId;
  // A selection belongs to ONE level: it is cleared on a level change (a state adjustment during render).
  const [selectionLevel, setSelectionLevel] = useState(engine.shownKey);
  if (selectionLevel !== engine.shownKey) {
    setSelectionLevel(engine.shownKey);
    if (!controlled && internalSelectedId !== null) setInternalSelectedId(null);
  }

  const setSelectedId = (id: string | null) => {
    if (!controlled) setInternalSelectedId(id);
    onSelectedIdChange?.(id);
  };

  // ── interaction ─────────────────────────────────────────────────────────────────────────────────
  const { onItemClick, onItemHover } = options;

  // The colors of what is shown, so the layer that LEAVES on a level change fades out with its color.
  // They are noted after each commit and read in the render in which the level changes.
  const { rememberFills } = engine;
  const drillActive = engine.active;
  useEffect(() => {
    if (drillActive) rememberFills(new Map(regions.map((region) => [region.id, region.fill])));
  });

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

  // Touch: the first tap on a drillable region is a preview (tooltip + selection) and the second, on the
  // same one, drills down (dd.md §11.2.5). `previewed` is the region already previewed; the hover forgets
  // it as soon as the finger goes to something else. (`pointerover` arrives BEFORE `click`, so hover
  // alone cannot tell the 1st from the 2nd.)
  const previewed = useRef<ItemRef | null>(null);

  const hoverItem = (ref: ItemRef | null) => {
    // Without a change there is nothing to report: neither the store nor the consumer find out.
    if (isSameItem(store.getState().hovered, ref)) return;
    if (!isSameItem(previewed.current, ref)) previewed.current = null;
    store.setState({ hovered: ref });
    onItemHover?.(ref === null ? null : (getItemContext(ref) ?? null));
  };

  const clickItem = (ref: ItemRef) => {
    const item = getItemContext(ref);
    if (item === undefined) return;
    if (ref.kind === "region" && item.drillable && engine.controller !== null) {
      // With `drill`, a drillable item DRILLS DOWN (it is not selected); one that is not, selects. The route
      // is built on what is being SHOWN: if the new level is still loading, a second click redirects.
      if (store.getState().pointerType === "touch" && !isSameItem(previewed.current, ref)) {
        hoverItem(ref);
        previewed.current = ref;
        return;
      }
      previewed.current = null;
      engine.noteItem(item);
      engine.controller.drillTo([...engine.shownPath, ref.id]);
    } else if (ref.kind === "region" && selectable) {
      // A click on the selected one deselects it. Points are not selected (their id may coincide with a region's).
      setSelectedId(ref.id === selectedId ? null : ref.id);
    }
    onItemClick?.(item);
  };

  // ── drill closing (step 34) ─────────────────────────────────────────────────────────────────────
  // 1) Intent prefetch: 150 ms over a drillable region → its level's geometry is preloaded and
  //    `onDrillIntent` is notified (for the data). It lives in an effect on the store: hover does not re-render `Root`.
  const { onDrillIntent } = options;
  const intentRef = useRef({ regionsById, shownPath: engine.shownPath, idle: true, onDrillIntent });
  const { prefetch } = engine;
  useEffect(() => {
    intentRef.current = {
      regionsById,
      shownPath: engine.shownPath,
      idle: engine.machine.phase === "idle",
      onDrillIntent,
    };
  });
  useEffect(() => {
    if (!engine.active) return;
    const timer = createIntentTimer({
      onIntent: (id) => {
        const current = intentRef.current;
        if (!current.idle) return; // mid-choreography there is nothing to anticipate
        const path = [...current.shownPath, id];
        prefetch(path);
        current.onDrillIntent?.(contextOf(path));
      },
    });
    const sync = () => {
      const hovered = store.getState().hovered;
      const drillable =
        hovered?.kind === "region" && intentRef.current.regionsById.get(hovered.id)?.drillable;
      timer.hover(hovered !== null && drillable === true ? hovered.id : null);
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    return () => {
      unsubscribe();
      timer.dispose();
    };
  }, [engine.active, store, prefetch]);

  // 2) Is a requested navigation valid? Only what is already loaded can be judged: the part of the route
  //    that matches what is shown. A region of the shown level is also judged with `canDrill` (it has its datum).
  const findRequestProblem = (path: readonly string[]): DrillRequestProblem | null => {
    const shown = engine.shownPath;
    for (let depth = 0; depth < path.length; depth++) {
      if (depth > shown.length || (depth > 0 && path[depth - 1] !== shown[depth - 1])) break;
      const id = path[depth] as string;
      const level = engine.chain[depth];
      const knownIds =
        level === undefined
          ? undefined
          : new Set(level.features.flatMap((feature) => level.idOf(feature) ?? []));
      const problem = checkDrillStep({
        id,
        depth,
        levelId: engine.levels[depth]?.id ?? "?",
        knownIds,
        drillable:
          depth === shown.length && !dataLoading ? regionsById.get(id)?.drillable : undefined,
      });
      if (problem !== null) return problem;
    }
    return null;
  };

  // 3) The handle's drill API. A stable object that always looks at the latest version of the logic.
  const latestDrill = useRef({ findRequestProblem, engine });
  useEffect(() => {
    latestDrill.current = { findRequestProblem, engine };
  });
  const drillApi = useMemo<DrillApi>(() => {
    const refuse = (message: string) => {
      if (!isProduction()) console.warn(message);
      return Promise.resolve({ completed: false });
    };
    const go = (path: readonly string[], source: string) => {
      const { findRequestProblem: find, engine: current } = latestDrill.current;
      if (clampPath(path, current.levels.length).clamped) {
        return refuse(formatTooDeepRequest(path, current.levels.length, source));
      }
      const problem = find(path);
      if (problem !== null) return refuse(formatDrillRequestProblem(problem, source));
      return current.navigate((controller) => controller.drillTo(path));
    };
    return {
      drillDown: (id) => go([...latestDrill.current.engine.target, id], "drillDown()"),
      drillUp: (steps) =>
        latestDrill.current.engine.navigate((controller) => controller.drillUp(steps)),
      drillTo: (path) => go(path, "drillTo()"),
    };
  }, []);
  useEffect(() => {
    if (!engine.active) return;
    store.registerDrill(drillApi);
    return () => store.registerDrill(null);
  }, [engine.active, store, drillApi]);

  // 4) A route that arrives some other way (the URL, someone else's `useDrillDown`) is also checked: here
  //    it only WARNS (the map will do what it can, and if the level comes out empty it will undo it with its own error).
  const targetKey = JSON.stringify(engine.target);
  useEffect(() => {
    if (!engine.active || isProduction()) return;
    const problem = latestDrill.current.findRequestProblem(engine.target);
    if (problem !== null) console.warn(formatDrillRequestProblem(problem, "drill path"));
    // `engine.target` is summarized in `targetKey`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.active, targetKey]);

  // On touch there is no "leave": the browser sends `pointerleave` right when the finger lifts, and it
  // would remove the preview instantly. The hover is withdrawn when tapping outside any item.
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

  // On a level change the projection is another one and the camera must be repositioned BEFORE painting
  // (`useLayoutEffect`: with a normal effect one frame would show the old camera over the new geometry).
  // Without animating or notifying `onViewChange`.
  //  - Down / lateral / jump: identity (the rebase leaves the child at k = 1, exactly where the flight ended).
  //  - Up: the camera that reproduces what was seen (`R` between the two projections); from there it flies
  //    to the one that existed before going down (`use-drill-choreography`).
  const shownKey = engine.shownKey;
  const previousLevel = useRef(shownKey);
  useIsoLayoutEffect(() => {
    if (!engine.active || previousLevel.current === shownKey) return;
    previousLevel.current = shownKey;
    const from = chain?.projections[chain.projections.length - 1];
    const to = previousChain?.projections[previousChain.projections.length - 1];
    const camera =
      machine.direction === "up" && from !== undefined && to !== undefined
        ? relativeTransform(from, to)
        : FIT_TRANSFORM;
    void store.getZoom()?.flyTo(camera, { duration: 0, silent: true });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.active, shownKey, store]);

  // ── camera: ZoomTarget → transform ──────────────────────────────────────────────────────────────
  const zoomOptions = resolveZoomOptions(options.zoom, {
    // With `drill` the click already does something (go down a level): the double click must NOT also zoom
    // ×2, or the second click would interrupt the drill flight and end up as a plain zoom (dd.md §11.1.2).
    clickIsBusy: onItemClick !== undefined || selectable || engine.active,
  });
  const focusBounds = { ...DEFAULT_FOCUS_BOUNDS, ...options.focusBounds };

  /** Pixel bounds of a region's main body (France without Guiana). Lazy. */
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
    // `d3-zoom` only applies `constrain` to gestures, not to programmatic transitions.
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
    drillPhase: engine.active ? machine.phase : null,
    drillFocusId,
    drillLayers,
    drillNav,
    selectContextItem: (depth: number, id: string) => {
      // An item from a context layer: go to that sibling (lateral if it is the level right above, otherwise a jump).
      engine.controller?.drillTo([...engine.shownPath.slice(0, depth), id]);
    },
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

// `useLayoutEffect` warns on the server; there is no camera to reset there.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const NO_GEOGRAPHY: GeographyData = { type: "FeatureCollection", features: [] };
const EMPTY_FEATURES: FeatureCollection = { type: "FeatureCollection", features: [] };
const NO_DATA: readonly never[] = [];

// "No data" color themeable with `--cm-empty-fill`; the value after the comma is the fallback
// if `styles.css` was not loaded.
const EMPTY_FILL_VAR = `var(--cm-empty-fill, ${DEFAULT_EMPTY_FILL})`;

const nameOf = (feature: Feature): string | undefined => {
  const name = (feature.properties as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : undefined;
};

const defaultFeatureId = (feature: Feature): string | undefined =>
  feature.id === undefined ? undefined : String(feature.id);
