import type { LabelBox } from "./marker-labels";

/**
 * Where the tooltip of a marker goes. Pure: the caller measures the marker, the tooltip and the visible area.
 *
 * The tooltip is anchored to the marker (not to the cursor): it tries the top, then the bottom, right and left, and takes
 * the first side where it fits entirely. On the top and bottom it is centered on the marker and, if that would cross the
 * edge, slid sideways (`shift`) until it fits; the same on the left and right, vertically.
 */

export type TooltipSide = "top" | "bottom" | "right" | "left";

export const TOOLTIP_SIDE_ORDER: readonly TooltipSide[] = ["top", "bottom", "right", "left"];

export const DEFAULT_TOOLTIP_GAP = 8;

export type TooltipSize = { width: number; height: number };

export type ChooseTooltipSideParams = {
  /** The marker's box. */
  anchor: LabelBox;
  tooltip: TooltipSize;
  /** The visible area (the markers' layer). */
  bounds: LabelBox;
  /** Space between the marker and the tooltip, in px. Defaults to 8. */
  gap?: number;
};

export type TooltipPlacement = {
  side: TooltipSide;
  /** px to slide along the side's free axis (x for top and bottom, y for left and right), from the centered position. */
  shift: number;
};

/** How far a box sticks out of the bounds on one axis (0 when it fits). */
const overflow = (start: number, end: number, min: number, max: number): number =>
  Math.max(0, min - start) + Math.max(0, end - max);

/**
 * The best side and the slide that keeps the tooltip inside the bounds. When no side fits, the one that sticks out the
 * least wins (the top on a tie).
 */
export const chooseTooltipSide = ({
  anchor,
  tooltip,
  bounds,
  gap = DEFAULT_TOOLTIP_GAP,
}: ChooseTooltipSideParams): TooltipPlacement => {
  const cx = (anchor.x0 + anchor.x1) / 2;
  const cy = (anchor.y0 + anchor.y1) / 2;
  let best: (TooltipPlacement & { cost: number }) | null = null;

  for (const side of TOOLTIP_SIDE_ORDER) {
    const vertical = side === "top" || side === "bottom";
    // Main axis: the box beside the marker.
    const [m0, m1] = vertical
      ? side === "top"
        ? [anchor.y0 - gap - tooltip.height, anchor.y0 - gap]
        : [anchor.y1 + gap, anchor.y1 + gap + tooltip.height]
      : side === "left"
        ? [anchor.x0 - gap - tooltip.width, anchor.x0 - gap]
        : [anchor.x1 + gap, anchor.x1 + gap + tooltip.width];
    const mainCost = vertical
      ? overflow(m0, m1, bounds.y0, bounds.y1)
      : overflow(m0, m1, bounds.x0, bounds.x1);

    // Cross axis: centered on the marker, then slid back inside the bounds.
    const half = (vertical ? tooltip.width : tooltip.height) / 2;
    const center = vertical ? cx : cy;
    const [lo, hi] = vertical ? [bounds.x0, bounds.x1] : [bounds.y0, bounds.y1];
    let shift = 0;
    if (center - half < lo) shift = lo - (center - half);
    else if (center + half > hi) shift = hi - (center + half);
    // A tooltip wider than the area cannot fit on this axis: whatever is left counts as cost.
    const crossCost = overflow(center - half + shift, center + half + shift, lo, hi);

    const cost = mainCost + crossCost;
    if (best === null || cost < best.cost) best = { side, shift, cost };
    if (cost === 0) break;
  }
  // `best` is set: the order is not empty.
  const { side, shift } = best as TooltipPlacement & { cost: number };
  return { side, shift };
};
