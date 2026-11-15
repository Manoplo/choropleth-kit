import type { Feature, MultiPolygon } from "geojson";
import { geoBounds } from "d3-geo";
import { OVERSEAS_TERRITORIES, REGION_PRESETS, world110m } from "../geo";
import { toFeatureCollection } from "./geography";
import type { LonLatBounds } from "./bounds";
import { dropOverseas, regionRotation, resolveRegion, type OverseasTable } from "./region";

const PRESETS = { duo: ["ES", "PT"], trio: ["FR", "DE", "IT"] } as const;

describe("resolveRegion", () => {
  it("expands a preset", () => {
    expect([...resolveRegion("duo", PRESETS)].sort()).toEqual(["ES", "PT"]);
  });

  it("accepts an alpha-2 code, in any case", () => {
    expect([...resolveRegion("ES", PRESETS)]).toEqual(["ES"]);
    expect([...resolveRegion("es", PRESETS)]).toEqual(["ES"]);
  });

  it("mixes presets and codes in a list, without duplicates", () => {
    expect([...resolveRegion(["duo", "MA", "ES"], PRESETS)].sort()).toEqual(["ES", "MA", "PT"]);
  });

  it("throws on an unknown name, listing the valid presets", () => {
    expect(() => resolveRegion("Europa", PRESETS)).toThrow(/unknown "Europa".*duo, trio/);
    expect(() => resolveRegion("espana", PRESETS)).toThrow(/unknown "espana"/);
  });

  it("is exact on preset names: `Duo` is not `duo`", () => {
    expect(() => resolveRegion("Duo", PRESETS)).toThrow(/unknown "Duo"/);
  });

  it("throws on an empty list (it would draw a blank map with no error)", () => {
    expect(() => resolveRegion([], PRESETS)).toThrow(/empty/);
  });

  it("does not take inherited object keys for presets", () => {
    expect(() => resolveRegion("constructor", PRESETS)).toThrow(/unknown "constructor"/);
  });
});

const world = toFeatureCollection({ geography: world110m, objectName: "countries" });
const byId = (id: string): Feature => {
  const found = world.features.find((f) => f.id === id);
  if (found === undefined) throw new Error(`fixture: ${id} is not in world110m`);
  return found;
};
const dropped = (id: string): Feature =>
  dropOverseas([byId(id)], OVERSEAS_TERRITORIES)[0] as Feature;
const polygonCount = (f: Feature): number =>
  f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.length : 1;

describe("dropOverseas (with the real table over world110m)", () => {
  it("France: the hexagon and Corsica, without Guiana", () => {
    const [[west, south], [east, north]] = geoBounds(dropped("FR"));

    expect(west).toBeGreaterThan(-6);
    expect(east).toBeGreaterThan(9); // Corsica is kept
    expect(south).toBeGreaterThan(41);
    expect(north).toBeLessThan(52);
    expect(polygonCount(dropped("FR"))).toBe(polygonCount(byId("FR")) - 1);
  });

  it("Norway: without Svalbard", () => {
    const [, [, north]] = geoBounds(dropped("NO"));

    expect(north).toBeLessThan(72);
    expect(geoBounds(byId("NO"))[1][1]).toBeGreaterThan(79); // the original does have it
  });

  it("the US: without Hawaii, WITH Alaska", () => {
    const [[, south], [, north]] = geoBounds(dropped("US"));

    expect(south).toBeGreaterThan(24); // Hawaii is at 19°
    expect(north).toBeGreaterThan(65); // Alaska is kept
  });

  it("countries with no listed territory in 1:110m come back as the SAME object", () => {
    for (const id of ["ES", "PT", "NL", "NZ", "RU", "MY", "ID", "DE"]) {
      expect([id, dropped(id) === byId(id)]).toEqual([id, true]);
    }
  });

  it("does not mutate its input, and keeps id and properties", () => {
    const france = byId("FR");
    const before = (france.geometry as MultiPolygon).coordinates.length;
    const [out] = dropOverseas([france], OVERSEAS_TERRITORIES);

    expect((france.geometry as MultiPolygon).coordinates).toHaveLength(before);
    expect(out?.id).toBe("FR");
    expect(out?.properties).toBe(france.properties);
  });

  it("every country in the table loses at least one polygon (no dead entries)", () => {
    for (const id of Object.keys(OVERSEAS_TERRITORIES)) {
      expect([id, polygonCount(dropped(id)) < polygonCount(byId(id))]).toEqual([id, true]);
    }
  });

  it("Europe: after dropping, nothing of the region sticks out of Europe's bounding box", () => {
    const europe = new Set<string>(REGION_PRESETS.europe);
    const features = dropOverseas(
      world.features.filter((f) => europe.has(String(f.id))),
      OVERSEAS_TERRITORIES,
    );

    for (const feature of features) {
      const [[west, south], [east, north]] = geoBounds(feature);
      expect([feature.id, west > -26, east < 45, south > 33, north < 72]).toEqual([
        feature.id,
        true,
        true,
        true,
        true,
      ]);
    }
  });
});

