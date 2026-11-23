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
  { country: "NL", units: 880 },
  { country: "PL", units: 1120 },
  { country: "SE", units: 690 },
  { country: "NO", units: 470 },
  { country: "AT", units: 610 },
  { country: "IE", units: 330 },
];

export default function SalesByCountry() {
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
      palette="blues"
      formatValue={(value) => `${Math.round(value).toLocaleString("en-US")} units`}
      legend={{ title: "Units sold" }}
      emptyPattern="hatch"
      zoom={{ wheel: "cooperative", controls: true }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
