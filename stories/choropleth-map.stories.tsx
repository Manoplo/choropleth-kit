// Nivel 1 (preset): el caso del 90 %. Fíjate en lo corto que es frente a las stories headless/compound.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { toFeatureCollection } from "../src/core";
import { ChoroplethMap } from "../src/react";

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

type Props = {
  themed: boolean;
  variant: "sequential" | "diverging";
  legend: boolean;
  legendPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

const Preset = ({ variant, legend, legendPosition, themed }: Props) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div
      style={
        {
          maxWidth: 1100,
          // Theming: basta con sobrescribir variables --cm-* en cualquier ancestro del mapa.
          ...(themed && {
            "--cm-empty-fill": "#fde68a",
            "--cm-border-color": "#1f2937",
            "--cm-border-width": "0.8px",
            "--cm-hover-stroke": "#dc2626",
            "--cm-selected-stroke": "#16a34a",
            "--cm-tooltip-bg": "#111827",
            "--cm-tooltip-color": "#f9fafb",
            "--cm-font-family": "Georgia, serif",
          }),
        } as React.CSSProperties
      }
    >
      <ChoroplethMap
        geography={world}
        objectName="countries"
        data={data}
        getId={(r) => r.id}
        getValue={(r) => r.value}
        variant={variant}
        formatValue={(v) => `${v} %`}
        legend={legend ? { title: "Variación vs A-1", position: legendPosition } : false}
        selectedId={selectedId}
        onRegionClick={({ id }) => setSelectedId((cur) => (cur === id ? null : id))}
        ariaLabel="Variación por país (datos sintéticos)"
      />
    </div>
  );
};

const meta = {
  title: "Preset/ChoroplethMap",
  component: Preset,
  args: { variant: "diverging", legend: true, legendPosition: "bottom-left", themed: false },
  argTypes: {
    variant: { control: "inline-radio", options: ["sequential", "diverging"] },
    legendPosition: {
      control: "select",
      options: ["top-left", "top-right", "bottom-left", "bottom-right"],
    },
  },
} satisfies Meta<typeof Preset>;

export default meta;

export const Diverging: StoryObj<typeof meta> = {};
export const Sequential: StoryObj<typeof meta> = {
  args: {
    variant: "sequential",
    themed: true,
  },
};
export const WithoutLegend: StoryObj<typeof meta> = { args: { legend: false } };
export const Themed: StoryObj<typeof meta> = { args: { themed: true } };