describe("dropOverseas (edge cases, synthetic table)", () => {
  // d3 reads rings on the sphere: the exterior ring must be clockwise.
  const square = (lon: number, lat: number) => [
    [
      [lon, lat],
      [lon, lat + 1],
      [lon + 1, lat + 1],
      [lon + 1, lat],
      [lon, lat],
    ],
  ];
  const country = (id: string | undefined, origins: [number, number][]): Feature => ({
    type: "Feature",
    id,
    properties: {},
    geometry: { type: "MultiPolygon", coordinates: origins.map(([lon, lat]) => square(lon, lat)) },
  });
  const box: LonLatBounds = [
    [50, 50],
    [60, 60],
  ];
  const far: OverseasTable = { XX: [box] };

  it("never empties a feature: if every polygon is overseas, it is returned untouched", () => {
    const only = country("XX", [[55, 55]]);

    expect(dropOverseas([only], far)[0]).toBe(only);
  });

  it("drops only the polygons inside the box", () => {
    const mixed = country("XX", [
      [0, 0],
      [55, 55],
      [1, 1],
    ]);

    expect(polygonCount(dropOverseas([mixed], far)[0] as Feature)).toBe(2);
  });

  it("leaves alone features without id, with an empty list, or that are a single Polygon", () => {
    const anonymous = country(undefined, [
      [55, 55],
      [0, 0],
    ]);
    const empty = country("YY", [
      [55, 55],
      [0, 0],
    ]);
    const polygon: Feature = {
      type: "Feature",
      id: "XX",
      properties: {},
      geometry: { type: "Polygon", coordinates: square(55, 55) },
    };

    expect(dropOverseas([anonymous], far)[0]).toBe(anonymous);
    expect(dropOverseas([empty], { YY: [] })[0]).toBe(empty);
    expect(dropOverseas([polygon], far)[0]).toBe(polygon);
  });
});

describe("regionRotation (regions that straddle the antimeridian)", () => {
  const inRegion = (preset: keyof typeof REGION_PRESETS | string[]) => {
    const wanted = new Set<string>(typeof preset === "string" ? REGION_PRESETS[preset] : preset);
    return world.features.filter((f) => wanted.has(String(f.id)));
  };

  it("regions that do not touch ±180° need no rotation: they keep the world's orientation", () => {
    for (const name of ["europe", "africa", "asia", "southAmerica", "latam", "eu27"] as const) {
      expect([name, regionRotation(inRegion(name))]).toEqual([name, undefined]);
    }
  });

  it("Oceania: the central meridian is the middle of the region (≈ 148°E), the world is cut in the Atlantic", () => {
    const [lambda, phi] = regionRotation(inRegion("oceania")) ?? [Number.NaN, Number.NaN];

    expect(phi).toBe(0);
    expect(-lambda).toBeGreaterThan(140);
    expect(-lambda).toBeLessThan(160);
  });

  it("Russia: centered on Siberia, so Chukotka is no longer torn to the other edge", () => {
    const [lambda] = regionRotation(inRegion(["RU"])) ?? [NaN];

    expect(-lambda).toBeGreaterThan(90);
    expect(-lambda).toBeLessThan(120);
  });

  it("points count: Samoa (a dot) next to New Zealand pulls the cut to the Atlantic", () => {
    const nz = inRegion(["NZ"]);

    expect(regionRotation(nz)).toBeUndefined(); // NZ alone sits at 166°E…179°E: the cut is far
    const [lambda] = regionRotation(nz, [[-172, -13.8]]) ?? [NaN];
    expect(-lambda).toBeGreaterThan(160); // the middle of NZ (166°E…179°E) and Samoa (188°E)
  });

  it("a geometry that covers every longitude has nowhere better to cut", () => {
    const ring = (west: number) => [
      [west, -10],
      [west, 10],
      [west + 60, 10],
      [west + 60, -10],
      [west, -10],
    ];
    const band: Feature[] = [-180, -120, -60, 0, 60, 120].map((west) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring(west)] },
    }));

    expect(regionRotation(band)).toBeUndefined();
  });

  it("features without geometry or points with NaN are ignored", () => {
    const empty = { type: "Feature", properties: {}, geometry: null } as unknown as Feature;

    expect(regionRotation([empty], [[Number.NaN, 0]])).toBeUndefined();
  });
});
