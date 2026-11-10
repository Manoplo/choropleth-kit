// Phase B (v0.3), step 27: bubble counter-scaling and inertia. Deterministic SYNTHETIC data.
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

/** `sqrt`: when zooming in, bubbles grow slowly (√k). Drag fast and release: the map slides and slows down. */
export const Sqrt: Story = {};

/** `screen`: constant size on screen (zooming in does not enlarge them). */
export const Screen: Story = { args: { bubbleScaling: "screen" } };

/** `geo`: they grow with the map (at high k they cover the country). */
export const Geo: Story = { args: { bubbleScaling: "geo" } };

/** Without inertia: on release, the map stops dead. */
export const NoInertia: Story = { args: { inertia: true } };
