import type { FeatureCollection } from "geojson";
import { twoSquares } from "../../tests/fixtures";
import { createBorders } from "./borders";

describe("createBorders", () => {
  it("devuelve solo la frontera compartida (una línea), sin la costa", () => {
    const borders = createBorders({ geography: twoSquares });

    expect(borders?.type).toBe("MultiLineString");
    expect(borders?.coordinates).toEqual([
      [
        [1, 0],
        [1, 1],
      ],
    ]);
  });

  it("con GeoJSON no hay topología: devuelve null", () => {
    const fc: FeatureCollection = { type: "FeatureCollection", features: [] };

    expect(createBorders({ geography: fc })).toBeNull();
  });

  it("un objectName inexistente devuelve null en vez de lanzar", () => {
    expect(createBorders({ geography: twoSquares, objectName: "nope" })).toBeNull();
  });

  it("una topología sin objetos devuelve null", () => {
    expect(createBorders({ geography: { type: "Topology", objects: {}, arcs: [] } })).toBeNull();
  });
});
