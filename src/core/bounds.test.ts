import type { Feature, Polygon } from "geojson";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { getAnchorPoint, getFocusExtent, getFocusGeometry, projectBounds } from "./bounds";

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

describe("projectBounds", () => {
  const projection = geoNaturalEarth1().fitExtent(
    [
      [0, 0],
      [960, 500],
    ],
    { type: "Sphere" },
  );
  const project = (c: readonly [number, number]) => {
    const at = projection([c[0], c[1]]);
    return at === null ? null : ([at[0], at[1]] as [number, number]);
  };

  it("contiene todos los puntos del rectángulo geográfico (también las esquinas)", () => {
    const extent = projectBounds(
      [
        [-10, 35],
        [5, 45],
      ],
      project,
    );

    expect(extent).not.toBeNull();
    const [[x0, y0], [x1, y1]] = extent as [[number, number], [number, number]];
    for (const corner of [
      [-10, 35],
      [5, 35],
      [-10, 45],
      [5, 45],
      [-2.5, 40],
    ] as const) {
      const [px, py] = project(corner) as [number, number];
      expect(px).toBeGreaterThanOrEqual(x0 - 1e-9);
      expect(px).toBeLessThanOrEqual(x1 + 1e-9);
      expect(py).toBeGreaterThanOrEqual(y0 - 1e-9);
      expect(py).toBeLessThanOrEqual(y1 + 1e-9);
    }
  });

  it("los paralelos se curvan: la caja es algo más grande que la de las cuatro esquinas", () => {
    const extent = projectBounds(
      [
        [-80, -50],
        [80, 70],
      ],
      project,
    ) as [[number, number], [number, number]];
    const corners = [
      [-80, -50],
      [80, -50],
      [-80, 70],
      [80, 70],
    ].map((c) => project(c as [number, number]) as [number, number]);
    const cornerYs = corners.map(([, y]) => y);

    expect(extent[0][1]).toBeLessThanOrEqual(Math.min(...cornerYs));
    expect(extent[1][1]).toBeGreaterThanOrEqual(Math.max(...cornerYs));
  });

  it("si lonE < lonO cruza el antimeridiano: se encuadra la mitad más ancha (Fiyi)", () => {
    const fiji = projectBounds(
      [
        [175, -20],
        [-178, -15],
      ],
      project,
    ) as [[number, number], [number, number]];
    const wide = projectBounds(
      [
        [-178, -20],
        [175, -15],
      ],
      project,
    ) as [[number, number], [number, number]];

    // Fiyi son 7° de ancho repartidos en los dos bordes del mapa: se queda con la mitad mayor (175 → 180),
    // en lugar de una caja del ancho del mundo. La «normal» −178 → 175 sí abarca casi todo el mundo.
    expect(fiji[1][0] - fiji[0][0]).toBeLessThan(80);
    expect(fiji[0][0]).toBeGreaterThan(800); // en el borde derecho
    expect(wide[1][0] - wide[0][0]).toBeGreaterThan(800);
    // y si la mitad mayor es la occidental, se elige esa
    const flipped = projectBounds(
      [
        [179, -20],
        [-170, -15],
      ],
      project,
    ) as [[number, number], [number, number]];
    expect(flipped[1][0]).toBeLessThan(160); // borde izquierdo
  });

  it("ignora los puntos que no proyectan y devuelve null si ninguno proyecta", () => {
    const partial = projectBounds(
      [
        [0, 0],
        [10, 10],
      ],
      (c) => (c[0] > 5 ? null : ([c[0], c[1]] as [number, number])),
    );
    expect(partial).not.toBeNull();
    expect(
      projectBounds(
        [
          [0, 0],
          [10, 10],
        ],
        () => null,
      ),
    ).toBeNull();
  });
});

describe("getFocusExtent", () => {
  const projection = geoNaturalEarth1().fitExtent(
    [
      [0, 0],
      [960, 500],
    ],
    { type: "Sphere" },
  );
  const focusPath = geoPath(projection);
  const project = (c: readonly [number, number]) => {
    const at = projection([c[0], c[1]]);
    return at === null ? null : ([at[0], at[1]] as [number, number]);
  };
  const polygonFeature = (ring: [number, number][]): Feature => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  });

  it("un polígono normal: sus límites exactos en píxeles", () => {
    const feature = polygonFeature([
      [0, 40],
      [0, 50],
      [10, 50],
      [10, 40],
      [0, 40],
    ]);
    const extent = getFocusExtent({ feature, path: focusPath, project });

    expect(extent).toEqual(focusPath.bounds(feature.geometry as never));
  });

  it("ignora los territorios lejanos (igual que getFocusGeometry)", () => {
    const fr = multi(square(0, 40, 10, 50), square(-55, 3, -52, 5));
    const extent = getFocusExtent({ feature: fr, path: focusPath, project }) as [
      [number, number],
      [number, number],
    ];

    const guiana = project([-54, 4]) as [number, number];
    expect(extent[0][0]).toBeGreaterThan(guiana[0]); // la Guayana queda fuera
  });

  it("cruzando el antimeridiano (Rusia): encuadra la mitad mayor, NO el mapa de borde a borde", () => {
    // Un anillo de 160° a −170° (30° de ancho): 20° al este de la línea, 10° al oeste.
    const russiaLike = polygonFeature([
      [160, 60],
      [160, 70],
      [-170, 70],
      [-170, 60],
      [160, 60],
    ]);
    const naive = focusPath.bounds(russiaLike.geometry as never);
    const extent = getFocusExtent({ feature: russiaLike, path: focusPath, project }) as [
      [number, number],
      [number, number],
    ];

    // `path.bounds` mide las dos mitades: abarca casi todo el ancho del mapa…
    expect(naive[1][0] - naive[0][0]).toBeGreaterThan(700);
    // …y el encuadre se queda con la mitad oriental (160° → 180°), en el borde derecho
    expect(extent[1][0] - extent[0][0]).toBeLessThan(200);
    expect(extent[0][0]).toBeGreaterThan(700);
  });

  it("sin geometría o con límites no finitos, devuelve null", () => {
    const empty: Feature = { type: "Feature", properties: {}, geometry: null as never };
    expect(getFocusExtent({ feature: empty, path: focusPath, project })).toBeNull();

    const nothing = {
      area: () => NaN,
      bounds: () => [
        [NaN, NaN],
        [NaN, NaN],
      ],
    } as never;
    const feature = polygonFeature([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ]);
    expect(getFocusExtent({ feature, path: nothing, project })).toBeNull();
  });
});
