// Level 3 (headless): the hook returns data and here we decide how to paint it. When the compound and
// the preset exist, this story will remain the example for "I want to paint everything myself".
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection, type Classification, type ProjectionName } from "../src/core";
import { world110m } from "../src/geo";
import { seed } from "./seed";
import { useChoropleth, useMapStore } from "../src/react";

type Row = { id: string; value: number | null };

// Stable reference: the hook memoizes the geometry by the identity of `geography`.
// The library's own geodata: ISO alpha-2 ids ("ES") and Kosovo included.
const world = world110m;
const ids = toFeatureCollection({ geography: world, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);

// Deterministic SYNTHETIC data. Every 7th country has no data (null) and every 11th has an exact 0: that
// way the map shows that "no data" and "zero" are not painted the same.
const syntheticData: Row[] = ids.map((id) => {
  const n = seed(id);
  if (n % 7 === 0) return { id, value: null };
  if (n % 11 === 0) return { id, value: 0 };
  return { id, value: Math.round((((n * 9301 + 49297) % 233280) / 233280) * 40 - 20) };
});

type MapProps = {
  variant: "sequential" | "diverging";
  projection: ProjectionName;
  method: Classification["method"];
  selectable: boolean;
};

const HeadlessMap = ({ variant, projection, method, selectable }: MapProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const classification: Classification =
    method === "threshold" ? { method, thresholds: [-10, 0, 10] } : { method };

  const { containerRef, width, height, regions, borders, legend, store, getRegionProps } =
    useChoropleth<Row>({
      geography: world,
      objectName: "countries",
      data: syntheticData,
      getId: (r) => r.id,
      getValue: (r) => r.value,
      variant,
      projection,
      classification,
      selectedId,
      emptyLabel: "No data",
      onItemClick: selectable
        ? ({ id }) => setSelectedId((cur) => (cur === id ? null : id))
        : undefined,
    });
  // The hover lives outside the hook: this component only re-renders because it reads it here.
  const hoveredId = useMapStore(store, (s) => s.hovered?.id ?? null);

  return (
    <div ref={containerRef} style={{ width: "100%", maxWidth: 1100 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
        {regions.map((region) => (
          <path
            key={region.id}
            d={region.path}
            fill={region.fill}
            stroke={
              region.id === selectedId ? "#0b5fff" : region.id === hoveredId ? "#000" : "none"
            }
            strokeWidth={region.id === selectedId || region.id === hoveredId ? 1.5 : 0}
            {...getRegionProps(region)}
          />
        ))}
        {borders !== null && <path d={borders} fill="none" stroke="white" strokeWidth={0.5} />}
      </svg>
      <ul
        style={{ display: "flex", gap: 12, listStyle: "none", padding: 0, font: "12px sans-serif" }}
      >
        {legend.map((item) => (
          <li key={item.label}>
            <span
              style={{ background: item.color, display: "inline-block", width: 12, height: 12 }}
            />{" "}
            {item.label} ({item.count})
          </li>
        ))}
      </ul>
    </div>
  );
};

const meta = {
  title: "Headless/useChoropleth",
  component: HeadlessMap,
  args: { variant: "diverging", projection: "equalEarth", method: "quantize", selectable: true },
  argTypes: {
    variant: { control: "inline-radio", options: ["sequential", "diverging"] },
    projection: {
      control: "select",
      options: ["equalEarth", "naturalEarth", "mercator", "orthographic"],
    },
    method: { control: "inline-radio", options: ["linear", "quantize", "quantile", "threshold"] },
  },
} satisfies Meta<typeof HeadlessMap>;

export default meta;

export const Diverging: StoryObj<typeof meta> = {
  args: {
    projection: "orthographic",
  },
};
export const Sequential: StoryObj<typeof meta> = {
  args: { variant: "sequential", method: "quantile" },
};
export const MercatorInflatesPoles: StoryObj<typeof meta> = { args: { projection: "mercator" } };
