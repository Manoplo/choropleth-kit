/**
 * The library's UI texts (i18n). English by default; `es` for Spanish. Each phase adds its own
 * (`drillHint`, `breadcrumbRoot`…). Console messages do NOT go through here: they are for the
 * developer and are always in English.
 */
export type ChoroplethLabels = {
  /** Region without data: tooltip and legend. */
  noData: string;
  /** The asynchronous geometry could not be loaded. */
  geographyError: string;
  /** Zoom buttons (`aria-label`). */
  zoomIn: string;
  zoomOut: string;
  resetView: string;
  /** Hint for `wheel: "cooperative"`. The `Mac` variant is used on macOS and iOS (⌘ instead of Ctrl). */
  gestureHintWheel: string;
  gestureHintWheelMac: string;
  gestureHintTouch: string;
  /** Drill-down: `aria-label` of the breadcrumbs' `<nav>`, its root (if the first level has no `label`), the "←" button and the tooltip hint. */
  breadcrumb: string;
  breadcrumbRoot: string;
  drillUp: string;
  drillHint: string;
  /** Touch: the tooltip hint after the first tap (the second one drills down). */
  tapAgainHint: string;
};

export const en: ChoroplethLabels = {
  noData: "No data",
  geographyError: "The map could not be loaded.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetView: "Reset view",
  gestureHintWheel: "Use Ctrl + scroll to zoom",
  gestureHintWheelMac: "Use ⌘ + scroll to zoom",
  gestureHintTouch: "Use two fingers to move the map",
  breadcrumb: "Breadcrumb",
  breadcrumbRoot: "All",
  drillUp: "Up one level",
  drillHint: "Click to see regions",
  tapAgainHint: "Tap again to enter",
};

export const es: ChoroplethLabels = {
  noData: "Sin dato",
  geographyError: "No se pudo cargar el mapa.",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  resetView: "Restablecer vista",
  gestureHintWheel: "Usa Ctrl + rueda para hacer zoom",
  gestureHintWheelMac: "Usa ⌘ + rueda para hacer zoom",
  gestureHintTouch: "Usa dos dedos para mover el mapa",
  breadcrumb: "Ruta de navegación",
  breadcrumbRoot: "Todo",
  drillUp: "Subir un nivel",
  drillHint: "Clic para ver regiones",
  tapAgainHint: "Toca de nuevo para entrar",
};

/** Fills in any missing texts with the English ones. */
export const resolveLabels = (labels?: Partial<ChoroplethLabels>): ChoroplethLabels => ({
  ...en,
  ...labels,
});
