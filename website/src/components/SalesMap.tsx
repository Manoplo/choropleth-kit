import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";

const data = [
  { country: "ES", sales: 120 },
  { country: "FR", sales: 95 },
  { country: "DE", sales: 150 },
];

export default function SalesMap() {
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      data={data}
      getId={(row) => row.country}
      getValue={(row) => row.sales}
      variant="sequential"
      legend={{ title: "Sales" }}
      diagnostics={false}
    />
  );
}
