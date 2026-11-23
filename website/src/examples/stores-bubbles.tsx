import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic stores: revenue is the bubble area, growth its color.
type Store = { id: string; revenue: number; growth: number; at: [number, number] };

const stores: Store[] = [
  { id: "madrid", revenue: 920, growth: 7, at: [-3.7, 40.42] },
  { id: "barcelona", revenue: 780, growth: 12, at: [2.17, 41.39] },
  { id: "lisbon", revenue: 410, growth: 15, at: [-9.14, 38.72] },
  { id: "paris", revenue: 1340, growth: -3, at: [2.35, 48.86] },
  { id: "london", revenue: 1580, growth: -8, at: [-0.13, 51.51] },
  { id: "berlin", revenue: 1100, growth: 2, at: [13.4, 52.52] },
  { id: "rome", revenue: 690, growth: 5, at: [12.5, 41.9] },
  { id: "amsterdam", revenue: 560, growth: 9, at: [4.9, 52.37] },
  { id: "warsaw", revenue: 480, growth: 18, at: [21.01, 52.23] },
  { id: "vienna", revenue: 390, growth: -1, at: [16.37, 48.21] },
];

export default function StoresBubbles() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap
      geography={world110m}
      objectName="countries"
      region="europe"
      data={stores}
      getId={(store) => store.id}
      getValue={(store) => store.revenue}
      getColorValue={(store) => store.growth}
      getCoordinates={(store) => store.at}
      variant="bubble"
      legend={{ title: "Revenue" }}
      zoom={{ wheel: "cooperative", controls: true }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
