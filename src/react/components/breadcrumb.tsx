import type { CSSProperties, ReactNode } from "react";
import type { Corner } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import type { DrillNav } from "../use-choropleth";

export type BreadcrumbRenderContext = DrillNav;

export type BreadcrumbProps = {
  /** Corner of the map. Without it, it is not positioned: you place it yourself (useful outside the map). */
  position?: Corner;
  className?: string;
  /** Draws the breadcrumbs with your design system: `({ items, drillTo, drillUp }) => …`. */
  children?: (context: BreadcrumbRenderContext) => ReactNode;
};

const CORNERS: Record<Corner, CSSProperties> = {
  "top-left": { top: 12, left: 12 },
  "top-right": { top: 12, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "bottom-right": { bottom: 12, right: 12 },
};

/**
 * Breadcrumbs for the drill route (dd.md §11.2.5): `<nav>` + `<ol>`, root with the first level's label
 * (or `labels.breadcrumbRoot`), the last step with `aria-current="page"` and a "←" button if you can go
 * up. They are real `<button>`s: focus and keyboard for free. Each earlier crumb goes up to that level.
 *
 * It reflects the REQUESTED route, not the shown one: as soon as you click, the new crumb is there
 * (while the camera flies). Without `drill` it draws nothing. With `children` (a render prop) the look is yours.
 */
export const Breadcrumb = ({ position, className, children }: BreadcrumbProps) => {
  const { choropleth, classNames } = useChoroplethContext();
  const { drillNav, labels } = choropleth;
  if (drillNav === null) return null;
  if (children !== undefined) return <>{children(drillNav)}</>;

  const { items, canDrillUp, drillTo, drillUp } = drillNav;
  return (
    <nav
      className={cx("cm-breadcrumb", classNames.breadcrumb, className)}
      aria-label={labels.breadcrumb}
      style={position === undefined ? undefined : { position: "absolute", ...CORNERS[position] }}
    >
      {canDrillUp && (
        <button
          type="button"
          className="cm-breadcrumb__back"
          aria-label={labels.drillUp}
          onClick={() => drillUp()}
        >
          ←
        </button>
      )}
      <ol className="cm-breadcrumb__list">
        {items.map((item) => (
          <li key={item.depth} className={cx("cm-breadcrumb__item", classNames.breadcrumbItem)}>
            {item.current ? (
              <span className="cm-breadcrumb__current" aria-current="page">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                className="cm-breadcrumb__link"
                onClick={() => drillTo(item.depth)}
              >
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
