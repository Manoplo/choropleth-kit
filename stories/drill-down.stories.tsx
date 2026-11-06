// Fase C (v0.4), pasos 31-32: la prop `drill` y su coreografía (vuelo a R, contexto gris, revelado
// escalonado, subir a la cámara de antes, navegación lateral). Datos SINTÉTICOS deterministas.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useState } from "react";
import { geoBounds, geoCentroid } from "d3-geo";
import { toFeatureCollection, type DrillContext } from "../src/core";
import { world110m } from "../src/geo";
import { ChoroplethMap, defineDrillLevels, useDrillDown, type DrillEvent } from "../src/react";
import { seed } from "./seed";

type Row = {
  id: string;
  /** `country` en el nivel raíz; `store` en el siguiente. */
  kind: "country" | "store";
  parentId?: string;
  value: number;
  /** [lon, lat] de una tienda. */
  at?: [number, number];
};

const features = toFeatureCollection({ geography: world110m, objectName: "countries" }).features;
const ids = features.flatMap((f) => (f.id === undefined ? [] : [String(f.id)]));

/** Países con tiendas (los demás no son navegables: un clic los selecciona). */
const WITH_STORES = ["ES", "FR", "DE", "IT", "GB", "US", "BR", "JP", "AU", "ZA", "IN", "MX"];

const countries: Row[] = ids.map((id) => ({
  id,
  kind: "country",
  value: Math.round(((seed(id) * 9301) % 1000) / 10),
}));

/** 8-14 tiendas repartidas por el país (sintéticas; algunas caen en el mar y es normal). */
const storesOf = (countryId: string): Row[] => {
  const feature = features.find((f) => f.id === countryId);
  if (feature === undefined) return [];
  const [lon, lat] = geoCentroid(feature);
  const [[west, south], [east, north]] = geoBounds(feature);
  const spanLon = Math.min(Math.abs(east - west), 40);
  const spanLat = Math.min(Math.abs(north - south), 25);
  const count = 8 + (seed(countryId) % 7);
  return Array.from({ length: count }, (_, i) => {
    const a = (seed(`${countryId}${i}a`) % 1000) / 1000 - 0.5;
    const b = (seed(`${countryId}${i}b`) % 1000) / 1000 - 0.5;
    return {
      id: `${countryId}-S${i + 1}`,
      kind: "store" as const,
      parentId: countryId,
      value: 10 + (seed(`${countryId}${i}v`) % 90),
      at: [lon + a * spanLon * 0.7, lat + b * spanLat * 0.7],
    };
  });
};
const storesByCountry = new Map(WITH_STORES.map((id) => [id, storesOf(id)]));

/** El selector de `data`: filas del nivel que se muestra. */
const select = ({ depth, parentId }: DrillContext): readonly Row[] =>
  depth === 0 ? countries : (storesByCountry.get(parentId ?? "") ?? []);

// Ejemplo A de dd.md §11.2.2: mundo → país → tiendas. Aquí el segundo nivel hereda la geometría del
// mundo ("inherit") y dibuja las tiendas como burbujas en sus coordenadas.
const levels = defineDrillLevels<Row>([
  {
    id: "country",
    label: "World",
    geography: world110m,
    objectName: "countries",
    filterFeatures: (f) => f.id !== "AQ",
    canDrill: (item) => WITH_STORES.includes(item.id),
  },
  {
    id: "store",
    geography: "inherit",
    encoding: {
      variant: "bubble",
      getValue: (r) => r.value,
      getCoordinates: (r) => r.at ?? null,
      color: "#e4572e",
    },
  },
]);

const common = {
  getId: (r: Row) => r.id,
  variant: "sequential",
  getValue: (r: Row) => r.value,
  aspectRatio: "auto",
  zoom: { controls: true },
  emptyLabel: "No data",
} as const;

const Log = ({ lines }: { lines: string[] }) => (
  <pre style={{ font: "12px/1.5 monospace", margin: "8px 0 0", minHeight: 72, opacity: 0.85 }}>
    {lines.length === 0 ? "—" : lines.join("\n")}
  </pre>
);

const describe = (e: DrillEvent<Row>) =>
  `${e.direction}: [${e.from.path.join(" › ")}] → [${e.to.path.join(" › ")}]${e.item ? ` (clic en ${e.item.id})` : ""}`;

// ── Uncontrolled ──────────────────────────────────────────────────────────────────────────────────

