// Fase B (v0.3), paso 24: zoom y pan con d3-zoom. Datos SINTÉTICOS deterministas.
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
          // Opt-in: sin `controls` no hay botones.
          controls: controls ? { position: controlsPosition } : false,
          onViewChange: setView,
        }}
      />
      <p>
        <b>onViewChange</b> (solo al terminar el gesto):{" "}
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

/** La rueda hace zoom con el ratón encima, arrastrar desplaza, doble clic = ×2. */
export const Default: Story = {};

/**
 * Botones `+` / `−` / `⟲` (opt-in: `zoom={{ controls: true }}`) y teclado: haz clic en el mapa (o
 * tabula hasta él: anillo de foco) y usa `+`, `−`, `0`. `−` y `⟲` están deshabilitados en el encaje.
 */
export const WithControlsAndKeyboard: Story = { args: { controls: true } };

/**
 * `wheel: "cooperative"`: la rueda sin Ctrl/⌘ NO hace zoom y la página sigue haciendo scroll (hay
 * contenido debajo para comprobarlo). Con Ctrl/⌘ + rueda, sí. Al intentarlo sin tecla aparece 1,5 s el aviso «Usa Ctrl + rueda…» (⌘ en macOS).
 */
export const CooperativeInAScrollablePage: Story = {
  args: { wheel: "cooperative", controls: true },
  render: (args) => (
    <div>
      <p style={{ font: "13px sans-serif" }}>
        ↓ Haz scroll con la rueda sobre el mapa: la página debe moverse.
      </p>
      <ZoomDemo {...args} />
      <div style={{ height: 900, background: "linear-gradient(#fff, #e5e7eb)" }} />
    </div>
  ),
};

/**
 * Clic ≠ arrastre. Con `onItemClick` (y selección) el doble clic no hace zoom. Prueba: un clic con un
 * pequeño temblor SELECCIONA; arrastrar de verdad no selecciona nada al soltar.
 */
export const ClickVersusDrag: Story = { args: { clickSelects: true } };

export const PanOnly: Story = { args: { wheel: "never", pinch: false } };
