import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Fixed order and colors: a zone looks the same on every map.
const zones = [
  { id: "North", color: "#2563eb" },
  { id: "South", color: "#f59e0b" },
  { id: "East", color: "#10b981" },
  { id: "West", color: "#db2777" },
];

export default function GalleryCategorical() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      data={sales}
      getId={(row) => row.country}
      getCategory={(row) => row.zone}
      variant="categorical"
      categories={zones}
      legend={{ title: "Zone" }}
      zoom={{ wheel: "cooperative", controls: true }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
