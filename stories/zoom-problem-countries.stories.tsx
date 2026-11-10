// Phase B (v0.3), step 26: the countries where a naive framing fails (dd.md §11.1.5 and §11.2.7).
// Each button flies to the country: the MAIN BODY must be visible, not half an ocean. SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { world110m } from "../src/geo";
import { ChoroplethMap, type ChoroplethMapHandle } from "../src/react";

type Row = { id: string; value: number };

const COUNTRIES = [
  { id: "FR", note: "without Guiana or the overseas islands" },
  { id: "US", note: "without Alaska or Hawaii" },
  { id: "RU", note: "without Chukotka on the other side of the map (crosses the antimeridian)" },
  { id: "FJ", note: "crosses the antimeridian: an island, not half the world" },
  { id: "ES", note: "WITH the Canary Islands (a business decision) or the peninsula only" },
  { id: "NO", note: "without Svalbard" },
  { id: "NL", note: "without the Caribbean" },
  { id: "PT", note: "without the Azores or Madeira" },
  { id: "NZ", note: "both islands" },
] as const;

const data: Row[] = COUNTRIES.map(({ id }, index) => ({ id, value: 100 + index * 60 }));

const Demo = ({ spainWithIslands }: { spainWithIslands: boolean }) => {
  const ref = useRef<ChoroplethMapHandle>(null);
  const [current, setCurrent] = useState<string>("—");

  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {COUNTRIES.map(({ id, note }) => (
          <button
            key={id}
            type="button"
            title={note}
            onClick={async () => {
              setCurrent(`${id}: ${note}`);
              await ref.current?.zoomTo(id);
            }}
          >
            {id}
          </button>
        ))}
        <button type="button" onClick={() => void ref.current?.resetView()}>
          ⟲ mundo
        </button>
      </div>
      <p style={{ minHeight: 20 }}>
        <b>Encuadre:</b> {current}
      </p>
      <ChoroplethMap
        geography={world110m}
        objectName="countries"
        ref={ref}
        data={data}
        getId={(r: Row) => r.id}
        getValue={(r: Row) => r.value}
        // Bubbles: with the anchor on the main body, they must also land inside the country (step 20).
        variant="bubble"
        maxRadius={18}
        filterFeatures={(f) => f.id !== "AQ"}
        aspectRatio="auto"
        // Spain with the Canary Islands is the default; `{ ES: null }` returns to the peninsula.
        focusBounds={spainWithIslands ? undefined : { ES: null }}
        zoom={{ controls: true }}
      />
    </div>
  );
};

const meta = {
  title: "Zoom/ProblemCountries",
  component: Demo,
  parameters: { layout: "padded" },
  args: { spainWithIslands: true },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `focusBounds={{ ES: null }}`: Spain's framing is the peninsula only. */
export const SpainWithoutCanaryIslands: Story = { args: { spainWithIslands: false } };
