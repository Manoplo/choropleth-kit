import { ChoroplethMap, defineDrillLevels } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

type Row = { id: string; value: number | null };

// Level 0: the world. Synthetic values, one row per country.
const countries: Row[] = sales.map((row) => ({ id: row.country, value: row.sales }));

// Level 1: US states and territories (ISO 3166-2 ids). Synthetic values.
const states: Row[] = (
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
  "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR"
)
  .split(" ")
  .map((code, index) => ({ id: `US-${code}`, value: ((index * 37) % 100) + 1 }));

const levels = defineDrillLevels<Row>([
  {
    id: "country",
    label: "World",
    geography: world110m,
    objectName: "countries",
    filterFeatures: (feature) => feature.id !== "AQ", // no Antarctica
    canDrill: (item) => item.id === "US", // only the US has a level below in this example
  },
  {
    id: "state",
    objectName: "admin1",
    // Loaded on demand: the bundler puts the US states in their own file.
    geography: () => import("choropleth-kit/geo/admin1/us"),
  },
]);

export default function GalleryDrill() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      drill={levels}
      data={({ depth }) => (depth === 0 ? countries : states)}
      getId={(row) => row.id}
      getValue={(row) => row.value}
      variant="sequential"
      legend={{ title: "Sales" }}
      zoom={{ wheel: "cooperative", controls: true }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
