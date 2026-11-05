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
};

export const en: ChoroplethLabels = {
  noData: "No data",
  geographyError: "The map could not be loaded.",
};

export const es: ChoroplethLabels = {
  noData: "Sin dato",
  geographyError: "No se pudo cargar el mapa.",
};

/** Completa los textos que falte con los de inglés. */
export const resolveLabels = (labels?: Partial<ChoroplethLabels>): ChoroplethLabels => ({
  ...en,
  ...labels,
});
