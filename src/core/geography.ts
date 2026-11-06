// Solo tipos: `import type` se borra por completo al compilar (verbatimModuleSyntax lo exige).
// Impacto real: estos dos imports NO aparecen en dist/core.js, así que `@types/geojson` y
// `@types/topojson-specification` no cuestan ni un byte de runtime.
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
// Único import con código real de este archivo. Importamos solo `feature` (no `mesh`, no `merge`):
// el bundler (tsup) puede descartar el resto de topojson-client y el consumidor solo descarga lo que usamos.
import { feature } from "topojson-client";

/** Geometría ya cargada. */
export type GeographyData = Topology | FeatureCollection;

/**
 * Lo que acepta la prop `geography` (dd.md §9.2): el dato, una promesa ya en vuelo, o una función
 * que lo carga bajo demanda (`() => import("…/world-110m")`; vale el módulo entero con `default`).
 */
export type GeographyInput =
  | GeographyData
  | Promise<GeographyData | { default: GeographyData }>
  | (() => Promise<GeographyData | { default: GeographyData }>);

/** Un módulo ES (`import()`) trae la geometría en `default`. */
export const unwrapGeography = (
  value: GeographyData | { default: GeographyData },
): GeographyData => ("default" in value ? value.default : value);

export type ToFeatureCollectionOptions = {
  geography: Topology | FeatureCollection;
  /**
   * Qué objeto de la topología usar (p. ej. "countries" o "land" en world-atlas).
   * Se ignora si `geography` ya es GeoJSON.
   */
  objectName?: string;
};

/**
 * Punto de entrada único de los geodatos: acepta TopoJSON o GeoJSON y devuelve SIEMPRE un
 * `FeatureCollection`. Todo lo que viene después (join con los datos, proyección, rutas SVG) puede
 * asumir esa forma y no volver a preguntarse "¿qué formato me han dado?".
 *
 * Es una función pura y síncrona: no hace fetch. La carga diferida (`() => import(...)`) de
 * `GeographyInput` se resolverá en la capa React; aquí ya llega el dato resuelto.
 */
export const toFeatureCollection = ({
  geography,
  objectName,
}: ToFeatureCollectionOptions): FeatureCollection => {
  // ── PASO 1: distinguir el formato. Tiene que ser lo PRIMERO. ──────────────────────────────────
  // Por qué va primero: los dos formatos tienen formas incompatibles. Un Topology guarda
  // `objects` + `arcs`; un FeatureCollection guarda `features`. Si llamáramos a `feature()` de
  // topojson-client con un GeoJSON, fallaría con un error interno críptico
  // ("Cannot read properties of undefined (reading 'arcs')") lejos de la causa real.
  // Decidir aquí, con el campo discriminante `type`, nos permite dar un error claro o un atajo.
  //
  // Se lee `type` como `unknown` a propósito: en runtime llegan JSON de fuera (fetch, import) que
  // TypeScript no puede garantizar, así que la comprobación tiene que ser real y no solo de tipos.
  const kind: unknown = (geography as { type?: unknown } | null)?.type;

  // ── PASO 2: atajo para GeoJSON. Va ANTES de tocar nada de TopoJSON. ───────────────────────────
  // Se devuelve el MISMO objeto, sin copiarlo. Impacto real: más adelante las rutas SVG se
  // memoizarán con `useMemo` usando este objeto como dependencia. Si aquí clonáramos, cada render
  // produciría una referencia nueva, `useMemo` creería que la geometría cambió y recalcularía los
  // ~177 paths de `geoPath` en cada render (en un hover, por ejemplo). Devolver la misma referencia
  // es lo que permite el criterio de aceptación "cambiar de indicador no recalcula rutas".
  if (kind === "FeatureCollection") {
    return geography as FeatureCollection;
  }

  // Cualquier otra cosa que no sea Topology es un error del llamador: se corta aquí, antes de
  // buscar objetos, para que el mensaje diga lo que realmente pasó.
  if (kind !== "Topology") {
    throw new Error(
      `[choropleth] toFeatureCollection: unrecognized format (type = ${JSON.stringify(kind)}). ` +
        `Expected a "Topology" (TopoJSON) or a "FeatureCollection" (GeoJSON).`,
    );
  }

  const topology = geography as Topology;

  // ── PASO 3: elegir el objeto de la topología. Va DESPUÉS de saber que es Topology. ────────────
  // Un TopoJSON puede contener varias capas (world-atlas trae `countries` y `land`). Pintar la
  // equivocada daría un mapa de un solo polígono continental sin ningún id por el que cruzar los
  // datos. Si el usuario no dice cuál, usamos la primera: es lo que hace `dd.md §9.2`.
  const availableNames = Object.keys(topology.objects);
  const name = objectName ?? availableNames[0];

  // `noUncheckedIndexedAccess` nos obliga a contemplar `undefined`; aquí lo convertimos en un error
  // que lista las opciones, en lugar de dejar que `feature()` reciba `undefined` y falle más tarde.
  const object = name === undefined ? undefined : topology.objects[name];
  if (name === undefined || object === undefined) {
    throw new Error(
      `[choropleth] toFeatureCollection: object "${objectName ?? "(none)"}" does not exist in the topology. ` +
        `Available objects: ${availableNames.length > 0 ? availableNames.join(", ") : "(none)"}.`,
    );
  }

  // ── PASO 4: convertir. Solo aquí, con formato y objeto ya validados. ──────────────────────────
  // `feature()` hace el trabajo caro y no trivial: recorre los arcos compartidos, deshace la
  // cuantización/delta-encoding (`transform`) y reconstruye las coordenadas lon/lat reales.
  // Impacto real: es lo que convierte un archivo de ~100 KB (fronteras guardadas una sola vez) en
  // la geometría completa que `geoPath` sabe dibujar.
  const converted = feature(topology, object);

  // ── PASO 5: normalizar el resultado. Va ÚLTIMO porque depende de lo que devolvió `feature()`. ─
  // `feature()` devuelve cosas distintas según el objeto: un `GeometryCollection` produce un
  // FeatureCollection, pero un objeto de una sola geometría (p. ej. `land` en world-atlas, que es
  // un único MultiPolygon) produce un Feature suelto. Si lo devolviéramos tal cual, el tipo de
  // retorno mentiría y `.features.map(...)` en el render rompería solo con algunos geodatos.
  // Envolverlo garantiza que el resto del código solo tiene que conocer una forma.
  if (converted.type === "FeatureCollection") {
    return converted as FeatureCollection<Geometry>;
  }
  return { type: "FeatureCollection", features: [converted] };
};
