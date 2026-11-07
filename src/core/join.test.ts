import type { Feature } from "geojson";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { toFeatureCollection } from "./geography";
import { joinData } from "./join";

type Row = { code: string; value: number | null };

const feature = (
  id: string | number | undefined,
  properties: Feature["properties"] = {},
): Feature => ({
  type: "Feature",
  ...(id === undefined ? {} : { id }),
  properties,
  geometry: { type: "Point", coordinates: [0, 0] },
});

const getId = (row: Row) => row.code;

describe("joinData", () => {
  it("joins data and regions when the ids match", () => {
    const rows: Row[] = [
      { code: "A", value: 1 },
      { code: "B", value: 2 },
    ];

    const result = joinData({ features: [feature("A"), feature("B")], data: rows, getId });

    expect(result.joined.get("A")).toBe(rows[0]);
    expect(result.joined.get("B")).toBe(rows[1]);
    expect(result.unmatchedData).toEqual([]);
    expect(result.featuresWithoutData).toEqual([]);
  });

  it("reports both sides when the ids are mixed", () => {
    const rows: Row[] = [
      { code: "A", value: 1 }, // cruza
      { code: "ES", value: 2 }, // does not exist in the geometry
      { code: "XK", value: 3 }, // does not exist in the geometry
    ];

    const result = joinData({
      features: [feature("A"), feature("B"), feature("C")],
      data: rows,
      getId,
    });

    expect([...result.joined.keys()]).toEqual(["A"]);
    expect(result.unmatchedData).toEqual(["ES", "XK"]);
    expect(result.featuresWithoutData).toEqual(["B", "C"]);
  });

  it("joins nothing if the id format differs (alpha-2 versus numeric)", () => {
    const result = joinData({
      features: [feature("724"), feature("250")],
      data: [
        { code: "ES", value: 1 },
        { code: "FR", value: 2 },
      ],
      getId,
    });

    expect(result.joined.size).toBe(0);
    expect(result.unmatchedData).toEqual(["ES", "FR"]);
    expect(result.featuresWithoutData).toEqual(["724", "250"]);
  });

  it("converts a numeric feature.id to string so it can join", () => {
    const result = joinData({ features: [feature(724)], data: [{ code: "724", value: 1 }], getId });

    expect(result.joined.has("724")).toBe(true);
    expect(result.featuresWithoutData).toEqual([]);
  });

  it("uses getFeatureId when the id is in properties", () => {
    const result = joinData({
      features: [feature(undefined, { iso_a2: "ES" })],
      data: [{ code: "ES", value: 1 }],
      getId,
      getFeatureId: (f) => f.properties?.["iso_a2"] as string,
    });

    expect([...result.joined.keys()]).toEqual(["ES"]);
  });

  it("ignores regions without an id (they cannot be joined or named)", () => {
    const result = joinData({ features: [feature(undefined), feature("A")], data: [], getId });

    expect(result.featuresWithoutData).toEqual(["A"]);
  });

  it("keeps the first datum and reports the duplicate ids", () => {
    const rows: Row[] = [
      { code: "A", value: 1 },
      { code: "A", value: 99 },
    ];

    const result = joinData({ features: [feature("A")], data: rows, getId });

    expect(result.joined.get("A")).toBe(rows[0]);
    expect(result.duplicateDataIds).toEqual(["A"]);
  });

  it("treats a datum with value null as joined (null ≠ no data)", () => {
    const result = joinData({
      features: [feature("A")],
      data: [{ code: "A", value: null }],
      getId,
    });

    expect(result.joined.has("A")).toBe(true);
    expect(result.featuresWithoutData).toEqual([]);
  });

  it("does not repeat the ids of duplicate regions in the geometry", () => {
    const result = joinData({ features: [feature("A"), feature("A")], data: [], getId });

    expect(result.featuresWithoutData).toEqual(["A"]);
  });

  it("returns everything empty with empty inputs", () => {
    const result = joinData({ features: [], data: [], getId });

    expect(result).toEqual({
      joined: new Map(),
      unmatchedData: [],
      featuresWithoutData: [],
      duplicateDataIds: [],
    });
  });

  describe("with the real world-atlas", () => {
    const { features } = toFeatureCollection({
      geography: countries110m as unknown as Topology,
      objectName: "countries",
    });

    it("joins with numeric ISO and fails with alpha-2: the project's real problem", () => {
      const numeric = joinData({ features, data: [{ code: "724", value: 1 }], getId });
      const alpha2 = joinData({ features, data: [{ code: "ES", value: 1 }], getId });

      expect(numeric.joined.has("724")).toBe(true);
      expect(numeric.unmatchedData).toEqual([]);
      expect(alpha2.joined.size).toBe(0);
      expect(alpha2.unmatchedData).toEqual(["ES"]);
    });
  });
});
