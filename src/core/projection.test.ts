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
    "%s: la geometría cabe en el contenedor",
    (name) => {
      const { x0, y0, x1, y1 } = boundsOf(name, 960, 500);
      const tolerance = 1e-6;

      expect(x0).toBeGreaterThanOrEqual(-tolerance);
      expect(y0).toBeGreaterThanOrEqual(-tolerance);
      expect(x1).toBeLessThanOrEqual(960 + tolerance);
      expect(y1).toBeLessThanOrEqual(500 + tolerance);
    },
  );

  it("encaja justo: ocupa todo el ancho o todo el alto", () => {
    const { x0, y0, x1, y1 } = boundsOf("equalEarth", 960, 500);

    const fillsWidth = Math.abs(x1 - x0 - 960) < 1e-6;
    const fillsHeight = Math.abs(y1 - y0 - 500) < 1e-6;
    expect(fillsWidth || fillsHeight).toBe(true);
  });

  it("la escala depende del tamaño del contenedor", () => {
    const small = boundsOf("equalEarth", 400, 300).projection.scale();
    const large = boundsOf("equalEarth", 1200, 900).projection.scale();

    expect(large).toBeGreaterThan(small);
  });

  it("usa equalEarth por defecto", () => {
    const byDefault = boundsOf(undefined, 960, 500).projection([10, 40]);
    const explicit = boundsOf("equalEarth", 960, 500).projection([10, 40]);

    expect(byDefault).toEqual(explicit);
  });

  it("cada proyección da una posición distinta para el mismo punto", () => {
    const point = [100, 60] as [number, number];
    const equalEarth = boundsOf("equalEarth", 960, 500).projection(point);
    const mercator = boundsOf("mercator", 960, 500).projection(point);

    expect(equalEarth).not.toEqual(mercator);
  });

  it("devuelve instancias independientes: ajustar una no mueve la otra", () => {
    const first = createProjection({ width: 960, height: 500, featureCollection: world });
    const scaleBefore = first.scale();

    createProjection({ width: 200, height: 100, featureCollection: world });

    expect(first.scale()).toBe(scaleBefore);
  });

  it("con una colección vacía no falla y mantiene una escala finita", () => {
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
  ])("lanza un error con tamaño %s × %s", (width, height) => {
    expect(() => createProjection({ width, height, featureCollection: world })).toThrow(
      /finite numbers > 0/,
    );
  });

  it("produce rutas SVG válidas (sin NaN) para todos los países", () => {
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

  it("el mundo en Equal Earth es apaisado, cerca de 2:1", () => {
    const ratio = computeAspectRatio({ featureCollection: world });

    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it("Chile es mucho más alto que ancho; Noruega, al revés", () => {
    expect(computeAspectRatio({ name: "mercator", featureCollection: only("152") })).toBeLessThan(
      1,
    );
    expect(
      computeAspectRatio({ name: "mercator", featureCollection: only("578") }),
    ).toBeGreaterThan(computeAspectRatio({ name: "mercator", featureCollection: only("152") }));
  });

  it("es consistente con lo que ocupa el mapa al ajustarlo a ese tamaño", () => {
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

  it("sin features, o con geometría vacía, usa la proporción por defecto", () => {
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

// ── rebase (paso 29) ───────────────────────────────────────────────────────────────────────────────

const featureNamed = (name: string) => {
  const found = world.features.find((f) => (f.properties as { name?: string }).name === name);
  if (found === undefined) throw new Error(`no hay ${name} en world-atlas`);
  return found;
};
const spain = featureNamed("Spain");
const france = featureNamed("France");
const padding = { top: 24, right: 24, bottom: 24, left: 24 };

/** Puntos [lon, lat] repartidos dentro de los límites de `feature` (determinista). */
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
  ["albers (cónica)", geoAlbers],
  ["orthographic", geoOrthographic],
];

const parentOf = (factory: () => GeoProjection, width = 960, height = 500) =>
  factory().fitSize([width, height], world);

describe("relativeTransform", () => {
  it("entre una proyección y ella misma es la identidad", () => {
    const p = parentOf(geoEqualEarth);

    expect(relativeTransform(p, p)).toEqual({ k: 1, x: 0, y: 0 });
  });

  it("es la afín escala + traslación que separa las dos proyecciones", () => {
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
  // El test que manda (dd.md §11.2.4): el vuelo termina en `relative`, y cambiar a la proyección hija
  // con cámara identidad debe pintar los MISMOS píxeles. Si falla, el rebase se vería como un salto.
  describe.each(factories)("equivalencia afín: %s", (_name, factory) => {
    it("child(p) = relative(parent(p)) con error < 1e-6 para 200 puntos", () => {
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

  it("también con la proyección del padre rotada y centrada (se hereda)", () => {
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

  it("hereda las paralelas de una cónica personalizada", () => {
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

  it("hereda también el recorte (clipAngle) y la precisión del remuestreo", () => {
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

  it("el hijo encuadra el foco dentro del padding, llenando el lado limitante", () => {
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

  it("acerca: la `k` relativa es > 1 al enfocar un país dentro del mundo", () => {
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

  it("no modifica la proyección del padre", () => {
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

  it("encadenar dos rebases sigue siendo afín: R_total = R2 ∘ R1", () => {
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

  it("tamaño no válido o foco sin extensión: error claro en inglés", () => {
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
