// Step 37: `Zoom/Cooperative` (dd.md §21). A map with `wheel: "cooperative"` inside a scrolling page:
//  · the wheel WITHOUT a modifier scrolls the page (the map does not eat it) and shows the hint for 1.5 s;
//  · Ctrl/⌘ + wheel zooms; on touch, one finger scrolls the page and two fingers zoom (pinch);
//  · inertia is noticeable when releasing a drag; the buttons and the keyboard (+, −, 0) also work.
// The panel below uses `useCamera` (CONFIRMED camera: it changes on release, never per frame).
// Deterministic SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { Choropleth, useCamera, type RootProps } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const ids = toFeatureCollection({ geography: world110m, objectName: "countries" }).features.flatMap(
  (f) => (f.id === undefined ? [] : [String(f.id)]),
);
// Without Antarctica: it is filtered out of the map, so there must be no datum for it either (avoids the join warning).
const data: Row[] = ids
  .filter((id) => id !== "AQ")
  .map((id) => ({ id, value: Math.round(((seed(id) * 9301) % 1000) / 10) }));

/** Reads the confirmed camera with `useCamera`: it updates on gesture release, not during it. */
const CameraPanel = () => {
  const zoomedIn = useCamera((view) => view.zoom > 3);
  const zoom = useCamera((view) => view.zoom);
  const center = useCamera((view) => view.center);
  return (
    <p style={{ margin: "8px 0", fontVariantNumeric: "tabular-nums" }}>
      <b>useCamera</b> · zoom {zoom.toFixed(2)} · centro [
      {center.map((n) => n.toFixed(1)).join(", ")}] ·{" "}
      {zoomedIn ? "acercado (> 3)" : "vista general (≤ 3)"}
    </p>
  );
};

/** Counts how far the PAGE has moved: it shows that the wheel without Ctrl/⌘ reaches the scroll. */
const ScrollMeter = () => {
  const out = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const onScroll = () => {
      if (out.current !== null) out.current.textContent = String(Math.round(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <p style={{ margin: "8px 0" }}>
      Page scroll: <b ref={out}>0</b> px
    </p>
  );
};

type Args = { inertia: boolean; pinch: boolean; controls: boolean; max: number };

const Cooperative = ({ inertia, pinch, controls, max }: Args) => (
  <div style={{ maxWidth: 900, font: "14px/1.5 system-ui, sans-serif" }}>
    <h3 style={{ margin: "0 0 4px" }}>Check cooperative mode</h3>
    <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
      <li>Wheel over the map: the page moves and the "Use Ctrl/⌘ + scroll" hint appears.</li>
      <li>Ctrl/⌘ + wheel: the map zooms (the page stays still).</li>
      <li>
        Drag and release at speed: the inertia carries on for a moment (and stops when you touch).
      </li>
      <li>On touch: one finger moves the page; two fingers pinch and pan the map.</li>
      <li>Buttons, or the +, − and 0 keys with the map focused.</li>
    </ol>
    <ScrollMeter />
    <Choropleth.Root
      {...({
        geography: world110m,
        objectName: "countries",
        data,
        getId: (r: Row) => r.id,
        getValue: (r: Row) => r.value,
        variant: "sequential",
        filterFeatures: (f) => f.id !== "AQ",
        aspectRatio: "auto",
        zoom: { wheel: "cooperative", inertia, pinch, max },
      } as RootProps<Row>)}
    >
      <Choropleth.Svg ariaLabel="Map with cooperative zoom (synthetic data)" />
      {controls && <Choropleth.ZoomControls />}
      <Choropleth.GestureHint />
      <Choropleth.Tooltip />
      <CameraPanel />
    </Choropleth.Root>
    <div
      style={{ height: 900, background: "linear-gradient(#fff, #e5e7eb)", padding: 12 }}
      aria-hidden
    >
      ↓ More page: if the scroll reaches here with the mouse over the map, cooperative mode works.
    </div>
  </div>
);

const meta = {
  title: "Zoom/Cooperative",
  component: Cooperative,
  parameters: { layout: "padded" },
  args: { inertia: true, pinch: true, controls: true, max: 12 },
  argTypes: { max: { control: { type: "range", min: 2, max: 30, step: 1 } } },
} satisfies Meta<typeof Cooperative>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Ctrl/⌘ hint, pinch, inertia and controls, with the page scrolling underneath. */
export const Default: Story = {};

/** Without inertia: the map stops dead on release. */
export const WithoutInertia: Story = { args: { inertia: false } };

/** Without pinch: two fingers do not zoom, they only scroll the page. */
export const WithoutPinch: Story = { args: { pinch: false } };
