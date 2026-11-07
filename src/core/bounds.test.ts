import type { Feature, Polygon } from "geojson";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { getAnchorPoint, getFocusExtent, getFocusGeometry, projectBounds } from "./bounds";

// Ring in CLOCKWISE order: it is what d3-geo expects (RFC 7946 asks for counterclockwise; see dd.md §2.9).
// With the opposite order d3 would interpret "the whole globe minus the square".
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
  const corsica = square(10.5, 44, 11.5, 45); // near the main body
  const guiana = square(-55, 3, -52, 5); // very far away

  it("keeps the main body and what is near it, and discards the distant territories", () => {
    const focus = getFocusGeometry({ feature: multi(mainland, corsica, guiana), path });

    expect(focus).toEqual({ type: "MultiPolygon", coordinates: [mainland, corsica] });
  });

  it("does not depend on the order of the polygons", () => {
    const focus = getFocusGeometry({ feature: multi(guiana, corsica, mainland), path });

    expect(focus).toEqual({ type: "MultiPolygon", coordinates: [corsica, mainland] });
  });

  it("if only one survives, it returns a Polygon", () => {
    const focus = getFocusGeometry({ feature: multi(mainland, guiana), path });

    expect(focus).toEqual({ type: "Polygon", coordinates: mainland });
  });

  it("`near` adjusts how close counts as near", () => {
    const feature = multi(mainland, corsica);

    expect(getFocusGeometry({ feature, path, near: 0.01 })?.type).toBe("Polygon");
    expect(getFocusGeometry({ feature, path, near: 5 })?.type).toBe("MultiPolygon");
  });

  it("returns as is whatever is not a MultiPolygon, and null if there is no geometry", () => {
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

  it("if nothing can be measured, it returns the whole geometry instead of failing", () => {
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
  // A "U": its centroid falls in the gap, OUTSIDE the polygon.
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

  it("falls inside the polygon even when the centroid falls outside", () => {
    const geoCentroid = geoPath(geoNaturalEarth1()).centroid;
    expect(geoCentroid).toBeTypeOf("function"); // reference: the method being replaced

    const anchor = getAnchorPoint({ geometry: u, project: identity, precision: 0.1 });

    expect(anchor).not.toBeNull();
    expect(insideU(anchor as [number, number])).toBe(true);
  });

  it("picks the largest projected polygon of a MultiPolygon", () => {
    const geometry = {
      type: "MultiPolygon" as const,
      coordinates: [square(0, 0, 1, 1), square(100, 100, 120, 120)],
    };

    const [x, y] = getAnchorPoint({ geometry, project: identity, precision: 0.1 }) ?? [0, 0];

    expect(x).toBeGreaterThan(100);
    expect(y).toBeGreaterThan(100);
  });

  it("ignores vertices that cannot be projected, and returns null if nothing remains", () => {
    const polygon: Polygon = { type: "Polygon", coordinates: square(0, 0, 10, 10) };

    const partial = getAnchorPoint({
      geometry: polygon,
      project: (p) => (p[0] === 10 && p[1] === 10 ? null : p),
      precision: 0.1,
    });
    expect(partial).not.toBeNull();

    expect(getAnchorPoint({ geometry: polygon, project: () => null })).toBeNull();
  });

  it("null without geometry or with one that is not a polygon", () => {
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

  it("contains all the points of the geographic rectangle (corners too)", () => {
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

  it("parallels curve: the box is somewhat larger than the four corners' one", () => {
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

  it("if lonE < lonW it crosses the antimeridian: the wider half is framed (Fiji)", () => {
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

    // Fiji is 7° wide spread over both edges of the map: it keeps the larger half (175 → 180),
    // instead of a box as wide as the world. The "normal" −178 → 175 does span almost the whole world.
    expect(fiji[1][0] - fiji[0][0]).toBeLessThan(80);
    expect(fiji[0][0]).toBeGreaterThan(800); // on the right edge
    expect(wide[1][0] - wide[0][0]).toBeGreaterThan(800);
    // and if the larger half is the western one, that one is chosen
    const flipped = projectBounds(
      [
        [179, -20],
        [-170, -15],
      ],
      project,
    ) as [[number, number], [number, number]];
    expect(flipped[1][0]).toBeLessThan(160); // left edge
  });

  it("ignores the points that do not project and returns null if none project", () => {
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

  it("a normal polygon: its exact bounds in pixels", () => {
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

  it("ignores the distant territories (same as getFocusGeometry)", () => {
    const fr = multi(square(0, 40, 10, 50), square(-55, 3, -52, 5));
    const extent = getFocusExtent({ feature: fr, path: focusPath, project }) as [
      [number, number],
      [number, number],
    ];

    const guiana = project([-54, 4]) as [number, number];
    expect(extent[0][0]).toBeGreaterThan(guiana[0]); // Guiana is left out
  });

  it("crossing the antimeridian (Russia): frames the larger half, NOT the map from edge to edge", () => {
    // A ring from 160° to −170° (30° wide): 20° east of the line, 10° west.
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

    // `path.bounds` measures both halves: it spans almost the whole width of the map…
    expect(naive[1][0] - naive[0][0]).toBeGreaterThan(700);
    // …and the framing keeps the eastern half (160° → 180°), on the right edge
    expect(extent[1][0] - extent[0][0]).toBeLessThan(200);
    expect(extent[0][0]).toBeGreaterThan(700);
  });

  it("without geometry or with non-finite bounds, it returns null", () => {
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
