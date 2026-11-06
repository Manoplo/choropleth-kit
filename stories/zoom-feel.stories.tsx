// Fase B (v0.3), paso 27: contraescalado de burbujas e inercia. Datos SINTÉTICOS deterministas.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const features = toFeatureCollection({ geography: world110m, objectName: "countries" }).features;
const data: Row[] = features.flatMap((f) =>
  f.id === undefined
    ? []
    : [{ id: String(f.id), value: Math.round(((seed(String(f.id)) * 9301) % 1000) / 10) }],
);

type Props = {
  bubbleScaling: "sqrt" | "screen" | "geo";
  inertia: boolean;
};

const Demo = ({ bubbleScaling, inertia }: Props) => (
  <div style={{ maxWidth: 1100 }}>
    <ChoroplethMap<Row>
      geography={world110m}
      objectName="countries"
      data={data}
      getId={(r) => r.id}
      getValue={(r) => r.value}
      variant="bubble"
      filterFeatures={(f) => f.id !== "AQ"}
      aspectRatio="auto"
      zoom={{ bubbleScaling, inertia, max: 40, controls: true }}
    />
  </div>
);

const meta = {
  title: "Zoom/BubblesAndInertia",
  component: Demo,
  parameters: { layout: "padded" },
  args: { bubbleScaling: "sqrt", inertia: true },
  argTypes: {
    bubbleScaling: { control: "inline-radio", options: ["sqrt", "screen", "geo"] },
    inertia: { control: "boolean" },
  },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `sqrt`: al acercar, las burbujas crecen despacio (√k). Arrastra rápido y suelta: el mapa desliza y frena. */
export const Sqrt: Story = {};

/** `screen`: tamaño constante en pantalla (acercar no las agranda). */
export const Screen: Story = { args: { bubbleScaling: "screen" } };

/** `geo`: crecen con el mapa (a k alto tapan el país). */
export const Geo: Story = { args: { bubbleScaling: "geo" } };

/** Sin inercia: al soltar, el mapa se para en seco. */
export const NoInertia: Story = { args: { inertia: true } };
