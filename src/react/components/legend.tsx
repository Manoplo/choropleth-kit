import type { ReactNode } from "react";
import type { LegendItem, SizeLegendItem } from "../../core";
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
  /** Leyenda headless: recibes los items y la dibujas tú con tu sistema de diseño. */
  children?: (context: LegendRenderContext) => ReactNode;
};

const GRADIENT_STOPS = 5;

/** Leyenda HTML. Por defecto: swatches con rangos (clases) o barra de degradado (`linear`). */
export const Legend = ({ title, showCount = false, className, children }: LegendProps) => {
  const { choropleth } = useChoroplethContext();
  const { legend: items, sizeLegend: sizeItems, scale, formatValue } = choropleth;

  if (children !== undefined) return <>{children({ items, sizeItems, scale, formatValue })}</>;

  const rootClass = className === undefined ? "cm-legend" : `cm-legend ${className}`;
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
      ) : (
        items.length > 0 && (
          <ul className="cm-legend__items">
            {items.map((item) => (
              <li key={item.label} className="cm-legend__item">
                <span
                  aria-hidden
                  className="cm-legend__swatch"
                  style={{ background: item.color }}
                />
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
