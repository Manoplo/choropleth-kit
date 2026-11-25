import { useState } from "react";
import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales, type Row } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// SYNTHETIC data (see data/demo.ts). The same map, filled or as dots: hover, click and the tooltip work the same.
export default function DotsInteractive() {
  const theme = usePageTheme(); // @docs-only
  const [dots, setDots] = useState(true);
  const [lattice, setLattice] = useState<"hex" | "square">("hex");

  return (
    <>
      <div className="ex-actions">
        <label>
          <input type="checkbox" checked={dots} onChange={(e) => setDots(e.target.checked)} /> Dots
        </label>
        <label>
          Lattice{" "}
          <select
            value={lattice}
            disabled={!dots}
            onChange={(e) => setLattice(e.target.value as "hex" | "square")}
          >
            <option value="hex">hex</option>
            <option value="square">square</option>
          </select>
        </label>
      </div>
      <ChoroplethMap<Row>
        geography={world110m}
        objectName="countries"
        data={sales}
        getId={(row) => row.country}
        getValue={(row) => row.sales}
        variant="sequential"
        dots={dots ? { gap: 7, lattice } : false}
        renderTooltip={({ label, formattedValue, datum }) => (
          <div>
            <strong>{label}</strong>
            <div>{formattedValue === "" ? "no data" : formattedValue}</div>
            {datum !== undefined && <div>Growth: {datum.growth} %</div>}
          </div>
        )}
        zoom={{ wheel: "cooperative" }}
        theme={theme} // @docs-only
        diagnostics={false} // @docs-only
      />
    </>
  );
}
