import type { CSSProperties, ReactNode } from "react";
import type { Corner } from "../../core";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import type { DrillNav } from "../use-choropleth";

export type BreadcrumbRenderContext = DrillNav;

export type BreadcrumbProps = {
  /** Esquina del mapa. Sin ella, no se posiciona: lo colocas tú (útil fuera del mapa). */
  position?: Corner;
  className?: string;
  /** Pinta las migas con tu sistema de diseño: `({ items, drillTo, drillUp }) => …`. */
  children?: (context: BreadcrumbRenderContext) => ReactNode;
};

const CORNERS: Record<Corner, CSSProperties> = {
  "top-left": { top: 12, left: 12 },
  "top-right": { top: 12, right: 12 },
  "bottom-left": { bottom: 12, left: 12 },
  "bottom-right": { bottom: 12, right: 12 },
};

/**
 * Migas de la ruta del drill (dd.md §11.2.5): `<nav>` + `<ol>`, raíz con la etiqueta del primer nivel (o
 * `labels.breadcrumbRoot`), el último paso con `aria-current="page"` y un botón «←» si se puede subir.
 * Son `<button>` reales: foco y teclado gratis. Cada miga anterior sube hasta ese nivel.
 *
 * Refleja la ruta PEDIDA, no la mostrada: en cuanto haces clic, la miga nueva ya está (mientras vuela la
 * cámara). Sin `drill` no pinta nada. Con `children` (render prop) el aspecto es tuyo.
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
