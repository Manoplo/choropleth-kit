import { useEffect, useId, useMemo, useState } from "react";
import { ChoroplethMap, type ThemeName } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import CodeBlock from "./CodeBlock";
import { sales, zones, type Row } from "../data/demo";

type Variant = "sequential" | "diverging" | "categorical" | "bubble";

const VARIANTS: Variant[] = ["sequential", "diverging", "categorical", "bubble"];
const THEMES: ThemeName[] = ["light", "dark", "minimal", "contrast"];

// Per variant: the extra props the map receives, and the exact lines the code panel shows for them.
const SPEC: Record<Variant, { title: string; lines: string[] }> = {
  sequential: { title: "Sales", lines: ["getValue={(r) => r.sales}"] },
  diverging: { title: "Growth %", lines: ["getValue={(r) => r.growth}", "midpoint={0}"] },
  categorical: { title: "Zone", lines: ["getCategory={(r) => r.zone}"] },
  bubble: { title: "Sales", lines: ["getValue={(r) => r.sales}"] },
};

function buildCode(variant: Variant, theme: ThemeName): string {
  const { title, lines } = SPEC[variant];
  return [
    "<ChoroplethMap",
    "  geography={world110m}",
    '  objectName="countries"',
    "  data={sales}",
    "  getId={(r) => r.country}",
    ...lines.map((l) => `  ${l}`),
    `  variant="${variant}"`,
    `  theme="${theme}"`,
    `  legend={{ title: "${title}" }}`,
    "/>",
  ].join("\n");
}

const IMPORTS = [
  'import { ChoroplethMap } from "choropleth-kit";',
  'import { world110m } from "choropleth-kit/geo";',
  'import "choropleth-kit/styles.css";',
].join("\n");

function Segmented<T extends string>(props: {
  legend: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="seg">
      <legend className="sr-only">{props.legend}</legend>
      <span className="seg-label" aria-hidden="true">
        {props.legend}
      </span>
      {props.options.map((option) => (
        <label key={option}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={props.value === option}
            onChange={() => props.onChange(option)}
          />
          <span>{option}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function HeroDemo() {
  const [variant, setVariant] = useState<Variant>("sequential");
  const [theme, setTheme] = useState<ThemeName>("light");

  // The map follows the page theme (light or dark) until the visitor picks one of its own.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      if (!picked) setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [picked]);

  const code = useMemo(() => buildCode(variant, theme), [variant, theme]);
  const rows = sales as Row[];

  const common = {
    geography: world110m,
    objectName: "countries",
    data: rows,
    getId: (r: Row) => r.country,
    theme,
    legend: { title: SPEC[variant].title },
    // The demo sits in a scrolling page: the wheel only zooms with Ctrl/⌘.
    zoom: { wheel: "cooperative" as const, controls: true },
    diagnostics: false as const,
  };

  return (
    <div className="demo">
      <div className="demo-bar">
        <Segmented legend="Variant" value={variant} options={VARIANTS} onChange={setVariant} />
        <Segmented
          legend="Theme"
          value={theme}
          options={THEMES}
          onChange={(next) => {
            setPicked(true);
            setTheme(next);
          }}
        />
      </div>
      <div className="demo-body">
        <div className="demo-map" data-theme={theme}>
          {variant === "sequential" && (
            <ChoroplethMap {...common} variant="sequential" getValue={(r) => r.sales} />
          )}
          {variant === "diverging" && (
            <ChoroplethMap
              {...common}
              variant="diverging"
              getValue={(r) => r.growth}
              midpoint={0}
            />
          )}
          {variant === "categorical" && (
            <ChoroplethMap
              {...common}
              variant="categorical"
              getCategory={(r) => r.zone}
              categories={zones}
            />
          )}
          {variant === "bubble" && (
            <ChoroplethMap {...common} variant="bubble" getValue={(r) => r.sales} maxRadius={22} />
          )}
        </div>
        <div className="demo-code">
          <CodeBlock
            code={`${IMPORTS}\n\n${code}\n\n// This demo also sets\n// zoom={{ wheel: "cooperative" }}`}
            copyText={`${IMPORTS}\n\n${code}`}
            label="Copy the example code"
            filename="SalesMap.tsx"
          />
        </div>
      </div>
      <p className="demo-note">
        Live map. Hover a country, drag to pan, Ctrl/⌘ + scroll to zoom. The sales numbers are
        synthetic.
      </p>
    </div>
  );
}
