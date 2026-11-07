import { useState } from "react";
import { cx } from "../class-names";
import { useChoroplethContext } from "../choropleth-context";
import { useMapStore } from "../map-store";
import { useIsApplePlatform } from "../platform";

/**
 * The "Use Ctrl + scroll to zoom" hint (⌘ on macOS) or "Use two fingers to move the map"
 * (dd.md §11.1.2). It only appears with `wheel: "cooperative"`, when a gesture does NOT zoom but can
 * be taught how: with `"always"` there is nothing to teach. It lasts 1.5 s.
 *
 * It is `aria-hidden`: a visual aid, not a message for screen readers (keyboard zoom and the buttons
 * are already accessible). It is always in the DOM and shown with an attribute + CSS: that way it
 * fades in and out, and the text does not disappear before it finishes fading.
 */
export const GestureHint = ({ className }: { className?: string }) => {
  const { choropleth, store, classNames } = useChoroplethContext();
  const hint = useMapStore(store, (s) => s.gestureHint);
  const apple = useIsApplePlatform();

  // During the fade-out `hint` is already `null`: the last one is kept so the text does not change.
  // "Adjust state when a value changes": `hint` is a store primitive, so it is stable.
  const [last, setLast] = useState<"wheel" | "touch">("wheel");
  if (hint !== null && hint !== last) setLast(hint);

  const { labels } = choropleth;
  const text =
    last === "touch"
      ? labels.gestureHintTouch
      : apple
        ? labels.gestureHintWheelMac
        : labels.gestureHintWheel;

  return (
    <div
      className={cx("cm-gesture-hint", classNames.gestureHint, className)}
      aria-hidden="true"
      data-visible={hint === null ? undefined : ""}
    >
      {text}
    </div>
  );
};
