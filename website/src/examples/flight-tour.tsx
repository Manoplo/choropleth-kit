import { useRef, useState } from "react";
import { ChoroplethMap, type ChoroplethMapHandle } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic.
const sales = [
  { country: "ES", value: 120 },
  { country: "FR", value: 95 },
  { country: "DE", value: 150 },
  { country: "IT", value: 80 },
  { country: "NO", value: 40 },
  { country: "SE", value: 55 },
  { country: "PT", value: 35 },
];

export default function FlightTour() {
  const theme = usePageTheme(); // @docs-only
  const map = useRef<ChoroplethMapHandle>(null);
  const [status, setStatus] = useState("Ready");

  const tour = async () => {
    setStatus("Flying…");
    const first = await map.current?.zoomTo("ES");
    const second = await map.current?.zoomTo("DE");
    const third = await map.current?.zoomTo({
      bounds: [
        [4, 54],
        [31, 71],
      ], // Scandinavia
    });
    await map.current?.resetView();
    // `completed` is false if the user grabbed the map and interrupted the flight.
    const interrupted = [first, second, third].some((result) => result?.completed === false);
    setStatus(interrupted ? "Interrupted" : "Done");
  };

  return (
    <>
      <div className="ex-actions">
        <button type="button" onClick={tour}>
          Start tour
        </button>
        <button type="button" onClick={() => map.current?.zoomTo("FR")}>
          Fly to France
        </button>
        <button type="button" onClick={() => map.current?.resetView()}>
          Reset
        </button>
        <span role="status">{status}</span>
      </div>
      <ChoroplethMap
        ref={map}
        geography={world110m}
        objectName="countries"
        filterFeatures={(feature) => feature.id !== "AQ"} // no Antarctica
        data={sales}
        getId={(row) => row.country}
        getValue={(row) => row.value}
        variant="sequential"
        zoom={{ wheel: "cooperative" }}
        theme={theme} // @docs-only
        diagnostics={false} // @docs-only
      />
    </>
  );
}
