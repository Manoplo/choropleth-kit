import {
  geoAlbers,
  geoBounds,
  geoEqualEarth,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { toFeatureCollection } from "./geography";
import {
  computeAspectRatio,
  createProjection,
  DEFAULT_ASPECT_RATIO,
  rebaseProjection,
  relativeTransform,
  type ProjectionName,
} from "./projection";

const world = toFeatureCollection({
  geography: countries110m as unknown as Topology,
  objectName: "countries",
});

const boundsOf = (name: ProjectionName | undefined, width: number, height: number) => {
  const projection = createProjection({ name, width, height, featureCollection: world });
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(world);
  return { x0, y0, x1, y1, projection };
};

describe("createProjection", () => {
  it.each<ProjectionName>(["equalEarth", "naturalEarth", "mercator"])(
    "%s: the geometry fits the container",
    (name) => {
      const { x0, y0, x1, y1 } = boundsOf(name, 960, 500);
      const tolerance = 1e-6;

      expect(x0).toBeGreaterThanOrEqual(-tolerance);
      expect(y0).toBeGreaterThanOrEqual(-tolerance);
      expect(x1).toBeLessThanOrEqual(960 + tolerance);
      expect(y1).toBeLessThanOrEqual(500 + tolerance);
    },
  );

  it("fits exactly: takes up the full width or the full height", () => {
    const { x0, y0, x1, y1 } = boundsOf("equalEarth", 960, 500);

    const fillsWidth = Math.abs(x1 - x0 - 960) < 1e-6;
    const fillsHeight = Math.abs(y1 - y0 - 500) < 1e-6;
    expect(fillsWidth || fillsHeight).toBe(true);
  });

  it("the scale depends on the container's size", () => {
    const small = boundsOf("equalEarth", 400, 300).projection.scale();
    const large = boundsOf("equalEarth", 1200, 900).projection.scale();

    expect(large).toBeGreaterThan(small);
  });

  it("uses equalEarth by default", () => {
    const byDefault = boundsOf(undefined, 960, 500).projection([10, 40]);
    const explicit = boundsOf("equalEarth", 960, 500).projection([10, 40]);

    expect(byDefault).toEqual(explicit);
  });

  it("each projection gives a different position for the same point", () => {
    const point = [100, 60] as [number, number];
    const equalEarth = boundsOf("equalEarth", 960, 500).projection(point);
    const mercator = boundsOf("mercator", 960, 500).projection(point);

    expect(equalEarth).not.toEqual(mercator);
  });

  it("returns independent instances: fitting one does not move the other", () => {
    const first = createProjection({ width: 960, height: 500, featureCollection: world });
    const scaleBefore = first.scale();

    createProjection({ width: 200, height: 100, featureCollection: world });

    expect(first.scale()).toBe(scaleBefore);
  });

  it("with an empty collection it does not fail and keeps a finite scale", () => {
    const projection = createProjection({
      width: 960,
      height: 500,
      featureCollection: { type: "FeatureCollection", features: [] },
    });

    expect(Number.isFinite(projection.scale())).toBe(true);
  });

  it.each([
    [0, 500],
    [960, 0],
    [-1, 500],
    [NaN, 500],
    [960, Infinity],
  ])("throws an error with size %s × %s", (width, height) => {
    expect(() => createProjection({ width, height, featureCollection: world })).toThrow(
      /finite numbers > 0/,
    );
  });

  it("produces valid SVG paths (no NaN) for all countries", () => {
    const projection = createProjection({ width: 960, height: 500, featureCollection: world });
    const path = geoPath(projection);

    const invalid = world.features.filter((f) => {
      const d = path(f);
      return d === null || d.includes("NaN");
    });
    expect(invalid).toEqual([]);
  });
});

describe("computeAspectRatio", () => {
  const only = (id: string) => ({
    ...world,
    features: world.features.filter((f) => f.id === id),
  });

  it("the world in Equal Earth is landscape, close to 2:1", () => {
    const ratio = computeAspectRatio({ featureCollection: world });

    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it("Chile is much taller than wide; Norway, the other way round", () => {
    expect(computeAspectRatio({ name: "mercator", featureCollection: only("152") })).toBeLessThan(
      1,
    );
    expect(
      computeAspectRatio({ name: "mercator", featureCollection: only("578") }),
    ).toBeGreaterThan(computeAspectRatio({ name: "mercator", featureCollection: only("152") }));
  });

  it("is consistent with what the map takes up when fitted to that size", () => {
    const fc = only("152");
    const ratio = computeAspectRatio({ name: "mercator", featureCollection: fc });
    const { x0, y0, x1, y1 } = (() => {
      const projection = createProjection({
        name: "mercator",
        width: 300,
        height: 300 / ratio,
        featureCollection: fc,
      });
      const [[a, b], [c, d]] = geoPath(projection).bounds(fc);
      return { x0: a, y0: b, x1: c, y1: d };
    })();

    expect((x1 - x0) / (y1 - y0)).toBeCloseTo(ratio, 1);
  });

  it("without features, or with empty geometry, it uses the default ratio", () => {
    expect(
      computeAspectRatio({ featureCollection: { type: "FeatureCollection", features: [] } }),
    ).toBe(DEFAULT_ASPECT_RATIO);
    const empty: typeof world = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [] } },
      ],
    };
    expect(computeAspectRatio({ featureCollection: empty })).toBe(DEFAULT_ASPECT_RATIO);
  });
});

