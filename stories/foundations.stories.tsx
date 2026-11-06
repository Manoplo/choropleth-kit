// Fase A (v0.2): lo que el zoom y el drill-down necesitan que esté bien. Cada story es la prueba
// visual de un paso del diario (17-22). Datos SINTÉTICOS deterministas.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { geoPath } from "d3-geo";
import { useEffect, useMemo, useState } from "react";
import {
  createProjection,
  es,
  getAnchorPoint,
  getFocusGeometry,
  toFeatureCollection,
} from "../src/core";
import { world110m, worldFallbackPoints } from "../src/geo";
import { ChoroplethMap } from "../src/react";
import { seed } from "./seed";

type Row = { id: string; value: number | null };

const worldFeatures = toFeatureCollection({ geography: world110m, objectName: "countries" });
const ids = worldFeatures.features.flatMap((f) => (f.id === undefined ? [] : [String(f.id)]));
const rowFor = (id: string): Row => ({ id, value: Math.round(((seed(id) * 9301) % 1000) / 10) });
const worldData: Row[] = ids.map(rowFor);

const meta = {
  title: "Foundations (fase A)",
  parameters: { layout: "padded" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const common = {
  geography: world110m,
  objectName: "countries",
  getId: (r: Row) => r.id,
  getValue: (r: Row) => r.value,
  variant: "sequential",
} as const;

/** Paso 17. Clic selecciona (clic otra vez, quita); el resto se atenúa sin tocar las regiones. */
export const SelectionAndDim: StoryObj<{
  dimOthers: "never" | "selection" | "hover-and-selection";
}> = {
  args: { dimOthers: "hover-and-selection" },
  argTypes: {
    dimOthers: { control: "inline-radio", options: ["never", "selection", "hover-and-selection"] },
  },
  render: ({ dimOthers }) => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        data={worldData}
        defaultSelectedId="ES"
        dimOthers={dimOthers}
        legend={{ title: "Valor sintético" }}
      />
    </div>
  ),
};

/** Paso 18. Los textos de UI son un prop: inglés por defecto, `es` exportado, o los tuyos. */
export const Labels: StoryObj<{ language: "en" | "es" | "custom" }> = {
  args: { language: "es" },
  argTypes: { language: { control: "inline-radio", options: ["en", "es", "custom"] } },
  render: ({ language }) => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        // Sin dato en la mitad de los países: pasa el cursor por uno gris.
        data={worldData.filter((_, i) => i % 2 === 0)}
        labels={language === "es" ? es : language === "custom" ? { noData: "—" } : undefined}
      />
    </div>
  ),
};

/** Paso 19. Sin agujeros: Kosovo (XK) tiene dato; Chipre del Norte y Somalilandia, en gris. */
export const NoHoles: Story = {
  render: () => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        data={[{ id: "XK", value: 90 }, ...worldData.filter((r) => r.id !== "XK")]}
        // Sin la Antártida el mundo cabe mejor y se ve más grande.
        filterFeatures={(f) => f.id !== "AQ"}
        aspectRatio="auto"
      />
    </div>
  ),
};

/** Paso 19. `aspectRatio="auto"`: el contenedor se adapta a la forma del país. */
export const AutoAspectRatio: StoryObj<{ country: string }> = {
  args: { country: "CL" },
  argTypes: { country: { control: "select", options: ["CL", "NO", "IT", "JP", "ES", "FR"] } },
  render: ({ country }) => (
    <div style={{ maxWidth: 520, border: "1px dashed #aaa" }}>
      <ChoroplethMap
        {...common}
        data={worldData}
        projection="mercator"
        filterFeatures={(f) => f.id === country}
        aspectRatio="auto"
        legend={false}
      />
    </div>
  ),
};

/** Paso 19. Los trazos no engordan (se ve con zoom en el paso 25; hoy, con el zoom del navegador). */
export const AntarcticaFilteredBorders: Story = {
  render: () => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        data={worldData}
        filterFeatures={(f) => f.id !== "AQ" && f.id !== "GL"}
        aspectRatio="auto"
      />
    </div>
  ),
};

const ANCHOR_COUNTRIES = ["FR", "US", "RU", "NO", "NL", "ES", "PT"];

/**
 * Paso 20. ANTES (rojo): `geoPath.centroid`, que cuenta Guayana, Hawái, Svalbard o Canarias.
 * DESPUÉS (azul): `polylabel` del cuerpo principal, que es donde ahora se ancla la burbuja.
 */
