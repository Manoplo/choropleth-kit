import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

export default function GalleryBubble() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      filterFeatures={(feature) => feature.id !== "AQ"} // no Antarctica
      data={sales}
      getId={(row) => row.country}
      getValue={(row) => row.sales} // circle area
      getColorValue={(row) => row.growth} // circle color
      variant="bubble"
      maxRadius={22}
      legend={{ title: "Sales" }}
      zoom={{ wheel: "cooperative", controls: true }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
