import type { Feature, Polygon } from "geojson";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { getAnchorPoint, getFocusGeometry } from "./bounds";

// Anillo en sentido HORARIO: es lo que espera d3-geo (RFC 7946 pide antihorario; ver dd.md §2.9).
// Con el sentido contrario d3 interpretaría «todo el globo menos el cuadrado».
const square = (lon0: number, lat0: number, lon1: number, lat1: number): Polygon["coordinates"] => [
  [
    [lon0, lat0],
    [lon0, lat1],
    [lon1, lat1],
    [lon1, lat0],
    [lon0, lat0],
  ],
];

const multi = (...polygons: Polygon["coordinates"][]): Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "MultiPolygon", coordinates: polygons },
});

const path = geoPath(geoNaturalEarth1());

describe("getFocusGeometry", () => {
  const mainland = square(0, 40, 10, 50);
  const corsica = square(10.5, 44, 11.5, 45); // cerca del cuerpo principal
  const guiana = square(-55, 3, -52, 5); // lejísimos

  it("conserva el cuerpo principal y lo cercano, y descarta los territorios lejanos", () => {
    const focus = getFocusGeometry({ feature: multi(mainland, corsica, guiana), path });

    expect(focus).toEqual({ type: "MultiPolygon", coordinates: [mainland, corsica] });
  });

  it("no depende del orden de los polígonos", () => {
    const focus = getFocusGeometry({ feature: multi(guiana, corsica, mainland), path });

    expect(focus).toEqual({ type: "MultiPolygon", coordinates: [corsica, mainland] });
  });

  it("si solo sobrevive uno, devuelve un Polygon", () => {
    const focus = getFocusGeometry({ feature: multi(mainland, guiana), path });

    expect(focus).toEqual({ type: "Polygon", coordinates: mainland });
  });

  it("`near` ajusta cuánto se considera cerca", () => {
    const feature = multi(mainland, corsica);

    expect(getFocusGeometry({ feature, path, near: 0.01 })?.type).toBe("Polygon");
    expect(getFocusGeometry({ feature, path, near: 5 })?.type).toBe("MultiPolygon");
  });

  it("devuelve tal cual lo que no es un MultiPolygon, y null si no hay geometría", () => {
    const polygon: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: mainland },
    };
    expect(getFocusGeometry({ feature: polygon, path })).toBe(polygon.geometry);

    const point: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [0, 0] },
    };
    expect(getFocusGeometry({ feature: point, path })).toBe(point.geometry);

    expect(getFocusGeometry({ feature: { ...polygon, geometry: null as never }, path })).toBeNull();
  });

  it("si nada se puede medir, devuelve la geometría entera en vez de fallar", () => {
    const nothingMeasurable = {
      area: () => NaN,
      bounds: () => [
        [NaN, NaN],
        [NaN, NaN],
      ],
    };
    const feature = multi(mainland, guiana);

    expect(getFocusGeometry({ feature, path: nothingMeasurable as never })).toBe(feature.geometry);
  });
});

describe("getAnchorPoint", () => {
  const identity = (p: readonly [number, number]) => p;
  // Una «U»: su centroide cae en el hueco, FUERA del polígono.
  const u: Polygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [7, 10],
        [7, 3],
        [3, 3],
        [3, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  };
  const insideU = ([x, y]: readonly [number, number]) =>
    x >= 0 && x <= 10 && y >= 0 && y <= 10 && !(x > 3 && x < 7 && y > 3);

  it("cae dentro del polígono aunque el centroide caiga fuera", () => {
    const geoCentroid = geoPath(geoNaturalEarth1()).centroid;
    expect(geoCentroid).toBeTypeOf("function"); // referencia: el método que se sustituye

    const anchor = getAnchorPoint({ geometry: u, project: identity, precision: 0.1 });

    expect(anchor).not.toBeNull();
    expect(insideU(anchor as [number, number])).toBe(true);
  });

  it("elige el polígono proyectado más grande de un MultiPolygon", () => {
    const geometry = {
      type: "MultiPolygon" as const,
      coordinates: [square(0, 0, 1, 1), square(100, 100, 120, 120)],
    };

    const [x, y] = getAnchorPoint({ geometry, project: identity, precision: 0.1 }) ?? [0, 0];

    expect(x).toBeGreaterThan(100);
    expect(y).toBeGreaterThan(100);
  });

  it("ignora vértices que no se pueden proyectar, y devuelve null si no queda nada", () => {
    const polygon: Polygon = { type: "Polygon", coordinates: square(0, 0, 10, 10) };

    const partial = getAnchorPoint({
      geometry: polygon,
      project: (p) => (p[0] === 10 && p[1] === 10 ? null : p),
      precision: 0.1,
    });
    expect(partial).not.toBeNull();

    expect(getAnchorPoint({ geometry: polygon, project: () => null })).toBeNull();
  });

  it("null sin geometría o con una que no es un polígono", () => {
    expect(getAnchorPoint({ geometry: null, project: identity })).toBeNull();
    expect(
      getAnchorPoint({ geometry: { type: "Point", coordinates: [0, 0] }, project: identity }),
    ).toBeNull();
  });
});