const Uncontrolled = () => {
  const [lines, setLines] = useState<string[]>([]);
  const push = (line: string) => setLines((prev) => [...prev.slice(-5), line]);
  // `useDrillDown` sin `path` es no controlado; se usa aquí solo para tener un botón «Subir» (el breadcrumb y
  // Escape llegan en el paso siguiente). `drill={levels}` a secas también funciona.
  const drill = useDrillDown<Row>({ levels });
  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <button disabled={!drill.canDrillUp} onClick={() => drill.drillUp()}>
          ← Subir
        </button>
        <span>
          {drill.breadcrumbs.map((crumb) => crumb.label).join(" › ")} · estado:{" "}
          <b>{drill.status}</b>
        </span>
      </div>
      <ChoroplethMap<Row>
        {...common}
        drill={drill}
        data={select}
        onDrill={(e) => push(`onDrill     ${describe(e)}`)}
        onDrillEnd={(e) => push(`onDrillEnd  ${describe(e)}`)}
      />
      <Log lines={lines} />
    </div>
  );
};

// ── Controlled ────────────────────────────────────────────────────────────────────────────────────

/** Simula una consulta con latencia: `undefined` (cargando) durante 900 ms tras cada cambio de ruta. */
const useFakeQuery = (path: readonly string[]) => {
  const key = path.join(".");
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setReady(key), 900);
    return () => clearTimeout(timer);
  }, [key]);
  return ready === key;
};

const Controlled = () => {
  // El «URL» vive en un estado del consumidor (con React Router sería `useSearchParams`).
  const [url, setUrl] = useState<readonly string[]>([]);
  const drill = useDrillDown<Row>({ levels, path: url, onPathChange: setUrl });
  const loaded = useFakeQuery(drill.path);
  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
      >
        <code>?path={drill.path.join(".") || "(raíz)"}</code>
        <button disabled={!drill.canDrillUp} onClick={() => drill.drillUp()}>
          ← Subir
        </button>
        <button disabled={!drill.canDrillUp} onClick={() => drill.reset()}>
          Raíz
        </button>
        <button onClick={() => drill.drillTo(["ES"])}>Saltar a España</button>
        <span>
          estado: <b>{drill.status}</b>
          {!loaded && " · cargando datos…"}
        </span>
      </div>
      <ChoroplethMap<Row>
        {...common}
        drill={drill}
        // Sin `keepPreviousData` ENTRE niveles: `undefined` le dice al mapa «cargando» y mantiene el
        // nivel anterior (con SUS datos) en vez de pintar datos nuevos sobre la geometría vieja.
        data={(ctx) => (loaded ? select(ctx) : undefined)}
      />
    </div>
  );
};

// ── Errors ────────────────────────────────────────────────────────────────────────────────────────

const failing = defineDrillLevels<Row>([
  {
    id: "country",
    geography: world110m,
    objectName: "countries",
    filterFeatures: (f) => f.id !== "AQ",
  },
  {
    id: "region",
    // España: falla la carga. Francia: llega vacío. El resto: la geometría del mundo.
    geography: ({ parentId }) => {
      if (parentId === "ES") return Promise.reject(new Error("network error (simulated)"));
      if (parentId === "FR")
        return Promise.resolve({ type: "FeatureCollection", features: [] } as never);
      return Promise.resolve(world110m);
    },
    objectName: "countries",
    geographyKey: ({ parentId }) => `region:${parentId}`,
  },
]);

const Errors = () => {
  const [lines, setLines] = useState<string[]>([]);
  return (
    <div style={{ maxWidth: 1100, font: "13px sans-serif" }}>
      <p style={{ margin: "0 0 8px" }}>
        Pulsa <b>España</b> (la carga falla) o <b>Francia</b> (0 regiones): el mapa se queda donde
        estaba y<code> onDrillError </code> lo cuenta. Cualquier otro país carga bien.
      </p>
      <ChoroplethMap<Row>
        {...common}
        drill={failing}
        data={(ctx) => (ctx.depth === 0 ? countries : [])}
        onDrillError={({ error, ctx }) =>
          setLines((prev) => [
            ...prev.slice(-4),
            `[${ctx.path.join(" › ")}] ${error instanceof Error ? error.message : String(error)}`,
          ])
        }
      />
      <Log lines={lines} />
    </div>
  );
};

const meta = {
  title: "DrillDown/Engine",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Mundo → país → tiendas, no controlado. Solo los 12 países con tiendas tienen cursor `zoom-in`. Al pulsar: el
 * resto se atenúa, la cámara VUELA al país y las tiendas aparecen en abanico desde el centro. Los demás países
 * quedan en gris (contexto) y los 12 con tiendas son pulsables (navegación lateral). Subir vuelve a la cámara
 * de antes de bajar.
 */
export const UncontrolledStory: Story = { name: "Uncontrolled", render: () => <Uncontrolled /> };

/** Ruta en el «URL», `useDrillDown` controlado y latencia artificial: mientras llegan los datos se mantiene el nivel anterior. */
export const ControlledUrl: Story = { render: () => <Controlled /> };

/** Una geometría que falla y un nivel vacío: vuelta al nivel anterior y `onDrillError`. */
export const ErrorsStory: Story = { name: "Errors", render: () => <Errors /> };
