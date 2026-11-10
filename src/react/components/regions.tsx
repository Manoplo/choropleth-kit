import { memo, type CSSProperties, type SyntheticEvent } from "react";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

type RegionPathProps = {
  id: string;
  d: string;
  fill: string;
  drillable: boolean;
  /** No value to paint (no data row, or a null value): `data-empty`, to style them via CSS. */
  empty: boolean;
  /** Legend class index, or `"empty"`: the CSS highlights a class by dimming the rest, without re-rendering. */
  dataClass: string;
  /** The consumer's classes (`classNames.region` + `getRegionStyle().className`). */
  className: string | undefined;
  /** From `getRegionStyle`; `undefined` = the CSS one (1). */
  opacity: number | undefined;
  /** It is the region being drilled into (the rest dims; if it takes long, it "breathes"). */
  target: boolean;
  /** 0…1: delay of its entrance in the reveal. */
  wave: number | undefined;
};

// Only re-renders if its color or path changes: neither hover nor selection touch it (`Selection`
// paints that on top). All props are primitives so that `memo` works. `fill` goes in `style` (not as
// an attribute) because it can be `var(--cm-empty-fill, …)`.
const RegionPath = memo(
  ({
    id,
    d,
    fill,
    drillable,
    empty,
    dataClass,
    className,
    opacity,
    target,
    wave,
  }: RegionPathProps) => (
    <path
      className={cx("cm-region", className)}
      data-region-id={id}
      data-empty={empty ? "" : undefined}
      data-class={dataClass}
      data-drillable={drillable ? "" : undefined}
      data-drill-target={target ? "" : undefined}
      d={d}
      style={
        {
          fill,
          ...(opacity === undefined ? undefined : { opacity }),
          ...(wave === undefined ? undefined : { "--cm-wave": wave }),
        } as CSSProperties
      }
    />
  ),
);

// Regions without an id (Kosovo in world-atlas): they are visible, but cannot be joined or selected.
const AnonymousPath = memo(({ d, fill }: { d: string; fill: string }) => (
  <path className="cm-region cm-region--anonymous" d={d} style={{ fill, cursor: "default" }} />
));

const regionIdFrom = (event: SyntheticEvent): string | null =>
  (event.target as Element).closest?.("[data-region-id]")?.getAttribute("data-region-id") ?? null;

/**
 * The colored regions. ONE listener per event type on the `<g>` (delegation) instead of one
 * per `<path>`: with hundreds of regions it is less work and no closures are recreated.
 * Pointer Events: the same code for mouse, pen and touch.
 */
export const Regions = () => {
  const { choropleth, store, classNames } = useChoroplethContext();
  const {
    regions,
    anonymousPaths,
    emptyFill,
    borders,
    clickable,
    hoverItem,
    clickItem,
    drillFocusId,
  } = choropleth;

  const known = new Set(regions.map((region) => region.id));
  const regionRef = (event: SyntheticEvent) => {
    const id = regionIdFrom(event);
    return id !== null && known.has(id) ? ({ kind: "region", id } as const) : null;
  };

  // With GeoJSON there are no `borders` (mesh): the CSS draws each region's outline.
  const outlined = borders === null;

  return (
    <g
      className={cx("cm-regions", classNames.regions)}
      data-outlined={outlined ? "" : undefined}
      style={clickable ? { cursor: "pointer" } : undefined}
      onClick={(event) => {
        const ref = regionRef(event);
        if (ref !== null) clickItem(ref);
      }}
      onPointerOver={(event) => {
        const ref = regionRef(event);
        if (ref !== null) {
          hoverItem(ref);
        } else if (store.getState().hovered?.kind === "region") {
          // Cursor over the ocean (inside the <g> but outside every region). If the hover belongs to a
          // point, it is not ours: the bubbles handle it.
          hoverItem(null);
        }
      }}
      onPointerLeave={(event) => {
        // On touch the browser sends "leave" when the finger lifts: it is not leaving the map.
        if (event.pointerType === "touch") return;
        if (store.getState().hovered?.kind === "region") hoverItem(null);
      }}
    >
      {anonymousPaths.map((d, index) => (
        <AnonymousPath key={`anonymous-${index}`} d={d} fill={emptyFill} />
      ))}
      {regions.map((region) => (
        <RegionPath
          key={region.id}
          id={region.id}
          d={region.path}
          fill={region.fill}
          drillable={region.drillable}
          empty={region.value === null}
          dataClass={region.classIndex === null ? "empty" : String(region.classIndex)}
          className={cx(classNames.region, region.className)}
          opacity={region.opacity}
          target={region.id === drillFocusId}
          wave={region.wave}
        />
      ))}
    </g>
  );
};
