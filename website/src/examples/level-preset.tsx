import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic numbers.
const sales = [
  { country: "ES", units: 1280 },
  { country: "FR", units: 2140 },
  { country: "DE", units: 2960 },
  { country: "IT", units: 1760 },
  { country: "PT", units: 540 },
  { country: "GB", units: 2310 },
];

export default function LevelPreset() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      region="europe"
      data={sales}
      getId={(row) => row.country}
      getValue={(row) => row.units}
      variant="sequential"
      legend={{ title: "Units sold" }}
      theme={theme} // @docs-only
      zoom={{ wheel: "cooperative" }} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
