// Nivel 2 (compound): mismas piezas que usará el preset, pero tú eliges cuáles y en qué orden.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { toFeatureCollection } from "../src/core";
import { Choropleth } from "../src/react";

type Row = { id: string; value: number | null };

const world = countries110m as unknown as Topology;
const ids = toFeatureCollection({ geography: world, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
// Datos SINTÉTICOS deterministas (ver la story headless).
const data: Row[] = ids.map((id) => {
  const n = Number(id);
  if (n % 7 === 0) return { id, value: null };
  if (n % 11 === 0) return { id, value: 0 };
  return { id, value: Math.round((((n * 9301 + 49297) % 233280) / 233280) * 40 - 20) };
});

type Props = { variant: "sequential" | "diverging"; customTooltip: boolean; showCount: boolean };

const CompoundMap = ({ variant, customTooltip, showCount }: Props) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 1100 }}>
      <Choropleth.Root
        geography={world}
        objectName="countries"
        data={data}
        getId={(r) => r.id}
        getValue={(r) => r.value}
        variant={variant}
        formatValue={(v) => `${v} %`}
        selectedId={selectedId}
        onItemClick={({ id }) => setSelectedId((cur) => (cur === id ? null : id))}
      >
        <Choropleth.Svg ariaLabel="Mapa del mundo con datos sintéticos" />
        {/* La leyenda es HTML: va fuera del <svg>, como hermana, y se posiciona con CSS. */}
        <div style={{ position: "absolute", left: 12, bottom: 12 }}>
          <Choropleth.Legend title="Variación" showCount={showCount} />
        </div>
        {customTooltip ? (
          <Choropleth.Tooltip<Row>>
            {({ datum, formattedValue, color }) => (
              <div style={{ background: "#111", color: "#fff", padding: 8, borderRadius: 6 }}>
                <span
                  style={{ background: color, display: "inline-block", width: 10, height: 10 }}
                />{" "}
                país {datum?.id ?? "?"}: {formattedValue || "sin dato"}
              </div>
            )}
          </Choropleth.Tooltip>
        ) : (
          <Choropleth.Tooltip />
        )}
      </Choropleth.Root>
      <p style={{ font: "12px sans-serif" }}>Seleccionado: {selectedId ?? "ninguno"}</p>
    </div>
  );
};

const meta = {
  title: "Compound/Choropleth.Root",
  component: CompoundMap,
  args: { variant: "diverging", customTooltip: false, showCount: true },
  argTypes: { variant: { control: "inline-radio", options: ["sequential", "diverging"] } },
} satisfies Meta<typeof CompoundMap>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
export const CustomTooltip: StoryObj<typeof meta> = { args: { customTooltip: true } };
export const Sequential: StoryObj<typeof meta> = { args: { variant: "sequential" } };
