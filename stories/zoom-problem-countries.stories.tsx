// Fase B (v0.3), paso 26: los países donde falla un encuadre ingenuo (dd.md §11.1.5 y §11.2.7).
// Cada botón vuela al país: debe verse el CUERPO PRINCIPAL, no medio océano. Datos SINTÉTICOS.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { world110m } from "../src/geo";
import { ChoroplethMap, type ChoroplethMapHandle } from "../src/react";

type Row = { id: string; value: number };

const COUNTRIES = [
  { id: "FR", note: "sin la Guayana ni las islas de ultramar" },
  { id: "US", note: "sin Alaska ni Hawái" },
  { id: "RU", note: "sin Chukotka al otro lado del mapa (cruza el antimeridiano)" },
  { id: "FJ", note: "cruza el antimeridiano: una isla, no medio mundo" },
  { id: "ES", note: "CON Canarias (decisión de negocio) o solo la península" },
  { id: "NO", note: "sin Svalbard" },
  { id: "NL", note: "sin el Caribe" },
  { id: "PT", note: "sin Azores ni Madeira" },
  { id: "NZ", note: "las dos islas" },
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
        // Burbujas: con el ancla en el cuerpo principal, también deben caer en el país (paso 20).
        variant="bubble"
        maxRadius={18}
        filterFeatures={(f) => f.id !== "AQ"}
        aspectRatio="auto"
        // España con Canarias es el valor por defecto; `{ ES: null }` vuelve a la península.
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

/** `focusBounds={{ ES: null }}`: el encuadre de España es solo la península. */
export const SpainWithoutCanaryIslands: Story = { args: { spainWithIslands: false } };
