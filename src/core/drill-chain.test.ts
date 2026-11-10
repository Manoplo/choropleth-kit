import type { Feature } from "geojson";
import { geoPath } from "d3-geo";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { getFocusGeometry } from "./bounds";
import { buildProjectionChain, type ChainLevel } from "./drill-chain";
import { toFeatureCollection } from "./geography";
import { relativeTransform } from "./projection";

const world = toFeatureCollection({
  geography: countries110m as unknown as Topology,
  objectName: "countries",
});
const nameOf = (f: Feature) => (f.properties as { name?: string }).name;
const pick = (...names: string[]) => world.features.filter((f) => names.includes(nameOf(f) ?? ""));

const worldLevel: ChainLevel = { features: world.features, idOf: nameOf };
const france = pick("France");
const size = { width: 960, height: 500 };

/** Where [lon, lat] falls in a projection, checking that it is finite. */
const at = (projection: unknown, point: [number, number]): [number, number] => {
  const p = (projection as (q: [number, number]) => [number, number] | null)(point);
  if (p === null || !p.every(Number.isFinite)) throw new Error(`no proyecta ${point}`);
  return p;
};

describe("antimeridiano (Rusia, Fiyi)", () => {
  const frame = (name: string) => {
    const feature = pick(name)[0] as Feature;
    return buildProjectionChain({
      levels: [worldLevel, { features: [feature], idOf: nameOf }],
      path: [name],
      ...size,
      padding: 24,
    });
  };

  it("Russia: its wider half is framed (Moscow and the Pacific coast fit; the whole world does not show up)", () => {
    const { projections, missing } = frame("Russia");
    const [mx, my] = at(projections[1], [37.6, 55.7]); // Moscow
    const [vx, vy] = at(projections[1], [131.9, 43.1]); // Vladivostok

    expect(missing).toBeNull();
    for (const v of [mx, vx]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(960);
    }
    for (const v of [my, vy]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(500);
    }
    // The scale is that of "Russia fills the view", not the world's (which would be ~1/3 of this).
    expect((projections[1]?.scale() ?? 0) / (projections[0]?.scale() ?? 1)).toBeGreaterThan(1.8);
  });

  it("Fiji: a reasonable scale (not that of a 128,000 px world)", () => {
    const { projections } = frame("Fiji");

    expect(projections[1]?.scale()).toBeLessThan((projections[0]?.scale() ?? 1) * 400);
    const [x, y] = at(projections[1], [178, -17.8]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(960);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(500);
  });

  it("`focusBounds` that cross the antimeridian also use the wider half", () => {
    const { projections } = buildProjectionChain({
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Fiji"],
      ...size,
      focusBounds: {
        Fiji: [
          [177, -20],
          [-178, -16],
        ],
      },
    });

    expect(projections[1]?.scale()).toBeLessThan((projections[0]?.scale() ?? 1) * 400);
  });
});

describe("buildProjectionChain", () => {
  it("at the root there is a single projection, fitted to the world", () => {
    const { projections, missing } = buildProjectionChain({
      levels: [worldLevel],
      path: [],
      ...size,
    });
    const [[x0, y0], [x1, y1]] = geoPath(projections[0]).bounds(world);

    expect(projections).toHaveLength(1);
    expect(missing).toBeNull();
    expect(x0).toBeGreaterThanOrEqual(-1e-6);
    expect(x1).toBeLessThanOrEqual(960 + 1e-6);
    expect(y1 - y0).toBeGreaterThan(400);
  });

  it("one level down: the region's projection frames its main body with padding", () => {
    const { projections } = buildProjectionChain({
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Spain"],
      ...size,
      padding: 24,
    });
    const [[x0, y0], [x1, y1]] = geoPath(projections[1]).bounds(pick("Spain")[0] as Feature);

    // Not with the Canary Islands (by default there is no focusBounds here): the main body is the peninsula.
    expect(projections).toHaveLength(2);
    expect(x0).toBeGreaterThanOrEqual(24 - 1);
    expect(y0).toBeGreaterThanOrEqual(24 - 1);
    expect(x1).toBeLessThanOrEqual(960 - 24 + 1);
    expect(y1).toBeLessThanOrEqual(500 - 24 + 1);
    expect(Math.max(x1 - x0 - 912, y1 - y0 - 452)).toBeGreaterThan(-3); // fills the limiting side
  });

  it("the child is an affine map of the parent (rebase continuity)", () => {
    const { projections } = buildProjectionChain({
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Spain"],
      ...size,
    });
    const r = relativeTransform(projections[0] as never, projections[1] as never);
    const [px, py] = (projections[0] as never as (p: [number, number]) => [number, number])([
      -3.7, 40.4,
    ]);
    const [cx, cy] = (projections[1] as never as (p: [number, number]) => [number, number])([
      -3.7, 40.4,
    ]);

    expect(px * r.k + r.x).toBeCloseTo(cx, 6);
    expect(py * r.k + r.y).toBeCloseTo(cy, 6);
    expect(r.k).toBeGreaterThan(4);
  });

  it("two levels deep: each one is framed within the previous one", () => {
    const { projections, missing } = buildProjectionChain({
      levels: [
        worldLevel,
        { features: pick("Spain", "France"), idOf: nameOf },
        { features: france, idOf: nameOf },
      ],
      path: ["Spain", "France"],
      ...size,
    });

    expect(missing).toBeNull();
    expect(projections).toHaveLength(3);
    // The second level frames France (the region chosen in `levels[1]`), not the world.
    const body = getFocusGeometry({
      feature: france[0] as Feature,
      path: geoPath(projections[2] as never),
    });
    const [[x0, y0], [x1, y1]] = geoPath(projections[2] as never).bounds(body as never);
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1).toBeLessThanOrEqual(960 + 1e-6);
    expect(y1).toBeLessThanOrEqual(500 + 1e-6);
    expect(projections[2]?.scale()).toBeGreaterThan(projections[0]?.scale() ?? Infinity);
  });

  it("`focusBounds` overrides the main body (Spain with the Canary Islands covers more)", () => {
    const base = {
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Spain"],
      ...size,
    };
    const peninsula = buildProjectionChain(base).projections[1];
    const withCanarias = buildProjectionChain({
      ...base,
      focusBounds: {
        Spain: [
          [-18.5, 27.5],
          [4.5, 44],
        ],
      },
    }).projections[1];

    expect(withCanarias?.scale()).toBeLessThan(peninsula?.scale() ?? 0);
  });

  it("`focusBounds: null` or absent returns to the main body", () => {
    const base = {
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Spain"],
      ...size,
    };
    const a = buildProjectionChain(base).projections[1]?.scale();
    const b = buildProjectionChain({
      ...base,
      focusBounds: { Spain: null },
    }).projections[1]?.scale();

    expect(b).toBe(a);
  });

  it("a region that is not in the parent level: does not break, reports it with `missing` and repeats the last one", () => {
    const { projections, missing } = buildProjectionChain({
      levels: [worldLevel, { features: france, idOf: nameOf }, { features: france, idOf: nameOf }],
      path: ["Atlantis", "France"],
      ...size,
    });

    expect(missing).toBe("Atlantis");
    expect(projections).toHaveLength(3);
    expect(projections[1]).toBe(projections[0]);
    expect(projections[2]).toBe(projections[0]);
  });

  it("a region without geometry does not break either", () => {
    const hollow: Feature = {
      type: "Feature",
      id: "x",
      properties: { name: "X" },
      geometry: null as never,
    };
    const { missing } = buildProjectionChain({
      levels: [
        { features: [hollow, ...world.features], idOf: nameOf },
        { features: france, idOf: nameOf },
      ],
      path: ["X"],
      ...size,
    });

    expect(missing).toBe("X");
  });

  it("invalid size: createProjection's clear error", () => {
    expect(() =>
      buildProjectionChain({ levels: [worldLevel], path: [], width: 0, height: 500 }),
    ).toThrow(/createProjection/);
  });

  it("named projections (mercator) are respected", () => {
    const { projections } = buildProjectionChain({
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Spain"],
      name: "mercator",
      ...size,
    });

    expect(projections[1]?.invert).toBeDefined();
    expect(projections[1]?.center()).toEqual(projections[0]?.center());
  });
});
