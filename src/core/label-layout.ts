import type { CameraTransform, Size } from "./camera";

/**
 * Collision avoidance for the region-names layer. Pure: no React, no DOM, no text measuring (the
 * width of a label is estimated from its character count), so it is tested without a browser.
 *
 * Labels keep a CONSTANT size on screen (the layer counter-scales them), so the collision runs in
 * SCREEN pixels: zooming in moves the anchors apart and the boxes stop overlapping, which is exactly
 * what reveals the lower-priority labels.
 */

export type LabelCandidate = {
  id: string;
  text: string;
  /** Anchor on the canvas (already projected), e.g. the pole of inaccessibility of the region. */
  x: number;
  y: number;
  /** Higher wins a collision. By default, the region's projected area. */
  priority: number;
};

export type PlaceLabelsParams = {
  candidates: readonly LabelCandidate[];
  camera: CameraTransform;
  /** The view in screen pixels (the canvas at `k = 1`). */
  view: Size;
  /** Font size in px; sets the height of the boxes and the estimated width. */
  fontSize?: number;
  /** Extra space kept between two labels, in px. */
  padding?: number;
};

export const DEFAULT_LABEL_FONT_SIZE = 11;
export const DEFAULT_LABEL_PADDING = 2;

/** Average glyph width as a fraction of the font size (a proportional sans-serif). */
const GLYPH_WIDTH_RATIO = 0.58;
const LINE_HEIGHT_RATIO = 1.2;

type Box = { x0: number; y0: number; x1: number; y1: number };

const overlaps = (a: Box, b: Box): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * The ids of the labels that fit, in priority order. A greedy pass: the highest priority is placed
 * first and every later label that would overlap an already-placed one (or that falls outside the
 * view) is dropped. Ties are broken by id so the result is deterministic.
 */
export const placeLabels = ({
  candidates,
  camera,
  view,
  fontSize = DEFAULT_LABEL_FONT_SIZE,
  padding = DEFAULT_LABEL_PADDING,
}: PlaceLabelsParams): string[] => {
  const height = fontSize * LINE_HEIGHT_RATIO;
  const ordered = [...candidates].sort(
    (a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const placed: Box[] = [];
  const visible: string[] = [];
  for (const candidate of ordered) {
    if (candidate.text === "") continue;
    const sx = candidate.x * camera.k + camera.x;
    const sy = candidate.y * camera.k + camera.y;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

    const halfWidth = (candidate.text.length * fontSize * GLYPH_WIDTH_RATIO) / 2 + padding;
    const halfHeight = height / 2 + padding;
    const box: Box = {
      x0: sx - halfWidth,
      y0: sy - halfHeight,
      x1: sx + halfWidth,
      y1: sy + halfHeight,
    };
    // A label that does not fully fit in the view would be clipped by the SVG: it is hidden.
    if (box.x0 < 0 || box.y0 < 0 || box.x1 > view.width || box.y1 > view.height) continue;
    if (placed.some((other) => overlaps(box, other))) continue;

    placed.push(box);
    visible.push(candidate.id);
  }
  return visible;
};

/**
 * Zoom level as a whole number (`k = 1` → 0, `k = 2` → 1, `k = 4` → 2…). It is published as
 * `data-zoom-bucket` so a stylesheet can show or hide things per level without any JS.
 */
export const zoomBucket = (k: number): number =>
  Number.isFinite(k) && k > 0 ? Math.max(0, Math.floor(Math.log2(k) + 1e-9)) : 0;