// ── rebase (step 29) ───────────────────────────────────────────────────────────────────────────────

const featureNamed = (name: string) => {
  const found = world.features.find((f) => (f.properties as { name?: string }).name === name);
  if (found === undefined) throw new Error(`no hay ${name} en world-atlas`);
  return found;
};
const spain = featureNamed("Spain");
const france = featureNamed("France");
const padding = { top: 24, right: 24, bottom: 24, left: 24 };

/** [lon, lat] points spread inside `feature`'s bounds (deterministic). */
const pointsIn = (feature: typeof spain, count: number): [number, number][] => {
  const [[w, s], [e, n]] = geoBounds(feature);
  let state = 12345;
  const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: count }, () => [w + next() * (e - w), s + next() * (n - s)]);
};

const factories: [string, () => GeoProjection][] = [
  ["equalEarth", geoEqualEarth],
  ["naturalEarth", geoNaturalEarth1],
  ["mercator", geoMercator],
  ["albers (conic)", geoAlbers],
  ["orthographic", geoOrthographic],
];

const parentOf = (factory: () => GeoProjection, width = 960, height = 500) =>
  factory().fitSize([width, height], world);

describe("relativeTransform", () => {
  it("between a projection and itself it is the identity", () => {
    const p = parentOf(geoEqualEarth);

    expect(relativeTransform(p, p)).toEqual({ k: 1, x: 0, y: 0 });
  });

  it("is the scale + translation affine map that separates the two projections", () => {
    const from = geoMercator().scale(100).translate([10, 20]);
    const to = geoMercator().scale(300).translate([50, -40]);
    const r = relativeTransform(from, to);
    const [fx, fy] = from([5, 7]) as [number, number];
    const [tx, ty] = to([5, 7]) as [number, number];

    expect(r.k).toBe(3);
    expect(fx * r.k + r.x).toBeCloseTo(tx, 9);
    expect(fy * r.k + r.y).toBeCloseTo(ty, 9);
  });
});

