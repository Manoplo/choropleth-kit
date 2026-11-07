// Level 2 (compound): the same pieces the preset will use, but you choose which ones and in what order.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { seed } from "./seed";
import { Choropleth } from "../src/react";

type Row = { id: string; value: number | null };

// The library's own geodata: ISO alpha-2 ids ("ES") and Kosovo included.
const world = world110m;
const ids = toFeatureCollection({ geography: world, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
// Deterministic SYNTHETIC data (see the headless story).
const data: Row[] = ids.map((id) => {
  const n = seed(id);
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
        <Choropleth.Svg ariaLabel="World map with synthetic data" />
        {/* The legend is HTML: it goes outside the <svg>, as a sibling, and is positioned with CSS. */}
        <div style={{ position: "absolute", left: 12, bottom: 12 }}>
          <Choropleth.Legend title="Change" showCount={showCount} />
        </div>
        {customTooltip ? (
          <Choropleth.Tooltip<Row>>
            {({ datum, formattedValue, color }) => (
              <div style={{ background: "#111", color: "#fff", padding: 8, borderRadius: 6 }}>
                <span
                  style={{ background: color, display: "inline-block", width: 10, height: 10 }}
                />{" "}
                country {datum?.id ?? "?"}: {formattedValue || "no data"}
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
