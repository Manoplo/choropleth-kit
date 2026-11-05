// Nivel 3 (headless): el hook devuelve datos y aquí decidimos cómo pintarlos. Cuando existan el
// compound y el preset, esta story seguirá siendo el ejemplo de "quiero pintar yo todo".
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import { toFeatureCollection, type Classification, type ProjectionName } from "../src/core";
import { useChoropleth, useMapStore } from "../src/react";

type Row = { id: string; value: number | null };

// Referencia estable: el hook memoiza la geometría por identidad de `geography`.
const world = countries110m as unknown as Topology;
const ids = toFeatureCollection({ geography: world, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);

// Datos SINTÉTICOS deterministas. Cada 7.º país sin dato (null) y cada 11.º con 0 exacto: así se
// ve en el mapa que "sin dato" y "cero" no se pintan igual.
const syntheticData: Row[] = ids.map((id) => {
  const n = Number(id);
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
      emptyLabel: "Sin dato",
      onItemClick: selectable
        ? ({ id }) => setSelectedId((cur) => (cur === id ? null : id))
        : undefined,
    });
  // El hover vive fuera del hook: este componente solo se re-renderiza porque lo lee aquí.
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
