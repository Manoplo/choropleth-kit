import { useLayoutEffect, type RefObject } from "react";
import {
  createLabelPlacer,
  labelPositionCandidates,
  orderByPriority,
  type LabelBox,
  type LabelPosition,
  type MarkerObstacle,
} from "../core";

const toBox = (rect: DOMRect): LabelBox => ({
  x0: rect.left,
  y0: rect.top,
  x1: rect.right,
  y1: rect.bottom,
});

type Entry = {
  id: string;
  element: HTMLElement;
  preferred: LabelPosition;
  auto: boolean;
  priority: number;
};

/**
 * Places the labels of markers so they do not collide: for each one, in priority order, it tries the preferred side and
 * (unless the consumer fixed `labelPosition`) the other three, and hides it if none fits (`data-hidden`, the CSS fades it
 * out). It writes `data-position` and `data-hidden` on `.cm-marker__label`.
 *
 * It MEASURES the real elements, so it needs a layout: it runs after every render of the layer (the layer re-renders when
 * the confirmed camera changes, never per frame) and does nothing in jsdom, where every box is empty. During a gesture
 * the result goes stale for a moment, like the region names. It writes attributes, not state: no extra render.
 */
export const useMarkerLabelLayout = (layerRef: RefObject<HTMLElement | null>): void => {
  // No dependency array on purpose: the labels, the markers and the camera are all in the DOM it measures.
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (layer === null) return;
    const elements = [...layer.querySelectorAll<HTMLElement>(".cm-marker__label")];
    if (elements.length === 0) return;

    // Start from the consumer's choice: a label moved or hidden last time may fit where it wants to be now.
    const entries: Entry[] = elements.map((element, index) => {
      const preferred = (element.dataset["preferred"] as LabelPosition | undefined) ?? "right";
      element.setAttribute("data-position", preferred);
      element.removeAttribute("data-hidden");
      return {
        id: String(index),
        element,
        preferred,
        auto: element.dataset["auto"] !== undefined,
        priority: Number(element.dataset["priority"] ?? 0) || 0,
      };
    });
    const bounds = toBox(layer.getBoundingClientRect());
    if (bounds.x1 <= bounds.x0 || bounds.y1 <= bounds.y0) return;

    // Every marker's shape is an obstacle for the other markers' labels.
    const idOf = new Map(entries.map((entry) => [entry.element, entry.id]));
    const obstacles: MarkerObstacle[] = [];
    for (const marker of layer.querySelectorAll<HTMLElement>(".cm-marker")) {
      const own = marker.querySelector<HTMLElement>(".cm-marker__label");
      const shape =
        marker.querySelector<HTMLElement>(".cm-marker__shape, .cm-marker__dot") ?? marker;
      obstacles.push({
        ownerId: (own !== null && idOf.get(own)) || "",
        box: toBox(shape.getBoundingClientRect()),
      });
    }

    // The layer clips its content: a label cut by its edge reads badly, so the visible area is its own box.
    const placer = createLabelPlacer({ obstacles, bounds });
    for (const entry of orderByPriority(entries)) {
      let chosen: LabelBox | null = null;
      for (const position of labelPositionCandidates(entry.preferred, entry.auto)) {
        entry.element.setAttribute("data-position", position);
        const box = toBox(entry.element.getBoundingClientRect());
        if (placer.fits(entry.id, box)) {
          chosen = box;
          break;
        }
      }
      if (chosen === null) {
        entry.element.setAttribute("data-position", entry.preferred);
        entry.element.setAttribute("data-hidden", "");
      } else {
        placer.place(chosen);
      }
    }
  });
};
