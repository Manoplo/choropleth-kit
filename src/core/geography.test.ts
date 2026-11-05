import type { FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import { toFeatureCollection, unwrapGeography } from "./geography";

// TopoJSON mínimo escrito a mano: dos cuadrados 1×1 pegados por un lado.
//
//   (0,1)──(1,1)──(2,1)
//     │  A   │  B   │
//   (0,0)──(1,0)──(2,0)
//
// El lado compartido x=1 se guarda UNA vez (arco 0). A lo recorre hacia delante (0) y
// B hacia atrás (~0 = -1). Esa reutilización es justo lo que hace pequeño al TopoJSON.
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
    // Segundo objeto, para probar `objectName`. Es una única geometría (no una colección).
    outline: { type: "Polygon", id: "OUT", arcs: [[0, 1]] },
  },
  arcs: [
    [
      [1, 0],
      [1, 1],
    ], // 0: lado compartido
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
    ], // 2: resto de B
  ],
};

describe("toFeatureCollection", () => {
  describe("con TopoJSON", () => {
    it("convierte la colección en un FeatureCollection conservando id y properties", () => {
      const fc = toFeatureCollection({ geography: twoSquares });

      expect(fc.type).toBe("FeatureCollection");
      expect(fc.features.map((f) => f.id)).toEqual(["A", "B"]);
      expect(fc.features[0]?.properties).toEqual({ name: "Alpha" });
    });

    it("reconstruye las coordenadas reales desde los arcos compartidos", () => {
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
      // B recorre el lado compartido en sentido inverso (~0), así que empieza en (1,0)
      // y vuelve a (1,0) pasando por (1,1) al final.
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

    it("usa el primer objeto cuando no se indica objectName", () => {
      const fc = toFeatureCollection({ geography: twoSquares });
      expect(fc.features).toHaveLength(2);
    });

    it("usa el objeto pedido con objectName", () => {
      const fc = toFeatureCollection({ geography: twoSquares, objectName: "outline" });
      expect(fc.features.map((f) => f.id)).toEqual(["OUT"]);
    });

    it("envuelve en FeatureCollection un objeto de una sola geometría", () => {
      // feature() devuelve aquí un Feature suelto; el contrato exige siempre colección.
      const fc = toFeatureCollection({ geography: twoSquares, objectName: "outline" });
      expect(fc.type).toBe("FeatureCollection");
      expect(Array.isArray(fc.features)).toBe(true);
    });

    it("deshace el transform (cuantización + delta-encoding) de TopoJSON", () => {
      const quantized: Topology = {
        type: "Topology",
        transform: { scale: [10, 10], translate: [100, 50] },
        objects: {
          sq: {
            type: "GeometryCollection",
            geometries: [{ type: "Polygon", id: "Q", arcs: [[0]] }],
          },
        },
        // Primer punto absoluto (0,0); el resto son diferencias respecto al anterior.
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

      // coordenada = punto acumulado × scale + translate
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

    it("lanza un error que lista los objetos disponibles si objectName no existe", () => {
      expect(() => toFeatureCollection({ geography: twoSquares, objectName: "nope" })).toThrow(
        /"nope" does not exist.*squares, outline/,
      );
    });

    it("lanza un error si la topología no tiene objetos", () => {
      const empty: Topology = { type: "Topology", objects: {}, arcs: [] };
      expect(() => toFeatureCollection({ geography: empty })).toThrow(
        /Available objects: \(none\)/,
      );
    });
  });

  describe("con GeoJSON", () => {
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

    it("devuelve el mismo objeto, sin copiarlo (referencia estable para useMemo)", () => {
      expect(toFeatureCollection({ geography: geojson })).toBe(geojson);
    });

    it("ignora objectName", () => {
      expect(toFeatureCollection({ geography: geojson, objectName: "lo-que-sea" })).toBe(geojson);
    });
  });

  describe("con entradas inválidas", () => {
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

  it("devuelve el dato tal cual, y saca `default` de un módulo ES", () => {
    expect(unwrapGeography(fc)).toBe(fc);
    expect(unwrapGeography({ default: fc })).toBe(fc);
  });
});
