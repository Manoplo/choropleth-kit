// PROVISIONAL. Esta story monta el mapa "a mano" para comprobar que toda la cadena de `core`
// funciona de extremo a extremo. Se sustituirá por <ChoroplethMap> cuando exista la capa React
// (tareas 8-10 de dd.md §20): entonces toda la lógica de este archivo vivirá en un hook.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { geoPath } from "d3-geo";
import type { Topology } from "topojson-specification";
import countries110m from "world-atlas/countries-110m.json";
import {
  createColorScale,
  createProjection,
  joinData,
  toFeatureCollection,
  type Classification,
  type ProjectionName,
} from "../src/core";

type Row = { id: string; value: number | null };

const WIDTH = 960;
const HEIGHT = 500;

// Geometría: se normaliza una sola vez, fuera del componente (referencia estable).
const world = toFeatureCollection({
  geography: countries110m as unknown as Topology,
  objectName: "countries",
});

// Datos SINTÉTICOS (nada real): un valor pseudoaleatorio pero determinista por id, entre -20 y 20.
// Cada 7.º país queda sin dato (null) y cada 11.º tiene exactamente 0, para ver en el mapa que
// "sin dato" y "cero" no se pintan igual.
const syntheticData: Row[] = world.features.flatMap<Row>((feature) => {
  if (feature.id === undefined) return [];
  const id = String(feature.id);
  const n = Number(id);
  if (n % 7 === 0) return [{ id, value: null }];
  if (n % 11 === 0) return [{ id, value: 0 }];
  return [{ id, value: Math.round((((n * 9301 + 49297) % 233280) / 233280) * 40 - 20) }];
});

type MapProps = {
  variant: "sequential" | "diverging";
  projection: ProjectionName;
  method: Classification["method"];
};

const FirstMap = ({ variant, projection: projectionName, method }: MapProps) => {
  // 1. unir datos y regiones (paso 4)
  const { joined } = joinData({
    features: world.features,
    data: syntheticData,
    getId: (r) => r.id,
  });

  // 2. escala de color (paso 5)
  const classification: Classification =
    method === "threshold" ? { method, thresholds: [-10, 0, 10] } : { method };
  const scale = createColorScale({
    variant,
    values: syntheticData.map((r) => r.value),
    classification,
  });

  // 3. proyección ajustada al contenedor (paso 6)
  const projection = createProjection({
    name: projectionName,
    width: WIDTH,
    height: HEIGHT,
    featureCollection: world,
  });
  const toPath = geoPath(projection);

  // 4. React dibuja; d3 solo ha calculado
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: "100%", height: "auto" }}>
      {world.features.map((feature, i) => {
        const d = toPath(feature);
        if (d === null) return null;
        const datum = joined.get(String(feature.id));
        return (
          <path
            key={String(feature.id ?? `no-id-${i}`)}
            d={d}
            fill={scale.getColor(datum?.value)}
            stroke="white"
            strokeWidth={0.5}
          />
        );
      })}
    </svg>
  );
};

const meta = {
  title: "Setup/First map (provisional)",
  component: FirstMap,
  args: { variant: "diverging", projection: "equalEarth", method: "quantize" },
  argTypes: {
    variant: { control: "inline-radio", options: ["sequential", "diverging"] },
    projection: {
      control: "select",
      options: ["equalEarth", "naturalEarth", "mercator", "orthographic"],
    },
    method: { control: "inline-radio", options: ["linear", "quantize", "quantile", "threshold"] },
  },
} satisfies Meta<typeof FirstMap>;

export default meta;

export const Diverging: StoryObj<typeof meta> = {};
export const Sequential: StoryObj<typeof meta> = {
  args: { variant: "sequential", method: "quantile" },
};
export const MercatorInflatesPoles: StoryObj<typeof meta> = { args: { projection: "mercator" } };
