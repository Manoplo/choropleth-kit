import { useState } from "react";
import { ChoroplethMap, type MarkerPulse, type MarkerShape } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic offices.
const OFFICES = [
  { id: "mad", name: "Madrid", at: [-3.7, 40.4], staff: 120 },
  { id: "par", name: "Paris", at: [2.35, 48.86], staff: 85 },
  { id: "ber", name: "Berlin", at: [13.4, 52.52], staff: 64 },
  { id: "lon", name: "London", at: [-0.13, 51.51], staff: 98 },
  { id: "nyc", name: "New York", at: [-74, 40.7], staff: 140 },
  { id: "tok", name: "Tokyo", at: [139.7, 35.7], staff: 77 },
  { id: "syd", name: "Sydney", at: [151.2, -33.9], staff: 41 },
] as const;

export default function MarkersPlayground() {
  const theme = usePageTheme(); // @docs-only
  const [shape, setShape] = useState<MarkerShape>("pin");
  const [pulse, setPulse] = useState<MarkerPulse>("always");
  const [glow, setGlow] = useState(true);
  const [labels, setLabels] = useState(true);
  const [tooltip, setTooltip] = useState(true);

  return (
    <>
      <div className="ex-actions">
        <label>
          Shape{" "}
          <select value={shape} onChange={(e) => setShape(e.target.value as MarkerShape)}>
            {(["pin", "circle", "triangle", "square", "diamond"] as const).map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          Pulse{" "}
          <select value={pulse} onChange={(e) => setPulse(e.target.value as MarkerPulse)}>
            {(["none", "hover", "always"] as const).map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={glow} onChange={(e) => setGlow(e.target.checked)} /> Glow
        </label>
        <label>
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />{" "}
          Labels
        </label>
        <label>
          <input
            type="checkbox"
            checked={tooltip}
            onChange={(e) => setTooltip(e.target.checked)}
          />{" "}
          Tooltip
        </label>
      </div>
      <ChoroplethMap
        geography={world110m}
        objectName="countries"
        data={sales}
        getId={(row) => row.country}
        getValue={(row) => row.sales}
        variant="sequential"
        legend={false}
        markers={OFFICES.map((office) => ({
          id: office.id,
          coordinates: [...office.at],
          label: office.name,
          shape,
          size: 14,
          color: "#e11d48",
          pulse,
          glow: glow ? 6 : 0,
          showLabel: labels,
          tooltip: tooltip ? (
            <>
              <strong>{office.name}</strong>
              <div>{office.staff} people</div>
            </>
          ) : undefined,
        }))}
        zoom={{ wheel: "cooperative" }}
        theme={theme} // @docs-only
        diagnostics={false} // @docs-only
      />
    </>
  );
}
