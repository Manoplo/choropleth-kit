import type { CSSProperties } from "react";
import { isFitTransform, type Corner } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

export type ZoomControlsProps = {
  /** Esquina del mapa. Por defecto `"bottom-right"`. */
  position?: Corner;
  /** Mostrar «restablecer vista». Por defecto `true`. */
  reset?: boolean;
  className?: string;
};

const CORNERS: Record<Corner, CSSProperties> = {
  "top-left": { top: 12, left: 12 },
  "top-right": { top: 12, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "bottom-right": { bottom: 12, right: 12 },
};

/** Zoom con el mismo factor que el teclado y el doble clic. */
const STEP = 2;

/**
 * Botones `+` / `−` / `⟲` (dd.md §11.1.2). Son `<button>` reales (foco, teclado y lector de
 * pantalla gratis), con `aria-label` desde `labels`.
 *
 * Se deshabilitan según la cámara confirmada: `−` en el zoom mínimo, `+` en el máximo y `⟲` si ya
 * estás en el encaje (no promete lo que no puede hacer). Se suscriben a la cámara por el store: un
 * gesto no re-renderiza el mapa, solo estos botones y solo cuando el gesto termina.
 *
 * Opt-in: en el preset, `zoom={{ controls: true }}`; en el compound, ponlo donde quieras.
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
