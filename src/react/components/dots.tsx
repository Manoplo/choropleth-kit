import { useMemo, useState } from "react";
import type { DotMatrixOptions } from "../../core";
import {
  buildDotMatrix,
  dotsToPath,
  normalizeDotMatrix,
  type DotShape,
} from "../../core/dot-matrix";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";

/** How much wider than the dot the halo of a highlighted region is. */
const HALO_SCALE = 1.4;

const sameShapes = (a: readonly DotShape[], b: readonly DotShape[]): boolean =>
  a.length === b.length &&
  a.every((shape, i) => shape.path === b[i]?.path && shape.keep === b[i]?.keep);

/** The dots that share a look: they are one `<path>`. */
type DotGroup = {
  fill: string;
  dataClass: string | undefined;
  opacity: number | undefined;
  className: string | undefined;
  d: string;
};

type LitRegion = { d: string; fill: string };

/** The hovered and selected regions again, on top and with a halo. Only this part re-renders on hover. */
const LitDots = ({
  regions,
  dotSize,
}: {
  regions: ReadonlyMap<string, LitRegion>;
  dotSize: number;
}) => {
  const { choropleth, store } = useChoroplethContext();
  const { selectedId } = choropleth;
  const hovered = useMapStore(store, (s) => s.hovered);

  // The selected one goes last: if it coincides with the hover, the selection color wins.
  const lit = [
    { state: "hover", id: hovered?.kind === "region" ? hovered.id : null },
    { state: "selected", id: selectedId },
  ];
  return (
    <>
      {lit.map(({ state, id }) => {
        const region = id === null ? undefined : regions.get(id);
        if (region === undefined) return null;
        return (
          <g key={state} data-selection={state}>
            <path className="cm-dots-halo" d={region.d} strokeWidth={dotSize * HALO_SCALE} />
            <path d={region.d} style={{ stroke: region.fill }} />
          </g>
        );
      })}
    </>
  );
};

/**
 * The map as a lattice of dots, each one colored like the region under its center. It only paints: it takes
 * no pointer events and is hidden from screen readers, so put `<Choropleth.Regions hitOnly />` under it for
 * hover, click, tooltip and drill. `<Choropleth.Svg dots>` (and `<ChoroplethMap dots>`) set up both.
 *
 * The lattice is computed once per geometry and size; zooming only scales it. Every region with a value gets
 * at least one dot if there is a free one nearby. There is one `<path>` per color, not one element per dot.
 */
export const Dots = (props: DotMatrixOptions) => {
  const { choropleth, classNames } = useChoroplethContext();
  const { regions, anonymousPaths, emptyFill, width, height } = choropleth;
  const { gap, size, lattice } = normalizeDotMatrix(props);

  // `regions` is a new array on every render: the lattice depends only on the paths and on which have data.
  const next: DotShape[] = [
    ...anonymousPaths.map((path) => ({ path })),
    ...regions.map((region) => ({ path: region.path, keep: region.value !== null })),
  ];
  const [shapes, setShapes] = useState(next);
  if (!sameShapes(shapes, next)) setShapes(next);

  const paths = useMemo(
    () => buildDotMatrix({ shapes, width, height, gap, lattice }).map(dotsToPath),
    [shapes, width, height, gap, lattice],
  );

  const groups = new Map<string, DotGroup>();
  const add = (d: string, look: Omit<DotGroup, "d">) => {
    if (d === "") return;
    const key = JSON.stringify([look.fill, look.dataClass, look.opacity, look.className]);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { ...look, d });
    else group.d += d;
  };
  anonymousPaths.forEach((_, i) => {
    add(paths[i] ?? "", {
      fill: emptyFill,
      dataClass: undefined,
      opacity: undefined,
      className: undefined,
    });
  });
  const byId = new Map<string, LitRegion>();
  regions.forEach((region, i) => {
    const d = paths[anonymousPaths.length + i] ?? "";
    add(d, {
      fill: region.fill,
      // Keeps the legend's class highlight working.
      dataClass: region.classIndex === null ? "empty" : String(region.classIndex),
      opacity: region.opacity,
      className: region.className,
    });
    // Several features can share an id (a country split in the data): all their dots light up.
    if (d !== "") byId.set(region.id, { d: (byId.get(region.id)?.d ?? "") + d, fill: region.fill });
  });

  const dotSize = gap * size;
  return (
    <g
      className={cx("cm-dots", classNames.dots)}
      pointerEvents="none"
      aria-hidden="true"
      fill="none"
      strokeWidth={dotSize}
      strokeLinecap="round"
    >
      <g className="cm-dots-base">
        {[...groups].map(([key, { d, fill, dataClass, opacity, className }]) => (
          <path
            key={key}
            className={cx("cm-dot-group", className)}
            data-class={dataClass}
            d={d}
            style={{ stroke: fill, opacity }}
          />
        ))}
      </g>
      <LitDots regions={byId} dotSize={dotSize} />
    </g>
  );
};
