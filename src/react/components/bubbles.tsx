import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";

/**
 * Bubbles (`bubble` variant). They already come sorted from largest to smallest, so the small ones end
 * up on top.
 *
 * Two kinds, with different interaction (dd.md §12.1):
 *  - **At a region's centroid** (`coordinates: null`): they do not capture the mouse; hover and click
 *    are handled by the region underneath (a `region` item).
 *  - **With their own coordinates** (stores): they are `point` items, with their own hover, click and tooltip.
 */
export const Bubbles = () => {
  const { choropleth, classNames } = useChoroplethContext();
  const { bubbles, clickable, getPointProps } = choropleth;
  if (bubbles.length === 0) return null;

  return (
    <g className={cx("cm-bubbles", classNames.bubbles)} pointerEvents="none">
      {bubbles.map((bubble) => {
        const isPoint = bubble.coordinates !== null;
        return (
          <circle
            key={bubble.id}
            className={cx("cm-bubble", classNames.bubble)}
            data-bubble-id={bubble.id}
            cx={bubble.x}
            cy={bubble.y}
            r={bubble.r}
            style={{ fill: bubble.fill, cursor: isPoint && clickable ? "pointer" : undefined }}
            // The group's `none` is inherited: the points override it to receive events.
            pointerEvents={isPoint ? "auto" : undefined}
            {...(isPoint ? getPointProps(bubble) : undefined)}
          />
        );
      })}
    </g>
  );
};
