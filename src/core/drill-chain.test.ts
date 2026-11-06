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

/** Dónde cae [lon, lat] en una proyección, comprobando que es finito. */
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

  it("Rusia: se encuadra su mitad más ancha (Moscú y la costa del Pacífico caben; no sale el mundo entero)", () => {
    const { projections, missing } = frame("Russia");
    const [mx, my] = at(projections[1], [37.6, 55.7]); // Moscú
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
    // La escala es la de «Rusia llena la vista», no la del mundo (que sería ~1/3 de esta).
    expect((projections[1]?.scale() ?? 0) / (projections[0]?.scale() ?? 1)).toBeGreaterThan(1.8);
  });

  it("Fiyi: una escala razonable (no la de un mundo de 128 000 px)", () => {
    const { projections } = frame("Fiji");

    expect(projections[1]?.scale()).toBeLessThan((projections[0]?.scale() ?? 1) * 400);
    const [x, y] = at(projections[1], [178, -17.8]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(960);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(500);
  });

  it("`focusBounds` que cruzan el antimeridiano también usan la mitad más ancha", () => {
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
  it("en la raíz hay una sola proyección, ajustada al mundo", () => {
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

  it("un nivel por debajo: la proyección de la región encuadra su cuerpo principal con padding", () => {
    const { projections } = buildProjectionChain({
      levels: [worldLevel, { features: france, idOf: nameOf }],
      path: ["Spain"],
      ...size,
      padding: 24,
    });
    const [[x0, y0], [x1, y1]] = geoPath(projections[1]).bounds(pick("Spain")[0] as Feature);

    // Con Canarias no (por defecto aquí no hay focusBounds): el cuerpo principal es la península.
    expect(projections).toHaveLength(2);
    expect(x0).toBeGreaterThanOrEqual(24 - 1);
    expect(y0).toBeGreaterThanOrEqual(24 - 1);
    expect(x1).toBeLessThanOrEqual(960 - 24 + 1);
    expect(y1).toBeLessThanOrEqual(500 - 24 + 1);
    expect(Math.max(x1 - x0 - 912, y1 - y0 - 452)).toBeGreaterThan(-3); // llena el lado limitante
  });

  it("el hijo es una afín del padre (continuidad del rebase)", () => {
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

  it("dos niveles de profundidad: cada uno se encuadra dentro del anterior", () => {
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
    // El segundo nivel encuadra Francia (la región elegida en `levels[1]`), no el mundo.
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

  it("`focusBounds` manda sobre el cuerpo principal (España con Canarias abarca más)", () => {
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

  it("`focusBounds: null` o ausente vuelve al cuerpo principal", () => {
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

  it("una región que no está en el nivel padre: no rompe, avisa con `missing` y repite la última", () => {
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

  it("una región sin geometría tampoco rompe", () => {
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

  it("tamaño no válido: el error claro de createProjection", () => {
    expect(() =>
      buildProjectionChain({ levels: [worldLevel], path: [], width: 0, height: 500 }),
    ).toThrow(/createProjection/);
  });

  it("proyecciones con nombre (mercator) se respetan", () => {
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
