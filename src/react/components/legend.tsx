import { useEffect, type ReactNode } from "react";
import type { LegendItem, SizeLegendItem } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import type { UseChoroplethResult } from "../use-choropleth";

export type LegendRenderContext = {
  items: LegendItem[];
  /** Círculos de referencia del tamaño (solo `bubble`). */
  sizeItems: SizeLegendItem[];
  /** `null` en `categorical` y en `bubble` sin `getColorValue`. */
  scale: UseChoroplethResult<unknown>["scale"];
  formatValue: (value: number) => string;
};

export type LegendProps = {
  title?: string;
  /** Mostrar el nº de regiones de cada clase. */
  showCount?: boolean;
  className?: string;
  /**
   * `"swatches"` (por defecto): una fila por clase. `"bar"`: una barra con un tramo por clase y los cortes debajo
   * (estilo prensa; más compacta). `"bar"` solo vale con clases numéricas: con categorías o escala continua se
   * dibuja como siempre.
   */
  variant?: "swatches" | "bar";
  /**
   * Pasar el ratón por una clase resalta sus regiones y atenúa el resto (por defecto `true`). Sin re-renderizar
   * regiones: la leyenda escribe `data-highlight-class` en el root y el CSS hace el resto.
   */
  interactive?: boolean;
  /** Leyenda headless: recibes los items y la dibujas tú con tu sistema de diseño. */
  children?: (context: LegendRenderContext) => ReactNode;
};

const GRADIENT_STOPS = 5;

/** Leyenda HTML. Por defecto: swatches con rangos (clases) o barra de degradado (`linear`). */
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

  // Resaltar una clase = un atributo en el root (no cambia ninguna prop de las regiones). Solo si alguna región
  // pertenece a una clase: con `bubble` o escala continua no hay nada que resaltar.
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
  /** El swatch de «sin dato» lleva la misma trama que el mapa (`data-pattern`, la dibuja el CSS). */
  const swatchProps = (item: LegendItem) => ({
    style: { backgroundColor: item.color },
    "data-pattern": item.empty === true && emptyPattern !== null ? emptyPattern : undefined,
  });

  if (children !== undefined) return <>{children({ items, sizeItems, scale, formatValue })}</>;

  const rootClass = cx("cm-legend", classNames.legend, className);

  // `bar`: solo clases numéricas (con `from` y `to`). Las categorías no tienen cortes que poner debajo.
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
  // Los cortes: el inicio de cada clase y el final de la última.
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
            // El degradado depende de la escala (datos), por eso va en línea y no en el CSS.
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
