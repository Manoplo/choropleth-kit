// Phase A (v0.2): what zoom and drill-down need to be right. Each story is the visual proof of a
// diary step (17-22). Deterministic SYNTHETIC data.
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

/** Step 17. Click selects (click again, deselects); the rest dims without touching the regions. */
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
        legend={{ title: "Synthetic value" }}
      />
    </div>
  ),
};

/** Step 18. UI texts are a prop: English by default, `es` exported, or your own. */
export const Labels: StoryObj<{ language: "en" | "es" | "custom" }> = {
  args: { language: "es" },
  argTypes: { language: { control: "inline-radio", options: ["en", "es", "custom"] } },
  render: ({ language }) => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        // No data for half of the countries: hover over a gray one.
        data={worldData.filter((_, i) => i % 2 === 0)}
        labels={language === "es" ? es : language === "custom" ? { noData: "—" } : undefined}
      />
    </div>
  ),
};

/** Step 19. No holes: Kosovo (XK) has data; Northern Cyprus and Somaliland are gray. */
export const NoHoles: Story = {
  render: () => (
    <div style={{ maxWidth: 1100 }}>
      <ChoroplethMap
        {...common}
        data={[{ id: "XK", value: 90 }, ...worldData.filter((r) => r.id !== "XK")]}
        // Without Antarctica the world fits better and looks bigger.
        filterFeatures={(f) => f.id !== "AQ"}
        aspectRatio="auto"
      />
    </div>
  ),
};

/** Step 19. `aspectRatio="auto"`: the container adapts to the country's shape. */
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

/** Step 19. Strokes do not thicken (seen with zoom in step 25; today, with the browser's zoom). */
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
 * Step 20. BEFORE (red): `geoPath.centroid`, which counts Guiana, Hawaii, Svalbard or the Canary Islands.
 * AFTER (blue): `polylabel` of the main body, which is where the bubble is now anchored.
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
          <span style={{ color: "#ef4444" }}>●</span> centroid (before) ·{" "}
          <span style={{ color: "#2563eb" }}>●</span> anchor on the main body (now). Look at France,
          the US, Norway and the Netherlands.
        </p>
      </div>
    );
  },
};

/** Step 20, in real use: the bubbles of a map with distant territories. */
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

/** Step 21. On-demand geography (`() => import(...)`) with a skeleton, and data that arrives later. */
export const AsyncLoading: StoryObj<{ geographyDelayMs: number; dataDelayMs: number }> = {
  args: { geographyDelayMs: 1500, dataDelayMs: 1500 },
  argTypes: {
    geographyDelayMs: { control: { type: "range", min: 0, max: 5000, step: 250 } },
    dataDelayMs: { control: { type: "range", min: 0, max: 5000, step: 250 } },
  },
  // `key`: changing a control remounts the map and repeats the load.
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

  // STABLE function (useMemo): the identity cache avoids repeating the load on every render.
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
        0 – {geographyDelayMs} ms: skeleton · then: gray map that "breathes" (data on its way) · at{" "}
        {geographyDelayMs + dataDelayMs} ms: data.
      </p>
    </div>
  );
};

/** Step 21. If the geometry fails a message is shown (and `onGeographyError`), not an empty map. */
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

/** Step 22. Andorra, Monaco, San Marino, Singapore, Malta… do not exist at 1:110m: they show up as dots. */
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
