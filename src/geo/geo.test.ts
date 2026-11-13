import { toFeatureCollection } from "../core";
import { isoNumericToAlpha2, REGION_PRESETS, world110m, worldFallbackPoints } from ".";

const world = toFeatureCollection({ geography: world110m, objectName: "countries" });
const ids = world.features.flatMap((f) => (f.id === undefined ? [] : [String(f.id)]));

describe("world110m", () => {
  it("177 regions with ISO alpha-2 id and name", () => {
    expect(world.features).toHaveLength(177);
    for (const id of ids) expect(id).toMatch(/^[A-Z]{2}$/);
    expect(new Set(ids).size).toBe(ids.length);
    expect(world.features.every((f) => typeof f.properties?.["name"] === "string")).toBe(true);
  });

  it("Spain, France and Kosovo are where expected", () => {
    const byId = new Map(world.features.map((f) => [f.id, f.properties?.["name"]]));

    expect(byId.get("ES")).toBe("Spain");
    expect(byId.get("FR")).toBe("France");
    expect(byId.get("XK")).toBe("Kosovo");
  });

  it("only Northern Cyprus and Somaliland are left without an id", () => {
    const anonymous = world.features
      .filter((f) => f.id === undefined)
      .map((f) => f.properties?.["name"]);

    expect(anonymous.sort()).toEqual(["N. Cyprus", "Somaliland"]);
  });
});

describe("isoNumericToAlpha2", () => {
  it("converts world-atlas's numeric ids", () => {
    expect(isoNumericToAlpha2["724"]).toBe("ES");
    expect(isoNumericToAlpha2["004"]).toBe("AF"); // with leading zeros
    expect(isoNumericToAlpha2["250"]).toBe("FR");
  });

  it("covers the 250 ISO codes, with no repeated alpha-2", () => {
    const alpha2 = Object.values(isoNumericToAlpha2);

    expect(alpha2).toHaveLength(250);
    expect(new Set(alpha2).size).toBe(250);
  });

  it("every country on the map (except Kosovo) is in the table", () => {
    const known = new Set(Object.values(isoNumericToAlpha2));

    for (const id of ids.filter((i) => i !== "XK")) expect(known.has(id)).toBe(true);
  });
});

describe("worldFallbackPoints", () => {
  it("none of the microstates is already on the map", () => {
    const inMap = new Set(ids);

    for (const code of Object.keys(worldFallbackPoints)) expect(inMap.has(code)).toBe(false);
  });

  it("they are valid ISO codes with valid [lon, lat] coordinates", () => {
    const known = new Set(Object.values(isoNumericToAlpha2));

    for (const [code, [lon, lat]] of Object.entries(worldFallbackPoints)) {
      expect(known.has(code)).toBe(true);
      expect(Math.abs(lon)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
    }
  });
});

describe("REGION_PRESETS", () => {
  const known = new Set([...ids, ...Object.keys(worldFallbackPoints)]);
  const CONTINENTS = [
    "africa",
    "asia",
    "europe",
    "northAmerica",
    "southAmerica",
    "oceania",
  ] as const;
  const SUBREGIONS = {
    africa: ["northernAfrica", "easternAfrica", "middleAfrica", "southernAfrica", "westernAfrica"],
    asia: ["centralAsia", "easternAsia", "southeasternAsia", "southernAsia", "westernAsia"],
    europe: ["northernEurope", "westernEurope", "southernEurope", "easternEurope"],
    northAmerica: ["usAndCanada", "centralAmerica", "caribbean"],
    oceania: ["australiaAndNewZealand", "melanesia", "micronesia", "polynesia"],
  } as const;
  const sorted = (list: readonly string[]) => [...list].sort();
  const all = Object.entries(REGION_PRESETS) as [string, readonly string[]][];

  it("every id exists in world110m or in worldFallbackPoints (guards against typos)", () => {
    for (const [name, list] of all) {
      expect([name, list.filter((id) => !known.has(id))]).toEqual([name, []]);
    }
  });

  it("has no repeated id inside a preset", () => {
    for (const [name, list] of all) expect([name, new Set(list).size]).toEqual([name, list.length]);
  });

  it("continents are pairwise disjoint", () => {
    const members = CONTINENTS.flatMap((name) => REGION_PRESETS[name]);

    expect(new Set(members).size).toBe(members.length);
  });

  it("each continent is exactly the union of its subregions (southAmerica has none)", () => {
    for (const [continent, subregions] of Object.entries(SUBREGIONS)) {
      const union = subregions.flatMap((s) => REGION_PRESETS[s as keyof typeof REGION_PRESETS]);

      expect(sorted(REGION_PRESETS[continent as keyof typeof REGION_PRESETS])).toEqual(
        sorted(union),
      );
    }
  });

  it('Russia is in no preset: it is asked for explicitly (`region="RU"`)', () => {
    for (const [, list] of all) expect(list).not.toContain("RU");
  });

  it("eu27 has 27 members, all of them in Europe or Cyprus (UN: Asia)", () => {
    const europeOrCyprus = new Set<string>([...REGION_PRESETS.europe, "CY"]);

    expect(REGION_PRESETS.eu27).toHaveLength(27);
    expect(REGION_PRESETS.eu27.filter((id) => !europeOrCyprus.has(id))).toEqual([]);
  });
});
