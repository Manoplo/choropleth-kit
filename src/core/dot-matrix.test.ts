import { geoPath, geoIdentity } from "d3-geo";
import {
  buildDotMatrix,
  DEFAULT_DOT_GAP,
  DEFAULT_DOT_SIZE,
  dotsToPath,
  MIN_DOT_GAP,
  parsePathRings,
  normalizeDotMatrix,
} from "./dot-matrix";

const rect = (x0: number, y0: number, x1: number, y1: number): string =>
  `M${x0},${y0}L${x1},${y0}L${x1},${y1}L${x0},${y1}Z`;

describe("normalizeDotMatrix", () => {
  it("fills in the defaults", () => {
    expect(normalizeDotMatrix()).toEqual({
      gap: DEFAULT_DOT_GAP,
      size: DEFAULT_DOT_SIZE,
      lattice: "hex",
    });
  });

  it("clamps out-of-range values and ignores invalid ones", () => {
    expect(normalizeDotMatrix({ gap: 0.5, size: 3, lattice: "square" })).toEqual({
      gap: MIN_DOT_GAP,
      size: 1,
      lattice: "square",
    });
    expect(normalizeDotMatrix({ gap: -4, size: Number.NaN })).toEqual({
      gap: DEFAULT_DOT_GAP,
      size: DEFAULT_DOT_SIZE,
      lattice: "hex",
    });
    expect(normalizeDotMatrix({ size: 0 }).size).toBe(0.05);
  });
});

describe("parsePathRings", () => {
  it("reads one ring per subpath, closed or not", () => {
    const rings = parsePathRings(`${rect(0, 0, 2, 2)}M5,5L6,5L6,6`);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
  });

  it("reads negative, decimal and exponent coordinates", () => {
    expect(parsePathRings("M-1.5,2e-3L4,-5L6,7Z")[0]).toEqual([
      [-1.5, 0.002],
      [4, -5],
      [6, 7],
    ]);
  });

  it("reads what d3's geoPath writes", () => {
    const d = geoPath(geoIdentity())({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ],
      ],
    });
    expect(parsePathRings(d ?? "")[0]?.length).toBeGreaterThanOrEqual(4);
  });

  it("ignores point geometries (arcs) and degenerate rings", () => {
    const point = geoPath(geoIdentity())({ type: "Point", coordinates: [1, 1] });
    expect(parsePathRings(point ?? "")).toEqual([]);
    expect(parsePathRings("M0,0L1,1Z")).toEqual([]);
    expect(parsePathRings("")).toEqual([]);
  });
});

describe("buildDotMatrix", () => {
  const size = { width: 40, height: 40, gap: 10 } as const;

  it("a square lattice covers a full-canvas region with one dot per cell", () => {
    const [dots] = buildDotMatrix({
      ...size,
      lattice: "square",
      shapes: [{ path: rect(0, 0, 40, 40) }],
    });
    expect(dots).toHaveLength(16);
    expect(dots?.[0]).toEqual([5, 5]);
    expect(dots?.at(-1)).toEqual([35, 35]);
  });

  it("a hex lattice offsets every other row by half a gap, closer together", () => {
    const [dots = []] = buildDotMatrix({
      ...size,
      lattice: "hex",
      shapes: [{ path: rect(0, 0, 40, 40) }],
    });
    const rows = [...new Set(dots.map(([, y]) => y))];
    expect(rows[1]! - rows[0]!).toBeCloseTo(10 * (Math.sqrt(3) / 2));
    expect(dots.find(([, y]) => y === rows[0])?.[0]).toBe(5);
    expect(dots.find(([, y]) => y === rows[1])?.[0]).toBe(10);
    // No dot center outside the canvas.
    expect(dots.every(([x, y]) => x < 40 && y < 40)).toBe(true);
  });

  it("each dot goes to the region under its center; later shapes win an overlap", () => {
    const [left = [], right = []] = buildDotMatrix({
      ...size,
      lattice: "square",
      shapes: [{ path: rect(0, 0, 30, 40) }, { path: rect(20, 0, 40, 40) }],
    });
    expect(left).toHaveLength(8);
    expect(right).toHaveLength(8);
    expect(left.every(([x]) => x < 20)).toBe(true);
  });

  it("holes stay empty (even-odd)", () => {
    const [dots] = buildDotMatrix({
      ...size,
      lattice: "square",
      shapes: [{ path: `${rect(0, 0, 40, 40)}${rect(10, 10, 30, 30)}` }],
    });
    expect(dots).toHaveLength(12);
  });

  it("concave shapes are filled only inside", () => {
    // An "L": the top-right quadrant is outside.
    const [dots = []] = buildDotMatrix({
      ...size,
      lattice: "square",
      shapes: [{ path: "M0,0L20,0L20,20L40,20L40,40L0,40Z" }],
    });
    expect(dots).toHaveLength(12);
    expect(dots.some(([x, y]) => x > 20 && y < 20)).toBe(false);
  });

  it("clips to the canvas", () => {
    const [dots] = buildDotMatrix({
      ...size,
      lattice: "square",
      shapes: [{ path: rect(-100, -100, 100, 100) }],
    });
    expect(dots).toHaveLength(16);
  });

  describe("regions too small to catch a dot", () => {
    const tiny = rect(11, 11, 12, 12);

    it("get none by default", () => {
      const [dots] = buildDotMatrix({ ...size, lattice: "square", shapes: [{ path: tiny }] });
      expect(dots).toEqual([]);
    });

    it("with `keep`, get the nearest lattice point", () => {
      const [dots] = buildDotMatrix({
        ...size,
        lattice: "square",
        shapes: [{ path: tiny, keep: true }],
      });
      expect(dots).toEqual([[15, 15]]);
    });

    it("take it from a neighbor that can spare it", () => {
      const [big = [], small] = buildDotMatrix({
        ...size,
        lattice: "square",
        shapes: [{ path: rect(0, 0, 40, 40) }, { path: tiny, keep: true }],
      });
      // The big one painted first, the tiny one covers no center.
      expect(small).toEqual([[15, 15]]);
      expect(big).toHaveLength(15);
    });

    it("two of them in the same place get different dots", () => {
      const [a = [], b = []] = buildDotMatrix({
        ...size,
        lattice: "square",
        shapes: [
          { path: tiny, keep: true },
          { path: tiny, keep: true },
        ],
      });
      expect(a).toHaveLength(1);
      expect(b).toHaveLength(1);
      expect(a[0]).not.toEqual(b[0]);
    });

    it("get none if they are far outside the canvas", () => {
      const [dots] = buildDotMatrix({
        ...size,
        lattice: "square",
        shapes: [{ path: rect(200, 200, 201, 201), keep: true }],
      });
      expect(dots).toEqual([]);
    });
  });

  it("returns an empty list per shape for a canvas without size", () => {
    expect(
      buildDotMatrix({
        shapes: [{ path: rect(0, 0, 1, 1) }],
        width: 0,
        height: 40,
        gap: 10,
        lattice: "hex",
      }),
    ).toEqual([[]]);
  });
});

describe("dotsToPath", () => {
  it("writes a zero-length segment per dot, rounded", () => {
    expect(
      dotsToPath([
        [1, 2],
        [3.14159, 4],
      ]),
    ).toBe("M1,2h0M3.14,4h0");
    expect(dotsToPath([])).toBe("");
  });
});
