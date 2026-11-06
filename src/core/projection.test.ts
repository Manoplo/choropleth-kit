import { geoPath } from "d3-geo";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { toFeatureCollection } from "./geography";
import {
  computeAspectRatio,
  createProjection,
  DEFAULT_ASPECT_RATIO,
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
