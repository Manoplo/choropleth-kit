import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { geoArea } from "d3-geo";
import { feature } from "topojson-client";
import { topology } from "topojson-server";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import {
  countryOfCode,
  countryNames,
  findInvertedUnits,
  isRealIsoCode,
  normalizeAdmin1,
  pruneInvertedPolygons,
  type RawAdmin1,
} from "./admin1-build";

// d3 reads clockwise (in lon/lat) as the inside of a spherical polygon.
const square = (lon: number, lat: number, size = 1): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [lon, lat],
      [lon, lat + size],
      [lon + size, lat + size],
      [lon + size, lat],
      [lon, lat],
    ],
  ],
});

const collectionOf = (features: Feature[]): FeatureCollection => ({
  type: "FeatureCollection",
  features,
});

const raw = (code: string | null, name: string, lon = 0): RawAdmin1 => ({
  type: "Feature",
  properties: { iso_3166_2: code, name },
  geometry: square(lon, 0),
});

describe("isRealIsoCode / countryOfCode", () => {
  it("accepts ISO 3166-2 codes and rejects Natural Earth placeholders", () => {
    for (const code of ["US-CA", "ES-M", "GB-ABD", "CN-11", "BA-BIH"]) {
      expect(isRealIsoCode(code)).toBe(true);
    }
    for (const code of ["-99-X16~", "XK-X02~", "AE-X01~", "", "US", "us-ca", null, undefined]) {
      expect(isRealIsoCode(code)).toBe(false);
    }
  });

  it("tells the country from the prefix of a real code or of a placeholder", () => {
    expect(countryOfCode("FR-GF")).toBe("FR");
    expect(countryOfCode("XK-X02~")).toBe("XK");
    expect(countryOfCode("-99-X16~")).toBeNull();
    expect(countryOfCode(null)).toBeNull();
    expect(countryOfCode("nonsense")).toBeNull();
  });
});

describe("normalizeAdmin1", () => {
  it("a unique real code is the id, and the unit goes to the country of its prefix", () => {
    const { byCountry, report } = normalizeAdmin1([
      raw("US-CA", "California"),
      raw("FR-GF", "Guyane"),
    ]);

    expect(byCountry.get("US")?.[0]?.id).toBe("US-CA");
    expect(byCountry.get("US")?.[0]?.properties.name).toBe("California");
    expect(byCountry.get("FR")?.[0]?.id).toBe("FR-GF");
    expect(report.withoutId).toBe(0);
  });

  it("merges features that share a code and a name into one multipolygon", () => {
    const { byCountry, report } = normalizeAdmin1([
      raw("MW-CT", "Chitipa", 0),
      raw("MW-CN", "Other", 5),
      raw("MW-CT", "Chitipa", 10),
    ]);
    const units = byCountry.get("MW") ?? [];

    expect(units.map((u) => u.id)).toEqual(["MW-CT", "MW-CN"]);
    expect(units[0]?.geometry.type).toBe("MultiPolygon");
    expect(
      units[0]?.geometry.type === "MultiPolygon" && units[0].geometry.coordinates,
    ).toHaveLength(2);
    expect(report.merged).toEqual([{ id: "MW-CT", parts: 2 }]);
  });

  it("gives no id to features that share a code but not a name (Bosnia's cantons)", () => {
    const { byCountry, report } = normalizeAdmin1([
      raw("BA-BIH", "Sarajevo", 0),
      raw("BA-BIH", "Tuzla", 2),
      raw("BA-SRP", "Republika Srpska", 4),
    ]);
    const units = byCountry.get("BA") ?? [];

    expect(units.map((u) => u.id)).toEqual([undefined, undefined, "BA-SRP"]);
    expect(units.map((u) => u.properties.name)).toEqual(["Sarajevo", "Tuzla", "Republika Srpska"]);
    expect(report.ambiguous).toEqual([{ id: "BA-BIH", names: ["Sarajevo", "Tuzla"] }]);
    expect(report.withoutId).toBe(2);
  });

  it("keeps a placeholder as a unit without id, and drops one with no country", () => {
    const { byCountry, report } = normalizeAdmin1([
      raw("XK-X02~", "Dečani"),
      raw("-99-X16~", "Dhekelia"),
      raw("-99", "Unknown"),
    ]);

    expect(byCountry.get("XK")).toHaveLength(1);
    expect(byCountry.get("XK")?.[0]?.id).toBeUndefined();
    expect(byCountry.has("-99")).toBe(false);
    expect(report.noCountry).toEqual(["Dhekelia", "Unknown"]);
    expect(report.withoutId).toBe(1);
  });

  it("uses an empty name when the source has none", () => {
    const { byCountry } = normalizeAdmin1([
      { type: "Feature", properties: { iso_3166_2: "US-CA" }, geometry: square(0, 0) },
    ]);

    expect(byCountry.get("US")?.[0]?.properties.name).toBe("");
  });
});