describe("rebaseProjection", () => {
  // The test that rules (dd.md §11.2.4): the flight ends at `relative`, and switching to the child
  // projection with an identity camera must paint the SAME pixels. If it fails, the rebase would look like a jump.
  describe.each(factories)("affine equivalence: %s", (_name, factory) => {
    it("child(p) = relative(parent(p)) with error < 1e-6 for 200 points", () => {
      const parent = parentOf(factory);
      const { projection, relative } = rebaseProjection({
        parent,
        factory,
        focus: spain,
        width: 960,
        height: 500,
        padding,
      });

      for (const point of pointsIn(spain, 200)) {
        const p = parent(point) as [number, number];
        const c = projection(point) as [number, number];

        expect(Math.abs(p[0] * relative.k + relative.x - c[0])).toBeLessThan(1e-6);
        expect(Math.abs(p[1] * relative.k + relative.y - c[1])).toBeLessThan(1e-6);
      }
    });
  });

  it("also with the parent's projection rotated and centered (it is inherited)", () => {
    const factory = () => geoMercator();
    const parent = factory().rotate([-20, 5]).center([3, 10]).fitSize([800, 600], world);
    const { projection, relative } = rebaseProjection({
      parent,
      factory,
      focus: france,
      width: 800,
      height: 600,
      padding,
    });

    expect(projection.rotate()).toEqual(parent.rotate());
    expect(projection.center()).toEqual(parent.center());
    for (const point of pointsIn(france, 100)) {
      const p = parent(point) as [number, number];
      const c = projection(point) as [number, number];
      expect(Math.abs(p[0] * relative.k + relative.x - c[0])).toBeLessThan(1e-6);
      expect(Math.abs(p[1] * relative.k + relative.y - c[1])).toBeLessThan(1e-6);
    }
  });

  it("inherits the parallels of a custom conic", () => {
    const factory = () => geoAlbers();
    const parent = factory().parallels([20, 50]).fitSize([960, 500], world);
    const { projection, relative } = rebaseProjection({
      parent,
      factory,
      focus: spain,
      width: 960,
      height: 500,
      padding,
    });

    expect((projection as ReturnType<typeof geoAlbers>).parallels()).toEqual([20, 50]);
    const point = pointsIn(spain, 1)[0] as [number, number];
    const p = parent(point) as [number, number];
    const c = projection(point) as [number, number];
    expect(Math.abs(p[0] * relative.k + relative.x - c[0])).toBeLessThan(1e-6);
  });

  it("also inherits the clipping (clipAngle) and the resampling precision", () => {
    const factory = () => geoOrthographic();
    const parent = factory().clipAngle(60).precision(0.2).fitSize([960, 500], world);
    const { projection } = rebaseProjection({
      parent,
      factory,
      focus: spain,
      width: 960,
      height: 500,
      padding,
    });

    expect(projection.clipAngle()).toBeCloseTo(60, 9);
    expect(projection.precision()).toBeCloseTo(0.2, 9);
  });

  it("the child frames the focus within the padding, filling the limiting side", () => {
    const { projection } = rebaseProjection({
      parent: parentOf(geoEqualEarth),
      factory: geoEqualEarth,
      focus: spain,
      width: 960,
      height: 500,
      padding,
    });
    const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(spain);
    const tol = 1e-6;

    expect(x0).toBeGreaterThanOrEqual(24 - tol);
    expect(y0).toBeGreaterThanOrEqual(24 - tol);
    expect(x1).toBeLessThanOrEqual(960 - 24 + tol);
    expect(y1).toBeLessThanOrEqual(500 - 24 + tol);
    const fillsWidth = Math.abs(x1 - x0 - (960 - 48)) < 1e-6;
    const fillsHeight = Math.abs(y1 - y0 - (500 - 48)) < 1e-6;
    expect(fillsWidth || fillsHeight).toBe(true);
  });

  it("zooms in: the relative `k` is > 1 when focusing a country within the world", () => {
    const { relative } = rebaseProjection({
      parent: parentOf(geoEqualEarth),
      factory: geoEqualEarth,
      focus: spain,
      width: 960,
      height: 500,
      padding,
    });

    expect(relative.k).toBeGreaterThan(5);
  });

  it("does not modify the parent's projection", () => {
    const parent = parentOf(geoEqualEarth);
    const before = {
      scale: parent.scale(),
      translate: parent.translate(),
      rotate: parent.rotate(),
    };
    rebaseProjection({
      parent,
      factory: geoEqualEarth,
      focus: spain,
      width: 960,
      height: 500,
      padding,
    });

    expect({
      scale: parent.scale(),
      translate: parent.translate(),
      rotate: parent.rotate(),
    }).toEqual(before);
  });

  it("chaining two rebases is still affine: R_total = R2 ∘ R1", () => {
    const root = parentOf(geoEqualEarth);
    const one = rebaseProjection({
      parent: root,
      factory: geoEqualEarth,
      focus: spain,
      width: 960,
      height: 500,
      padding,
    });
    const two = rebaseProjection({
      parent: one.projection,
      factory: geoEqualEarth,
      focus: france,
      width: 960,
      height: 500,
      padding,
    });
    const point: [number, number] = [2.3, 48.8];
    const r = relativeTransform(root, two.projection);
    const p = root(point) as [number, number];
    const c = two.projection(point) as [number, number];
    const composed = [
      (p[0] * one.relative.k + one.relative.x) * two.relative.k + two.relative.x,
      (p[1] * one.relative.k + one.relative.y) * two.relative.k + two.relative.y,
    ];

    expect(composed[0]).toBeCloseTo(c[0], 6);
    expect(composed[1]).toBeCloseTo(c[1], 6);
    expect(p[0] * r.k + r.x).toBeCloseTo(c[0], 6);
  });

  it("invalid size or focus with no extent: a clear error in English", () => {
    const parent = parentOf(geoEqualEarth);
    const base = { parent, factory: geoEqualEarth, focus: spain, padding };

    expect(() => rebaseProjection({ ...base, width: 0, height: 500 })).toThrow(
      /\[choropleth\] rebaseProjection/,
    );
    expect(() => rebaseProjection({ ...base, width: 960, height: NaN })).toThrow(
      /rebaseProjection/,
    );
    expect(() =>
      rebaseProjection({
        ...base,
        focus: { type: "Point", coordinates: [0, 0] },
        width: 960,
        height: 500,
      }),
    ).toThrow(/no extent/);
  });
});
