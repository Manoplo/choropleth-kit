// Fase B (v0.3), paso 26: vuelos de cámara. Datos SINTÉTICOS deterministas.
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

/** Los países donde falla un encuadre ingenuo (dd.md §11.1.5) y algunos «normales». */
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

const Demo = ({ mode }: { mode: "declarativo" | "imperativo" }) => {
  const ref = useRef<ChoroplethMapHandle>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [status, setStatus] = useState("—");
  const [touring, setTouring] = useState(false);
  const stop = useRef(false);

  // El tour: cada `await` espera a que termine el vuelo. Si el usuario agarra el mapa a mitad,
  // el vuelo se corta (`completed: false`) y el tour se detiene en vez de seguir contra él.
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
      await new Promise((resolve) => setTimeout(resolve, 600)); // una pausa para verlo
    }
    setStatus("volviendo al mundo…");
    await map.resetView();
    setStatus("tour terminado");
    setTouring(false);
  };

  const select = (id: string) => {
    if (mode === "declarativo") setFocusId(id === "" ? null : id);
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
          País{" "}
          <select disabled={touring} onChange={(e) => select(e.target.value)} defaultValue="">
            <option value="">(mundo entero)</option>
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
        // Declarativo: `focusId` vuela cuando cambia; con `null`, vuelve al encaje.
        focusId={mode === "declarativo" ? focusId : undefined}
        zoom={{ controls: true }}
      />
      <p>
        Modo <b>{mode}</b>: {mode === "declarativo" ? "`focusId={…}`" : "`ref.current.zoomTo(id)`"}.
        Arrastra el mapa durante el tour: el vuelo se corta y el tour se detiene.
      </p>
    </div>
  );
};

const meta = {
  title: "Zoom/FocusAndFlights",
  component: Demo,
  parameters: { layout: "padded" },
  args: { mode: "declarativo" },
  argTypes: { mode: { control: "inline-radio", options: ["declarativo", "imperativo"] } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `focusId`: elige un país y la cámara VUELA (se aleja, viaja, se acerca). «(mundo entero)» vuelve al encaje. */
export const Declarative: Story = { args: { mode: "declarativo" } };

/** El mismo selector con el handle (`ref.current.zoomTo`) y un tour que encadena `await zoomTo(...)`. */
export const ImperativeAndTour: Story = { args: { mode: "imperativo" } };
