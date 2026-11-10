// Phase B (v0.3), step 26: camera flights. Deterministic SYNTHETIC data.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { toFeatureCollection } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap, type ChoroplethMapHandle } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number };

const features = toFeatureCollection({ geography: world110m, objectName: "countries" }).features;
const ids = features.flatMap((f) => (f.id === undefined ? [] : [String(f.id)]));
const data: Row[] = ids.map((id) => ({ id, value: Math.round(((seed(id) * 9301) % 1000) / 10) }));
const nameOf = (id: string) =>
  String((features.find((f) => f.id === id)?.properties as { name?: string } | null)?.name ?? id);

/** The countries where a naive framing fails (dd.md §11.1.5) and some "normal" ones. */
const TOUR = ["ES", "FR", "US", "RU", "FJ", "NO", "JP", "BR", "ZA"] as const;

const mapProps = {
  geography: world110m,
  objectName: "countries",
  data,
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.value,
  variant: "sequential",
  filterFeatures: (f: { id?: unknown }) => f.id !== "AQ",
  aspectRatio: "auto",
} as const;

const Demo = ({ mode }: { mode: "declarative" | "imperative" }) => {
  const ref = useRef<ChoroplethMapHandle>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [status, setStatus] = useState("—");
  const [touring, setTouring] = useState(false);
  const stop = useRef(false);

  // The tour: each `await` waits for the flight to end. If the user grabs the map midway, the flight is
  // cut short (`completed: false`) and the tour stops instead of carrying on against them.
  const runTour = async () => {
    const map = ref.current;
    if (map === null) return;
    stop.current = false;
    setTouring(true);
    for (const id of TOUR) {
      setStatus(`volando a ${nameOf(id)}…`);
      const result = await map.zoomTo(id);
      if (!result.completed || stop.current) {
        setStatus(`tour interrumpido en ${nameOf(id)}`);
        setTouring(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 600)); // a pause to take it in
    }
    setStatus("volviendo al mundo…");
    await map.resetView();
    setStatus("tour terminado");
    setTouring(false);
  };

  const select = (id: string) => {
    if (mode === "declarative") setFocusId(id === "" ? null : id);
    else if (id === "") void ref.current?.resetView();
    else void ref.current?.zoomTo(id);
  };

  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <label>
          Country{" "}
          <select disabled={touring} onChange={(e) => select(e.target.value)} defaultValue="">
            <option value="">(whole world)</option>
            {[...ids]
              .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
              .map((id) => (
                <option key={id} value={id}>
                  {nameOf(id)}
                </option>
              ))}
          </select>
        </label>
        <button type="button" disabled={touring} onClick={() => void runTour()}>
          ▶ Tour ({TOUR.map(nameOf).join(" → ")})
        </button>
        {touring && (
          <button
            type="button"
            onClick={() => {
              stop.current = true;
            }}
          >
            ■ Parar
          </button>
        )}
        <span>{status}</span>
      </div>
      <ChoroplethMap
        {...mapProps}
        ref={ref}
        // Declarative: `focusId` flies when it changes; with `null`, it returns to the fit.
        focusId={mode === "declarative" ? focusId : undefined}
        zoom={{ controls: true }}
      />
      <p>
        Mode <b>{mode}</b>: {mode === "declarative" ? "`focusId={…}`" : "`ref.current.zoomTo(id)`"}.
        Drag the map during the tour: the flight is cut short and the tour stops.
      </p>
    </div>
  );
};

const meta = {
  title: "Zoom/FocusAndFlights",
  component: Demo,
  parameters: { layout: "padded" },
  args: { mode: "declarative" },
  argTypes: { mode: { control: "inline-radio", options: ["declarative", "imperative"] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `focusId`: pick a country and the camera FLIES (zooms out, travels, zooms in). "(whole world)" returns to the fit. */
export const Declarative: Story = { args: { mode: "declarative" } };

/** The same selector with the handle (`ref.current.zoomTo`) and a tour that chains `await zoomTo(...)`. */
export const ImperativeAndTour: Story = { args: { mode: "imperative" } };
