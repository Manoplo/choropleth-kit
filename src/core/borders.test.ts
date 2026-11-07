import type { FeatureCollection } from "geojson";
import { twoSquares } from "../../tests/fixtures";
import { createBorders } from "./borders";

describe("createBorders", () => {
  it("returns only the shared border (one line), without the coast", () => {
    const borders = createBorders({ geography: twoSquares });

    expect(borders?.type).toBe("MultiLineString");
    expect(borders?.coordinates).toEqual([
      [
        [1, 0],
        [1, 1],
      ],
    ]);
  });

  describe("filterFeatures", () => {
    it("keeps the border if both sides are kept", () => {
      const borders = createBorders({ geography: twoSquares, filterFeatures: () => true });

      expect(borders?.coordinates).toHaveLength(1);
    });

    it("removes the border if either side is discarded", () => {
      const withoutB = createBorders({
        geography: twoSquares,
        filterFeatures: (f) => f.id !== "B",
      });
      const withoutA = createBorders({
        geography: twoSquares,
        filterFeatures: (f) => f.id !== "A",
      });

      expect(withoutB?.coordinates).toEqual([]);
      expect(withoutA?.coordinates).toEqual([]);
    });
  });

  it("with GeoJSON there is no topology: it returns null", () => {
    const fc: FeatureCollection = { type: "FeatureCollection", features: [] };

    expect(createBorders({ geography: fc })).toBeNull();
  });

  it("a nonexistent objectName returns null instead of throwing", () => {
    expect(createBorders({ geography: twoSquares, objectName: "nope" })).toBeNull();
  });

  it("a topology without objects returns null", () => {
    expect(createBorders({ geography: { type: "Topology", objects: {}, arcs: [] } })).toBeNull();
  });
});
