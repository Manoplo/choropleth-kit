import type { Topology } from "topojson-specification";
import world from "./world-110m.json";

/**
 * Mundo a 1:110m (Natural Earth, dominio público) en TopoJSON, con **ISO 3166-1 alpha-2 en `id`**
 * (`"ES"`) y el nombre en inglés en `properties.name`. Usa el objeto `countries`.
 *
 * Es `world-atlas` con los ids convertidos (ver `scripts/build-geo/build-world-110m.mjs`), más
 * Kosovo como `"XK"`. Chipre del Norte y Somalilandia siguen sin id: se pintan como capa no
 * interactiva. A esta escala faltan los microestados: usa `worldFallbackPoints`.
 *
 * ⚠️ Las fronteras disputadas (Sáhara Occidental, Crimea, Cachemira…) son las de Natural Earth.
 * Valídalas con Legal/Comunicación antes de mostrar un mapa (dd.md §6.2).
 */
export const world110m = world as unknown as Topology;

export { isoNumericToAlpha2 } from "./iso-numeric-to-alpha2";
export { worldFallbackPoints } from "./fallback-points";