describe("countryNames", () => {
  const named = (code: string, admin: string | null, lon = 0): RawAdmin1 => ({
    type: "Feature",
    properties: { iso_3166_2: code, name: code, admin },
    geometry: square(lon, 0),
  });

  it("takes each country's name from the prefix of its codes", () => {
    const names = countryNames([
      named("ES-M", "Spain"),
      named("ES-B", "Spain"),
      named("US-CA", "United States of America"),
    ]);

    expect(names.get("ES")).toBe("Spain");
    expect(names.get("US")).toBe("United States of America");
  });

  it("counts placeholders, so a country with no real code still has a name", () => {
    expect(countryNames([named("XK-X01~", "Kosovo")]).get("XK")).toBe("Kosovo");
  });

  it("skips features with no country or no name, and breaks ties alphabetically", () => {
    const names = countryNames([
      named("-99-X01~", "Somaliland"),
      named("AA-01", null),
      named("BB-01", "Beta"),
      named("BB-02", "Alpha"),
    ]);

    expect(names.has("AA")).toBe(false);
    expect([...names.keys()]).toEqual(["BB"]);
    expect(names.get("BB")).toBe("Alpha");
  });
});

describe("pruneInvertedPolygons", () => {
  // The same square, wound the other way round: d3 reads it as the whole sphere minus the square.
  const reversed = (lon: number): Polygon => ({
    type: "Polygon",
    coordinates: [[...(square(lon, 0).coordinates[0] ?? [])].reverse()],
  });

  const build = (): Topology => {
    const features: Feature[] = [
      {
        type: "Feature",
        id: "A",
        properties: { name: "A" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [square(0, 0).coordinates, reversed(5).coordinates],
        },
      },
      { type: "Feature", id: "B", properties: { name: "B" }, geometry: reversed(10) },
      { type: "Feature", id: "C", properties: { name: "C" }, geometry: square(20, 0) },
    ];
    return topology({ u: collectionOf(features) });
  };

  it("the fixture really has inverted units", () => {
    expect(findInvertedUnits(build(), "u")).toEqual(["A", "B"]);
  });

  it("drops the inverted polygons and the units left empty", () => {
    const topo = build();
    const result = pruneInvertedPolygons(topo, "u");
    const ids = (topo.objects["u"] as GeometryCollection).geometries.map((g) => g.id);

    expect(result.polygons).toBe(2);
    expect(result.droppedUnits).toEqual(["B"]);
    expect(ids).toEqual(["A", "C"]);
    expect(findInvertedUnits(topo, "u")).toEqual([]);
  });

  it("leaves sound data untouched", () => {
    const topo = topology({
      u: collectionOf([{ type: "Feature", id: "C", properties: {}, geometry: square(0, 0) }]),
    });

    expect(pruneInvertedPolygons(topo, "u")).toEqual({ polygons: 0, droppedUnits: [] });
  });
});

// ── the generated data (src/geo/admin1/, committed) ────────────────────────────────────────────────
const dir = `${resolve(process.cwd(), "src/geo/admin1")}/`;
const readJson = <T>(name: string): T => JSON.parse(readFileSync(`${dir}${name}`, "utf8")) as T;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^[a-z]{2}\.json$/.test(f)) : [];

type Manifest = {
  quantization: number;
  countries: Record<string, { name: string; units: number; withoutId: number; bytes: number }>;
  ambiguous: { id: string; names: string[] }[];
};

type UnitProps = { name: string };

const unitsOf = (cc: string) => {
  const topo = readJson<Topology>(`${cc.toLowerCase()}.json`);
  return feature(topo, topo.objects["admin1"] as GeometryCollection<UnitProps>).features;
};

