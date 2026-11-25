import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { sales } from "../data/demo";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// SYNTHETIC. Each row has the value that colors the map and any other field you want to show.
type Row = { id: string; currentData: number; lastYearData: number };

const rows: Row[] = sales.flatMap((row) =>
  row.sales === null
    ? []
    : [
        {
          id: row.country,
          currentData: row.sales,
          lastYearData: Math.round(row.sales / (1 + row.growth / 100)),
        },
      ],
);

const format = (value: number) => value.toLocaleString("en-US");

export default function TooltipDatum() {
  const theme = usePageTheme(); // @docs-only
  return (
    <ChoroplethMap<Row>
      geography={world110m}
      objectName="countries"
      data={rows}
      getId={(row) => row.id}
      getValue={(row) => row.currentData}
      variant="sequential"
      renderTooltip={({ label, datum }) =>
        datum === undefined ? (
          <strong>{label}: no data</strong>
        ) : (
          <div>
            <strong>{label}</strong>
            <div>Now: {format(datum.currentData)}</div>
            <div>Last year: {format(datum.lastYearData)}</div>
          </div>
        )
      }
      zoom={{ wheel: "cooperative" }}
      theme={theme} // @docs-only
      diagnostics={false} // @docs-only
    />
  );
}
