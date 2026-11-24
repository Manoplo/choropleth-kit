/**
 * Collision avoidance for the labels of markers. Pure: no React, no DOM.
 *
 * The boxes are MEASURED by the caller (`getBoundingClientRect` on the real elements), so unlike the region-names
 * layer there is no text-width estimate. A label fits when it is inside the visible area, is not on top of another
 * marker, and does not overlap a label that was placed before it (the higher priorities go first).
 */

export type LabelBox = { x0: number; y0: number; x1: number; y1: number };

export type MarkerLabelItem = {
  /** Unique per marker. */
  id: string;
  /** The label's box. */
  box: LabelBox;
  /** Higher wins a collision. Ties go to the one listed first. */
  priority: number;
};

export type MarkerObstacle = {
  /** The marker this shape belongs to: its own label may sit next to it, but never on top of another's. */
  ownerId: string;
  box: LabelBox;
};

/** Where a label goes relative to its marker. */
export type LabelPosition = "right" | "left" | "top" | "bottom";

/** The order tried when the position is automatic. */
export const LABEL_POSITION_ORDER: readonly LabelPosition[] = ["right", "left", "top", "bottom"];

/** The positions to try: the preferred one first, then the others in the usual order. */
export const labelPositionCandidates = (
  preferred: LabelPosition,
  auto: boolean,
): readonly LabelPosition[] =>
  auto ? [preferred, ...LABEL_POSITION_ORDER.filter((p) => p !== preferred)] : [preferred];

export const DEFAULT_MARKER_LABEL_PADDING = 2;

const overlaps = (a: LabelBox, b: LabelBox): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

const grow = (box: LabelBox, by: number): LabelBox => ({
  x0: box.x0 - by,
  y0: box.y0 - by,
  x1: box.x1 + by,
  y1: box.y1 + by,
});

const isValid = (box: LabelBox): boolean =>
  [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite) && box.x1 > box.x0 && box.y1 > box.y0;

/** Highest priority first; ties keep the order they were given in. Does not mutate. */
export const orderByPriority = <T extends { priority: number }>(items: readonly T[]): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.priority - a.item.priority || a.index - b.index)
    .map(({ item }) => item);

export type LabelPlacerParams = {
  /** The markers' own shapes: no other marker's label may cover them. */
  obstacles?: readonly MarkerObstacle[];
  /** The visible area; a label that does not fit entirely inside does not fit. */
  bounds?: LabelBox;
  /** Extra space kept between two labels, in px. Defaults to 2. */
  padding?: number;
};

export type LabelPlacer = {
  /** Does `box` fit for the marker `id`, given what has been placed so far? */
  fits: (id: string, box: LabelBox) => boolean;
  /** Reserve `box`: later labels must not overlap it. */
  place: (box: LabelBox) => void;
};

/**
 * A greedy placer: ask `fits` for each candidate position, `place` the one you keep. A box with no area (nothing
 * laid out, as in jsdom) always fits: there is nothing to measure, so there is no collision to resolve.
 */
export const createLabelPlacer = ({
  obstacles = [],
  bounds,
  padding = DEFAULT_MARKER_LABEL_PADDING,
}: LabelPlacerParams = {}): LabelPlacer => {
  const placed: LabelBox[] = [];
  return {
    fits: (id, box) => {
      if (!isValid(box)) return true;
      const outside =
        bounds !== undefined &&
        (box.x0 < bounds.x0 || box.y0 < bounds.y0 || box.x1 > bounds.x1 || box.y1 > bounds.y1);
      if (outside) return false;
      if (obstacles.some((o) => o.ownerId !== id && overlaps(box, o.box))) return false;
      const padded = grow(box, padding / 2);
      return !placed.some((other) => overlaps(padded, grow(other, padding / 2)));
    },
    place: (box) => {
      if (isValid(box)) placed.push(box);
    },
  };
};

export type HideCollidingLabelsParams = LabelPlacerParams & {
  labels: readonly MarkerLabelItem[];
};

/** The ids to HIDE when every label has a single, fixed position. */
export const hideCollidingLabels = ({
  labels,
  ...rest
}: HideCollidingLabelsParams): Set<string> => {
  const placer = createLabelPlacer(rest);
  const hidden = new Set<string>();
  for (const label of orderByPriority(labels)) {
    if (placer.fits(label.id, label.box)) placer.place(label.box);
    else hidden.add(label.id);
  }
  return hidden;
};
