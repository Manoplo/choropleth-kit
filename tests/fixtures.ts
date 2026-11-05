import type { Topology } from "topojson-specification";

// Dos cuadrados 1×1 pegados (A y B). Detalle del dibujo en src/core/geography.test.ts.
export const twoSquares: Topology = {
  type: "Topology",
  objects: {
    squares: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "A", properties: { name: "Alpha" }, arcs: [[0, 1]] },
        { type: "Polygon", id: "B", properties: { name: "Beta" }, arcs: [[2, ~0]] },
      ],
    },
  },
  arcs: [
    [
      [1, 0],
      [1, 1],
    ],
    [
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
    ],
    [
      [1, 0],
      [2, 0],
      [2, 1],
      [1, 1],
    ],
  ],
};
