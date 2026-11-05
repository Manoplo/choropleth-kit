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
  it("cruza datos y regiones cuando los ids coinciden", () => {
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

  it("informa de los dos lados cuando los ids están mezclados", () => {
    const rows: Row[] = [
      { code: "A", value: 1 }, // cruza
      { code: "ES", value: 2 }, // no existe en la geometría
      { code: "XK", value: 3 }, // no existe en la geometría
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

  it("no cruza nada si el formato de ids es distinto (alpha-2 frente a numérico)", () => {
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

  it("convierte feature.id numérico a string para poder cruzar", () => {
    const result = joinData({ features: [feature(724)], data: [{ code: "724", value: 1 }], getId });

    expect(result.joined.has("724")).toBe(true);
    expect(result.featuresWithoutData).toEqual([]);
  });

  it("usa getFeatureId cuando el id está en properties", () => {
    const result = joinData({
      features: [feature(undefined, { iso_a2: "ES" })],
      data: [{ code: "ES", value: 1 }],
      getId,
      getFeatureId: (f) => f.properties?.["iso_a2"] as string,
    });

    expect([...result.joined.keys()]).toEqual(["ES"]);
  });

  it("ignora las regiones sin id (no se pueden cruzar ni nombrar)", () => {
    const result = joinData({ features: [feature(undefined), feature("A")], data: [], getId });

    expect(result.featuresWithoutData).toEqual(["A"]);
  });

  it("conserva el primer dato y reporta los ids duplicados", () => {
    const rows: Row[] = [
      { code: "A", value: 1 },
      { code: "A", value: 99 },
    ];

    const result = joinData({ features: [feature("A")], data: rows, getId });

    expect(result.joined.get("A")).toBe(rows[0]);
    expect(result.duplicateDataIds).toEqual(["A"]);
  });

  it("trata un dato con value null como cruzado (null ≠ sin dato)", () => {
    const result = joinData({
      features: [feature("A")],
      data: [{ code: "A", value: null }],
      getId,
    });

    expect(result.joined.has("A")).toBe(true);
    expect(result.featuresWithoutData).toEqual([]);
  });

  it("no repite ids de regiones duplicadas en la geometría", () => {
    const result = joinData({ features: [feature("A"), feature("A")], data: [], getId });

    expect(result.featuresWithoutData).toEqual(["A"]);
  });

  it("devuelve todo vacío con entradas vacías", () => {
    const result = joinData({ features: [], data: [], getId });

    expect(result).toEqual({
      joined: new Map(),
      unmatchedData: [],
      featuresWithoutData: [],
      duplicateDataIds: [],
    });
  });

  describe("con world-atlas real", () => {
    const { features } = toFeatureCollection({
      geography: countries110m as unknown as Topology,
      objectName: "countries",
    });

    it("cruza con ISO numérico y falla con alpha-2: el problema real del proyecto", () => {
      const numeric = joinData({ features, data: [{ code: "724", value: 1 }], getId });
      const alpha2 = joinData({ features, data: [{ code: "ES", value: 1 }], getId });

      expect(numeric.joined.has("724")).toBe(true);
      expect(numeric.unmatchedData).toEqual([]);
      expect(alpha2.joined.size).toBe(0);
      expect(alpha2.unmatchedData).toEqual(["ES"]);
    });
  });
});
