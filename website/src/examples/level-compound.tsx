import { Choropleth } from "choropleth-kit";
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
];

export default function LevelCompound() {
  const theme = usePageTheme(); // @docs-only
  return (
    <Choropleth.Root
      geography={world110m}
      objectName="countries"
      region="europe"
      data={sales}
      getId={(row) => row.country}
      getValue={(row) => row.units}
      variant="sequential"
      emptyLabel="No data" // the preset adds this for you
      theme={theme} // @docs-only
      zoom={{ wheel: "cooperative" }} // @docs-only
      diagnostics={false} // @docs-only
    >
      <Choropleth.Svg ariaLabel="Units sold by country" />
      {/* The legend is HTML: it sits next to the <svg> and you place it with CSS. */}
      <div style={{ position: "absolute", right: 12, bottom: 12 }}>
        <Choropleth.Legend title="Units sold" />
      </div>
      <Choropleth.Tooltip />
    </Choropleth.Root>
  );
}
