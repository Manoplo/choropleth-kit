// Level 1 (preset): the 90 % case. Notice how short it is compared with the headless/compound stories.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { seed } from "./seed";
import { ChoroplethMap } from "../src/react";

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
          // Theming: just override --cm-* variables on any ancestor of the map.
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
        legend={legend ? { title: "Change vs prior year", position: legendPosition } : false}
        selectedId={selectedId}
        onItemClick={({ id }) => setSelectedId((cur) => (cur === id ? null : id))}
        ariaLabel="Change by country (synthetic data)"
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
