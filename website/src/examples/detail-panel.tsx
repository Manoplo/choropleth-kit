import { useState } from "react";
import { ChoroplethMap } from "choropleth-kit";
import { world110m } from "choropleth-kit/geo";
import "choropleth-kit/styles.css";
import { usePageTheme } from "../lib/use-page-theme"; // @docs-only

// Synthetic accounts per country.
const accounts = [
  { country: "ES", name: "Spain", accounts: 412, owner: "Marta" },
  { country: "FR", name: "France", accounts: 530, owner: "Julien" },
  { country: "DE", name: "Germany", accounts: 781, owner: "Anke" },
  { country: "IT", name: "Italy", accounts: 365, owner: "Luca" },
  { country: "PT", name: "Portugal", accounts: 148, owner: "Marta" },
  { country: "GB", name: "United Kingdom", accounts: 640, owner: "Oliver" },
  { country: "NL", name: "Netherlands", accounts: 233, owner: "Anke" },
  { country: "PL", name: "Poland", accounts: 297, owner: "Piotr" },
];

export default function DetailPanel() {
  const theme = usePageTheme(); // @docs-only
  const [selectedId, setSelectedId] = useState<string | null>("ES");
  const selected = accounts.find((row) => row.country === selectedId);

  return (
    <div className="ex-layout">
      <ChoroplethMap
        geography={world110m}
        objectName="countries"
        region="europe"
        data={accounts}
        getId={(row) => row.country}
        getValue={(row) => row.accounts}
        variant="sequential"
        selectedId={selectedId}
        onSelectedIdChange={setSelectedId}
        formatValue={(value) => String(Math.round(value))}
        legend={{ title: "Accounts" }}
        zoom={{ wheel: "cooperative" }}
        theme={theme} // @docs-only
        diagnostics={false} // @docs-only
      />
      <aside className="ex-panel" aria-live="polite">
        {selected ? (
          <>
            <h3>{selected.name}</h3>
            <p>{selected.accounts} accounts</p>
            <p>Owner: {selected.owner}</p>
          </>
        ) : (
          <p>Click a country with data.</p>
        )}
      </aside>
    </div>
  );
}
