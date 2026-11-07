/**
 * Textos de UI de la librería (i18n). Inglés por defecto; `es` para español. Cada fase añade los
 * suyos (`drillHint`, `breadcrumbRoot`…). Los mensajes de consola NO pasan por aquí: son para el
 * desarrollador y van siempre en inglés.
 */
export type ChoroplethLabels = {
  /** Región sin dato: tooltip y leyenda. */
  noData: string;
  /** La geometría asíncrona no se pudo cargar. */
  geographyError: string;
  /** Botones de zoom (`aria-label`). */
  zoomIn: string;
  zoomOut: string;
  resetView: string;
  /** Aviso de `wheel: "cooperative"`. La variante `Mac` se usa en macOS e iOS (⌘ en vez de Ctrl). */
  gestureHintWheel: string;
  gestureHintWheelMac: string;
  gestureHintTouch: string;
  /** Drill-down: `aria-label` del `<nav>` de las migas, su raíz (si el primer nivel no tiene `label`), el botón «←» y la pista del tooltip. */
  breadcrumb: string;
  breadcrumbRoot: string;
  drillUp: string;
  drillHint: string;
  /** Táctil: la pista del tooltip tras el primer toque (el segundo baja). */
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

/** Completa los textos que falte con los de inglés. */
export const resolveLabels = (labels?: Partial<ChoroplethLabels>): ChoroplethLabels => ({
  ...en,
  ...labels,
});
