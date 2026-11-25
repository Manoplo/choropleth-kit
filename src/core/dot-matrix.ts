// The dot-matrix renderer: the map drawn as a lattice of dots, each one belonging to the region under its
// center and always drawn whole (a border never cuts a dot). Pure geometry on PROJECTED coordinates (canvas
// px), computed once per geometry and size, never per frame.

import type { Point } from "./variants";

export type DotLattice = "hex" | "square";

export type DotMatrixOptions = {
  /** Distance between the centers of neighboring dots, in canvas px. Defaults to 6. */
  gap?: number;
  /** Dot diameter as a fraction of `gap`, from 0.05 to 1. Defaults to 0.7. */
  size?: number;
  /** `"hex"` (offset rows, the default) or `"square"`. */
  lattice?: DotLattice;
};

export type ResolvedDotMatrix = { gap: number; size: number; lattice: DotLattice };

export const DEFAULT_DOT_GAP = 6;
export const DEFAULT_DOT_SIZE = 0.7;
/** A smaller gap would mean hundreds of thousands of dots on an ordinary map. */
export const MIN_DOT_GAP = 2;
const MIN_DOT_SIZE = 0.05;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** The options with their defaults; out-of-range values are clamped. */
export const normalizeDotMatrix = ({
  gap,
  size,
  lattice,
}: DotMatrixOptions = {}): ResolvedDotMatrix => ({
  gap: finite(gap) && gap > 0 ? Math.max(MIN_DOT_GAP, gap) : DEFAULT_DOT_GAP,
  size: finite(size) ? Math.min(1, Math.max(MIN_DOT_SIZE, size)) : DEFAULT_DOT_SIZE,
  lattice: lattice === "square" ? "square" : "hex",
});

/**
 * The rings of a projected polygon path, as `geoPath` writes it (`M x,y L x,y … Z`). Only the `M` and `L`
 * points are read: the arcs of point geometries are not areas, and rings with fewer than 3 points are dropped.
 */
export const parsePathRings = (d: string): Point[][] => {
  const rings: Point[][] = [];
  let ring: Point[] = [];
  const close = () => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  for (const [, command, args = ""] of d.matchAll(/([a-zA-Z])([^a-df-zA-DF-Z]*)/g)) {
    if (command === "M") close();
    if (command === "M" || command === "L") {
      const [x, y] = args.split(/[\s,]+/).filter((part) => part !== "");
      const point: Point = [Number(x), Number(y)];
      if (finite(point[0]) && finite(point[1])) ring.push(point);
    } else if (command === "Z" || command === "z") {
      close();
    }
  }
  close();
  return rings;
};

export type DotShape = {
  /** The region's projected path (`d`). */
  path: string;
  /** It must be visible: if no dot center falls inside it, the nearest free dot is given to it. */
  keep?: boolean;
};

export type BuildDotMatrixParams = {
  shapes: readonly DotShape[];
  /** Canvas size in px: the lattice covers exactly this box. */
  width: number;
  height: number;
  gap: number;
  lattice: DotLattice;
};

/** Area-weighted centroid of a ring; the mean of its vertices if the ring has no area. */
const ringCentroid = (ring: readonly Point[]): { at: Point; area: number } => {
  let area = 0;
  let cx = 0;
  let cy = 0;
  ring.forEach(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length] as Point;
    const cross = x * ny - nx * y;
    area += cross;
    cx += (x + nx) * cross;
    cy += (y + ny) * cross;
  });
  if (Math.abs(area) < 1e-6) {
    const sum = ring.reduce<Point>(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0]);
    return { at: [sum[0] / ring.length, sum[1] / ring.length], area: 0 };
  }
  return { at: [cx / (3 * area), cy / (3 * area)], area: Math.abs(area / 2) };
};

/** How many rows and columns around its center a region without dots may borrow one from. */
const RESCUE_REACH = 2;

/**
 * The dots of each shape, in the order of `shapes`. A dot belongs to the shape that contains its center
 * (even-odd rule, so holes stay empty); where shapes overlap, the later one wins, as when painting.
 *
 * It scans row by row (the crossings of each ring's edges with that row, then the dots between each pair),
 * so the cost follows the edges and the dots, not their product.
 */