export const AnchorsBeforeAfter: Story = {
  render: () => {
    const width = 1100;
    const height = 560;
    const countries = {
      ...worldFeatures,
      features: worldFeatures.features.filter((f) => ANCHOR_COUNTRIES.includes(String(f.id))),
    };
    const projection = createProjection({
      name: "naturalEarth",
      width,
      height,
      featureCollection: worldFeatures,
    });
    const path = geoPath(projection);
    const project = (c: readonly [number, number]) => {
      const at = projection([...c]);
      return at === null ? null : ([at[0], at[1]] as const);
    };
    return (
      <div style={{ maxWidth: width, font: "13px sans-serif" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
          {worldFeatures.features.map((f, i) => (
            <path
              key={i}
              d={path(f) ?? ""}
              fill={ANCHOR_COUNTRIES.includes(String(f.id)) ? "#cbd5e1" : "#f1f5f9"}
              stroke="#fff"
              strokeWidth={0.5}
            />
          ))}
          {countries.features.map((f) => {
            const [cx, cy] = path.centroid(f);
            const anchor = getAnchorPoint({
              geometry: getFocusGeometry({ feature: f, path }),
              project,
            });
            return (
              <g key={String(f.id)}>
                <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="#fff" />
                {anchor !== null && (
                  <circle cx={anchor[0]} cy={anchor[1]} r={6} fill="#2563eb" stroke="#fff" />
                )}
              </g>
            );
          })}
        </svg>
        <p>
          <span style={{ color: "#ef4444" }}>●</span> centroide (antes) ·{" "}
          <span style={{ color: "#2563eb" }}>●</span> ancla en el cuerpo principal (ahora). Mira
          Francia, EE. UU., Noruega y los Países Bajos.
        </p>
      </div>
    );
  },
};

/** Paso 20, en uso real: las burbujas de un mapa con territorios lejanos. */
export const BubblesOnProblemCountries: Story = {
  render: () => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        variant="bubble"
        data={ANCHOR_COUNTRIES.map((id) => ({ id, value: 100 + (seed(id) % 400) }))}
        filterFeatures={(f) => f.id !== "AQ"}
        aspectRatio="auto"
        maxRadius={22}
      />
    </div>
  ),
};

/** Paso 21. Geografía bajo demanda (`() => import(...)`) con esqueleto, y datos que llegan después. */
export const AsyncLoading: StoryObj<{ geographyDelayMs: number; dataDelayMs: number }> = {
  args: { geographyDelayMs: 1500, dataDelayMs: 1500 },
  argTypes: {
    geographyDelayMs: { control: { type: "range", min: 0, max: 5000, step: 250 } },
    dataDelayMs: { control: { type: "range", min: 0, max: 5000, step: 250 } },
  },
  // `key`: cambiar un control remonta el mapa y repite la carga.
  render: (args) => <AsyncDemo key={`${args.geographyDelayMs}-${args.dataDelayMs}`} {...args} />,
};

const AsyncDemo = ({
  geographyDelayMs,
  dataDelayMs,
}: {
  geographyDelayMs: number;
  dataDelayMs: number;
}) => {
  const [data, setData] = useState<Row[] | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => setData(worldData), geographyDelayMs + dataDelayMs);
    return () => clearTimeout(timer);
  }, [geographyDelayMs, dataDelayMs]);

  // Función ESTABLE (useMemo): la caché por identidad evita repetir la carga en cada render.
  const load = useMemo(
    () => () =>
      new Promise<typeof world110m>((resolve) =>
        setTimeout(() => resolve(world110m), geographyDelayMs),
      ),
    [geographyDelayMs],
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap {...common} geography={load} data={data} aspectRatio="auto" />
      <p style={{ font: "13px sans-serif" }}>
        0 – {geographyDelayMs} ms: esqueleto · luego: mapa en gris que «respira» (datos en camino) ·
        a los {geographyDelayMs + dataDelayMs} ms: datos.
      </p>
    </div>
  );
};

/** Paso 21. Si la geometría falla se ve un mensaje (y `onGeographyError`), no un mapa vacío. */
export const GeographyError: Story = {
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <ChoroplethMap
        {...common}
        geography={() => Promise.reject(new Error("404"))}
        data={worldData}
        onGeographyError={() => {}}
      />
    </div>
  ),
};

/** Paso 22. Andorra, Mónaco, San Marino, Singapur, Malta… no existen a 1:110m: salen como puntos. */
export const Microstates: Story = {
  render: () => {
    const microstates = ["AD", "MC", "SM", "LI", "MT", "SG", "MV", "BH", "HK"];
    return (
      <div style={{ maxWidth: 1100 }}>
        <ChoroplethMap
          {...common}
          data={[...worldData, ...microstates.map(rowFor)]}
          fallbackPoints={worldFallbackPoints}
          filterFeatures={(f) => f.id !== "AQ"}
          aspectRatio="auto"
          onItemClick={(item) => console.log(item.kind, item.id)}
        />
      </div>
    );
  },
};
