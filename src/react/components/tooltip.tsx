import type { ReactNode } from "react";
import type { ItemContext } from "../map-item";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

/** What the tooltip receives: the `MapItem` (region or point) + value, color and name. */
export type TooltipContext<TDatum> = ItemContext<TDatum>;

export type TooltipProps<TDatum> = {
  className?: string;
  /** Tooltip content. By default: the region's name and formatted value. */
  children?: (context: TooltipContext<TDatum>) => ReactNode;
};

const OFFSET = 12;

const DefaultContent = <TDatum,>({
  label,
  formattedValue,
  drillable,
  noData,
  drillHint,
}: TooltipContext<TDatum> & { noData: string; drillHint: string }) => {
  return (
    <>
      <strong>{label}</strong>
      <div>{formattedValue === "" ? noData : formattedValue}</div>
      {/* Only what is true is promised: the footer appears only if you can go down from here. */}
      {drillable && <div className="cm-tooltip__hint">{drillHint}</div>}
    </>
  );
};

/**
 * HTML tooltip next to the cursor. The library decides WHAT (typed context) and WHERE; you, the look.
 *
 * It subscribes by itself to the hover and the cursor (`useMapStore`): moving it re-renders neither
 * `Root` nor the regions. Without measuring its size, it flips to the other side of the cursor in the
 * right / bottom half of the map so as not to overflow the container.
 */
export const Tooltip = <TDatum,>({ className, children }: TooltipProps<TDatum>) => {
  const { choropleth, store, classNames } = useChoroplethContext<TDatum>();
  const point = useMapStore(store, (s) => s.pointer);
  const hovered = useMapStore(store, (s) => s.hovered);
  const touch = useMapStore(store, (s) => s.pointerType === "touch");

  const context = hovered === null ? undefined : choropleth.getItemContext(hovered);
  if (context === undefined || point === null) return null;

  const flipX = point.x > choropleth.width / 2;
  const flipY = point.y > choropleth.height / 2;

  return (
    <div
      role="tooltip"
      className={cx(
        "cm-tooltip",
        // Only the default content has a box; if you pass `children`, the look is yours.
        children === undefined && "cm-tooltip--default",
        classNames.tooltip,
        className,
      )}
      style={{
        position: "absolute",
        left: point.x + (flipX ? -OFFSET : OFFSET),
        top: point.y + (flipY ? -OFFSET : OFFSET),
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
        pointerEvents: "none",
      }}
    >
      {children === undefined ? (
        <DefaultContent
          {...context}
          noData={choropleth.labels.noData}
          // With a finger there is no click: the first tap shows this and the second drills down.
          drillHint={touch ? choropleth.labels.tapAgainHint : choropleth.labels.drillHint}
        />
      ) : (
        children(context)
      )}
    </div>
  );
};
