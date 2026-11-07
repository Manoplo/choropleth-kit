import type { ReactNode } from "react";
import { useChoroplethContext } from "../choropleth-context";

export type DefsProps = {
  /** Your own definitions (`<pattern>`, `<linearGradient>`, `<filter>`), with `useDefId` ids. */
  children?: ReactNode;
};

/**
 * The map's `<defs>`: the built-in patterns (`hatch` and `dots`) plus yours. Ids carry a per-instance
 * prefix (`useDefId`): with two maps on the page, each one references ITS definitions.
 *
 * The patterns draw with `currentColor` and the `<pattern>`'s own `color` is `--cm-pattern-color` (by
 * default, the text color at 45 %), so they respect the theme (dark too).
 */
export const Defs = ({ children }: DefsProps) => {
  const { defId } = useChoroplethContext();
  const color = {
    color:
      "var(--cm-pattern-color, color-mix(in srgb, var(--cm-label-color, #111111) 45%, transparent))",
  };
  return (
    <defs>
      <pattern
        id={defId("hatch")}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
        style={color}
      >
        <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" />
      </pattern>
      <pattern id={defId("dots")} width="6" height="6" patternUnits="userSpaceOnUse" style={color}>
        <circle cx="3" cy="3" r="1.2" fill="currentColor" />
      </pattern>
      {children}
    </defs>
  );
};