describe("generated admin-1 data", () => {
  it("has one file per country and a manifest that agrees with them", () => {
    const manifest = readJson<Manifest>("manifest.json");

    expect(files.length).toBeGreaterThan(200);
    expect(
      Object.keys(manifest.countries)
        .map((c) => `${c.toLowerCase()}.json`)
        .sort(),
    ).toEqual([...files].sort());
  });

  it("every unit has a name, and its id (if any) is a unique ISO 3166-2 code of its country", () => {
    const manifest = readJson<Manifest>("manifest.json");
    const problems: string[] = [];
    for (const [cc, info] of Object.entries(manifest.countries)) {
      const units = unitsOf(cc);
      const ids = units.flatMap((u) => (u.id === undefined ? [] : [String(u.id)]));

      if (units.length !== info.units) problems.push(`${cc}: manifest says ${info.units} units`);
      if (units.length - ids.length !== info.withoutId) problems.push(`${cc}: withoutId differs`);
      if (new Set(ids).size !== ids.length) problems.push(`${cc}: duplicated ids`);
      for (const id of ids) {
        if (!id.startsWith(`${cc}-`) || !isRealIsoCode(id)) problems.push(`${cc}: bad id ${id}`);
      }
      for (const u of units) {
        if (typeof u.properties.name !== "string") problems.push(`${cc}: unit without name`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("no unit covers more than a hemisphere (d3 would paint the whole map with it)", () => {
    const inverted: string[] = [];
    for (const file of files) {
      const cc = file.slice(0, 2).toUpperCase();
      for (const u of unitsOf(cc)) {
        if (geoArea(u) > 2 * Math.PI) inverted.push(`${cc}:${u.id ?? u.properties.name}`);
      }
    }

    expect(inverted).toEqual([]);
  });

  it("the big countries have the level of detail Natural Earth gives them", () => {
    const ids = (cc: string) => new Set(unitsOf(cc).map((u) => u.id));

    // 50 states + DC + Puerto Rico: ISO 3166-2 lists `US-PR` under the US, and the country of a unit is its prefix.
    expect(unitsOf("US")).toHaveLength(52);
    expect(["US-CA", "US-DC", "US-PR"].filter((id) => !ids("US").has(id))).toEqual([]);
    expect(unitsOf("DE")).toHaveLength(16);
    // Spain comes as 52 provinces (ES-M is Madrid's province), NOT as 17 autonomous communities.
    expect(unitsOf("ES")).toHaveLength(52);
    expect(ids("ES").has("ES-M")).toBe(true);
    expect(ids("ES").has("ES-MD")).toBe(false);
  });

  it("Bosnia's cantons carry the ambiguous BA-BIH, so they have no id", () => {
    const manifest = readJson<Manifest>("manifest.json");
    const ids = unitsOf("BA").map((u) => u.id);

    expect(manifest.ambiguous.some((a) => a.id === "BA-BIH")).toBe(true);
    expect(ids).not.toContain("BA-BIH");
  });

  it("the package exposes every country through one wildcard subpath that `pnpm build` fills", () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      exports: Record<string, unknown>;
      typesVersions: Record<string, Record<string, unknown>>;
      scripts: Record<string, string>;
    };

    expect(pkg.exports["./geo/admin1/*"]).toEqual({
      types: "./dist/admin1/*.d.ts",
      import: "./dist/admin1/*.js",
    });
    expect(pkg.typesVersions["*"]?.["geo/admin1/*"]).toEqual(["./dist/admin1/*.d.ts"]);
    expect(pkg.scripts["build"]).toContain("scripts/build-geo/emit-admin1.mjs");
  });

  it("the docs table lists every country of the manifest with its number of units", () => {
    const manifest = readJson<Manifest>("manifest.json");
    const docs = readFileSync(resolve(process.cwd(), "docs/geo-admin1.md"), "utf8");
    const missing = Object.entries(manifest.countries)
      .filter(([cc, info]) => !docs.includes(`| \`${cc}\` | ${info.name} | ${info.units}`))
      .map(([cc]) => cc);

    expect(missing).toEqual([]);
  });

  it("is not imported by any entry point: the bundle cannot grow by accident", () => {
    const offenders: string[] = [];
    for (const entry of ["src/react/index.ts", "src/core/index.ts", "src/geo/index.ts"]) {
      const source = readFileSync(resolve(process.cwd(), entry), "utf8");

      offenders.push(...(/admin1/.test(source) ? [entry] : []));
    }

    expect(offenders).toEqual([]);
  });
});
