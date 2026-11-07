// Phase B (v0.3), step 24: zoom and pan with d3-zoom. Deterministic SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { toFeatureCollection, type ViewState } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
const data: Row[] = ids.map((id) => ({ id, value: Math.round(((seed(id) * 9301) % 1000) / 10) }));

type Args = {
  wheel: "always" | "cooperative" | "never";
  max: number;
  pan: boolean;
  pinch: boolean;
  doubleClick: "auto" | "on" | "off";
  clickSelects: boolean;
  controls: boolean;
  controlsPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  keyboard: boolean;
};

const ZoomDemo = ({
  wheel,
  max,
  pan,
  pinch,
  doubleClick,
  clickSelects,
  controls,
  controlsPosition,
  keyboard,
}: Args) => {
  const [view, setView] = useState<ViewState | null>(null);
  const [clicks, setClicks] = useState(0);

  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <ChoroplethMap
        geography={world110m}
        objectName="countries"
        data={data}
        getId={(r: Row) => r.id}
        getValue={(r: Row) => r.value}
        variant="sequential"
        filterFeatures={(f) => f.id !== "AQ"}
        aspectRatio="auto"
        defaultSelectedId={clickSelects ? "ES" : undefined}
        onItemClick={clickSelects ? () => setClicks((n) => n + 1) : undefined}
        zoom={{
          wheel,
          max,
          pan,
          pinch,
          doubleClick: doubleClick === "auto" ? "auto" : doubleClick === "on",
          keyboard,
          // Opt-in: without `controls` there are no buttons.
          controls: controls ? { position: controlsPosition } : false,
          onViewChange: setView,
        }}
      />
      <p>
        <b>onViewChange</b> (only when the gesture ends):{" "}
        {view === null
          ? "—"
          : `zoom ${view.zoom.toFixed(2)} · centro [${view.center.map((n) => n.toFixed(1)).join(", ")}] · lon ${view.bounds[0][0].toFixed(0)}…${view.bounds[1][0].toFixed(0)}`}
        {clickSelects && ` · clics: ${clicks}`}
      </p>
    </div>
  );
};

const meta = {
  title: "Zoom/Basic",
  component: ZoomDemo,
  parameters: { layout: "padded" },
  args: {
    wheel: "always",
    max: 12,
    pan: true,
    pinch: true,
    doubleClick: "auto",
    clickSelects: false,
    controls: false,
    controlsPosition: "bottom-right",
    keyboard: true,
  },
  argTypes: {
    wheel: { control: "inline-radio", options: ["always", "cooperative", "never"] },
    doubleClick: { control: "inline-radio", options: ["auto", "on", "off"] },
    max: { control: { type: "range", min: 2, max: 30, step: 1 } },
    controlsPosition: {
      control: "select",
      options: ["top-left", "top-right", "bottom-left", "bottom-right"],
    },
  },
} satisfies Meta<typeof ZoomDemo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The wheel zooms with the mouse over the map, dragging pans, double click = ×2. */
export const Default: Story = {};

/**
 * `+` / `−` / `⟲` buttons (opt-in: `zoom={{ controls: true }}`) and keyboard: click on the map (or
 * tab to it: focus ring) and use `+`, `−`, `0`. `−` and `⟲` are disabled at the fit.
 */
export const WithControlsAndKeyboard: Story = { args: { controls: true } };

/**
 * `wheel: "cooperative"`: the wheel without Ctrl/⌘ does NOT zoom and the page keeps scrolling (there is
 * content below to check). With Ctrl/⌘ + wheel, it does. Trying it without the key shows the "Use Ctrl + scroll…" hint for 1.5 s (⌘ on macOS).
 */
export const CooperativeInAScrollablePage: Story = {
  args: { wheel: "cooperative", controls: true },
  render: (args) => (
    <div>
      <p style={{ font: "13px sans-serif" }}>
        ↓ Scroll with the wheel over the map: the page must move.
      </p>
      <ZoomDemo {...args} />
      <div style={{ height: 900, background: "linear-gradient(#fff, #e5e7eb)" }} />
    </div>
  ),
};

/**
 * Click ≠ drag. With `onItemClick` (and selection) the double click does not zoom. Test: a click with a
 * slight tremor SELECTS; really dragging selects nothing on release.
 */
export const ClickVersusDrag: Story = { args: { clickSelects: true } };

export const PanOnly: Story = { args: { wheel: "never", pinch: false } };
