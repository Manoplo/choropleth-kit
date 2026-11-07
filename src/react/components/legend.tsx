import { useEffect, type ReactNode } from "react";
import type { LegendItem, SizeLegendItem } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import type { UseChoroplethResult } from "../use-choropleth";

export type LegendRenderContext = {
  items: LegendItem[];
  /** Size reference circles (`bubble` only). */
  sizeItems: SizeLegendItem[];
  /** `null` in `categorical` and in `bubble` without `getColorValue`. */
  scale: UseChoroplethResult<unknown>["scale"];
  formatValue: (value: number) => string;
};

export type LegendProps = {
  title?: string;
  /** Show the number of regions in each class. */
  showCount?: boolean;
  className?: string;
  /**
   * `"swatches"` (default): one row per class. `"bar"`: a bar with one segment per class and the breaks
   * underneath (newspaper style; more compact). `"bar"` only works with numeric classes: with categories
   * or a continuous scale it is drawn as usual.
   */
  variant?: "swatches" | "bar";
  /**
   * Hovering a class highlights its regions and dims the rest (default `true`). Without re-rendering
   * regions: the legend writes `data-highlight-class` on the root and the CSS does the rest.
   */
  interactive?: boolean;
  /** Headless legend: you receive the items and draw it yourself with your design system. */
  children?: (context: LegendRenderContext) => ReactNode;
};

const GRADIENT_STOPS = 5;

/** HTML legend. By default: swatches with ranges (classes) or a gradient bar (`linear`). */
export const Legend = ({
  title,
  showCount = false,
  className,
  variant = "swatches",
  interactive = true,
  children,
}: LegendProps) => {
  const { choropleth, classNames, emptyPattern } = useChoroplethContext();
  const { legend: items, sizeLegend: sizeItems, scale, formatValue, containerRef } = choropleth;

  // Highlighting a class = an attribute on the root (it changes no region prop). Only if some region
  // belongs to a class: with `bubble` or a continuous scale there is nothing to highlight.
  const canHighlight = interactive && choropleth.regions.some((r) => r.classIndex !== null);
  const highlight = (key: string | null) => {
    const root = containerRef.current;
    if (root === null) return;
    if (key === null) root.removeAttribute("data-highlight-class");
    else root.setAttribute("data-highlight-class", key);
  };
  useEffect(
    () => () => containerRef.current?.removeAttribute("data-highlight-class"),
    [containerRef],
  );
  const classKey = (item: LegendItem, index: number) =>
    item.empty === true ? "empty" : String(index);
  const hoverProps = (item: LegendItem, index: number) =>
    canHighlight
      ? {
          "data-class": classKey(item, index),
          onPointerEnter: () => highlight(classKey(item, index)),
          onPointerLeave: () => highlight(null),
        }
      : {};
  /** The "no data" swatch carries the same pattern as the map (`data-pattern`, drawn by the CSS). */
  const swatchProps = (item: LegendItem) => ({
    style: { backgroundColor: item.color },
    "data-pattern": item.empty === true && emptyPattern !== null ? emptyPattern : undefined,
  });

  if (children !== undefined) return <>{children({ items, sizeItems, scale, formatValue })}</>;

  const rootClass = cx("cm-legend", classNames.legend, className);

  // `bar`: numeric classes only (with `from` and `to`). Categories have no breaks to put underneath.
  const indexed = items.map((item, index) => ({ item, index }));
  const classRows = indexed.filter(({ item }) => item.empty !== true);
  const emptyItem = indexed.find(({ item }) => item.empty === true) ?? null;
  const barItems =
    variant === "bar" &&
    scale?.kind !== "continuous" &&
    classRows.length > 0 &&
    classRows.every(({ item }) => item.from !== undefined && item.to !== undefined)
      ? classRows
      : null;
  // The breaks: the start of each class and the end of the last one.
  const barTicks =
    barItems === null
      ? []
      : [...barItems.map(({ item }) => item.from as number), barItems.at(-1)?.item.to as number];
  const [min, max] = scale?.domain ?? [0, 1];

  return (
    <div className={rootClass}>
      {title !== undefined && <div className="cm-legend__title">{title}</div>}
      {scale !== null && scale.kind === "continuous" ? (
        <div>
          <div
            className="cm-legend__gradient"
            data-legend-gradient
            // The gradient depends on the scale (data), which is why it goes inline and not in the CSS.
            style={{
              background: `linear-gradient(to right, ${Array.from(
                { length: GRADIENT_STOPS },
                (_, i) => scale.getColor(min + ((max - min) * i) / (GRADIENT_STOPS - 1)),
              ).join(", ")})`,
            }}
          />
          <div className="cm-legend__range">
            <span>{formatValue(min)}</span>
            <span>{formatValue(max)}</span>
          </div>
        </div>
      ) : barItems !== null ? (
        <div className="cm-legend__bar-wrap">
          <div className="cm-legend__bar" role="list">
            {barItems.map(({ item, index }) => (
              <span
                key={item.label}
                role="listitem"
                className={cx("cm-legend__segment", classNames.legendItem)}
                style={{ backgroundColor: item.color }}
                title={`${item.label} (${item.count})`}
                {...hoverProps(item, index)}
              />
            ))}
          </div>
          <div className="cm-legend__ticks" aria-hidden="true">
            {barTicks.map((value, i) => (
              <span
                key={i}
                className="cm-legend__tick"
                style={{ left: `${(i / (barTicks.length - 1)) * 100}%` }}
              >
                {formatValue(value)}
              </span>
            ))}
          </div>
          {emptyItem !== null && (
            <div
              className={cx("cm-legend__item", classNames.legendItem)}
              {...hoverProps(emptyItem.item, emptyItem.index)}
            >
              <span aria-hidden className="cm-legend__swatch" {...swatchProps(emptyItem.item)} />
              <span>{emptyItem.item.label}</span>
              {showCount && <span className="cm-legend__count">({emptyItem.item.count})</span>}
            </div>
          )}
        </div>
      ) : (
        items.length > 0 && (
          <ul className="cm-legend__items">
            {items.map((item, index) => (
              <li
                key={item.label}
                className={cx("cm-legend__item", classNames.legendItem)}
                {...hoverProps(item, index)}
              >
                <span aria-hidden className="cm-legend__swatch" {...swatchProps(item)} />
                <span>{item.label}</span>
                {showCount && <span className="cm-legend__count">({item.count})</span>}
              </li>
            ))}
          </ul>
        )
      )}
      {sizeItems.length > 0 && (
        <ul className="cm-legend__sizes">
          {sizeItems.map((item) => (
            <li key={item.label} className="cm-legend__size">
              <svg
                aria-hidden
                width={item.radius * 2 + 2}
                height={item.radius * 2 + 2}
                className="cm-legend__circle"
              >
                <circle cx={item.radius + 1} cy={item.radius + 1} r={item.radius} />
              </svg>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
