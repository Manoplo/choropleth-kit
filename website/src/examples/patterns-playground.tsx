import { useState } from "react";
import { ChoroplethMap, type PatternPresetId } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// A few presets out of the catalogue of 32 (the full list is on this page).
const REGION_PATTERNS: PatternPresetId[] = [
  "diagonal-up",
  "dots",
  "checkerboard-xs",
  "crosshatch",
  "waves",
  "grid",
];
const BACKGROUNDS: (PatternPresetId | "none")[] = [
  "none",
  "dots",
  "grid",
  "diagonal-up",
  "plus",
  "checkerboard-sm",
];

export default function PatternsPlayground() {
  const theme = usePageTheme(); // @docs-only
  const [regionPattern, setRegionPattern] = useState<PatternPresetId>("diagonal-up");
  const [background, setBackground] = useState<PatternPresetId | "none">("dots");
  const [graticule, setGraticule] = useState(true);
  const [projection, setProjection] = useState<"equalEarth" | "mercator">("equalEarth");

  return (
    <>
      <div className="ex-actions">
        <label>
          Regions without data{" "}
          <select
            value={regionPattern}
            onChange={(e) => setRegionPattern(e.target.value as PatternPresetId)}
          >
            {REGION_PATTERNS.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          Background{" "}
          <select
            value={background}
            onChange={(e) => setBackground(e.target.value as PatternPresetId | "none")}
          >
            {BACKGROUNDS.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          Projection{" "}
          <select
            value={projection}
            onChange={(e) => setProjection(e.target.value as "equalEarth" | "mercator")}
          >
            <option>equalEarth</option>
            <option>mercator</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={graticule}
            onChange={(e) => setGraticule(e.target.checked)}
          />{" "}
          Graticule
        </label>
      </div>
      <ChoroplethMap
        geography={world110m}
        objectName="countries"
        projection={projection}
        data={sales}
        getId={(row) => row.country}
        getValue={(row) => row.sales}
        variant="sequential"
        emptyPattern={regionPattern}
        background={background}
        graticule={graticule ? { step: 30 } : false}
        legend={{ title: "Sales" }}
        zoom={{ wheel: "cooperative", controls: true }}
        theme={theme} // @docs-only
        diagnostics={false} // @docs-only
      />
    </>
  );
}
