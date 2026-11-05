import { scaleQuantile, scaleQuantize } from "d3-scale";

export type Classification =
  | { method: "linear" }
  | { method: "quantize"; classes?: number }
  | { method: "quantile"; classes?: number }
  | { method: "threshold"; thresholds: number[] };

export const DEFAULT_CLASSES = 5;

/**
 * Descarta lo que no es un número usable: `null`, `undefined` y `NaN`/`Infinity`.
 * Va antes de cualquier cálculo estadístico: un solo `NaN` en el array contamina un mínimo, un
 * máximo o un cuantil entero (todos pasarían a ser `NaN`) y el mapa saldría de un solo color.
 * Un `0` SÍ se conserva: es un dato, no una ausencia ("sin dato" ≠ 0).
 */
export const finiteValues = (values: readonly (number | null | undefined)[]): number[] =>
  values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

const assertValidClasses = (classes: number): void => {
  if (!Number.isInteger(classes) || classes < 1) {
    throw new Error(`classify: "classes" debe ser un entero ≥ 1 (recibido: ${classes}).`);
  }
};

/**
 * Calcula los **cortes** entre clases: N clases ⇒ N-1 números ascendentes. Un valor `v` cae en
 * la clase `i` donde `i` es el número de cortes que `v` alcanza o supera, así que un valor
 * justo en el corte pertenece a la clase de ARRIBA (comportamiento de `d3.scaleThreshold`).
 *
 * Devuelve números, no colores, a propósito: separar "qué clases hay" de "de qué color es cada
 * una" permite testear la estadística sin mirar colores, y que la leyenda (paso posterior) use
 * los mismos cortes que el mapa sin recalcularlos.
 *
 * `values` debe venir ya filtrado con `finiteValues`. `domain` es el rango sobre el que se
 * reparte `quantize`; lo decide quien llama (en un mapa divergente es simétrico respecto al
 * punto medio, ver scales.ts).
 */
export const computeThresholds = ({
  values,
  classification,
  domain,
}: {
  values: readonly number[];
  classification: Classification;
  domain: readonly [number, number];
}): number[] => {
  switch (classification.method) {
    case "linear":
      // Escala continua: no hay clases, por tanto no hay cortes.
      return [];

    case "threshold": {
      // Cortes dados por el usuario (p. ej. [0, 5, 10] ⇒ <0, 0–5, 5–10, ≥10). d3 exige orden
      // ascendente y, si no se cumple, no falla: asigna colores equivocados. Es mejor fallar
      // aquí con un mensaje que dejar que el mapa mienta sin avisar.
      const { thresholds } = classification;
      const ascending = thresholds.every(
        (t, i) => Number.isFinite(t) && (i === 0 || t > (thresholds[i - 1] ?? t)),
      );
      if (!ascending) {
        throw new Error(
          `classify: "thresholds" debe ser una lista de números finitos en orden estrictamente ascendente (recibido: [${thresholds.join(", ")}]).`,
        );
      }
      return [...thresholds];
    }

    case "quantize": {
      // Divide el RANGO [min, max] en tramos iguales. Si hay un valor extremo muy alto, casi
      // todos los países caen en las primeras clases: es fiel a la escala pero engañoso con
      // datos muy sesgados (para eso existe quantile).
      const classes = classification.classes ?? DEFAULT_CLASSES;
      assertValidClasses(classes);
      return scaleQuantize<number>()
        .domain([...domain])
        .range(Array.from({ length: classes }, (_, i) => i))
        .thresholds();
    }

    case "quantile": {
      // Reparte los DATOS en grupos con (casi) el mismo número de regiones cada uno. Siempre
      // se usa todo el rango de colores, pero un salto de color puede representar una diferencia
      // pequeña o enorme según dónde caigan los datos. Con muchos valores repetidos (p. ej.
      // muchos ceros) varios cortes coinciden y salen clases vacías: es una limitación conocida.
      const classes = classification.classes ?? DEFAULT_CLASSES;
      assertValidClasses(classes);
      if (values.length === 0) return [];
      return scaleQuantile<number>()
        .domain([...values])
        .range(Array.from({ length: classes }, (_, i) => i))
        .quantiles();
    }
  }
};
