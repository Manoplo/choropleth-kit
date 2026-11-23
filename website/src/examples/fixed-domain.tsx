import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic: share of sales made online, in %.
const online = [
  { country: "ES", share: 34 },
  { country: "FR", share: 41 },
  { country: "DE", share: 58 },
  { country: "IT", share: 27 },
  { country: "PT", share: 22 },
  { country: "GB", share: 63 },
  { country: "NL", share: 55 },
  { country: "PL", share: 38 },
  { country: "SE", share: 71 },
  { country: "NO", share: 66 },
  { country: "AT", share: 44 },
  { country: "IE", share: 49 },
];

export default function FixedDomain() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      region="europe"
      data={online}
      getId={(row) => row.country}
      getValue={(row) => row.share}
      variant="sequential"
      palette={{ from: "#ffffff", to: "#2563eb" }}
      domain={[0, 100]}
      classification={{ method: "linear" }}
      formatValue={(value) => `${value} %`}
      legend={{ title: "Online share", variant: "bar" }}
      emptyPattern="hatch"
      zoom={{ wheel: "cooperative" }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
