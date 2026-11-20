import { useId, useState } from "react";
import CodeBlock from "./CodeBlock";

const LEVELS = [
  {
    id: "preset",
    name: "Preset",
    api: "<ChoroplethMap>",
    blurb: "Everything wired: legend, tooltip, zoom, drill-down and theming from one component.",
    file: "SalesMap.tsx",
    code: `<ChoroplethMap
  geography={world110m}
  objectName="countries"
  data={sales}
  getId={(r) => r.country}
  getValue={(r) => r.sales}
  variant="sequential"
/>`,
  },
  {
    id: "compound",
    name: "Compound",
    api: "<Choropleth.Root>",
    blurb: "The same pieces the preset uses. You choose which ones to render and where they go.",
    file: "SalesMap.tsx",
    code: `<Choropleth.Root
  geography={world110m}
  objectName="countries"
  data={sales}
  getId={(r) => r.country}
  getValue={(r) => r.sales}
  variant="sequential"
>
  <Choropleth.Svg ariaLabel="Sales by country" />
  <Choropleth.Legend title="Sales" />
  <Choropleth.Tooltip />
</Choropleth.Root>`,
  },
  {
    id: "headless",
    name: "Headless",
    api: "useChoropleth()",
    blurb: "Geometry, colors and event props from a hook. You paint every path yourself.",
    file: "SalesMap.tsx",
    code: `const { containerRef, width, height, regions, getRegionProps } =
  useChoropleth({
    geography: world110m,
    objectName: "countries",
    data: sales,
    getId: (r) => r.country,
    getValue: (r) => r.sales,
    variant: "sequential",
  });

<div ref={containerRef}>
  <svg viewBox={\`0 0 \${width} \${height}\`}>
    {regions.map((region) => (
      <path key={region.id} d={region.path} fill={region.fill} {...getRegionProps(region)} />
    ))}
  </svg>
</div>`,
  },
] as const;

export default function ApiLevels() {
  const name = useId();
  const [active, setActive] = useState<(typeof LEVELS)[number]["id"]>("preset");
  const level = LEVELS.find((l) => l.id === active) ?? LEVELS[0];

  return (
    <div className="levels">
      <fieldset className="levels-list">
        <legend className="sr-only">API level</legend>
        {LEVELS.map((l) => (
          <label key={l.id}>
            <input
              type="radio"
              name={name}
              value={l.id}
              checked={active === l.id}
              onChange={() => setActive(l.id)}
            />
            <span className="levels-item">
              <span className="levels-name">
                {l.name} <code>{l.api}</code>
              </span>
              <span className="levels-blurb">{l.blurb}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="levels-code">
        <CodeBlock
          code={level.code}
          label={`Copy the ${level.name.toLowerCase()} example`}
          filename={level.file}
        />
      </div>
    </div>
  );
}
