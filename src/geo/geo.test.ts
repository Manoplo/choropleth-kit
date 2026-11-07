import { toFeatureCollection } from "../core";
import { isoNumericToAlpha2, world110m, worldFallbackPoints } from ".";

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
