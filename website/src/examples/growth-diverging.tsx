import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic: year-over-year growth, in %.
const growth = [
  { country: "ES", change: 8.4 },
  { country: "FR", change: -2.1 },
  { country: "DE", change: -6.8 },
  { country: "IT", change: 3.2 },
  { country: "PT", change: 12.5 },
  { country: "GB", change: -0.7 },
  { country: "NL", change: 5.9 },
  { country: "PL", change: 15.3 },
  { country: "SE", change: -9.4 },
  { country: "NO", change: 1.8 },
  { country: "AT", change: -3.6 },
  { country: "IE", change: 6.7 },
];

const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(1)} %`;

export default function GrowthDiverging() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      region="europe"
      data={growth}
      getId={(row) => row.country}
      getValue={(row) => row.change}
      variant="diverging"
      midpoint={0}
      formatValue={signed}
      legend={{ title: "Growth" }}
      emptyPattern="hatch"
      zoom={{ wheel: "cooperative" }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
