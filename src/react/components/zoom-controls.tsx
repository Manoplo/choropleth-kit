import type { CSSProperties } from "react";
import { isFitTransform, type Corner } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

export type ZoomControlsProps = {
  /** Corner of the map. Defaults to `"bottom-right"`. */
  position?: Corner;
  /** Show "reset view". Defaults to `true`. */
  reset?: boolean;
  className?: string;
};

const CORNERS: Record<Corner, CSSProperties> = {
  "top-left": { top: 12, left: 12 },
  "top-right": { top: 12, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "bottom-right": { bottom: 12, right: 12 },
};

/** Zoom with the same factor as the keyboard and the double click. */
const STEP = 2;

/**
 * `+` / `−` / `⟲` buttons. They are real `<button>`s (focus, keyboard and screen
 * reader for free), with `aria-label` from `labels`.
 *
 * They are disabled according to the confirmed camera: `−` at minimum zoom, `+` at maximum and `⟲` if
 * you are already at the fit (it does not promise what it cannot do). They subscribe to the camera
 * through the store: a gesture does not re-render the map, only these buttons and only when the gesture ends.
 *
 * Opt-in: in the preset, `zoom={{ controls: true }}`; in the compound, put it wherever you like.
 */
export const ZoomControls = ({
  position = "bottom-right",
  reset = true,
  className,
}: ZoomControlsProps) => {
  const { choropleth, store, classNames } = useChoroplethContext();
  const { zoom, labels } = choropleth;
  const camera = useMapStore(store, (s) => s.camera);
  if (zoom === null) return null;

  const atMax = camera.k >= zoom.max - 1e-6;
  const atMin = camera.k <= zoom.min + 1e-6;

  return (
    <div
      className={cx("cm-zoom-controls", classNames.controls, className)}
      style={{ position: "absolute", ...CORNERS[position] }}
    >
      <button
        type="button"
        className={cx("cm-zoom-button", classNames.controlButton)}
        aria-label={labels.zoomIn}
        disabled={atMax}
        onClick={() => void store.getZoom()?.zoomBy(STEP)}
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className={cx("cm-zoom-button", classNames.controlButton)}
        aria-label={labels.zoomOut}
        disabled={atMin}
        onClick={() => void store.getZoom()?.zoomBy(1 / STEP)}
      >
        <span aria-hidden="true">−</span>
      </button>
      {reset && (
        <button
          type="button"
          className={cx("cm-zoom-button", classNames.controlButton)}
          aria-label={labels.resetView}
          disabled={isFitTransform(camera)}
          onClick={() => void store.getZoom()?.resetView()}
        >
          <span aria-hidden="true">⟲</span>
        </button>
      )}
    </div>
  );
};
