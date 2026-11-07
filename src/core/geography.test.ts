import type { FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import { toFeatureCollection, unwrapGeography } from "./geography";

// Minimal hand-written TopoJSON: two 1×1 squares glued along one side.
//
//   (0,1)──(1,1)──(2,1)
//     │  A   │  B   │
//   (0,0)──(1,0)──(2,0)
//
// The shared side x=1 is stored ONCE (arc 0). A traverses it forward (0) and
// B backward (~0 = -1). That reuse is exactly what makes TopoJSON small.
const twoSquares: Topology = {
  type: "Topology",
  objects: {
    squares: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "A", properties: { name: "Alpha" }, arcs: [[0, 1]] },
        { type: "Polygon", id: "B", properties: { name: "Beta" }, arcs: [[2, ~0]] },
      ],
    },
    // Second object, to test `objectName`. It is a single geometry (not a collection).
    outline: { type: "Polygon", id: "OUT", arcs: [[0, 1]] },
  },
  arcs: [
    [
      [1, 0],
      [1, 1],
    ], // 0: shared side
    [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ], // 1: resto de A
    [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
    ], // 2: rest of B
  ],
};

describe("toFeatureCollection", () => {
  describe("with TopoJSON", () => {
    it("converts the collection into a FeatureCollection keeping id and properties", () => {
      const fc = toFeatureCollection({ geography: twoSquares });

      expect(fc.type).toBe("FeatureCollection");
      expect(fc.features.map((f) => f.id)).toEqual(["A", "B"]);
      expect(fc.features[0]?.properties).toEqual({ name: "Alpha" });
    });

    it("rebuilds the real coordinates from the shared arcs", () => {
      const fc = toFeatureCollection({ geography: twoSquares });

      expect(fc.features[0]?.geometry).toEqual({
        type: "Polygon",
        coordinates: [
          [
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
            [1, 0],
          ],
        ],
      });
      // B traverses the shared side in reverse (~0), so it starts at (1,0)
      // and returns to (1,0) passing through (1,1) at the end.
      expect(fc.features[1]?.geometry).toEqual({
        type: "Polygon",
        coordinates: [
          [
            [1, 0],
            [2, 0],
            [2, 1],
            [1, 1],
            [1, 0],
          ],
        ],
      });
    });

    it("uses the first object when objectName is not given", () => {
      const fc = toFeatureCollection({ geography: twoSquares });
      expect(fc.features).toHaveLength(2);
    });

    it("uses the requested object with objectName", () => {
      const fc = toFeatureCollection({ geography: twoSquares, objectName: "outline" });
      expect(fc.features.map((f) => f.id)).toEqual(["OUT"]);
    });

    it("wraps a single-geometry object in a FeatureCollection", () => {
      // feature() returns a lone Feature here; the contract always requires a collection.
      const fc = toFeatureCollection({ geography: twoSquares, objectName: "outline" });
      expect(fc.type).toBe("FeatureCollection");
      expect(Array.isArray(fc.features)).toBe(true);
    });

    it("undoes TopoJSON's transform (quantization + delta-encoding)", () => {
      const quantized: Topology = {
        type: "Topology",
        transform: { scale: [10, 10], translate: [100, 50] },
        objects: {
          sq: {
            type: "GeometryCollection",
            geometries: [{ type: "Polygon", id: "Q", arcs: [[0]] }],
          },
        },
        // First absolute point (0,0); the rest are differences from the previous one.
        arcs: [
          [
            [0, 0],
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
          ],
        ],
      };

      const fc = toFeatureCollection({ geography: quantized });

      // coordinate = accumulated point × scale + translate
      expect(fc.features[0]?.geometry).toEqual({
        type: "Polygon",
        coordinates: [
          [
            [100, 50],
            [110, 50],
            [110, 60],
            [100, 60],
            [100, 50],
          ],
        ],
      });
    });

    it("throws an error listing the available objects if objectName does not exist", () => {
      expect(() => toFeatureCollection({ geography: twoSquares, objectName: "nope" })).toThrow(
        /"nope" does not exist.*squares, outline/,
      );
    });

    it("throws an error if the topology has no objects", () => {
      const empty: Topology = { type: "Topology", objects: {}, arcs: [] };
      expect(() => toFeatureCollection({ geography: empty })).toThrow(
        /Available objects: \(none\)/,
      );
    });
  });

  describe("with GeoJSON", () => {
    const geojson: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "X",
          properties: {},
          geometry: { type: "Point", coordinates: [0, 0] },
        },
      ],
    };

    it("returns the same object, uncopied (stable reference for useMemo)", () => {
      expect(toFeatureCollection({ geography: geojson })).toBe(geojson);
    });

    it("ignora objectName", () => {
      expect(toFeatureCollection({ geography: geojson, objectName: "lo-que-sea" })).toBe(geojson);
    });
  });

  describe("with invalid inputs", () => {
    it.each([
      ["un objeto sin type", {}],
      ["un type desconocido", { type: "Feature" }],
      ["null", null],
    ])("lanza un error claro con %s", (_label, input) => {
      expect(() => toFeatureCollection({ geography: input as never })).toThrow(
        /unrecognized format/,
      );
    });
  });
});

describe("unwrapGeography", () => {
  const fc: FeatureCollection = { type: "FeatureCollection", features: [] };

  it("returns the data as is, and pulls `default` out of an ES module", () => {
    expect(unwrapGeography(fc)).toBe(fc);
    expect(unwrapGeography({ default: fc })).toBe(fc);
  });
});