export const buildDotMatrix = ({
  shapes,
  width,
  height,
  gap,
  lattice,
}: BuildDotMatrixParams): Point[][] => {
  const dots: Point[][] = shapes.map(() => []);
  if (!(width > 0) || !(height > 0) || !(gap > 0)) return dots;

  const rowStep = lattice === "hex" ? (gap * Math.sqrt(3)) / 2 : gap;
  const half = gap / 2;
  const rows = Math.max(0, Math.ceil((height - half) / rowStep));
  const offsetOf = (row: number) => half + (lattice === "hex" && row % 2 === 1 ? half : 0);
  const columnsOf = (row: number) => Math.max(0, Math.ceil((width - offsetOf(row)) / gap));
  const yOf = (row: number) => half + row * rowStep;
  const xOf = (row: number, column: number) => offsetOf(row) + column * gap;

  // Which shape owns each lattice point (-1: none, the ocean).
  const owners = Array.from({ length: rows }, (_, row) => new Int32Array(columnsOf(row)).fill(-1));
  const ringsOf = shapes.map((shape) => parsePathRings(shape.path));

  ringsOf.forEach((rings, index) => {
    const crossings = new Map<number, number[]>();
    for (const ring of rings) {
      ring.forEach(([ax, ay], i) => {
        const [bx, by] = ring[(i + 1) % ring.length] as Point;
        if (ay === by) return;
        // Half-open [top, bottom): a vertex shared by two edges counts once.
        const first = Math.max(0, Math.ceil((Math.min(ay, by) - half) / rowStep));
        const end = Math.min(rows, Math.ceil((Math.max(ay, by) - half) / rowStep));
        for (let row = first; row < end; row += 1) {
          const x = ax + ((yOf(row) - ay) * (bx - ax)) / (by - ay);
          const found = crossings.get(row);
          if (found === undefined) crossings.set(row, [x]);
          else found.push(x);
        }
      });
    }
    for (const [row, xs] of crossings) {
      const owned = owners[row] as Int32Array;
      xs.sort((a, b) => a - b);
      for (let pair = 0; pair + 1 < xs.length; pair += 2) {
        const offset = offsetOf(row);
        const first = Math.max(0, Math.ceil(((xs[pair] as number) - offset) / gap));
        const end = Math.min(owned.length, Math.ceil(((xs[pair + 1] as number) - offset) / gap));
        if (end > first) owned.fill(index, first, end);
      }
    }
  });

  // Small regions (Luxembourg, Singapore) can fall between dots: they borrow the nearest one that is free
  // or that its owner can spare.
  const counts = new Int32Array(shapes.length);
  for (const owned of owners) {
    for (const owner of owned) if (owner >= 0) counts[owner] = (counts[owner] as number) + 1;
  }
  shapes.forEach((shape, index) => {
    if (shape.keep !== true || counts[index] !== 0) return;
    const main = (ringsOf[index] ?? [])
      .map(ringCentroid)
      .reduce<{ at: Point; area: number } | null>(
        (best, ring) => (best === null || ring.area > best.area ? ring : best),
        null,
      );
    if (main === null) return;
    const [cx, cy] = main.at;
    const nearestRow = Math.round((cy - half) / rowStep);
    let best: { row: number; column: number; distance: number } | null = null;
    for (let row = nearestRow - RESCUE_REACH; row <= nearestRow + RESCUE_REACH; row += 1) {
      const owned = owners[row];
      if (owned === undefined) continue;
      const nearestColumn = Math.round((cx - offsetOf(row)) / gap);
      for (
        let column = nearestColumn - RESCUE_REACH;
        column <= nearestColumn + RESCUE_REACH;
        column += 1
      ) {
        const owner = owned[column];
        if (owner === undefined || (owner >= 0 && (counts[owner] as number) < 2)) continue;
        const distance = Math.hypot(xOf(row, column) - cx, yOf(row) - cy);
        if (best === null || distance < best.distance) best = { row, column, distance };
      }
    }
    if (best === null) return;
    const owned = owners[best.row] as Int32Array;
    const previous = owned[best.column] as number;
    if (previous >= 0) counts[previous] = (counts[previous] as number) - 1;
    owned[best.column] = index;
    counts[index] = 1;
  });

  owners.forEach((owned, row) => {
    owned.forEach((owner, column) => {
      if (owner >= 0) dots[owner]?.push([xOf(row, column), yOf(row)]);
    });
  });
  return dots;
};

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * All the dots as ONE path of zero-length segments: with `stroke-linecap: round`, each one paints a circle
 * whose diameter is the stroke width. A handful of paths instead of thousands of `<circle>`s.
 */
export const dotsToPath = (dots: readonly Point[]): string =>
  dots.map(([x, y]) => `M${round(x)},${round(y)}h0`).join("");
